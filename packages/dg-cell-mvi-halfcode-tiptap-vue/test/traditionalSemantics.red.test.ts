import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  applyXnlRichDocumentTiptapDraftTransaction,
  createXnlRichDocumentTiptapDraft,
  createXnlRichDocumentTiptapSchema,
  normalizeTiptapTransaction,
  redoXnlRichDocumentTiptapDraft,
  reprojectXnlRichDocumentTiptapAccepted,
  settleXnlRichDocumentTiptapComposition,
  undoXnlRichDocumentTiptapDraft,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapDraftResult,
  type XnlRichDocumentTiptapInteractionIntent,
  type XnlRichDocumentTiptapTransactionResult,
} from '../src';

const CONFIG = {
  planNodeId: 'xnlp:node:traditional',
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;

const DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.traditional' },
  content: [{
    type: 'paragraph',
    attrs: { nodeId: 'paragraph.traditional' },
    content: [
      {
        type: 'text',
        text: 'Alpha',
        marks: [
          { type: 'underline' },
          { type: 'textStyle', attrs: { color: '#123456' } },
          { type: 'highlight', attrs: { color: null } },
        ],
      },
      { type: 'hardBreak', attrs: { nodeId: 'hardbreak.traditional' } },
      { type: 'text', text: 'Beta' },
    ],
  }, {
    type: 'taskList',
    attrs: { nodeId: 'tasklist.traditional' },
    content: [{
      type: 'taskItem',
      attrs: { nodeId: 'taskitem.alpha', checked: false },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.task.alpha' },
        content: [{ type: 'text', text: 'First task' }],
      }],
    }, {
      type: 'taskItem',
      attrs: { nodeId: 'taskitem.beta', checked: true },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.task.beta' },
        content: [{ type: 'text', text: 'Second task' }],
      }],
    }],
  }, {
    type: 'horizontalRule',
    attrs: { nodeId: 'horizontalrule.traditional' },
  }],
};

function state(document: JSONContent = DOCUMENT): EditorState {
  const result = createXnlRichDocumentTiptapSchema();
  if (result.status !== 'ready') throw new Error('Expected canonical schema.');
  return EditorState.create({ schema: result.schema, doc: result.schema.nodeFromJSON(document) });
}

function positionOf(document: ProseMirrorNode, nodeId: string): number {
  let found = -1;
  document.descendants((node, position) => {
    if (found < 0 && node.attrs.nodeId === nodeId) found = position;
  });
  if (found < 0) throw new Error(`Missing ${nodeId}.`);
  return found;
}

function semanticEdits(result: XnlRichDocumentTiptapTransactionResult): readonly Record<string, unknown>[] {
  expect(result.status).toBe('normalized');
  if (result.status !== 'normalized') throw new Error('Expected normalized transaction.');
  return result.intent.proposal.payload.edits;
}

function draftOf(result: XnlRichDocumentTiptapDraftResult) {
  if (result.state === undefined) throw new Error(`Missing draft for ${result.outcome.status}.`);
  return result.state;
}

function emittedRuntime(intents: XnlRichDocumentTiptapInteractionIntent[]) {
  return {
    emitInteraction: (
      _runtime: unknown,
      input: Readonly<{ intent: XnlRichDocumentTiptapInteractionIntent }>,
    ) => {
      intents.push(input.intent);
      return { status: 'emitted' as const };
    },
  };
}

describe('traditional RichDocument Tiptap transactions', () => {
  it('normalizes alignment and checked state as closed node-attribute edits', () => {
    const editor = state();
    const paragraphPosition = positionOf(editor.doc, 'paragraph.traditional');
    const paragraph = editor.doc.nodeAt(paragraphPosition);
    if (paragraph === null) throw new Error('Missing paragraph.');
    expect(semanticEdits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.setNodeMarkup(paragraphPosition, undefined, { ...paragraph.attrs, textAlign: 'center' }) },
      CONFIG,
    ))).toEqual([{
      kind: 'node-attributes',
      nodeId: 'paragraph.traditional',
      before: { kind: 'paragraph' },
      after: { kind: 'paragraph', align: 'center' },
    }]);

    const taskPosition = positionOf(editor.doc, 'taskitem.alpha');
    const taskItem = editor.doc.nodeAt(taskPosition);
    if (taskItem === null) throw new Error('Missing task item.');
    expect(semanticEdits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.setNodeMarkup(taskPosition, undefined, { ...taskItem.attrs, checked: true }) },
      CONFIG,
    ))).toEqual([{
      kind: 'node-attributes',
      nodeId: 'taskitem.alpha',
      before: { kind: 'task-item', checked: false },
      after: { kind: 'task-item', checked: true },
    }]);
  });

  it('normalizes underline, canonical color, and highlight marks without style or HTML data', () => {
    const editor = state();
    const paragraphPosition = positionOf(editor.doc, 'paragraph.traditional');
    const transaction = editor.tr.addMark(
      paragraphPosition + 7,
      paragraphPosition + 11,
      editor.schema.marks.textStyle.create({ color: 'rgb(1 2 3 / 50%)' }),
    ).addMark(
      paragraphPosition + 7,
      paragraphPosition + 11,
      editor.schema.marks.highlight.create({ color: 'yellow' }),
    ).addMark(
      paragraphPosition + 7,
      paragraphPosition + 11,
      editor.schema.marks.underline.create(),
    );

    const edits = semanticEdits(normalizeTiptapTransaction({}, { transaction }, CONFIG));
    expect(edits).toEqual([expect.objectContaining({
      kind: 'inline',
      nodeId: 'paragraph.traditional',
      after: expect.arrayContaining([expect.objectContaining({
        kind: 'text',
        marks: expect.arrayContaining([
          { kind: 'underline' },
          { kind: 'text-color', color: 'rgb(1 2 3 / 50%)' },
          { kind: 'highlight', color: 'yellow' },
        ]),
      })]),
    })]);
    expect(JSON.stringify(edits)).not.toMatch(/style|html/i);
  });

  it('rejects unsafe colors through G2 canonical validation', () => {
    const editor = state();
    const paragraphPosition = positionOf(editor.doc, 'paragraph.traditional');
    const transaction = editor.tr.addMark(
      paragraphPosition + 7,
      paragraphPosition + 11,
      editor.schema.marks.textStyle.create({ color: 'var(--not-canonical)' }),
    );

    expect(normalizeTiptapTransaction({}, { transaction }, CONFIG)).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'LOSSY_TIPTAP_TRANSACTION' })]),
    });
  });

  it('uses an inline edit for paste-style hard-break insertion and ignores forged identity', () => {
    const editor = state();
    const paragraphPosition = positionOf(editor.doc, 'paragraph.traditional');
    const pastedBreak = editor.schema.nodes.hardBreak.create({ nodeId: 'forged.paste.identity' });
    const transaction = editor.tr.insert(paragraphPosition + 3, pastedBreak);
    const edits = semanticEdits(normalizeTiptapTransaction({}, { transaction }, CONFIG));

    expect(edits).toEqual([expect.objectContaining({
      kind: 'inline',
      nodeId: 'paragraph.traditional',
      after: expect.arrayContaining([
        expect.objectContaining({ kind: 'hard-break', localNodeId: expect.any(String) }),
      ]),
    })]);
    expect(JSON.stringify(edits)).not.toContain('forged.paste.identity');
  });

  it('preserves hard-break identity for move and records source identity for copy', () => {
    const editor = state();
    const breakPosition = positionOf(editor.doc, 'hardbreak.traditional');
    const hardBreak = editor.doc.nodeAt(breakPosition);
    if (hardBreak === null) throw new Error('Missing hard break.');

    const copied = semanticEdits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insert(breakPosition, hardBreak) },
      CONFIG,
    ));
    expect(copied).toEqual([expect.objectContaining({
      kind: 'inline',
      after: expect.arrayContaining([expect.objectContaining({
        kind: 'hard-break',
        localNodeId: expect.any(String),
        sourceNodeId: 'hardbreak.traditional',
      })]),
    })]);

    const movedTransaction = editor.tr.delete(breakPosition, breakPosition + hardBreak.nodeSize);
    movedTransaction.insert(positionOf(movedTransaction.doc, 'paragraph.traditional') + 1, hardBreak);
    const moved = semanticEdits(normalizeTiptapTransaction({}, { transaction: movedTransaction }, CONFIG));
    expect(moved).toEqual([expect.objectContaining({
      kind: 'inline',
      before: expect.arrayContaining([{ kind: 'hard-break', nodeId: 'hardbreak.traditional' }]),
      after: expect.arrayContaining([{ kind: 'hard-break', nodeId: 'hardbreak.traditional' }]),
    })]);
  });

  it('keeps task items independent from listItem during copy and move', () => {
    const editor = state();
    const alphaPosition = positionOf(editor.doc, 'taskitem.alpha');
    const alpha = editor.doc.nodeAt(alphaPosition);
    if (alpha === null) throw new Error('Missing task item.');
    const copied = semanticEdits(normalizeTiptapTransaction(
      {},
      { transaction: editor.tr.insert(alphaPosition, alpha) },
      CONFIG,
    ));
    expect(copied).toEqual([expect.objectContaining({
      kind: 'insert',
      node: expect.objectContaining({
        kind: 'task-item',
        checked: false,
        sourceNodeId: 'taskitem.alpha',
      }),
    })]);
    expect(JSON.stringify(copied)).not.toContain('"kind":"list-item"');

    const betaPosition = positionOf(editor.doc, 'taskitem.beta');
    const beta = editor.doc.nodeAt(betaPosition);
    if (beta === null) throw new Error('Missing second task item.');
    const movedTransaction = editor.tr.delete(betaPosition, betaPosition + beta.nodeSize);
    movedTransaction.insert(positionOf(movedTransaction.doc, 'taskitem.alpha'), beta);
    expect(semanticEdits(normalizeTiptapTransaction({}, { transaction: movedTransaction }, CONFIG)))
      .toContainEqual(expect.objectContaining({ kind: 'move', nodeId: 'taskitem.beta' }));
  });
});

describe('traditional RichDocument draft lifecycle', () => {
  it('buffers IME, publishes settlement, and keeps matching acceptance history for undo and redo', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const created = createXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { document: DOCUMENT, acceptedObservation: 'accepted:traditional:1' },
      CONFIG,
    );
    const initial = draftOf(created);
    const paragraphPosition = positionOf(initial.editorState.doc, 'paragraph.traditional');
    const paragraph = initial.editorState.doc.nodeAt(paragraphPosition);
    if (paragraph === null) throw new Error('Missing paragraph.');
    const buffered = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      {
        state: initial,
        transaction: initial.editorState.tr.setNodeMarkup(
          paragraphPosition,
          undefined,
          { ...paragraph.attrs, textAlign: 'justify' },
        ),
        composition: 'intermediate',
      },
      CONFIG,
    );
    expect(buffered.outcome).toMatchObject({ status: 'composition-buffered', published: false });
    expect(intents).toHaveLength(0);

    const settled = settleXnlRichDocumentTiptapComposition(
      emittedRuntime(intents),
      { state: draftOf(buffered) },
      CONFIG,
    );
    expect(settled.outcome).toMatchObject({ status: 'composition-settled', publication: 'published' });
    expect(intents.at(-1)?.proposal.payload.edits).toEqual([expect.objectContaining({
      kind: 'node-attributes',
      after: { kind: 'paragraph', align: 'justify' },
    })]);

    const settledState = draftOf(settled);
    const matching = reprojectXnlRichDocumentTiptapAccepted(
      emittedRuntime(intents),
      {
        state: settledState,
        document: settledState.editorState.doc.toJSON(),
        acceptedObservation: 'accepted:traditional:2',
      },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(matching.outcome).toMatchObject({ status: 'reprojected', reason: 'accepted-local-draft' });

    const undone = undoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: draftOf(matching) },
      CONFIG,
    );
    expect(undone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    const redone = redoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: draftOf(undone) },
      CONFIG,
    );
    expect(redone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
  });

  it('preserves a stale traditional draft on conflict and clears its history on replacement', () => {
    const created = createXnlRichDocumentTiptapDraft({}, { document: DOCUMENT }, CONFIG);
    const initial = draftOf(created);
    const taskPosition = positionOf(initial.editorState.doc, 'taskitem.alpha');
    const task = initial.editorState.doc.nodeAt(taskPosition);
    if (task === null) throw new Error('Missing task item.');
    const edited = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      {
        state: initial,
        transaction: initial.editorState.tr.setNodeMarkup(
          taskPosition,
          undefined,
          { ...task.attrs, checked: true },
        ),
      },
      CONFIG,
    );
    const editedState = draftOf(edited);
    const replacement = structuredClone(DOCUMENT);
    replacement.content![0]!.attrs = { nodeId: 'paragraph.traditional', textAlign: 'end' };

    const conflict = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: editedState, document: replacement },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(conflict.outcome).toMatchObject({ status: 'conflict', localDraftPreserved: true });
    expect(draftOf(conflict)).toBe(editedState);

    const replaced = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: editedState, document: replacement },
      { ...CONFIG, staleDraftPolicy: 'replace' },
    );
    expect(replaced.outcome).toMatchObject({ status: 'reprojected', reason: 'replaced-stale-draft' });
    expect(undoXnlRichDocumentTiptapDraft({}, { state: draftOf(replaced) }, CONFIG).outcome)
      .toMatchObject({ status: 'applied', publication: 'silent', reason: 'history-empty' });
  });
});
