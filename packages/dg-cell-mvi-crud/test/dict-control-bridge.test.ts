import { describe, expect, it } from 'vitest';

import {
  CRUD_EVENT,
  createInitialCrudState,
  projectDictControl,
  resolveDictBindingContext,
  translateDictControlInteraction,
  type DictEntry,
} from '../src/index';

const loadedEntry: DictEntry = {
  status: 'loaded',
  visibleNodes: [{ code: 'tr', name: 'Türkiye' }],
  knownByValue: {
    tr: { code: 'tr', name: 'Türkiye' },
    de: { code: 'de', name: 'Germany' },
  },
  data: [{ code: 'tr', name: 'Türkiye' }],
  dataMap: {
    tr: { code: 'tr', name: 'Türkiye' },
    de: { code: 'de', name: 'Germany' },
  },
  error: null,
  scope: 'form:shipping',
  generation: 1,
  activeRequest: null,
};

describe('dictionary control projection', () => {
  it('projects options, known labels, compatibility aliases, and accessible state', () => {
    const projected = projectDictControl(loadedEntry, {
      dictId: 'country',
      valueField: 'code',
      labelField: 'name',
      selectedValue: 'de',
    });

    expect(projected).toMatchObject({
      dictId: 'country',
      status: 'loaded',
      loading: false,
      error: null,
      disabled: false,
      accessible: true,
      ariaBusy: false,
      ariaInvalid: false,
      options: [{ code: 'tr', name: 'Türkiye', value: 'tr', label: 'Türkiye' }],
      selectedOptions: [{ code: 'de', name: 'Germany', value: 'de', label: 'Germany' }],
    });
    expect(projected.options).not.toContainEqual(
      expect.objectContaining({ value: 'de' }),
    );
    expect(projected.visibleNodes).toBe(loadedEntry.visibleNodes);
    expect(projected.knownByValue).toBe(loadedEntry.knownByValue);
    expect(projected.data).toBe(projected.visibleNodes);
    expect(projected.dataMap).toBe(projected.knownByValue);
  });

  it('keeps successful options consumable while a refresh fails', () => {
    const projected = projectDictControl(
      { ...loadedEntry, status: 'error', error: 'offline' },
      { dictId: 'country', valueField: 'code', labelField: 'name' },
    );

    expect(projected.options).toEqual([
      { code: 'tr', name: 'Türkiye', value: 'tr', label: 'Türkiye' },
    ]);
    expect(projected.error).toBe('offline');
    expect(projected.ariaInvalid).toBe(true);
    expect(projected.disabled).toBe(false);
  });
});

describe('dictionary control command translation', () => {
  const descriptor = {
    dictId: 'country',
    providerId: 'catalog.country',
    scope: 'form:shipping',
    context: { region: 'eu' },
  };

  it('maps open, dependency change, missing values, search, and invalidate to CRUD commands', () => {
    expect(translateDictControlInteraction(descriptor, { type: 'open' })).toEqual([
      expect.objectContaining({ type: CRUD_EVENT.loadDict }),
    ]);
    expect(
      translateDictControlInteraction(
        { ...descriptor, context: { region: 'asia' } },
        { type: 'dependencies-changed' },
      ),
    ).toEqual([
      expect.objectContaining({ type: CRUD_EVENT.invalidateDict }),
      expect.objectContaining({
        type: CRUD_EVENT.refreshDict,
        payload: expect.objectContaining({ context: { region: 'asia' } }),
      }),
    ]);
    expect(
      translateDictControlInteraction(
        { ...descriptor, knownByValue: loadedEntry.knownByValue },
        { type: 'value-changed', value: ['tr', 'fr', 'fr', null] },
      ),
    ).toEqual([
      expect.objectContaining({
        type: CRUD_EVENT.hydrateDict,
        payload: expect.objectContaining({ values: ['fr'] }),
      }),
    ]);
    expect(
      translateDictControlInteraction(descriptor, {
        type: 'remote-search',
        query: 'tur',
      }),
    ).toEqual([
      expect.objectContaining({
        type: CRUD_EVENT.searchDict,
        payload: expect.objectContaining({ query: 'tur' }),
      }),
    ]);
    expect(
      translateDictControlInteraction(descriptor, { type: 'invalidate' }),
    ).toEqual([expect.objectContaining({ type: CRUD_EVENT.invalidateDict })]);
  });

  it('derives serializable context from existing form/search/list state', () => {
    const state = createInitialCrudState({
      mode: { name: 'local' },
      pageSize: 20,
      pageSizes: [20],
      searchInitialForm: {},
      searchShow: true,
      tabsActive: undefined,
      editable: {
        enabled: false,
        mode: 'row',
        exclusive: true,
        exclusiveEffect: 'cancel',
        activeDefault: false,
        readonly: false,
        activeTrigger: 'click',
      },
    });
    state.form.form = { region: 'eu', nested: { city: 'ankara' } };
    state.search.form = { active: true };
    state.list.page.currentPage = 3;

    expect(
      resolveDictBindingContext(
        {
          scope: 'form:shipping',
          dependencies: ['region'],
          params: {
            city: { from: 'form', path: 'nested.city' },
            active: { from: 'search', path: 'active' },
            page: { from: 'list', path: 'page.currentPage' },
            literal: 'stable',
          },
        },
        state,
      ),
    ).toEqual({
      region: 'eu',
      city: 'ankara',
      active: true,
      page: 3,
      literal: 'stable',
    });
  });
});
