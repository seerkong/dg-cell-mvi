import { describe, expect, it, vi } from 'vitest';

import {
  CRUD_EVENT,
  createCrudStore,
  createDictProviderRuntime,
  invalidateDict,
  loadDict,
  type DictCachePolicy,
  type DictLoadIntent,
  type DictNode,
  type DictProvider,
} from '../src/index';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createDeferredProvider() {
  const requests: Array<{
    intent: DictLoadIntent;
    result: Deferred<readonly DictNode[]>;
  }> = [];
  const load = vi.fn((loadIntent: DictLoadIntent) => {
    const result = deferred<readonly DictNode[]>();
    requests.push({ intent: loadIntent, result });
    return result.promise;
  });
  return {
    provider: { load } satisfies DictProvider,
    load,
    requests,
  };
}

function intent(
  cache: DictCachePolicy,
  overrides: Partial<DictLoadIntent> = {},
): DictLoadIntent {
  return {
    dictId: 'country',
    providerId: 'catalog.country',
    scope: 'form:a',
    mode: 'load',
    context: { tenantId: 't-1' },
    cache,
    refresh: false,
    requestId: 'country:form%3Aa:1',
    generation: 1,
    cacheKey: 'country-form-a-load',
    ...overrides,
  };
}

describe('DictProviderRuntime cache and request coordination', () => {
  it('uses a controlled clock for cache hits and TTL expiry', async () => {
    let now = 1_000;
    let sequence = 0;
    const load = vi.fn(async () => [
      { value: ++sequence, label: `result-${sequence}` },
    ]);
    const runtime = createDictProviderRuntime(
      { 'catalog.country': { load } },
      { now: () => now },
    );
    const cached = intent({ mode: 'scope', ttlMs: 100 });

    expect(await runtime.load(cached)).toEqual([
      { value: 1, label: 'result-1' },
    ]);
    now = 1_099;
    expect(
      await runtime.load({
        ...cached,
        requestId: 'country:form%3Aa:2',
        generation: 2,
      }),
    ).toEqual([{ value: 1, label: 'result-1' }]);
    now = 1_100;
    expect(
      await runtime.load({
        ...cached,
        requestId: 'country:form%3Aa:3',
        generation: 3,
      }),
    ).toEqual([{ value: 2, label: 'result-2' }]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache mode none, while still deduplicating concurrent ordinary loads', async () => {
    const controlled = createDeferredProvider();
    const runtime = createDictProviderRuntime({
      'catalog.country': controlled.provider,
    });
    const uncached = intent({ mode: 'none' });

    const first = runtime.load(uncached);
    const concurrent = runtime.load({
      ...uncached,
      requestId: 'country:form%3Aa:2',
      generation: 2,
    });

    expect(controlled.load).toHaveBeenCalledTimes(1);
    controlled.requests[0].result.resolve([
      { value: 'tr', label: 'Türkiye' },
    ]);
    await expect(first).resolves.toEqual([{ value: 'tr', label: 'Türkiye' }]);
    await expect(concurrent).resolves.toEqual([
      { value: 'tr', label: 'Türkiye' },
    ]);

    const later = runtime.load({
      ...uncached,
      requestId: 'country:form%3Aa:3',
      generation: 3,
    });
    expect(controlled.load).toHaveBeenCalledTimes(2);
    controlled.requests[1].result.resolve([
      { value: 'de', label: 'Germany' },
    ]);
    await expect(later).resolves.toEqual([{ value: 'de', label: 'Germany' }]);
  });

  it('keeps scope caches isolated and shares an explicitly shared cache across scopes', async () => {
    async function providerCalls(
      cache: DictCachePolicy,
      secondContext = { tenantId: 't-1' },
    ): Promise<number> {
      const load = vi.fn(async (loadIntent: DictLoadIntent) => [
        { value: loadIntent.scope, label: loadIntent.scope },
      ]);
      const store = createCrudStore({
        crudOptions: {
          columns: {
            country: {
              title: 'Country',
              dict: { providerId: 'catalog.country', cache },
            },
          },
        },
        dictProviders: { 'catalog.country': { load } },
      });

      store.dispatch(
        loadDict({
          dictId: 'country',
          scope: 'form:a',
          context: { tenantId: 't-1' },
        }),
      );
      await vi.waitFor(() => {
        expect(store.state().dict.country?.status).toBe('loaded');
      });
      store.dispatch(
        loadDict({
          dictId: 'country',
          scope: 'form:b',
          context: secondContext,
        }),
      );
      await vi.waitFor(() => {
        expect(store.state().dict.country?.scope).toBe('form:b');
        expect(store.state().dict.country?.status).toBe('loaded');
      });
      store.dispose();
      return load.mock.calls.length;
    }

    await expect(providerCalls({ mode: 'scope' })).resolves.toBe(2);
    await expect(providerCalls({ mode: 'shared' })).resolves.toBe(1);
    await expect(
      providerCalls({ mode: 'shared' }, { tenantId: 't-2' }),
    ).resolves.toBe(2);
  });

  it('forces refresh past cache and replaces the cached value on success', async () => {
    let sequence = 0;
    const load = vi.fn(async () => [
      { value: ++sequence, label: `result-${sequence}` },
    ]);
    const runtime = createDictProviderRuntime({
      'catalog.country': { load },
    });
    const cached = intent({ mode: 'scope' });

    await expect(runtime.load(cached)).resolves.toEqual([
      { value: 1, label: 'result-1' },
    ]);
    await expect(
      runtime.load({
        ...cached,
        refresh: true,
        requestId: 'country:form%3Aa:2',
        generation: 2,
      }),
    ).resolves.toEqual([{ value: 2, label: 'result-2' }]);
    await expect(
      runtime.load({
        ...cached,
        requestId: 'country:form%3Aa:3',
        generation: 3,
      }),
    ).resolves.toEqual([{ value: 2, label: 'result-2' }]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not let a refresh failure share an older ordinary request and recovers on the next load', async () => {
    const controlled = createDeferredProvider();
    const runtime = createDictProviderRuntime({
      'catalog.country': controlled.provider,
    });
    const cached = intent({ mode: 'scope' });

    const oldOrdinary = runtime.load(cached);
    const refresh = runtime.load({
      ...cached,
      refresh: true,
      requestId: 'country:form%3Aa:2',
      generation: 2,
    });
    expect(controlled.load).toHaveBeenCalledTimes(2);

    controlled.requests[1].result.reject(new Error('refresh failed'));
    await expect(refresh).rejects.toThrow('refresh failed');

    const recovery = runtime.load({
      ...cached,
      requestId: 'country:form%3Aa:3',
      generation: 3,
    });
    expect(controlled.load).toHaveBeenCalledTimes(3);
    controlled.requests[2].result.resolve([
      { value: 'fresh', label: 'Fresh' },
    ]);
    await expect(recovery).resolves.toEqual([
      { value: 'fresh', label: 'Fresh' },
    ]);

    controlled.requests[0].result.resolve([
      { value: 'late', label: 'Late old result' },
    ]);
    await expect(oldOrdinary).resolves.toEqual([
      { value: 'late', label: 'Late old result' },
    ]);
    await expect(
      runtime.load({
        ...cached,
        requestId: 'country:form%3Aa:4',
        generation: 4,
      }),
    ).resolves.toEqual([{ value: 'fresh', label: 'Fresh' }]);
    expect(controlled.load).toHaveBeenCalledTimes(3);
  });

  it('invalidates cache and prevents a late in-flight result from repopulating it', async () => {
    const controlled = createDeferredProvider();
    const runtime = createDictProviderRuntime({
      'catalog.country': controlled.provider,
    });
    const cached = intent({ mode: 'scope' });

    const stale = runtime.load(cached);
    runtime.invalidate({
      dictId: cached.dictId,
      scope: cached.scope,
      cacheKey: cached.cacheKey,
    });
    const current = runtime.load({
      ...cached,
      requestId: 'country:form%3Aa:2',
      generation: 2,
    });
    expect(controlled.load).toHaveBeenCalledTimes(2);

    controlled.requests[1].result.resolve([
      { value: 'current', label: 'Current' },
    ]);
    await expect(current).resolves.toEqual([
      { value: 'current', label: 'Current' },
    ]);
    controlled.requests[0].result.resolve([
      { value: 'stale', label: 'Stale' },
    ]);
    await expect(stale).resolves.toEqual([{ value: 'stale', label: 'Stale' }]);

    await expect(
      runtime.load({
        ...cached,
        requestId: 'country:form%3Aa:3',
        generation: 3,
      }),
    ).resolves.toEqual([{ value: 'current', label: 'Current' }]);
    expect(controlled.load).toHaveBeenCalledTimes(2);
  });

  it('carries public invalidation through the store effect boundary without stale state or cache recovery', async () => {
    const controlled = createDeferredProvider();
    const currentNodes = [{ value: 'current', label: 'Current' }];
    const store = createCrudStore({
      crudOptions: {
        columns: {
          country: {
            title: 'Country',
            dict: {
              providerId: 'catalog.country',
              cache: { mode: 'scope' },
            },
          },
        },
      },
      dictProviders: { 'catalog.country': controlled.provider },
    });
    const loadCountry = (tenantId: string) =>
      loadDict({
        dictId: 'country',
        scope: 'form:a',
        context: { tenantId },
      });

    store.dispatch(loadCountry('t-1'));
    expect(controlled.load).toHaveBeenCalledTimes(1);

    store.dispatch(invalidateDict({ dictId: 'country', scope: 'form:a' }));
    store.dispatch(loadCountry('t-1'));
    expect(controlled.load).toHaveBeenCalledTimes(2);

    controlled.requests[1].result.resolve(currentNodes);
    await vi.waitFor(() => {
      expect(store.state().dict.country?.visibleNodes).toEqual(currentNodes);
      expect(store.state().dict.country?.status).toBe('loaded');
    });

    controlled.requests[0].result.resolve([
      { value: 'stale', label: 'Stale' },
    ]);
    await vi.waitFor(() => {
      expect(
        store.eventLog
          .entries()
          .filter((entry) => entry.value.type === CRUD_EVENT.dictLoaded),
      ).toHaveLength(2);
      expect(store.state().dict.country?.visibleNodes).toEqual(currentNodes);
    });

    store.dispatch(loadCountry('t-2'));
    expect(controlled.load).toHaveBeenCalledTimes(3);
    controlled.requests[2].result.resolve([
      { value: 'detour', label: 'Detour' },
    ]);
    await vi.waitFor(() => {
      expect(store.state().dict.country?.visibleNodes).toEqual([
        { value: 'detour', label: 'Detour' },
      ]);
    });

    store.dispatch(loadCountry('t-1'));
    await vi.waitFor(() => {
      expect(store.state().dict.country?.visibleNodes).toEqual(currentNodes);
      expect(store.state().dict.country?.status).toBe('loaded');
    });
    expect(controlled.load).toHaveBeenCalledTimes(3);
    store.dispose();
  });
});
