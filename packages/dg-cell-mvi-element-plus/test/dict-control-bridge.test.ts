import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commands,
  createCrudStore,
  projectDictControl,
  type DictProvider,
  type DictLoadIntent,
} from 'dg-cell-mvi-crud';
import { createApp } from 'vue';
import { UI_ADAPTER_KEY } from 'dg-cell-mvi-vue';
import DgComponentRender from '../src/components/DgComponentRender';
import { createElementPlusDictControlBridge } from '../src/support/dictControlBridge';
import { elementUiRegistry } from '../src/support/elementUiRegistry';

afterEach(() => {
  vi.useRealTimers();
});

function formDict(store: ReturnType<typeof createCrudStore>, key: string) {
  return store.viewModel().form.columns.find((column) => column.key === key)!.dict!;
}

function renderedSelectOptionProps(input: {
  modelValue: unknown;
  options: any[];
  selectedOptions: any[];
}): Array<Record<string, any>> {
  const app = createApp({ render: () => null });
  app.provide(UI_ADAPTER_KEY, elementUiRegistry);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const render = app.runWithContext(() =>
      (DgComponentRender as any).setup(
        {
          name: 'el-select',
          component: undefined,
          modelValue: input.modelValue,
          options: input.options,
          selectedOptions: input.selectedOptions,
          props: {},
        },
        { emit: vi.fn(), attrs: {} },
      ),
    );
    const vnode = render();
    const children =
      typeof vnode.children?.default === 'function'
        ? vnode.children.default()
        : vnode.children;
    return (children ?? []).map((child: any) => child.props);
  } finally {
    warn.mockRestore();
  }
}

describe('Element Plus dictionary control bridge', () => {
  it('debounces remote terms and only dispatches the latest search command', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const bridge = createElementPlusDictControlBridge({
      dispatch,
      debounceMs: 120,
    });
    const control = projectDictControl(undefined, {
      dictId: 'country',
      providerId: 'catalog.country',
      scope: 'form:shipping',
      context: { region: 'eu' },
    });

    bridge.remoteSearch(control, 't');
    bridge.remoteSearch(control, 'tu');
    bridge.remoteSearch(control, 'tur');
    expect(dispatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(119);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'crud.searchDict',
      payload: { query: 'tur' },
    });

    bridge.dispose();
  });

  it('closes dependency change through provider and projects the new context options', async () => {
    const load = vi.fn(async (intent: DictLoadIntent) => [
      {
        value: String(intent.context.countryId),
        label: `Cities for ${String(intent.context.countryId)}`,
      },
    ]);
    const store = createCrudStore({
      crudOptions: {
        columns: {
          countryId: { title: 'Country' },
          cityId: {
            title: 'City',
            type: 'select',
            dict: {
              providerId: 'catalog.city',
              binding: {
                scope: 'form:city',
                dependencies: ['countryId'],
                triggers: ['open', 'context-change'],
              },
            },
          },
        },
      },
      dictProviders: { 'catalog.city': { load } },
    });
    const bridge = createElementPlusDictControlBridge({ dispatch: store.dispatch });
    store.dispatch(
      commands.formOpened({
        mode: 'edit',
        row: null,
        initialForm: { countryId: 'tr', cityId: undefined },
        index: null,
      }),
    );

    const firstControl = formDict(store, 'cityId');
    bridge.elementProps(firstControl).onVisibleChange(true);
    await vi.waitFor(() => {
      expect(formDict(store, 'cityId').options).toEqual([
        { value: 'tr', label: 'Cities for tr' },
      ]);
    });

    store.dispatch(commands.setFormField('countryId', 'de'));
    const changedControl = formDict(store, 'cityId');
    expect(changedControl.context).toEqual({ countryId: 'de' });
    bridge.dependenciesChanged(changedControl);

    await vi.waitFor(() => {
      expect(formDict(store, 'cityId')).toMatchObject({
        loading: false,
        options: [{ value: 'de', label: 'Cities for de' }],
      });
    });
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'load',
        refresh: true,
        context: { countryId: 'de' },
      }),
    );
    expect(bridge.elementProps(formDict(store, 'cityId')).loading).toBe(false);

    bridge.dispose();
    store.dispose();
  });

  it('hydrates an unknown selected value into the select label surface without expanding visible options', async () => {
    const loadByValues = vi.fn(async (intent: DictLoadIntent) =>
      (intent.values ?? []).map((value) => ({
        value,
        label: value === 'u42' ? 'Ada Lovelace' : String(value),
      })),
    );
    const provider: DictProvider = {
      load: vi.fn(async () => []),
      loadByValues,
    };
    const store = createCrudStore({
      crudOptions: {
        columns: {
          assigneeId: {
            title: 'Assignee',
            type: 'select',
            dict: {
              providerId: 'directory.users',
              binding: {
                scope: 'form:assignee',
                triggers: ['value-missing'],
              },
            },
          },
        },
      },
      dictProviders: { 'directory.users': provider },
    });
    const bridge = createElementPlusDictControlBridge({ dispatch: store.dispatch });
    store.dispatch(
      commands.formOpened({
        mode: 'edit',
        row: null,
        initialForm: { assigneeId: 'u42' },
        index: null,
      }),
    );

    bridge.valueChanged(formDict(store, 'assigneeId'), 'u42');
    await vi.waitFor(() => {
      expect(formDict(store, 'assigneeId').selectedOptions).toEqual([
        { value: 'u42', label: 'Ada Lovelace' },
      ]);
    });

    const column = store
      .viewModel()
      .form.columns.find((candidate) => candidate.key === 'assigneeId')!;
    expect(loadByValues).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'hydrate', values: ['u42'] }),
    );
    expect(column.dict!.visibleNodes).toEqual([]);
    expect(column.dict!.options).toEqual([]);
    expect(column.component.options).toEqual([]);
    expect(
      renderedSelectOptionProps({
        modelValue: 'u42',
        options: column.component.options,
        selectedOptions: column.dict!.selectedOptions,
      }),
    ).toContainEqual(
      expect.objectContaining({
        value: 'u42',
        label: 'Ada Lovelace',
        'data-dict-selected-only': 'true',
      }),
    );

    bridge.dispose();
    store.dispose();
  });

  it('debounces remote search through provider and projects loading plus completed options', async () => {
    vi.useFakeTimers();
    let resolveSearch!: (nodes: Array<{ value: string; label: string }>) => void;
    const load = vi.fn(
      () =>
        new Promise<Array<{ value: string; label: string }>>((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const store = createCrudStore({
      crudOptions: {
        columns: {
          customerId: {
            title: 'Customer',
            type: 'select',
            dict: {
              providerId: 'crm.customers',
              binding: {
                scope: 'form:customer',
                triggers: ['search'],
                searchDebounceMs: 120,
              },
            },
          },
        },
      },
      dictProviders: { 'crm.customers': { load } },
    });
    const bridge = createElementPlusDictControlBridge({ dispatch: store.dispatch });
    store.dispatch(
      commands.formOpened({
        mode: 'add',
        row: null,
        initialForm: { customerId: undefined },
        index: null,
      }),
    );

    const remoteProps = bridge.elementProps(formDict(store, 'customerId'));
    expect(remoteProps.remote).toBe(true);
    remoteProps.remoteMethod('a');
    remoteProps.remoteMethod('ad');
    remoteProps.remoteMethod('ada');
    await vi.advanceTimersByTimeAsync(119);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'search', query: 'ada' }),
    );
    expect(formDict(store, 'customerId').loading).toBe(true);
    expect(bridge.elementProps(formDict(store, 'customerId')).loading).toBe(true);

    resolveSearch([{ value: 'u42', label: 'Ada Lovelace' }]);
    await vi.waitFor(() => {
      expect(formDict(store, 'customerId')).toMatchObject({
        loading: false,
        options: [{ value: 'u42', label: 'Ada Lovelace' }],
      });
    });

    bridge.dispose();
    store.dispose();
  });

  it('closes open → command/effect/result and preserves prior options on a later failure', async () => {
    let shouldFail = false;
    const load = vi.fn(async () => {
      if (shouldFail) throw new Error('offline');
      return [{ value: 'tr', label: 'Türkiye' }];
    });
    const provider: DictProvider = { load };
    const store = createCrudStore({
      crudOptions: {
        columns: {
          country: {
            title: 'Country',
            type: 'select',
            dict: {
              providerId: 'catalog.country',
              binding: { scope: 'form:shipping', triggers: ['open'] },
            },
          },
        },
      },
      dictProviders: { 'catalog.country': provider },
    });
    const bridge = createElementPlusDictControlBridge({
      dispatch: store.dispatch,
    });
    const control = store.viewModel().form.columns[0].dict!;

    bridge.open(control);
    await vi.waitFor(() => {
      expect(store.viewModel().dict.country.status).toBe('loaded');
    });
    expect(store.viewModel().dict.country.options).toEqual([
      { value: 'tr', label: 'Türkiye' },
    ]);

    shouldFail = true;
    bridge.dependenciesChanged({
      ...store.viewModel().form.columns[0].dict!,
      context: { region: 'asia' },
    });
    await vi.waitFor(() => {
      expect(store.viewModel().dict.country.status).toBe('error');
    });
    expect(store.viewModel().dict.country).toMatchObject({
      error: 'offline',
      options: [{ value: 'tr', label: 'Türkiye' }],
    });

    bridge.dispose();
    store.dispose();
  });
});
