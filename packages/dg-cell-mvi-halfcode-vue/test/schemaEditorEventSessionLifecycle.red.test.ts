import { describe, expect, it, vi } from 'vitest';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  shallowReactive,
} from 'vue';
import type {
  EditorCommandBinding,
  EditorPlanNode,
  SchemaEditorCommandTemplate,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createSchemaEditorSession,
  type SchemaEditorApplyResult,
  type SchemaEditorSession,
  type SchemaEditorSessionDispatchInput,
  type SchemaEditorSessionState,
  type SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';
import {
  createSchemaEditorPresenterRegistry,
  dispatchSchemaEditorPresenterEvent,
  SchemaEditorSessionRenderer,
} from '../src';

type Revision = string | number;

type EventBridgeInput = Readonly<{
  node: EditorPlanNode;
  event: unknown;
  wildcardBindings?: readonly (string | number)[];
}>;

type EventBridgeResult = Readonly<{
  ok: boolean;
  diagnostics?: readonly { code: string; message: string }[];
}>;

const bridge = dispatchSchemaEditorPresenterEvent as unknown as (
  runtime: unknown,
  input: EventBridgeInput,
  config: Readonly<Record<string, never>>,
) => EventBridgeResult;

const valueTarget = (path: readonly (string | number)[]) => ({
  source: 'literal' as const,
  value: [...path],
});

const eventArg = (path: readonly (string | number)[]) => ({
  source: 'event' as const,
  path: [...path],
});

const templates: readonly EditorCommandBinding[] = [
  {
    event: 'item.insert',
    commandTemplate: {
      kind: 'collection.insert',
      target: valueTarget(['items']),
      arguments: { index: eventArg(['index']), value: eventArg(['value']) },
    },
  },
  {
    event: 'item.remove',
    commandTemplate: {
      kind: 'collection.remove',
      target: valueTarget(['items']),
      arguments: { index: eventArg(['index']) },
    },
  },
  {
    event: 'item.move',
    commandTemplate: {
      kind: 'collection.move',
      target: valueTarget(['items']),
      arguments: { from: eventArg(['fromIndex']), to: eventArg(['toIndex']) },
    },
  },
  {
    event: 'title.commit',
    commandTemplate: {
      kind: 'value.set',
      target: valueTarget(['title']),
      arguments: { value: eventArg(['value']) },
    },
  },
  {
    event: 'status.select',
    commandTemplate: {
      kind: 'union.select',
      target: valueTarget(['status']),
      arguments: { alternativeId: eventArg(['alternativeId']) },
    },
  },
  {
    event: 'metadata.set',
    commandTemplate: {
      kind: 'map.set',
      target: valueTarget(['metadata']),
      arguments: { key: eventArg(['key']), value: eventArg(['value']) },
    },
  },
  {
    event: 'metadata.remove',
    commandTemplate: {
      kind: 'map.remove',
      target: valueTarget(['metadata']),
      arguments: { key: eventArg(['key']) },
    },
  },
  {
    event: 'metadata.rename',
    commandTemplate: {
      kind: 'map.rename-key',
      target: valueTarget(['metadata']),
      arguments: { from: eventArg(['from']), to: eventArg(['to']) },
    },
  },
];

const node = {
  kind: 'field',
  id: 'editor.title',
  path: ['title'],
  metadata: {
    display: { label: 'Title', visible: true, readOnly: false },
    scalar: { kind: 'string' },
  },
  commandBindings: templates,
} as unknown as EditorPlanNode;

function fakeSession() {
  return { dispatch: vi.fn(), dispose: vi.fn(), subscribe: vi.fn(), getState: vi.fn() };
}

describe('Schema Editor P3 normalized event bridge RED contract', () => {
  it.each(templates)('dispatches exactly one plan-owned template for $event', ({ event, commandTemplate }) => {
    const session = fakeSession();
    const runtime = Object.freeze({ session });
    const result = bridge(runtime, {
      node,
      event: Object.freeze({ event, payload: { value: 'next', index: 1, fromIndex: 0, toIndex: 1, key: 'x', from: 'x', to: 'y', alternativeId: 'draft' } }),
      wildcardBindings: Object.freeze(['items', 2]),
    }, {});

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(session.dispatch).toHaveBeenCalledTimes(1);
    expect(session.dispatch).toHaveBeenCalledWith({
      template: commandTemplate,
      event: expect.objectContaining({ value: 'next' }),
      wildcardBindings: ['items', 2],
    });
  });

  it.each([
    { label: 'missing event', event: { payload: { value: 'x' } } },
    { label: 'scalar event', event: 'title.commit' },
    { label: 'accessor payload', event: Object.defineProperty({ event: 'title.commit' }, 'payload', { get: () => ({ value: 'x' }) }) },
    { label: 'unknown event', event: { event: 'not-a-binding', payload: {} } },
  ])('fails closed for $label without partial dispatch', ({ event }) => {
    const session = fakeSession();
    const result = bridge({ session }, { node, event }, {});

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.[0]?.code).toMatch(/SCHEMA_EDITOR/);
    expect(session.dispatch).not.toHaveBeenCalled();
  });

  it('rejects duplicate matching bindings atomically and forwards wildcard context only', () => {
    const session = fakeSession();
    const duplicateNode = { ...node, commandBindings: [...templates, templates[0]] } as unknown as EditorPlanNode;
    const result = bridge({ session }, {
      node: duplicateNode,
      event: { event: 'item.insert', payload: { index: 0, value: 'x' } },
      wildcardBindings: ['outer', 3],
    }, {});

    expect(result.ok).toBe(false);
    expect(session.dispatch).not.toHaveBeenCalled();
  });

  it('fails closed for runtime payloads, revoked inputs and disposed sessions', () => {
    const session = fakeSession();
    const runtimePayload = bridge({ session }, {
      node,
      event: { event: 'title.commit', payload: new Date(0) },
    }, {});
    expect(runtimePayload).toEqual(expect.objectContaining({ ok: false }));
    expect(session.dispatch).not.toHaveBeenCalled();

    let getterReads = 0;
    const accessorPayload = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'must-not-read';
      },
    });
    expect(bridge({ session }, {
      node,
      event: { event: 'title.commit', payload: accessorPayload },
    }, {})).toEqual(expect.objectContaining({ ok: false }));
    expect(getterReads).toBe(0);

    const revokedInput = Proxy.revocable({}, {});
    revokedInput.revoke();
    expect(() => bridge(
      { session },
      revokedInput.proxy as EventBridgeInput,
      {},
    )).not.toThrow();
    expect(bridge(
      { session },
      revokedInput.proxy as EventBridgeInput,
      {},
    )).toEqual(expect.objectContaining({ ok: false }));

    const disposed = fakeSession();
    disposed.getState.mockReturnValue({ disposed: true });
    expect(bridge({ session: disposed }, {
      node,
      event: { event: 'title.commit', payload: { value: 'ignored' } },
    }, {})).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'SCHEMA_EDITOR_SESSION_DISPOSED' }),
      ],
    });
    expect(disposed.dispatch).not.toHaveBeenCalled();
  });

  it('does not expose a direct ValueHost, concrete command or optimistic mutation escape hatch', () => {
    const session = fakeSession();
    const result = bridge({ session, valueHost: vi.fn(), command: { kind: 'value.set' } }, {
      node,
      event: { event: 'title.commit', payload: { value: 'next' } },
    }, {});

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(session.dispatch).toHaveBeenCalledTimes(1);
    expect(session.dispatch.mock.calls[0]?.[0]).not.toHaveProperty('command');
    expect(session.dispatch.mock.calls[0]?.[0]).not.toHaveProperty('value');
  });
});

describe('Schema Editor P3 accepted projection and lifecycle RED harness', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => { resolve = next; });
    return { promise, resolve };
  }

  function accepted<T extends SchemaEditorContractValue>(baseRevision: Revision, revision: Revision, value: T): SchemaEditorApplyResult<T> {
    return { status: 'accepted', baseRevision, snapshot: { value, revision } };
  }

  function makeSession<T extends SchemaEditorContractValue>(host: SchemaEditorValueHost<T>, initial = { value: { title: 'before' }, revision: 'r1' } as const): SchemaEditorSession<T> {
    return createSchemaEditorSession(Object.freeze({}), { initialSnapshot: initial as never, valueHost: host }, {
      sessionId: 'shared-schema-editor-session',
      valueHostId: 'schema-editor-host',
    });
  }

  function interactiveRegistry() {
    const component = defineComponent({
      name: 'InteractiveSchemaEditorProbe',
      inheritAttrs: false,
      setup(_props, context) {
        return () => h('button', {
          'data-value': String(context.attrs.value),
          'data-pending': String(context.attrs.pending),
          'data-diagnostics': String(
            (context.attrs.diagnostics as readonly unknown[] | undefined)?.length ?? 0,
          ),
          onClick: () => {
            const emit = context.attrs.onSchemaEditorEvent as
              | ((event: unknown) => void)
              | undefined;
            emit?.({ event: 'title.commit', payload: { value: 'accepted' } });
          },
        }, String(context.attrs.value));
      },
    });
    const result = createSchemaEditorPresenterRegistry(
      Object.freeze({}),
      {
        entries: [{
          id: 'probe.field',
          adapter: Object.freeze({ component }),
        }],
      },
      { duplicate: 'reject' },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.registry;
  }

  const interactiveNode = {
    ...node,
    presenter: { id: 'probe.field' },
  } as unknown as EditorPlanNode;

  function trackedSession<T extends SchemaEditorContractValue>(
    session: SchemaEditorSession<T>,
  ) {
    let activeSubscribers = 0;
    const dispose = vi.fn();
    const tracked: SchemaEditorSession<T> = Object.freeze({
      getState: () => session.getState(),
      subscribe(subscriber: (state: SchemaEditorSessionState<T>) => void) {
        activeSubscribers += 1;
        const stop = session.subscribe(subscriber);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          activeSubscribers -= 1;
          stop();
        };
      },
      dispatch: (input: SchemaEditorSessionDispatchInput) => session.dispatch(input),
      dispose,
    });
    return {
      session: tracked,
      dispose,
      activeSubscribers: () => activeSubscribers,
    };
  }

  it.each([
    { label: 'pending', result: undefined },
    { label: 'rejected', result: { status: 'rejected', baseRevision: 'r1', issues: [] } },
    { label: 'conflict', result: { status: 'conflict', baseRevision: 'r1', issues: [] } },
    { label: 'stale accept', result: accepted('r0', 'r2', { title: 'stale' }) },
  ])('keeps rendered values on the accepted snapshot during $label', async ({ result }) => {
    const hostResult = result as SchemaEditorApplyResult<{ title: string }> | undefined;
    const response = deferred<SchemaEditorApplyResult<{ title: string }>>();
    const session = makeSession(async (_runtime, _request) => hostResult === undefined ? response.promise : hostResult);
    const rendered: string[] = [];
    const unsubscribe = session.subscribe((state) => rendered.push((state.snapshot.value as { title: string }).title));
    const dispatch = session.dispatch({
      template: templates[3].commandTemplate,
      event: { value: 'optimistic' },
    });

    expect(session.getState().snapshot.value).toEqual({ title: 'before' });
    if (hostResult === undefined) response.resolve(accepted('r1', 'r2', { title: 'accepted' }));
    await dispatch;
    expect(session.getState().snapshot.value).toEqual(
      hostResult === undefined
        ? { title: 'accepted' }
        : hostResult.status === 'accepted' && hostResult.baseRevision === 'r1'
          ? hostResult.snapshot.value
          : { title: 'before' },
    );
    expect(rendered).not.toContain('optimistic');
    unsubscribe();
    session.dispose();
  });

  it('isolates late completion and never lets an unmounted shell dispose a shared session', async () => {
    const response = deferred<SchemaEditorApplyResult<{ title: string }>>();
    const session = makeSession(async () => response.promise);
    const subscriber = vi.fn();
    const unsubscribe = session.subscribe(subscriber);
    unsubscribe();
    const inFlight = session.dispatch({ template: templates[3].commandTemplate, event: { value: 'late' } });
    response.resolve(accepted('r1', 'r2', { title: 'late' }));
    await inFlight;

    expect(session.getState().snapshot.value).toEqual({ title: 'late' });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(session.getState().disposed).toBe(false);
    session.dispose();
  });

  it('requires replacement/remount to leave one active subscription and preserve the shared session', () => {
    const session = makeSession(() => ({ status: 'rejected', baseRevision: 'r1', issues: [] }));
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = session.subscribe(first);
    stopFirst();
    const stopSecond = session.subscribe(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(session.getState().disposed).toBe(false);
    stopSecond();
    session.dispose();
  });

  it('renders pending state without optimistic value and advances only after accepted publication', async () => {
    const response = deferred<SchemaEditorApplyResult<{ title: string }>>();
    const session = makeSession(async () => response.promise);
    const target = document.createElement('div');
    const app = createApp({
      render: () => h(SchemaEditorSessionRenderer, {
        session,
        node: interactiveNode,
        presenterRegistry: interactiveRegistry(),
        keyPrefix: 'interactive',
      }),
    });
    app.mount(target);

    const button = target.querySelector('button') as HTMLButtonElement;
    expect(button.dataset.value).toBe('before');
    button.click();
    await nextTick();
    expect(button.dataset.value).toBe('before');
    expect(button.dataset.pending).toBe('true');

    response.resolve(accepted('r1', 'r2', { title: 'accepted' }));
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    expect(button.dataset.value).toBe('accepted');
    expect(button.dataset.pending).toBe('false');

    app.unmount();
    expect(session.getState().disposed).toBe(false);
    session.dispose();
  });

  it('rebinds one subscription across replacement and only unsubscribes on unmount/remount', async () => {
    const firstOwner = makeSession(() => ({
      status: 'rejected',
      baseRevision: 'r1',
      issues: [],
    }));
    const secondOwner = makeSession(() => ({
      status: 'rejected',
      baseRevision: 'r1',
      issues: [],
    }));
    const first = trackedSession(firstOwner);
    const second = trackedSession(secondOwner);
    const shell = shallowReactive({
      session: first.session as SchemaEditorSession,
      node: interactiveNode,
      presenterRegistry: interactiveRegistry(),
    });
    const Root = defineComponent({
      setup() {
        return () => h(SchemaEditorSessionRenderer, {
          session: shell.session,
          node: shell.node,
          presenterRegistry: shell.presenterRegistry,
          keyPrefix: 'lifecycle',
        });
      },
    });
    const firstTarget = document.createElement('div');
    const firstApp = createApp(Root);
    firstApp.mount(firstTarget);
    expect(first.activeSubscribers()).toBe(1);
    expect(second.activeSubscribers()).toBe(0);

    shell.session = second.session;
    await nextTick();
    expect(first.activeSubscribers()).toBe(0);
    expect(second.activeSubscribers()).toBe(1);
    expect(first.dispose).not.toHaveBeenCalled();

    shell.node = { ...interactiveNode } as EditorPlanNode;
    shell.presenterRegistry = interactiveRegistry();
    await nextTick();
    expect(second.activeSubscribers()).toBe(1);

    firstApp.unmount();
    expect(second.activeSubscribers()).toBe(0);
    expect(second.dispose).not.toHaveBeenCalled();

    const remountTarget = document.createElement('div');
    const remount = createApp(Root);
    remount.mount(remountTarget);
    expect(second.activeSubscribers()).toBe(1);
    remount.unmount();
    expect(second.activeSubscribers()).toBe(0);
    expect(second.dispose).not.toHaveBeenCalled();

    firstOwner.dispose();
    secondOwner.dispose();
  });
});
