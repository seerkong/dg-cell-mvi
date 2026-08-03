import { Editor, type JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  createXnlRichDocumentTiptapExtensions,
  normalizeTiptapTransaction,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapInteractionIntent,
  type XnlRichDocumentTiptapSemanticNode,
} from '../src';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const PROJECTION_CONFIG = Object.freeze({
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
});
const TRANSACTION_CONFIG = Object.freeze({
  ...PROJECTION_CONFIG,
  planNodeId: 'xnlp:node:document.canonical',
});
const AUTHORITY_PATTERN = /revision|authoring|persistence|writer|submit|session|allocator|valueHost|vfs|vcs|translator|command|transaction|editor|step/i;

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function projectFixture(): JSONContent {
  const projected = projectTiptapDocument(
    EMPTY,
    { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
    PROJECTION_CONFIG,
  );
  expect(projected.status).toBe('projected');
  if (projected.status !== 'projected') throw new Error('Expected canonical projection.');
  return projected.document;
}

function createEditor(onTransaction?: (transaction: Transaction) => void): Editor {
  const editor = new Editor({
    extensions: createXnlRichDocumentTiptapExtensions(),
    content: projectFixture(),
    ...(onTransaction === undefined ? {} : {
      onTransaction: ({ transaction }) => onTransaction(transaction),
    }),
  });
  editors.push(editor);
  return editor;
}

function positionOf(editor: Editor, nodeId: string): number {
  let found = -1;
  editor.state.doc.descendants((node, position) => {
    if (found < 0 && node.attrs.nodeId === nodeId) found = position;
  });
  if (found < 0) throw new Error(`Missing node "${nodeId}".`);
  return found;
}

function findNode(root: JSONContent, nodeId: string): JSONContent | undefined {
  if (root.attrs?.nodeId === nodeId) return root;
  for (const child of root.content ?? []) {
    const found = findNode(child, nodeId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizedIntent(transaction: Transaction): XnlRichDocumentTiptapInteractionIntent {
  const result = normalizeTiptapTransaction(EMPTY, { transaction }, TRANSACTION_CONFIG);
  expect(result.status).toBe('normalized');
  if (result.status !== 'normalized') throw new Error('Expected normalized table transaction.');
  return result.intent;
}

function onlyTableEdit(intent: XnlRichDocumentTiptapInteractionIntent) {
  expect(intent.kind).toBe('interaction');
  expect(intent.proposal.payload.edits).toHaveLength(1);
  const edit = intent.proposal.payload.edits[0];
  expect(edit?.kind).toBe('table');
  if (edit?.kind !== 'table') throw new Error('Expected one table-level edit.');
  return edit;
}

function semanticNodes(root: XnlRichDocumentTiptapSemanticNode): XnlRichDocumentTiptapSemanticNode[] {
  const descendants = 'children' in root
    ? root.children
    : 'content' in root
      ? root.content
      : [];
  return [root, ...descendants.flatMap(semanticNodes)];
}

describe('T2.2 table round-trip and transaction boundaries', () => {
  it('round-trips the canonical fixture through a real Editor without promoting official defaults', () => {
    const editor = createEditor();
    const json = editor.getJSON();
    const defaultedCell = findNode(json, 'tablecell.capability.value');
    const explicitSpanCell = findNode(json, 'tableheader.capability');

    expect(defaultedCell?.attrs).toMatchObject({
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      align: null,
    });
    expect(explicitSpanCell?.attrs?.colspan).toBe(2);

    const parsed = parseTiptapDocument(EMPTY, { document: json }, PROJECTION_CONFIG);
    if (parsed.status !== 'parsed') {
      throw new Error(parsed.diagnostics.map((item) => item.message).join('; '));
    }
    expect(parsed.status).toBe('parsed');

    expect(parsed.document).toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    const parsedTable = parsed.document.children.find((node) => node.kind === 'table');
    const parsedCells = parsedTable?.children.flatMap((row) => row.children) ?? [];
    expect(parsedCells.find((cell) => cell.nodeId === 'tablecell.capability.value')).not.toHaveProperty('colspan');
    expect(parsedCells.find((cell) => cell.nodeId === 'tablecell.capability.value')).not.toHaveProperty('rowspan');
    expect(parsedCells.find((cell) => cell.nodeId === 'tableheader.capability')).toMatchObject({
      colspan: 2,
      rowspan: 1,
    });
    expect(parsedCells.every((cell) => !('colwidth' in cell) && !('align' in cell))).toBe(true);
  });

  it('normalizes cell text and span changes as revision-free table interactions with stable IDs', () => {
    const editor = createEditor();
    const paragraphPosition = positionOf(editor, 'paragraph.table.value');
    const textIntent = normalizedIntent(editor.state.tr.insertText(
      '!',
      paragraphPosition + 1 + 'Canonical projection'.length,
    ));
    const textEdit = onlyTableEdit(textIntent);

    expect(textEdit.nodeId).toBe('table.capabilities');
    expect(semanticNodes(textEdit.after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'table.capabilities' }),
      expect.objectContaining({ nodeId: 'tablecell.capability.value' }),
      expect.objectContaining({ nodeId: 'paragraph.table.value' }),
    ]));
    expect(JSON.stringify(textEdit.after)).toContain('Canonical projection!');

    const cellPosition = positionOf(editor, 'tablecell.capability.value');
    const cell = editor.state.doc.nodeAt(cellPosition);
    if (cell === null) throw new Error('Expected canonical table cell.');
    const spanIntent = normalizedIntent(editor.state.tr.setNodeMarkup(cellPosition, undefined, {
      ...cell.attrs,
      rowspan: 2,
    }));
    const spanEdit = onlyTableEdit(spanIntent);

    expect(spanEdit.nodeId).toBe('table.capabilities');
    expect(semanticNodes(spanEdit.after)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'tablecell.capability.value',
        rowspan: 2,
      }),
    ]));
    expect(JSON.stringify([textIntent, spanIntent])).not.toMatch(AUTHORITY_PATTERN);
  });

  it('keeps official structure edits local and does not allocate Domain IDs or carry writer authority', () => {
    const transactions: Transaction[] = [];
    const editor = createEditor((transaction) => {
      if (transaction.docChanged) transactions.push(transaction);
    });
    editor.commands.setTextSelection(positionOf(editor, 'paragraph.table.value') + 1);
    transactions.length = 0;

    expect(editor.commands.addRowAfter()).toBe(true);
    const transaction = transactions.at(-1);
    if (transaction === undefined) throw new Error('Expected an official table structure transaction.');
    const intent = normalizedIntent(transaction);
    const edit = onlyTableEdit(intent);
    const nodes = semanticNodes(edit.after);

    expect(edit.nodeId).toBe('table.capabilities');
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'table.capabilities' }),
      expect.objectContaining({ nodeId: 'tablecell.capability.value' }),
      expect.objectContaining({ localNodeId: expect.stringMatching(/^local:/) }),
    ]));
    expect(nodes.filter((node) => 'localNodeId' in node).every((node) => !('nodeId' in node))).toBe(true);
    expect(new Set(nodes.flatMap((node) => 'nodeId' in node && node.nodeId !== undefined ? [node.nodeId] : []))).toEqual(new Set([
      'table.capabilities',
      'tablerow.capabilities.header',
      'tableheader.capability',
      'paragraph.table.header',
      'tablecell.capability.value',
      'paragraph.table.value',
    ]));
    expect(JSON.stringify(intent)).not.toMatch(AUTHORITY_PATTERN);
  });
});
