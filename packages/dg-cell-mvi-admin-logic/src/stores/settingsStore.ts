/**
 * dg-cell-mvi-admin-logic · stores/settingsStore — the `settings` data-ownership actor.
 *
 * Owns SettingsState (theme/locale/primaryColor) — its reduce is the SINGLE WRITER. Commands:
 * setTheme / setLocale / setPrimaryColor (each folds the field + names the persist effect) + the hydrate
 * command (contract). T1.2 was a pure state machine; P6·T6.2 injects PERSISTENCE (StoragePort) here.
 *
 * Two ways to get the effects (Effect-维 seam, design §C) — same shape as createSessionStore:
 *   - the common path: pass `{ storage, persistKey }` and this factory builds the persist/hydrate effect
 *     map via `createSettingsEffects(ports, config)` itself.
 *   - the escape hatch: pass a ready `effects` map directly. When BOTH are given, the explicit `effects`
 *     win on key collision (override).
 *
 * With NO storage and NO effects → degrades to the T1.2 pure state machine (emitted persist/hydrate
 * effect requests are dropped by the no-op runner; the existing settings actor tests are unaffected).
 *
 * Init hydrate: when a `storage` port is supplied, the store dispatches `hydrateSettings()` right after
 * creation so the hydrate effect reads the persisted preferences and re-dispatches setTheme/setLocale/
 * setPrimaryColor (mirrors sessionStore's init hydrate). This is the "refresh keeps the choice" path:
 * the actor restores the persisted theme/locale/color BEFORE the assembly-root apply watch fires
 * `immediate`, so the boot apply uses the restored values. No storage → no hydrate (stays at defaults).
 *
 * APPLY stays at the assembly root (decisions §6/§8): this store/effect NEVER touches the DOM/vue/el —
 * it only persists via the injected StoragePort. The app watches the projected theme/locale/primaryColor
 * and calls ThemePort/I18nPort (html.dark / vue-i18n / EP CSS vars).
 */
import type { EffectHandler, StreamSignalStore } from 'dg-cell-mvi-core';
import { createInitialSettingsState, hydrateSettings } from 'dg-cell-mvi-admin-contract';
import type { SettingsState, SettingsBinding, StoragePort } from 'dg-cell-mvi-admin-contract';

import { createActorStore } from './createActorStore';
import { reduceSettings } from '../logic/reducers';
import { projectSettings } from '../logic/projectors';
import { createSettingsEffects, type SettingsEffectsConfig } from '../effects/settingsEffects';

export type SettingsStore = StreamSignalStore<SettingsState, SettingsBinding>;

export interface CreateSettingsStoreDeps {
  /** persistence seam — enables preference persist + init hydrate. Absent → no persistence, no hydrate. */
  storage?: StoragePort;
  /** the storage key the preference blob lives under (threaded into the settings effects config). */
  persistKey?: string;
  /** key/storage override for the settings effects (persistKey above wins on collision). */
  settingsConfig?: Omit<SettingsEffectsConfig, 'persistKey'>;
  /**
   * OPTIONAL explicit effect-handler map (escape hatch / custom handlers). Merged OVER the auto-built
   * persist/hydrate effects (explicit keys override). Absent + no storage → pure state machine (T1.2).
   */
  effects?: Record<string, EffectHandler<SettingsState>>;
  onError?: (error: unknown) => void;
}

export function createSettingsStore(deps: CreateSettingsStoreDeps = {}): SettingsStore {
  const { storage, persistKey, settingsConfig, effects: explicitEffects, onError } = deps;

  // auto-build the persist/hydrate effects from the injected storage port (only when present); explicit
  // handlers override on key collision. No storage + no explicit effects → undefined → pure state machine.
  const autoEffects = storage
    ? createSettingsEffects({ storage }, { ...settingsConfig, persistKey })
    : undefined;
  const merged =
    autoEffects || explicitEffects
      ? { ...(autoEffects ?? {}), ...(explicitEffects ?? {}) }
      : undefined;

  const store = createActorStore<SettingsState, SettingsBinding>({
    initialState: createInitialSettingsState(),
    reduce: reduceSettings,
    project: projectSettings,
    effects: merged,
    onError,
  });

  // init hydrate: seed the preference facts from their storage shadow (IO at the effect boundary). Only
  // when a storage port is present AND its handler is actually wired (merged effects include settings/hydrate).
  if (storage && merged) {
    store.dispatch(hydrateSettings());
  }

  return store;
}
