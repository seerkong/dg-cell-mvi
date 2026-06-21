/**
 * dg-cell-mvi-admin-logic · stores/permissionStore — the `permission` data-ownership actor.
 *
 * Owns PermissionState (codes) — its reduce is the SINGLE WRITER. Commands: setCodes / clearCodes (the
 * fact writes) + the `loadPermissions` command that NAMES the remote-load effect. The codes are 1-级
 * (remote-loaded) facts; T1.2 was a pure state machine; P5·T5.1 wires the remote load (HttpPort) through
 * the injected port. `menu` is a PURE projection of routes × these codes (menuProjection.ts) — not stored
 * here, never written back; it recomputes whenever the codes fact changes.
 *
 * Two ways to get the effects (Effect-维 seam, design §C) — mirrors createSessionStore:
 *   - the common path: pass `{ http, config }` and this factory builds the load effect map via
 *     `createPermissionEffects(ports, config)` itself.
 *   - the escape hatch: pass a ready `effects` map directly (advanced / custom handlers / tests). When
 *     BOTH are given, the explicit `effects` win on key collision (override).
 *
 * With NO port and NO effects → degrades to the P1 pure state machine (an emitted load request is dropped
 * by the no-op runner; the existing actor tests are unaffected).
 *
 * NOTE: there is NO load-on-init here. WHEN to (re)load is a cross-actor concern owned by the chassis
 * assembly root (composition root): it watches the session's `authenticated` projection and dispatches
 * `loadPermissions()` (or `clearCodes()` on logout) — coordination by message/assembly, NOT a god-store
 * and NOT the session effect reaching into permission. See chassis/stores.ts.
 */
import type { EffectHandler, StreamSignalStore } from 'dg-cell-mvi-core';
import { createInitialPermissionState } from 'dg-cell-mvi-admin-contract';
import type { PermissionState, PermissionBinding, HttpPort } from 'dg-cell-mvi-admin-contract';

import { createActorStore } from './createActorStore';
import { reducePermission } from '../logic/reducers';
import { projectPermission } from '../logic/projectors';
import { createPermissionEffects, type PermissionEffectsConfig } from '../effects/permissionEffects';

export type PermissionStore = StreamSignalStore<PermissionState, PermissionBinding>;

export interface CreatePermissionStoreDeps {
  /** transport seam — enables the remote codes load (permission/load effect). Absent → load no-ops. */
  http?: HttpPort;
  /** endpoint/method overrides for the load effect (codesUrl/codesMethod). */
  config?: PermissionEffectsConfig;
  /**
   * OPTIONAL explicit effect-handler map (escape hatch / custom handlers / tests). Merged OVER the
   * auto-built load effect (explicit keys override). Absent + no port → pure state machine (P1 behavior).
   */
  effects?: Record<string, EffectHandler<PermissionState>>;
  onError?: (error: unknown) => void;
}

export function createPermissionStore(deps: CreatePermissionStoreDeps = {}): PermissionStore {
  const { http, config, effects: explicitEffects, onError } = deps;

  // auto-build the load effect from the injected port (only when http is present); explicit handlers
  // override on key collision. No port + no explicit effects → undefined → pure state machine.
  const autoEffects = http ? createPermissionEffects({ http }, config) : undefined;
  const merged =
    autoEffects || explicitEffects
      ? { ...(autoEffects ?? {}), ...(explicitEffects ?? {}) }
      : undefined;

  return createActorStore<PermissionState, PermissionBinding>({
    initialState: createInitialPermissionState(),
    reduce: reducePermission,
    project: projectPermission,
    effects: merged,
    onError,
  });
}
