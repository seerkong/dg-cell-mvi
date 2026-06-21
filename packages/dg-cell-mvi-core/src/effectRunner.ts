/**
 * Effect orchestration: runs effect requests through registered handlers and auto re-dispatches any
 * returned AppEvents — the standard
 * async result loop.
 */
import type { AppEvent, EffectRuntime, EffectHandler, EffectRequest } from './contract';

function normalizeFeedbackEvents(result: unknown): AppEvent[] {
  const candidates = Array.isArray(result) ? result : [result];
  return candidates.filter(
    (item): item is AppEvent =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as AppEvent).type === 'string' &&
      (item as AppEvent).type.trim().length > 0 &&
      Object.prototype.hasOwnProperty.call(item, 'payload'),
  );
}

export interface EffectRunner<S = unknown> {
  run(request: EffectRequest, context?: Partial<EffectRuntime<S>>): Promise<unknown>;
  runAll(requests?: EffectRequest[] | EffectRequest, context?: Partial<EffectRuntime<S>>): Promise<unknown[]>;
}

export function createEffectRunner<S = unknown>(
  handlers: Record<string, EffectHandler<S>> = {},
): EffectRunner<S> {
  async function run(request: EffectRequest, context: Partial<EffectRuntime<S>> = {}): Promise<unknown> {
    const type = String(request?.type || '').trim();
    if (!type) return null;
    const handler = handlers[type];
    if (typeof handler !== 'function') {
      throw new Error(`No effect handler registered for ${type}`);
    }
    return handler(context as EffectRuntime<S>, request);
  }

  async function runAll(
    requests: EffectRequest[] | EffectRequest = [],
    context: Partial<EffectRuntime<S>> = {},
  ): Promise<unknown[]> {
    const list = Array.isArray(requests) ? requests : [requests];
    const results: unknown[] = [];
    for (const request of list) {
      if (!request) continue;
      const result = await run(request, context);
      results.push(result);
      if (typeof context.dispatch === 'function') {
        for (const event of normalizeFeedbackEvents(result)) {
          context.dispatch(event);
        }
      }
    }
    return results;
  }

  return { run, runAll };
}
