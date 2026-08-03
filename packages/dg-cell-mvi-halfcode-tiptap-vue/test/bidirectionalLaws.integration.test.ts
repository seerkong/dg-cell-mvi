import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import type {
  XnlAuthoringLiveRevision,
  XnlAuthoringProposal,
  XnlAuthoringRuntime,
  XnlProjectionCommandResult,
  XnlProjectionInteraction,
  XnlRichDocument,
  XnlRichDocumentCopyOrigin,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentIdentityAllocationRequest,
  XnlRichDocumentIdentityAllocationResult,
} from 'dg-cell-mvi-halfcode-contract';
import {
  classifyXnlRichDocumentIdentity,
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  translateXnlProjectionInteraction,
  type XnlProjectionCompilerDialect,
} from 'dg-cell-mvi-halfcode-logic';
import {
  adaptXnlNodeToRichDocument,
  createXnlAuthoringSessionFactory,
  createXnlCoreAuthoringMutationPort,
  createXnlProjectionRootInput,
  createXnlRichDocumentAuthoringDomainPort,
  createXnlRichDocumentProjectionDialect,
  createXnlRichDocumentTrustedAuthoringHost,
  materializeXnlRichDocument,
  type XnlCoreAuthoringMutation,
  type XnlRichDocumentCandidateMaterializationResult,
  type XnlRichDocumentInteractionEditIntent,
  type XnlRichDocumentReplaceDocumentCommand,
} from 'dg-cell-mvi-halfcode-support';
import { createXnlAuthoringMemoryPersistenceFixture } from '../../dg-cell-mvi-halfcode-support/test-fixtures/xnlAuthoringMemoryPersistence';
import {
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
  createXnlRichDocumentTiptapSchema,
  normalizeTiptapTransaction,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from '../src';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const TIPTAP_CONFIG = Object.freeze({
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
});

type ConcreteDocument = Parameters<typeof createXnlAuthoringMemoryPersistenceFixture>[0];

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function paragraph(id: string, text: string): XnlRichDocument['children'][number] {
  return {
    kind: 'paragraph',
    nodeId: nodeId(id),
    content: [{ kind: 'text', text }],
  };
}

function fixtureDocument(children: XnlRichDocument['children'] = [
  paragraph('paragraph.alpha', 'Alpha'),
  paragraph('paragraph.beta', 'Beta'),
]): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: nodeId('document.laws'),
    children,
  };
}

function concrete(document: XnlRichDocument): ConcreteDocument {
  const result = materializeXnlRichDocument(document);
  if (result.status !== 'materialized') {
    throw new Error(`Fixture did not materialize: ${result.diagnostics.map((item) => item.message).join('; ')}`);
  }
  return result.document;
}

function rich(document: Readonly<ConcreteDocument>): XnlRichDocument {
  const result = adaptXnlNodeToRichDocument(document as ConcreteDocument);
  if (result.status !== 'normalized') {
    throw new Error(`Concrete XNL did not lower: ${result.diagnostics.map((item) => item.message).join('; ')}`);
  }
  return result.document;
}

function project(document: XnlRichDocument) {
  const result = projectTiptapDocument(EMPTY, { document }, TIPTAP_CONFIG);
  if (result.status !== 'projected') {
    throw new Error(`RichDocument did not project: ${result.diagnostics.map((item) => item.message).join('; ')}`);
  }
  return result.document;
}

function parse(document: ReturnType<typeof project>): XnlRichDocument {
  const result = parseTiptapDocument(EMPTY, { document }, TIPTAP_CONFIG);
  if (result.status !== 'parsed') {
    throw new Error(`Tiptap JSON did not parse: ${result.diagnostics.map((item) => item.message).join('; ')}`);
  }
  return result.document;
}

function editorState(document: XnlRichDocument): EditorState {
  const schema = createXnlRichDocumentTiptapSchema();
  if (schema.status !== 'ready') throw new Error('Expected the canonical Tiptap schema.');
  return EditorState.create({
    schema: schema.schema,
    doc: schema.schema.nodeFromJSON(project(document)),
  });
}

function positionInDocument(document: EditorState['doc'], id: string): number {
  let position = -1;
  document.descendants((node, current) => {
    if (position < 0 && node.attrs.nodeId === id) position = current;
  });
  if (position < 0) throw new Error(`Missing Tiptap node "${id}".`);
  return position;
}

function positionOf(state: EditorState, id: string): number {
  return positionInDocument(state.doc, id);
}

function normalizeTransaction(state: EditorState, transaction: EditorState['tr']) {
  const result = normalizeTiptapTransaction(EMPTY, { transaction }, {
    ...TIPTAP_CONFIG,
    planNodeId: 'xnlp:node:document.laws',
  });
  if (result.status !== 'normalized') {
    throw new Error(`Transaction did not normalize: ${result.status} ${
      result.status === 'rejected'
        ? result.diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')
        : ''
    }`);
  }
  return result.intent;
}

function createTranslationDialect(): XnlProjectionCompilerDialect<ConcreteDocument> {
  const base = createXnlRichDocumentProjectionDialect();
  return {
    ...base,
    id: 'xnl-rich-document.t4-1-law-translator',
    translateInteraction: (_runtime, input): XnlProjectionCommandResult => {
      if (input.interaction.type !== 'xnl.rich-document.edit') {
        return {
          status: 'unsupported',
          diagnostics: [{
            severity: 'error',
            code: 'UNSUPPORTED_T4_1_INTERACTION',
            message: `Unsupported interaction "${input.interaction.type}".`,
          }],
        };
      }
      return {
        status: 'translated',
        command: {
          type: 'xnl.rich-document.apply-interaction',
          target: input.planNode.domain,
          ...(input.interaction.payload === undefined
            ? {}
            : { payload: input.interaction.payload }),
          provenance: { interactionType: input.interaction.type },
        },
      };
    },
  };
}

interface MaterializationFixture {
  readonly candidate: XnlRichDocument;
  readonly copyOrigins?: readonly XnlRichDocumentCopyOrigin[];
}

interface LawHarness {
  readonly persistence: ReturnType<typeof createXnlAuthoringMemoryPersistenceFixture>;
  readonly session: Awaited<ReturnType<ReturnType<typeof createXnlAuthoringSessionFactory<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >>['open']>>;
  readonly bridge: ReturnType<typeof createXnlRichDocumentTrustedAuthoringHost>;
  readonly translator: Mock<
    [unknown, Readonly<{ interaction: XnlProjectionInteraction }>],
    Promise<XnlProjectionCommandResult>
  >;
  readonly materializer: Mock<[], Promise<XnlRichDocumentCandidateMaterializationResult>>;
  readonly allocator: Mock<
    [unknown, XnlRichDocumentIdentityAllocationRequest],
    Promise<XnlRichDocumentIdentityAllocationResult>
  >;
  readonly submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[];
  readonly mutations: XnlCoreAuthoringMutation[][];
  delayNextTranslation(gate: Promise<void>): void;
  setMaterialization(fixture: MaterializationFixture): void;
  setMaterializationResult(result: XnlRichDocumentCandidateMaterializationResult): void;
  setTranslation(result: XnlProjectionCommandResult | undefined): void;
}

async function openHarness(initial: XnlRichDocument): Promise<LawHarness> {
  const initialConcrete = concrete(initial);
  const persistenceFixture = createXnlAuthoringMemoryPersistenceFixture(initialConcrete);
  const mutationPort = createXnlCoreAuthoringMutationPort<XnlRichDocumentReplaceDocumentCommand>();
  const mutations: XnlCoreAuthoringMutation[][] = [];
  let liveSequence = 0;
  const runtime: XnlAuthoringRuntime<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  > = {
    domain: createXnlRichDocumentAuthoringDomainPort(),
    mutations: {
      diff: async (owner, input, config) => {
        const result = await mutationPort.diff(owner, input, config);
        mutations.push([...result]);
        return result;
      },
      dryRun: mutationPort.dryRun,
    },
    persistence: persistenceFixture.persistence as XnlAuthoringRuntime<
      ConcreteDocument,
      XnlRichDocumentReplaceDocumentCommand,
      XnlCoreAuthoringMutation
    >['persistence'],
    revision: {
      nextLiveRevision: (_owner, input): XnlAuthoringLiveRevision => ({
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session:t4-1-laws',
        value: `live:${++liveSequence}:${input.current?.value ?? 'open'}`,
      }),
    },
    invalidation: { publish: () => undefined },
  };
  const session = await createXnlAuthoringSessionFactory<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >().open(runtime, { id: 'session:t4-1-laws' }, {});

  const dialect = createTranslationDialect();
  const projectionRuntime = createXnlProjectionCompilerRuntime({ dialects: [dialect] });
  const plan = compileXnlProjection(
    projectionRuntime,
    createXnlProjectionRootInput(initialConcrete),
    { planId: 't4-1-laws' },
  );
  let materialization: MaterializationFixture = { candidate: initial };
  let materializationResult: XnlRichDocumentCandidateMaterializationResult | undefined;
  let translationOverride: XnlProjectionCommandResult | undefined;
  let translationGate: Promise<void> | undefined;
  let allocationSequence = 0;
  const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];
  const translator = vi.fn(async (
    _owner: unknown,
    input: Readonly<{ interaction: XnlProjectionInteraction }>,
  ) => {
    const gate = translationGate;
    translationGate = undefined;
    if (gate !== undefined) await gate;
    return translationOverride ?? translateXnlProjectionInteraction(projectionRuntime, {
      planNode: plan.root,
      interaction: {
        ...input.interaction,
        target: { ...input.interaction.target, planNodeId: plan.root.id },
      },
    }, {});
  });
  const materializer = vi.fn(async () => materializationResult ?? ({
    status: 'materialized' as const,
    candidate: materialization.candidate,
    ...(materialization.copyOrigins === undefined
      ? {}
      : { copyOrigins: materialization.copyOrigins }),
  } satisfies XnlRichDocumentCandidateMaterializationResult));
  const allocator = vi.fn<
    [unknown, XnlRichDocumentIdentityAllocationRequest],
    Promise<XnlRichDocumentIdentityAllocationResult>
  >(async (
    _owner: unknown,
    request: XnlRichDocumentIdentityAllocationRequest,
  ) => ({
    status: 'allocated' as const,
    requestId: request.requestId,
    nodeId: nodeId(`allocated.${request.reason}.id${++allocationSequence}`),
    freshness: 'fresh' as const,
  }));
  const bridge = createXnlRichDocumentTrustedAuthoringHost({
    proposal: {
      state: session.proposal.state,
      subscribe: session.proposal.subscribe,
      submit: async (proposal, config) => {
        submitted.push(proposal);
        return session.proposal.submit(proposal, config);
      },
    },
    translateInteraction: translator,
    materializeInteraction: materializer,
    identityAllocator: allocator,
  }, {
    source: { occurrenceId: 'document:t4-1-laws', xId: 'document.laws' },
  }, {
    proposalIdPrefix: 'proposal:t4-1-laws',
  });

  return {
    persistence: persistenceFixture,
    session,
    bridge,
    translator,
    materializer,
    allocator,
    submitted,
    mutations,
    delayNextTranslation(gate) { translationGate = gate; },
    setMaterialization(fixture) {
      materialization = fixture;
      materializationResult = undefined;
    },
    setMaterializationResult(result) { materializationResult = result; },
    setTranslation(result) { translationOverride = result; },
  };
}

function readIntentKeys(intent: XnlRichDocumentInteractionEditIntent): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      visit(child);
    }
  };
  visit(intent);
  return keys;
}

describe('T4.1 bidirectional document laws', () => {
  it('satisfies canonical GetPut through concrete XNL, RichDocument and Tiptap JSON', () => {
    const source = concrete(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    const lowered = rich(source);
    const parsed = parse(project(lowered));
    const put = concrete(parsed);

    expect(lowered).toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(parsed).toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(rich(put)).toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(parsed.children.map((node) => node.nodeId)).toEqual(
      XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children.map((node) => node.nodeId),
    );
    expect((parsed.children[0] as { content: unknown }).content).toEqual(
      (XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children[0] as { content: unknown }).content,
    );
  });

  it('satisfies accepted PutGet through a real transaction, trusted host, persistence reload and reproject', async () => {
    const initial = fixtureDocument();
    const harness = await openHarness(initial);
    const state = editorState(initial);
    const alpha = positionOf(state, 'paragraph.alpha');
    const transaction = state.tr.insertText('!', alpha + 1 + 'Alpha'.length);
    const intent = normalizeTransaction(state, transaction);
    const transactionCandidate = parse(transaction.doc.toJSON());
    const concurrent = fixtureDocument([
      paragraph('paragraph.alpha', 'Alpha'),
      paragraph('paragraph.beta', 'Beta accepted concurrently'),
    ]);
    const candidate = fixtureDocument([
      paragraph('paragraph.alpha', 'Alpha!'),
      paragraph('paragraph.beta', 'Beta accepted concurrently'),
    ]);
    expect(transactionCandidate.children[0]).toEqual(candidate.children[0]);
    harness.setMaterialization({ candidate });

    const before = harness.session.proposal.state();
    let releaseTranslation!: () => void;
    harness.delayNextTranslation(new Promise<void>((resolve) => { releaseTranslation = resolve; }));
    const pending = harness.bridge.emitEditIntent(intent);
    const concurrentResult = await harness.session.proposal.submit({
      kind: 'xnl-authoring-proposal',
      id: 'proposal:concurrent-before-submission',
      baseLiveRevision: before.accepted.liveRevision,
      command: {
        kind: 'xnl-rich-document-replace-document',
        document: concrete(concurrent),
      },
    }, {});
    expect(concurrentResult).toMatchObject({
      status: 'accepted',
      persistence: { status: 'applied' },
    });
    if (concurrentResult.status !== 'accepted') throw new Error('Expected concurrent acceptance.');
    releaseTranslation();
    const result = await pending;

    expect(result.status).toBe('submitted');
    if (result.status !== 'submitted') throw new Error('Expected trusted host submission.');
    expect(result.result).toMatchObject({
      status: 'accepted',
      persistence: { status: 'applied' },
    });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.submitted).toHaveLength(1);
    expect(harness.submitted[0]?.baseLiveRevision).toEqual(concurrentResult.accepted.liveRevision);
    expect(harness.submitted[0]?.baseLiveRevision).not.toEqual(before.accepted.liveRevision);
    const intentKeys = readIntentKeys(intent);
    for (const forbidden of [
      'revision',
      'baseLiveRevision',
      'command',
      'session',
      'allocator',
    ]) {
      expect(intentKeys.has(forbidden)).toBe(false);
    }
    const textMutation = harness.mutations.flat().find((mutation) => (
      mutation.type === 'OBJECT_UPDATE' && JSON.stringify(mutation).includes('Alpha!')
    ));
    expect(textMutation).toBeDefined();
    expect(JSON.stringify(textMutation)).toContain('paragraph.alpha');
    expect(JSON.stringify(textMutation)).toContain('Alpha!');

    const persisted = harness.persistence.read();
    const persistedRich = rich(persisted.snapshot);
    const reprojected = parse(project(persistedRich));
    expect(reprojected).toEqual(candidate);
    const first = reprojected.children[0];
    expect(first?.kind).toBe('paragraph');
    if (first?.kind !== 'paragraph') throw new Error('Expected the edited paragraph.');
    expect(first.content[0]?.text).toBe('Alpha!');
  });

  it('keeps command, stale, rejected and lossy failures before acceptance from advancing either truth', async () => {
    const initial = fixtureDocument();
    const harness = await openHarness(initial);
    const initialState = harness.session.proposal.state();
    const initialPersisted = harness.persistence.read();

    const command = await harness.bridge.emitEditIntent({
      kind: 'command',
      proposal: {
        type: 'xnl.rich-document.apply-interaction',
        target: { path: [], nodeId: 'document.laws' },
      },
    } as never);
    expect(command).toMatchObject({ status: 'rejected', stage: 'interaction' });
    expect(harness.translator).not.toHaveBeenCalled();

    const stale = await harness.session.proposal.submit({
      kind: 'xnl-authoring-proposal',
      id: 'proposal:stale',
      baseLiveRevision: { ...initialState.accepted.liveRevision, value: 'live:stale' },
      command: {
        kind: 'xnl-rich-document-replace-document',
        document: concrete(fixtureDocument([paragraph('paragraph.alpha', 'Stale')])),
      },
    }, {});
    expect(stale).toMatchObject({ status: 'conflict', reason: 'stale-live-revision' });

    harness.setTranslation({
      status: 'rejected',
      diagnostics: [{ severity: 'error', code: 'REJECTED_T4_1_EDIT', message: 'Rejected.' }],
    });
    const interaction: XnlRichDocumentInteractionEditIntent = {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:document.laws' },
        payload: { version: 1, edits: [] },
      },
    };
    expect(await harness.bridge.emitEditIntent(interaction)).toMatchObject({
      status: 'rejected',
      stage: 'translation',
    });

    harness.setTranslation(undefined);
    const lossy = parseTiptapDocument(EMPTY, {
      document: {
        type: 'doc',
        attrs: { nodeId: 'document.laws', html: '<p>lossy</p>' },
        content: [],
      },
    }, TIPTAP_CONFIG);
    expect(lossy.status).toBe('rejected');
    harness.setMaterializationResult({
      status: 'rejected',
      diagnostics: [{
        severity: 'error',
        code: 'UNSUPPORTED_CONSTRUCT',
        message: lossy.status === 'rejected'
          ? lossy.diagnostics.map((item) => item.message).join('; ')
          : 'Expected a lossy parse rejection.',
      }],
    });
    expect(await harness.bridge.emitEditIntent(interaction)).toMatchObject({
      status: 'rejected',
      stage: 'materialization',
    });

    expect(harness.session.proposal.state().accepted).toEqual(initialState.accepted);
    expect(harness.session.proposal.state().persistedRevision).toEqual(initialState.persistedRevision);
    expect(harness.persistence.read()).toEqual(initialPersisted);
  });

  it('keeps accepted live truth on persistence failure, reprojects it, blocks edits, then retries', async () => {
    const initial = fixtureDocument();
    const harness = await openHarness(initial);
    const candidate = fixtureDocument([
      paragraph('paragraph.alpha', 'Accepted but not persisted'),
      paragraph('paragraph.beta', 'Beta'),
    ]);
    harness.setMaterialization({ candidate });
    harness.persistence.failNextFlush('TEST_FLUSH_FAILED', 'Expected failure.');
    const before = harness.session.proposal.state();
    const persistedBefore = harness.persistence.read();
    const interaction: XnlRichDocumentInteractionEditIntent = {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:document.laws' },
        payload: { version: 1, edits: [{ kind: 'text', nodeId: 'paragraph.alpha' }] },
      },
    };

    const failed = await harness.bridge.emitEditIntent(interaction);
    expect(failed).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'failed' } },
    });
    const dirty = harness.session.proposal.state();
    expect(dirty.status).toBe('dirty-failed');
    expect(dirty.accepted.liveRevision).not.toEqual(before.accepted.liveRevision);
    expect(dirty.persistedRevision).toEqual(before.persistedRevision);
    expect(rich(dirty.accepted.document)).toEqual(candidate);
    expect(parse(project(rich(dirty.accepted.document)))).toEqual(candidate);
    expect(harness.persistence.read()).toEqual(persistedBefore);

    harness.setMaterialization({ candidate: fixtureDocument([paragraph('paragraph.alpha', 'Blocked')]) });
    const blocked = await harness.bridge.emitEditIntent(interaction);
    expect(blocked).toMatchObject({
      status: 'submitted',
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_SESSION_DIRTY' })],
      },
    });
    expect(harness.session.proposal.state().accepted).toEqual(dirty.accepted);
    expect(harness.persistence.read()).toEqual(persistedBefore);

    const retried = await harness.session.control.retryPersistence({
      expectedLiveRevision: dirty.accepted.liveRevision,
    });
    expect(retried).toMatchObject({
      status: 'accepted',
      persistence: { status: 'applied' },
    });
    expect(harness.session.proposal.state().status).toBe('ready');
    expect(rich(harness.persistence.read().snapshot)).toEqual(candidate);
  });

  it('preserves insert, copy, cross-parent move, replacement and multi-role identity laws', async () => {
    const accepted = fixtureDocument([
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.left'),
        children: [paragraph('paragraph.beta', 'Beta'), paragraph('paragraph.alpha', 'Alpha')],
      },
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.right'),
        children: [paragraph('paragraph.gamma', 'Gamma')],
      },
    ]);
    const candidate = fixtureDocument([
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.left'),
        children: [paragraph('temporary.replacement', 'Beta')],
      },
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.right'),
        children: [
          paragraph('paragraph.gamma', 'Gamma'),
          paragraph('paragraph.alpha', 'Alpha'),
          paragraph('temporary.copy', 'Alpha'),
          paragraph('temporary.insert', 'Inserted'),
        ],
      },
    ]);
    const classified = classifyXnlRichDocumentIdentity(EMPTY, {
      accepted,
      candidate,
      copyOrigins: [{
        candidateNodeId: nodeId('temporary.copy'),
        sourceNodeId: nodeId('paragraph.alpha'),
      }],
    }, EMPTY);
    expect(classified.status).toBe('classified');
    if (classified.status !== 'classified') throw new Error('Expected identity classification.');
    expect(classified.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ classification: 'new', nodeId: 'temporary.insert' }),
      expect.objectContaining({
        classification: 'copy',
        nodeId: 'temporary.copy',
        sourceNodeId: 'paragraph.alpha',
      }),
      expect.objectContaining({
        classification: 'move',
        nodeId: 'paragraph.alpha',
        payloadChanged: false,
      }),
      expect.objectContaining({
        classification: 'replacement',
        deletedNodeId: 'paragraph.beta',
        addedNodeId: 'temporary.replacement',
        operations: ['delete', 'add'],
        ordinaryIdUpdate: false,
      }),
    ]));

    const submitCase = async (
      makeTransaction: (editor: EditorState) => EditorState['tr'],
      materialization: MaterializationFixture,
    ) => {
      const editor = editorState(accepted);
      const intent = normalizeTransaction(editor, makeTransaction(editor));
      expect(intent.kind).toBe('interaction');
      expect(intent.proposal.type).toBe('xnl.rich-document.edit');
      const harness = await openHarness(accepted);
      harness.setMaterialization(materialization);
      const submitted = await harness.bridge.emitEditIntent(intent);
      if (submitted.status === 'rejected') {
        throw new Error(`Trusted host rejected ${submitted.stage}: ${
          submitted.diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')
        }`);
      }
      expect(submitted).toMatchObject({
        status: 'submitted',
        result: { status: 'accepted', persistence: { status: 'applied' } },
      });
      expect(harness.translator).toHaveBeenCalledTimes(1);
      const acceptedAfter = rich(harness.session.proposal.state().accepted.document);
      expect(rich(harness.persistence.read().snapshot)).toEqual(acceptedAfter);
      expect(harness.mutations.flat().some((mutation) => (
        mutation.type === 'OBJECT_UPDATE'
        && /(?:^|[.\[])id(?:$|[.\]])/.test(JSON.stringify(mutation.path))
      ))).toBe(false);
      return { harness, intent, acceptedAfter };
    };

    const insertedCandidate = fixtureDocument([
      accepted.children[0]!,
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.right'),
        children: [paragraph('paragraph.gamma', 'Gamma'), paragraph('temporary.insert', 'Inserted')],
      },
    ]);
    const inserted = await submitCase((editor) => {
      const transaction = editor.tr;
      const rightPosition = positionInDocument(transaction.doc, 'quote.right');
      const right = transaction.doc.nodeAt(rightPosition);
      if (right === null) throw new Error('Expected right quote.');
      return transaction.insert(rightPosition + right.nodeSize - 1, editor.schema.nodes.paragraph.create(
        { nodeId: 'untrusted.insert' },
        editor.schema.text('Inserted'),
      ));
    }, { candidate: insertedCandidate });
    expect(JSON.stringify(inserted.intent)).not.toContain('untrusted.insert');
    expect(inserted.harness.allocator).toHaveBeenCalledTimes(1);
    expect(inserted.harness.allocator.mock.calls[0]?.[1]).toMatchObject({ reason: 'new' });
    expect(JSON.stringify(inserted.acceptedAfter)).toContain('allocated.new.id1');

    const copiedCandidate = fixtureDocument([
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.left'),
        children: [
          paragraph('paragraph.beta', 'Beta'),
          paragraph('temporary.copy', 'Alpha'),
          paragraph('paragraph.alpha', 'Alpha'),
        ],
      },
      accepted.children[1]!,
    ]);
    const copied = await submitCase((editor) => {
      const alphaPosition = positionOf(editor, 'paragraph.alpha');
      const alpha = editor.doc.nodeAt(alphaPosition);
      if (alpha === null) throw new Error('Expected alpha paragraph.');
      return editor.tr.insert(alphaPosition, alpha);
    }, {
      candidate: copiedCandidate,
      copyOrigins: [{
        candidateNodeId: nodeId('temporary.copy'),
        sourceNodeId: nodeId('paragraph.alpha'),
      }],
    });
    expect(copied.harness.allocator).toHaveBeenCalledTimes(1);
    expect(copied.harness.allocator.mock.calls[0]?.[1]).toMatchObject({
      reason: 'copy',
      sourceNodeId: 'paragraph.alpha',
    });
    expect(JSON.stringify(copied.intent)).not.toContain('"nodeId":"paragraph.alpha"');
    expect(JSON.stringify(copied.acceptedAfter)).toContain('allocated.copy.id1');

    const movedCandidate = fixtureDocument([
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.left'),
        children: [paragraph('paragraph.beta', 'Beta')],
      },
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.right'),
        children: [paragraph('paragraph.gamma', 'Gamma'), paragraph('paragraph.alpha', 'Alpha')],
      },
    ]);
    const moved = await submitCase((editor) => {
      const alphaPosition = positionOf(editor, 'paragraph.alpha');
      const alpha = editor.doc.nodeAt(alphaPosition);
      if (alpha === null) throw new Error('Expected alpha paragraph.');
      const transaction = editor.tr.delete(alphaPosition, alphaPosition + alpha.nodeSize);
      const rightPosition = positionInDocument(transaction.doc, 'quote.right');
      const right = transaction.doc.nodeAt(rightPosition);
      if (right === null) throw new Error('Expected right quote.');
      return transaction.insert(rightPosition + right.nodeSize - 1, alpha);
    }, { candidate: movedCandidate });
    expect(moved.harness.allocator).not.toHaveBeenCalled();
    expect(JSON.stringify(moved.acceptedAfter)).toContain('paragraph.alpha');
    expect(moved.harness.mutations.flat().map((mutation) => mutation.type))
      .toContain('TREE_MOVE_CROSS_LEVEL');

    const replacementCandidate = fixtureDocument([
      {
        kind: 'blockquote',
        nodeId: nodeId('quote.left'),
        children: [paragraph('temporary.replacement', 'Beta'), paragraph('paragraph.alpha', 'Alpha')],
      },
      accepted.children[1]!,
    ]);
    const replaced = await submitCase((editor) => {
      const betaPosition = positionOf(editor, 'paragraph.beta');
      const beta = editor.doc.nodeAt(betaPosition);
      if (beta === null) throw new Error('Expected beta paragraph.');
      return editor.tr.setNodeMarkup(betaPosition, undefined, {
        ...beta.attrs,
        nodeId: 'untrusted.replacement',
      });
    }, { candidate: replacementCandidate });
    expect(JSON.stringify(replaced.intent)).not.toContain('untrusted.replacement');
    expect(replaced.harness.allocator).toHaveBeenCalledTimes(1);
    expect(replaced.harness.allocator.mock.calls[0]?.[1]).toMatchObject({ reason: 'new' });
    const replacementMutationTypes = replaced.harness.mutations.flat().map((mutation) => mutation.type);
    expect(replacementMutationTypes).toContain('TREE_DELETE');
    expect(replacementMutationTypes).toContain('TREE_ADD');
    expect(JSON.stringify(replaced.acceptedAfter)).not.toContain('paragraph.beta');
    expect(JSON.stringify(replaced.acceptedAfter)).toContain('allocated.new.id1');

    const main = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
      nodeId: nodeId('paragraph.alpha'),
      unitInstanceId: 'document-laws',
      role: 'main',
      roleCardinality: 'multiple',
      descriptor: { scopeId: 'scope:document-laws' },
    }, EMPTY);
    const summary = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
      nodeId: nodeId('paragraph.alpha'),
      unitInstanceId: 'document-laws',
      role: 'summary',
      roleCardinality: 'multiple',
      descriptor: { scopeId: 'scope:document-laws' },
    }, EMPTY);
    expect(main.status).toBe('assembled');
    expect(summary.status).toBe('assembled');
    if (main.status === 'assembled' && summary.status === 'assembled') {
      expect(main.occurrence.nodeId).toBe(summary.occurrence.nodeId);
      expect(main.occurrence.instanceRef.xId).not.toBe(summary.occurrence.instanceRef.xId);
    }
  });
});
