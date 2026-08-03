import { describe, expect, it } from 'vitest';
import type {
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentInlineRun,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentTable,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
} from 'dg-cell-mvi-halfcode-contract';
import * as logicRoot from 'dg-cell-mvi-halfcode-logic';

const EMPTY = Object.freeze({});
const DOCUMENT_ID = nodeId('document.root');
const PARAGRAPH_ID = nodeId('paragraph.rich');
const REPLACEMENT_ID = nodeId('paragraph.replacement');
const TABLE_ID = nodeId('table.main');
const TABLE_ROW_ID = nodeId('table-row.main');
const TABLE_CELL_ID = nodeId('table-cell.main');
const TABLE_PARAGRAPH_ID = nodeId('paragraph.table');
const CODE_ID = nodeId('code.main');
const MERMAID_ID = nodeId('mermaid.main');

const ACCEPTED_RUNS: readonly XnlRichDocumentInlineRun[] = [
  { text: 'Read ', marks: [] },
  {
    text: 'the docs',
    marks: [
      { kind: 'bold' },
      { kind: 'link', href: 'https://example.test/docs', title: 'Canonical docs' },
    ],
  },
  { text: ' today', marks: [{ kind: 'italic' }] },
];

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function acceptedDocument(): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: DOCUMENT_ID,
    children: [
      {
        kind: 'paragraph',
        nodeId: PARAGRAPH_ID,
        content: ACCEPTED_RUNS.map((run) => ({
          kind: 'text' as const,
          text: run.text,
          ...(run.marks.length === 0 ? {} : { marks: run.marks }),
        })),
      },
      table('Cell'),
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

function table(text: string): XnlRichDocumentTable {
  return {
    kind: 'table',
    nodeId: TABLE_ID,
    children: [{
      kind: 'table-row',
      nodeId: TABLE_ROW_ID,
      children: [{
        kind: 'table-cell',
        nodeId: TABLE_CELL_ID,
        children: [{
          kind: 'paragraph',
          nodeId: TABLE_PARAGRAPH_ID,
          content: [{ kind: 'text', text }],
        }],
      }],
    }],
  };
}

function stable(nodeIdValue: XnlRichDocumentDomainNodeId) {
  return { kind: 'stable' as const, nodeId: nodeIdValue };
}

function command(...edits: readonly XnlRichDocumentSemanticEdit[]): XnlRichDocumentEditCommand {
  return {
    type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
    target: { path: [], nodeId: DOCUMENT_ID },
    payload: { version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION, edits },
  };
}

function materializer(): XnlRichDocumentCandidateMaterializer {
  const value = Reflect.get(logicRoot, 'materializeXnlRichDocumentSemanticCandidate');
  expect(value).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError('Missing semantic materializer.');
  return value as XnlRichDocumentCandidateMaterializer;
}

async function materialize(
  value: XnlRichDocumentEditCommand,
  accepted = acceptedDocument(),
): Promise<XnlRichDocumentCandidateMaterializationResult> {
  return await materializer()(EMPTY, { accepted, command: value }, EMPTY);
}

function inlineContent(result: XnlRichDocumentCandidateMaterializationResult) {
  expect(result.status).toBe('materialized');
  if (result.status !== 'materialized') return undefined;
  const paragraph = result.candidate.children[0];
  expect(paragraph?.kind).toBe('paragraph');
  return paragraph?.kind === 'paragraph' ? paragraph.content : undefined;
}

describe('RichDocument inline semantic materialization', () => {
  it('applies text-only exact final runs without losing mark or link boundaries', async () => {
    const after: readonly XnlRichDocumentInlineRun[] = [
      { text: 'Read ', marks: [] },
      {
        text: 'canonical docs',
        marks: [
          { kind: 'bold' },
          { kind: 'link', href: 'https://example.test/docs', title: 'Canonical docs' },
        ],
      },
      { text: ' now', marks: [{ kind: 'italic' }] },
    ];
    const result = await materialize(command({
      kind: 'text',
      nodeId: PARAGRAPH_ID,
      before: ACCEPTED_RUNS.map((run) => run.text).join(''),
      after: after.map((run) => run.text).join(''),
      beforeInlineRuns: ACCEPTED_RUNS,
      afterInlineRuns: after,
    }));

    expect(inlineContent(result)).toEqual(after.map((run) => ({
      kind: 'text',
      text: run.text,
      ...(run.marks.length === 0 ? {} : { marks: run.marks }),
    })));
  });

  it('applies mark-only exact final runs', async () => {
    const after: readonly XnlRichDocumentInlineRun[] = [
      { text: 'Read ', marks: [{ kind: 'strike' }] },
      {
        text: 'the docs',
        marks: [{ kind: 'link', href: 'https://example.test/v2', title: 'Version two' }],
      },
      { text: ' today', marks: [{ kind: 'code' }] },
    ];
    const result = await materialize(command({
      kind: 'mark',
      nodeId: PARAGRAPH_ID,
      before: ACCEPTED_RUNS,
      after,
    }));

    expect(inlineContent(result)).toEqual(after.map((run) => ({
      kind: 'text',
      text: run.text,
      marks: run.marks,
    })));
  });

  it.each(['text-first', 'mark-first'] as const)(
    'coalesces matching text and mark final runs independently of edit order: %s',
    async (order) => {
      const after: readonly XnlRichDocumentInlineRun[] = [
        { text: 'Study ', marks: [{ kind: 'italic' }] },
        {
          text: 'the reference',
          marks: [{ kind: 'link', href: 'https://example.test/reference', title: 'Reference' }],
        },
      ];
      const textEdit: XnlRichDocumentSemanticEdit = {
        kind: 'text',
        nodeId: PARAGRAPH_ID,
        before: ACCEPTED_RUNS.map((run) => run.text).join(''),
        after: after.map((run) => run.text).join(''),
        beforeInlineRuns: ACCEPTED_RUNS,
        afterInlineRuns: after,
      };
      const markEdit: XnlRichDocumentSemanticEdit = {
        kind: 'mark',
        nodeId: PARAGRAPH_ID,
        before: ACCEPTED_RUNS,
        after,
      };
      const edits = order === 'text-first' ? [textEdit, markEdit] : [markEdit, textEdit];

      const result = await materialize(command(...edits));

      expect(inlineContent(result)).toEqual(after.map((run) => ({
        kind: 'text',
        text: run.text,
        marks: run.marks,
      })));
    },
  );

  it.each([
    ['stale text runs', command({
      kind: 'text', nodeId: PARAGRAPH_ID,
      before: 'stale', after: 'changed',
      beforeInlineRuns: [{ text: 'stale', marks: [] }],
      afterInlineRuns: [{ text: 'changed', marks: [] }],
    })],
    ['stale mark runs', command({
      kind: 'mark', nodeId: PARAGRAPH_ID,
      before: [{ text: 'Read the docs today', marks: [] }],
      after: [{ text: 'Read the docs today', marks: [{ kind: 'bold' }] }],
    })],
    ['conflicting text and mark finals', command({
      kind: 'text', nodeId: PARAGRAPH_ID,
      before: ACCEPTED_RUNS.map((run) => run.text).join(''), after: 'Text final',
      beforeInlineRuns: ACCEPTED_RUNS,
      afterInlineRuns: [{ text: 'Text final', marks: [] }],
    }, {
      kind: 'mark', nodeId: PARAGRAPH_ID,
      before: ACCEPTED_RUNS,
      after: [{ text: 'Mark final', marks: [{ kind: 'bold' }] }],
    })],
  ])('atomically rejects %s', async (_label, value) => {
    const accepted = acceptedDocument();
    const before = structuredClone(accepted);
    const result = await materialize(value, accepted);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    expect(accepted).toEqual(before);
  });
});

describe('RichDocument code and Mermaid semantic materialization', () => {
  it('updates code language/text and Mermaid source while preserving stable block identities', async () => {
    const result = await materialize(command({
      kind: 'code',
      nodeId: CODE_ID,
      before: { language: 'typescript', text: 'const value = 1;' },
      after: { language: null, text: 'const value = 2;' },
    }, {
      kind: 'mermaid-source',
      nodeId: MERMAID_ID,
      before: 'flowchart LR\nA --> B',
      after: 'flowchart TD\nA --> C',
    }));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate.children[2]).toEqual({
      kind: 'code-block',
      nodeId: CODE_ID,
      text: 'const value = 2;',
    });
    expect(result.candidate.children[3]).toEqual({
      kind: 'mermaid',
      nodeId: MERMAID_ID,
      source: 'flowchart TD\nA --> C',
    });
  });

  it.each([
    ['stale code language', command({
      kind: 'code', nodeId: CODE_ID,
      before: { language: 'javascript', text: 'const value = 1;' },
      after: { language: null, text: 'changed' },
    })],
    ['stale code text', command({
      kind: 'code', nodeId: CODE_ID,
      before: { language: 'typescript', text: 'stale' },
      after: { language: null, text: 'changed' },
    })],
    ['stale Mermaid source', command({
      kind: 'mermaid-source', nodeId: MERMAID_ID,
      before: 'flowchart LR\nA --> stale', after: 'flowchart TD\nA --> C',
    })],
  ])('atomically rejects %s', async (_label, value) => {
    const result = await materialize(value);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
  });
});

describe('RichDocument content and structural conflict rejection', () => {
  const contentEdit: XnlRichDocumentSemanticEdit = {
    kind: 'text',
    nodeId: PARAGRAPH_ID,
    before: ACCEPTED_RUNS.map((run) => run.text).join(''),
    after: 'Changed',
    beforeInlineRuns: ACCEPTED_RUNS,
    afterInlineRuns: [{ text: 'Changed', marks: [] }],
  };

  it('combines a compatible move and content update against one accepted baseline', async () => {
    const result = await materialize(command(
      {
        kind: 'move',
        nodeId: PARAGRAPH_ID,
        from: { parent: stable(DOCUMENT_ID), index: 0 },
        to: { parent: stable(DOCUMENT_ID), index: 3 },
      },
      contentEdit,
    ));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate.children[3]).toMatchObject({
      kind: 'paragraph',
      nodeId: PARAGRAPH_ID,
      content: [{ kind: 'text', text: 'Changed' }],
    });
  });

  it.each([
    ['deleted target', command(
      { kind: 'delete', nodeId: PARAGRAPH_ID, parent: stable(DOCUMENT_ID), index: 0 },
      contentEdit,
    )],
    ['delete-and-add replacement target', command(
      { kind: 'delete', nodeId: PARAGRAPH_ID, parent: stable(DOCUMENT_ID), index: 0 },
      {
        kind: 'insert', localNodeId: 'local:replacement', parent: stable(DOCUMENT_ID), index: 0,
        node: {
          kind: 'paragraph', localNodeId: 'local:replacement',
          content: [{ kind: 'text', text: 'Replacement' }],
        },
      },
      contentEdit,
    )],
    ['deleted ancestor', command(
      { kind: 'delete', nodeId: TABLE_ID, parent: stable(DOCUMENT_ID), index: 1 },
      {
        kind: 'text', nodeId: TABLE_PARAGRAPH_ID,
        before: 'Cell', after: 'Changed',
        beforeInlineRuns: [{ text: 'Cell', marks: [] }],
        afterInlineRuns: [{ text: 'Changed', marks: [] }],
      },
    )],
    ['table-owned descendant', command(
      { kind: 'table', nodeId: TABLE_ID, before: table('Cell'), after: table('Replaced') },
      {
        kind: 'text', nodeId: TABLE_PARAGRAPH_ID,
        before: 'Cell', after: 'Changed',
        beforeInlineRuns: [{ text: 'Cell', marks: [] }],
        afterInlineRuns: [{ text: 'Changed', marks: [] }],
      },
    )],
  ])('rejects the whole command for %s', async (_label, value) => {
    const accepted = acceptedDocument();
    const before = structuredClone(accepted);
    const result = await materialize(value, accepted);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    expect(accepted).toEqual(before);
  });

  it('reports the table ownership conflict for descendant content', async () => {
    const result = await materialize(command(
      { kind: 'table', nodeId: TABLE_ID, before: table('Cell'), after: table('Replaced') },
      {
        kind: 'text', nodeId: TABLE_PARAGRAPH_ID,
        before: 'Cell', after: 'Changed',
        beforeInlineRuns: [{ text: 'Cell', marks: [] }],
        afterInlineRuns: [{ text: 'Changed', marks: [] }],
      },
    ));

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.diagnostics.some(({ message }) => (
        message.includes('table edit that owns the target descendant')
      ))).toBe(true);
    }
  });

  it('atomically materializes the table slice without a descendant content edit', async () => {
    const result = await materialize(command({
      kind: 'table',
      nodeId: TABLE_ID,
      before: table('Cell'),
      after: table('Replaced'),
    }));

    expect(result.status).toBe('materialized');
    if (result.status === 'materialized') {
      expect(result.candidate.children[1]).toMatchObject({
        kind: 'table',
        nodeId: TABLE_ID,
        children: [{ children: [{ children: [{ content: [{ text: 'Replaced' }] }] }] }],
      });
    }
  });
});
