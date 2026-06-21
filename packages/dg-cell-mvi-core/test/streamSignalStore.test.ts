import { describe, expect, it, vi } from 'vitest';

import { createStreamSignalStore } from '../src/streamSignalStore';
import { createEffectRunner } from '../src/effectRunner';
import { watch } from '../src/index';
import type { AppEvent } from '../src/contract';

interface CounterState {
  count: number;
  lastEffectAck: string | null;
}

const initial: CounterState = { count: 0, lastEffectAck: null };

function counterReduce(state: CounterState, event: AppEvent) {
  switch (event.type) {
    case 'counter.inc':
      return { state: { ...state, count: state.count + 1 }, effects: [] };
    case 'counter.incBy':
      return {
        state: { ...state, count: state.count + Number((event.payload as any).by || 0) },
        effects: [],
      };
    case 'counter.persist':
      // emit an effect describing the side-effect
      return { state, effects: [{ type: 'counter.save', payload: { count: state.count } }] };
    case 'counter.acked':
      return { state: { ...state, lastEffectAck: String((event.payload as any).at) }, effects: [] };
    default:
      return { state, effects: [] };
  }
}

describe('createStreamSignalStore (on depa-data-graph)', () => {
  it('dispatch → reduce updates the state + projected viewModel', () => {
    const store = createStreamSignalStore<CounterState, { label: string }>({
      initialState: initial,
      reduce: counterReduce,
      project: (s) => ({ label: `count=${s.count}` }),
    });

    expect(store.state().count).toBe(0);
    expect(store.viewModel().label).toBe('count=0');

    store.dispatch({ type: 'counter.inc', payload: {} });
    store.dispatch({ type: 'counter.incBy', payload: { by: 5 } });

    expect(store.state().count).toBe(6);
    expect(store.viewModel().label).toBe('count=6');
    store.dispose();
  });

  it('notifies a depa watch subscriber when the viewModel changes', () => {
    const store = createStreamSignalStore<CounterState, number>({
      initialState: initial,
      reduce: counterReduce,
      project: (s) => s.count,
    });

    const seen: number[] = [];
    const stop = watch(() => store.viewModel(), (vm) => seen.push(vm), { immediate: true });

    store.dispatch({ type: 'counter.inc', payload: {} });
    store.dispatch({ type: 'counter.inc', payload: {} });

    expect(seen).toEqual([0, 1, 2]);
    stop();
    store.dispose();
  });

  it('runs effects and re-dispatches handler results (closed loop)', async () => {
    const runner = createEffectRunner<CounterState>({
      'counter.save': async (_rt, request) => {
        // simulate async IO returning an ack event (runtime-first: runtime, then request)
        return { type: 'counter.acked', payload: { at: `saved:${(request.payload as any).count}` } };
      },
    });

    const store = createStreamSignalStore<CounterState>({
      initialState: { count: 0, lastEffectAck: null },
      reduce: counterReduce,
      runEffects: (requests, ctx) => runner.runAll(requests, ctx),
    });

    store.dispatch({ type: 'counter.incBy', payload: { by: 3 } });
    store.dispatch({ type: 'counter.persist', payload: {} });

    // allow the async effect + feedback dispatch microtasks to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(store.state().lastEffectAck).toBe('saved:3');
    store.dispose();
  });

  it('guards against runaway feedback depth', async () => {
    const onError = vi.fn();
    // a handler that always re-dispatches an event that triggers itself again
    const runner = createEffectRunner({
      'loop.again': async () => ({ type: 'loop.tick', payload: {} }),
    });
    const store = createStreamSignalStore<{ n: number }>({
      initialState: { n: 0 },
      reduce: (state, event) => {
        if (event.type === 'loop.tick') {
          return { state: { n: state.n + 1 }, effects: [{ type: 'loop.again', payload: {} }] };
        }
        return { state, effects: [] };
      },
      runEffects: (requests, ctx) => runner.runAll(requests, ctx),
      maxFeedbackDepth: 5,
      onError,
    });

    store.dispatch({ type: 'loop.tick', payload: {} });
    await new Promise((r) => setTimeout(r, 10));

    expect(onError).toHaveBeenCalled();
    const msg = String((onError.mock.calls.find((c) => c[0] instanceof Error) || [])[0]);
    expect(msg).toContain('max feedback depth 5');
    store.dispose();
  });

  it('fires tap hooks and isolates tap errors via onError', () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const onState = vi.fn(() => {
      throw new Error('tap boom');
    });
    const store = createStreamSignalStore<CounterState>({
      initialState: initial,
      reduce: counterReduce,
      onError,
      tap: { onEvent, onState },
    });

    store.dispatch({ type: 'counter.inc', payload: {} });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce(); // tap error captured, business path intact
    expect(store.state().count).toBe(1);
    store.dispose();
  });

  it('drops events after dispose and records them on the event log before dispose', () => {
    const dropped: AppEvent[] = [];
    const store = createStreamSignalStore<CounterState>({
      initialState: initial,
      reduce: counterReduce,
      onDroppedEvent: (e) => dropped.push(e),
    });

    store.dispatch({ type: 'counter.inc', payload: {} });
    expect(store.eventLog.entries().map((e) => e.value.type)).toEqual(['counter.inc']);

    store.dispose();
    store.dispatch({ type: 'counter.inc', payload: {} });
    expect(dropped.map((e) => e.type)).toEqual(['counter.inc']);
  });

  it('reports an error when reduce returns a bare value', () => {
    const onError = vi.fn();
    const store = createStreamSignalStore<CounterState>({
      initialState: initial,
      // @ts-expect-error intentionally wrong return shape
      reduce: () => ({ count: 1 }),
      onError,
    });
    store.dispatch({ type: 'counter.inc', payload: {} });
    expect(onError).toHaveBeenCalledOnce();
    store.dispose();
  });
});
