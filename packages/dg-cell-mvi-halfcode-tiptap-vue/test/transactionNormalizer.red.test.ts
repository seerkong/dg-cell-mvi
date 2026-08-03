import type { JSONContent } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import type { XnlProjectionPresenterEditIntent } from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlRichDocumentTiptapSchema,
  normalizeTiptapTransaction,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapSemanticNode,
  type XnlRichDocumentTiptapTransactionResult,
} from '../src';

const CONFIG = {
  planNodeId: 'xnlp:node:document.fixture',
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;

const SIMPLE_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.fixture' },
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
      type: 'codeBlock',
      attrs: { nodeId: 'code.sample', language: 'ts' },
      content: [{ type: 'text', text: 'const value = 1' }],
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

const MULTI_MARK_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.multi-mark' },
  content: [{
    type: 'paragraph',
    attrs: { nodeId: 'paragraph.multi-mark' },
    content: [{
      type: 'text',
      text: 'Domain XNL',
      marks: [{
        type: 'link',
        attrs: { href: 'https://example.com/xnl', title: 'Domain XNL' },
      }, { type: 'italic' }],
    }],
  }],
};

const TABLE_SPAN_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.table-spans' },
  content: [{
    type: 'table',
    attrs: { nodeId: 'table.spans' },
    content: [{
      type: 'tableRow',
      attrs: { nodeId: 'row.spans' },
      content: [{
        type: 'tableHeader',
        attrs: { nodeId: 'header.explicit', colspan: 2, rowspan: 1 },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.header.explicit' },
          content: [{ type: 'text', text: 'Explicit header' }],
        }],
      }, {
        type: 'tableHeader',
        attrs: { nodeId: 'header.default', colspan: 1, rowspan: 1 },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.header.default' },
          content: [{ type: 'text', text: 'Default header' }],
        }],
      }, {
        type: 'tableCell',
        attrs: { nodeId: 'cell.default', colspan: 1, rowspan: 1 },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.cell.default' },
          content: [{ type: 'text', text: 'Default cell' }],
        }],
      }],
    }],
  }],
};

const NON_DEFAULT_CELL_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.non-default-cell' },
  content: [{
    type: 'table',
    attrs: { nodeId: 'table.non-default-cell' },
    content: [{
      type: 'tableRow',
      attrs: { nodeId: 'row.non-default-cell' },
      content: [{
        type: 'tableCell',
        attrs: { nodeId: 'cell.non-default', colspan: 2, rowspan: 1 },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.non-default-cell' },
          content: [{ type: 'text', text: 'Merged cell' }],
        }],
      }],
    }],
  }],
};

function state(document: JSONContent = SIMPLE_DOCUMENT): EditorState {
  const result = createXnlRichDocumentTiptapSchema();
  if (result.status !== 'ready') throw new Error('Expected a ready schema.');
  return EditorState.create({
    schema: result.schema,
    doc: result.schema.nodeFromJSON(document),
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

function normalized(result: XnlRichDocumentTiptapTransactionResult) {
  expect(result.status).toBe('normalized');
  if (result.status !== 'normalized') throw new Error('Expected normalized result.');
  return result.intent.proposal;
}

function edits(result: XnlRichDocumentTiptapTransactionResult): readonly Record<string, unknown>[] {
  const proposal = normalized(result);
  const payload = proposal.payload as { edits: readonly Record<string, unknown>[] };
  return payload.edits;
}

function semanticNodes(root: XnlRichDocumentTiptapSemanticNode): XnlRichDocumentTiptapSemanticNode[] {
  const descendants = 'children' in root
    ? root.children
    : 'content' in root
      ? root.content
      : [];
  return [root, ...descendants.flatMap(semanticNodes)];
}

function semanticNode(
  root: XnlRichDocumentTiptapSemanticNode,
  nodeId: string,
): XnlRichDocumentTiptapSemanticNode {
  const found = semanticNodes(root).find((node) => 'nodeId' in node && node.nodeId === nodeId);
  if (found === undefined) throw new Error(`Missing semantic node ${nodeId}.`);
  return found;
}

function tableSnapshotEdit(edit: Record<string, unknown>): Readonly<{
  before: XnlRichDocumentTiptapSemanticNode;
  after: XnlRichDocumentTiptapSemanticNode;
}> {
  expect(edit).toMatchObject({ kind: 'table' });
  if (edit.kind !== 'table') throw new Error('Expected table edit.');
  return edit as Readonly<{
    before: XnlRichDocumentTiptapSemanticNode;
    after: XnlRichDocumentTiptapSemanticNode;
  }>;
}

describe('Tiptap transaction normalizer', () => {
  it('normalizes a real text ReplaceStep into a revision-free interaction', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('!', paragraph + 1 + 'Alpha'.length);

    const result = normalizeTiptapTransaction({}, { transaction }, CONFIG);
    const proposal = normalized(result);

    expect(proposal).toMatchObject({
      type: 'xnl.rich-document.edit',
      target: { planNodeId: CONFIG.planNodeId },
      payload: {
        version: 1,
        edits: [{
          kind: 'text',
          nodeId: 'paragraph.alpha',
          before: 'Alpha',
          after: 'Alpha!',
        }],
      },
      provenance: {
        adapter: 'tiptap',
        documentChanged: true,
        operationKinds: ['text'],
      },
    });
    expect(result).toEqual(JSON.parse(JSON.stringify(result)));
    expect(JSON.stringify(result)).not.toMatch(
      /revision|editor|transaction|step|command|submit|writer|valueHost|vfs|vcs|translator|session|allocator|function|class/i,
    );
  });

  it('distinguishes mark edits from text edits', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const mark = editor.schema.marks.bold.create();
    const transaction = editor.tr.addMark(paragraph + 1, paragraph + 1 + 5, mark);

    expect(edits(normalizeTiptapTransaction({}, { transaction }, CONFIG))).toEqual([{
      kind: 'mark',
      nodeId: 'paragraph.alpha',
      before: [{ text: 'Alpha', marks: [] }],
      after: [{ text: 'Alpha', marks: [{ kind: 'bold' }] }],
    }]);
  });

  it('emits inline snapshots in canonical RichDocument mark order', () => {
    const editor = state(MULTI_MARK_DOCUMENT);
    const paragraph = positionOf(editor.doc, 'paragraph.multi-mark');
    const [edit] = edits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insertText('Accepted ', paragraph + 1) },
      CONFIG,
    ));

    expect(edit).toMatchObject({
      kind: 'text',
      nodeId: 'paragraph.multi-mark',
      beforeInlineRuns: [{
        text: 'Domain XNL',
        marks: [
          { kind: 'italic' },
          { kind: 'link', href: 'https://example.com/xnl', title: 'Domain XNL' },
        ],
      }],
      afterInlineRuns: [{
        text: 'Accepted Domain XNL',
        marks: [
          { kind: 'italic' },
          { kind: 'link', href: 'https://example.com/xnl', title: 'Domain XNL' },
        ],
      }],
    });
  });

  it('normalizes insert and delete without trusting an inserted nodeId', () => {
    const editor = state();
    const untrusted = editor.schema.nodes.paragraph.create(
      { nodeId: 'attacker.claimed-domain-id' },
      editor.schema.text('Inserted'),
    );
    const insertAt = positionOf(editor.doc, 'paragraph.beta');
    const inserted = normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insert(insertAt, untrusted) },
      CONFIG,
    );
    const insertEdit = edits(inserted)[0];
    expect(insertEdit).toMatchObject({
      kind: 'insert',
      localNodeId: 'local:0',
      parent: { kind: 'stable', nodeId: 'document.fixture' },
      index: 1,
      node: {
        kind: 'paragraph',
        localNodeId: 'local:0',
        content: [{ kind: 'text', text: 'Inserted' }],
      },
    });
    expect(JSON.stringify(insertEdit)).not.toContain('attacker.claimed-domain-id');

    const beta = editor.doc.nodeAt(positionOf(editor.doc, 'paragraph.beta'));
    if (beta === null) throw new Error('Missing beta paragraph.');
    const deleted = normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.delete(insertAt, insertAt + beta.nodeSize) },
      CONFIG,
    );
    expect(edits(deleted)).toEqual([{
      kind: 'delete',
      nodeId: 'paragraph.beta',
      parent: { kind: 'stable', nodeId: 'document.fixture' },
      index: 1,
    }]);
  });

  it('keeps the mapped original stable when a copied node is inserted before it', () => {
    const editor = state();
    const alphaPosition = positionOf(editor.doc, 'paragraph.alpha');
    const alpha = editor.doc.nodeAt(alphaPosition);
    if (alpha === null) throw new Error('Missing alpha paragraph.');

    const copyEdit = edits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insert(alphaPosition, alpha) },
      CONFIG,
    ));

    expect(copyEdit).toEqual([expect.objectContaining({
      kind: 'insert',
      localNodeId: 'local:0',
      parent: { kind: 'stable', nodeId: 'document.fixture' },
      index: 0,
      node: expect.objectContaining({
        kind: 'paragraph',
        localNodeId: 'local:0',
        sourceNodeId: 'paragraph.alpha',
      }),
    })]);
    expect(JSON.stringify(copyEdit)).not.toContain('"nodeId":"paragraph.alpha"');
  });

  it('recognizes a stable block move from actual delete and insert steps', () => {
    const editor = state();
    const alphaPosition = positionOf(editor.doc, 'paragraph.alpha');
    const alpha = editor.doc.nodeAt(alphaPosition);
    if (alpha === null) throw new Error('Missing alpha paragraph.');
    const transaction = editor.tr.delete(alphaPosition, alphaPosition + alpha.nodeSize);
    transaction.insert(transaction.doc.content.size, alpha);

    expect(edits(normalizeTiptapTransaction({}, { transaction }, CONFIG))).toContainEqual({
      kind: 'move',
      nodeId: 'paragraph.alpha',
      from: { parent: { kind: 'stable', nodeId: 'document.fixture' }, index: 0 },
      to: { parent: { kind: 'stable', nodeId: 'document.fixture' }, index: 3 },
    });
  });

  it('distinguishes code and table edits using their stable block identities', () => {
    const codeEditor = state();
    const codePosition = positionOf(codeEditor.doc, 'code.sample');
    const codeTransaction = codeEditor.tr.insertText('0', codePosition + 1 + 'const value = '.length);
    expect(edits(normalizeTiptapTransaction({}, { transaction: codeTransaction }, CONFIG))).toEqual([{
      kind: 'code',
      nodeId: 'code.sample',
      before: { language: 'ts', text: 'const value = 1' },
      after: { language: 'ts', text: 'const value = 01' },
    }]);

    const tableEditor = state();
    const cellPosition = positionOf(tableEditor.doc, 'cell.sample');
    const cell = tableEditor.doc.nodeAt(cellPosition);
    if (cell === null) throw new Error('Missing table cell.');
    const tableTransaction = tableEditor.tr.setNodeMarkup(cellPosition, undefined, {
      ...cell.attrs,
      colspan: 2,
    });
    const tableEdit = edits(normalizeTiptapTransaction({}, { transaction: tableTransaction }, CONFIG))[0];
    expect(tableEdit).toMatchObject({
      kind: 'table',
      nodeId: 'table.sample',
      before: { kind: 'table', nodeId: 'table.sample' },
      after: { kind: 'table', nodeId: 'table.sample' },
    });
    expect(tableEdit).not.toEqual(expect.objectContaining({ transaction: expect.anything() }));
    expect(JSON.stringify(tableEdit)).toContain('"colspan":2');
  });

  it('uses canonical default span omission for table cell snapshots without losing non-default colspan', () => {
    const editor = state(TABLE_SPAN_DOCUMENT);
    const cellPosition = positionOf(editor.doc, 'cell.default');
    const cell = editor.doc.nodeAt(cellPosition);
    if (cell === null) throw new Error('Missing default table cell.');
    const [edit] = edits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.setNodeMarkup(cellPosition, undefined, { ...cell.attrs, colspan: 2 }) },
      CONFIG,
    ));
    expect(edit).toMatchObject({ kind: 'table', nodeId: 'table.spans' });
    const tableEdit = tableSnapshotEdit(edit);

    expect(semanticNode(tableEdit.before, 'cell.default')).not.toHaveProperty('colspan');
    expect(semanticNode(tableEdit.before, 'cell.default')).not.toHaveProperty('rowspan');
    expect(semanticNode(tableEdit.after, 'cell.default')).toMatchObject({ colspan: 2, rowspan: 1 });
    expect(semanticNode(tableEdit.before, 'header.explicit')).toMatchObject({ colspan: 2, rowspan: 1 });
    expect(semanticNode(tableEdit.after, 'header.explicit')).toMatchObject({ colspan: 2, rowspan: 1 });
  });

  it('uses canonical default span omission for table header snapshots without losing non-default rowspan', () => {
    const editor = state(TABLE_SPAN_DOCUMENT);
    const headerPosition = positionOf(editor.doc, 'header.default');
    const header = editor.doc.nodeAt(headerPosition);
    if (header === null) throw new Error('Missing default table header.');
    const [edit] = edits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.setNodeMarkup(headerPosition, undefined, { ...header.attrs, rowspan: 2 }) },
      CONFIG,
    ));
    expect(edit).toMatchObject({ kind: 'table', nodeId: 'table.spans' });
    const tableEdit = tableSnapshotEdit(edit);

    expect(semanticNode(tableEdit.before, 'header.default')).not.toHaveProperty('colspan');
    expect(semanticNode(tableEdit.before, 'header.default')).not.toHaveProperty('rowspan');
    expect(semanticNode(tableEdit.after, 'header.default')).toMatchObject({ colspan: 1, rowspan: 2 });
  });

  it('omits table spans again when a non-default cell returns to canonical defaults', () => {
    const editor = state(NON_DEFAULT_CELL_DOCUMENT);
    const cellPosition = positionOf(editor.doc, 'cell.non-default');
    const cell = editor.doc.nodeAt(cellPosition);
    if (cell === null) throw new Error('Missing non-default table cell.');
    const [edit] = edits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.setNodeMarkup(cellPosition, undefined, { ...cell.attrs, colspan: 1, rowspan: 1 }) },
      CONFIG,
    ));
    expect(edit).toMatchObject({ kind: 'table', nodeId: 'table.non-default-cell' });
    const tableEdit = tableSnapshotEdit(edit);

    expect(semanticNode(tableEdit.before, 'cell.non-default')).toMatchObject({ colspan: 2, rowspan: 1 });
    expect(semanticNode(tableEdit.after, 'cell.non-default')).not.toHaveProperty('colspan');
    expect(semanticNode(tableEdit.after, 'cell.non-default')).not.toHaveProperty('rowspan');
  });

  it.each([
    ['selection-only', (editor: EditorState) => editor.tr.setSelection(TextSelection.create(editor.doc, 2))],
    ['metadata-only', (editor: EditorState) => editor.tr.setMeta('history$', { rebased: true })],
    ['no-document-change', (editor: EditorState) => editor.tr],
  ] as const)('keeps %s transactions silent', (reason, makeTransaction) => {
    const result = normalizeTiptapTransaction({}, { transaction: makeTransaction(state()) }, CONFIG);
    expect(result).toEqual({ status: 'silent', reason });
  });

  it('keeps an intermediate composition document change silent', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('x', paragraph + 1);
    const bridgeCalls: unknown[] = [];

    const result = normalizeTiptapTransaction(
      {},
      { transaction, composition: 'intermediate' },
      CONFIG,
    );

    expect(result).toEqual({ status: 'silent', reason: 'intermediate-composition' });
    expect(bridgeCalls).toEqual([]);
  });

  it('fails closed for command routing and authority-bearing wrapper data', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('!', paragraph + 1);

    for (const input of [
      { transaction, kind: 'command' },
      { transaction, submit: () => undefined },
      { transaction, currentRevision: 'rev-7' },
    ]) {
      const result = normalizeTiptapTransaction({}, input as never, CONFIG);
      expect(result).toMatchObject({ status: 'rejected' });
    }
    expect(normalizeTiptapTransaction(
      { writer: () => undefined } as never,
      { transaction },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });

    for (const [key, value] of [
      ['command', { type: 'domain.command' }],
      ['submit', () => undefined],
      ['baseLiveRevision', 'rev-7'],
    ] as const) {
      const withAuthorityMetadata = editor.tr
        .insertText('!', paragraph + 1)
        .setMeta(key, value);
      expect(normalizeTiptapTransaction(
        {},
        { transaction: withAuthorityMetadata },
        CONFIG,
      )).toMatchObject({ status: 'rejected' });
    }
  });

  it('fails closed when a revoked boundary proxy cannot be inspected', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => normalizeTiptapTransaction(
      proxy as never,
      { transaction: editor.tr.insertText('!', paragraph + 1) },
      CONFIG,
    )).not.toThrow();
    expect(normalizeTiptapTransaction(
      proxy as never,
      { transaction: editor.tr.insertText('!', paragraph + 1) },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });
  });

  it('rejects a revoked transaction proxy without throwing', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const { proxy, revoke } = Proxy.revocable(
      editor.tr.insertText('!', paragraph + 1),
      {},
    );
    revoke();

    expect(() => normalizeTiptapTransaction(
      {},
      { transaction: proxy as never },
      CONFIG,
    )).not.toThrow();
    expect(normalizeTiptapTransaction(
      {},
      { transaction: proxy as never },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });
  });

  it('rejects an own accessor shadow on a real transaction without invoking it', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('!', paragraph + 1);
    let getterCalls = 0;
    Object.defineProperty(transaction, 'docChanged', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return true;
      },
    });

    expect(normalizeTiptapTransaction(
      {},
      { transaction },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });
    expect(getterCalls).toBe(0);
  });

  it.each([
    'docChanged',
    'selectionSet',
    'before',
    'doc',
    'mapping',
    'steps',
    'meta',
  ] as const)('rejects an own %s accessor before reading trusted transaction state', (key) => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('!', paragraph + 1);
    let getterCalls = 0;
    Object.defineProperty(transaction, key, {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return undefined;
      },
    });

    expect(normalizeTiptapTransaction(
      {},
      { transaction },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });
    expect(getterCalls).toBe(0);
  });

  it.each([
    ['custom string state', 'customState'],
    ['symbol state', Symbol('transaction-state')],
  ] as const)('rejects %s on a concrete transaction', (_label, key) => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const transaction = editor.tr.insertText('!', paragraph + 1);
    Object.defineProperty(transaction, key, {
      value: true,
      enumerable: true,
      configurable: true,
      writable: true,
    });

    expect(normalizeTiptapTransaction(
      {},
      { transaction },
      CONFIG,
    )).toMatchObject({ status: 'rejected' });
  });

  it('rejects an accessor-backed extension registry without invoking the getter', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const extensionIds = [...XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS];
    let getterCalls = 0;
    Object.defineProperty(extensionIds, '0', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS[0];
      },
    });

    expect(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insertText('!', paragraph + 1) },
      { ...CONFIG, extensionIds },
    )).toMatchObject({ status: 'rejected' });
    expect(getterCalls).toBe(0);
  });

  it('rejects an accessor-backed inserted snapshot without invoking the getter', () => {
    const editor = state();
    let getterCalls = 0;
    const input = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(input, 'secret', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'leaked';
      },
    });
    const embed = editor.schema.nodes.componentEmbed.create({
      nodeId: null,
      ref: 'component://#example',
      version: null,
      input,
    });
    const transaction = editor.tr.insert(positionOf(editor.doc, 'paragraph.beta'), embed);

    expect(normalizeTiptapTransaction({}, { transaction }, CONFIG)).toMatchObject({
      status: 'rejected',
    });
    expect(getterCalls).toBe(0);
  });

  it('returns the interaction-only intent variant', () => {
    const editor = state();
    const paragraph = positionOf(editor.doc, 'paragraph.alpha');
    const result = normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insertText('!', paragraph + 1) },
      CONFIG,
    );
    if (result.status !== 'normalized') throw new Error('Expected normalized result.');
    const interaction: Extract<XnlProjectionPresenterEditIntent, { kind: 'interaction' }> = result.intent;
    expect(interaction.kind).toBe('interaction');
  });
});
