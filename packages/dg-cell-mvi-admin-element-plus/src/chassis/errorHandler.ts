/**
 * dg-cell-mvi-admin-element-plus · chassis/errorHandler — the APP-layer global error sink (P4·T4.3).
 *
 * The last-resort catch for errors that nothing else handled, so a thrown render/lifecycle error or a
 * stray unhandled rejection surfaces as a user-visible "页面出错" toast instead of a SILENT white screen.
 * It lives in the APP layer (the 消费方/装配根) because it depends on element-plus for the toast and on
 * `app` for the Vue hook — the framework-neutral packages (admin-logic/admin-support) must never import
 * a UI lib, so this app module is the correct home (mirrors chassis/stores.ts wiring the concrete ports).
 *
 * What it installs (all via `installGlobalErrorHandler(app)`, called once from main.ts):
 *   1. `app.config.errorHandler`            — Vue RENDER / lifecycle / watcher errors not caught by any
 *                                             component `errorCaptured`. console.error (full context for
 *                                             the dev) + one ElMessage (so the user is not left staring at
 *                                             a blank page).
 *   2. `window 'unhandledrejection'`        — a rejected promise with no `.catch` (e.g. a fire-and-forget
 *                                             async handler). console.error + a throttled ElMessage.
 *   3. `window 'error'`                     — uncaught sync errors + RESOURCE load failures (a broken
 *                                             <img>/<script> raises a capture-phase error with no `error`
 *                                             object). Resource errors are logged only (no toast — they
 *                                             are noisy and not user-actionable); real script errors toast.
 *
 * DESIGN — do NOT double-handle 401 (the single-transport goal, T3.1/T3.2). HTTP 401 is ALREADY handled
 * end-to-end by the HttpPort's `onUnauthorized` seam (chassis/stores.ts → dispatch `logout` → session
 * clears → the nav guard / LayoutFramework bounce to /login). That flow is an async HTTP concern: it does
 * NOT pass through Vue's `errorHandler` (it is not a render error). It COULD reach `unhandledrejection`
 * if a caller forgets to await/catch the rejected request — so the rejection handler SKIPS auth-shaped
 * errors (`isAuthError`), letting the logout+redirect speak for itself with no redundant "页面出错" toast.
 * Net: exactly one user-facing reaction per failure (logout-bounce for 401; one error toast otherwise).
 *
 * THROTTLE — a render loop can fire the same error every frame; an unbounded toast storm would itself be
 * a worse white-screen. We coalesce to at most one toast per `THROTTLE_MS` window (console.error is never
 * throttled — the dev still sees every occurrence).
 */
import { ElMessage } from 'element-plus';
import type { App } from 'vue';

/** User-facing copy — generic on purpose (we never leak a raw stack to the user; that goes to console). */
const USER_MESSAGE = '页面出错，请稍后重试';

/** Minimum gap between user-facing toasts (console logging is unaffected). */
const THROTTLE_MS = 3000;
let lastToastAt = 0;

/** Emit at most one ElMessage per THROTTLE_MS window so an error LOOP can't bury the UI in toasts. */
function notifyUserThrottled(message: string = USER_MESSAGE): void {
  const now = Date.now();
  if (now - lastToastAt < THROTTLE_MS) return;
  lastToastAt = now;
  // guarded: a failure INSIDE the toast path must never re-enter the handler (would loop).
  try {
    ElMessage.error({ message, duration: 3000 });
  } catch {
    /* element not mounted / SSR — the console.error at the call site is the fallback record. */
  }
}

/**
 * Heuristic: does this error look like an AUTH failure (already handled by onUnauthorized→logout)?
 * Used ONLY to suppress a redundant toast on the unhandled-rejection path — the logout+redirect is the
 * user feedback for 401, so we do not also say "页面出错". Conservative substring match on the message /
 * any axios-style `response.status === 401`; anything not clearly auth still toasts.
 */
function isAuthError(reason: unknown): boolean {
  const status = (reason as { response?: { status?: unknown } } | undefined)?.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  return /unauthorized|401|403|登录|登入|token/i.test(msg);
}

/**
 * Install the app-wide error sink on the given Vue app. Idempotent-friendly: safe to call once at boot
 * (main.ts). Returns nothing; the listeners live for the app's lifetime (a single-page admin app).
 */
export function installGlobalErrorHandler(app: App): void {
  // 1. Vue render / lifecycle / watcher errors (not caught by a component `errorCaptured`).
  //    `info` is Vue's hook label (e.g. "render function", "setup function"). We log the lot and show
  //    the generic toast. We do NOT re-throw — re-throwing would also hit window 'error' (double report).
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[admin] Vue error:', err, '\n  hook:', info);
    notifyUserThrottled();
  };

  // window listeners only make sense in a browser (guarded so an SSR/test import is a no-op).
  if (typeof window === 'undefined') return;

  // 2. Unhandled promise rejections (a missing await/catch on an async path). Skip auth-shaped ones —
  //    401/403 already drive logout→redirect, so a "页面出错" toast on top would be a double signal.
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;

    console.error('[admin] Unhandled promise rejection:', reason);
    if (isAuthError(reason)) return; // handled by onUnauthorized→logout; no redundant toast.
    notifyUserThrottled();
  });

  // 3. Uncaught sync errors + RESOURCE load failures. A resource error (broken <img>/<script>/<link>)
  //    fires in the CAPTURE phase with `event.error == null` and a non-window `target`; those are noisy
  //    and not user-actionable, so we LOG them but do not toast. Genuine script errors (error != null)
  //    get the toast. Registered with `capture: true` so resource errors (which don't bubble) are seen.
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const isResourceError = event.target != null && event.target !== window && !event.error;
      if (isResourceError) {
        console.error('[admin] Resource load error:', (event.target as Element)?.outerHTML ?? event.target);
        return; // resource failures: log only.
      }

      console.error('[admin] Uncaught error:', event.error ?? event.message);
      notifyUserThrottled();
    },
    true,
  );
}
