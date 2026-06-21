/**
 * dg-cell-mvi-admin-logic · stores/sessionStore — the `session` data-ownership actor.
 *
 * Owns SessionState (token/userInfo/status/loading/error) — its reduce is the SINGLE WRITER. Commands:
 * the fact writes (setToken/setUserInfo/clearSession) + the auth commands (login/logout/loadUserInfo/
 * hydrate) that NAME effects. T1.2 was a pure state machine; T2.1 wires the auth effects (login via
 * HttpPort, token persist via StoragePort) through the injected ports.
 *
 * Two ways to get the effects (Effect-维 seam, design §C):
 *   - the common path: pass `{ http, storage, persistKey, authConfig }` and this factory builds the auth
 *     effect map via `createAuthEffects(ports, config)` itself (mirrors crud's `createCrudStore`, which
 *     assembles its support effects internally from `{ ui, storage, ... }`).
 *   - the escape hatch: pass a ready `effects` map directly (advanced / custom handlers). When BOTH are
 *     given, the explicit `effects` win on key collision (override).
 *
 * With NO ports and NO effects → degrades to the P1 pure state machine (emitted effect requests are
 * dropped by the no-op runner; the four existing actor tests are unaffected).
 *
 * Init hydrate: when a `storage` port is supplied, the store dispatches `hydrate()` right after creation
 * so the hydrate effect reads the token shadow and re-dispatches `setToken` (mirrors crud's init
 * `store.dispatch(loadColumnsFilter())`). No storage → no hydrate (stays anonymous).
 */
import type { EffectHandler, StreamSignalStore } from 'dg-cell-mvi-core';
import { createInitialSessionState, hydrate } from 'dg-cell-mvi-admin-contract';
import type { SessionState, SessionBinding, HttpPort, StoragePort } from 'dg-cell-mvi-admin-contract';

import { createActorStore } from './createActorStore';
import { reduceSession } from '../logic/reducers';
import { projectSession } from '../logic/projectors';
import { createAuthEffects, type AuthEffectsConfig } from '../effects/authEffects';

export type SessionStore = StreamSignalStore<SessionState, SessionBinding>;

export interface CreateSessionStoreDeps {
  /** transport seam — enables login / loadUserInfo (auth effects). Absent → those effects no-op/fail soft. */
  http?: HttpPort;
  /** persistence seam — enables token persist + init hydrate. Absent → no persistence, no hydrate. */
  storage?: StoragePort;
  /** the storage key the token shadow lives under (threaded into the auth effects config). */
  persistKey?: string;
  /** endpoint/method overrides for the auth effects (login/mine/logout URLs); persistKey above wins. */
  authConfig?: Omit<AuthEffectsConfig, 'persistKey'>;
  /**
   * OPTIONAL explicit effect-handler map (escape hatch / custom handlers). Merged OVER the auto-built
   * auth effects (explicit keys override). Absent + no ports → pure state machine (P1 behavior).
   */
  effects?: Record<string, EffectHandler<SessionState>>;
  onError?: (error: unknown) => void;
}

export function createSessionStore(deps: CreateSessionStoreDeps = {}): SessionStore {
  const { http, storage, persistKey, authConfig, effects: explicitEffects, onError } = deps;

  // auto-build the auth effects from the injected ports (only when a port is present); explicit handlers
  // override on key collision. No ports + no explicit effects → undefined → pure state machine.
  const haveAuto = Boolean(http || storage);
  const autoEffects = haveAuto
    ? createAuthEffects({ http, storage }, { ...authConfig, persistKey })
    : undefined;
  const merged =
    autoEffects || explicitEffects
      ? { ...(autoEffects ?? {}), ...(explicitEffects ?? {}) }
      : undefined;

  const store = createActorStore<SessionState, SessionBinding>({
    initialState: createInitialSessionState(),
    reduce: reduceSession,
    project: projectSession,
    effects: merged,
    onError,
  });

  // init hydrate: seed the token fact from its storage shadow (IO at the effect boundary). Only when a
  // storage port is present AND its handler is actually wired (merged effects include session/hydrate).
  if (storage && merged) {
    store.dispatch(hydrate());
  }

  return store;
}
