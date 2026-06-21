/**
 * dg-cell-mvi-admin-support · http/axiosHttpPort — the HttpPort impl over axios.
 *
 * `createAxiosHttpPort(opts)` builds an axios instance and adapts it to the framework-neutral
 * `HttpPort` (admin-contract). Factory-injection style (mirrors crud's `createRequestEffects` /
 * `createColumnsFilterEffects`): everything the transport needs is passed in, nothing is read from an
 * implicit global — the one exception is the `baseURL` *default*, which falls back to the sanctioned
 * env accessor `getApiBase()` (itself the only reader of `import.meta.env`).
 *
 * DEPA discipline — this package stays FRAMEWORK-NEUTRAL: it knows the contract ports + axios/mitt and
 * NOTHING about the session store / vue / router. So the two things an interceptor needs from the app —
 * "the current auth token" and "what to do on 401" — arrive as INJECTED CALLBACKS (`getAuthToken` /
 * `onUnauthorized`), not by importing a store. The app (T3.3) wires `getAuthToken` to the session
 * store's token and `onUnauthorized` to logout; here we only read the callback and call it.
 *
 * Injection seams (`CreateAxiosHttpPortOptions`):
 *   - `baseURL`        — base/prefix for every request; defaults to `getApiBase()` (env `VITE_APP_API`).
 *   - `timeout`        — default request timeout (ms); defaults to 10000.
 *   - `headers`        — default headers merged under each request's own headers.
 *   - `instance`       — a pre-built axios instance (the TEST seam: pass a fake/mock so request() is
 *                        exercised offline; in prod this is omitted and axios.create() is used).
 *   - `getAuthToken`   — REQUEST seam: returns the current token; when truthy it is injected as the auth
 *                        header (`Authorization`, optionally `Bearer`-prefixed). Returns null/undefined
 *                        ⇒ no header added. Read per-request (token can change between calls).
 *   - `onUnauthorized` — RESPONSE seam: invoked on an auth failure (HTTP 401 or the envelope's
 *                        unauthorized business code). admin-support does NOT log out itself — it only
 *                        calls back so the app can clear the session.
 *   - `unwrap` + envelope keys/codes — RESPONSE seam: how the `{ code, msg, data }` body is unpacked.
 *
 * Why the request/response logic lives in the `request()` wrapper (not `instance.interceptors`):
 * the wrapper applies it uniformly whether `instance` is real axios or an injected fake — a fake that
 * only implements `request` would never run real interceptor handlers, so putting auth-header / unwrap /
 * 401 there is what makes them deterministically testable offline. The seam (factory + port shape) is
 * unchanged; `request<T>`/`get`/`post` still return the already-unwrapped `T`.
 */
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type CreateAxiosDefaults,
} from 'axios';

import type { HttpPort, HttpRequestConfig } from 'dg-cell-mvi-admin-contract';

import { getApiBase } from '../utils/env';

/**
 * The `{ code, msg, data }` response envelope contract (borrowed from the reference admin's
 * `service.ts` and DEPA-rewritten). Field names + the success code are all configurable
 * (`codeKey`/`dataKey`/`msgKey`/`successCode`/`unauthorizedCodes`) so a backend with a different
 * convention can be adapted without touching call sites; the defaults match the reference.
 */
export interface EnvelopeConfig {
  /** key holding the business status code. Default `'code'`. */
  codeKey?: string;
  /** key holding the payload to unwrap to. Default `'data'`. */
  dataKey?: string;
  /** key holding the human message (used as the reject reason on failure). Default `'msg'`. */
  msgKey?: string;
  /** the code that means "success" → unwrap to `data`. Default `0` (matches the reference). */
  successCode?: unknown;
  /**
   * business codes that mean "auth failed" → trigger `onUnauthorized` + reject (in addition to a raw
   * HTTP 401). Default `[401]`. Empty array ⇒ only HTTP 401 triggers logout.
   */
  unauthorizedCodes?: unknown[];
}

export interface CreateAxiosHttpPortOptions {
  /** base URL / prefix; defaults to the env `VITE_APP_API` (via `getApiBase()`). */
  baseURL?: string;
  /** default per-request timeout in ms; default 10000. */
  timeout?: number;
  /** default headers merged beneath each request's own headers. */
  headers?: Record<string, string>;
  /**
   * a pre-built axios instance to adapt instead of creating one. The primary TEST seam — pass a fake
   * exposing the `request(config) => Promise<{ data }>` shape to exercise the port without a network.
   */
  instance?: AxiosInstance;
  /**
   * REQUEST seam: returns the current auth token (or null/undefined for "no token"). Called per
   * request so a token set after the port is built is still picked up. The app injects this to read
   * `sessionStore.state().token`; admin-support never reaches into a store itself.
   */
  getAuthToken?: () => string | undefined | null;
  /** header name carrying the token. Default `'Authorization'`. */
  authHeaderName?: string;
  /**
   * prefix the token with `'Bearer '` when building the auth header. Default `false` — the reference
   * sends the raw token; set `true` for `Authorization: Bearer <token>`.
   */
  authScheme?: 'Bearer' | false;
  /**
   * RESPONSE seam: invoked once an auth failure is detected (HTTP 401 or an `unauthorizedCodes`
   * business code). admin-support stays framework-neutral and only calls back — the app wires this to
   * logout / publishing the `loggedOut` domain message. Receives the failing `HttpRequestConfig`.
   */
  onUnauthorized?: (ctx?: { config: HttpRequestConfig }) => void;
  /**
   * RESPONSE seam: whether to unwrap the `{ code, msg, data }` envelope. Default `true`.
   *   - `true`               → enforce the envelope: success code ⇒ resolve `data`; auth code ⇒
   *                            `onUnauthorized()` + reject; any other code ⇒ reject with `msg`.
   *   - `false`              → never unwrap; resolve the raw response body verbatim.
   *   - `(envelope) => any`  → custom unwrap; its return value is what `request()` resolves to.
   * A per-request `config.unwrap === false` overrides a `true`/function default for that one call
   * (raw body returned), but 401 detection still fires.
   */
  unwrap?: boolean | ((envelope: unknown) => unknown);
  /** envelope field names + codes; only needed to override the defaults. */
  envelope?: EnvelopeConfig;
}

const DEFAULT_ENVELOPE: Required<EnvelopeConfig> = {
  codeKey: 'code',
  dataKey: 'data',
  msgKey: 'msg',
  successCode: 0,
  unauthorizedCodes: [401],
};

/** Map the neutral `HttpRequestConfig` onto axios' config (a near-passthrough; `data`/`params` align). */
function toAxiosConfig(req: HttpRequestConfig): AxiosRequestConfig {
  // `unwrap` is a port-level directive (consumed in the wrapper), not an axios field — strip it so it
  // is not forwarded onto the wire config.
  const { url, method, params, data, headers, timeout, unwrap, ...rest } = req;
  void unwrap;
  return {
    url,
    method: method as AxiosRequestConfig['method'],
    params,
    data,
    headers,
    timeout,
    ...rest,
  };
}

/** Is `v` a plain object that could carry the envelope code key? */
function looksLikeEnvelope(v: unknown, codeKey: string): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && codeKey in (v as Record<string, unknown>);
}

/** Pull the HTTP status off whatever an axios-style rejection carries (best-effort). */
function statusOf(err: unknown): number | undefined {
  const r = (err as { response?: { status?: unknown } } | undefined)?.response;
  const s = r?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Build a `HttpPort` backed by axios, with auth-header / envelope-unwrap / 401 handling. */
export function createAxiosHttpPort(opts: CreateAxiosHttpPortOptions = {}): HttpPort {
  const baseURL = opts.baseURL ?? getApiBase();
  const defaults: CreateAxiosDefaults = {
    baseURL,
    timeout: opts.timeout ?? 10000,
    headers: opts.headers,
  };
  const instance: AxiosInstance = opts.instance ?? axios.create(defaults);

  // When an instance is injected, apply our defaults non-destructively so baseURL/timeout still take
  // effect (a fake/mock that only implements `request` simply ignores these).
  if (opts.instance) {
    instance.defaults.baseURL = instance.defaults.baseURL ?? baseURL;
    if (instance.defaults.timeout == null) instance.defaults.timeout = defaults.timeout;
  }

  const env = { ...DEFAULT_ENVELOPE, ...opts.envelope };
  const authHeaderName = opts.authHeaderName ?? 'Authorization';
  const wantUnwrap = opts.unwrap ?? true; // envelope-unwrapping is on by default (the reference behavior).

  /** REQUEST: read the injected token (if any) and merge the auth header onto this request's config. */
  function withAuthHeader(config: HttpRequestConfig): HttpRequestConfig {
    const token = opts.getAuthToken?.();
    if (token == null || token === '') return config;
    const value = opts.authScheme === 'Bearer' ? `Bearer ${token}` : token;
    return { ...config, headers: { ...config.headers, [authHeaderName]: value } };
  }

  /** RESPONSE: detect an unauthorized envelope code, fire `onUnauthorized`, surface a rejection. */
  function failUnauthorizedFromCode(body: Record<string, unknown>, config: HttpRequestConfig): never {
    opts.onUnauthorized?.({ config });
    const msg = String(body[env.msgKey] ?? 'Unauthorized');
    throw new Error(msg);
  }

  /**
   * RESPONSE: turn the raw body into the resolved `T`. Order of precedence:
   *   1. per-request `unwrap === false`  → raw body (but still detect 401-by-code first).
   *   2. function `unwrap`               → its return value.
   *   3. `unwrap === false` (port-wide)  → raw body.
   *   4. default envelope                → success ⇒ data, auth code ⇒ 401, else ⇒ reject(msg).
   * A non-envelope body (no code key) is always returned as-is.
   */
  function unwrapBody(raw: unknown, config: HttpRequestConfig): unknown {
    const isEnvelope = looksLikeEnvelope(raw, env.codeKey);

    // 401-by-code is checked even when a request opts out of unwrapping — auth failure must still log out.
    if (isEnvelope) {
      const code = (raw as Record<string, unknown>)[env.codeKey];
      if (env.unauthorizedCodes.some((c) => c === code)) {
        failUnauthorizedFromCode(raw as Record<string, unknown>, config);
      }
    }

    if (config.unwrap === false) return raw; // per-request opt-out → raw body.
    if (typeof wantUnwrap === 'function') return wantUnwrap(raw); // custom unwrap.
    if (wantUnwrap === false) return raw; // port-wide opt-out.
    if (!isEnvelope) return raw; // nothing to unwrap.

    const body = raw as Record<string, unknown>;
    const code = body[env.codeKey];
    if (code === env.successCode) return body[env.dataKey]; // success → payload.
    // any other business code → normalized failure (reject with the server message).
    throw new Error(String(body[env.msgKey] ?? `Request failed (code ${String(code)})`));
  }

  const port: HttpPort = {
    async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
      const finalConfig = withAuthHeader(config);
      let res: AxiosResponse<unknown>;
      try {
        res = (await instance.request(toAxiosConfig(finalConfig))) as AxiosResponse<unknown>;
      } catch (err) {
        // HTTP-level 401 → callback then re-reject so the effect handler still folds a failure.
        if (statusOf(err) === 401) opts.onUnauthorized?.({ config });
        throw err;
      }
      return unwrapBody(res.data, config) as T;
    },
    get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
      return port.request<T>({ url, method: 'get', params });
    },
    post<T = unknown>(url: string, data?: unknown): Promise<T> {
      return port.request<T>({ url, method: 'post', data });
    },
  };
  return port;
}
