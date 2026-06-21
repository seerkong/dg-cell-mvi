/**
 * dg-cell-mvi-admin-template · chassis/errorHandler — the APP-layer global error sink.
 *
 * The last-resort catch for errors that nothing else handled, so a thrown render/lifecycle error or a
 * stray unhandled rejection surfaces as a user-visible "页面出错" toast instead of a SILENT white screen.
 * It lives in the APP layer (the 消费方/装配根) because it depends on element-plus for the toast and on
 * `app` for the Vue hook — the framework-neutral packages must never import a UI lib.
 *
 * What it installs (all via `installGlobalErrorHandler(app)`, called once from main.ts):
 *   1. `app.config.errorHandler`     — Vue render / lifecycle / watcher errors.
 *   2. `window 'unhandledrejection'` — a rejected promise with no `.catch`.
 *   3. `window 'error'`              — uncaught sync errors + RESOURCE load failures (logged only).
 *
 * DESIGN — do NOT double-handle 401: HTTP 401 is ALREADY handled by the HttpPort's `onUnauthorized` seam
 * (chassis/stores.ts → dispatch logout → session clears → nav guard bounces to /login). The rejection
 * handler SKIPS auth-shaped errors so there is exactly one user-facing reaction per failure.
 *
 * THROTTLE — coalesce to at most one toast per window so an error LOOP can't bury the UI in toasts.
 */
import { ElMessage } from 'element-plus';
import type { App } from 'vue';

const USER_MESSAGE = '页面出错，请稍后重试';
const THROTTLE_MS = 3000;
let lastToastAt = 0;

function notifyUserThrottled(message: string = USER_MESSAGE): void {
  const now = Date.now();
  if (now - lastToastAt < THROTTLE_MS) return;
  lastToastAt = now;
  try {
    ElMessage.error({ message, duration: 3000 });
  } catch {
    /* element not mounted / SSR — the console.error at the call site is the fallback record. */
  }
}

function isAuthError(reason: unknown): boolean {
  const status = (reason as { response?: { status?: unknown } } | undefined)?.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  return /unauthorized|401|403|登录|登入|token/i.test(msg);
}

/** Install the app-wide error sink on the given Vue app. Call once at boot (main.ts). */
export function installGlobalErrorHandler(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[admin] Vue error:', err, '\n  hook:', info);
    notifyUserThrottled();
  };

  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    console.error('[admin] Unhandled promise rejection:', reason);
    if (isAuthError(reason)) return; // handled by onUnauthorized→logout; no redundant toast.
    notifyUserThrottled();
  });

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
