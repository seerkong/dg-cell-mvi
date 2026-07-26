/**
 * Element Plus selection-control bridge.
 *
 * Control callbacks only dispatch CRUD commands translated by the framework-agnostic CRUD module.
 * Debounce is injected/testable; no watcher or callback in this module can access a provider or URL.
 */
import {
  CRUD_EVENT,
  translateDictControlInteraction,
  type DictControlBinding,
  type DictControlDescriptor,
  type DictSerializableValue,
} from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';

export interface ElementPlusDictControlBridgeOptions {
  dispatch: (event: DictControlCommand) => void;
  debounceMs?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

type DictControlCommand = ReturnType<typeof translateDictControlInteraction>[number];

export interface ElementPlusDictControlBridge {
  open(control: DictControlDescriptor): void;
  dependenciesChanged(control: DictControlDescriptor): void;
  valueChanged(
    control: DictControlDescriptor,
    value: DictSerializableValue | DictSerializableValue[] | undefined,
  ): void;
  remoteSearch(control: DictControlDescriptor & { searchDebounceMs?: number }, query: string): void;
  invalidate(control: DictControlDescriptor): void;
  elementProps(
    control: DictControlBinding,
  ): Record<string, any>;
  dispose(): void;
}

export function createElementPlusDictControlBridge(
  options: ElementPlusDictControlBridgeOptions,
): ElementPlusDictControlBridge {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSearch: { control: DictControlDescriptor; query: string } | null = null;

  const emit = (
    control: DictControlDescriptor,
    interaction: Parameters<typeof translateDictControlInteraction>[1],
  ): void => {
    for (const event of translateDictControlInteraction(control, interaction)) {
      options.dispatch(event);
    }
  };

  const bridge: ElementPlusDictControlBridge = {
    open: (control) => emit(control, { type: 'open' }),
    dependenciesChanged: (control) => emit(control, { type: 'dependencies-changed' }),
    valueChanged: (control, value) => emit(control, { type: 'value-changed', value }),
    remoteSearch(control, query) {
      if (searchTimer) clearTimer(searchTimer);
      pendingSearch = { control, query };
      searchTimer = setTimer(() => {
        searchTimer = null;
        const pending = pendingSearch;
        pendingSearch = null;
        if (pending) emit(pending.control, { type: 'remote-search', query: pending.query });
      }, options.debounceMs ?? control.searchDebounceMs ?? 300);
    },
    invalidate: (control) => emit(control, { type: 'invalidate' }),
    elementProps(control) {
      const remote = control.triggers.includes('search');
      const loadOnOpen =
        control.triggers.length === 0 || control.triggers.includes('open');
      return {
        loading: control.loading,
        disabled: control.disabled,
        'aria-busy': control.ariaBusy ? 'true' : 'false',
        'aria-invalid': control.ariaInvalid ? 'true' : 'false',
        ...(control.error ? { 'data-dict-error': control.error } : {}),
        ...(loadOnOpen
          ? {
              onVisibleChange: (open: boolean) => {
                if (open) bridge.open(control);
              },
            }
          : {}),
        ...(remote
          ? {
              remote: true,
              remoteMethod: (query: string) => bridge.remoteSearch(control, query),
            }
          : {}),
      };
    },
    dispose() {
      if (searchTimer) clearTimer(searchTimer);
      searchTimer = null;
      pendingSearch = null;
    },
  };
  return bridge;
}

/** Adapter used by existing DgFormItem, whose public surface is the bound CrudCommands object. */
export function dispatchDictControlCommand(commands: CrudCommands, event: DictControlCommand): void {
  const payload = (event.payload ?? {}) as any;
  switch (event.type) {
    case CRUD_EVENT.loadDict:
      commands.loadDict(payload);
      return;
    case CRUD_EVENT.refreshDict:
      commands.refreshDict(payload);
      return;
    case CRUD_EVENT.invalidateDict:
      commands.invalidateDict(payload);
      return;
    case CRUD_EVENT.hydrateDict:
      commands.hydrateDict(payload);
      return;
    case CRUD_EVENT.searchDict:
      commands.searchDict(payload);
  }
}
