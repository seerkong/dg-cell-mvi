import { describe, expect, it } from 'vitest';
import {
  adaptCallableEffectToMviHandler,
  createDefaultHalfcodeRuntime,
} from '../src';
import {
  appEventToMessage,
  appMessageToEvent,
  commandMessage,
  createEffectRunner,
  eventMessage,
} from 'dg-cell-mvi-core';

describe('adaptCallableEffectToMviHandler', () => {
  it('keeps callable effect invocation separate from MVI EffectRequest feedback', async () => {
    const runtime = createDefaultHalfcodeRuntime('scope', undefined, {
      effects: {
        'users.query': {
          id: 'users.query',
          kind: 'function',
          impl: async (_runtime, input) => ({ rows: [input] }),
        },
      },
    });
    const handler = adaptCallableEffectToMviHandler(
      runtime,
      'users.query',
      (output) => appMessageToEvent(eventMessage('users.queried', output as Record<string, unknown>, {
        payloadDef: 'event-def://#users.queried',
        policy: 'users-policy',
      })),
    );
    const dispatched: unknown[] = [];
    const runner = createEffectRunner({ 'users.query.request': handler });

    await runner.runAll({
      type: 'users.query.request',
      payload: { keyword: 'Ada' },
    }, {
      dispatch: (event) => dispatched.push(appEventToMessage(event)),
    });

    expect(dispatched).toEqual([{
      kind: 'event',
      type: 'users.queried',
      payload: { rows: [{ keyword: 'Ada' }] },
      payloadDef: 'event-def://#users.queried',
      policy: 'users-policy',
    }]);
  });

  it('rejects Command and non-canonical AppEvent feedback explicitly', async () => {
    const runtime = createDefaultHalfcodeRuntime('scope', undefined, {
      effects: {
        query: {
          id: 'query',
          kind: 'function',
          impl: async () => ({ total: 1 }),
        },
      },
    });
    const request = { type: 'query.request', payload: {} };
    const commandFeedback = adaptCallableEffectToMviHandler(
      runtime,
      'query',
      (output) => appMessageToEvent(commandMessage('query.completed', output as Record<string, unknown>)),
    );
    const rawFeedback = adaptCallableEffectToMviHandler(
      runtime,
      'query',
      () => ({ type: 'query.completed', payload: {} }),
    );

    await expect(commandFeedback({} as never, request)).rejects.toThrow(
      'Callable effect feedback must be a canonical Event; received Command "query.completed".',
    );
    await expect(rawFeedback({} as never, request)).rejects.toThrow(
      'Callable effect feedback must be a canonical Event; received non-canonical AppEvent "query.completed".',
    );
  });
});
