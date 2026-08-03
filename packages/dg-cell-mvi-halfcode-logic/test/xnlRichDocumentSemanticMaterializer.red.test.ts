import { describe, expect, it } from 'vitest';
import type {
  XnlProjectionCommandResult,
  XnlProjectionInteraction,
  XnlProjectionPlanNode,
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentSemanticTable,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
} from 'dg-cell-mvi-halfcode-contract';
import type { XnlProjectionCompilerDialect } from 'dg-cell-mvi-halfcode-logic';
import * as logicRoot from 'dg-cell-mvi-halfcode-logic';

const EMPTY = Object.freeze({});
const DOCUMENT_ID = nodeId('document.root');
const PARAGRAPH_ALPHA_ID = nodeId('paragraph.alpha');
const PARAGRAPH_BETA_ID = nodeId('paragraph.beta');
const TABLE_ID = nodeId('table.main');
const TABLE_ROW_ID = nodeId('table-row.main');
const TABLE_CELL_ID = nodeId('table-cell.main');
const TABLE_PARAGRAPH_ID = nodeId('paragraph.table');
const CODE_ID = nodeId('code.main');
const MERMAID_ID = nodeId('mermaid.main');

type CanonicalTranslator = (
  runtime: Readonly<Record<PropertyKey, never>>,
  input: Readonly<{
    planNode: XnlProjectionPlanNode;
    interaction: XnlProjectionInteraction;
  }>,
  config: Readonly<Record<PropertyKey, never>>,
) => XnlProjectionCommandResult | Promise<XnlProjectionCommandResult>;

type CanonicalDialectFactory = () => XnlProjectionCompilerDialect<unknown>;

const COMMAND_TARGET: XnlRichDocumentEditCommand['target'] = {
  path: [],
  nodeId: DOCUMENT_ID,
  tag: 'Document',
  role: 'document',
};

const PLAN_NODE: XnlProjectionPlanNode = {
  kind: 'xnl-projection-plan-node',
  id: 'plan:rich-document',
  domain: COMMAND_TARGET,
  classification: { id: 'xnl-rich-document.document' },
  presenter: { id: 'xnl-rich-document' },
  children: [],
};

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function packageRootValue<T>(name: string): T {
  const value = Reflect.get(logicRoot, name) as unknown;
  expect(
    value,
    `dg-cell-mvi-halfcode-logic package root must export production value ${name}`,
  ).toBeTypeOf('function');
  if (typeof value !== 'function') {
    throw new TypeError(`Missing dg-cell-mvi-halfcode-logic package-root value: ${name}`);
  }
  return value as T;
}

function acceptedDocument(): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: DOCUMENT_ID,
    children: [
      paragraph(PARAGRAPH_ALPHA_ID, 'Alpha'),
      paragraph(PARAGRAPH_BETA_ID, 'Beta'),
      {
        kind: 'table',
        nodeId: TABLE_ID,
        children: [{
          kind: 'table-row',
          nodeId: TABLE_ROW_ID,
          children: [{
            kind: 'table-cell',
            nodeId: TABLE_CELL_ID,
            colspan: 1,
            rowspan: 1,
            children: [paragraph(TABLE_PARAGRAPH_ID, 'A')],
          }],
        }],
      },
      {
        kind: 'code-block',
        nodeId: CODE_ID,
        language: 'typescript',
        text: 'const value = 1;',
      },
      {
        kind: 'mermaid',
        nodeId: MERMAID_ID,
        source: 'flowchart LR\nA --> B',
      },
    ],
  };
}

function paragraph(id: XnlRichDocumentDomainNodeId, text: string) {
  return {
    kind: 'paragraph' as const,
    nodeId: id,
    content: [{ kind: 'text' as const, text }],
  };
}

function stable(nodeIdValue: XnlRichDocumentDomainNodeId) {
  return { kind: 'stable' as const, nodeId: nodeIdValue };
}

function semanticTable(text: string): XnlRichDocumentSemanticTable {
  return {
    kind: 'table',
    nodeId: TABLE_ID,
    children: [{
      kind: 'table-row',
      nodeId: TABLE_ROW_ID,
      children: [{
        kind: 'table-cell',
        nodeId: TABLE_CELL_ID,
        colspan: 1,
        rowspan: 1,
        children: [{
          kind: 'paragraph',
          nodeId: TABLE_PARAGRAPH_ID,
          content: [{ kind: 'text', text }],
        }],
      }],
    }],
  };
}

function editFixtures(): readonly Readonly<{
  kind: XnlRichDocumentSemanticEdit['kind'];
  edit: XnlRichDocumentSemanticEdit;
  assertCandidate(candidate: XnlRichDocument): void;
}>[] {
  return [
    {
      kind: 'insert',
      edit: {
        kind: 'insert',
        localNodeId: 'local:inserted',
        parent: stable(DOCUMENT_ID),
        index: 1,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:inserted',
          content: [{ kind: 'text', text: 'Inserted' }],
        },
      },
      assertCandidate(candidate) {
        expect(candidate.children[1]).toMatchObject({
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Inserted' }],
        });
        expect(candidate.children[1]?.nodeId).toEqual(expect.any(String));
        expect(candidate.children[1]?.nodeId).not.toBe('local:inserted');
        expect(candidate.children[1]?.nodeId).not.toBe(DOCUMENT_ID);
      },
    },
    {
      kind: 'delete',
      edit: {
        kind: 'delete',
        nodeId: PARAGRAPH_BETA_ID,
        parent: stable(DOCUMENT_ID),
        index: 1,
      },
      assertCandidate(candidate) {
        expect(candidate.children.map(({ nodeId: id }) => id)).not.toContain(PARAGRAPH_BETA_ID);
        expect(candidate.children).toHaveLength(4);
      },
    },
    {
      kind: 'move',
      edit: {
        kind: 'move',
        nodeId: PARAGRAPH_BETA_ID,
        from: { parent: stable(DOCUMENT_ID), index: 1 },
        to: { parent: stable(DOCUMENT_ID), index: 0 },
      },
      assertCandidate(candidate) {
        expect(candidate.children.slice(0, 2).map(({ nodeId: id }) => id)).toEqual([
          PARAGRAPH_BETA_ID,
          PARAGRAPH_ALPHA_ID,
        ]);
      },
    },
    {
      kind: 'text',
      edit: {
        kind: 'text',
        nodeId: PARAGRAPH_ALPHA_ID,
        before: 'Alpha',
        after: 'Alpha!',
        beforeInlineRuns: [{ text: 'Alpha', marks: [] }],
        afterInlineRuns: [{ text: 'Alpha!', marks: [] }],
      },
      assertCandidate(candidate) {
        expect(candidate.children[0]).toEqual(paragraph(PARAGRAPH_ALPHA_ID, 'Alpha!'));
      },
    },
    {
      kind: 'mark',
      edit: {
        kind: 'mark',
        nodeId: PARAGRAPH_ALPHA_ID,
        before: [{ text: 'Alpha', marks: [] }],
        after: [{ text: 'Alpha', marks: [{ kind: 'bold' }] }],
      },
      assertCandidate(candidate) {
        expect(candidate.children[0]).toEqual({
          kind: 'paragraph',
          nodeId: PARAGRAPH_ALPHA_ID,
          content: [{ kind: 'text', text: 'Alpha', marks: [{ kind: 'bold' }] }],
        });
      },
    },
    {
      kind: 'table',
      edit: {
        kind: 'table',
        nodeId: TABLE_ID,
        before: semanticTable('A'),
        after: semanticTable('B'),
      },
      assertCandidate(candidate) {
        expect(candidate.children[2]).toMatchObject({
          kind: 'table',
          nodeId: TABLE_ID,
          children: [{
            nodeId: TABLE_ROW_ID,
            children: [{
              nodeId: TABLE_CELL_ID,
              colspan: 1,
              rowspan: 1,
              children: [{
                nodeId: TABLE_PARAGRAPH_ID,
                content: [{ text: 'B' }],
              }],
            }],
          }],
        });
      },
    },
    {
      kind: 'code',
      edit: {
        kind: 'code',
        nodeId: CODE_ID,
        before: { language: 'typescript', text: 'const value = 1;' },
        after: { language: 'javascript', text: 'const value = 2;' },
      },
      assertCandidate(candidate) {
        expect(candidate.children[3]).toEqual({
          kind: 'code-block',
          nodeId: CODE_ID,
          language: 'javascript',
          text: 'const value = 2;',
        });
      },
    },
    {
      kind: 'mermaid-source',
      edit: {
        kind: 'mermaid-source',
        nodeId: MERMAID_ID,
        before: 'flowchart LR\nA --> B',
        after: 'flowchart TD\nA --> C',
      },
      assertCandidate(candidate) {
        expect(candidate.children[4]).toEqual({
          kind: 'mermaid',
          nodeId: MERMAID_ID,
          source: 'flowchart TD\nA --> C',
        });
      },
    },
  ];
}

function interaction(edit: XnlRichDocumentSemanticEdit): XnlProjectionInteraction {
  return {
    id: `interaction:${edit.kind}`,
    type: XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
    target: { planNodeId: PLAN_NODE.id, domain: PLAN_NODE.domain },
    payload: {
      version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
      edits: [edit],
    },
  };
}

function command(...edits: readonly XnlRichDocumentSemanticEdit[]): XnlRichDocumentEditCommand {
  return {
    type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
    target: COMMAND_TARGET,
    payload: {
      version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
      edits,
    },
    provenance: { interactionType: XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE },
  };
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}

async function materialize(
  accepted: XnlRichDocument,
  value: XnlRichDocumentEditCommand,
): Promise<XnlRichDocumentCandidateMaterializationResult> {
  const materializer = packageRootValue<XnlRichDocumentCandidateMaterializer>(
    'materializeXnlRichDocumentSemanticCandidate',
  );
  return await materializer(EMPTY, { accepted, command: value }, EMPTY);
}

describe('canonical RichDocument semantic package-root values', () => {
  it.each([
    'createXnlRichDocumentSemanticDialect',
    'translateXnlRichDocumentEditInteraction',
    'materializeXnlRichDocumentSemanticCandidate',
  ])('exports production value %s without a deep import', (name) => {
    expect(packageRootValue(name)).toBeTypeOf('function');
  });

  it('binds the canonical translator on the public semantic dialect', () => {
    const createDialect = packageRootValue<CanonicalDialectFactory>(
      'createXnlRichDocumentSemanticDialect',
    );
    const dialect = createDialect();

    expect(dialect.id).toMatch(/rich-document/i);
    expect(dialect.translateInteraction).toBeTypeOf('function');
  });
});

describe('canonical RichDocument edit translator expected behavior', () => {
  it.each(editFixtures())('translates $kind through the logic package root', async ({ edit }) => {
    const translate = packageRootValue<CanonicalTranslator>(
      'translateXnlRichDocumentEditInteraction',
    );
    const proposal = interaction(edit);
    const before = structuredClone(proposal);

    const result = await translate(EMPTY, { planNode: PLAN_NODE, interaction: proposal }, EMPTY);

    expect(result.status).toBe('translated');
    if (result.status !== 'translated') return;
    expect(result.command).toMatchObject({
      type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
      target: PLAN_NODE.domain,
      payload: proposal.payload,
    });
    expect(proposal).toEqual(before);
  });

  it.each([
    {
      label: 'malformed target',
      proposal: {
        ...interaction(editFixtures()[0]!.edit),
        target: { planNodeId: 'plan:wrong-target', domain: PLAN_NODE.domain },
      },
    },
    {
      label: 'malformed payload',
      proposal: {
        ...interaction(editFixtures()[0]!.edit),
        payload: { version: 2, edits: [{ kind: 'replace', nodeId: PARAGRAPH_ALPHA_ID }] },
      },
    },
  ])('rejects $label without a partial command', async ({ proposal }) => {
    const translate = packageRootValue<CanonicalTranslator>(
      'translateXnlRichDocumentEditInteraction',
    );
    const result = await translate(
      EMPTY,
      { planNode: PLAN_NODE, interaction: proposal as XnlProjectionInteraction },
      EMPTY,
    );

    expect(['rejected', 'unsupported']).toContain(result.status);
    expect(result).not.toHaveProperty('command');
    if (result.status !== 'translated') expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('canonical RichDocument semantic candidate materializer expected behavior', () => {
  it.each(editFixtures())('atomically materializes $kind from the accepted baseline', async ({ edit, assertCandidate }) => {
    const accepted = acceptedDocument();
    const value = command(edit);
    const acceptedBefore = structuredClone(accepted);
    const commandBefore = structuredClone(value);

    const result = await materialize(accepted, value);

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    assertCandidate(result.candidate);
    expect(accepted).toEqual(acceptedBefore);
    expect(value).toEqual(commandBefore);
    expectDeepFrozen(result);
  });

  it('rejects stale before facts against the accepted snapshot', async () => {
    const accepted = acceptedDocument();
    const stale = command({
      kind: 'text',
      nodeId: PARAGRAPH_ALPHA_ID,
      before: 'Stale Alpha',
      after: 'Changed',
      beforeInlineRuns: [{ text: 'Stale Alpha', marks: [] }],
      afterInlineRuns: [{ text: 'Changed', marks: [] }],
    });

    const result = await materialize(accepted, stale);

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(accepted).toEqual(acceptedDocument());
  });

  it('rejects malformed targets and payloads without producing a candidate', async () => {
    const accepted = acceptedDocument();
    const malformed = {
      ...command(editFixtures()[0]!.edit),
      target: { path: [], nodeId: nodeId('document.unknown') },
      payload: { version: 1, edits: [{ kind: 'unknown-edit' }] },
    } as unknown as XnlRichDocumentEditCommand;

    const result = await materialize(accepted, malformed);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    if (result.status === 'rejected') expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(accepted).toEqual(acceptedDocument());
  });

  it('rejects a mixed command atomically when any edit is stale', async () => {
    const accepted = acceptedDocument();
    const mixed = command(
      {
        kind: 'text',
        nodeId: PARAGRAPH_ALPHA_ID,
        before: 'Alpha',
        after: 'Would be partial',
        beforeInlineRuns: [{ text: 'Alpha', marks: [] }],
        afterInlineRuns: [{ text: 'Would be partial', marks: [] }],
      },
      {
        kind: 'code',
        nodeId: CODE_ID,
        before: { language: 'typescript', text: 'stale code' },
        after: { language: null, text: 'should not apply' },
      },
    );
    const acceptedBefore = structuredClone(accepted);
    const commandBefore = structuredClone(mixed);

    const result = await materialize(accepted, mixed);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    expect(accepted).toEqual(acceptedBefore);
    expect(mixed).toEqual(commandBefore);
  });

  it('returns deeply immutable output without aliases to accepted or command data', async () => {
    const accepted = acceptedDocument();
    const value = command({
      kind: 'text',
      nodeId: PARAGRAPH_ALPHA_ID,
      before: 'Alpha',
      after: 'Alias safe',
      beforeInlineRuns: [{ text: 'Alpha', marks: [] }],
      afterInlineRuns: [{ text: 'Alias safe', marks: [{ kind: 'italic' }] }],
    });

    const result = await materialize(accepted, value);

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate).not.toBe(accepted);
    expect(result.candidate.children).not.toBe(accepted.children);
    expect(result.candidate.children[0]).not.toBe(accepted.children[0]);
    expect(result.candidate.children[0]).toMatchObject({
      nodeId: PARAGRAPH_ALPHA_ID,
      content: [{ text: 'Alias safe', marks: [{ kind: 'italic' }] }],
    });
    expectDeepFrozen(result);
  });

  it('rejects a revoked input proxy without throwing or returning a partial candidate', async () => {
    const materializer = packageRootValue<XnlRichDocumentCandidateMaterializer>(
      'materializeXnlRichDocumentSemanticCandidate',
    );
    const boundary = Proxy.revocable({
      accepted: acceptedDocument(),
      command: command(editFixtures()[0]!.edit),
    }, {});
    boundary.revoke();

    const result = await materializer(EMPTY, boundary.proxy as never, EMPTY);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
  });

  it('rejects custom prototypes and nested accessors without executing untrusted getters', async () => {
    let getterCalls = 0;
    const prototype = Object.defineProperty({}, 'writer', {
      get() {
        getterCalls += 1;
        throw new Error('authority getter must not execute');
      },
    });
    const accepted = Object.assign(Object.create(prototype), acceptedDocument()) as XnlRichDocument;
    const accessorEdit = {
      kind: 'text',
      nodeId: PARAGRAPH_ALPHA_ID,
      after: 'Changed',
      beforeInlineRuns: [{ text: 'Alpha', marks: [] }],
      afterInlineRuns: [{ text: 'Changed', marks: [] }],
    } as Record<string, unknown>;
    Object.defineProperty(accessorEdit, 'before', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('semantic getter must not execute');
      },
    });

    for (const [candidateAccepted, candidateCommand] of [
      [accepted, command(editFixtures()[0]!.edit)],
      [acceptedDocument(), command(accessorEdit as unknown as XnlRichDocumentSemanticEdit)],
    ] as const) {
      const result = await materialize(candidateAccepted, candidateCommand);
      expect(result.status).toBe('rejected');
      expect(result).not.toHaveProperty('candidate');
    }
    expect(getterCalls).toBe(0);
  });

  it('detaches the successful candidate from aliases mutated after materialization', async () => {
    const accepted = acceptedDocument();
    const insertedContent = [{ kind: 'text' as const, text: 'Detached' }];
    const value = command({
      kind: 'insert',
      localNodeId: 'local:detached',
      parent: stable(DOCUMENT_ID),
      index: 1,
      node: { kind: 'paragraph', localNodeId: 'local:detached', content: insertedContent },
    });

    const result = await materialize(accepted, value);
    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;

    (accepted.children[0] as unknown as { content: { text: string }[] }).content[0]!.text = 'Caller mutation';
    insertedContent[0]!.text = 'Command mutation';

    expect(result.candidate.children[0]).toEqual(paragraph(PARAGRAPH_ALPHA_ID, 'Alpha'));
    expect(result.candidate.children[1]).toMatchObject({
      kind: 'paragraph',
      content: [{ kind: 'text', text: 'Detached' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/writer|revision|session|submit|allocator|vfs|vcs/i);
    expectDeepFrozen(result);
  });
});
