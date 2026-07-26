import { describe, expect, it, vi } from 'vitest';

import {
  createStreamSignalStore,
  createStreamSignalStoreRuntime,
} from '../src/streamSignalStore';
import { createEffectRunner } from '../src/effectRunner';
import { watch } from '../src/index';
import type { AppEvent, ReduceResult } from '../src/contract';

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
  it('keeps ordered event history separate from the current state and viewModel projection', () => {
    const first = { type: 'counter.inc', payload: {} };
    const second = { type: 'counter.incBy', payload: { by: 5 } };
    const store = createStreamSignalStore<CounterState, string>({
      initialState: initial,
      reduce: counterReduce,
      project: (state) => `current:${state.count}`,
    });

    expect(store.eventLog.entries()).toEqual([]);
    expect(store.state()).toEqual(initial);
    expect(store.viewModel()).toBe('current:0');

    store.dispatch(first);
    store.dispatch(second);

    expect(store.eventLog.entries().map((entry) => entry.value)).toEqual([first, second]);
    expect(store.state()).toEqual({ count: 6, lastEffectAck: null });
    expect(store.viewModel()).toBe('current:6');

    store.dispose();
  });

  it('exposes only event history and graph observation from the ordinary store', () => {
    const store = createStreamSignalStore<CounterState, number>({
      initialState: initial,
      reduce: counterReduce,
      project: (state) => state.count,
    });

    expect(Object.keys(store.eventLog)).toEqual(['entries']);
    expect(Object.keys(store.graph).sort()).toEqual(['get', 'snapshot']);
    expect(store.graph.snapshot().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'events',
          kind: 'source',
          outputSemantic: 'stream',
        }),
        expect.objectContaining({
          id: 'state',
          kind: 'streamDrivenStateSignal',
          outputSemantic: 'signal',
          deps: ['events'],
        }),
        expect.objectContaining({
          id: 'viewModel',
          kind: 'computed',
          outputSemantic: 'signal',
          deps: ['state'],
        }),
        expect.objectContaining({
          id: 'effects',
          kind: 'sink',
          outputSemantic: 'stream',
          deps: ['events'],
        }),
      ]),
    );
    expect(store.graph.get<CounterState>('state')).toEqual(initial);
    expect(Reflect.get(store.eventLog, 'append')).toBeUndefined();
    expect(Reflect.get(store.eventLog, 'stream')).toBeUndefined();
    expect(Reflect.get(store.graph, 'set')).toBeUndefined();
    expect(Reflect.get(store.graph, 'addSignal')).toBeUndefined();
    expect(Reflect.get(store.graph, 'dispose')).toBeUndefined();

    store.dispose();
  });

  it('returns the store graph only through the explicit runtime-owner construction API', () => {
    const runtime = createStreamSignalStoreRuntime<CounterState, number>({
      initialState: initial,
      reduce: counterReduce,
      project: (state) => state.count,
    });

    expect(Reflect.get(runtime.store, 'graphOwner')).toBeUndefined();
    expect(runtime.store.graph).not.toBe(runtime.graphOwner.graph);
    expect(runtime.graphOwner.graph.get<CounterState>('state')).toEqual(runtime.store.state());

    runtime.graphOwner.graph.addSignal('compositionRootValue', 41);
    expect(runtime.store.graph.get<number>('compositionRootValue')).toBe(41);
    expect(runtime.store.graph.snapshot()).toEqual(runtime.graphOwner.graph.snapshot());

    runtime.store.dispatch({ type: 'counter.inc', payload: {} });
    expect(runtime.graphOwner.graph.get<number>('viewModel')).toBe(1);
    expect(runtime.store.viewModel()).toBe(1);

    runtime.store.dispose();
  });

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

  it('reduces each event-log entry exactly once, including effect feedback', async () => {
    const reduce = vi.fn((state: { phase: string }, event: AppEvent) => {
      if (event.type === 'work.start') {
        return {
          state: { phase: 'started' },
          effects: [{ type: 'work.finish', payload: {} }],
        };
      }
      if (event.type === 'work.finished') {
        return { state: { phase: 'finished' }, effects: [] };
      }
      return { state, effects: [] };
    });
    const finish = vi.fn(async () => ({ type: 'work.finished', payload: {} }));
    const runner = createEffectRunner<{ phase: string }>({ 'work.finish': finish });
    const store = createStreamSignalStore({
      initialState: { phase: 'idle' },
      reduce,
      runEffects: (requests, ctx) => runner.runAll(requests, ctx),
    });

    store.dispatch({ type: 'work.start', payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const eventTypes = store.eventLog.entries().map((entry) => entry.value.type);
    expect(eventTypes).toEqual(['work.start', 'work.finished']);
    expect(reduce).toHaveBeenCalledTimes(eventTypes.length);
    expect(reduce.mock.calls.map(([, event]) => event.type)).toEqual(eventTypes);
    expect(finish).toHaveBeenCalledOnce();
    expect(store.state()).toEqual({ phase: 'finished' });

    store.dispose();
  });

  it('starts a fresh feedback context when a feedback event object is publicly reused', () => {
    const feedbackEvent = { type: 'work.finished', payload: {} };
    const seenMeta: Array<{ depth: number; chain: string[] }> = [];
    const store = createStreamSignalStore({
      initialState: 0,
      reduce: (state, event) => ({
        state: state + 1,
        effects: event.type === 'work.start' ? [{ type: 'work.finish', payload: {} }] : [],
      }),
      runEffects: (requests, ctx) => {
        if (requests.length > 0) ctx.dispatch(feedbackEvent);
      },
      tap: {
        onEvent: (_event, _state, meta) => {
          seenMeta.push({ depth: meta.depth, chain: [...meta.chain] });
        },
      },
    });

    store.dispatch({ type: 'work.start', payload: {} });
    store.dispatch(feedbackEvent);

    expect(seenMeta).toEqual([
      { depth: 0, chain: ['work.start'] },
      { depth: 1, chain: ['work.start', 'work.finished'] },
      { depth: 0, chain: ['work.finished'] },
    ]);
    store.dispose();
  });

  it('guards against runaway feedback depth', async () => {
    const onError = vi.fn();
    const feedbackMeta: Array<{ depth: number; chain: string[] }> = [];
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
      tap: {
        onEvent: (_event, _state, meta) => feedbackMeta.push(meta),
      },
    });

    store.dispatch({ type: 'loop.tick', payload: {} });
    await new Promise((r) => setTimeout(r, 10));

    expect(store.eventLog.entries()).toHaveLength(6);
    expect(store.state()).toEqual({ n: 6 });
    expect(feedbackMeta.map((meta) => meta.depth)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(feedbackMeta.at(-1)?.chain).toEqual(Array(6).fill('loop.tick'));
    expect(onError).toHaveBeenCalledOnce();
    const msg = String((onError.mock.calls.find((c) => c[0] instanceof Error) || [])[0]);
    expect(msg).toContain('max feedback depth 5');
    store.dispose();
  });

  it('fires event/state/effect taps and isolates tap errors from the business path', () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const onState = vi.fn(() => {
      throw new Error('tap boom');
    });
    const onEffect = vi.fn();
    const runEffects = vi.fn();
    const store = createStreamSignalStore<{ count: number }>({
      initialState: { count: 0 },
      reduce: (state, event) =>
        event.type === 'counter.incAndPersist'
          ? {
              state: { count: state.count + 1 },
              effects: [{ type: 'counter.save', payload: { count: state.count + 1 } }],
            }
          : { state, effects: [] },
      runEffects,
      onError,
      tap: { onEvent, onState, onEffect },
    });

    store.dispatch({ type: 'counter.incAndPersist', payload: {} });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenCalledWith({ count: 1 }, { count: 0 });
    expect(onEffect).toHaveBeenCalledWith(
      [{ type: 'counter.save', payload: { count: 1 } }],
      { type: 'counter.incAndPersist', payload: {} },
    );
    expect(runEffects).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(store.state().count).toBe(1);
    store.dispose();
  });

  it('makes post-dispose dispatch a dropped no-op for history and current projection', () => {
    const dropped: AppEvent[] = [];
    const store = createStreamSignalStore<CounterState>({
      initialState: initial,
      reduce: counterReduce,
      onDroppedEvent: (e) => dropped.push(e),
    });

    store.dispatch({ type: 'counter.inc', payload: {} });
    expect(store.eventLog.entries().map((e) => e.value.type)).toEqual(['counter.inc']);

    store.dispose();
    const postDisposeEvent = { type: 'counter.inc', payload: {} };
    store.dispatch(postDisposeEvent);

    expect(dropped).toEqual([postDisposeEvent]);
    expect(store.eventLog.entries().map((e) => e.value.type)).toEqual(['counter.inc']);
    expect(store.state()).toEqual({ count: 1, lastEffectAck: null });
    expect(store.viewModel()).toEqual({ count: 1, lastEffectAck: null });
  });

  it('drops feedback from an in-flight effect that completes after dispose', async () => {
    let resolveEffect!: (event: AppEvent) => void;
    const effectResult = new Promise<AppEvent>((resolve) => {
      resolveEffect = resolve;
    });
    const dropped: AppEvent[] = [];
    const feedbackEvent = { type: 'work.finished', payload: {} };
    const runner = createEffectRunner<{ phase: string }>({
      'work.finish': async () => effectResult,
    });
    const store = createStreamSignalStore({
      initialState: { phase: 'idle' },
      reduce(state, event) {
        if (event.type === 'work.start') {
          return {
            state: { phase: 'started' },
            effects: [{ type: 'work.finish', payload: {} }],
          };
        }
        if (event.type === 'work.finished') {
          return { state: { phase: 'finished' }, effects: [] };
        }
        return { state, effects: [] };
      },
      project: (state) => state.phase,
      runEffects: (requests, ctx) => runner.runAll(requests, ctx),
      onDroppedEvent: (event) => dropped.push(event),
    });

    store.dispatch({ type: 'work.start', payload: {} });
    store.dispose();
    resolveEffect(feedbackEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dropped).toEqual([feedbackEvent]);
    expect(store.eventLog.entries().map((entry) => entry.value.type)).toEqual(['work.start']);
    expect(store.state()).toEqual({ phase: 'started' });
    expect(store.viewModel()).toBe('started');
  });

  it('reports an invalid reduction without terminating later event processing', () => {
    const onError = vi.fn();
    const invalidReduction = { count: 1 } as unknown as ReduceResult<CounterState>;
    const store = createStreamSignalStore<CounterState>({
      initialState: initial,
      reduce: (state, event) =>
        event.type === 'counter.invalid'
          ? invalidReduction
          : { state: { ...state, count: state.count + 1 }, effects: [] },
      onError,
    });
    store.dispatch({ type: 'counter.invalid', payload: {} });
    store.dispatch({ type: 'counter.inc', payload: {} });

    expect(onError).toHaveBeenCalledOnce();
    expect(store.eventLog.entries().map((entry) => entry.value.type)).toEqual([
      'counter.invalid',
      'counter.inc',
    ]);
    expect(store.state().count).toBe(1);

    store.dispose();
  });
});
