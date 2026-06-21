import {
  appEventToMessage,
  type AppEvent,
  type EffectHandler,
} from 'dg-cell-mvi-core';
import type { HalfcodeRuntimeObject } from 'dg-cell-mvi-halfcode-contract';

export type CallableEffectFeedbackMapper = (
  output: unknown,
) => AppEvent | AppEvent[] | void;

/**
 * Explicit bridge from a Scope callable effect to the dg-cell-mvi async
 * EffectRequest loop. Callable effects and MVI effect requests remain
 * different concepts; callers opt into this adapter at an integration edge.
 */
export function adaptCallableEffectToMviHandler<S = unknown>(
  runtime: HalfcodeRuntimeObject,
  effectName: string,
  mapFeedback: CallableEffectFeedbackMapper = () => undefined,
): EffectHandler<S> {
  return async (_mviRuntime, request) => {
    if (!runtime.callEffect) {
      throw new Error(`Runtime cannot call Scope effect "${effectName}".`);
    }
    const output = await runtime.callEffect(effectName, request.payload, undefined);
    return requireCanonicalEventFeedback(mapFeedback(output));
  };
}

function requireCanonicalEventFeedback(
  feedback: AppEvent | AppEvent[] | void,
): AppEvent | AppEvent[] | void {
  if (feedback === undefined) return undefined;
  const events = Array.isArray(feedback) ? feedback : [feedback];
  for (const event of events) {
    const type = isAppEvent(event) ? event.type : String(event);
    const message = isAppEvent(event) ? appEventToMessage(event) : undefined;
    if (!message) {
      throw new Error(
        `Callable effect feedback must be a canonical Event; received non-canonical AppEvent "${type}".`,
      );
    }
    if (message.kind !== 'event') {
      throw new Error(
        `Callable effect feedback must be a canonical Event; received Command "${message.type}".`,
      );
    }
  }
  return feedback;
}

function isAppEvent(value: unknown): value is AppEvent {
  return !!value &&
    typeof value === 'object' &&
    typeof (value as AppEvent).type === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'payload');
}
