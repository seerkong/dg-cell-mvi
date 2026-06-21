/**
 * dg-cell-mvi-admin-logic · effects/authEffects — the session actor's auth side effects (DEPA Effect 维).
 *
 * The impure boundary for authentication, shaped as the DEPA `fn(runtime, input, config)` seam:
 *   - runtime  = the INJECTED ports (`{ http, storage }`, admin-contract interfaces) — the only IO surface.
 *   - input    = the `EffectRequest` (the named effect + its payload the reduce emitted).
 *   - config   = endpoint/method/persistKey settings, closed over by the factory.
 *
 * `createAuthEffects(ports, config)` returns the `EffectHandler<SessionState>` map the actor store runs.
 * logic NEVER imports a concrete IO module — it depends only on the port *interfaces*; the app injects
 * the concrete impls (admin-support's axios HttpPort / Web-Storage StoragePort) at assembly time. Each
 * handler runs its IO and re-dispatches the fact-writing commands (setToken/setUserInfo/clearSession/
 * loginFailed) + publishes the cross-actor domain message (loggedIn/loggedOut) — the effect回流 loop
 * (createEffectRunner auto re-dispatches returned AppEvents).
 *
 * Mirrors crud/support/requestEffects.ts (request effect: call port → re-dispatch success/failure) +
 * crud/support/columnsFilterEffects.ts (storage persist effect: inject storage port, IO at the boundary).
 *
 * Cross-actor coordination (decisions §10): a successful login PUBLISHES `loggedIn`; permission载入 →
 * menu 重算 subscribe to it in P5. T2.1 only打通 session's own auth + publishes the message.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';
import {
  SESSION_EFFECT,
  setToken,
  setUserInfo,
  clearSession,
  loadUserInfo,
  loginFailed,
  loggedIn,
  loggedOut,
} from 'dg-cell-mvi-admin-contract';
import type {
  HttpPort,
  StoragePort,
  HttpMethod,
  LoginRequest,
  LoginResponse,
  SessionState,
  UserInfo,
} from 'dg-cell-mvi-admin-contract';

/** The injected runtime ports — the ONLY IO surface auth effects touch (Effect-维 seam). */
export interface AuthPorts {
  /** transport seam (admin-support's axios impl in the app; a stub in tests). Required for login/mine. */
  http?: HttpPort;
  /** persistence seam (admin-support's Web-Storage impl; an in-memory backend in tests). */
  storage?: StoragePort;
}

/** Endpoint/method/key config closed over by the factory (the `config` of `fn(runtime,input,config)`). */
export interface AuthEffectsConfig {
  /** login endpoint path (resolved against the HttpPort baseURL). Default `/login`. */
  loginUrl?: string;
  /** login HTTP method. Default `post`. */
  loginMethod?: HttpMethod;
  /** profile (`mine`) endpoint path. Default `/sys/authority/user/mine` (ref project shape). */
  mineUrl?: string;
  /** profile HTTP method. Default `post` (ref project posts `mine`). */
  mineMethod?: HttpMethod;
  /** OPTIONAL backend logout endpoint; omitted → logout is local-only (storage.remove + clearSession). */
  logoutUrl?: string;
  /** logout HTTP method (only used when logoutUrl is set). Default `post`. */
  logoutMethod?: HttpMethod;
  /** storage key the token shadow lives under (the StoragePort adds its own namespace prefix). Default `'token'`. */
  persistKey?: string;
}

/** the canonical defaults (borrowed from the reference admin's API shapes, port-ized). */
const DEFAULTS: Required<Omit<AuthEffectsConfig, never>> = {
  loginUrl: '/login',
  loginMethod: 'post',
  mineUrl: '/sys/authority/user/mine',
  mineMethod: 'post',
  logoutUrl: '',
  logoutMethod: 'post',
  // bare key — the StoragePort owns the namespace prefix (e.g. 'admin:'), so this resolves to 'admin:token'.
  persistKey: 'token',
};

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the auth effect-handler map for the session actor.
 *
 * @param ports  injected runtime ports `{ http, storage }` (the Effect-维 seam) — logic's only IO.
 * @param config endpoint/method/persistKey overrides (defaults borrowed from the reference admin).
 */
export function createAuthEffects(
  ports: AuthPorts = {},
  config: AuthEffectsConfig = {},
): Record<string, EffectHandler<SessionState>> {
  const { http, storage } = ports;
  // coalesce per-field so an explicit `undefined` (e.g. an unset persistKey threaded through from
  // createSessionStore) does NOT clobber the default — plain `{...DEFAULTS, ...config}` would let it through.
  const cfg: Required<AuthEffectsConfig> = {
    loginUrl: config.loginUrl ?? DEFAULTS.loginUrl,
    loginMethod: config.loginMethod ?? DEFAULTS.loginMethod,
    mineUrl: config.mineUrl ?? DEFAULTS.mineUrl,
    mineMethod: config.mineMethod ?? DEFAULTS.mineMethod,
    logoutUrl: config.logoutUrl ?? DEFAULTS.logoutUrl,
    logoutMethod: config.logoutMethod ?? DEFAULTS.logoutMethod,
    persistKey: config.persistKey ?? DEFAULTS.persistKey,
  };

  // --- auth/login : POST credentials → setToken(+persist via setToken's reduce) + profile; else loginFailed.
  const login: EffectHandler<SessionState> = async (_rt, req) => {
    const { credentials } = (req.payload || {}) as { credentials: LoginRequest };
    if (!http) return loginFailed('no HttpPort injected'); // misconfigured: surface, never silently pass.
    try {
      const res = await http.request<LoginResponse>({
        url: cfg.loginUrl,
        method: cfg.loginMethod,
        data: credentials,
      });
      const token = String(res?.token ?? '');
      if (!token) return loginFailed('login response had no token');
      // success回流: setToken (its reduce flips status=authenticated + persists the shadow). If the
      // backend returned the profile inline, set it too + publish loggedIn now; otherwise trigger the
      // `mine` load (loadUserInfo command → loadUserInfo effect → setUserInfo) and publish with null.
      const inlineUser = (res?.userInfo ?? null) as UserInfo | null;
      const feedback = [
        setToken(token),
        inlineUser ? setUserInfo(inlineUser) : loadUserInfo(),
        // cross-actor message (decisions §10): permission/menu subscribe in P5; published now to打通 protocol.
        loggedIn({ token, userInfo: inlineUser }),
      ];
      return feedback;
    } catch (err) {
      // failure path (delta): token is NOT touched — only record the error.
      return loginFailed(normalizeError(err));
    }
  };

  // --- auth/logout : optional backend call (best-effort) + storage.remove + clearSession回流 + loggedOut.
  const logout: EffectHandler<SessionState> = async (_rt) => {
    if (http && cfg.logoutUrl) {
      try {
        await http.request({ url: cfg.logoutUrl, method: cfg.logoutMethod });
      } catch {
        // best-effort: a failed backend logout must not strand the local session — clear regardless.
      }
    }
    // remove the token shadow directly here too (clearSession's reduce also emits a persist-remove, but
    // doing it here keeps logout self-contained even if the回流 ordering changes).
    storage?.remove(cfg.persistKey);
    return [clearSession(), loggedOut()];
  };

  // --- auth/loadUserInfo : GET/POST the profile (`mine`) → setUserInfo回流.
  const loadUserInfoHandler: EffectHandler<SessionState> = async (_rt) => {
    if (!http) return; // no transport → nothing to load (degrade quietly; not an auth failure).
    try {
      const userInfo = await http.request<UserInfo>({ url: cfg.mineUrl, method: cfg.mineMethod });
      return setUserInfo((userInfo ?? null) as UserInfo | null);
    } catch {
      // a profile fetch failure does not invalidate the token; swallow (P3 maps 401→logout via interceptor).
      return;
    }
  };

  // --- session/persist : write (or clear) the token shadow. Pure shadow IO — no回流.
  const persistToken: EffectHandler<SessionState> = async (_rt, req) => {
    if (!storage) return;
    const { token } = (req.payload || {}) as { token: string };
    if (token) storage.set(cfg.persistKey, token);
    else storage.remove(cfg.persistKey); // empty token = clear the shadow.
  };

  // --- session/hydrate : read the persisted token on init → restore the token fact AND re-fetch the
  // profile. userInfo is NOT persisted (only the token shadow is), so after a reload we re-load it from
  // `mine` — otherwise an authenticated user shows as "未登录" in the header until they log in again.
  const hydrateToken: EffectHandler<SessionState> = async (_rt) => {
    if (!storage) return;
    const token = storage.get<string>(cfg.persistKey);
    if (!token) return; // no shadow → stay anonymous (no event).
    // setToken re-hydrates the fact (settles status + re-persists, idempotent); loadUserInfo fetches the
    // profile via the injected HttpPort so the user surface is populated after a reload, not just the token.
    return [setToken(String(token)), loadUserInfo()];
  };

  return {
    [SESSION_EFFECT.login]: login,
    [SESSION_EFFECT.logout]: logout,
    [SESSION_EFFECT.loadUserInfo]: loadUserInfoHandler,
    [SESSION_EFFECT.persistToken]: persistToken,
    [SESSION_EFFECT.hydrateToken]: hydrateToken,
  };
}
