import { describe, expect, it, vi } from 'vitest';

import { createServerEventSource } from '../src/serverEventSource';

describe('createServerEventSource (generalized)', () => {
  it('normalizes {kind} payloads and routes by server.<camelCase> type', () => {
    const routed: any[] = [];
    const src = createServerEventSource({
      routeTable: {
        'server.actorTeamState': (env) => routed.push(env),
      },
    });

    src.push({ kind: 'actor_team_state', data: 42 });
    expect(routed).toHaveLength(1);
    expect(routed[0].type).toBe('server.actorTeamState');
    expect(routed[0].payload.data).toBe(42);
    src.dispose();
  });

  it('drops unroutable + unnormalizable payloads', () => {
    const onDroppedPayload = vi.fn();
    const src = createServerEventSource({
      routeTable: { 'server.known': () => {} },
      onDroppedPayload,
    });

    src.push({ kind: 'unknown_kind' }); // normalizes but no route
    src.push({ no: 'kind' }); // fails normalize
    expect(onDroppedPayload).toHaveBeenCalledTimes(2);
    src.dispose();
  });

  it('invokes onStreamingEvent for streaming payloads via injected detector', () => {
    const onStreamingEvent = vi.fn();
    const src = createServerEventSource({
      routeTable: { 'server.cardViewEvent': () => {} },
      isStreamingPayload: (p) => p?.kind === 'card_view_event',
      onStreamingEvent,
    });
    src.push({ kind: 'card_view_event', frame: 1 });
    expect(onStreamingEvent).toHaveBeenCalledOnce();
    src.dispose();
  });

  it('connect() bridges an external (depa-style) stream into the intake', () => {
    const routed: any[] = [];
    const src = createServerEventSource({
      routeTable: { 'server.tick': (env) => routed.push(env.payload.n) },
    });

    // minimal xstream-like producer
    let listener: any = null;
    const fakeStream = {
      subscribe(o: any) {
        listener = o;
        return { unsubscribe() { listener = null; } };
      },
    };

    const stop = src.connect(fakeStream as any);
    listener.next({ kind: 'tick', n: 1 });
    listener.next({ kind: 'tick', n: 2 });
    expect(routed).toEqual([1, 2]);

    stop();
    expect(listener).toBeNull();
    src.dispose();
  });
});
