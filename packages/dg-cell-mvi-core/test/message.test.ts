import { describe, expect, it } from 'vitest';
import {
  appEventMessageKind,
  appEventToMessage,
  appMessageToEvent,
  commandMessage,
  eventMessage,
  createEffectRunner,
} from '../src';

describe('kind-preserving Command/Event bridge', () => {
  it('preserves Command request and Event fact kinds through AppEvent transport', () => {
    const commandEvent = appMessageToEvent(commandMessage('users.query', { keyword: 'Ada' }, {
      payloadDef: 'vfs://./messages.ts#UsersQuery',
      policy: 'message.policies://#users-page',
    }));
    const factEvent = appMessageToEvent(eventMessage('users.queried', { total: 1 }, {
      payloadDef: 'vfs://./messages.ts#UsersQueried',
      policy: 'message.policies://#users-page',
    }));

    expect(commandEvent.type).toBe('command://#users.query');
    expect(factEvent.type).toBe('event://#users.queried');
    expect(appEventMessageKind(commandEvent)).toBe('command');
    expect(appEventMessageKind(factEvent)).toBe('event');
    expect(appEventToMessage(commandEvent)).toEqual({
      kind: 'command',
      type: 'users.query',
      payload: { keyword: 'Ada' },
      payloadDef: 'vfs://./messages.ts#UsersQuery',
      policy: 'message.policies://#users-page',
    });
    expect(appEventToMessage(factEvent)).toEqual({
      kind: 'event',
      type: 'users.queried',
      payload: { total: 1 },
      payloadDef: 'vfs://./messages.ts#UsersQueried',
      policy: 'message.policies://#users-page',
    });
  });

  it('keeps Event protocol identity when an effect feeds a fact back into dispatch', async () => {
    const dispatched: unknown[] = [];
    const runner = createEffectRunner({
      'users.query': async () => appMessageToEvent(eventMessage('users.queried', { total: 1 }, {
        payloadDef: 'vfs://./messages.ts#UsersQueried',
        policy: 'message.policies://#users-page',
      })),
    });

    await runner.runAll(
      { type: 'users.query', payload: {} },
      { dispatch: (event) => dispatched.push(appEventToMessage(event)) },
    );

    expect(dispatched).toEqual([{
      kind: 'event',
      type: 'users.queried',
      payload: { total: 1 },
      payloadDef: 'vfs://./messages.ts#UsersQueried',
      policy: 'message.policies://#users-page',
    }]);
  });

  it('does not guess a kind for unmarked legacy transport values', () => {
    expect(appEventToMessage({ type: 'users.query', payload: {} })).toBeUndefined();
  });

  it('rejects a descriptor that disagrees with the transport URI', () => {
    expect(appEventToMessage({
      type: 'command://#users.query',
      payload: {},
      message: { kind: 'event', id: 'users.query' },
    })).toBeUndefined();
  });
});
