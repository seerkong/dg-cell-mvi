import { describe, expect, it, vi } from 'vitest';
import { createDocumentDisplayModeSession } from '../src';

const ref = { unitInstanceId: 'doc-1', projectionRole: 'component-embed', xId: 'counter-1' } as const;

describe('DocumentDisplayModeSession', () => {
  it('serializes base and occurrence transitions through one actor', async () => {
    const listener = vi.fn();
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'doc-1',
      initialBaseMode: 'edit',
      policy: {
        runtime: {},
        config: {},
        processor: (_runtime, input) => ({
          allowed: input.requestedMode === 'view' || input.target.kind === 'document',
          allowedModes: input.target.kind === 'document' ? ['view', 'edit'] : ['view'],
        }),
      },
      createLease: (_ref, generation) => `lease-${generation}`,
    });
    session.subscribe(listener);
    await session.refreshPolicy();
    const registered = await session.register(ref);
    expect(registered.lease).toBe('lease-1');
    expect((await session.dispatch({ type: 'set-overlay', correlationId: 'c1', ref, lease: 'lease-1', mode: 'view' })).ok).toBe(true);
    expect(session.snapshot().projections[1]).toMatchObject({ overlay: 'view', effectiveMode: 'view' });
    expect((await session.dispatch({ type: 'set-overlay', correlationId: 'c2', ref, lease: 'lease-1', mode: 'edit' })).diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_TRANSITION_DENIED');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('cleans occurrence overlays and rejects dispatch after destroy', async () => {
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'doc-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
      createLease: () => 'lease-1',
    });
    await session.refreshPolicy();
    await session.register(ref);
    await session.dispatch({ type: 'set-overlay', correlationId: 'c3', ref, lease: 'lease-1', mode: 'view' });
    expect((await session.unregister(ref, 'lease-1')).ok).toBe(true);
    expect(session.snapshot().state.occurrences).toEqual([]);
    session.destroy();
    expect((await session.dispatch({ type: 'set-base', correlationId: 'c4', mode: 'view' })).diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_SESSION_DESTROYED');
  });

  it('never reuses a lifecycle lease and evaluates the transitioned target once', async () => {
    let calls = 0;
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'doc-1',
      initialBaseMode: 'view',
      policy: {
        runtime: {},
        config: {},
        processor: async () => {
          calls += 1;
          return { allowed: true, allowedModes: ['view', 'edit'] };
        },
      },
      createLease: () => 'reused',
    });
    await session.refreshPolicy();
    const first = await session.register(ref);
    await session.unregister(ref, first.lease!);
    const second = await session.register(ref);
    expect(second.lease).not.toBe(first.lease);
    calls = 0;
    await session.dispatch({ type: 'set-overlay', correlationId: 'c5', ref, lease: second.lease!, mode: 'edit' });
    expect(calls).toBe(2); // occurrence transition + unchanged document projection
  });

  it('advances through repeated custom lease collisions without blocking the actor queue', async () => {
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'doc-1',
      initialBaseMode: 'view',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
      createLease: (_ref, generation) => (
        generation === 1 ? 'fixed'
          : generation === 2 ? 'fixed-4-1'
            : generation === 3 ? 'fixed-4-2'
              : 'fixed'
      ),
    });
    await session.refreshPolicy();
    for (let index = 0; index < 3; index += 1) {
      const registered = await session.register(ref);
      await session.unregister(ref, registered.lease!);
    }
    const fourth = await session.register(ref);
    expect(fourth.lease).toBe('fixed-4-3');
    const result = await session.dispatch({ type: 'set-overlay', correlationId: 'correlated', ref, lease: fourth.lease!, mode: 'edit' });
    expect(result.correlationId).toBe('correlated');
  });
});
