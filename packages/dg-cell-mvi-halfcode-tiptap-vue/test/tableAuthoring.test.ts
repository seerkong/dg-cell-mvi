import { Editor, type JSONContent } from '@tiptap/core';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import { afterEach, describe, expect, it } from 'vitest';
import { createXnlRichDocumentTiptapExtensions } from '../src';

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function createEditor(): Editor {
  const editor = new Editor({
    extensions: createXnlRichDocumentTiptapExtensions(),
    content: {
      type: 'doc',
      attrs: { nodeId: 'document.table-authoring' },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.table-authoring' },
      }],
    },
  });
  editors.push(editor);
  return editor;
}

function findNode(root: JSONContent, type: string): JSONContent | undefined {
  if (root.type === type) return root;
  for (const child of root.content ?? []) {
    const found = findNode(child, type);
    if (found !== undefined) return found;
  }
  return undefined;
}

function cellPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      positions.push(position);
    }
  });
  return positions;
}

describe('canonical table browser authoring', () => {
  it('uses each official table node as the single schema owner', () => {
    const extensions = createXnlRichDocumentTiptapExtensions();
    const officialNodes = [Table, TableRow, TableCell, TableHeader];

    for (const official of officialNodes) {
      const matching = extensions.filter((extension) => extension.name === official.name);
      expect(matching).toHaveLength(1);
      expect(matching[0]?.parent).toBe(official);
    }

    const editor = createEditor();
    expect(Object.keys(editor.schema.nodes.tableCell.spec.attrs ?? {})).toEqual([
      'colspan', 'rowspan', 'colwidth', 'align', 'nodeId',
    ]);
  });

  it('executes insert/delete table and row/column commands', () => {
    const editor = createEditor();

    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })).toBe(true);
    expect(findNode(editor.getJSON(), 'table')?.content).toHaveLength(2);

    expect(editor.commands.addRowAfter()).toBe(true);
    expect(findNode(editor.getJSON(), 'table')?.content).toHaveLength(3);
    expect(editor.commands.deleteRow()).toBe(true);
    expect(findNode(editor.getJSON(), 'table')?.content).toHaveLength(2);

    expect(editor.commands.addColumnAfter()).toBe(true);
    expect(findNode(editor.getJSON(), 'table')?.content?.[0]?.content).toHaveLength(3);
    expect(editor.commands.deleteColumn()).toBe(true);
    expect(findNode(editor.getJSON(), 'table')?.content?.[0]?.content).toHaveLength(2);

    expect(editor.commands.deleteTable()).toBe(true);
    expect(findNode(editor.getJSON(), 'table')).toBeUndefined();
  });

  it('executes merge/split and header commands', () => {
    const editor = createEditor();
    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })).toBe(true);

    const cells = cellPositions(editor);
    expect(editor.commands.setCellSelection({
      anchorCell: cells[0]!,
      headCell: cells[1]!,
    })).toBe(true);
    expect(editor.commands.mergeCells()).toBe(true);
    expect(findNode(editor.getJSON(), 'tableCell')?.attrs?.colspan).toBe(2);
    expect(editor.commands.splitCell()).toBe(true);
    expect(findNode(editor.getJSON(), 'tableCell')?.attrs?.colspan).toBe(1);

    expect(editor.commands.toggleHeaderRow()).toBe(true);
    expect(findNode(editor.getJSON(), 'tableHeader')).toBeDefined();
    expect(editor.commands.toggleHeaderColumn()).toBe(true);
    expect(editor.commands.toggleHeaderCell()).toBe(true);
  });
});
