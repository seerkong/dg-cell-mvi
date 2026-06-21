import { describe, expect, it, vi } from 'vitest';

import { createEffectRunner } from '../src/effectRunner';
import type { AppEvent, EffectRequest } from '../src/contract';

describe('createEffectRunner', () => {
  it('routes a request to its registered handler (runtime-first: runtime @ [0], request @ [1])', async () => {
    const handler = vi.fn(async (_rt: unknown, _req: EffectRequest) => undefined);
    const runner = createEffectRunner({ 'x.do': handler });
    await runner.run({ type: 'x.do', payload: { a: 1 } });
    expect(handler).toHaveBeenCalledOnce();
    // runtime-first signature: the request now arrives at calls[0][1], runtime at calls[0][0].
    expect(handler.mock.calls[0][1]).toEqual({ type: 'x.do', payload: { a: 1 } });
  });

  it('throws for an unregistered effect type', async () => {
    const runner = createEffectRunner({});
    await expect(runner.run({ type: 'missing.effect', payload: {} })).rejects.toThrow(
      'No effect handler registered for missing.effect',
    );
  });

  it('runAll re-dispatches normalized feedback events and skips non-events', async () => {
    const dispatched: AppEvent[] = [];
    const runner = createEffectRunner({
      'e.one': async () => ({ type: 'fb.one', payload: {} }),
      'e.many': async () => [
        { type: 'fb.a', payload: {} },
        null as unknown as AppEvent, // dropped at runtime — deliberately invalid to test the safety net
        { type: '', payload: {} }, // dropped (empty type)
        { type: 'fb.b', payload: {} },
      ],
      'e.void': async () => undefined, // nothing to dispatch
    });

    await runner.runAll(
      [
        { type: 'e.one', payload: {} },
        { type: 'e.many', payload: {} },
        { type: 'e.void', payload: {} },
      ],
      { dispatch: (e) => dispatched.push(e) },
    );

    expect(dispatched.map((e) => e.type)).toEqual(['fb.one', 'fb.a', 'fb.b']);
  });
});
