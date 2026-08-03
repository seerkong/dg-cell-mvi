import { Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  createXnlRichDocumentTiptapExtensions,
  normalizeTiptapTransaction,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapInteractionPayload,
  type XnlRichDocumentTiptapSemanticEdit,
  type XnlRichDocumentTiptapSemanticNode,
} from '../src';

const CONFIG = {
  planNodeId: 'xnlp:node:document.lossless',
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;

const DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.lossless' },
  content: [
    {
      type: 'paragraph',
      attrs: { nodeId: 'paragraph.alpha' },
      content: [{ type: 'text', text: 'Alpha' }],
    },
    {
      type: 'paragraph',
      attrs: { nodeId: 'paragraph.beta' },
      content: [{ type: 'text', text: 'Beta' }],
    },
    {
      type: 'blockquote',
      attrs: { nodeId: 'blockquote.source' },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.quote' },
        content: [{ type: 'text', text: 'Quoted' }],
      }],
    },
    {
      type: 'codeBlock',
      attrs: { nodeId: 'code.sample', language: 'ts' },
      content: [{ type: 'text', text: 'const value = 1' }],
    },
    {
      type: 'mermaid',
      attrs: { nodeId: 'mermaid.sample', source: 'graph TD; A-->B' },
    },
    {
      type: 'table',
      attrs: { nodeId: 'table.sample' },
      content: [{
        type: 'tableRow',
        attrs: { nodeId: 'row.sample' },
        content: [{
          type: 'tableCell',
          attrs: { nodeId: 'cell.sample', colspan: 1, rowspan: 1 },
          content: [{
            type: 'paragraph',
            attrs: { nodeId: 'paragraph.cell' },
            content: [{ type: 'text', text: 'Cell' }],
          }],
        }],
      }],
    },
  ],
};

function createEditor(): Editor {
  return new Editor({
    extensions: createXnlRichDocumentTiptapExtensions(),
    content: DOCUMENT,
  });
}

function positionOf(document: ProseMirrorNode, nodeId: string): number {
  let found = -1;
  document.descendants((node, position) => {
    if (found < 0 && node.attrs.nodeId === nodeId) found = position;
  });
  if (found < 0) throw new Error(`Missing node ${nodeId}.`);
  return found;
}

function nodeAt(editor: Editor, nodeId: string): ProseMirrorNode {
  const node = editor.state.doc.nodeAt(positionOf(editor.state.doc, nodeId));
  if (node === null) throw new Error(`Missing node ${nodeId}.`);
  return node;
}

function normalizedEdits(transaction: Transaction): readonly XnlRichDocumentTiptapSemanticEdit[] {
  const result = normalizeTiptapTransaction({}, { transaction }, CONFIG);
  expect(result.status).toBe('normalized');
  if (result.status !== 'normalized') throw new Error('Expected a normalized transaction.');
  return (result.intent.proposal.payload as XnlRichDocumentTiptapInteractionPayload).edits;
}

function persistentDescendantIdentities(
  node: XnlRichDocumentTiptapSemanticNode,
): readonly Readonly<{ kind: string; nodeId: string }>[] {
  const current = 'nodeId' in node && node.nodeId !== undefined
    ? [{ kind: node.kind, nodeId: node.nodeId }]
    : [];
  const descendants = 'children' in node
    ? node.children
    : 'content' in node
      ? node.content
      : [];
  return [
    ...current,
    ...descendants.flatMap(persistentDescendantIdentities),
  ];
}

describe('[green characterization] current normalizer semantic coverage', () => {
  it.each([
    ['text', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'paragraph.alpha');
      return editor.state.tr.insertText('!', position + 1 + 'Alpha'.length);
    }, {
      kind: 'text',
      nodeId: 'paragraph.alpha',
      before: 'Alpha',
      after: 'Alpha!',
    }],
    ['mark', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'paragraph.alpha');
      return editor.state.tr.addMark(
        position + 1,
        position + 1 + 'Alpha'.length,
        editor.schema.marks.bold.create(),
      );
    }, {
      kind: 'mark',
      nodeId: 'paragraph.alpha',
      before: [{ text: 'Alpha', marks: [] }],
      after: [{ text: 'Alpha', marks: [{ kind: 'bold' }] }],
    }],
    ['insert', (editor: Editor) => editor.state.tr.insert(
      positionOf(editor.state.doc, 'paragraph.beta'),
      editor.schema.nodes.paragraph.create(null, editor.schema.text('Inserted')),
    ), {
      kind: 'insert',
      localNodeId: 'local:0',
      parent: { kind: 'stable', nodeId: 'document.lossless' },
      index: 1,
      node: {
        kind: 'paragraph',
        localNodeId: 'local:0',
        content: [{ kind: 'text', text: 'Inserted' }],
      },
    }],
    ['delete', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'paragraph.beta');
      return editor.state.tr.delete(position, position + nodeAt(editor, 'paragraph.beta').nodeSize);
    }, {
      kind: 'delete',
      nodeId: 'paragraph.beta',
      parent: { kind: 'stable', nodeId: 'document.lossless' },
      index: 1,
    }],
    ['move', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'paragraph.alpha');
      const alpha = nodeAt(editor, 'paragraph.alpha');
      const transaction = editor.state.tr.delete(position, position + alpha.nodeSize);
      return transaction.insert(transaction.doc.content.size, alpha);
    }, {
      kind: 'move',
      nodeId: 'paragraph.alpha',
      from: { parent: { kind: 'stable', nodeId: 'document.lossless' }, index: 0 },
      to: { parent: { kind: 'stable', nodeId: 'document.lossless' }, index: 5 },
    }],
    ['table', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'cell.sample');
      const cell = nodeAt(editor, 'cell.sample');
      return editor.state.tr.setNodeMarkup(position, undefined, { ...cell.attrs, colspan: 2 });
    }, {
      kind: 'table',
      nodeId: 'table.sample',
    }],
    ['code', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'code.sample');
      return editor.state.tr.insertText('0', position + 1 + 'const value = '.length);
    }, {
      kind: 'code',
      nodeId: 'code.sample',
      before: { language: 'ts', text: 'const value = 1' },
      after: { language: 'ts', text: 'const value = 01' },
    }],
    ['mermaid-source', (editor: Editor) => {
      const position = positionOf(editor.state.doc, 'mermaid.sample');
      const mermaid = nodeAt(editor, 'mermaid.sample');
      return editor.state.tr.setNodeMarkup(position, undefined, {
        ...mermaid.attrs,
        source: 'graph LR; C-->D',
      });
    }, {
      kind: 'mermaid-source',
      nodeId: 'mermaid.sample',
      before: 'graph TD; A-->B',
      after: 'graph LR; C-->D',
    }],
  ] as const)('emits the existing %s edit from a real Editor transaction', (_kind, transactionFor, expected) => {
    const editor = createEditor();
    try {
      expect(normalizedEdits(transactionFor(editor))).toEqual([
        expect.objectContaining(expected),
      ]);
    } finally {
      editor.destroy();
    }
  });

  it('strips arbitrary persistent id claims from every node in a new subtree', () => {
    const editor = createEditor();
    try {
      const claimedParagraph = editor.schema.nodes.paragraph.create(
        { nodeId: 'attacker.claimed-child' },
        editor.schema.text('Untrusted'),
      );
      const claimedBlockquote = editor.schema.nodes.blockquote.create(
        { nodeId: 'attacker.claimed-root' },
        claimedParagraph,
      );
      const [edit] = normalizedEdits(editor.state.tr.insert(
        positionOf(editor.state.doc, 'paragraph.beta'),
        claimedBlockquote,
      ));

      expect(edit).toEqual({
        kind: 'insert',
        localNodeId: 'local:0',
        parent: { kind: 'stable', nodeId: 'document.lossless' },
        index: 1,
        node: {
          kind: 'blockquote',
          localNodeId: 'local:0',
          children: [{
            kind: 'paragraph',
            localNodeId: 'local:1',
            content: [{ kind: 'text', text: 'Untrusted' }],
          }],
        },
      });
      expect(JSON.stringify(edit)).not.toMatch(/attacker\.claimed/);
    } finally {
      editor.destroy();
    }
  });

  it('preserves stable identity for every existing table descendant in an atomic table edit', () => {
    const editor = createEditor();
    try {
      const position = positionOf(editor.state.doc, 'cell.sample');
      const cell = nodeAt(editor, 'cell.sample');
      const [edit] = normalizedEdits(editor.state.tr.setNodeMarkup(position, undefined, {
        ...cell.attrs,
        colspan: 2,
      }));
      if (edit?.kind !== 'table') throw new Error('Expected one table edit.');

      const expectedIdentities = [
        { kind: 'table', nodeId: 'table.sample' },
        { kind: 'table-row', nodeId: 'row.sample' },
        { kind: 'table-cell', nodeId: 'cell.sample' },
        { kind: 'paragraph', nodeId: 'paragraph.cell' },
      ];
      expect(persistentDescendantIdentities(edit.before)).toEqual(expectedIdentities);
      expect(persistentDescendantIdentities(edit.after)).toEqual(expectedIdentities);
      expect(JSON.stringify(edit.after)).not.toContain('localNodeId');
    } finally {
      editor.destroy();
    }
  });
});

describe('[expected red] canonical lossless normalizer handoff', () => {
  it('carries exact before and final inline runs when text and marks change together', () => {
    const editor = createEditor();
    try {
      const position = positionOf(editor.state.doc, 'paragraph.alpha');
      const transaction = editor.state.tr.insertText('!', position + 1 + 'Alpha'.length);
      transaction.addMark(
        position + 1,
        position + 1 + 'Alpha!'.length,
        editor.schema.marks.italic.create(),
      );

      expect(normalizedEdits(transaction)).toEqual([{
        kind: 'text',
        nodeId: 'paragraph.alpha',
        before: 'Alpha',
        after: 'Alpha!',
        beforeInlineRuns: [{ text: 'Alpha', marks: [] }],
        afterInlineRuns: [{ text: 'Alpha!', marks: [{ kind: 'italic' }] }],
      }, {
        kind: 'mark',
        nodeId: 'paragraph.alpha',
        before: [{ text: 'Alpha', marks: [] }],
        after: [{ text: 'Alpha!', marks: [{ kind: 'italic' }] }],
      }]);
    } finally {
      editor.destroy();
    }
  });

  it('records source provenance on a uniquely aligned single-node copy', () => {
    const editor = createEditor();
    try {
      const position = positionOf(editor.state.doc, 'paragraph.alpha');
      const [edit] = normalizedEdits(editor.state.tr.insert(
        position,
        nodeAt(editor, 'paragraph.alpha'),
      ));

      expect(edit).toEqual({
        kind: 'insert',
        localNodeId: 'local:0',
        parent: { kind: 'stable', nodeId: 'document.lossless' },
        index: 0,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:0',
          sourceNodeId: 'paragraph.alpha',
          content: [{ kind: 'text', text: 'Alpha' }],
        },
      });
    } finally {
      editor.destroy();
    }
  });

  it('records source provenance for every persistent node in a copied nested subtree', () => {
    const editor = createEditor();
    try {
      const position = positionOf(editor.state.doc, 'blockquote.source');
      const [edit] = normalizedEdits(editor.state.tr.insert(
        position,
        nodeAt(editor, 'blockquote.source'),
      ));

      expect(edit).toEqual({
        kind: 'insert',
        localNodeId: 'local:0',
        parent: { kind: 'stable', nodeId: 'document.lossless' },
        index: 2,
        node: {
          kind: 'blockquote',
          localNodeId: 'local:0',
          sourceNodeId: 'blockquote.source',
          children: [{
            kind: 'paragraph',
            localNodeId: 'local:1',
            sourceNodeId: 'paragraph.quote',
            content: [{ kind: 'text', text: 'Quoted' }],
          }],
        },
      });
    } finally {
      editor.destroy();
    }
  });
});
