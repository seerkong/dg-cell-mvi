import { describe, expect, it } from 'vitest';

import {
  CRUD_EFFECT,
  buildNormalizedOptions,
  createInitialCrudState,
  dictLoadFailed,
  dictLoaded,
  hydrateDict,
  invalidateDict,
  loadDict,
  reduceDict,
  refreshDict,
  searchDict,
  type CrudState,
  type DictLoadIntent,
} from '../src/index';

const config = buildNormalizedOptions({
  columns: {
    country: {
      title: 'Country',
      dict: {
        value: 'code',
        label: 'name',
        data: [{ code: 'seed', name: 'Seed' }],
      },
    },
  },
});

function initialState(): CrudState {
  return createInitialCrudState(config.seed);
}

function intentFrom(result: ReturnType<typeof reduceDict>): DictLoadIntent {
  expect(result.effects).toHaveLength(1);
  expect(result.effects?.[0].type).toBe(CRUD_EFFECT.loadDict);
  return result.effects?.[0].payload as DictLoadIntent;
}

function succeed(
  state: CrudState,
  intent: DictLoadIntent,
  nodes: any[],
): CrudState {
  return reduceDict(
    state,
    dictLoaded({
      dictId: intent.dictId,
      scope: intent.scope,
      mode: intent.mode,
      requestId: intent.requestId,
      generation: intent.generation,
      cacheKey: intent.cacheKey,
      nodes,
    }),
    config,
  ).state;
}

describe('dictionary command/result reducer', () => {
  it('collapses an identical completed load without emitting another effect', () => {
    const firstCommand = loadDict({
      dictId: 'country',
      providerId: 'catalog.country',
      scope: 'edit:shipping',
      context: { region: 'eu', tenant: { id: 't-1' } },
    });
    const first = reduceDict(initialState(), firstCommand, config);
    const loaded = succeed(
      first.state,
      intentFrom(first),
      [{ code: 'tr', name: 'Türkiye' }],
    );

    const repeated = reduceDict(
      loaded,
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { tenant: { id: 't-1' }, region: 'eu' },
      }),
      config,
    );

    expect(repeated.state).toBe(loaded);
    expect(repeated.effects).toEqual([]);
  });

  it('derives a new cache key and effect when context, query, values, or provider changes', () => {
    const base = intentFrom(
      reduceDict(
        initialState(),
        loadDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'eu' },
        }),
        config,
      ),
    );
    const changedContext = intentFrom(
      reduceDict(
        initialState(),
        loadDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'asia' },
        }),
        config,
      ),
    );
    const changedProvider = intentFrom(
      reduceDict(
        initialState(),
        loadDict({
          dictId: 'country',
          providerId: 'catalog.country-v2',
          scope: 'edit:shipping',
          context: { region: 'eu' },
        }),
        config,
      ),
    );
    const firstQuery = intentFrom(
      reduceDict(
        initialState(),
        searchDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'eu' },
          query: 'tur',
        }),
        config,
      ),
    );
    const changedQuery = intentFrom(
      reduceDict(
        initialState(),
        searchDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'eu' },
          query: 'ger',
        }),
        config,
      ),
    );
    const firstValues = intentFrom(
      reduceDict(
        initialState(),
        hydrateDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'eu' },
          values: ['tr'],
        }),
        config,
      ),
    );
    const changedValues = intentFrom(
      reduceDict(
        initialState(),
        hydrateDict({
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'eu' },
          values: ['de'],
        }),
        config,
      ),
    );

    expect(changedContext.cacheKey).not.toBe(base.cacheKey);
    expect(changedProvider.cacheKey).not.toBe(base.cacheKey);
    expect(changedQuery.cacheKey).not.toBe(firstQuery.cacheKey);
    expect(changedValues.cacheKey).not.toBe(firstValues.cacheKey);
  });

  it('ignores a forged caller cache key when the complete request input changes', () => {
    const first = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { region: 'eu' },
      }),
      config,
    );
    const firstIntent = intentFrom(first);
    const loaded = succeed(
      first.state,
      firstIntent,
      [{ code: 'old', name: 'Old context' }],
    );

    const changed = reduceDict(
      loaded,
      loadDict(
        {
          dictId: 'country',
          providerId: 'catalog.country',
          scope: 'edit:shipping',
          context: { region: 'asia' },
          cacheKey: firstIntent.cacheKey,
        } as any,
      ),
      config,
    );
    const changedIntent = intentFrom(changed);

    expect(changedIntent.cacheKey).not.toBe(firstIntent.cacheKey);
    expect(changed.state).not.toBe(loaded);
    expect(changed.state.dict.country.status).toBe('loading');
  });

  it('keeps refresh as a complete force-refresh intent instead of degrading to load', () => {
    const first = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { tenantId: 't-1', region: 'eu' },
      }),
      config,
    );
    const firstIntent = intentFrom(first);
    const loaded = succeed(first.state, firstIntent, [{ code: 'tr', name: 'Türkiye' }]);

    const refreshed = reduceDict(
      loaded,
      refreshDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { tenantId: 't-1', region: 'eu' },
      }),
      config,
    );
    const refreshIntent = intentFrom(refreshed);

    expect(refreshIntent).toMatchObject({
      dictId: 'country',
      providerId: 'catalog.country',
      scope: 'edit:shipping',
      mode: 'load',
      context: { tenantId: 't-1', region: 'eu' },
      refresh: true,
    });
    expect(refreshIntent.generation).toBeGreaterThan(firstIntent.generation);
    expect(refreshIntent.requestId).not.toBe(firstIntent.requestId);
  });

  it('emits complete hydration and search intents with their values/query', () => {
    const hydrated = reduceDict(
      initialState(),
      hydrateDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { tenantId: 't-1' },
        values: ['tr', 'de'],
      }),
      config,
    );
    expect(intentFrom(hydrated)).toMatchObject({
      scope: 'edit:shipping',
      mode: 'hydrate',
      values: ['tr', 'de'],
      context: { tenantId: 't-1' },
      refresh: false,
    });

    const searched = reduceDict(
      hydrated.state,
      searchDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { tenantId: 't-1' },
        query: 'tur',
      }),
      config,
    );
    expect(intentFrom(searched)).toMatchObject({
      scope: 'edit:shipping',
      mode: 'search',
      query: 'tur',
      context: { tenantId: 't-1' },
      refresh: false,
    });
  });

  it('ignores an old generation and a result from a superseded scope', () => {
    const oldLoad = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { region: 'eu' },
      }),
      config,
    );
    const oldIntent = intentFrom(oldLoad);

    const currentLoad = reduceDict(
      oldLoad.state,
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:billing',
        context: { region: 'asia' },
      }),
      config,
    );
    const currentIntent = intentFrom(currentLoad);
    const beforeLateResult = currentLoad.state;

    const afterLateResult = succeed(
      beforeLateResult,
      oldIntent,
      [{ code: 'old', name: 'Old scope' }],
    );
    expect(afterLateResult).toBe(beforeLateResult);

    const afterCurrentResult = succeed(
      afterLateResult,
      currentIntent,
      [{ code: 'tr', name: 'Türkiye' }],
    );
    expect(afterCurrentResult.dict.country.visibleNodes).toEqual([
      { code: 'tr', name: 'Türkiye' },
    ]);
  });

  it('ignores an older generation even when both requests share one scope', () => {
    const first = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { region: 'eu' },
      }),
      config,
    );
    const firstIntent = intentFrom(first);
    const second = reduceDict(
      first.state,
      refreshDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { region: 'eu' },
      }),
      config,
    );
    const secondIntent = intentFrom(second);
    const beforeOldResult = second.state;

    expect(succeed(beforeOldResult, firstIntent, [{ code: 'old', name: 'Old' }]))
      .toBe(beforeOldResult);
    expect(
      succeed(beforeOldResult, secondIntent, [{ code: 'new', name: 'New' }])
        .dict.country.visibleNodes,
    ).toEqual([{ code: 'new', name: 'New' }]);
  });

  it('invalidates the active generation so its late result is a state-preserving no-op', () => {
    const loading = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: { region: 'eu' },
      }),
      config,
    );
    const intent = intentFrom(loading);
    const invalidated = reduceDict(
      loading.state,
      invalidateDict({ dictId: 'country', scope: 'edit:shipping' }),
      config,
    );

    expect(invalidated.effects?.[0].type).toBe(CRUD_EFFECT.invalidateDict);
    expect(invalidated.state.dict.country.activeRequest).toBeNull();
    const afterLateResult = succeed(
      invalidated.state,
      intent,
      [{ code: 'late', name: 'Late' }],
    );
    expect(afterLateResult).toBe(invalidated.state);
  });

  it('keeps hydrated nodes out of visibleNodes while projecting data/dataMap compatibly', () => {
    const visibleLoad = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: {},
      }),
      config,
    );
    const visible = [{ code: 'tr', name: 'Türkiye' }];
    const loaded = succeed(visibleLoad.state, intentFrom(visibleLoad), visible);

    const hydration = reduceDict(
      loaded,
      hydrateDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: {},
        values: ['de'],
      }),
      config,
    );
    const hydratedNode = { code: 'de', name: 'Germany' };
    const hydrated = succeed(hydration.state, intentFrom(hydration), [hydratedNode]);
    const entry = hydrated.dict.country;

    expect(entry.visibleNodes).toEqual(visible);
    expect(entry.knownByValue).toEqual({
      tr: visible[0],
      de: hydratedNode,
    });
    expect(entry.data).toBe(entry.visibleNodes);
    expect(entry.dataMap).toBe(entry.knownByValue);
  });

  it('accepts only the current correlated failure and preserves prior successful data', () => {
    const initialLoad = reduceDict(
      initialState(),
      loadDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: {},
      }),
      config,
    );
    const initialIntent = intentFrom(initialLoad);
    const loaded = succeed(
      initialLoad.state,
      initialIntent,
      [{ code: 'tr', name: 'Türkiye' }],
    );
    const refresh = reduceDict(
      loaded,
      refreshDict({
        dictId: 'country',
        providerId: 'catalog.country',
        scope: 'edit:shipping',
        context: {},
      }),
      config,
    );
    const refreshIntent = intentFrom(refresh);

    const staleFailure = reduceDict(
      refresh.state,
      dictLoadFailed({
        dictId: initialIntent.dictId,
        scope: initialIntent.scope,
        mode: initialIntent.mode,
        requestId: initialIntent.requestId,
        generation: initialIntent.generation,
        cacheKey: initialIntent.cacheKey,
        error: 'stale',
      }),
      config,
    );
    expect(staleFailure.state).toBe(refresh.state);

    const currentFailure = reduceDict(
      staleFailure.state,
      dictLoadFailed({
        dictId: refreshIntent.dictId,
        scope: refreshIntent.scope,
        mode: refreshIntent.mode,
        requestId: refreshIntent.requestId,
        generation: refreshIntent.generation,
        cacheKey: refreshIntent.cacheKey,
        error: 'offline',
      }),
      config,
    );
    expect(currentFailure.state.dict.country).toMatchObject({
      status: 'error',
      error: 'offline',
      visibleNodes: [{ code: 'tr', name: 'Türkiye' }],
    });
  });
});
