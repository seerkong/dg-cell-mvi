/**
 * dg-cell-mvi-admin-logic · effects/settingsEffects — the settings actor's persistence effects
 * (DEPA Effect 维, P6·T6.2).
 *
 * The impure boundary for PREFERENCE persistence, shaped as the DEPA `fn(runtime, input, config)` seam:
 *   - runtime  = the INJECTED `{ storage }` port (admin-contract StoragePort) — the only IO surface.
 *   - input    = the `EffectRequest` (settings/persist with the snapshot, or settings/hydrate).
 *   - config   = the storage key the preference blob lives under, closed over by the factory.
 *
 * `createSettingsEffects(ports, config)` returns the `EffectHandler<SettingsState>` map the actor store
 * runs. It mirrors the session actor's persist/hydrate pair (authEffects `persistToken`/`hydrateToken`),
 * but persists the whole {theme,locale,primaryColor} preference snapshot as ONE blob (the preferences are
 * read/written together) instead of a bare token string.
 *
 * IMPORTANT (decisions §6/§8 + the task's clean-split rule): this effect ONLY touches the StoragePort —
 * it does NOT apply the theme/locale to the render engines. APPLY (html.dark via ThemePort, vue-i18n via
 * I18nPort, EP CSS vars) is done at the ASSEMBLY ROOT by watching the settings actor's projection (the
 * same pattern T6.1 uses for locale in App.vue). Keeping persist HERE (port-injected, no DOM/vue) and
 * apply at the root preserves a PURE admin-logic — this module imports no DOM/vue/el symbol.
 *
 * "Refresh keeps the choice": setTheme/setLocale/setPrimaryColor each emit settings/persist (this writes
 * the shadow); on the next load the store's init `hydrate()` runs settings/hydrate (this reads the shadow
 * and re-dispatches the fact writes) BEFORE the assembly-root apply watch fires `immediate` — so the
 * restored theme/locale/color are applied on boot.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';
import {
  SETTINGS_EFFECT,
  setTheme,
  setLocale,
  setPrimaryColor,
} from 'dg-cell-mvi-admin-contract';
import type { StoragePort, SettingsState } from 'dg-cell-mvi-admin-contract';

/** The injected runtime ports — the ONLY IO surface settings effects touch (Effect-维 seam). */
export interface SettingsPorts {
  /** persistence seam (admin-support's Web-Storage impl; an in-memory backend in tests). */
  storage?: StoragePort;
}

/** Config closed over by the factory (the `config` of `fn(runtime,input,config)`). */
export interface SettingsEffectsConfig {
  /** storage key the preference blob lives under (the StoragePort adds its own namespace prefix). Default `'settings'`. */
  persistKey?: string;
}

const DEFAULTS: Required<SettingsEffectsConfig> = {
  // bare key — the StoragePort owns the namespace prefix (e.g. 'admin:'), so this resolves to 'admin:settings'.
  persistKey: 'settings',
};

/** the persisted blob shape (a subset of SettingsState — what we shadow). */
type PersistedSettings = Partial<Pick<SettingsState, 'theme' | 'locale' | 'primaryColor'>>;

/**
 * Build the persistence effect-handler map for the settings actor.
 *
 * @param ports  injected runtime ports `{ storage }` (the Effect-维 seam) — logic's only IO.
 * @param config storage-key override (default `'settings'`).
 */
export function createSettingsEffects(
  ports: SettingsPorts = {},
  config: SettingsEffectsConfig = {},
): Record<string, EffectHandler<SettingsState>> {
  const { storage } = ports;
  // coalesce per-field so an explicit `undefined` threaded through does NOT clobber the default.
  const cfg: Required<SettingsEffectsConfig> = {
    persistKey: config.persistKey ?? DEFAULTS.persistKey,
  };

  // --- settings/persist : write the preference snapshot to storage. Pure shadow IO — no回流. ---
  const persist: EffectHandler<SettingsState> = async (_rt, req) => {
    if (!storage) return;
    const { settings } = (req.payload || {}) as { settings: SettingsState };
    if (!settings) return;
    // shadow only the preference fields (drop undefined primaryColor so the blob stays clean).
    const blob: PersistedSettings = { theme: settings.theme, locale: settings.locale };
    if (settings.primaryColor) blob.primaryColor = settings.primaryColor;
    storage.set(cfg.persistKey, blob);
  };

  // --- settings/hydrate : read the persisted preferences on init → re-dispatch the fact writes for what
  //     is present. Each re-dispatched command re-persists (idempotent — writes back an equal blob); the
  //     assembly-root apply watch then applies the hydrated values on its `immediate` first run.
  const hydrate: EffectHandler<SettingsState> = async (_rt) => {
    if (!storage) return;
    const blob = storage.get<PersistedSettings>(cfg.persistKey);
    if (!blob || typeof blob !== 'object') return; // no/corrupt shadow → keep the seeded defaults (no event).
    const feedback = [];
    if (typeof blob.theme === 'string' && blob.theme) feedback.push(setTheme(blob.theme));
    if (typeof blob.locale === 'string' && blob.locale) feedback.push(setLocale(blob.locale));
    if (typeof blob.primaryColor === 'string' && blob.primaryColor) {
      feedback.push(setPrimaryColor(blob.primaryColor));
    }
    return feedback.length ? feedback : undefined;
  };

  return {
    [SETTINGS_EFFECT.persist]: persist,
    [SETTINGS_EFFECT.hydrate]: hydrate,
  };
}
