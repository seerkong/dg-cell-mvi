import { describe, expect, it, vi } from 'vitest';
import {
  type XnlAuthoringAcceptedSnapshot,
  type XnlAuthoringCandidateValidationResult,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringDryRunResult,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringOpenedSession,
  type XnlAuthoringPersistenceReadResult,
  type XnlAuthoringPersistenceReceipt,
  type XnlAuthoringPersistenceResult,
  type XnlAuthoringPersistedRevision,
  type XnlAuthoringProposal,
  type XnlAuthoringReadInput,
  type XnlAuthoringRuntime,
  type XnlAuthoringSessionFactoryPort,
  type XnlAuthoringSessionState,
  type XnlAuthoringSubmitResult,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringSessionFactory,
  createXnlAuthoringViewScopeFacet,
} from '../src';

interface DocumentNode {
  readonly tag: string;
  readonly attributes: {
    readonly '#id': string;
    readonly title: string;
  };
  readonly children: readonly DocumentNode[];
}

type Command =
  | {
      readonly type: 'document.rename-title';
      readonly targetId: string;
      readonly title: string;
    }
  | {
      readonly type: 'document.noop';
      readonly targetId: string;
    };

type Mutation = {
  readonly kind: 'set-title';
  readonly path: readonly (string | number)[];
  readonly value: string;
};

type CallName =
  | 'read'
  | 'materialize'
  | 'diff'
  | 'dryRun'
  | 'validate'
  | 'nextLiveRevision'
  | 'publish'
  | 'persist'
  | 'state';

interface RuntimeCall {
  readonly name: CallName;
  readonly proposalId?: string;
  readonly status?: string;
  readonly liveRevision?: XnlAuthoringLiveRevision;
  readonly expectedPersistedRevision?: XnlAuthoringPersistedRevision;
  readonly persistedRevision?: XnlAuthoringPersistedRevision;
  readonly documentTitle?: string;
  readonly affectedIdentities?: readonly string[];
  readonly readInput?: XnlAuthoringReadInput;
}

interface Deferred<T> {
  readonly kind: 'deferred';
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

type Queued<T> = T | Deferred<T>;

interface RuntimeBehavior {
  readonly readResults?: readonly Queued<XnlAuthoringPersistenceReadResult<DocumentNode>>[];
  readonly persistResults?: readonly Queued<XnlAuthoringPersistenceResult>[];
  readonly liveRevisions?: readonly Queued<XnlAuthoringLiveRevision>[];
  readonly materializeResults?: readonly Queued<DocumentNode>[];
  readonly diffResults?: readonly Queued<readonly Mutation[]>[];
  readonly dryRunResults?: readonly Queued<XnlAuthoringDryRunResult<DocumentNode>>[];
  readonly validationResults?: readonly Queued<XnlAuthoringCandidateValidationResult>[];
  readonly materializeThrows?: Error;
  readonly diffThrows?: Error;
  readonly dryRunThrows?: Error;
  readonly validateThrows?: Error;
  readonly nextLiveRevisionThrows?: Error;
  readonly nextLiveRevisionThrowsAfterOpen?: Error;
  readonly publishThrows?: Error;
  readonly publishThrowsOnce?: readonly Error[];
  readonly publishResults?: readonly Queued<void>[];
  readonly persistThrows?: Error;
  readonly onPersist?: (call: RuntimeCall) => void;
}

interface OpenedFixture {
  readonly opened: XnlAuthoringOpenedSession<DocumentNode, Command>;
  readonly runtime: XnlAuthoringRuntime<DocumentNode, Command, Mutation>;
  readonly calls: RuntimeCall[];
}

interface NoAdvanceCase {
  readonly name: string;
  readonly behavior: RuntimeBehavior;
  readonly stale?: boolean;
  readonly submit: XnlAuthoringSubmitResult<DocumentNode>['status'];
}

interface ThrowBeforeAcceptanceCase {
  readonly name: string;
  readonly behavior: RuntimeBehavior;
}

const INITIAL_TITLE = 'Persisted architecture';
const RENAMED_TITLE = 'Accepted architecture';
const RELOADED_TITLE = 'Reloaded persisted architecture';
const CONFIG = Object.freeze({ policy: Object.freeze({ conflict: 'reject' }) });
const NO_ADVANCE_CASES: readonly NoAdvanceCase[] = [
  {
    name: 'coordinator unchanged',
    behavior: { diffResults: [[]] },
    submit: 'unchanged',
  },
  {
    name: 'coordinator rejected',
    behavior: {
      dryRunResults: [{
        status: 'rejected',
        diagnostics: [diagnostic('TEST_DRY_RUN_REJECTED')],
      }],
    },
    submit: 'rejected',
  },
  {
    name: 'stale base conflict',
    stale: true,
    behavior: {},
    submit: 'conflict',
  },
  {
    name: 'coordinator failed',
    behavior: { materializeThrows: new Error('candidate capability failed') },
    submit: 'failed',
  },
];
const THROW_BEFORE_ACCEPTANCE_CASES: readonly ThrowBeforeAcceptanceCase[] = [
  { name: 'materialize', behavior: { materializeThrows: new Error('materialize exploded') } },
  { name: 'diff', behavior: { diffThrows: new Error('diff exploded') } },
  { name: 'dryRun', behavior: { dryRunThrows: new Error('dryRun exploded') } },
  { name: 'validate', behavior: { validateThrows: new Error('validate exploded') } },
  { name: 'revision', behavior: { nextLiveRevisionThrowsAfterOpen: new Error('revision exploded') } },
];

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { kind: 'deferred', promise, resolve, reject };
}

function isDeferred<T>(value: Queued<T>): value is Deferred<T> {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'deferred';
}

function nextQueued<T>(queue: Queued<T>[], fallback: T): T | Promise<T> {
  const value = queue.shift() ?? fallback;
  return isDeferred(value) ? value.promise : value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function document(title: string): DocumentNode {
  return deepFreeze({
    tag: 'Document',
    attributes: {
      '#id': 'document:architecture',
      title,
    },
    children: [{
      tag: 'Section',
      attributes: {
        '#id': 'section:overview',
        title: 'Overview',
      },
      children: [],
    }],
  });
}

function liveRevision(value: string, sessionId = 'session:document'): XnlAuthoringLiveRevision {
  return Object.freeze({
    kind: 'xnl-authoring-live-revision',
    sessionId,
    value,
  });
}

function persistedRevision(value: string, authorityId = 'authority:memory'): XnlAuthoringPersistedRevision {
  return Object.freeze({
    kind: 'xnl-authoring-persisted-revision',
    authorityId,
    value,
  });
}

function receipt(
  previousRevision: XnlAuthoringPersistedRevision,
  currentRevision: XnlAuthoringPersistedRevision,
): XnlAuthoringPersistenceReceipt {
  return deepFreeze({
    kind: 'xnl-authoring-persistence-receipt',
    previousRevision,
    currentRevision,
    persistedAt: '2026-07-31T20:37:17Z',
    durability: 'memory',
  });
}

function acceptedSnapshot(
  doc = document(INITIAL_TITLE),
  revision = liveRevision('live:1'),
): XnlAuthoringAcceptedSnapshot<DocumentNode> {
  return deepFreeze({
    kind: 'xnl-authoring-accepted-snapshot',
    document: doc,
    liveRevision: revision,
  });
}

function loaded(
  doc = document(INITIAL_TITLE),
  revision = persistedRevision('vfs:10'),
): XnlAuthoringPersistenceReadResult<DocumentNode> {
  return deepFreeze({
    status: 'loaded',
    document: doc,
    persistedRevision: revision,
  });
}

function applied(
  previousRevision = persistedRevision('vfs:10'),
  currentRevision = persistedRevision('vfs:11'),
): XnlAuthoringPersistenceResult {
  return deepFreeze({
    status: 'applied',
    persistedRevision: currentRevision,
    receipt: receipt(previousRevision, currentRevision),
  });
}

function unchanged(revision = persistedRevision('vfs:10')): XnlAuthoringPersistenceResult {
  return deepFreeze({
    status: 'unchanged',
    persistedRevision: revision,
  });
}

function persistenceFailed(revision = persistedRevision('vfs:10')): XnlAuthoringPersistenceResult {
  return deepFreeze({
    status: 'failed',
    expectedPersistedRevision: revision,
    diagnostics: [diagnostic('TEST_PERSIST_FAILED')],
  });
}

function persistenceConflict(
  expectedPersistedRevision = persistedRevision('vfs:10'),
  actualPersistedRevision = persistedRevision('vfs:12'),
): XnlAuthoringPersistenceResult {
  return deepFreeze({
    status: 'conflict',
    expectedPersistedRevision,
    actualPersistedRevision,
    diagnostics: [diagnostic('TEST_PERSIST_CONFLICT')],
  });
}

function diagnostic(code: string): XnlAuthoringDiagnostic {
  return Object.freeze({
    severity: 'error',
    code,
    message: code,
  });
}

function mutation(title = RENAMED_TITLE): Mutation {
  return deepFreeze({
    kind: 'set-title',
    path: ['attributes', 'title'],
    value: title,
  });
}

function proposal(
  id: string,
  baseLiveRevision: XnlAuthoringLiveRevision,
  title = RENAMED_TITLE,
): XnlAuthoringProposal<Command> {
  return deepFreeze({
    kind: 'xnl-authoring-proposal',
    id,
    baseLiveRevision,
    command: {
      type: 'document.rename-title',
      targetId: 'document:architecture',
      title,
    },
    source: {
      occurrenceId: 'occurrence:editor',
      xId: 'title-editor',
    },
  });
}

function createRuntime(behavior: RuntimeBehavior = {}): {
  readonly runtime: XnlAuthoringRuntime<DocumentNode, Command, Mutation>;
  readonly calls: RuntimeCall[];
} {
  const calls: RuntimeCall[] = [];
  const reads = [...(behavior.readResults ?? [loaded()])];
  const persists = [...(behavior.persistResults ?? [applied()])];
  const liveRevisions = [...(behavior.liveRevisions ?? [
    liveRevision('live:1'),
    liveRevision('live:2'),
    liveRevision('live:3'),
    liveRevision('live:4'),
  ])];
  const materialized = [...(behavior.materializeResults ?? [document(RENAMED_TITLE)])];
  const diffs = [...(behavior.diffResults ?? [[mutation()]])];
  const dryRuns = [...(behavior.dryRunResults ?? [{
    status: 'applied',
    document: document(RENAMED_TITLE),
    affectedIdentities: ['document:architecture'],
  }])];
  const validations = [...(behavior.validationResults ?? [{ status: 'valid' }])];
  const publishThrowsOnce = [...(behavior.publishThrowsOnce ?? [])];
  const publishes = [...(behavior.publishResults ?? [])];

  const runtime: XnlAuthoringRuntime<DocumentNode, Command, Mutation> = {
    domain: {
      materializeCandidate: async (_runtime, input) => {
        calls.push({ name: 'materialize', proposalId: input.proposal.id });
        if (behavior.materializeThrows) throw behavior.materializeThrows;
        return await nextQueued(materialized, document(RENAMED_TITLE));
      },
      validateCandidate: async (_runtime, input) => {
        calls.push({ name: 'validate', proposalId: input.proposal.id });
        if (behavior.validateThrows) throw behavior.validateThrows;
        return await nextQueued(validations, { status: 'valid' });
      },
    },
    mutations: {
      diff: async (_runtime, input) => {
        calls.push({
          name: 'diff',
          documentTitle: input.candidateDocument.attributes.title,
        });
        if (behavior.diffThrows) throw behavior.diffThrows;
        return await nextQueued(diffs, [mutation()]);
      },
      dryRun: async (_runtime, input) => {
        calls.push({
          name: 'dryRun',
          documentTitle: input.acceptedDocument.attributes.title,
        });
        if (behavior.dryRunThrows) throw behavior.dryRunThrows;
        return await nextQueued(dryRuns, {
          status: 'applied',
          document: document(RENAMED_TITLE),
          affectedIdentities: ['document:architecture'],
        });
      },
    },
    persistence: {
      read: async (_runtime, input) => {
        calls.push({
          name: 'read',
          readInput: input,
          documentTitle: typeof input.source?.uri === 'string' ? input.source.uri : undefined,
        });
        return await nextQueued(reads, loaded());
      },
      persist: async (_runtime, input) => {
        const call: RuntimeCall = {
          name: 'persist',
          expectedPersistedRevision: input.expectedPersistedRevision,
          liveRevision: input.liveRevision,
          documentTitle: input.document.attributes.title,
        };
        calls.push(call);
        behavior.onPersist?.(call);
        if (behavior.persistThrows) throw behavior.persistThrows;
        return await nextQueued(persists, applied(input.expectedPersistedRevision));
      },
    },
    revision: {
      nextLiveRevision: async (_runtime, input) => {
        calls.push({ name: 'nextLiveRevision', liveRevision: input.current });
        if (behavior.nextLiveRevisionThrows) throw behavior.nextLiveRevisionThrows;
        if (input.current !== undefined && behavior.nextLiveRevisionThrowsAfterOpen) {
          throw behavior.nextLiveRevisionThrowsAfterOpen;
        }
        return await nextQueued(liveRevisions, liveRevision('live:fallback'));
      },
    },
    invalidation: {
      publish: async (_runtime, input) => {
        calls.push({
          name: 'publish',
          liveRevision: input.liveRevision,
          affectedIdentities: input.affectedIdentities,
        });
        const nextPublishThrow = publishThrowsOnce.shift();
        if (nextPublishThrow) throw nextPublishThrow;
        if (behavior.publishThrows) throw behavior.publishThrows;
        await nextQueued(publishes, undefined);
      },
    },
  };

  return { runtime, calls };
}

async function openFixture(behavior: RuntimeBehavior = {}): Promise<OpenedFixture> {
  const { runtime, calls } = createRuntime(behavior);
  const factory: XnlAuthoringSessionFactoryPort<DocumentNode, Command, Mutation> =
    createXnlAuthoringSessionFactory();
  const opened = await factory.open(runtime, {
    id: 'session:document',
    source: { uri: 'vfs://@/documents/architecture.xnl' },
  }, {});
  return { opened, runtime, calls };
}

function trackStates(
  opened: XnlAuthoringOpenedSession<DocumentNode, Command>,
  calls: RuntimeCall[],
): {
  readonly states: XnlAuthoringSessionState<DocumentNode>[];
  readonly unsubscribe: () => void;
} {
  const states: XnlAuthoringSessionState<DocumentNode>[] = [];
  const unsubscribe = opened.proposal.subscribe((state) => {
    expectDeepFrozen(state);
    states.push(state);
    calls.push({
      name: 'state',
      status: state.status,
      liveRevision: state.accepted.liveRevision,
      persistedRevision: state.persistedRevision,
      documentTitle: state.accepted.document.attributes.title,
    });
  });
  return { states, unsubscribe };
}

function callNames(calls: readonly RuntimeCall[]): readonly CallName[] {
  return calls.map((call) => call.name);
}

function callsNamed(calls: readonly RuntimeCall[], name: CallName): readonly RuntimeCall[] {
  return calls.filter((call) => call.name === name);
}

function expectState(
  state: XnlAuthoringSessionState<DocumentNode>,
  expected: {
    readonly status: XnlAuthoringSessionState<DocumentNode>['status'];
    readonly liveValue: string;
    readonly persistedValue?: string;
    readonly title: string;
  },
): void {
  expect(state).toMatchObject({
    kind: 'xnl-authoring-session-state',
    status: expected.status,
    accepted: {
      liveRevision: { value: expected.liveValue },
      document: { attributes: { title: expected.title } },
    },
  });
  if (expected.persistedValue === undefined) {
    expect(state).not.toHaveProperty('persistedRevision');
  } else {
    expect(state.persistedRevision).toMatchObject({ value: expected.persistedValue });
  }
}

describe('xnl authoring owner session red public surface', () => {
  it('exports a support owner-session factory whose open processor is runtime/input/config', () => {
    expect(createXnlAuthoringSessionFactory).toBeTypeOf('function');
    const factory: XnlAuthoringSessionFactoryPort<DocumentNode, Command, Mutation> =
      createXnlAuthoringSessionFactory();
    expect(factory.open).toBeTypeOf('function');
    expect(factory.open).toHaveLength(3);
  });
});

describe('xnl authoring owner session red state machine', () => {
  it('validates dynamic open facts before calling persistence or revision capabilities', async () => {
    const factory: XnlAuthoringSessionFactoryPort<DocumentNode, Command, Mutation> =
      createXnlAuthoringSessionFactory();
    const invalidCases = [
      {
        input: { id: 'session:runtime', runtime: {} },
        config: {},
        error: /XNL authoring open input failed validation:/,
      },
      {
        input: {
          id: 'session:writer',
          source: { uri: 'vfs:\/\/@\/documents\/architecture.xnl', writer: { write: () => undefined } },
        },
        config: {},
        error: /XNL authoring open input failed validation:/,
      },
      {
        input: { id: 'session:config' },
        config: { persistenceClient: { persist: () => Promise.resolve() } },
        error: /XNL authoring open config failed validation:/,
      },
    ] as const;

    for (const invalid of invalidCases) {
      const { runtime, calls } = createRuntime();
      await expect(factory.open(
        runtime,
        invalid.input as never,
        invalid.config as never,
      )).rejects.toThrow(invalid.error);
      expect(calls).toEqual([]);
    }
  });

  it('validates dynamic submit facts before evaluating state or candidate capabilities', async () => {
    const { opened, calls } = await openFixture();
    calls.splice(0);
    const { states } = trackStates(opened, calls);
    const validProposal = proposal(
      'proposal:dynamic-validation',
      opened.proposal.state().accepted.liveRevision,
    );
    const invalidCases = [
      {
        proposal: { ...validProposal, writer: { write: () => undefined } },
        config: CONFIG,
        code: 'XNL_AUTHORING_INVALID_PROPOSAL',
      },
      {
        proposal: validProposal,
        config: { ...CONFIG, persistenceClient: { persist: () => Promise.resolve() } },
        code: 'XNL_AUTHORING_INVALID_SUBMIT_CONFIG',
      },
    ] as const;

    for (const invalid of invalidCases) {
      await expect(opened.proposal.submit(
        invalid.proposal as never,
        invalid.config as never,
      )).resolves.toMatchObject({
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: invalid.code })],
      });
      expect(calls).toEqual([]);
      expect(states).toEqual([]);
      expect(opened.proposal.state().status).toBe('ready');
    }
  });

  it('captures open source as a frozen serializable fact for reload and omits source when absent', async () => {
    const source = {
      uri: 'vfs://@/documents/architecture.xnl',
      labels: ['architecture'],
      nested: { revision: 1 },
    };
    const withSource = createRuntime({
      persistResults: [persistenceFailed()],
      readResults: [
        loaded(document(INITIAL_TITLE), persistedRevision('vfs:10')),
        loaded(document(RELOADED_TITLE), persistedRevision('vfs:12')),
      ],
    });
    const factory: XnlAuthoringSessionFactoryPort<DocumentNode, Command, Mutation> =
      createXnlAuthoringSessionFactory();
    const opened = await factory.open(withSource.runtime, {
      id: 'session:document',
      source,
    }, {});
    const openRead = callsNamed(withSource.calls, 'read')[0].readInput;
    expect(openRead).toHaveProperty('source');
    expect(openRead?.source).toEqual({
      uri: 'vfs://@/documents/architecture.xnl',
      labels: ['architecture'],
      nested: { revision: 1 },
    });
    expectDeepFrozen(openRead?.source);

    source.uri = 'vfs://@/documents/mutated-after-open.xnl';
    source.labels.push('mutated');
    source.nested.revision = 2;

    await opened.proposal.submit(
      proposal('proposal:dirty-before-source-reload', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const dirty = opened.proposal.state().accepted.liveRevision;
    await expect(opened.control.reloadDiscardingAccepted({ expectedLiveRevision: dirty }))
      .resolves.toMatchObject({ status: 'reloaded' });

    const reloadRead = callsNamed(withSource.calls, 'read')[1].readInput;
    expect(reloadRead?.source).toBe(openRead?.source);
    expect(reloadRead?.source).toEqual({
      uri: 'vfs://@/documents/architecture.xnl',
      labels: ['architecture'],
      nested: { revision: 1 },
    });
    expect(callsNamed(withSource.calls, 'read').map((call) => call.documentTitle)).toEqual([
      'vfs://@/documents/architecture.xnl',
      'vfs://@/documents/architecture.xnl',
    ]);

    const withoutSource = createRuntime();
    await factory.open(withoutSource.runtime, { id: 'session:document' }, {});
    const absentSourceRead = callsNamed(withoutSource.calls, 'read')[0].readInput;
    expect(absentSourceRead).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(absentSourceRead ?? {}, 'source')).toBe(false);
  });

  it('captures the complete open input before the first read await', async () => {
    const readGate = deferred<XnlAuthoringPersistenceReadResult<DocumentNode>>();
    const { runtime, calls } = createRuntime({ readResults: [readGate] });
    const factory = createXnlAuthoringSessionFactory<DocumentNode, Command, Mutation>();
    const input = {
      id: 'session:document',
      source: { uri: 'vfs://@/documents/original.xnl', nested: { revision: 1 } },
    };
    const config = {};
    const opening = factory.open(runtime, input, config);

    input.id = 'session:mutated';
    input.source.uri = 'vfs://@/documents/mutated.xnl';
    input.source.nested.revision = 2;
    Object.assign(config, { writer: {} });
    readGate.resolve(loaded());

    const opened = await opening;
    expect(callsNamed(calls, 'read')[0].readInput).toEqual({
      source: { uri: 'vfs://@/documents/original.xnl', nested: { revision: 1 } },
    });
    expect(opened.proposal.state().accepted.liveRevision.sessionId).toBe('session:document');
  });

  it('opens from injected persistence, allocates owner-local live revision, splits proposal/control facets, and freezes state', async () => {
    const { opened, calls } = await openFixture();

    expect(callNames(calls)).toEqual(['read', 'nextLiveRevision']);
    expect(Object.keys(opened.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);
    expect(Object.keys(opened.control).sort()).toEqual([
      'dispose',
      'reloadDiscardingAccepted',
      'retryPersistence',
    ]);
    expect(opened.proposal).not.toHaveProperty('retryPersistence');
    expect(opened.proposal).not.toHaveProperty('reloadDiscardingAccepted');
    expect(opened.proposal).not.toHaveProperty('dispose');
    expect(opened.control).not.toHaveProperty('submit');

    const editScope = createXnlAuthoringEditScopeFacet(opened.proposal);
    const viewScope = createXnlAuthoringViewScopeFacet();
    expect(Object.keys(editScope).sort()).toEqual(['mode', 'proposal']);
    expect(Object.keys(editScope.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);
    expect(Object.keys(viewScope)).toEqual(['mode']);
    expect(viewScope).not.toHaveProperty('proposal');
    expect(viewScope).not.toHaveProperty('submit');

    const state = opened.proposal.state();
    expectState(state, {
      status: 'ready',
      liveValue: 'live:1',
      persistedValue: 'vfs:10',
      title: INITIAL_TITLE,
    });
    expect(state).not.toHaveProperty('persistenceReceipt');
    expectDeepFrozen(state);
    expect(() => Object.defineProperty(state.accepted.document.attributes, 'title', {
      value: 'mutated through published state',
    })).toThrow();
    expect(opened.proposal.state().accepted.document.attributes.title).toBe(INITIAL_TITLE);
  });

  it('serializes concurrent submissions so only the first same-base proposal is accepted and the later one is stale without materializing', async () => {
    const persistGate = deferred<XnlAuthoringPersistenceResult>();
    const persistStarted = deferred<void>();
    const { opened, calls } = await openFixture({
      persistResults: [persistGate],
      materializeResults: [document('First accepted'), document('Second must not materialize')],
      dryRunResults: [{
        status: 'applied',
        document: document('First accepted'),
        affectedIdentities: ['document:architecture'],
      }],
      onPersist: () => persistStarted.resolve(),
    });
    const base = opened.proposal.state().accepted.liveRevision;

    const first = opened.proposal.submit(proposal('proposal:first', base, 'First accepted'), CONFIG);
    const second = opened.proposal.submit(proposal('proposal:second', base, 'Second rejected stale'), CONFIG);

    await persistStarted.promise;
    expect(callsNamed(calls, 'materialize')).toHaveLength(1);
    persistGate.resolve(applied());

    await expect(first).resolves.toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'applied', persistedRevision: { value: 'vfs:11' } },
    });
    await expect(second).resolves.toMatchObject({
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: base,
      actualLiveRevision: { value: 'live:2' },
    });
    expect(callsNamed(calls, 'materialize').map((call) => call.proposalId)).toEqual(['proposal:first']);
    expect(opened.proposal.state().accepted.document.attributes.title).toBe('First accepted');
  });

  it('captures proposal and config before enqueue so later caller mutation cannot change submitted facts', async () => {
    const persistGate = deferred<XnlAuthoringPersistenceResult>();
    const persistStarted = deferred<void>();
    const { opened, calls } = await openFixture({
      persistResults: [persistGate],
      materializeResults: [document('First accepted'), document('Must not materialize')],
      dryRunResults: [{
        status: 'applied',
        document: document('First accepted'),
        affectedIdentities: ['document:architecture'],
      }],
      onPersist: () => persistStarted.resolve(),
    });
    const base = opened.proposal.state().accepted.liveRevision;
    const first = opened.proposal.submit(proposal('proposal:first-capture', base, 'First accepted'), CONFIG);
    const mutableProposal = structuredClone(proposal('proposal:captured', base, 'Original title')) as {
      id: string;
      baseLiveRevision: XnlAuthoringLiveRevision;
      command: { title: string };
    };
    const mutableConfig: {
      policy: { conflict: 'reject'; diagnostics: 'collect' | 'fail-fast' };
    } = { policy: { conflict: 'reject', diagnostics: 'collect' } };
    const second = opened.proposal.submit(mutableProposal as never, mutableConfig);

    mutableProposal.id = 'proposal:mutated';
    mutableProposal.baseLiveRevision = liveRevision('live:2');
    mutableProposal.command.title = 'Mutated after enqueue';
    mutableConfig.policy.diagnostics = 'fail-fast';

    await persistStarted.promise;
    persistGate.resolve(applied());
    await expect(first).resolves.toMatchObject({ status: 'accepted' });
    await expect(second).resolves.toMatchObject({
      status: 'conflict',
      expectedLiveRevision: base,
      actualLiveRevision: { value: 'live:2' },
    });
    expect(callsNamed(calls, 'materialize').map((call) => call.proposalId))
      .toEqual(['proposal:first-capture']);
  });

  it('publishes accepted-persisting before persistence settles, invalidates exactly once, then records applied receipt separately', async () => {
    const persistGate = deferred<XnlAuthoringPersistenceResult>();
    const persistStarted = deferred<void>();
    const { opened, calls } = await openFixture({
      persistResults: [persistGate],
      onPersist: () => persistStarted.resolve(),
    });
    const { states } = trackStates(opened, calls);
    const base = opened.proposal.state().accepted.liveRevision;

    const completion = opened.proposal.submit(proposal('proposal:accept', base), CONFIG);
    await persistStarted.promise;

    expect(states).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'accepted-persisting',
        accepted: expect.objectContaining({
          liveRevision: expect.objectContaining({ value: 'live:2' }),
        }),
        persistedRevision: expect.objectContaining({ value: 'vfs:10' }),
      }),
    ]));
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(callNames(calls).indexOf('state')).toBeLessThan(callNames(calls).indexOf('publish'));
    expect(callNames(calls).indexOf('publish')).toBeLessThan(callNames(calls).indexOf('persist'));

    const nextPersisted = persistedRevision('vfs:11');
    persistGate.resolve(applied(persistedRevision('vfs:10'), nextPersisted));

    await expect(completion).resolves.toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: {
        status: 'applied',
        persistedRevision: nextPersisted,
        receipt: {
          previousRevision: { value: 'vfs:10' },
          currentRevision: nextPersisted,
        },
      },
    });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:2',
      persistedValue: 'vfs:11',
      title: RENAMED_TITLE,
    });
    expect(opened.proposal.state().persistenceReceipt).toMatchObject({
      currentRevision: { value: 'vfs:11' },
    });
  });

  it('maps unchanged persistence to ready without fabricating a receipt and keeps live/persisted revisions independent', async () => {
    const { opened } = await openFixture({ persistResults: [unchanged(persistedRevision('vfs:10'))] });
    const base = opened.proposal.state().accepted.liveRevision;

    const result = await opened.proposal.submit(proposal('proposal:unchanged-persist', base), CONFIG);

    expect(result).toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'unchanged', persistedRevision: { value: 'vfs:10' } },
    });
    if (result.status === 'accepted') expect(result.persistence).not.toHaveProperty('receipt');
    expect(opened.proposal.state()).not.toHaveProperty('persistenceReceipt');
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
  });

  it('isolates listener exceptions from owner state transitions and submit results', async () => {
    const { opened } = await openFixture();
    opened.proposal.subscribe(() => {
      throw new Error('listener should not break owner');
    });

    const result = await opened.proposal.submit(
      proposal('proposal:listener-throws', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );

    expectDeepFrozen(result);
    expect(result).toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'applied' },
    });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:2',
      persistedValue: 'vfs:11',
      title: RENAMED_TITLE,
    });
  });

  it.each(NO_ADVANCE_CASES)('does not advance live/persisted state, publish, or persist for $name', async ({ behavior, stale, submit }) => {
    const { opened, calls } = await openFixture(behavior);
    const current = opened.proposal.state().accepted.liveRevision;
    const base = stale ? liveRevision(current.value, 'session:foreign') : current;

    const result = await opened.proposal.submit(proposal(`proposal:${submit}`, base), CONFIG);

    expect(result).toMatchObject({ status: submit });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:1',
      persistedValue: 'vfs:10',
      title: INITIAL_TITLE,
    });
    expect(callsNamed(calls, 'publish')).toEqual([]);
    expect(callsNamed(calls, 'persist')).toEqual([]);
    expect(callsNamed(calls, 'nextLiveRevision')).toHaveLength(1);
  });

  it('keeps accepted live fact dirty on persist failure, blocks new edits, and retries only current accepted snapshot', async () => {
    const { opened, calls } = await openFixture({
      persistResults: [persistenceFailed(), applied(persistedRevision('vfs:10'), persistedRevision('vfs:11'))],
    });
    const base = opened.proposal.state().accepted.liveRevision;

    const failedPersist = await opened.proposal.submit(proposal('proposal:dirty', base), CONFIG);

    expect(failedPersist).toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'failed', expectedPersistedRevision: { value: 'vfs:10' } },
    });
    expectState(opened.proposal.state(), {
      status: 'dirty-failed',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
    expect(opened.proposal.state()).not.toHaveProperty('persistenceReceipt');

    const blocked = await opened.proposal.submit(
      proposal('proposal:block-while-dirty', opened.proposal.state().accepted.liveRevision, 'Blocked'),
      CONFIG,
    );
    expect(blocked).toMatchObject({ status: 'failed' });
    expect(callsNamed(calls, 'materialize')).toHaveLength(1);

    const beforeRetry = callNames(calls);
    const retry = await opened.control.retryPersistence({
      expectedLiveRevision: opened.proposal.state().accepted.liveRevision,
    });
    expect(retry).toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'applied', persistedRevision: { value: 'vfs:11' } },
    });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:2',
      persistedValue: 'vfs:11',
      title: RENAMED_TITLE,
    });
    expect(callNames(calls).slice(beforeRetry.length)).toEqual(['persist']);
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(callsNamed(calls, 'nextLiveRevision')).toHaveLength(2);
  });

  it('retryPersistence conflicts on expected live revision mismatch without re-running coordinator or persisting', async () => {
    const { opened, calls } = await openFixture({
      persistResults: [persistenceFailed(), applied(persistedRevision('vfs:10'), persistedRevision('vfs:11'))],
    });
    const base = opened.proposal.state().accepted.liveRevision;

    await opened.proposal.submit(proposal('proposal:dirty-before-mismatch-retry', base), CONFIG);
    const dirty = opened.proposal.state().accepted.liveRevision;
    const callsBeforeRetry = calls.length;

    await expect(opened.control.retryPersistence({
      expectedLiveRevision: liveRevision(dirty.value, 'session:foreign'),
    })).resolves.toMatchObject({
      status: 'conflict',
      reason: 'stale-live-revision',
      actualLiveRevision: dirty,
    });
    expect(calls.slice(callsBeforeRetry)).toEqual([]);
    expect(opened.proposal.state()).toMatchObject({
      status: 'dirty-failed',
      accepted: { liveRevision: dirty },
      persistedRevision: { value: 'vfs:10' },
    });
  });

  it('recovers a publish failure only by republishing the accepted invalidation before persistence', async () => {
    const { opened, calls } = await openFixture({
      publishThrowsOnce: [new Error('first invalidation lost')],
      persistResults: [applied(persistedRevision('vfs:10'), persistedRevision('vfs:11'))],
    });
    const base = opened.proposal.state().accepted.liveRevision;

    await expect(opened.proposal.submit(
      proposal('proposal:publish-fails-first', base),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'failed',
      liveRevision: { value: 'live:2' },
    });
    expect(opened.proposal.state()).toMatchObject({
      status: 'dirty-failed',
      accepted: { liveRevision: { value: 'live:2' } },
      persistedRevision: { value: 'vfs:10' },
    });
    expect(callsNamed(calls, 'persist')).toHaveLength(0);

    const beforeRetry = callNames(calls);
    await expect(opened.control.retryPersistence({
      expectedLiveRevision: opened.proposal.state().accepted.liveRevision,
    })).resolves.toMatchObject({
      status: 'accepted',
      persistence: { status: 'applied', persistedRevision: { value: 'vfs:11' } },
    });
    expect(callNames(calls).slice(beforeRetry.length)).toEqual(['publish', 'persist']);
    expect(opened.proposal.state()).toMatchObject({
      status: 'ready',
      persistedRevision: { value: 'vfs:11' },
    });
  });

  it('fails closed when runtime allocates a foreign live revision for an accepted candidate', async () => {
    const { opened, calls } = await openFixture({
      liveRevisions: [
        liveRevision('live:1'),
        liveRevision('live:2', 'session:foreign'),
      ],
    });

    await expect(opened.proposal.submit(
      proposal('proposal:foreign-live-revision', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    )).resolves.toMatchObject({ status: 'failed' });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:1',
      persistedValue: 'vfs:10',
      title: INITIAL_TITLE,
    });
    expect(callsNamed(calls, 'publish')).toEqual([]);
    expect(callsNamed(calls, 'persist')).toEqual([]);
  });

  it('rejects a historically issued live revision on submit and keeps the old base permanently stale', async () => {
    const { opened, calls } = await openFixture({
      liveRevisions: [
        liveRevision('live:1'),
        liveRevision('live:2'),
        liveRevision('live:1'),
      ],
      persistResults: [
        applied(persistedRevision('vfs:10'), persistedRevision('vfs:11')),
      ],
    });
    const historicalBase = opened.proposal.state().accepted.liveRevision;

    await expect(opened.proposal.submit(
      proposal('proposal:advance-before-submit-reuse', historicalBase),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
    });
    const current = opened.proposal.state().accepted.liveRevision;
    const callsBeforeReuse = calls.length;

    await expect(opened.proposal.submit(
      proposal('proposal:reuse-live-1', current, 'Must not be accepted'),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'failed',
      liveRevision: current,
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_REVISION_FAILED' })],
    });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:2',
      persistedValue: 'vfs:11',
      title: RENAMED_TITLE,
    });
    expect(callNames(calls).slice(callsBeforeReuse)).toEqual([
      'materialize',
      'diff',
      'dryRun',
      'validate',
      'nextLiveRevision',
    ]);
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(callsNamed(calls, 'persist')).toHaveLength(1);

    const callsBeforeHistoricalBase = calls.length;
    await expect(opened.proposal.submit(
      proposal('proposal:historical-live-1-remains-stale', historicalBase),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: historicalBase,
      actualLiveRevision: current,
    });
    expect(callNames(calls).slice(callsBeforeHistoricalBase)).toEqual([]);
    expect(opened.proposal.state().accepted.liveRevision).toEqual(current);
  });

  it.each([
    ['a foreign authority', persistedRevision('vfs:10', 'authority:foreign')],
    ['a same-authority different revision value', persistedRevision('vfs:11')],
  ] as const)('keeps accepted fact dirty-failed when unchanged persistence reports %s', async (_name, returnedRevision) => {
    const { opened } = await openFixture({
      persistResults: [unchanged(returnedRevision)],
    });

    const result = await opened.proposal.submit(
      proposal('proposal:incoherent-unchanged-persistence', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );

    expect(result).toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: {
        status: 'failed',
        expectedPersistedRevision: { authorityId: 'authority:memory', value: 'vfs:10' },
        diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_INCOHERENT_PERSISTENCE_RESULT' })],
      },
    });
    if (result.status === 'accepted') expect(result.persistence).not.toHaveProperty('receipt');
    expect(opened.proposal.state()).not.toHaveProperty('persistenceReceipt');
    expectState(opened.proposal.state(), {
      status: 'dirty-failed',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
  });

  it('keeps actual persisted revision visible on persistence conflict and blocks new edits until explicit recovery', async () => {
    const actual = persistedRevision('vfs:12');
    const { opened, calls } = await openFixture({
      persistResults: [persistenceConflict(persistedRevision('vfs:10'), actual)],
    });

    const result = await opened.proposal.submit(
      proposal('proposal:conflicted', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );

    expect(result).toMatchObject({
      status: 'accepted',
      persistence: {
        status: 'conflict',
        actualPersistedRevision: actual,
      },
    });
    expect(opened.proposal.state()).toMatchObject({
      status: 'persistence-conflicted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistedRevision: { value: 'vfs:10' },
      actualPersistedRevision: actual,
    });
    const blocked = await opened.proposal.submit(
      proposal('proposal:block-while-conflicted', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    expect(blocked).toMatchObject({ status: 'failed' });
    expect(callsNamed(calls, 'materialize')).toHaveLength(1);
    expect(callsNamed(calls, 'persist')).toHaveLength(1);
  });

  it('rejects retryPersistence from persistence-conflicted without publish, persist, read, or state mutation', async () => {
    const actual = persistedRevision('vfs:12');
    const { opened, calls } = await openFixture({
      persistResults: [persistenceConflict(persistedRevision('vfs:10'), actual)],
    });

    await opened.proposal.submit(
      proposal('proposal:conflicted-before-retry', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const conflictedState = opened.proposal.state();
    const callsBeforeRetry = calls.length;

    await expect(opened.control.retryPersistence({
      expectedLiveRevision: conflictedState.accepted.liveRevision,
    })).resolves.toMatchObject({
      status: 'failed',
      liveRevision: conflictedState.accepted.liveRevision,
      diagnostics: [expect.objectContaining({
        code: 'XNL_AUTHORING_PERSISTENCE_CONFLICT_RETRY_FORBIDDEN',
      })],
    });
    expect(calls.slice(callsBeforeRetry)).toEqual([]);
    expect(opened.proposal.state()).toEqual(conflictedState);
  });

  it('fails closed when reload reads a foreign persistence authority and preserves conflicted state', async () => {
    const actual = persistedRevision('vfs:12');
    const { opened, calls } = await openFixture({
      persistResults: [persistenceConflict(persistedRevision('vfs:10'), actual)],
      readResults: [
        loaded(document(INITIAL_TITLE), persistedRevision('vfs:10')),
        loaded(document(RELOADED_TITLE), persistedRevision('vfs:50', 'authority:foreign')),
      ],
    });

    await opened.proposal.submit(
      proposal('proposal:conflicted-before-foreign-reload', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const conflictedState = opened.proposal.state();
    const callsBeforeReload = calls.length;

    await expect(opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: conflictedState.accepted.liveRevision,
    })).resolves.toMatchObject({
      status: 'failed',
      liveRevision: conflictedState.accepted.liveRevision,
      diagnostics: [expect.objectContaining({
        code: 'XNL_AUTHORING_RELOAD_FOREIGN_AUTHORITY',
      })],
    });
    expect(opened.proposal.state()).toEqual(conflictedState);
    expect(callNames(calls).slice(callsBeforeReload)).toEqual(['read']);
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(callsNamed(calls, 'persist')).toHaveLength(1);
    expect(callsNamed(calls, 'nextLiveRevision')).toHaveLength(2);
  });

  it('reloadDiscardingAccepted requires the expected live revision, reads persisted state only on match, replaces accepted without rebase, and invalidates once', async () => {
    const { opened, calls } = await openFixture({
      persistResults: [persistenceFailed()],
      readResults: [
        loaded(document(INITIAL_TITLE), persistedRevision('vfs:10')),
        loaded(document(RELOADED_TITLE), persistedRevision('vfs:12')),
      ],
    });
    await opened.proposal.submit(
      proposal('proposal:dirty-before-reload', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const dirtyLiveRevision = opened.proposal.state().accepted.liveRevision;
    const readCountBeforeMismatch = callsNamed(calls, 'read').length;

    await expect(opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: liveRevision(dirtyLiveRevision.value, 'session:foreign'),
    })).resolves.toMatchObject({
      status: 'conflict',
      actualLiveRevision: dirtyLiveRevision,
    });
    expect(callsNamed(calls, 'read')).toHaveLength(readCountBeforeMismatch);
    expect(opened.proposal.state().accepted.liveRevision).toBe(dirtyLiveRevision);

    const reloaded = await opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: dirtyLiveRevision,
    });

    expect(reloaded).toMatchObject({
      status: 'reloaded',
      discardedLiveRevision: dirtyLiveRevision,
      accepted: {
        liveRevision: { value: 'live:3' },
        document: { attributes: { title: RELOADED_TITLE } },
      },
      persistedRevision: { value: 'vfs:12' },
    });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:3',
      persistedValue: 'vfs:12',
      title: RELOADED_TITLE,
    });
    expect(callsNamed(calls, 'publish')).toHaveLength(2);
    expect(callsNamed(calls, 'materialize')).toHaveLength(1);
    expect(callsNamed(calls, 'read')).toHaveLength(2);
  });

  it('rejects a historically issued live revision on reload without discarding the current accepted fact', async () => {
    const { opened, calls } = await openFixture({
      liveRevisions: [
        liveRevision('live:1'),
        liveRevision('live:2'),
        liveRevision('live:1'),
      ],
      persistResults: [
        persistenceFailed(),
        applied(persistedRevision('vfs:10'), persistedRevision('vfs:12')),
      ],
      readResults: [
        loaded(document(INITIAL_TITLE), persistedRevision('vfs:10')),
        loaded(document(RELOADED_TITLE), persistedRevision('vfs:12')),
      ],
    });
    const historicalBase = opened.proposal.state().accepted.liveRevision;
    await opened.proposal.submit(
      proposal('proposal:dirty-before-reload-reuse', historicalBase),
      CONFIG,
    );
    const current = opened.proposal.state().accepted.liveRevision;
    const callsBeforeReload = calls.length;

    await expect(opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: current,
    })).resolves.toMatchObject({
      status: 'failed',
      liveRevision: current,
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_RELOAD_REVISION_FAILED' })],
    });
    expectState(opened.proposal.state(), {
      status: 'dirty-failed',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
    expect(callNames(calls).slice(callsBeforeReload)).toEqual(['read', 'nextLiveRevision']);
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(callsNamed(calls, 'persist')).toHaveLength(1);

    await expect(opened.control.retryPersistence({
      expectedLiveRevision: current,
    })).resolves.toMatchObject({ status: 'accepted' });
    const callsBeforeHistoricalBase = calls.length;
    await expect(opened.proposal.submit(
      proposal('proposal:historical-live-1-stale-after-reload', historicalBase),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: historicalBase,
      actualLiveRevision: current,
    });
    expect(callNames(calls).slice(callsBeforeHistoricalBase)).toEqual([]);
    expect(opened.proposal.state().accepted.liveRevision).toEqual(current);
  });

  it('disposes fail-closed, ignores late persistence, and cleans subscribers while keeping control out of proposal facet', async () => {
    const persistGate = deferred<XnlAuthoringPersistenceResult>();
    const acceptedPersistingSeen = deferred<void>();
    const { opened } = await openFixture({ persistResults: [persistGate] });
    const listener = vi.fn((state: XnlAuthoringSessionState<DocumentNode>) => {
      expectDeepFrozen(state);
      if (state.status === 'accepted-persisting') acceptedPersistingSeen.resolve();
    });
    const unsubscribe = opened.proposal.subscribe(listener);
    const base = opened.proposal.state().accepted.liveRevision;
    const pending = opened.proposal.submit(proposal('proposal:late', base), CONFIG);
    await acceptedPersistingSeen.promise;

    opened.control.dispose();
    opened.control.dispose();
    unsubscribe();
    unsubscribe();
    const callsAtDispose = listener.mock.calls.length;
    expect(opened.proposal.state()).toMatchObject({ status: 'disposed' });
    expect(opened.proposal).not.toHaveProperty('retryPersistence');
    expect(opened.proposal).not.toHaveProperty('reloadDiscardingAccepted');

    await expect(opened.proposal.submit(proposal('proposal:after-dispose', base), CONFIG))
      .resolves.toMatchObject({ status: 'failed' });
    await expect(opened.control.retryPersistence({ expectedLiveRevision: base }))
      .resolves.toMatchObject({ status: 'failed' });
    await expect(opened.control.reloadDiscardingAccepted({ expectedLiveRevision: base }))
      .resolves.toMatchObject({ status: 'failed' });

    persistGate.resolve(applied());
    await expect(pending).resolves.toMatchObject({ status: 'failed' });
    expect(listener).toHaveBeenCalledTimes(callsAtDispose);
    expect(opened.proposal.state()).toMatchObject({ status: 'disposed' });
  });

  it.each([
    ['materialize', 'materializeResults'],
    ['diff', 'diffResults'],
    ['dry-run', 'dryRunResults'],
    ['validation', 'validationResults'],
    ['revision', 'liveRevisions'],
    ['publish', 'publishResults'],
  ] as const)('dispose after awaited %s prevents every later effect and accepted result', async (_name, field) => {
    const gate = deferred<never>();
    const behavior: RuntimeBehavior = field === 'materializeResults'
      ? { materializeResults: [gate as Deferred<DocumentNode>] }
      : field === 'diffResults'
        ? { diffResults: [gate as Deferred<readonly Mutation[]>] }
        : field === 'dryRunResults'
          ? { dryRunResults: [gate as Deferred<XnlAuthoringDryRunResult<DocumentNode>>] }
          : field === 'validationResults'
            ? { validationResults: [gate as Deferred<XnlAuthoringCandidateValidationResult>] }
            : field === 'liveRevisions'
              ? { liveRevisions: [liveRevision('live:1'), gate as Deferred<XnlAuthoringLiveRevision>] }
              : { publishResults: [gate as Deferred<void>] };
    const { opened, calls } = await openFixture(behavior);
    const pending = opened.proposal.submit(
      proposal(`proposal:dispose-${field}`, opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    await vi.waitFor(() => {
      const awaitedName = ({
        materializeResults: 'materialize',
        diffResults: 'diff',
        dryRunResults: 'dryRun',
        validationResults: 'validate',
        liveRevisions: 'nextLiveRevision',
        publishResults: 'publish',
      } as const)[field];
      expect(calls.filter((call) => call.name === awaitedName)).toHaveLength(
        field === 'liveRevisions' ? 2 : 1,
      );
    });
    opened.control.dispose();
    if (field === 'materializeResults') gate.resolve(document(RENAMED_TITLE) as never);
    if (field === 'diffResults') gate.resolve([mutation()] as never);
    if (field === 'dryRunResults') gate.resolve({
      status: 'applied',
      document: document(RENAMED_TITLE),
      affectedIdentities: ['document:architecture'],
    } as never);
    if (field === 'validationResults') gate.resolve({ status: 'valid' } as never);
    if (field === 'liveRevisions') gate.resolve(liveRevision('live:2') as never);
    if (field === 'publishResults') gate.resolve(undefined as never);

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_SESSION_DISPOSED' })],
    });
    const names = callNames(calls);
    const awaitedIndex = names.lastIndexOf(({
      materializeResults: 'materialize',
      diffResults: 'diff',
      dryRunResults: 'dryRun',
      validationResults: 'validate',
      liveRevisions: 'nextLiveRevision',
      publishResults: 'publish',
    } as const)[field]);
    expect(names.slice(awaitedIndex + 1).filter((name) => name !== 'state')).toEqual([]);
    expect(opened.proposal.state().status).toBe('disposed');
  });

  it('validates and captures retry/reload inputs before enqueue without invoking accessors or effects', async () => {
    const { opened, calls } = await openFixture({ persistResults: [persistenceFailed()] });
    await opened.proposal.submit(
      proposal('proposal:dirty-input-boundary', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const callsBefore = calls.length;
    let getterCalls = 0;
    const accessorInput = {} as Record<string, unknown>;
    Object.defineProperty(accessorInput, 'expectedLiveRevision', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return opened.proposal.state().accepted.liveRevision;
      },
    });

    await expect(opened.control.retryPersistence(accessorInput as never)).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_INVALID_RETRY_INPUT' })],
    });
    await expect(opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: opened.proposal.state().accepted.liveRevision,
      writer: {},
    } as never)).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_INVALID_RELOAD_INPUT' })],
    });
    for (const malformed of [null, [], { expectedLiveRevision: null }]) {
      await expect(opened.control.retryPersistence(malformed as never)).resolves.toMatchObject({
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_INVALID_RETRY_INPUT' })],
      });
      await expect(opened.control.reloadDiscardingAccepted(malformed as never)).resolves.toMatchObject({
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_INVALID_RELOAD_INPUT' })],
      });
    }
    expect(getterCalls).toBe(0);
    expect(calls).toHaveLength(callsBefore);
  });

  it('dispose during reload read prevents revision allocation, invalidation, and a reloaded result', async () => {
    const reloadReadGate = deferred<XnlAuthoringPersistenceReadResult<DocumentNode>>();
    const { opened, calls } = await openFixture({
      persistResults: [persistenceFailed()],
      readResults: [loaded(), reloadReadGate],
    });
    await opened.proposal.submit(
      proposal('proposal:dirty-reload-read', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const pending = opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: opened.proposal.state().accepted.liveRevision,
    });
    await vi.waitFor(() => expect(callsNamed(calls, 'read')).toHaveLength(2));
    opened.control.dispose();
    reloadReadGate.resolve(loaded(document(RELOADED_TITLE), persistedRevision('vfs:12')));

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_SESSION_DISPOSED' })],
    });
    expect(callsNamed(calls, 'nextLiveRevision')).toHaveLength(2);
    expect(callsNamed(calls, 'publish')).toHaveLength(1);
    expect(opened.proposal.state().status).toBe('disposed');
  });

  it('dispose during reload revision or publish prevents the next effect and a reloaded result', async () => {
    const revisionGate = deferred<XnlAuthoringLiveRevision>();
    const revisionFixture = await openFixture({
      persistResults: [persistenceFailed()],
      readResults: [loaded(), loaded(document(RELOADED_TITLE), persistedRevision('vfs:12'))],
      liveRevisions: [liveRevision('live:1'), liveRevision('live:2'), revisionGate],
    });
    await revisionFixture.opened.proposal.submit(
      proposal('proposal:dirty-reload-revision', revisionFixture.opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const revisionPending = revisionFixture.opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: revisionFixture.opened.proposal.state().accepted.liveRevision,
    });
    await vi.waitFor(() => expect(callsNamed(revisionFixture.calls, 'nextLiveRevision')).toHaveLength(3));
    revisionFixture.opened.control.dispose();
    revisionGate.resolve(liveRevision('live:3'));
    await expect(revisionPending).resolves.toMatchObject({ status: 'failed' });
    expect(callsNamed(revisionFixture.calls, 'publish')).toHaveLength(1);

    const publishGate = deferred<void>();
    const publishFixture = await openFixture({
      persistResults: [persistenceFailed()],
      readResults: [loaded(), loaded(document(RELOADED_TITLE), persistedRevision('vfs:12'))],
      publishResults: [undefined, publishGate],
    });
    await publishFixture.opened.proposal.submit(
      proposal('proposal:dirty-reload-publish', publishFixture.opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const publishPending = publishFixture.opened.control.reloadDiscardingAccepted({
      expectedLiveRevision: publishFixture.opened.proposal.state().accepted.liveRevision,
    });
    await vi.waitFor(() => expect(callsNamed(publishFixture.calls, 'publish')).toHaveLength(2));
    publishFixture.opened.control.dispose();
    publishGate.resolve();
    await expect(publishPending).resolves.toMatchObject({ status: 'failed' });
    expect(publishFixture.opened.proposal.state().status).toBe('disposed');
  });

  it('dispose during retry invalidation prevents persistence and an accepted result', async () => {
    const retryPublishGate = deferred<void>();
    const { opened, calls } = await openFixture({
      publishThrowsOnce: [new Error('first invalidation failed')],
      publishResults: [retryPublishGate],
    });
    await opened.proposal.submit(
      proposal('proposal:dirty-retry-publish', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    );
    const pending = opened.control.retryPersistence({
      expectedLiveRevision: opened.proposal.state().accepted.liveRevision,
    });
    await vi.waitFor(() => expect(callsNamed(calls, 'publish')).toHaveLength(2));
    opened.control.dispose();
    retryPublishGate.resolve();

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_SESSION_DISPOSED' })],
    });
    expect(callsNamed(calls, 'persist')).toEqual([]);
  });

  it('returns independent exact deeply frozen factory/opened/proposal/control facades', async () => {
    const factory = createXnlAuthoringSessionFactory<DocumentNode, Command, Mutation>();
    const { runtime } = createRuntime();
    const opened = await factory.open(runtime, { id: 'session:document' }, {});

    for (const facade of [factory, opened, opened.proposal, opened.control]) {
      expect(Object.isFrozen(facade)).toBe(true);
    }
    expect(Object.keys(factory)).toEqual(['open']);
    expect(Object.keys(opened).sort()).toEqual(['control', 'proposal']);
    expect(Object.keys(opened.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);
    expect(Object.keys(opened.control).sort()).toEqual(['dispose', 'reloadDiscardingAccepted', 'retryPersistence']);
  });

  it('fails closed when open cannot load persisted state or receives a foreign initial live revision', async () => {
    const readFailure = createRuntime({
      readResults: [{
        status: 'failed',
        diagnostics: [diagnostic('TEST_READ_FAILED')],
      }],
    });
    const readFactory: XnlAuthoringSessionFactoryPort<DocumentNode, Command, Mutation> =
      createXnlAuthoringSessionFactory();
    await expect(readFactory.open(readFailure.runtime, {
      id: 'session:document',
      source: { uri: 'vfs://@/documents/missing.xnl' },
    }, {})).rejects.toThrow(/TEST_READ_FAILED/);

    const foreignRevision = createRuntime({
      liveRevisions: [liveRevision('live:1', 'session:foreign')],
    });
    await expect(readFactory.open(foreignRevision.runtime, {
      id: 'session:document',
      source: { uri: 'vfs://@/documents/architecture.xnl' },
    }, {})).rejects.toThrow(/foreign/);
  });

  it.each(THROW_BEFORE_ACCEPTANCE_CASES)('does not silently advance when $name capability throws before live acceptance', async ({ behavior }) => {
    const { opened, calls } = await openFixture(behavior);

    await expect(opened.proposal.submit(
      proposal('proposal:pre-accept-throw', opened.proposal.state().accepted.liveRevision),
      CONFIG,
    )).resolves.toMatchObject({ status: 'failed' });
    expectState(opened.proposal.state(), {
      status: 'ready',
      liveValue: 'live:1',
      persistedValue: 'vfs:10',
      title: INITIAL_TITLE,
    });
    expect(callsNamed(calls, 'publish')).toEqual([]);
    expect(callsNamed(calls, 'persist')).toEqual([]);
  });

  it('keeps accepted-first state when publish or persistence capability throws after live revision allocation', async () => {
    const publishFailure = await openFixture({ publishThrows: new Error('publish exploded') });

    await expect(publishFailure.opened.proposal.submit(
      proposal('proposal:publish-throws', publishFailure.opened.proposal.state().accepted.liveRevision),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'failed',
      liveRevision: { value: 'live:2' },
    });
    expectState(publishFailure.opened.proposal.state(), {
      status: 'dirty-failed',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
    expect(callsNamed(publishFailure.calls, 'persist')).toEqual([]);

    const persistFailure = await openFixture({ persistThrows: new Error('persist exploded') });
    await expect(persistFailure.opened.proposal.submit(
      proposal('proposal:persist-throws', persistFailure.opened.proposal.state().accepted.liveRevision),
      CONFIG,
    )).resolves.toMatchObject({
      status: 'accepted',
      accepted: { liveRevision: { value: 'live:2' } },
      persistence: { status: 'failed' },
    });
    expectState(persistFailure.opened.proposal.state(), {
      status: 'dirty-failed',
      liveValue: 'live:2',
      persistedValue: 'vfs:10',
      title: RENAMED_TITLE,
    });
  });
});
