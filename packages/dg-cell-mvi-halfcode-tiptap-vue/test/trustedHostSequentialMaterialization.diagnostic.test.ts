import { EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import type {
  XnlAuthoringLiveRevision,
  XnlAuthoringPersistedRevision,
  XnlAuthoringProposal,
  XnlAuthoringRuntime,
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentNode,
} from 'dg-cell-mvi-halfcode-contract';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  classifyXnlRichDocumentIdentity,
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import {
  adaptXnlNodeToRichDocument,
  createXnlAuthoringSessionFactory,
  createXnlCoreAuthoringMutationPort,
  createXnlProjectionRootInput,
  createXnlRichDocumentAuthoringDomainPort,
  createXnlRichDocumentProjectionDialect,
  materializeXnlRichDocument,
  materializeXnlRichDocumentSemanticCandidate,
  translateXnlRichDocumentEditInteraction,
  type XnlCoreAuthoringMutation,
  type XnlRichDocumentInteractionEditIntent,
  type XnlRichDocumentReplaceDocumentCommand,
} from 'dg-cell-mvi-halfcode-support';
import {
  createXnlRichDocumentTiptapSchema,
  normalizeTiptapTransaction,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const TIPTAP_CONFIG = Object.freeze({
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
});

type ConcreteDocument = Extract<
  ReturnType<typeof materializeXnlRichDocument>,
  { status: 'materialized' }
>['document'];

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function concrete(value: XnlRichDocument): ConcreteDocument {
  const result = materializeXnlRichDocument(value);
  if (result.status !== 'materialized') throw new Error('RichDocument fixture did not materialize.');
  return result.document;
}

function rich(value: Readonly<ConcreteDocument>): XnlRichDocument {
  const result = adaptXnlNodeToRichDocument(value as ConcreteDocument);
  if (result.status !== 'normalized') throw new Error('Concrete XNL did not adapt to RichDocument.');
  return result.document;
}

function project(value: XnlRichDocument) {
  const result = projectTiptapDocument(EMPTY, { document: value }, TIPTAP_CONFIG);
  if (result.status !== 'projected') throw new Error('RichDocument did not project to Tiptap.');
  return result.document;
}

function parse(value: ReturnType<typeof project>): XnlRichDocument {
  const result = parseTiptapDocument(EMPTY, { document: value }, TIPTAP_CONFIG);
  if (result.status !== 'parsed') throw new Error('Tiptap document did not parse to RichDocument.');
  return result.document;
}

function editorState(value: XnlRichDocument): EditorState {
  const schema = createXnlRichDocumentTiptapSchema();
  if (schema.status !== 'ready') throw new Error('Expected the canonical Tiptap schema.');
  return EditorState.create({
    schema: schema.schema,
    doc: schema.schema.nodeFromJSON(project(value)),
  });
}

function positionOf(value: ProseMirrorNode, id: string): number {
  let position = -1;
  value.descendants((node, current) => {
    if (position < 0 && node.attrs.nodeId === id) position = current;
  });
  if (position < 0) throw new Error(`Missing Tiptap node "${id}".`);
  return position;
}

function nodeAt(value: ProseMirrorNode, id: string): ProseMirrorNode {
  const found = value.nodeAt(positionOf(value, id));
  if (found === null) throw new Error(`Missing Tiptap node "${id}".`);
  return found;
}

function normalize(
  transaction: EditorState['tr'],
  planNodeId: string,
): XnlRichDocumentInteractionEditIntent {
  const result = normalizeTiptapTransaction(EMPTY, { transaction }, {
    ...TIPTAP_CONFIG,
    planNodeId,
  });
  if (result.status !== 'normalized') throw new Error(`Transaction normalization returned ${result.status}.`);
  return result.intent;
}

function translate(intent: XnlRichDocumentInteractionEditIntent, planNodeId: string): XnlRichDocumentEditCommand {
  const initialConcrete = concrete(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
  const projectionRuntime = createXnlProjectionCompilerRuntime({
    dialects: [createXnlRichDocumentProjectionDialect()],
  });
  const plan = compileXnlProjection(
    projectionRuntime,
    createXnlProjectionRootInput(initialConcrete),
    { planId: 'sequential-diagnostic' },
  );
  expect(plan.root.id).toBe(planNodeId);
  const result = translateXnlRichDocumentEditInteraction(EMPTY, {
    planNode: plan.root,
    interaction: intent.proposal,
  }, EMPTY);
  if (result.status !== 'translated') throw new Error(`Translation returned ${result.status}.`);
  return result.command as XnlRichDocumentEditCommand;
}

function planNodeIdForInitial(): string {
  const projectionRuntime = createXnlProjectionCompilerRuntime({
    dialects: [createXnlRichDocumentProjectionDialect()],
  });
  return compileXnlProjection(
    projectionRuntime,
    createXnlProjectionRootInput(concrete(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE)),
    { planId: 'sequential-diagnostic' },
  ).root.id;
}

function persistentNode(document: XnlRichDocument, id: string): Exclude<XnlRichDocumentNode, { kind: 'text' }> {
  let found: Exclude<XnlRichDocumentNode, { kind: 'text' }> | undefined;
  const visit = (node: XnlRichDocumentNode) => {
    if (node.kind === 'text') return;
    if (node.nodeId === nodeId(id)) found = node;
    if ('children' in node) node.children.forEach(visit);
  };
  visit(document);
  if (found === undefined) throw new Error(`Missing RichDocument node "${id}".`);
  return found;
}

async function materialize(accepted: XnlRichDocument, command: XnlRichDocumentEditCommand) {
  return materializeXnlRichDocumentSemanticCandidate(EMPTY, { accepted, command }, EMPTY);
}

function createPersistence(initial: ConcreteDocument) {
  let snapshot = structuredClone(initial);
  let sequence = 0;
  let revision: XnlAuthoringPersistedRevision = {
    kind: 'xnl-authoring-persisted-revision',
    authorityId: 'authority:sequential-diagnostic',
    value: 'vfs:0',
  };
  const persistence: XnlAuthoringRuntime<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >['persistence'] = {
    read: async () => ({
      status: 'loaded',
      document: structuredClone(snapshot),
      persistedRevision: revision,
    }),
    persist: async (_runtime, input) => {
      const previousRevision = revision;
      revision = {
        kind: 'xnl-authoring-persisted-revision',
        authorityId: 'authority:sequential-diagnostic',
        value: `vfs:${++sequence}`,
      };
      snapshot = structuredClone(input.document) as ConcreteDocument;
      return {
        status: 'applied',
        persistedRevision: revision,
        receipt: {
          kind: 'xnl-authoring-persistence-receipt',
          previousRevision,
          currentRevision: revision,
          persistedAt: '2026-08-03T00:00:00.000Z',
          durability: 'memory',
        },
      };
    },
  };
  return persistence;
}

async function openSession(initial: XnlRichDocument) {
  let liveSequence = 0;
  const mutationPort = createXnlCoreAuthoringMutationPort<XnlRichDocumentReplaceDocumentCommand>();
  const runtime: XnlAuthoringRuntime<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  > = {
    domain: createXnlRichDocumentAuthoringDomainPort(),
    mutations: mutationPort,
    persistence: createPersistence(concrete(initial)),
    revision: {
      nextLiveRevision: (_owner, input): XnlAuthoringLiveRevision => ({
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session:sequential-diagnostic',
        value: `live:${++liveSequence}:${input.current?.value ?? 'open'}`,
      }),
    },
    invalidation: { publish: () => undefined },
  };
  return createXnlAuthoringSessionFactory<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >().open(runtime, { id: 'session:sequential-diagnostic' }, {});
}

async function submitCandidate(
  session: Awaited<ReturnType<typeof openSession>>,
  proposalId: string,
  document: ConcreteDocument,
) {
  const proposal: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand> = {
    kind: 'xnl-authoring-proposal',
    id: proposalId,
    baseLiveRevision: session.proposal.state().accepted.liveRevision,
    command: {
      kind: 'xnl-rich-document-replace-document',
      document,
    },
  };
  return session.proposal.submit(proposal, {});
}

describe('trusted-host sequential materialization diagnostics', () => {
  it('keeps the second interaction table snapshot canonical before identity, concrete XNL and submit', async () => {
    const initial = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE;
    const planNodeId = planNodeIdForInitial();
    const session = await openSession(initial);

    const firstState = editorState(initial);
    const firstIntroduction = positionOf(firstState.doc, 'paragraph.introduction') + 1;
    const firstCommand = translate(
      normalize(firstState.tr.insertText('Accepted ', firstIntroduction), planNodeId),
      planNodeId,
    );
    const firstMaterialized = await materialize(initial, firstCommand);
    if (firstMaterialized.status !== 'materialized') throw new Error(JSON.stringify(firstMaterialized));
    const firstConcrete = materializeXnlRichDocument(firstMaterialized.candidate);
    if (firstConcrete.status !== 'materialized') throw new Error(JSON.stringify(firstConcrete));
    const firstSubmit = await submitCandidate(session, 'proposal:sequential-diagnostic:first', firstConcrete.document);
    expect(firstSubmit).toMatchObject({ status: 'accepted', persistence: { status: 'applied' } });
    const acceptedAfterFirst = rich(session.proposal.state().accepted.document);

    const secondState = editorState(acceptedAfterFirst);
    expect(parse(secondState.doc.toJSON() as ReturnType<typeof project>)).toEqual(acceptedAfterFirst);
    const secondTableCellPosition = positionOf(secondState.doc, 'tablecell.capability.value');
    const secondTableCell = nodeAt(secondState.doc, 'tablecell.capability.value');
    const secondCommand = translate(
      normalize(
        secondState.tr.setNodeMarkup(
          secondTableCellPosition,
          undefined,
          { ...secondTableCell.attrs, colspan: 2 },
        ),
        planNodeId,
      ),
      planNodeId,
    );
    const secondEdit = secondCommand.payload.edits[0];
    if (secondEdit?.kind !== 'table') throw new Error('Expected the second command to be a table edit.');

    const acceptedTable = persistentNode(acceptedAfterFirst, 'table.capabilities');
    const commandBeforeCell = persistentNode(
      {
        kind: 'document',
        nodeId: nodeId('document.before'),
        children: [secondEdit.before as XnlRichDocument['children'][number]],
      },
      'tablecell.capability.value',
    );
    const acceptedCell = persistentNode(
      {
        kind: 'document',
        nodeId: nodeId('document.accepted'),
        children: [acceptedTable as XnlRichDocument['children'][number]],
      },
      'tablecell.capability.value',
    );
    expect(commandBeforeCell).not.toHaveProperty('colspan');
    expect(commandBeforeCell).not.toHaveProperty('rowspan');
    expect(acceptedCell).not.toHaveProperty('colspan');
    expect(acceptedCell).not.toHaveProperty('rowspan');
    expect(secondEdit.before).toEqual(acceptedTable);

    const canonicalMaterialized = await materialize(acceptedAfterFirst, secondCommand);
    expect(canonicalMaterialized).toMatchObject({ status: 'materialized' });
    if (canonicalMaterialized.status !== 'materialized') throw new Error(JSON.stringify(canonicalMaterialized));
    const identity = classifyXnlRichDocumentIdentity(EMPTY, {
      accepted: acceptedAfterFirst,
      candidate: canonicalMaterialized.candidate,
    }, EMPTY);
    expect(identity).toMatchObject({
      status: 'classified',
      changes: expect.arrayContaining([
        expect.objectContaining({ classification: 'update', nodeId: nodeId('tablecell.capability.value') }),
      ]),
    });
    const concreteSecond = materializeXnlRichDocument(canonicalMaterialized.candidate);
    expect(concreteSecond).toMatchObject({ status: 'materialized' });
    if (concreteSecond.status !== 'materialized') throw new Error(JSON.stringify(concreteSecond));
    const secondSubmit = await submitCandidate(
      session,
      'proposal:sequential-diagnostic:second-canonicalized',
      concreteSecond.document,
    );
    expect(secondSubmit).toMatchObject({ status: 'accepted', persistence: { status: 'applied' } });
    expect(rich(session.proposal.state().accepted.document)).toEqual(concreteSecond.richDocument);
  });

  it('keeps stale before facts fail-closed against the latest accepted baseline', async () => {
    const initial = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE;
    const planNodeId = planNodeIdForInitial();
    const firstState = editorState(initial);
    const firstIntroduction = positionOf(firstState.doc, 'paragraph.introduction') + 1;
    const firstCommand = translate(
      normalize(firstState.tr.insertText('Accepted ', firstIntroduction), planNodeId),
      planNodeId,
    );
    const firstMaterialized = await materialize(initial, firstCommand);
    if (firstMaterialized.status !== 'materialized') throw new Error(JSON.stringify(firstMaterialized));
    const acceptedAfterFirst = firstMaterialized.candidate;

    const staleState = editorState(initial);
    const staleIntroduction = positionOf(staleState.doc, 'paragraph.introduction') + 1;
    const staleCommand = translate(
      normalize(staleState.tr.insertText('STALE ', staleIntroduction), planNodeId),
      planNodeId,
    );

    const staleResult = await materialize(acceptedAfterFirst, staleCommand);
    expect(staleResult).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({
        code: 'LOSSY_CONSTRUCT',
        message: 'Inline before snapshot does not match the accepted baseline.',
        path: ['command', 'payload', 'edits', 0, 'before'],
        nodeId: nodeId('paragraph.introduction'),
      })],
    });
  });
});
