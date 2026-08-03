import { describe, expect, it, vi } from 'vitest';
import type {
  XnlAuthoringLiveRevision,
  XnlAuthoringProposal,
  XnlAuthoringProposalPort,
  XnlAuthoringSessionState,
  XnlProjectionCommandResult,
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentIdentityAllocationRequest,
  XnlRichDocumentIdentityAllocationResult,
  XnlRichDocumentInteractionEditIntent,
  XnlRichDocumentReplaceDocumentCommand,
  XnlRichDocumentTrustedAuthoringRuntime,
} from '../src';
import {
  adaptXnlNodeToRichDocument,
  createXnlCoreAuthoringMutationPort,
  createXnlRichDocumentAuthoringDomainPort,
  createXnlRichDocumentTrustedAuthoringHost,
  materializeXnlRichDocument,
} from '../src';
import { classifyXnlRichDocumentIdentity } from 'dg-cell-mvi-halfcode-logic';
import type { XnlNode } from 'xnl-core';

const id = (value: string): XnlRichDocumentDomainNodeId => value as XnlRichDocumentDomainNodeId;

function paragraph(nodeId: string, text: string) {
  return {
    kind: 'paragraph' as const,
    nodeId: id(nodeId),
    content: [{ kind: 'text' as const, text }],
  };
}

function document(
  children: XnlRichDocument['children'] = [paragraph('paragraph.one', 'Hello')],
): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: id('document.root'),
    children,
  };
}

function concrete(candidate = document()): XnlNode {
  const result = materializeXnlRichDocument(candidate);
  if (result.status !== 'materialized') throw new Error('fixture did not materialize');
  return result.document;
}

function revision(value: string): XnlAuthoringLiveRevision {
  return { kind: 'xnl-authoring-live-revision', sessionId: 'session:doc', value };
}

function interaction(): XnlRichDocumentInteractionEditIntent {
  return {
    kind: 'interaction',
    proposal: {
      id: 'interaction:1',
      type: 'document.replace',
      target: { planNodeId: 'plan:document' },
      payload: { operation: 'replace' },
    },
  };
}

function translated(): XnlProjectionCommandResult {
  return {
    status: 'translated',
    command: {
      type: 'document.replace',
      target: { path: [], nodeId: 'document.root' },
      payload: { operation: 'replace' },
    },
  };
}

interface HarnessOptions {
  candidate?: XnlRichDocument;
  copyOrigins?: readonly Readonly<{ candidateNodeId: XnlRichDocumentDomainNodeId; sourceNodeId: XnlRichDocumentDomainNodeId }>[];
  translator?: () => XnlProjectionCommandResult | Promise<XnlProjectionCommandResult>;
  materializer?: () => XnlRichDocumentCandidateMaterializationResult | Promise<XnlRichDocumentCandidateMaterializationResult>;
  allocator?: (request: XnlRichDocumentIdentityAllocationRequest) => XnlRichDocumentIdentityAllocationResult | Promise<XnlRichDocumentIdentityAllocationResult>;
  state?: () => XnlAuthoringSessionState<XnlNode>;
  hostInput?: Readonly<{ source?: Readonly<{ occurrenceId: string; xId?: string }> }>;
  hostConfig?: Readonly<{
    proposalIdPrefix: string;
    submission?: Readonly<{ policy?: Readonly<{ conflict?: 'reject'; diagnostics?: 'collect' | 'fail-fast' }> }>;
  }>;
}

function harness(options: HarnessOptions = {}) {
  let liveRevision = revision('live:1');
  const acceptedDocument = concrete();
  const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];
  const defaultState = (): XnlAuthoringSessionState<XnlNode> => ({
    kind: 'xnl-authoring-session-state',
    status: 'ready',
    accepted: {
      kind: 'xnl-authoring-accepted-snapshot',
      document: acceptedDocument,
      liveRevision,
    },
  });
  const state = options.state ?? defaultState;
  const submittedConfigs: unknown[] = [];
  const proposal: XnlAuthoringProposalPort<XnlNode, XnlRichDocumentReplaceDocumentCommand> = {
    state,
    subscribe: () => () => undefined,
    submit: async (value, submitConfig) => {
      submitted.push(value);
      submittedConfigs.push(submitConfig);
      return { status: 'rejected', liveRevision, diagnostics: [] };
    },
  };
  const translateInteraction = vi.fn(async () =>
    await (options.translator?.() ?? translated()));
  const materializeInteraction = vi.fn<
    [unknown, unknown, Readonly<Record<string, never>>],
    Promise<XnlRichDocumentCandidateMaterializationResult>
  >(async () => await (options.materializer?.() ?? {
      status: 'materialized' as const,
      candidate: options.candidate ?? document(),
      ...(options.copyOrigins === undefined ? {} : { copyOrigins: options.copyOrigins }),
    }));
  const identityAllocator = vi.fn(async (_runtime, request: XnlRichDocumentIdentityAllocationRequest) =>
    await (options.allocator?.(request) ?? {
      status: 'allocated' as const,
      requestId: request.requestId,
      nodeId: id(`allocated.${request.requestId.split(':').at(-1)}`),
      freshness: 'fresh' as const,
    }));
  const runtime: XnlRichDocumentTrustedAuthoringRuntime = {
    proposal,
    translateInteraction,
    materializeInteraction,
    identityAllocator,
  };
  const bridge = createXnlRichDocumentTrustedAuthoringHost(
    runtime,
    options.hostInput ?? { source: { occurrenceId: 'document:main', xId: 'document.root' } },
    options.hostConfig ?? { proposalIdPrefix: 'proposal:doc' },
  );
  return {
    bridge,
    submitted,
    submittedConfigs,
    translateInteraction,
    materializeInteraction,
    identityAllocator,
    setRevision(value: string) { liveRevision = revision(value); },
  };
}

describe('XNL RichDocument support bridge', () => {
  it('round-trips concrete xnl-core nodes through Projection and neutral RichDocument', () => {
    const source = document([
      paragraph('paragraph.one', 'Hello'),
      { kind: 'heading', nodeId: id('heading.one'), level: 2, content: [{ kind: 'text', text: 'Title' }] },
    ]);
    const adapted = adaptXnlNodeToRichDocument(concrete(source));
    expect(adapted).toEqual({ status: 'normalized', document: source });
  });

  it('hands final concrete candidates to the existing xnl-core diff and dry-run ports', async () => {
    const accepted = concrete(document([
      paragraph('paragraph.one', 'One'),
      paragraph('paragraph.two', 'Two'),
    ]));
    const candidate = concrete(document([
      paragraph('paragraph.two', 'Two'),
      paragraph('paragraph.one', 'One'),
    ]));
    const liveRevision = revision('live:1');
    const proposal: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand> = {
      kind: 'xnl-authoring-proposal',
      id: 'proposal:move',
      baseLiveRevision: liveRevision,
      command: { kind: 'xnl-rich-document-replace-document', document: candidate },
    };
    const domain = createXnlRichDocumentAuthoringDomainPort();
    const materialized = await domain.materializeCandidate({} as never, {
      accepted: { kind: 'xnl-authoring-accepted-snapshot', document: accepted, liveRevision },
      proposal,
    }, {});
    const mutations = createXnlCoreAuthoringMutationPort<XnlRichDocumentReplaceDocumentCommand>();
    const diff = await mutations.diff({} as never, {
      acceptedDocument: accepted,
      candidateDocument: materialized,
    }, {});
    const dryRun = await mutations.dryRun({} as never, {
      acceptedDocument: accepted,
      mutations: diff,
      metadataIdMode: 'identity',
    }, {});

    expect(diff.length).toBeGreaterThan(0);
    expect(dryRun.status).toBe('applied');
    if (dryRun.status === 'applied') expect(dryRun.document).toEqual(candidate);
  });

  it('translates and submits exactly once using the live revision read after async work', async () => {
    let releaseTranslator!: () => void;
    const translatorGate = new Promise<void>((resolve) => { releaseTranslator = resolve; });
    const test = harness({
      translator: async () => {
        await translatorGate;
        return translated();
      },
    });

    const pending = test.bridge.emitEditIntent(interaction());
    test.setRevision('live:submission');
    releaseTranslator();
    const result = await pending;

    expect(result.status).toBe('submitted');
    expect(test.translateInteraction).toHaveBeenCalledTimes(1);
    expect(test.materializeInteraction).toHaveBeenCalledTimes(1);
    expect(test.submitted).toHaveLength(1);
    expect(test.submitted[0]?.baseLiveRevision.value).toBe('live:submission');
  });

  it('invokes materialization with an exact empty runtime facet', async () => {
    const test = harness();

    await test.bridge.emitEditIntent(interaction());

    const materializerRuntime = test.materializeInteraction.mock.calls[0]?.[0];
    expect(Reflect.ownKeys(materializerRuntime as object)).toEqual([]);
    expect(Object.isFrozen(materializerRuntime)).toBe(true);
    expect(JSON.stringify(materializerRuntime)).toBe('{}');
  });

  it('allocates fresh identities for classified new and copied nodes and reserves every result', async () => {
    const candidate = document([
      paragraph('paragraph.one', 'Hello'),
      paragraph('temporary.new', 'New'),
      paragraph('temporary.copy', 'Copy'),
    ]);
    const requests: XnlRichDocumentIdentityAllocationRequest[] = [];
    const test = harness({
      candidate,
      copyOrigins: [{ candidateNodeId: id('temporary.copy'), sourceNodeId: id('paragraph.one') }],
      allocator: (request) => {
        requests.push(request);
        return {
          status: 'allocated',
          requestId: request.requestId,
          nodeId: id(request.reason === 'new' ? 'paragraph.new' : 'paragraph.copy'),
          freshness: 'fresh',
        };
      },
    });

    await test.bridge.emitEditIntent(interaction());

    expect(requests.map((request) => request.reason)).toEqual(['new', 'copy']);
    expect(requests[0]?.reservedNodeIds).toContain(id('paragraph.one'));
    expect(requests[1]?.reservedNodeIds).toContain(id('paragraph.new'));
    const proposalDocument = test.submitted[0]?.command.document;
    const adapted = proposalDocument === undefined ? undefined : adaptXnlNodeToRichDocument(proposalDocument);
    expect(adapted?.status).toBe('normalized');
    if (adapted?.status === 'normalized') {
      expect(adapted.document.children.map((node) => node.nodeId)).toEqual([
        id('paragraph.one'), id('paragraph.new'), id('paragraph.copy'),
      ]);
    }
  });

  it('fails closed if accepted truth changes while the candidate is materializing', async () => {
    let advanceRevision!: (value: string) => void;
    const test = harness({
      materializer: async () => {
        await Promise.resolve();
        advanceRevision('live:concurrent');
        return { status: 'materialized', candidate: document() };
      },
    });
    advanceRevision = test.setRevision;

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'concurrent-change' });
    expect(test.submitted).toHaveLength(0);
  });

  const failures: readonly (readonly [string, HarnessOptions])[] = [
    ['translator', { translator: () => { throw new Error('translator failed'); } }],
    ['materializer', { materializer: () => ({ status: 'rejected' as const, diagnostics: [{ severity: 'error' as const, code: 'UNSUPPORTED_CONSTRUCT' as const, message: 'no' }] }) }],
    ['allocator', { candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.new', 'New')]), allocator: (request: XnlRichDocumentIdentityAllocationRequest) => ({ status: 'rejected' as const, requestId: request.requestId, freshness: 'unverified' as const, diagnostics: [{ severity: 'error' as const, code: 'IDENTITY_ALLOCATION_FAILED' as const, message: 'no' }] }) }],
  ];

  it.each(failures)('does not submit when %s fails', async (_name, options) => {
    const test = harness(options);
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result.status).toBe('rejected');
    expect(test.submitted).toHaveLength(0);
  });

  it('fails closed on allocator collisions before submit', async () => {
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.new', 'New')]),
      allocator: (request) => ({
        status: 'allocated',
        requestId: request.requestId,
        nodeId: id('paragraph.one'),
        freshness: 'fresh',
      }),
    });
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(0);
  });

  it('does not execute accessors in malicious allocator output', async () => {
    let getterCalls = 0;
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.new', 'New')]),
      allocator: (request) => Object.defineProperty({
        status: 'allocated',
        requestId: request.requestId,
        freshness: 'fresh',
      }, 'nodeId', {
        enumerable: true,
        get() { getterCalls += 1; return 'paragraph.malicious'; },
      }) as XnlRichDocumentIdentityAllocationResult,
    });
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(getterCalls).toBe(0);
    expect(test.submitted).toHaveLength(0);
  });

  it.each([
    ['malformed', 'not valid id'],
    ['unverified-looking', ''],
  ])('rejects %s allocated identities before submit', async (_label, allocatedId) => {
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.new', 'New')]),
      allocator: (request) => ({
        status: 'allocated',
        requestId: request.requestId,
        nodeId: id(allocatedId),
        freshness: 'fresh',
      }),
    });
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects an allocator id reused by a later allocation', async () => {
    const test = harness({
      candidate: document([
        paragraph('paragraph.one', 'Hello'),
        paragraph('temporary.new-one', 'One'),
        paragraph('temporary.new-two', 'Two'),
      ]),
      allocator: (request) => ({
        status: 'allocated',
        requestId: request.requestId,
        nodeId: id('paragraph.reused'),
        freshness: 'fresh',
      }),
    });
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(0);
  });

  it('claims unique proposal correlation before concurrent async work and globally reserves issued ids', async () => {
    const requests: XnlRichDocumentIdentityAllocationRequest[] = [];
    let releaseAllocations!: () => void;
    const gate = new Promise<void>((resolve) => { releaseAllocations = resolve; });
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.concurrent', 'New')]),
      allocator: async (request) => {
        requests.push(request);
        if (requests.length === 2) releaseAllocations();
        await gate;
        return {
          status: 'allocated',
          requestId: request.requestId,
          nodeId: id('paragraph.globally-issued'),
          freshness: 'fresh',
        };
      },
    });

    const results = await Promise.all([
      test.bridge.emitEditIntent(interaction()),
      test.bridge.emitEditIntent(interaction()),
    ]);

    expect(requests.map((request) => request.requestId).sort()).toEqual([
      'proposal:doc:1:identity:1',
      'proposal:doc:2:identity:1',
    ]);
    expect(results.filter((result) => result.status === 'submitted')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(test.submitted).toHaveLength(1);
    expect(requests.some((request) => request.requestId.startsWith(`${test.submitted[0]!.id}:identity:`))).toBe(true);
  });

  it('keeps issued identities reserved after a rejected submission and across later calls', async () => {
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.later', 'New')]),
      allocator: (request) => ({
        status: 'allocated',
        requestId: request.requestId,
        nodeId: id('paragraph.once-only'),
        freshness: 'fresh',
      }),
    });

    const first = await test.bridge.emitEditIntent(interaction());
    const second = await test.bridge.emitEditIntent(interaction());

    expect(first.status).toBe('submitted');
    expect(second).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(1);
  });

  it('rejects allocator output equal to any candidate temporary identity', async () => {
    const test = harness({
      candidate: document([paragraph('paragraph.one', 'Hello'), paragraph('temporary.reserved', 'New')]),
      allocator: (request) => ({
        status: 'allocated',
        requestId: request.requestId,
        nodeId: id('temporary.reserved'),
        freshness: 'fresh',
      }),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(0);
  });

  it('allocates the added side of identity replacement as new and preserves delete-add classification', async () => {
    const requests: XnlRichDocumentIdentityAllocationRequest[] = [];
    const test = harness({
      candidate: document([paragraph('temporary.replacement', 'Replacement')]),
      allocator: (request) => {
        requests.push(request);
        return {
          status: 'allocated',
          requestId: request.requestId,
          nodeId: id('paragraph.replacement-fresh'),
          freshness: 'fresh',
        };
      },
    });

    const result = await test.bridge.emitEditIntent(interaction());
    const submittedDocument = test.submitted[0]?.command.document;
    const final = submittedDocument === undefined ? undefined : adaptXnlNodeToRichDocument(submittedDocument);

    expect(result.status).toBe('submitted');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ reason: 'new' });
    expect(requests[0]?.reservedNodeIds).toContain(id('temporary.replacement'));
    expect(final?.status).toBe('normalized');
    if (final?.status === 'normalized') {
      const classification = classifyXnlRichDocumentIdentity({}, {
        accepted: document(),
        candidate: final.document,
      }, {});
      expect(classification.status).toBe('classified');
      if (classification.status === 'classified') {
        expect(classification.changes).toContainEqual(expect.objectContaining({
          classification: 'replacement',
          deletedNodeId: id('paragraph.one'),
          addedNodeId: id('paragraph.replacement-fresh'),
          operations: ['delete', 'add'],
          ordinaryIdUpdate: false,
        }));
      }
    }
  });

  it.each([
    ['null', () => null],
    ['throwing', () => { throw new Error('state failed'); }],
    ['malformed', () => ({
      kind: 'xnl-authoring-session-state',
      status: 'unknown',
      accepted: {
        kind: 'xnl-authoring-accepted-snapshot',
        document: concrete(),
        liveRevision: revision('live:1'),
      },
    })],
  ])('fails closed when proposal state is %s', async (_label, state) => {
    const test = harness({ state: state as unknown as () => XnlAuthoringSessionState<XnlNode> });
    const result = await test.bridge.emitEditIntent(interaction());
    expect(result).toMatchObject({ status: 'rejected', stage: 'accepted-document' });
    expect(test.materializeInteraction).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it('does not execute proposal state accessors on either state read', async () => {
    const acceptedDocument = concrete();
    const validState = (): XnlAuthoringSessionState<XnlNode> => ({
      kind: 'xnl-authoring-session-state',
      status: 'ready',
      accepted: {
        kind: 'xnl-authoring-accepted-snapshot',
        document: acceptedDocument,
        liveRevision: revision('live:1'),
      },
    });
    let stateReads = 0;
    let getterCalls = 0;
    const test = harness({
      state: () => {
        stateReads += 1;
        if (stateReads === 1) return validState();
        return Object.defineProperty({
          kind: 'xnl-authoring-session-state',
          status: 'ready',
        }, 'accepted', {
          enumerable: true,
          get() { getterCalls += 1; return validState().accepted; },
        }) as XnlAuthoringSessionState<XnlNode>;
      },
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'accepted-document' });
    expect(getterCalls).toBe(0);
    expect(test.materializeInteraction).toHaveBeenCalledTimes(1);
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects accessor-backed host assembly without executing getters', async () => {
    let getterCalls = 0;
    const hostInput = Object.defineProperty({}, 'source', {
      enumerable: true,
      get() { getterCalls += 1; return { occurrenceId: 'malicious' }; },
    });
    const test = harness({ hostInput: hostInput as Readonly<{ source?: { occurrenceId: string } }> });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(getterCalls).toBe(0);
    expect(test.translateInteraction).not.toHaveBeenCalled();
  });

  it('rejects accessor-backed host config without executing getters', async () => {
    let getterCalls = 0;
    const hostConfig = Object.defineProperty({}, 'proposalIdPrefix', {
      enumerable: true,
      get() { getterCalls += 1; return 'proposal:malicious'; },
    });
    const test = harness({
      hostConfig: hostConfig as Readonly<{ proposalIdPrefix: string }>,
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(getterCalls).toBe(0);
    expect(test.translateInteraction).not.toHaveBeenCalled();
  });

  it('captures trusted runtime capabilities without executing accessors', async () => {
    let getterCalls = 0;
    const runtime = Object.defineProperty({
      translateInteraction: async () => translated(),
      materializeInteraction: async () => ({ status: 'materialized' as const, candidate: document() }),
      identityAllocator: async (_runtime: unknown, request: XnlRichDocumentIdentityAllocationRequest) => ({
        status: 'allocated' as const,
        requestId: request.requestId,
        nodeId: id('paragraph.fresh'),
        freshness: 'fresh' as const,
      }),
    }, 'proposal', {
      enumerable: true,
      get() { getterCalls += 1; return {}; },
    }) as unknown as XnlRichDocumentTrustedAuthoringRuntime;
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:runtime' },
    );

    const result = await bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(getterCalls).toBe(0);
  });

  it('supports class runtime and proposal-port methods while preserving DEPA arguments', async () => {
    const acceptedDocument = concrete();
    const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];
    class ClassProposalPort implements XnlAuthoringProposalPort<XnlNode, XnlRichDocumentReplaceDocumentCommand> {
      readonly marker = 'proposal-owner';

      state(): XnlAuthoringSessionState<XnlNode> {
        expect(this.marker).toBe('proposal-owner');
        return {
          kind: 'xnl-authoring-session-state',
          status: 'ready',
          accepted: {
            kind: 'xnl-authoring-accepted-snapshot',
            document: acceptedDocument,
            liveRevision: revision('live:class'),
          },
        };
      }

      subscribe(): () => void {
        return () => undefined;
      }

      async submit(
        value: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>,
      ) {
        expect(this.marker).toBe('proposal-owner');
        submitted.push(value);
        return { status: 'rejected' as const, liveRevision: revision('live:class'), diagnostics: [] };
      }
    }

    class ClassRuntime implements XnlRichDocumentTrustedAuthoringRuntime {
      readonly proposal = new ClassProposalPort();
      readonly marker = 'runtime-owner';
      translateCalls = 0;
      materializeCalls = 0;

      async translateInteraction(
        runtime: XnlRichDocumentTrustedAuthoringRuntime,
        input: Readonly<{ interaction: Readonly<{ type: string }> }>,
        config: Readonly<Record<string, never>>,
      ): Promise<XnlProjectionCommandResult> {
        expect(this.marker).toBe('runtime-owner');
        expect(runtime).toBe(this);
        expect(input.interaction.type).toBe('document.replace');
        expect(config).toEqual({});
        this.translateCalls += 1;
        return translated();
      }

      async materializeInteraction(
        runtime: Readonly<Record<PropertyKey, never>>,
        input: Readonly<{ accepted: XnlRichDocument }>,
        config: Readonly<Record<string, never>>,
      ): Promise<XnlRichDocumentCandidateMaterializationResult> {
        expect(this.marker).toBe('runtime-owner');
        expect(Reflect.ownKeys(runtime)).toEqual([]);
        expect(input.accepted).toEqual(document());
        expect(config).toEqual({});
        this.materializeCalls += 1;
        return { status: 'materialized', candidate: document() };
      }

      async identityAllocator(
        _runtime: XnlRichDocumentTrustedAuthoringRuntime,
        request: XnlRichDocumentIdentityAllocationRequest,
      ): Promise<XnlRichDocumentIdentityAllocationResult> {
        return {
          status: 'allocated', requestId: request.requestId,
          nodeId: id('unused.class'), freshness: 'fresh',
        };
      }
    }

    const runtime = new ClassRuntime();
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:class' },
    );
    const result = await bridge.emitEditIntent(interaction());

    expect(result.status).toBe('submitted');
    expect(runtime.translateCalls).toBe(1);
    expect(runtime.materializeCalls).toBe(1);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.id).toBe('proposal:class:1');
  });

  it('supports an application runtime class registered globally before a fresh bridge import', async () => {
    const globalRuntimeKey = '__xnlRichDocumentApplicationRuntime__';
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, globalRuntimeKey);
    const acceptedDocument = concrete();
    const candidate = document([
      paragraph('paragraph.one', 'Hello'),
      paragraph('paragraph.temporary', 'Added'),
    ]);
    const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];

    class ApplicationProposalPort implements XnlAuthoringProposalPort<XnlNode, XnlRichDocumentReplaceDocumentCommand> {
      state(): XnlAuthoringSessionState<XnlNode> {
        return {
          kind: 'xnl-authoring-session-state',
          status: 'ready',
          accepted: {
            kind: 'xnl-authoring-accepted-snapshot',
            document: acceptedDocument,
            liveRevision: revision('live:global-class'),
          },
        };
      }

      subscribe(): () => void {
        return () => undefined;
      }

      async submit(value: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>) {
        submitted.push(value);
        return {
          status: 'rejected' as const,
          liveRevision: revision('live:global-class'),
          diagnostics: [],
        };
      }
    }

    class ApplicationRuntime implements XnlRichDocumentTrustedAuthoringRuntime {
      readonly proposal = new ApplicationProposalPort();
      translateCalls = 0;
      materializeCalls = 0;
      allocatorCalls = 0;

      async translateInteraction(): Promise<XnlProjectionCommandResult> {
        this.translateCalls += 1;
        return translated();
      }

      async materializeInteraction(): Promise<XnlRichDocumentCandidateMaterializationResult> {
        this.materializeCalls += 1;
        return { status: 'materialized', candidate };
      }

      async identityAllocator(
        _runtime: XnlRichDocumentTrustedAuthoringRuntime,
        request: XnlRichDocumentIdentityAllocationRequest,
      ): Promise<XnlRichDocumentIdentityAllocationResult> {
        this.allocatorCalls += 1;
        return {
          status: 'allocated',
          requestId: request.requestId,
          nodeId: id('paragraph.fresh'),
          freshness: 'fresh',
        };
      }
    }

    try {
      Object.defineProperty(globalThis, globalRuntimeKey, {
        configurable: true,
        value: ApplicationRuntime,
      });
      vi.resetModules();
      const { createXnlRichDocumentTrustedAuthoringHost: createFreshHost } = await import(
        '../src/xnl-rich-document/authoringBridge'
      );
      const runtime = new ApplicationRuntime();
      const bridge = createFreshHost(runtime, {}, { proposalIdPrefix: 'proposal:global-class' });

      const result = await bridge.emitEditIntent(interaction());

      expect(result.status).toBe('submitted');
      expect(runtime.translateCalls).toBe(1);
      expect(runtime.materializeCalls).toBe(1);
      expect(runtime.allocatorCalls).toBe(1);
      expect(submitted).toHaveLength(1);
      expect(submitted[0]?.id).toBe('proposal:global-class:1');
    } finally {
      if (previousDescriptor === undefined) delete (globalThis as Record<string, unknown>)[globalRuntimeKey];
      else Object.defineProperty(globalThis, globalRuntimeKey, previousDescriptor);
    }
  });

  it('supports inherited and mixin-style prototype runtime capabilities', async () => {
    const acceptedDocument = concrete();
    const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];
    const proposalPrototype = {
      state(this: { acceptedDocument: XnlNode }) {
        return {
          kind: 'xnl-authoring-session-state' as const,
          status: 'ready' as const,
          accepted: {
            kind: 'xnl-authoring-accepted-snapshot' as const,
            document: this.acceptedDocument,
            liveRevision: revision('live:mixin'),
          },
        };
      },
      subscribe() { return () => undefined; },
      async submit(
        this: { submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] },
        value: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>,
      ) {
        this.submitted.push(value);
        return { status: 'rejected' as const, liveRevision: revision('live:mixin'), diagnostics: [] };
      },
    };
    const proposal = Object.assign(Object.create(proposalPrototype) as {
      acceptedDocument: XnlNode;
      submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[];
    }, { acceptedDocument, submitted });
    const runtimeMixin = {
      async translateInteraction(
        runtime: XnlRichDocumentTrustedAuthoringRuntime,
        _input: unknown,
        config: Readonly<Record<string, never>>,
      ) {
        expect(runtime).toBe(this);
        expect(config).toEqual({});
        return translated();
      },
      async materializeInteraction(
        runtime: Readonly<Record<PropertyKey, never>>,
        _input: unknown,
        config: Readonly<Record<string, never>>,
      ) {
        expect(Reflect.ownKeys(runtime)).toEqual([]);
        expect(config).toEqual({});
        return { status: 'materialized' as const, candidate: document() };
      },
      async identityAllocator(
        _runtime: XnlRichDocumentTrustedAuthoringRuntime,
        request: XnlRichDocumentIdentityAllocationRequest,
      ) {
        return {
          status: 'allocated' as const, requestId: request.requestId,
          nodeId: id('unused.mixin'), freshness: 'fresh' as const,
        };
      },
    };
    const runtime = Object.assign(Object.create(runtimeMixin), { proposal }) as XnlRichDocumentTrustedAuthoringRuntime;
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:mixin' },
    );

    const result = await bridge.emitEditIntent(interaction());

    expect(result.status).toBe('submitted');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.id).toBe('proposal:mixin:1');
  });

  it('rejects accessor-backed prototype capabilities without executing getters', async () => {
    let getterCalls = 0;
    const runtimePrototype = Object.defineProperty({
      materializeInteraction: async () => ({ status: 'materialized' as const, candidate: document() }),
      identityAllocator: async (_runtime: unknown, request: XnlRichDocumentIdentityAllocationRequest) => ({
        status: 'allocated' as const,
        requestId: request.requestId,
        nodeId: id('unused.prototype'),
        freshness: 'fresh' as const,
      }),
    }, 'translateInteraction', {
      get() { getterCalls += 1; return async () => translated(); },
    });
    const runtime = Object.assign(Object.create(runtimePrototype), {
      proposal: {
        state: () => { throw new Error('must not run'); },
        subscribe: () => () => undefined,
        submit: async () => { throw new Error('must not run'); },
      },
    }) as XnlRichDocumentTrustedAuthoringRuntime;
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:prototype-accessor' },
    );

    const result = await bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(getterCalls).toBe(0);
  });

  it('rejects accessor-backed proposal prototype capabilities without executing getters', async () => {
    let getterCalls = 0;
    const proposalPrototype = Object.defineProperty({
      submit: async () => { throw new Error('must not run'); },
    }, 'state', {
      get() { getterCalls += 1; return () => { throw new Error('must not run'); }; },
    });
    const runtime = {
      proposal: Object.create(proposalPrototype),
      translateInteraction: async () => translated(),
      materializeInteraction: async () => ({ status: 'materialized' as const, candidate: document() }),
      identityAllocator: async (_runtime: unknown, request: XnlRichDocumentIdentityAllocationRequest) => ({
        status: 'allocated' as const,
        requestId: request.requestId,
        nodeId: id('unused.proposal-prototype'),
        freshness: 'fresh' as const,
      }),
    } as XnlRichDocumentTrustedAuthoringRuntime;
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:proposal-prototype-accessor' },
    );

    const result = await bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(getterCalls).toBe(0);
  });

  it('fails closed when a runtime capability prototype is a revoked proxy', async () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const runtime = Object.create(revoked.proxy) as XnlRichDocumentTrustedAuthoringRuntime;
    const bridge = createXnlRichDocumentTrustedAuthoringHost(
      runtime,
      {},
      { proposalIdPrefix: 'proposal:revoked-prototype' },
    );

    const result = await bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
  });

  it('rejects missing runtime capabilities injected through Object.prototype pollution', async () => {
    const keys = ['proposal', 'translateInteraction', 'materializeInteraction', 'identityAllocator'] as const;
    const previous = new Map<string, PropertyDescriptor | undefined>();
    let invoked = 0;
    const injected = {
      proposal: {
        state: () => { invoked += 1; throw new Error('polluted state must not run'); },
        submit: async () => { invoked += 1; throw new Error('polluted submit must not run'); },
      },
      translateInteraction: async () => { invoked += 1; return translated(); },
      materializeInteraction: async () => { invoked += 1; return { status: 'materialized', candidate: document() }; },
      identityAllocator: async () => { invoked += 1; throw new Error('polluted allocator must not run'); },
    };

    try {
      for (const key of keys) {
        previous.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: injected[key],
        });
      }
      const bridge = createXnlRichDocumentTrustedAuthoringHost(
        {} as XnlRichDocumentTrustedAuthoringRuntime,
        {},
        { proposalIdPrefix: 'proposal:polluted' },
      );

      const result = await bridge.emitEditIntent(interaction());

      expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
      expect(invoked).toBe(0);
    } finally {
      for (const key of keys) {
        const descriptor = previous.get(key);
        if (descriptor === undefined) delete (Object.prototype as Record<string, unknown>)[key];
        else Object.defineProperty(Object.prototype, key, descriptor);
      }
    }
  });

  it('rejects a missing capability injected through another global built-in prototype', async () => {
    const previous = Object.getOwnPropertyDescriptor(Map.prototype, 'translateInteraction');
    let invoked = 0;
    try {
      Object.defineProperty(Map.prototype, 'translateInteraction', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: async () => { invoked += 1; return translated(); },
      });
      const runtime = Object.assign(Object.create(Map.prototype), {
        proposal: {
          state: () => { throw new Error('must not run'); },
          submit: async () => { throw new Error('must not run'); },
        },
        materializeInteraction: async () => ({ status: 'materialized' as const, candidate: document() }),
        identityAllocator: async () => { throw new Error('must not run'); },
      }) as XnlRichDocumentTrustedAuthoringRuntime;
      const bridge = createXnlRichDocumentTrustedAuthoringHost(
        runtime,
        {},
        { proposalIdPrefix: 'proposal:polluted-map' },
      );

      const result = await bridge.emitEditIntent(interaction());

      expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
      expect(invoked).toBe(0);
    } finally {
      if (previous === undefined) delete (Map.prototype as unknown as Record<string, unknown>).translateInteraction;
      else Object.defineProperty(Map.prototype, 'translateInteraction', previous);
    }
  });

  it('rejects a missing capability injected through an unregistered platform prototype', async () => {
    const previous = Object.getOwnPropertyDescriptor(URL.prototype, 'translateInteraction');
    let invoked = 0;
    try {
      Object.defineProperty(URL.prototype, 'translateInteraction', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: async () => { invoked += 1; return translated(); },
      });
      const runtime = Object.assign(Object.create(URL.prototype), {
        proposal: {
          state: () => ({
            kind: 'xnl-authoring-session-state' as const,
            status: 'ready' as const,
            accepted: {
              kind: 'xnl-authoring-accepted-snapshot' as const,
              document: concrete(),
              liveRevision: revision('live:polluted-url'),
            },
          }),
          submit: async () => { throw new Error('must not run'); },
        },
        materializeInteraction: async () => ({ status: 'materialized' as const, candidate: document() }),
        identityAllocator: async () => { throw new Error('must not run'); },
      }) as XnlRichDocumentTrustedAuthoringRuntime;
      const bridge = createXnlRichDocumentTrustedAuthoringHost(
        runtime,
        {},
        { proposalIdPrefix: 'proposal:polluted-url' },
      );

      const result = await bridge.emitEditIntent(interaction());

      expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
      expect(invoked).toBe(0);
    } finally {
      if (previous === undefined) delete (URL.prototype as unknown as Record<string, unknown>).translateInteraction;
      else Object.defineProperty(URL.prototype, 'translateInteraction', previous);
    }
  });

  it.each(['__proto__', 'constructor', 'prototype']) (
    'preserves own %s host config keys so exact validation rejects them',
    async (unsafeKey) => {
      const hostConfig = { proposalIdPrefix: 'proposal:unsafe-host-config' };
      Object.defineProperty(hostConfig, unsafeKey, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: { polluted: true },
      });
      const test = harness({ hostConfig });

      const result = await test.bridge.emitEditIntent(interaction());

      expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
      expect(test.translateInteraction).not.toHaveBeenCalled();
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    },
  );

  it('preserves an own __proto__ interaction key so exact validation rejects it', async () => {
    const unsafeInteraction = interaction();
    Object.defineProperty(unsafeInteraction, '__proto__', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { revision: 'laundered' },
    });
    const test = harness();

    const result = await test.bridge.emitEditIntent(unsafeInteraction);

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(test.translateInteraction).not.toHaveBeenCalled();
  });

  it('preserves own __proto__ proposal-state keys so exact validation rejects them', async () => {
    const unsafeState = {
      kind: 'xnl-authoring-session-state',
      status: 'ready',
      accepted: {
        kind: 'xnl-authoring-accepted-snapshot',
        document: concrete(),
        liveRevision: revision('live:unsafe-state'),
      },
    };
    Object.defineProperty(unsafeState, '__proto__', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { accepted: 'laundered' },
    });
    const test = harness({ state: () => unsafeState as XnlAuthoringSessionState<XnlNode> });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'accepted-document' });
    expect(test.submitted).toHaveLength(0);
  });

  it('preserves own __proto__ allocator keys so exact validation rejects them', async () => {
    const candidate = document([
      paragraph('paragraph.one', 'Hello'),
      paragraph('temporary.new', 'New'),
    ]);
    const test = harness({
      candidate,
      allocator: (request) => {
        const result = {
          status: 'allocated' as const,
          requestId: request.requestId,
          nodeId: id('paragraph.fresh'),
          freshness: 'fresh' as const,
        };
        Object.defineProperty(result, '__proto__', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: { status: 'allocated' },
        });
        return result;
      },
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'identity-allocation' });
    expect(test.submitted).toHaveLength(0);
  });

  it.each([
    'revision',
    'currentRevision',
    'baseLiveRevision',
    'liveRevision',
    'persistedRevision',
    'previousRevision',
    'expectedLiveRevision',
    'actualLiveRevision',
    'expectedPersistedRevision',
    'actualPersistedRevision',
    'discardedLiveRevision',
    'persistenceReceipt',
    'commitId',
  ])('recursively rejects revision authority field %s from interaction data', async (authorityKey) => {
    const test = harness();
    const unsafeInteraction = interaction() as unknown as {
      proposal: { payload: Record<string, unknown> };
    };
    unsafeInteraction.proposal.payload = {
      operation: 'replace',
      nested: { [authorityKey]: 'host-owned' },
    };

    const result = await test.bridge.emitEditIntent(
      unsafeInteraction as unknown as XnlRichDocumentInteractionEditIntent,
    );

    expect(result).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(test.translateInteraction).not.toHaveBeenCalled();
  });

  it('does not reject unrelated ordinary domain words that merely mention revisions', async () => {
    const test = harness();
    const ordinaryInteraction = interaction() as unknown as {
      proposal: { payload: Record<string, unknown> };
    };
    ordinaryInteraction.proposal.payload = {
      operation: 'replace',
      version: 'v2',
      revisionLabel: 'draft wording',
    };

    const result = await test.bridge.emitEditIntent(
      ordinaryInteraction as unknown as XnlRichDocumentInteractionEditIntent,
    );

    expect(result.status).toBe('submitted');
    expect(test.translateInteraction).toHaveBeenCalledTimes(1);
  });

  it('rejects copyOrigins records with extra own fields instead of normalizing them', async () => {
    const test = harness({
      candidate: document([
        paragraph('paragraph.one', 'Hello'),
        paragraph('temporary.copy', 'Copy'),
      ]),
      materializer: () => ({
        status: 'materialized',
        candidate: document([
          paragraph('paragraph.one', 'Hello'),
          paragraph('temporary.copy', 'Copy'),
        ]),
        copyOrigins: [{
          candidateNodeId: id('temporary.copy'),
          sourceNodeId: id('paragraph.one'),
          extra: 'must-reject',
        }],
      } as unknown as XnlRichDocumentCandidateMaterializationResult),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(test.identityAllocator).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it.each([
    ['missing field', { candidateNodeId: id('temporary.copy') }],
    ['symbol field', Object.assign({
      candidateNodeId: id('temporary.copy'), sourceNodeId: id('paragraph.one'),
    }, { [Symbol('unsafe')]: true })],
    ['custom prototype', Object.assign(Object.create({ inherited: true }), {
      candidateNodeId: id('temporary.copy'), sourceNodeId: id('paragraph.one'),
    })],
    ['prototype-pollution field', Object.defineProperty({
      candidateNodeId: id('temporary.copy'), sourceNodeId: id('paragraph.one'),
    }, '__proto__', {
      enumerable: true, value: { candidateNodeId: id('laundered') },
    })],
  ])('rejects malformed copyOrigins record: %s', async (_label, origin) => {
    const test = harness({
      materializer: () => ({
        status: 'materialized',
        candidate: document(),
        copyOrigins: [origin],
      } as unknown as XnlRichDocumentCandidateMaterializationResult),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects accessor-backed copyOrigins fields without executing getters', async () => {
    let getterCalls = 0;
    const origin = Object.defineProperty({ sourceNodeId: id('paragraph.one') }, 'candidateNodeId', {
      enumerable: true,
      get() { getterCalls += 1; return id('temporary.copy'); },
    });
    const test = harness({
      materializer: () => ({
        status: 'materialized', candidate: document(), copyOrigins: [origin],
      } as unknown as XnlRichDocumentCandidateMaterializationResult),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(getterCalls).toBe(0);
    expect(test.submitted).toHaveLength(0);
  });

  it.each([
    ['extra revision-authority key', () => {
      const origins = [{
        candidateNodeId: id('temporary.copy'),
        sourceNodeId: id('paragraph.one'),
      }];
      Object.defineProperty(origins, 'baseLiveRevision', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: revision('live:array-authority'),
      });
      return origins;
    }],
    ['custom prototype', () => {
      const origins = [{
        candidateNodeId: id('temporary.copy'),
        sourceNodeId: id('paragraph.one'),
      }];
      Object.setPrototypeOf(origins, Object.create(Array.prototype));
      return origins;
    }],
    ['symbol key', () => Object.assign([{
      candidateNodeId: id('temporary.copy'),
      sourceNodeId: id('paragraph.one'),
    }], { [Symbol('authority')]: true })],
    ['hole', () => {
      const origins = new Array(1);
      return origins;
    }],
    ['revoked proxy', () => {
      const revocable = Proxy.revocable([{
        candidateNodeId: id('temporary.copy'),
        sourceNodeId: id('paragraph.one'),
      }], {});
      revocable.revoke();
      return revocable.proxy;
    }],
  ])('rejects non-standard copyOrigins array shape: %s', async (_label, createOrigins) => {
    const test = harness({
      materializer: () => ({
        status: 'materialized',
        candidate: document([
          paragraph('paragraph.one', 'Hello'),
          paragraph('temporary.copy', 'Copy'),
        ]),
        copyOrigins: createOrigins(),
      } as unknown as XnlRichDocumentCandidateMaterializationResult),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(test.identityAllocator).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects accessor-backed array entries without reading the accessor', async () => {
    let getterCalls = 0;
    const origins: unknown[] = [];
    Object.defineProperty(origins, '0', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return {
          candidateNodeId: id('temporary.copy'),
          sourceNodeId: id('paragraph.one'),
        };
      },
    });
    const test = harness({
      materializer: () => ({
        status: 'materialized',
        candidate: document(),
        copyOrigins: origins,
      } as unknown as XnlRichDocumentCandidateMaterializationResult),
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(getterCalls).toBe(0);
    expect(test.submitted).toHaveLength(0);
  });

  it.each([
    ['arbitrary extra field', () => ({ extra: 'must-reject' })],
    ['revision authority', () => ({ baseLiveRevision: revision('live:materializer-authority') })],
    ['host authority', () => ({ submit: async () => undefined })],
    ['symbol field', () => ({ [Symbol('authority')]: true })],
  ])('rejects materialized results with an extra top-level %s', async (_label, createExtra) => {
    const materialized = Object.assign({
      status: 'materialized' as const,
      candidate: document([
        paragraph('paragraph.one', 'Hello'),
        paragraph('temporary.new', 'New'),
      ]),
    }, createExtra());
    const test = harness({
      materializer: () => materialized as unknown as XnlRichDocumentCandidateMaterializationResult,
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(test.identityAllocator).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects custom-prototype materialized results', async () => {
    const materialized = Object.assign(Object.create({ inheritedAuthority: true }), {
      status: 'materialized' as const,
      candidate: document([
        paragraph('paragraph.one', 'Hello'),
        paragraph('temporary.new', 'New'),
      ]),
    });
    const test = harness({
      materializer: () => materialized as XnlRichDocumentCandidateMaterializationResult,
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(test.identityAllocator).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it('rejects accessor-backed materialized result fields without executing getters', async () => {
    let getterCalls = 0;
    const materialized = Object.defineProperty({ status: 'materialized' }, 'candidate', {
      configurable: true,
      enumerable: true,
      get() { getterCalls += 1; return document(); },
    });
    const test = harness({
      materializer: () => materialized as unknown as XnlRichDocumentCandidateMaterializationResult,
    });

    const result = await test.bridge.emitEditIntent(interaction());

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(getterCalls).toBe(0);
    expect(test.identityAllocator).not.toHaveBeenCalled();
    expect(test.submitted).toHaveLength(0);
  });

  it('snapshots host source, proposal prefix and submission config at assembly', async () => {
    const hostInput = { source: { occurrenceId: 'document:original', xId: 'document.root' } };
    const hostConfig: {
      proposalIdPrefix: string;
      submission: { policy: { conflict: 'reject'; diagnostics: 'collect' | 'fail-fast' } };
    } = {
      proposalIdPrefix: 'proposal:original',
      submission: { policy: { conflict: 'reject', diagnostics: 'collect' } },
    };
    const test = harness({ hostInput, hostConfig });
    hostInput.source.occurrenceId = 'document:mutated';
    hostConfig.proposalIdPrefix = 'proposal:mutated';
    hostConfig.submission.policy.diagnostics = 'fail-fast';

    await test.bridge.emitEditIntent(interaction());

    expect(test.submitted[0]).toMatchObject({
      id: 'proposal:original:1',
      source: { occurrenceId: 'document:original', xId: 'document.root' },
    });
    expect(test.submittedConfigs[0]).toEqual({
      policy: { conflict: 'reject', diagnostics: 'collect' },
    });
  });

  it('returns deeply immutable concrete and RichDocument facts without mutating input', () => {
    const candidate = document([
      paragraph('paragraph.one', 'Hello'),
      { kind: 'blockquote', nodeId: id('quote.one'), children: [paragraph('paragraph.nested', 'Nested')] },
    ]);
    const before = structuredClone(candidate);
    const result = materializeXnlRichDocument(candidate);

    expect(candidate).toEqual(before);
    expect(result.status).toBe('materialized');
    if (result.status === 'materialized') {
      expect(Object.isFrozen(result.document)).toBe(true);
      expect(Object.isFrozen((result.document as { body?: unknown[] }).body)).toBe(true);
      expect(Object.isFrozen(result.richDocument)).toBe(true);
      expect(Object.isFrozen(result.richDocument.children)).toBe(true);
      expect(Object.isFrozen(result.richDocument.children[1])).toBe(true);
    }
  });

  it('exposes only the adapter edit grant at runtime', () => {
    const test = harness();
    expect(Object.keys(test.bridge)).toEqual(['emitEditIntent']);
    expect(test.bridge).not.toHaveProperty('submit');
    expect(test.bridge).not.toHaveProperty('session');
    expect(test.bridge).not.toHaveProperty('currentRevision');
    expect(test.bridge).not.toHaveProperty('identityAllocator');
  });
});
