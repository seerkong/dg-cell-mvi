import type { JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  applyXnlRichDocumentTiptapDraftTransaction,
  createXnlRichDocumentTiptapDraft,
  redoXnlRichDocumentTiptapDraft,
  reprojectXnlRichDocumentTiptapAccepted,
  settleXnlRichDocumentTiptapComposition,
  undoXnlRichDocumentTiptapDraft,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapDraftResult,
  type XnlRichDocumentTiptapInteractionIntent,
} from '../src';

const CONFIG = {
  planNodeId: 'xnlp:node:document.fixture',
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;

const DOCUMENT: JSONContent = {
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
  ],
};

function created(document: JSONContent = DOCUMENT, acceptedObservation = 'accepted:1') {
  const result = createXnlRichDocumentTiptapDraft(
    {},
    { document, acceptedObservation },
    CONFIG,
  );
  expect(result.outcome.status).toBe('ready');
  if (result.state === undefined) throw new Error('Expected draft state.');
  return result.state;
}

function stateOf(result: XnlRichDocumentTiptapDraftResult) {
  if (result.state === undefined) throw new Error(`Expected draft state for ${result.outcome.status}.`);
  return result.state;
}

function emittedRuntime(intents: XnlRichDocumentTiptapInteractionIntent[]) {
  return {
    emitInteraction: (
      _runtime: unknown,
      input: Readonly<{ intent: XnlRichDocumentTiptapInteractionIntent }>,
      _config: Readonly<Record<string, never>>,
    ) => {
      intents.push(input.intent);
      return { status: 'emitted' as const };
    },
  };
}

function textPosition(state: ReturnType<typeof created>, text: string): number {
  const position = state.editorState.doc.textBetween(0, state.editorState.doc.content.size).indexOf(text);
  if (position < 0) throw new Error(`Missing text ${text}.`);
  let found = -1;
  state.editorState.doc.descendants((node, nodePosition) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = nodePosition;
  });
  if (found < 0) throw new Error(`Missing text node ${text}.`);
  return found;
}

function expectSerializable(outcome: XnlRichDocumentTiptapDraftResult['outcome']): void {
  expect(JSON.parse(JSON.stringify(outcome))).toEqual(outcome);
}

describe('Tiptap local draft lifecycle', () => {
  it('keeps selection and metadata-only transactions local and silent', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const selection = initial.editorState.tr.setSelection(TextSelection.create(initial.editorState.doc, 2));

    const selected = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: initial, transaction: selection },
      CONFIG,
    );
    expect(selected.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'selection-only',
      localDraft: false,
    });
    const selectedState = stateOf(selected);
    expect(selectedState.editorState.selection.from).toBe(2);

    const metadata = selectedState.editorState.tr.setMeta('history$', { rebased: true });
    const metadataOnly = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: selectedState, transaction: metadata },
      CONFIG,
    );
    expect(metadataOnly.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'metadata-only',
    });
    expect(intents).toEqual([]);
    expectSerializable(metadataOnly.outcome);
  });

  it('publishes only a revision-free interaction and keeps the changed draft pending', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const transaction = initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5);

    const result = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: initial, transaction },
      CONFIG,
    );

    expect(result.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
    const resultState = stateOf(result);
    expect(resultState.editorState.doc.textContent).toContain('Alpha!');
    expect(resultState.acceptedDocument.textContent).toContain('Alpha');
    expect(resultState.acceptedDocument.textContent).not.toContain('Alpha!');
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ kind: 'interaction' });
    expect(JSON.stringify(intents[0])).not.toMatch(
      /acceptedObservation|revision|submit|writer|translator|session|allocator|valueHost|vfs|vcs/i,
    );
    expectSerializable(result.outcome);
  });

  it('retains a local failed draft without claiming publication or acceptance', () => {
    const initial = created();
    const transaction = initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5);
    const result = applyXnlRichDocumentTiptapDraftTransaction(
      {
        emitInteraction: () => {
          throw new Error('host unavailable');
        },
      },
      { state: initial, transaction },
      CONFIG,
    );

    expect(result.outcome).toMatchObject({
      status: 'publication-failed',
      localDraft: true,
      pendingAcceptance: false,
    });
    const resultState = stateOf(result);
    expect(resultState.editorState.doc.textContent).toContain('Alpha!');
    expect(resultState.acceptedDocument.textContent).not.toContain('Alpha!');
    expectSerializable(result.outcome);
  });

  it('keeps a document edit local when no interaction effect grant is present', () => {
    const initial = created();
    const result = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5),
      },
      CONFIG,
    );

    expect(result.outcome).toMatchObject({
      status: 'applied',
      publication: 'local-only',
      localDraft: true,
      pendingAcceptance: false,
    });
    expect(stateOf(result).acceptedDocument.textContent).not.toContain('Alpha!');
  });

  it('fails publication closed for rejected, malformed, or accessor-backed effect results', () => {
    const initial = created();
    const transaction = initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5);
    const rejected = applyXnlRichDocumentTiptapDraftTransaction(
      { emitInteraction: () => ({ status: 'rejected', reason: 'not available' }) },
      { state: initial, transaction },
      CONFIG,
    );
    expect(rejected.outcome).toMatchObject({
      status: 'publication-failed',
      pendingAcceptance: false,
    });

    let getterCalls = 0;
    const effectResult = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(effectResult, 'status', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'emitted';
      },
    });
    const malformed = applyXnlRichDocumentTiptapDraftTransaction(
      { emitInteraction: () => effectResult as never },
      { state: initial, transaction },
      CONFIG,
    );
    expect(malformed.outcome.status).toBe('publication-failed');
    expect(stateOf(malformed).pendingAcceptance).toBe(false);
    expect(getterCalls).toBe(0);

    let proxyGets = 0;
    const descriptorEquivalentProxy = new Proxy({ status: 'emitted' as const }, {
      get(target, key, receiver) {
        proxyGets += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const emitted = applyXnlRichDocumentTiptapDraftTransaction(
      { emitInteraction: () => descriptorEquivalentProxy },
      { state: initial, transaction },
      CONFIG,
    );
    expect(emitted.outcome).toMatchObject({ publication: 'published' });
    expect(proxyGets).toBe(0);
  });

  it('buffers intermediate IME transactions and publishes one aggregate semantic interaction at settlement', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const firstTransaction = initial.editorState.tr.insertText('\u4f60', textPosition(initial, 'Alpha'));
    const first = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: initial, transaction: firstTransaction, composition: 'intermediate' },
      CONFIG,
    );
    expect(first.outcome).toMatchObject({
      status: 'composition-buffered',
      localDraft: true,
      published: false,
    });
    const firstState = stateOf(first);

    const secondTransaction = firstState.editorState.tr.insertText(
      '\u597d',
      textPosition(firstState, '\u4f60') + 1,
    );
    const second = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: firstState, transaction: secondTransaction, composition: 'intermediate' },
      CONFIG,
    );
    expect(intents).toEqual([]);

    const settled = settleXnlRichDocumentTiptapComposition(
      emittedRuntime(intents),
      { state: stateOf(second) },
      CONFIG,
    );
    expect(settled.outcome).toMatchObject({
      status: 'composition-settled',
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
    expect(intents).toHaveLength(1);
    expect(intents[0].proposal.payload.edits).toEqual([expect.objectContaining({
      kind: 'text',
      nodeId: 'paragraph.alpha',
      before: 'Alpha',
      after: '\u4f60\u597dAlpha',
    })]);
    expectSerializable(settled.outcome);
  });

  it('settles an IME session without publication when only selection changed', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const buffered = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      {
        state: initial,
        transaction: initial.editorState.tr.setSelection(TextSelection.create(initial.editorState.doc, 2)),
        composition: 'intermediate',
      },
      CONFIG,
    );
    const settled = settleXnlRichDocumentTiptapComposition(
      emittedRuntime(intents),
      { state: stateOf(buffered) },
      CONFIG,
    );

    expect(settled.outcome).toMatchObject({
      status: 'composition-settled',
      publication: 'silent',
      reason: 'no-document-change',
      localDraft: false,
    });
    expect(intents).toEqual([]);
  });

  it('uses real ProseMirror history and publishes undo and redo document changes', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const edited = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5),
      },
      CONFIG,
    );
    const editedState = stateOf(edited);

    const undone = undoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: editedState },
      CONFIG,
    );
    expect(undone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    const undoneState = stateOf(undone);
    expect(undoneState.editorState.doc.textContent).not.toContain('Alpha!');
    expect(intents.at(-1)?.proposal.payload.edits).toEqual([expect.objectContaining({
      kind: 'text', before: 'Alpha!', after: 'Alpha',
    })]);

    const redone = redoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: undoneState },
      CONFIG,
    );
    expect(redone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    expect(stateOf(redone).editorState.doc.textContent).toContain('Alpha!');
    expect(intents.at(-1)?.proposal.payload.edits).toEqual([expect.objectContaining({
      kind: 'text', before: 'Alpha', after: 'Alpha!',
    })]);
    expect(intents).toHaveLength(3);
  });

  it('keeps empty undo and redo history silent', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const undone = undoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: initial },
      CONFIG,
    );
    const redone = redoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: stateOf(undone) },
      CONFIG,
    );

    expect(undone.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'history-empty',
    });
    expect(redone.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'history-empty',
    });
    expect(intents).toEqual([]);
  });

  it('acknowledges a matching pending draft without discarding history, so undo publishes a new interaction', () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const initial = created();
    const edited = applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5),
      },
      CONFIG,
    );
    const editedState = stateOf(edited);

    const accepted = reprojectXnlRichDocumentTiptapAccepted(
      {},
      {
        state: editedState,
        document: editedState.editorState.doc.toJSON(),
        acceptedObservation: 'accepted:2',
      },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(accepted.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'accepted-local-draft',
      localDraft: false,
      pendingAcceptance: false,
    });
    const acceptedState = stateOf(accepted);
    expect(acceptedState.acceptedObservation).toBe('accepted:2');
    expect(acceptedState.editorState).toBe(editedState.editorState);

    const undoneAfterAcceptance = undoXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { state: acceptedState },
      CONFIG,
    );
    expect(undoneAfterAcceptance.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
    const undoneState = stateOf(undoneAfterAcceptance);
    expect(undoneState.editorState.doc.textContent).not.toContain('Alpha!');
    expect(undoneState.acceptedDocument.textContent).toContain('Alpha!');
    expect(intents).toHaveLength(2);
    expect(intents.at(-1)?.proposal.payload.edits).toEqual([expect.objectContaining({
      kind: 'text', before: 'Alpha!', after: 'Alpha',
    })]);
  });

  it('applies an external accepted projection directly when there is no local draft', () => {
    const initial = created();
    const external = structuredClone(DOCUMENT);
    external.content![0].content![0].text = 'External';
    const reprojected = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: initial, document: external, acceptedObservation: 'accepted:2' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );

    expect(reprojected.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'external-accepted',
      localDraft: false,
      pendingAcceptance: false,
    });
    const reprojectedState = stateOf(reprojected);
    expect(reprojectedState.editorState.doc.textContent).toContain('External');
    expect(reprojectedState.acceptedDocument.eq(reprojectedState.editorState.doc)).toBe(true);
  });

  it('returns an explicit conflict or replacement for a stale local draft', () => {
    const initial = created();
    const edited = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5),
      },
      CONFIG,
    );
    const editedState = stateOf(edited);
    const external: JSONContent = structuredClone(DOCUMENT);
    external.content![0].content![0].text = 'External';

    const conflicted = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: editedState, document: external, acceptedObservation: 'accepted:2' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(conflicted.outcome).toMatchObject({
      status: 'conflict',
      policy: 'conflict',
      localDraftPreserved: true,
    });
    expect(stateOf(conflicted)).toBe(editedState);

    const replaced = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: editedState, document: external, acceptedObservation: 'accepted:2' },
      { ...CONFIG, staleDraftPolicy: 'replace' },
    );
    expect(replaced.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'replaced-stale-draft',
      localDraft: false,
      pendingAcceptance: false,
    });
    const replacedState = stateOf(replaced);
    expect(replacedState.editorState.doc.textContent).toContain('External');
    expect(replacedState.editorState.doc.textContent).not.toContain('Alpha!');
    const undoAfterReplace = undoXnlRichDocumentTiptapDraft(
      {},
      { state: replacedState },
      CONFIG,
    );
    expect(undoAfterReplace.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'history-empty',
    });
    expectSerializable(conflicted.outcome);
    expectSerializable(replaced.outcome);
  });

  it('preserves a safely valid selection and otherwise uses a deterministic start fallback', () => {
    const initial = created();
    const selected = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      {
        state: initial,
        transaction: initial.editorState.tr.setSelection(TextSelection.create(initial.editorState.doc, 3)),
      },
      CONFIG,
    );
    const selectedState = stateOf(selected);
    const sameShape = structuredClone(DOCUMENT);
    sameShape.content![0].content![0].text = 'Alphi';
    const preserved = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: selectedState, document: sameShape, acceptedObservation: 'accepted:2' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(preserved.outcome).toMatchObject({ selection: 'preserved' });
    const preservedState = stateOf(preserved);
    expect(preservedState.editorState.selection.from).toBe(3);

    const endSelectedTransaction = preservedState.editorState.tr.setSelection(
      TextSelection.atEnd(preservedState.editorState.doc),
    );
    const endSelected = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      { state: preservedState, transaction: endSelectedTransaction },
      CONFIG,
    );
    const shortDocument: JSONContent = {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.alpha' },
        content: [{ type: 'text', text: 'X' }],
      }],
    };
    const fallback = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: stateOf(endSelected), document: shortDocument, acceptedObservation: 'accepted:3' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(fallback.outcome).toMatchObject({ selection: 'fallback-start' });
    const fallbackState = stateOf(fallback);
    expect(fallbackState.editorState.selection.eq(TextSelection.atStart(fallbackState.editorState.doc))).toBe(true);
  });

  it('maps a text selection by stable containing node identity when preceding content changes size', () => {
    const initial = created();
    const betaPosition = textPosition(initial, 'Beta') + 2;
    const selected = applyXnlRichDocumentTiptapDraftTransaction(
      {},
      {
        state: initial,
        transaction: initial.editorState.tr.setSelection(
          TextSelection.create(initial.editorState.doc, betaPosition),
        ),
      },
      CONFIG,
    );
    const external = structuredClone(DOCUMENT);
    external.content![0].content![0].text = 'A much longer preceding paragraph';
    const reprojected = reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: stateOf(selected), document: external, acceptedObservation: 'accepted:2' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );

    expect(reprojected.outcome).toMatchObject({ selection: 'preserved' });
    const reprojectedState = stateOf(reprojected);
    expect(reprojectedState.editorState.selection.from).not.toBe(betaPosition);
    expect(reprojectedState.editorState.doc.resolve(reprojectedState.editorState.selection.from).parent.attrs.nodeId)
      .toBe('paragraph.beta');
  });

  it('fails closed for authority-bearing or malformed boundaries without invoking accessors', () => {
    const initial = created();
    const transaction = initial.editorState.tr.insertText('!', textPosition(initial, 'Alpha') + 5);
    let getterCalls = 0;
    const runtime = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(runtime, 'submit', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return () => undefined;
      },
    });
    expect(() => applyXnlRichDocumentTiptapDraftTransaction(
      runtime as never,
      { state: initial, transaction },
      CONFIG,
    )).not.toThrow();
    expect(applyXnlRichDocumentTiptapDraftTransaction(
      runtime as never,
      { state: initial, transaction },
      CONFIG,
    ).outcome.status).toBe('rejected');
    expect(getterCalls).toBe(0);

    const { proxy, revoke } = Proxy.revocable({ state: initial, transaction }, {});
    revoke();
    expect(() => applyXnlRichDocumentTiptapDraftTransaction(
      {},
      proxy as never,
      CONFIG,
    )).not.toThrow();
    expect(applyXnlRichDocumentTiptapDraftTransaction(
      {},
      proxy as never,
      CONFIG,
    ).outcome.status).toBe('rejected');

    const config = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(config, 'schemaId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID;
      },
    });
    expect(createXnlRichDocumentTiptapDraft(
      {},
      { document: DOCUMENT },
      config as never,
    ).outcome.status).toBe('rejected');
    expect(getterCalls).toBe(0);

    const effectResult = Proxy.revocable({ status: 'emitted' as const }, {});
    effectResult.revoke();
    expect(() => applyXnlRichDocumentTiptapDraftTransaction(
      { emitInteraction: () => effectResult.proxy },
      { state: initial, transaction },
      CONFIG,
    )).not.toThrow();
    expect(applyXnlRichDocumentTiptapDraftTransaction(
      { emitInteraction: () => effectResult.proxy },
      { state: initial, transaction },
      CONFIG,
    ).outcome.status).toBe('publication-failed');
  });
});
