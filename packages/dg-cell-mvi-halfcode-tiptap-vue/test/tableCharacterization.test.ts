import { Editor, type JSONContent } from '@tiptap/core';
import * as officialTablePackageRoot from '@tiptap/extension-table';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import * as adapterPackageRoot from '../src';
import type { XnlRichDocumentTiptapSemanticNode } from '../src';

const TABLE_NODE_NAMES = ['table', 'tableRow', 'tableCell', 'tableHeader'] as const;
const TABLE_COMMAND_NAMES = [
  'addColumnAfter',
  'addColumnBefore',
  'addRowAfter',
  'addRowBefore',
  'deleteColumn',
  'deleteRow',
  'deleteTable',
  'fixTables',
  'goToNextCell',
  'goToPreviousCell',
  'insertTable',
  'mergeCells',
  'setCellAttribute',
  'setCellSelection',
  'splitCell',
  'toggleHeaderCell',
  'toggleHeaderColumn',
  'toggleHeaderRow',
] as const;

const PROJECTION_CONFIG = {
  schemaId: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;
const TRANSACTION_CONFIG = {
  ...PROJECTION_CONFIG,
  planNodeId: 'xnlp:node:document.canonical',
} as const;

function findNode(root: JSONContent, type: string): JSONContent | undefined {
  if (root.type === type) return root;
  for (const child of root.content ?? []) {
    const found = findNode(child, type);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findSemanticNode(
  root: XnlRichDocumentTiptapSemanticNode,
  kind: XnlRichDocumentTiptapSemanticNode['kind'],
): XnlRichDocumentTiptapSemanticNode | undefined {
  if (root.kind === kind) return root;
  const descendants = 'children' in root
    ? root.children
    : 'content' in root
      ? root.content
      : [];
  for (const child of descendants) {
    const found = findSemanticNode(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('official table and current adapter characterization', () => {
  it('separates schema, commands, NodeView and package-root availability', () => {
    const official = new Editor({
      extensions: [StarterKit, TableKit],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const adapter = new Editor({
      extensions: adapterPackageRoot.createXnlRichDocumentTiptapExtensions(),
      content: { type: 'doc', attrs: { nodeId: 'document.probe' }, content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.probe' },
      }] },
    });

    try {
      expect(TABLE_NODE_NAMES.map((name) => official.schema.nodes[name] !== undefined)).toEqual([
        true, true, true, true,
      ]);
      expect(TABLE_NODE_NAMES.map((name) => adapter.schema.nodes[name] !== undefined)).toEqual([
        true, true, true, true,
      ]);

      expect(Object.keys(official.schema.nodes.tableCell.spec.attrs ?? {})).toEqual([
        'colspan', 'rowspan', 'colwidth', 'align',
      ]);
      expect(Object.keys(adapter.schema.nodes.tableCell.spec.attrs ?? {})).toEqual([
        'colspan', 'rowspan', 'colwidth', 'align', 'nodeId',
      ]);

      expect(TABLE_COMMAND_NAMES.every((name) => typeof official.commands[name] === 'function')).toBe(true);
      expect(TABLE_COMMAND_NAMES.every((name) => (
        typeof (adapter.commands as unknown as Record<string, unknown>)[name] === 'function'
      ))).toBe(true);
      expect(official.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true);
      expect(adapter.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true);
      expect(findNode(official.getJSON(), 'table')).toBeDefined();
      expect(findNode(adapter.getJSON(), 'table')).toBeDefined();

      expect(typeof official.extensionManager.nodeViews.table).toBe('function');
      expect(typeof adapter.extensionManager.nodeViews.table).toBe('function');

      expect(officialTablePackageRoot).toMatchObject({
        Table: expect.any(Object),
        TableRow: expect.any(Object),
        TableCell: expect.any(Object),
        TableHeader: expect.any(Object),
        TableKit: expect.any(Object),
      });
      expect(adapterPackageRoot.createXnlRichDocumentTiptapExtensions).toBeTypeOf('function');
      expect('TableKit' in adapterPackageRoot).toBe(false);
      expect('Table' in adapterPackageRoot).toBe(false);
    } finally {
      official.destroy();
      adapter.destroy();
    }
  });

  it('records the supported attrs shared with projection and the normalizer table boundary', () => {
    const projected = adapterPackageRoot.projectTiptapDocument(
      {},
      { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      PROJECTION_CONFIG,
    );
    expect(projected.status).toBe('projected');
    if (projected.status !== 'projected') throw new Error('Expected a projected document.');

    const projectedCell = findNode(projected.document, 'tableCell');
    expect(projectedCell?.attrs).toEqual({
      nodeId: 'tablecell.capability.value',
    });

    const editor = new Editor({
      extensions: adapterPackageRoot.createXnlRichDocumentTiptapExtensions(),
      content: projected.document,
    });
    try {
      let cellPosition = -1;
      editor.state.doc.descendants((node, position) => {
        if (node.attrs.nodeId === 'tablecell.capability.value') cellPosition = position;
      });
      expect(cellPosition).toBeGreaterThanOrEqual(0);

      const cell = editor.state.doc.nodeAt(cellPosition);
      if (cell === null) throw new Error('Expected the canonical table cell.');
      expect(cell.attrs).toEqual({
        nodeId: 'tablecell.capability.value',
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        align: null,
      });
      const transaction = editor.state.tr.setNodeMarkup(cellPosition, undefined, {
        ...cell.attrs,
        colspan: 2,
      });
      const normalized = adapterPackageRoot.normalizeTiptapTransaction(
        {},
        { transaction },
        TRANSACTION_CONFIG,
      );

      expect(normalized.status).toBe('normalized');
      if (normalized.status !== 'normalized') throw new Error('Expected a normalized transaction.');
      const payload = normalized.intent.proposal.payload as unknown as {
        readonly edits: readonly {
          readonly kind: string;
          readonly nodeId: string;
          readonly after: XnlRichDocumentTiptapSemanticNode;
        }[];
      };
      const edit = payload.edits[0];
      if (edit === undefined) throw new Error('Expected a table edit.');
      expect(edit).toMatchObject({
        kind: 'table',
        nodeId: 'table.capabilities',
      });
      expect(findSemanticNode(edit.after, 'table-cell')).toMatchObject({
        colspan: 2,
        rowspan: 1,
      });
    } finally {
      editor.destroy();
    }
  });
});
