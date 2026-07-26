import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  LEGACY_URL_DICT_PROVIDER,
  mapLegacyDictConfig,
  type DictBinding,
  type DictDefinition,
  type DictLoadIntent,
  type DictNode,
  type DictProvider,
  type DictRequestCorrelation,
} from '../src/index';

describe('serializable dictionary contract', () => {
  it('expresses fixed, provider, contextual, hydration, and search declarations', () => {
    const fixed = {
      id: 'enabled-status',
      source: {
        kind: 'inline',
        nodes: [
          { value: true, label: 'Enabled' },
          { value: false, label: 'Disabled' },
        ],
      },
      cache: { mode: 'none' },
    } satisfies DictDefinition;

    const contextualBinding = {
      scope: 'edit-form:address',
      dependencies: ['form.countryId'],
      params: {
        countryId: { from: 'form', path: 'countryId' },
        active: true,
      },
      triggers: ['open', 'context-change'],
    } satisfies DictBinding;

    const provider = {
      id: 'countries',
      source: {
        kind: 'provider',
        providerId: 'catalog.countries',
        config: { endpointName: 'countries' },
      },
      binding: contextualBinding,
      cache: { mode: 'shared', ttlMs: 60_000 },
    } satisfies DictDefinition;

    const hydrate = {
      dictId: provider.id,
      providerId: provider.source.providerId,
      scope: contextualBinding.scope,
      mode: 'hydrate',
      context: { countryId: 86 },
      values: ['bj', 'sh'],
      cache: provider.cache,
      refresh: false,
      requestId: 'countries:address:4',
      generation: 4,
      cacheKey: 'countries:address:hydrate:4',
    } satisfies DictLoadIntent;

    const search = {
      dictId: provider.id,
      providerId: provider.source.providerId,
      scope: contextualBinding.scope,
      mode: 'search',
      context: { countryId: 86 },
      query: 'sh',
      cache: provider.cache,
      refresh: false,
      requestId: 'countries:address:5',
      generation: 5,
      cacheKey: 'countries:address:search:5',
    } satisfies DictLoadIntent;

    expectTypeOf(fixed.source.nodes).toMatchTypeOf<readonly DictNode[]>();
    expectTypeOf(hydrate.mode).toEqualTypeOf<'hydrate'>();
    expectTypeOf(search.mode).toEqualTypeOf<'search'>();
    expectTypeOf<DictRequestCorrelation>().toEqualTypeOf<{
      dictId: string;
      scope: string;
      mode: 'load' | 'hydrate' | 'search';
      requestId: string;
      generation: number;
      cacheKey: string;
    }>();
  });

  it('keeps provider operations at the effect boundary', async () => {
    const provider: DictProvider = {
      async load(intent) {
        return [{ value: intent.query ?? 'all', label: 'Result' }];
      },
      async loadByValues(intent) {
        return (intent.values ?? []).map((value) => ({ value, label: String(value) }));
      },
    };

    await expect(
      provider.load({
        dictId: 'countries',
        providerId: 'catalog.countries',
        scope: 'list',
        mode: 'load',
        context: {},
        cache: { mode: 'none' },
        refresh: false,
        requestId: 'countries:list:1',
        generation: 1,
        cacheKey: 'countries:list:load:1',
      }),
    ).resolves.toEqual([{ value: 'all', label: 'Result' }]);
  });

  it('maps legacy data and URL declarations without copying callbacks into contract data', () => {
    const inline = mapLegacyDictConfig('status', {
      data: [{ code: 1, title: 'Enabled' }],
      value: 'code',
      label: 'title',
      cache: false,
    });
    const remote = mapLegacyDictConfig('countries', {
      url: '/api/dicts/countries',
      value: 'id',
      label: 'name',
    });

    expect(inline).toEqual({
      id: 'status',
      source: {
        kind: 'inline',
        nodes: [{ value: 1, label: 'Enabled', raw: { code: 1, title: 'Enabled' } }],
      },
      fields: { value: 'code', label: 'title', children: 'children' },
      cache: { mode: 'none' },
    });
    expect(remote).toEqual({
      id: 'countries',
      source: {
        kind: 'provider',
        providerId: LEGACY_URL_DICT_PROVIDER,
        config: { url: '/api/dicts/countries' },
      },
      fields: { value: 'id', label: 'name', children: 'children' },
      cache: { mode: 'shared' },
    });
    expect(JSON.stringify(remote)).toContain('/api/dicts/countries');
  });
});

const serializableDefinition: DictDefinition = {
  id: 'serializable-only',
  source: { kind: 'provider', providerId: 'catalog.items' },
};

// @ts-expect-error side-effect closures belong to DictProvider, not serializable reducer input.
serializableDefinition.source.load = async () => [];

if (false) {
  // @ts-expect-error legacy compatibility accepts a fixed URL, not a URL-producing closure.
  mapLegacyDictConfig('dynamic-url', { url: () => '/api/dicts/dynamic' });
}
