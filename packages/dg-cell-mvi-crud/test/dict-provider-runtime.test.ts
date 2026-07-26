import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { EffectHandler } from 'dg-cell-mvi-core';
import { describe, expect, it, vi } from 'vitest';

import {
  CRUD_EFFECT,
  CRUD_EVENT,
  LEGACY_URL_DICT_PROVIDER,
  buildNormalizedOptions,
  createDictEffects,
  createDictProviderRuntime,
  createDictRegistry,
  createCrudStore,
  loadDict as loadDictCommand,
  mapLegacyDictConfig,
  type CrudState,
  type DictLoadIntent,
  type DictProvider,
} from '../src/index';

function intent(
  overrides: Partial<DictLoadIntent> = {},
): DictLoadIntent {
  return {
    dictId: 'country',
    providerId: 'catalog.country',
    scope: 'edit:shipping',
    mode: 'load',
    context: { tenantId: 't-1', region: 'eu' },
    cache: { mode: 'none' },
    refresh: false,
    requestId: 'country:edit%3Ashipping:7',
    generation: 7,
    cacheKey: 'country-cache-key',
    ...overrides,
  };
}

async function runLoadEffect(
  handler: EffectHandler<CrudState>,
  loadIntent: DictLoadIntent,
) {
  return handler(
    {} as any,
    { type: CRUD_EFFECT.loadDict, payload: loadIntent },
  ) as Promise<any>;
}

describe('DictProviderRuntime effect boundary', () => {
  it('is injected at the CRUD store composition root without entering state', async () => {
    const load = vi.fn(async () => [
      { value: 'tr', label: 'Türkiye' },
    ]);
    const provider: DictProvider = { load };
    const store = createCrudStore({
      crudOptions: {
        columns: {
          country: {
            title: 'Country',
            dict: { providerId: 'catalog.country' },
          },
        },
      },
      dictProviders: { 'catalog.country': provider },
    });

    store.dispatch(loadDictCommand({ dictId: 'country' }));
    await vi.waitFor(() => {
      expect(store.viewModel().dict.country.status).toBe('loaded');
    });

    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        dictId: 'country',
        providerId: 'catalog.country',
        mode: 'load',
      }),
    );
    const containsReference = (
      value: unknown,
      target: unknown,
      seen = new Set<unknown>(),
    ): boolean => {
      if (value === target) return true;
      if (value === null || typeof value !== 'object' || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return Object.values(value).some((item) =>
        containsReference(item, target, seen),
      );
    };
    expect(containsReference(store.state(), provider)).toBe(false);
    store.dispose();
  });

  it('passes the complete intent unchanged and routes load/search to load', async () => {
    const load = vi.fn(async () => [{ value: 'tr', label: 'Türkiye' }]);
    const loadByValues = vi.fn(async () => []);
    const provider: DictProvider = { load, loadByValues };
    const runtime = createDictProviderRuntime({
      'catalog.country': provider,
    });
    const config = buildNormalizedOptions({
      columns: {
        country: {
          title: 'Country',
          dict: { providerId: 'catalog.country' },
        },
      },
    });
    const effects = createDictEffects({
      config,
      dicts: createDictRegistry(),
      providers: runtime,
    });

    const ordinary = intent();
    const search = intent({
      mode: 'search',
      query: 'tur',
      requestId: 'country:edit%3Ashipping:8',
      generation: 8,
      cacheKey: 'country-search-cache-key',
    });
    const ordinaryResult = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      ordinary,
    );
    const searchResult = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      search,
    );

    expect(load).toHaveBeenNthCalledWith(1, ordinary);
    expect(load).toHaveBeenNthCalledWith(2, search);
    expect(loadByValues).not.toHaveBeenCalled();
    expect(ordinaryResult).toEqual({
      type: CRUD_EVENT.dictLoaded,
      payload: {
        dictId: ordinary.dictId,
        scope: ordinary.scope,
        mode: ordinary.mode,
        requestId: ordinary.requestId,
        generation: ordinary.generation,
        cacheKey: ordinary.cacheKey,
        nodes: [{ value: 'tr', label: 'Türkiye' }],
      },
    });
    expect(searchResult.payload.mode).toBe('search');
  });

  it('routes hydrate exclusively to loadByValues with the complete intent', async () => {
    const load = vi.fn(async () => []);
    const loadByValues = vi.fn(async () => [
      { value: 'de', label: 'Germany' },
    ]);
    const runtime = createDictProviderRuntime({
      'catalog.country': { load, loadByValues },
    });
    const config = buildNormalizedOptions({
      columns: {
        country: {
          title: 'Country',
          dict: { providerId: 'catalog.country' },
        },
      },
    });
    const effects = createDictEffects({
      config,
      dicts: createDictRegistry(),
      providers: runtime,
    });
    const hydration = intent({
      mode: 'hydrate',
      values: ['de'],
      cacheKey: 'country-hydrate-cache-key',
    });

    const result = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      hydration,
    );

    expect(load).not.toHaveBeenCalled();
    expect(loadByValues).toHaveBeenCalledWith(hydration);
    expect(result.payload.nodes).toEqual([
      { value: 'de', label: 'Germany' },
    ]);
  });

  it('turns an unknown provider into correlated failed feedback', async () => {
    const runtime = createDictProviderRuntime({});
    const config = buildNormalizedOptions({
      columns: {
        country: {
          title: 'Country',
          dict: { providerId: 'catalog.missing' },
        },
      },
    });
    const effects = createDictEffects({
      config,
      dicts: createDictRegistry(),
      providers: runtime,
    });
    const missing = intent({ providerId: 'catalog.missing' });

    const result = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      missing,
    );

    expect(result).toEqual({
      type: CRUD_EVENT.dictLoadFailed,
      payload: {
        dictId: missing.dictId,
        scope: missing.scope,
        mode: missing.mode,
        requestId: missing.requestId,
        generation: missing.generation,
        cacheKey: missing.cacheKey,
        error: 'Dictionary provider "catalog.missing" is not registered.',
      },
    });
  });

  it('keeps legacy inline, fixed URL, and DictRegistry loaders behind compatibility adapters', async () => {
    const dictRequest = vi.fn(async ({ url }: { url: string }) => [
      { value: url, label: 'Remote' },
    ]);
    const getData = vi.fn(async (ctx: any) => [
      { value: ctx.region, label: 'Dynamic' },
    ]);
    const dicts = createDictRegistry({ dictRequest: dictRequest as any });
    const config = buildNormalizedOptions({
      dicts: {
        inline: { data: [{ value: 'static', label: 'Static' }] },
        fixed: mapLegacyDictConfig('fixed', { url: '/api/dicts/fixed' }),
        dynamic: { getData },
      },
      columns: {},
    });
    const effects = createDictEffects({
      config,
      dicts,
      providers: createDictProviderRuntime({}),
    });

    const inlineResult = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      intent({
        dictId: 'inline',
        providerId: 'legacy:inline',
        context: {},
      }),
    );
    const fixedResult = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      intent({
        dictId: 'fixed',
        providerId: LEGACY_URL_DICT_PROVIDER,
        context: {},
      }),
    );
    const dynamicIntent = intent({
      dictId: 'dynamic',
      providerId: 'legacy:dynamic',
      context: { region: 'asia' },
    });
    const dynamicResult = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      dynamicIntent,
    );

    expect(inlineResult.payload.nodes).toEqual([
      { value: 'static', label: 'Static' },
    ]);
    expect(dictRequest).toHaveBeenCalledWith({
      url: '/api/dicts/fixed',
      dict: expect.objectContaining({ url: '/api/dicts/fixed' }),
    });
    expect(fixedResult.payload.nodes).toEqual([
      { value: '/api/dicts/fixed', label: 'Remote' },
    ]);
    expect(getData).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'asia',
        scope: dynamicIntent.scope,
        requestId: dynamicIntent.requestId,
      }),
    );
    expect(dynamicResult.payload.nodes).toEqual([
      { value: 'asia', label: 'Dynamic' },
    ]);
  });

  it('prefers an explicitly registered provider over the legacy URL adapter', async () => {
    const dictRequest = vi.fn(async () => [
      { value: 'legacy', label: 'Legacy' },
    ]);
    const load = vi.fn(async () => [
      { value: 'provider', label: 'Provider' },
    ]);
    const config = buildNormalizedOptions({
      dicts: {
        country: mapLegacyDictConfig('country', {
          url: '/api/dicts/country',
        }),
      },
      columns: {},
    });
    const effects = createDictEffects({
      config,
      dicts: createDictRegistry({ dictRequest }),
      providers: createDictProviderRuntime({
        [LEGACY_URL_DICT_PROVIDER]: { load },
      }),
    });
    const loadIntent = intent({ providerId: LEGACY_URL_DICT_PROVIDER });

    const result = await runLoadEffect(
      effects[CRUD_EFFECT.loadDict],
      loadIntent,
    );

    expect(load).toHaveBeenCalledWith(loadIntent);
    expect(dictRequest).not.toHaveBeenCalled();
    expect(result.payload.nodes[0].value).toBe('provider');
  });
});

describe('HTTP client import boundary', () => {
  it('keeps concrete HTTP clients out of reducers, view-models, and Element Plus adapters', () => {
    const packageRoot = fileURLToPath(new URL('..', import.meta.url));
    const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
    const directories = [
      `${packageRoot}/src/logic/reducers`,
      `${packageRoot}/src/logic/projectors`,
      `${workspaceRoot}/packages/dg-cell-mvi-element-plus/src`,
    ];
    const concreteHttpImport =
      /(?:from\s+|import\s*\()\s*['"](?:axios|ky|ofetch|undici|node:https?|https?)(?:\/[^'"]*)?['"]/;
    const files: string[] = [];
    const collectSourceFiles = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = `${directory}/${entry}`;
        if (statSync(path).isDirectory()) {
          collectSourceFiles(path);
        } else if (/\.(?:ts|tsx|vue)$/.test(entry)) {
          files.push(path);
        }
      }
    };
    for (const directory of directories) collectSourceFiles(directory);

    for (const absolutePath of files) {
      expect(
        readFileSync(absolutePath, 'utf8'),
        absolutePath,
      ).not.toMatch(concreteHttpImport);
    }
  });
});
