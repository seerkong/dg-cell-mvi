/**
 * dg-cell-mvi-crud · contract/store — createCrudStore, the assembly point.
 *
 * Direct analog of pipeline-debug-mvi/contract/streams.ts: normalize options once (held in closure),
 * wire effect handlers + reducer + projector into a dg-cell-mvi-core store. Returns the store plus
 * the normalized config (the view adapter reads it).
 */
import { createEffectRunner, createStreamSignalStore } from 'dg-cell-mvi-core';
import type { StreamSignalStore } from 'dg-cell-mvi-core';

import type { CrudOptions } from './crudOptions';
import { createInitialCrudState, type CrudState } from './state';
import { loadColumnsFilter } from './events';
import { reduceCrud } from '../logic/reducers';
import { projectCrudBinding, type CrudBinding } from '../logic/projectors';
import { buildNormalizedOptions, type NormalizedCrudOptions } from '../support/optionsBuild';
import type { CrudTranslator } from '../support/i18n';
import { createRequestEffects, type CrudUiPort } from '../support/requestEffects';
import { createFormEffects } from '../support/formEffects';
import { createFormDraftEffects } from '../support/formDraftEffects';
import { createRemoveEffects } from '../support/removeEffects';
import { createEditableEffects } from '../support/editableEffects';
import { getSharedDictRegistry } from '../support/dictRegistry';
import { createDictEffects } from '../support/dictEffects';
import {
  createColumnsFilterEffects,
  type ColumnsFilterStoragePort,
} from '../support/columnsFilterEffects';

export type CrudStore<R = any> = StreamSignalStore<CrudState<R>, CrudBinding<R>> & {
  config: NormalizedCrudOptions<R>;
};

export interface CreateCrudStoreOptions<R = any> {
  crudOptions: CrudOptions<R>;
  commonOptions?: CrudOptions<R>;
  ui?: CrudUiPort;
  /** storage backend for column-settings persistence (the Vue layer supplies localStorage). */
  storage?: ColumnsFilterStoragePort;
  /**
   * Injected translator for built-in chrome labels. Threaded onto the
   * normalized config so the PURE projector localizes built-in labels through it. Absent → default
   * Chinese (behavior-equivalent). Same injection pattern as `ui` / `storage`.
   */
  i18n?: CrudTranslator;
  /**
   * Injected button-permission predicate. Threaded onto the normalized
   * config so the button projectors drop a button whose `permission` code yields `false`. Absent → no
   * filtering (keep every button). Same injection pattern as `ui` / `storage`.
   */
  permission?: (code: string) => boolean;
  onError?: (error: unknown) => void;
}

export function createCrudStore<R = any>(input: CreateCrudStoreOptions<R>): CrudStore<R> {
  const config = buildNormalizedOptions<R>(input.crudOptions, input.commonOptions, {
    t: input.i18n,
    permission: input.permission,
  });
  // a process-wide registry so `shared` dicts load once and survive page navigations.
  const dicts = getSharedDictRegistry({ dictRequest: (config.raw as any)?.dictRequest });
  const effects = {
    ...createRequestEffects<R>({ config, ui: input.ui }),
    ...createFormEffects<R>({ config }),
    ...createFormDraftEffects<R>({ config, storage: input.storage, ui: input.ui }),
    ...createRemoveEffects<R>({ config, ui: input.ui }),
    ...createEditableEffects<R>({ config }),
    ...createDictEffects<R>({ config, dicts }),
    ...createColumnsFilterEffects<R>({ config, storage: input.storage }),
  };
  const runner = createEffectRunner<CrudState<R>>(effects);

  const store = createStreamSignalStore<CrudState<R>, CrudBinding<R>>({
    initialState: createInitialCrudState<R>(config.seed),
    reduce: (s, e) => reduceCrud<R>(s, e, config),
    project: (s) => projectCrudBinding<R>(s, config),
    runEffects: (reqs, ctx) => runner.runAll(reqs, ctx),
    onError: input.onError,
  });

  // seed the column-settings slice from storage on init (IO at the effect boundary): when persistence
  // is enabled, dispatch the load command so the storage handler reads + re-dispatches columnsFilterLoaded.
  if (config.columnsFilter.storage && config.table.id) {
    store.dispatch(loadColumnsFilter());
  }

  return Object.assign(store, { config });
}
