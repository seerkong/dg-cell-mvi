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

  it('buffers to one scheduled frame and routes the coalesced payload on drain', () => {
    const pendingFrame: { callback: (() => void) | null } = { callback: null };
    const scheduler = {
      schedule: vi.fn((callback: () => void) => {
        pendingFrame.callback = callback;
        return 'frame-1';
      }),
      cancel: vi.fn(),
    };
    const routed: number[] = [];
    const src = createServerEventSource({
      routeTable: { 'server.tick': (env) => routed.push(env.payload.n) },
      scheduler,
      advanceFrameBuffer: (queue, payload) => ({
        nextQueue: [...queue, payload],
        immediate: [],
      }),
      coalesce: (payloads) => [payloads.at(-1)],
    });

    src.push({ kind: 'tick', n: 1 });
    src.push({ kind: 'tick', n: 2 });

    expect(scheduler.schedule).toHaveBeenCalledOnce();
    expect(routed).toEqual([]);

    pendingFrame.callback?.();
    expect(routed).toEqual([2]);

    src.dispose();
  });

  it('dispose cancels pending intake, disconnects sources, and drops later pushes', () => {
    const pendingFrame: { callback: (() => void) | null } = { callback: null };
    const connection: {
      listener: { next: (value: unknown) => void } | null;
    } = { listener: null };
    const unsubscribe = vi.fn(() => {
      connection.listener = null;
    });
    const scheduler = {
      schedule: vi.fn((callback: () => void) => {
        pendingFrame.callback = callback;
        return 'pending-frame';
      }),
      cancel: vi.fn(),
    };
    const routed = vi.fn();
    const onDroppedPayload = vi.fn();
    const src = createServerEventSource({
      routeTable: { 'server.tick': routed },
      scheduler,
      advanceFrameBuffer: (queue, payload) => ({
        nextQueue: [...queue, payload],
        immediate: [],
      }),
      onDroppedPayload,
    });
    const stream = {
      subscribe(observer: { next: (value: unknown) => void }) {
        connection.listener = observer;
        return { unsubscribe };
      },
    };

    src.connect(stream);
    connection.listener?.next({ kind: 'tick', n: 1 });
    expect(scheduler.schedule).toHaveBeenCalledOnce();

    src.dispose();
    expect(scheduler.cancel).toHaveBeenCalledWith('pending-frame');
    expect(unsubscribe).toHaveBeenCalledOnce();

    pendingFrame.callback?.();
    src.push({ kind: 'tick', n: 2 });
    expect(routed).not.toHaveBeenCalled();
    expect(onDroppedPayload).toHaveBeenCalledWith({ kind: 'tick', n: 2 });
  });
});
