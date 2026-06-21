import { describe, expect, it, vi } from 'vitest';
import type {
  SchemaEditorCommand,
  SchemaEditorCommandTemplate,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';

type Revision = string | number;

interface Snapshot<T extends SchemaEditorContractValue = SchemaEditorContractValue> {
  readonly value: T;
  readonly revision: Revision;
}

interface ApplyRequest {
  readonly command: SchemaEditorCommand;
  readonly expectedRevision: Revision;
}

interface Diagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

type ApplyResult<T extends SchemaEditorContractValue = SchemaEditorContractValue> =
  | { readonly status: 'accepted'; readonly baseRevision: Revision; readonly snapshot: Snapshot<T> }
  | { readonly status: 'rejected'; readonly baseRevision: Revision; readonly issues: readonly Diagnostic[] }
  | {
      readonly status: 'conflict';
      readonly baseRevision: Revision;
      readonly actualSnapshot?: Snapshot<T>;
      readonly issues?: readonly Diagnostic[];
    };

type ValueHost<T extends SchemaEditorContractValue = SchemaEditorContractValue> = (
  runtime: unknown,
  input: ApplyRequest,
  config: Readonly<Record<string, unknown>>,
) => ApplyResult<T> | Promise<ApplyResult<T>>;

interface SessionState<T extends SchemaEditorContractValue = SchemaEditorContractValue> {
  readonly sessionId: string;
  readonly snapshot: Snapshot<T>;
  readonly pending: readonly {
    readonly requestId: string;
    readonly expectedRevision: Revision;
  }[];
  readonly diagnostics: readonly Diagnostic[];
  readonly disposed: boolean;
}

interface SchemaEditorSession<T extends SchemaEditorContractValue = SchemaEditorContractValue> {
  getState(): SessionState<T>;
  subscribe(subscriber: (state: SessionState<T>) => void): () => void;
  dispatch(input: {
    readonly template: SchemaEditorCommandTemplate;
    readonly event: SchemaEditorContractValue;
    readonly wildcardBindings?: readonly (string | number)[];
  }): Promise<unknown>;
  dispose(): void;
}

type CreateSchemaEditorSession = <T extends SchemaEditorContractValue>(
  runtime: unknown,
  input: {
    readonly initialSnapshot: Snapshot<T>;
    readonly valueHost: ValueHost<T>;
  },
  config: {
    readonly sessionId: string;
    readonly valueHostId: string;
    readonly valueHostConfig?: Readonly<Record<string, unknown>>;
  },
) => SchemaEditorSession<T>;

const support = await import('../src') as unknown as Record<string, unknown>;
const createSchemaEditorSession =
  typeof support.createSchemaEditorSession === 'function'
    ? support.createSchemaEditorSession as CreateSchemaEditorSession
    : undefined;
const sessionApiAvailable = createSchemaEditorSession !== undefined;

const SET_NAME_TEMPLATE: SchemaEditorCommandTemplate = {
  kind: 'value.set',
  target: { source: 'literal', value: ['name'] },
  arguments: { value: { source: 'event', path: ['next'] } },
};

const HOST_CONFIG = Object.freeze({
  sessionId: 'profile-session',
  valueHostId: 'profile-host',
  valueHostConfig: Object.freeze({ tenant: 'test' }),
});

function createSession<T extends SchemaEditorContractValue>(
  initialSnapshot: Snapshot<T>,
  valueHost: ValueHost<T>,
  runtime: unknown = Object.freeze({ kind: 'test-runtime' }),
): SchemaEditorSession<T> {
  return createSchemaEditorSession!(runtime, { initialSnapshot, valueHost }, HOST_CONFIG);
}

function dispatchName(session: SchemaEditorSession, next: string): Promise<unknown> {
  return session.dispatch({ template: SET_NAME_TEMPLATE, event: { next } });
}

function accepted<T extends SchemaEditorContractValue>(
  baseRevision: Revision,
  revision: Revision,
  value: T,
): ApplyResult<T> {
  return { status: 'accepted', baseRevision, snapshot: { value, revision } };
}

function issue(code: string): Diagnostic {
  return { path: '$', code, message: code };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expectUnchanged(
  session: SchemaEditorSession,
  expected: Snapshot,
): void {
  expect(session.getState().snapshot).toEqual(expected);
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe('SchemaEditorSession T2.1 public surface', () => {
  it('exports a three-parameter createSchemaEditorSession Actor factory', () => {
    expect(
      support.createSchemaEditorSession,
      'support root must export createSchemaEditorSession before session behavior can run',
    ).toBeTypeOf('function');
    expect(support.createSchemaEditorSession).toHaveLength(3);
  });
});

describe.runIf(sessionApiAvailable)('SchemaEditorSession T2.1 red behavior', () => {
  it('clones the initial accepted snapshot and never mutates optimistically', async () => {
    const runtime = Object.freeze({ kind: 'session-runtime' });
    const initial: Snapshot<{ name: string; nested: { count: number } }> = {
      value: { name: 'Grace', nested: { count: 1 } },
      revision: 'rev-a',
    };
    const response = deferred<ApplyResult<typeof initial.value>>();
    const calls: Array<{ runtime: unknown; input: ApplyRequest; config: unknown }> = [];
    const host: ValueHost<typeof initial.value> = (hostRuntime, input, config) => {
      calls.push({ runtime: hostRuntime, input, config });
      return response.promise;
    };
    const session = createSession(initial, host, runtime);

    initial.value.nested.count = 9;
    expect(session.getState().snapshot).toEqual({
      value: { name: 'Grace', nested: { count: 1 } },
      revision: 'rev-a',
    });

    const completion = dispatchName(session, 'Ada');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      runtime,
      input: {
        command: { kind: 'value.set', target: ['name'], value: 'Ada' },
        expectedRevision: 'rev-a',
      },
      config: { tenant: 'test', sessionId: 'profile-session', valueHostId: 'profile-host' },
    });
    expect(calls[0].input).not.toHaveProperty('requestId');
    expectUnchanged(session, { value: { name: 'Grace', nested: { count: 1 } }, revision: 'rev-a' });
    expect(session.getState().pending).toHaveLength(1);

    response.resolve(accepted('rev-a', 'rev-b', { name: 'Ada', nested: { count: 1 } }));
    await completion;

    expect(session.getState().snapshot).toEqual({
      value: { name: 'Ada', nested: { count: 1 } },
      revision: 'rev-b',
    });
    expect(session.getState().pending).toEqual([]);
  });

  it.each([
    { current: 'z-token', next: 'a-token', label: 'opaque strings without sorting' },
    { current: 40, next: 100, label: 'finite numbers without increment assumptions' },
  ])('accepts $label when the base is strictly current and the revision strictly differs', async ({ current, next }) => {
    const session = createSession(
      { value: { name: 'before' }, revision: current },
      (_runtime, _request, _config) => accepted(current, next, { name: 'after' }),
    );

    await dispatchName(session, 'after');

    expect(session.getState().snapshot).toEqual({ value: { name: 'after' }, revision: next });
  });

  it.each([
    {
      name: 'coerced base revision',
      initial: { value: { name: 'before' }, revision: 1 },
      result: accepted('1', 2, { name: 'after' }),
    },
    {
      name: 'unchanged accepted revision',
      initial: { value: { name: 'before' }, revision: 'same' },
      result: accepted('same', 'same', { name: 'after' }),
    },
    {
      name: 'non-finite accepted revision',
      initial: { value: { name: 'before' }, revision: 1 },
      result: accepted(1, Number.POSITIVE_INFINITY, { name: 'after' }),
    },
  ])('does not advance for $name', async ({ initial, result }) => {
    const session = createSession(initial, () => result);

    await dispatchName(session, 'after');

    expectUnchanged(session, initial);
    expect(session.getState().diagnostics.length).toBeGreaterThan(0);
  });

  it.each([
    {
      name: 'rejected',
      result: { status: 'rejected', baseRevision: 'rev-1', issues: [issue('HOST_REJECTED')] },
    },
    {
      name: 'conflict',
      result: {
        status: 'conflict',
        baseRevision: 'rev-1',
        actualSnapshot: { value: { name: 'host' }, revision: 'rev-host' },
        issues: [issue('HOST_CONFLICT')],
      },
    },
    { name: 'malformed', result: { status: 'accepted', baseRevision: 'rev-1' } },
  ])('clears pending without advancing for a $name host result', async ({ result }) => {
    const initial = { value: { name: 'before' }, revision: 'rev-1' } as const;
    const session = createSession(initial, () => result as ApplyResult<typeof initial.value>);

    await dispatchName(session, 'after');

    expectUnchanged(session, initial);
    expect(session.getState().pending).toEqual([]);
    expect(session.getState().diagnostics.length).toBeGreaterThan(0);
  });

  it('turns a thrown or rejected host call into diagnostics and clears its pending request', async () => {
    const initial = { value: { name: 'before' }, revision: 'rev-1' } as const;
    const failures = [
      () => { throw new Error('sync host failure'); },
      () => Promise.reject(new Error('async host failure')),
    ];

    for (const failure of failures) {
      const session = createSession(initial, failure as ValueHost<typeof initial.value>);
      await dispatchName(session, 'after');
      expectUnchanged(session, initial);
      expect(session.getState().pending).toEqual([]);
      expect(session.getState().diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: expect.any(String), path: expect.any(String), message: expect.any(String) }),
        ]),
      );
    }
  });

  it('does not allocate pending work or call ValueHost when command resolution fails', async () => {
    const host = vi.fn((_runtime: unknown, _input: ApplyRequest, _config: Readonly<Record<string, unknown>>): ApplyResult => ({
      status: 'rejected',
      baseRevision: 'unused',
      issues: [issue('MUST_NOT_BE_CALLED')],
    }));
    const session = createSession({ value: { name: 'before' }, revision: 'rev-1' }, host);

    await session.dispatch({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'event', path: ['missing'] } },
      },
      event: {},
    });

    expect(host).not.toHaveBeenCalled();
    expect(session.getState().pending).toEqual([]);
    expect(session.getState().diagnostics.length).toBeGreaterThan(0);
  });

  it('uses unique session-local requestIds, cleans each item, and ignores out-of-order or duplicate acceptances', async () => {
    const responses = [deferred<ApplyResult>(), deferred<ApplyResult>(), deferred<ApplyResult>()];
    let call = 0;
    const session = createSession(
      { value: { name: 'initial' }, revision: 'rev-1' },
      () => responses[call++].promise,
    );

    const first = dispatchName(session, 'first');
    const second = dispatchName(session, 'second');
    const third = dispatchName(session, 'third');
    const pending = session.getState().pending;
    expect(pending).toHaveLength(3);
    expect(new Set(pending.map((item) => item.requestId)).size).toBe(3);
    expect(pending.map((item) => item.expectedRevision)).toEqual(['rev-1', 'rev-1', 'rev-1']);

    responses[1].resolve(accepted('rev-1', 'rev-2', { name: 'second' }));
    await second;
    expect(session.getState().snapshot).toEqual({ value: { name: 'second' }, revision: 'rev-2' });
    expect(session.getState().pending).toHaveLength(2);

    responses[0].resolve(accepted('rev-1', 'rev-3', { name: 'stale-first' }));
    await first;
    expect(session.getState().snapshot).toEqual({ value: { name: 'second' }, revision: 'rev-2' });
    expect(session.getState().pending).toHaveLength(1);

    responses[2].resolve(accepted('rev-1', 'rev-2', { name: 'duplicate-second' }));
    await third;
    expect(session.getState().snapshot).toEqual({ value: { name: 'second' }, revision: 'rev-2' });
    expect(session.getState().pending).toEqual([]);
  });

  it('publishes deeply immutable cloned state that cannot mutate session internals', async () => {
    const payloads: SessionState[] = [];
    const session = createSession(
      { value: { nested: { count: 1 } }, revision: 'rev-1' },
      () => accepted('rev-1', 'rev-2', { nested: { count: 2 } }),
    );
    const unsubscribe = session.subscribe((state) => payloads.push(state));

    await session.dispatch({ template: SET_NAME_TEMPLATE, event: { next: 'ignored' } });

    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) expectDeepFrozen(payload);
    const exposed = session.getState();
    expectDeepFrozen(exposed);
    expect(() => {
      (exposed.snapshot.value as { nested: { count: number } }).nested.count = 99;
    }).toThrow();
    expect((session.getState().snapshot.value as { nested: { count: number } }).nested.count).toBe(2);
    unsubscribe();
  });

  it('does not register a subscriber when its initial notification throws', async () => {
    const subscriber = vi.fn(() => {
      throw new Error('initial subscriber failure');
    });
    const session = createSession(
      { value: { name: 'before' }, revision: 'rev-1' },
      () => accepted('rev-1', 'rev-2', { name: 'after' }),
    );

    expect(() => session.subscribe(subscriber)).toThrow('initial subscriber failure');
    expect(subscriber).toHaveBeenCalledTimes(1);

    await dispatchName(session, 'after');

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(session.getState().snapshot).toEqual({ value: { name: 'after' }, revision: 'rev-2' });
  });

  it('isolates later subscriber failures and keeps unsubscribe idempotent', async () => {
    let initialNotification = true;
    const failingSubscriber = vi.fn(() => {
      if (!initialNotification) throw new Error('later subscriber failure');
      initialNotification = false;
    });
    const healthySubscriber = vi.fn();
    const session = createSession(
      { value: { name: 'before' }, revision: 'rev-1' },
      () => accepted('rev-1', 'rev-2', { name: 'after' }),
    );
    const unsubscribeFailing = session.subscribe(failingSubscriber);
    const unsubscribeHealthy = session.subscribe(healthySubscriber);

    await expect(dispatchName(session, 'after')).resolves.toBeUndefined();

    expect(failingSubscriber.mock.calls.length).toBeGreaterThan(1);
    expect(healthySubscriber.mock.lastCall?.[0].snapshot).toEqual({
      value: { name: 'after' },
      revision: 'rev-2',
    });
    unsubscribeFailing();
    unsubscribeFailing();
    unsubscribeHealthy();
    unsubscribeHealthy();
  });

  it('disposes idempotently, clears pending/subscribers, rejects future dispatch, and ignores late responses', async () => {
    const response = deferred<ApplyResult>();
    const subscriber = vi.fn();
    const session = createSession(
      { value: { name: 'before' }, revision: 'rev-1' },
      () => response.promise,
    );
    session.subscribe(subscriber);
    const inFlight = dispatchName(session, 'late');
    expect(session.getState().pending).toHaveLength(1);

    session.dispose();
    session.dispose();
    const callsAtDispose = subscriber.mock.calls.length;
    expect(session.getState()).toMatchObject({ disposed: true, pending: [] });
    await expect(dispatchName(session, 'future')).rejects.toThrow(/disposed/i);

    response.resolve(accepted('rev-1', 'rev-2', { name: 'late' }));
    await inFlight;

    expect(session.getState().snapshot).toEqual({ value: { name: 'before' }, revision: 'rev-1' });
    expect(subscriber).toHaveBeenCalledTimes(callsAtDispose);
  });
});
