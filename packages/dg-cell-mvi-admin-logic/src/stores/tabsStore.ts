/**
 * dg-cell-mvi-admin-logic · stores/tabsStore — the `tabs` data-ownership actor.
 *
 * Owns TabsState (opened/current/keepAlive) — its reduce is the SINGLE WRITER. Commands: openTab /
 * closeTab / closeOthers / closeAll / setCurrent (contract). T1.2 = pure state machine; P2 injects
 * per-user persistence (StoragePort) through `deps.effects`.
 */
import type { EffectHandler, StreamSignalStore } from 'dg-cell-mvi-core';
import { createInitialTabsState } from 'dg-cell-mvi-admin-contract';
import type { TabsState, TabsBinding } from 'dg-cell-mvi-admin-contract';

import { createActorStore } from './createActorStore';
import { reduceTabs } from '../logic/reducers';
import { projectTabs } from '../logic/projectors';

export type TabsStore = StreamSignalStore<TabsState, TabsBinding>;

export interface CreateTabsStoreDeps {
  effects?: Record<string, EffectHandler<TabsState>>;
  onError?: (error: unknown) => void;
}

export function createTabsStore(deps: CreateTabsStoreDeps = {}): TabsStore {
  return createActorStore<TabsState, TabsBinding>({
    initialState: createInitialTabsState(),
    reduce: reduceTabs,
    project: projectTabs,
    effects: deps.effects,
    onError: deps.onError,
  });
}
