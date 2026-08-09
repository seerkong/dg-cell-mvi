import type { JSONContent } from '@tiptap/core';
import { history, redo, undo } from '@tiptap/pm/history';
import {
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
  Schema,
  type ResolvedPos,
} from '@tiptap/pm/model';
import { EditorState, Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { parseTiptapDocument, parseXnlRichDocumentTiptapSemantics } from './projection';
import {
  createXnlRichDocumentTiptapSchema,
  isXnlRichDocumentTiptapCanonicalSchema,
} from './registry';
import { normalizeTiptapTransaction } from './transactionNormalizer';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapAcceptedProjectionInput,
  type XnlRichDocumentTiptapDraftAdoptInput,
  type XnlRichDocumentTiptapDiagnostic,
  type XnlRichDocumentTiptapDraftConfig,
  type XnlRichDocumentTiptapDraftCreateInput,
  type XnlRichDocumentTiptapDraftEditorStateBindingInput,
  type XnlRichDocumentTiptapDraftOutcome,
  type XnlRichDocumentTiptapDraftResult,
  type XnlRichDocumentTiptapDraftRuntime,
  type XnlRichDocumentTiptapDraftState,
  type XnlRichDocumentTiptapDraftStateInput,
  type XnlRichDocumentTiptapDraftTransactionInput,
  type XnlRichDocumentTiptapInteractionIntent,
  type XnlRichDocumentTiptapReprojectConfig,
} from './types';

type InternalDraftState = XnlRichDocumentTiptapDraftState & Readonly<{
  compositionBaseline?: ProseMirrorNode;
}>;

const TRUSTED_STATES = new WeakSet<object>();
const DRAFT_CONFIG_KEYS = new Set(['schemaId', 'extensionIds', 'planNodeId']);
const REPROJECT_CONFIG_KEYS = new Set([
  'schemaId', 'extensionIds', 'planNodeId', 'staleDraftPolicy',
]);
const EDITOR_STATE_FIELDS = ['doc', 'selection', 'storedMarks', 'scrollToSelection'] as const;

export function createXnlRichDocumentTiptapDraft(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftCreateInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['document', 'acceptedObservation']), 'Draft create input'),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    const observation = ownData(input, 'acceptedObservation');
    if (observation !== undefined && (typeof observation !== 'string' || observation.length === 0)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Accepted observation must be a non-empty opaque string.'));
    }
    if (diagnostics.length > 0) return rejected(undefined, diagnostics);
    const document = createDocument(ownData(input, 'document'), config, diagnostics);
    if (document === undefined) return rejected(undefined, diagnostics);
    const editorState = EditorState.create({ schema: document.type.schema, doc: document, plugins: [history()] });
    const state = makeState({
      editorState,
      acceptedDocument: document,
      ...(typeof observation === 'string' ? { acceptedObservation: observation } : {}),
      pendingAcceptance: false,
      compositionActive: false,
    });
    return result(state, {
      status: 'ready',
      localDraft: false,
      pendingAcceptance: false,
      selection: 'fallback-start',
    });
  } catch {
    return rejected(undefined, [diagnostic('INVALID_TIPTAP_DRAFT', 'Draft creation boundary could not be inspected safely.')]);
  }
}

export function bindXnlRichDocumentTiptapDraftToEditorState(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftEditorStateBindingInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['editorState', 'acceptedObservation']), 'EditorState binding input'),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    const observation = ownData(input, 'acceptedObservation');
    if (observation !== undefined && (typeof observation !== 'string' || observation.length === 0)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Accepted observation must be a non-empty opaque string.'));
    }
    if (diagnostics.length > 0) return rejected(undefined, diagnostics);
    const editorState = inspectCanonicalEditorState(ownData(input, 'editorState'), diagnostics);
    if (diagnostics.length > 0 || editorState === undefined) return rejected(undefined, diagnostics);

    const state = makeState({
      editorState,
      acceptedDocument: editorState.doc,
      ...(typeof observation === 'string' ? { acceptedObservation: observation } : {}),
      pendingAcceptance: false,
      compositionActive: false,
    });
    return result(state, {
      status: 'ready',
      localDraft: false,
      pendingAcceptance: false,
      selection: 'preserved',
    });
  } catch {
    return rejected(undefined, [diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState binding boundary could not be inspected safely.')]);
  }
}

export function applyXnlRichDocumentTiptapDraftTransaction(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftTransactionInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  let state: InternalDraftState | undefined;
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['state', 'transaction', 'composition']), 'Draft transaction input'),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    state = trustedState(ownData(input, 'state'));
    if (state === undefined) diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft state is not owned by this adapter lifecycle.'));
    const composition = ownData(input, 'composition');
    if (composition !== undefined && composition !== 'intermediate') {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft transaction composition must be intermediate when present.'));
    }
    if (diagnostics.length > 0 || state === undefined) return rejected(state, diagnostics);
    if (state.compositionActive && composition !== 'intermediate') {
      return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'An active composition must be settled explicitly before another transaction is published.')]);
    }

    const transaction = ownData(input, 'transaction') as Transaction;
    const normalized = normalizeTiptapTransaction(
      {},
      composition === 'intermediate' ? { transaction, composition } : { transaction },
      config,
    );
    if (normalized.status === 'rejected') return rejected(state, [...normalized.diagnostics]);
    if (composition === 'intermediate') {
      const editorState = applyTransaction(state.editorState, transaction);
      if (editorState === undefined) {
        return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Intermediate composition transaction does not apply to the current local state.')]);
      }
      const next = makeState({
        editorState,
        acceptedDocument: state.acceptedDocument,
        ...(state.acceptedObservation !== undefined ? { acceptedObservation: state.acceptedObservation } : {}),
        pendingAcceptance: state.pendingAcceptance,
        compositionActive: true,
        compositionBaseline: state.compositionBaseline ?? transaction.before,
      });
      return result(next, {
        status: 'composition-buffered',
        published: false,
        localDraft: hasLocalDraft(next),
        pendingAcceptance: next.pendingAcceptance,
      });
    }

    const editorState = applyTransaction(state.editorState, transaction);
    if (editorState === undefined) {
      return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Transaction does not apply to the current local state.')]);
    }
    const next = makeState({
      editorState,
      acceptedDocument: state.acceptedDocument,
      ...(state.acceptedObservation !== undefined ? { acceptedObservation: state.acceptedObservation } : {}),
      pendingAcceptance: state.pendingAcceptance,
      compositionActive: false,
    });
    if (normalized.status === 'silent') {
      return result(next, {
        status: 'applied',
        publication: 'silent',
        reason: normalized.reason,
        localDraft: hasLocalDraft(next),
        pendingAcceptance: next.pendingAcceptance,
      });
    }
    return publishApplied(runtime, next, normalized.intent, 'applied');
  } catch {
    return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Draft transaction boundary could not be inspected safely.')]);
  }
}

/**
 * Adopts the exact EditorState already computed by the canonical Tiptap Editor.
 * This is the browser bridge: it preserves one EditorState lineage while the
 * draft lifecycle still owns normalization, publication and acceptance state.
 */
export function adoptXnlRichDocumentTiptapEditorState(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftAdoptInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  let state: InternalDraftState | undefined;
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(
        input,
        new Set(['state', 'transaction', 'editorState', 'composition']),
        'Draft adopt input',
      ),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    state = trustedState(ownData(input, 'state'));
    if (state === undefined) {
      diagnostics.push(diagnostic(
        'INVALID_TIPTAP_DRAFT',
        'Draft state is not owned by this adapter lifecycle.',
      ));
    }
    const editorState = inspectCanonicalEditorState(
      ownData(input, 'editorState'),
      diagnostics,
      { allowProvisionalIdentity: true },
    );
    const transaction = ownData(input, 'transaction') as Transaction;
    const composition = ownData(input, 'composition');
    if (composition !== undefined && composition !== 'intermediate') {
      diagnostics.push(diagnostic(
        'INVALID_TIPTAP_DRAFT',
        'Draft adopt composition must be intermediate when present.',
      ));
    }
    if (state !== undefined && transaction?.before?.eq(state.editorState.doc) !== true) {
      diagnostics.push(diagnostic(
        'INVALID_TIPTAP_DRAFT',
        'Adopted transaction must begin at the current EditorState.',
      ));
    }
    if (state !== undefined && editorState !== undefined
      && editorState.schema !== state.editorState.schema) {
      diagnostics.push(diagnostic(
        'INVALID_TIPTAP_DRAFT',
        'Adopted EditorState must retain the current canonical schema instance.',
      ));
    }
    if (diagnostics.length > 0 || state === undefined || editorState === undefined) {
      return rejected(state, diagnostics);
    }
    if (state.compositionActive && composition !== 'intermediate') {
      return rejected(state, [diagnostic(
        'INVALID_TIPTAP_DRAFT',
        'An active composition must be settled explicitly before another transaction is published.',
      )]);
    }

    const normalized = normalizeTiptapTransaction(
      {},
      composition === 'intermediate' ? { transaction, composition } : { transaction },
      config,
    );
    if (normalized.status === 'rejected') return rejected(state, [...normalized.diagnostics]);

    const next = makeState({
      editorState,
      acceptedDocument: state.acceptedDocument,
      ...(state.acceptedObservation !== undefined
        ? { acceptedObservation: state.acceptedObservation }
        : {}),
      pendingAcceptance: state.pendingAcceptance,
      compositionActive: composition === 'intermediate',
      ...(composition === 'intermediate'
        ? { compositionBaseline: state.compositionBaseline ?? transaction.before }
        : {}),
    });
    if (composition === 'intermediate') {
      return result(next, {
        status: 'composition-buffered',
        published: false,
        localDraft: hasLocalDraft(next),
        pendingAcceptance: next.pendingAcceptance,
      });
    }
    if (normalized.status === 'silent') {
      return result(next, {
        status: 'applied',
        publication: 'silent',
        reason: normalized.reason,
        localDraft: hasLocalDraft(next),
        pendingAcceptance: next.pendingAcceptance,
      });
    }
    return publishApplied(runtime, next, normalized.intent, 'applied');
  } catch {
    return rejected(state, [diagnostic(
      'INVALID_TIPTAP_DRAFT',
      'EditorState adoption boundary could not be inspected safely.',
    )]);
  }
}

export function settleXnlRichDocumentTiptapComposition(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftStateInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  let state: InternalDraftState | undefined;
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['state']), 'Composition settlement input'),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    state = trustedState(ownData(input, 'state'));
    if (state === undefined) diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft state is not owned by this adapter lifecycle.'));
    if (diagnostics.length > 0 || state === undefined) return rejected(state, diagnostics);
    if (!state.compositionActive || state.compositionBaseline === undefined) {
      return result(state, {
        status: 'composition-settled',
        publication: 'silent',
        reason: 'no-document-change',
        localDraft: hasLocalDraft(state),
        pendingAcceptance: state.pendingAcceptance,
      });
    }
    const settled = makeState({
      editorState: state.editorState,
      acceptedDocument: state.acceptedDocument,
      ...(state.acceptedObservation !== undefined ? { acceptedObservation: state.acceptedObservation } : {}),
      pendingAcceptance: state.pendingAcceptance,
      compositionActive: false,
    });
    if (state.compositionBaseline.eq(state.editorState.doc)) {
      return result(settled, {
        status: 'composition-settled',
        publication: 'silent',
        reason: 'no-document-change',
        localDraft: hasLocalDraft(settled),
        pendingAcceptance: settled.pendingAcceptance,
      });
    }
    const aggregate = EditorState.create({
      schema: state.compositionBaseline.type.schema,
      doc: state.compositionBaseline,
    }).tr.replaceWith(
      0,
      state.compositionBaseline.content.size,
      state.editorState.doc.content,
    );
    const normalized = normalizeTiptapTransaction({}, { transaction: aggregate }, config);
    if (normalized.status !== 'normalized') {
      return normalized.status === 'rejected'
        ? rejected(settled, [...normalized.diagnostics])
        : rejected(settled, [diagnostic('INVALID_TIPTAP_DRAFT', 'Composition settlement did not produce a semantic document interaction.')]);
    }
    return publishApplied(runtime, settled, normalized.intent, 'composition-settled');
  } catch {
    return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Composition settlement boundary could not be inspected safely.')]);
  }
}

export function undoXnlRichDocumentTiptapDraft(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftStateInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  return applyHistory(runtime, input, config, undo);
}

export function redoXnlRichDocumentTiptapDraft(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftStateInput,
  config: XnlRichDocumentTiptapDraftConfig,
): XnlRichDocumentTiptapDraftResult {
  return applyHistory(runtime, input, config, redo);
}

export function reprojectXnlRichDocumentTiptapAccepted(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapAcceptedProjectionInput,
  config: XnlRichDocumentTiptapReprojectConfig,
): XnlRichDocumentTiptapDraftResult {
  let state: InternalDraftState | undefined;
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['state', 'document', 'acceptedObservation']), 'Accepted projection input'),
      ...validateDraftConfig(config, REPROJECT_CONFIG_KEYS),
    ];
    state = trustedState(ownData(input, 'state'));
    if (state === undefined) diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft state is not owned by this adapter lifecycle.'));
    const observation = ownData(input, 'acceptedObservation');
    if (observation !== undefined && (typeof observation !== 'string' || observation.length === 0)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Accepted observation must be a non-empty opaque string.'));
    }
    const policy = ownData(config, 'staleDraftPolicy');
    if (policy !== 'conflict' && policy !== 'replace') {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Reproject policy must be conflict or replace.'));
    }
    if (diagnostics.length > 0 || state === undefined) return rejected(state, diagnostics);
    const document = createDocument(
      ownData(input, 'document'),
      config,
      diagnostics,
      state.editorState.schema,
    );
    if (document === undefined) return rejected(state, diagnostics);

    const exactDraftMatch = document.eq(state.editorState.doc);
    const allocatedIdentityMatch = !exactDraftMatch
      && matchesProvisionalIdentityCandidate(document, state.editorState.doc);
    const matchesDraft = exactDraftMatch || allocatedIdentityMatch;
    const staleDraft = hasLocalDraft(state);
    if (matchesDraft) {
      const acceptedEditorState = allocatedIdentityMatch
        ? EditorState.create({
            schema: document.type.schema,
            doc: document,
            selection: restoreSelection(
              state.editorState.selection,
              state.editorState.doc,
              document,
            ).selection,
            plugins: state.editorState.plugins,
          })
        : state.editorState;
      const acknowledged = makeState({
        editorState: acceptedEditorState,
        acceptedDocument: document,
        ...(typeof observation === 'string' ? { acceptedObservation: observation } : {}),
        pendingAcceptance: false,
        compositionActive: false,
      });
      return result(acknowledged, {
        status: 'reprojected',
        reason: staleDraft ? 'accepted-local-draft' : 'external-accepted',
        selection: 'preserved',
        localDraft: false,
        pendingAcceptance: false,
      });
    }
    if (staleDraft && !matchesDraft && policy === 'conflict') {
      return result(state, {
        status: 'conflict',
        policy: 'conflict',
        localDraftPreserved: true,
        diagnostics: [diagnostic('TIPTAP_DRAFT_CONFLICT', 'External accepted projection conflicts with the local draft.')],
      });
    }
    const selection = restoreSelection(
      state.editorState.selection,
      state.editorState.doc,
      document,
    );
    const editorState = EditorState.create({
      schema: document.type.schema,
      doc: document,
      selection: selection.selection,
      plugins: state.editorState.plugins,
    });
    const next = makeState({
      editorState,
      acceptedDocument: document,
      ...(typeof observation === 'string' ? { acceptedObservation: observation } : {}),
      pendingAcceptance: false,
      compositionActive: false,
    });
    return result(next, {
      status: 'reprojected',
      reason: staleDraft ? 'replaced-stale-draft' : 'external-accepted',
      selection: selection.outcome,
      localDraft: false,
      pendingAcceptance: false,
    });
  } catch {
    return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Accepted reproject boundary could not be inspected safely.')]);
  }
}

function matchesProvisionalIdentityCandidate(
  accepted: ProseMirrorNode,
  candidate: ProseMirrorNode,
): boolean {
  const identityCounts = collectCandidateIdentityCounts(candidate);
  return matchesCandidateNode(accepted, candidate, identityCounts);
}

function matchesCandidateNode(
  accepted: ProseMirrorNode,
  candidate: ProseMirrorNode,
  identityCounts: ReadonlyMap<string, number>,
): boolean {
  if (accepted.type !== candidate.type
    || accepted.text !== candidate.text
    || !ProseMirrorMark.sameSet(accepted.marks, candidate.marks)
    || accepted.childCount !== candidate.childCount
    || !matchesCandidateAttributes(accepted.attrs, candidate.attrs, identityCounts)) {
    return false;
  }
  for (let index = 0; index < accepted.childCount; index += 1) {
    if (!matchesCandidateNode(accepted.child(index), candidate.child(index), identityCounts)) {
      return false;
    }
  }
  return true;
}

function collectCandidateIdentityCounts(document: ProseMirrorNode): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  document.descendants((node) => {
    const nodeId = node.attrs.nodeId;
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
    }
  });
  return counts;
}

function matchesCandidateAttributes(
  accepted: Readonly<Record<string, unknown>>,
  candidate: Readonly<Record<string, unknown>>,
  identityCounts: ReadonlyMap<string, number>,
): boolean {
  const keys = Object.keys(accepted);
  if (keys.length !== Object.keys(candidate).length) return false;
  return keys.every((key) => {
    const acceptedValue = accepted[key];
    const candidateValue = candidate[key];
    if (key === 'nodeId' && (candidateValue === null || candidateValue === undefined)) {
      return typeof acceptedValue === 'string' && acceptedValue.length > 0;
    }
    if (key === 'nodeId'
      && typeof candidateValue === 'string'
      && identityCounts.get(candidateValue)! > 1) {
      return typeof acceptedValue === 'string' && acceptedValue.length > 0;
    }
    return equalDraftValue(acceptedValue, candidateValue);
  });
}

function equalDraftValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((entry, index) => equalDraftValue(entry, right[index]));
  }
  if (isDataRecord(left) && isDataRecord(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
      && keys.every((key) => equalDraftValue(left[key], right[key]));
  }
  return false;
}

function applyHistory(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftStateInput,
  config: XnlRichDocumentTiptapDraftConfig,
  command: typeof undo,
): XnlRichDocumentTiptapDraftResult {
  let state: InternalDraftState | undefined;
  try {
    const diagnostics = [
      ...validateRuntime(runtime),
      ...validateExactRecord(input, new Set(['state']), 'History input'),
      ...validateDraftConfig(config, DRAFT_CONFIG_KEYS),
    ];
    state = trustedState(ownData(input, 'state'));
    if (state === undefined) diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft state is not owned by this adapter lifecycle.'));
    if (diagnostics.length > 0 || state === undefined) return rejected(state, diagnostics);
    if (state.compositionActive) {
      return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'Composition must settle before undo or redo.')]);
    }
    let transaction: Transaction | undefined;
    const available = command(state.editorState, (next) => { transaction = next; });
    if (!available || transaction === undefined) {
      return result(state, {
        status: 'applied',
        publication: 'silent',
        reason: 'history-empty',
        localDraft: hasLocalDraft(state),
        pendingAcceptance: state.pendingAcceptance,
      });
    }
    return applyXnlRichDocumentTiptapDraftTransaction(runtime, { state, transaction }, config);
  } catch {
    return rejected(state, [diagnostic('INVALID_TIPTAP_DRAFT', 'History boundary could not be inspected safely.')]);
  }
}

function publishApplied(
  runtime: XnlRichDocumentTiptapDraftRuntime,
  state: InternalDraftState,
  intent: XnlRichDocumentTiptapInteractionIntent,
  status: 'applied' | 'composition-settled',
): XnlRichDocumentTiptapDraftResult {
  const emit = ownData(runtime, 'emitInteraction');
  if (emit === undefined) {
    return result(state, {
      status,
      publication: 'local-only',
      localDraft: hasLocalDraft(state),
      pendingAcceptance: state.pendingAcceptance,
    });
  }
  if (typeof emit !== 'function') {
    return publicationFailed(state, 'Interaction effect grant is not callable.');
  }
  try {
    const emitInteraction = emit as NonNullable<XnlRichDocumentTiptapDraftRuntime['emitInteraction']>;
    const emission = inspectEmissionResult(emitInteraction(
      runtime,
      Object.freeze({ intent }),
      Object.freeze({}),
    ));
    if (emission.status === 'invalid') {
      return publicationFailed(state, 'Interaction effect returned a malformed result.');
    }
    if (emission.status === 'rejected') return publicationFailed(state, emission.reason);
    const pending = makeState({
      editorState: state.editorState,
      acceptedDocument: state.acceptedDocument,
      ...(state.acceptedObservation !== undefined ? { acceptedObservation: state.acceptedObservation } : {}),
      pendingAcceptance: true,
      compositionActive: false,
    });
    return result(pending, {
      status,
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
  } catch {
    return publicationFailed(state, 'Interaction effect failed while publishing the local draft.');
  }
}

function publicationFailed(state: InternalDraftState, message: string): XnlRichDocumentTiptapDraftResult {
  return result(state, {
    status: 'publication-failed',
    localDraft: hasLocalDraft(state),
    pendingAcceptance: state.pendingAcceptance,
    diagnostics: [diagnostic('TIPTAP_PUBLICATION_FAILED', message)],
  });
}

function createDocument(
  value: unknown,
  config: XnlRichDocumentTiptapDraftConfig | XnlRichDocumentTiptapReprojectConfig,
  diagnostics: XnlRichDocumentTiptapDiagnostic[],
  existingSchema?: Schema,
): ProseMirrorNode | undefined {
  const parsed = parseTiptapDocument(
    {},
    { document: value as JSONContent },
    {
      schemaId: ownData(config, 'schemaId') as string,
      extensionIds: ownData(config, 'extensionIds') as readonly string[],
    },
  );
  if (parsed.status === 'rejected') {
    for (const entry of parsed.diagnostics) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_TIPTAP_DOCUMENT',
        message: entry.message,
        ...(entry.path !== undefined ? { path: entry.path } : {}),
      });
    }
    return undefined;
  }
  let schema = existingSchema;
  if (schema === undefined) {
    const schemaResult = createXnlRichDocumentTiptapSchema();
    if (schemaResult.status === 'rejected') {
      diagnostics.push(...schemaResult.diagnostics);
      return undefined;
    }
    schema = schemaResult.schema;
  }
  try {
    const document = schema.nodeFromJSON(value);
    document.check();
    return document;
  } catch {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DOCUMENT', 'Accepted projection is not valid for the canonical Tiptap schema.'));
    return undefined;
  }
}

function restoreSelection(
  previous: Selection,
  previousDocument: ProseMirrorNode,
  document: ProseMirrorNode,
): Readonly<{ selection: Selection; outcome: 'preserved' | 'fallback-start' }> {
  try {
    if (previous instanceof TextSelection) {
      const anchor = mapSelectionPoint(previous.$anchor, previousDocument, document);
      const head = mapSelectionPoint(previous.$head, previousDocument, document);
      if (anchor !== undefined && head !== undefined) {
        return {
          selection: TextSelection.create(document, anchor, head),
          outcome: 'preserved',
        };
      }
    }
  } catch {
    // The deterministic fallback below is the explicit invalid-selection policy.
  }
  return { selection: Selection.atStart(document), outcome: 'fallback-start' };
}

function mapSelectionPoint(
  point: ResolvedPos,
  previousDocument: ProseMirrorNode,
  document: ProseMirrorNode,
): number | undefined {
  if (point.doc !== previousDocument) return undefined;
  for (let depth = point.depth; depth >= 0; depth -= 1) {
    const previousNode = point.node(depth);
    const nodeId = trustedNodeId(previousNode);
    if (nodeId === undefined) continue;
    const relativeOffset = point.pos - point.start(depth);
    const target = findStableNode(document, nodeId, previousNode.type.name);
    if (target !== undefined && relativeOffset >= 0 && relativeOffset <= target.node.content.size) {
      return target.contentStart + relativeOffset;
    }
  }
  return undefined;
}

function findStableNode(
  document: ProseMirrorNode,
  nodeId: string,
  typeName: string,
): Readonly<{ node: ProseMirrorNode; contentStart: number }> | undefined {
  if (trustedNodeId(document) === nodeId && document.type.name === typeName) {
    return { node: document, contentStart: 0 };
  }
  let found: Readonly<{ node: ProseMirrorNode; contentStart: number }> | undefined;
  document.descendants((node, position) => {
    if (found === undefined && trustedNodeId(node) === nodeId && node.type.name === typeName) {
      found = { node, contentStart: position + 1 };
      return false;
    }
    return found === undefined;
  });
  return found;
}

function trustedNodeId(node: ProseMirrorNode): string | undefined {
  const attrs = node.attrs as Readonly<Record<string, unknown>>;
  const value = attrs.nodeId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function inspectCanonicalEditorState(
  value: unknown,
  diagnostics: XnlRichDocumentTiptapDiagnostic[],
  options: Readonly<{ allowProvisionalIdentity?: boolean }> = {},
): EditorState | undefined {
  if (!(value instanceof EditorState) || Object.getPrototypeOf(value) !== EditorState.prototype) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Binding input must contain a concrete ProseMirror EditorState.'));
    return undefined;
  }
  const configuration = ownData(value, 'config');
  if (!hasExactDataKeys(configuration, ['schema', 'plugins', 'pluginsByKey', 'fields'])) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState configuration contains unsupported or accessor-backed state.'));
    return undefined;
  }
  const fields = ownData(configuration, 'fields');
  const plugins = ownData(configuration, 'plugins');
  const pluginsByKey = ownData(configuration, 'pluginsByKey');
  if (!isStandardDenseArray(fields)
    || !isStandardDenseArray(plugins)
    || !isDataRecord(pluginsByKey)) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState plugin configuration is malformed.'));
    return undefined;
  }
  const pluginKeys: string[] = [];
  for (const plugin of plugins) {
    const key = ownData(plugin, 'key');
    if (typeof key !== 'string' || key.length === 0 || pluginKeys.includes(key)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState contains a malformed plugin configuration.'));
      return undefined;
    }
    pluginKeys.push(key);
  }
  if (!hasExactDataKeys(pluginsByKey, pluginKeys)
    || pluginKeys.some((key, index) => ownData(pluginsByKey, key) !== plugins[index])) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState plugin registry is not internally consistent.'));
    return undefined;
  }
  const fieldNames: string[] = [];
  for (const field of fields) {
    if (!hasExactDataKeys(field, ['name', 'init', 'apply'])) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState field configuration contains unsupported state.'));
      return undefined;
    }
    const name = ownData(field, 'name');
    if (typeof name !== 'string'
      || typeof ownData(field, 'init') !== 'function'
      || typeof ownData(field, 'apply') !== 'function'
      || fieldNames.includes(name)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState field configuration is malformed.'));
      return undefined;
    }
    fieldNames.push(name);
  }
  if (!EDITOR_STATE_FIELDS.every((name, index) => fieldNames[index] === name)
    || fieldNames.slice(EDITOR_STATE_FIELDS.length).some((name) => !pluginKeys.includes(name))
    || !hasExactDataKeys(value, ['config', ...fieldNames])) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState contains unsupported or accessor-backed instance state.'));
    return undefined;
  }

  const schema = ownData(configuration, 'schema');
  const document = ownData(value, 'doc');
  const selection = ownData(value, 'selection');
  const storedMarks = ownData(value, 'storedMarks');
  const scrollToSelection = ownData(value, 'scrollToSelection');
  if (!isXnlRichDocumentTiptapCanonicalSchema(schema)
    || !isCanonicalDocument(document, schema)
    || !(selection instanceof Selection)
    || selection.$from.doc !== document
    || selection.$to.doc !== document
    || storedMarks !== null && (!isStandardDenseArray(storedMarks) || !storedMarks.every(isConcreteMark))
    || !Number.isSafeInteger(scrollToSelection)
    || (scrollToSelection as number) < 0) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState does not use the canonical schema and document semantics.'));
    return undefined;
  }

  if (options.allowProvisionalIdentity !== true) {
    const parsed = parseXnlRichDocumentTiptapSemantics(
      { document: ProseMirrorNode.prototype.toJSON.call(document) as JSONContent },
    );
    if (parsed.status !== 'parsed') {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'EditorState document does not satisfy canonical RichDocument semantics.'));
      return undefined;
    }
  }
  return value;
}

function isCanonicalDocument(value: unknown, schema: Schema): value is ProseMirrorNode {
  if (!(value instanceof ProseMirrorNode)
    || Object.getPrototypeOf(value) !== ProseMirrorNode.prototype
    || ownData(ownData(value, 'type'), 'schema') !== schema
    || ownData(ownData(value, 'type'), 'name') !== 'doc') {
    return false;
  }
  let valid = isConcreteNode(value, schema);
  if (!valid) return false;
  ProseMirrorNode.prototype.descendants.call(value, (node: ProseMirrorNode) => {
    if (!isConcreteNode(node, schema)) valid = false;
    return valid;
  });
  if (!valid) return false;
  ProseMirrorNode.prototype.check.call(value);
  return true;
}

function isConcreteNode(value: unknown, schema: Schema): value is ProseMirrorNode {
  if (!(value instanceof ProseMirrorNode)) return false;
  const type = ownData(value, 'type');
  const typeName = ownData(type, 'name');
  const attrs = ownData(value, 'attrs');
  const marks = ownData(value, 'marks');
  return typeof typeName === 'string'
    && ownData(type, 'schema') === schema
    && ownData(ownData(schema, 'nodes'), typeName) === type
    && hasExactDataKeys(value, typeName === 'text'
      ? ['type', 'attrs', 'marks', 'content', 'text']
      : ['type', 'attrs', 'marks', 'content'])
    && isDataRecord(attrs)
    && isStandardDenseArray(marks)
    && marks.every(isConcreteMark);
}

function isConcreteMark(value: unknown): value is ProseMirrorMark {
  return value instanceof ProseMirrorMark
    && Object.getPrototypeOf(value) === ProseMirrorMark.prototype
    && hasExactDataKeys(value, ['type', 'attrs'])
    && isDataRecord(ownData(value, 'attrs'));
}

function hasOnlyDataProperties(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string'
      && descriptor !== undefined
      && descriptor.enumerable
      && 'value' in descriptor;
  });
}

function hasExactDataKeys(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || !hasOnlyDataProperties(value)) return false;
  const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  return keys.length === expectedKeys.length
    && expectedKeys.every((expected, index) => keys[index] === expected);
}

function isDataRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isPlainRecord(value) && hasOnlyDataProperties(value);
}

function isStandardDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor
    ? lengthDescriptor.value
    : undefined;
  if (!Number.isSafeInteger(length)
    || (length as number) < 0
    || Reflect.ownKeys(descriptors).length !== (length as number) + 1) {
    return false;
  }
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return false;
  }
  return true;
}

function applyTransaction(editorState: EditorState, transaction: Transaction): EditorState | undefined {
  try {
    if (!transaction.before.eq(editorState.doc)) return undefined;
    return editorState.apply(transaction);
  } catch {
    return undefined;
  }
}

function makeState(input: InternalDraftState): InternalDraftState {
  const state = Object.freeze({ ...input });
  TRUSTED_STATES.add(state);
  return state;
}

function trustedState(value: unknown): InternalDraftState | undefined {
  return typeof value === 'object' && value !== null && TRUSTED_STATES.has(value)
    ? value as InternalDraftState
    : undefined;
}

function hasLocalDraft(state: InternalDraftState): boolean {
  return state.compositionActive
    || state.pendingAcceptance
    || !state.editorState.doc.eq(state.acceptedDocument);
}

function validateRuntime(value: unknown): XnlRichDocumentTiptapDiagnostic[] {
  const diagnostics = validateExactRecord(value, new Set(['emitInteraction']), 'Draft runtime');
  if (diagnostics.length > 0) return diagnostics;
  const emit = ownData(value, 'emitInteraction');
  if (emit !== undefined && typeof emit !== 'function') {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'emitInteraction must be a function grant.'));
  }
  return diagnostics;
}

function validateDraftConfig(value: unknown, keys: ReadonlySet<string>): XnlRichDocumentTiptapDiagnostic[] {
  const diagnostics = validateExactRecord(value, keys, 'Draft config');
  if (diagnostics.length > 0) return diagnostics;
  if (ownData(value, 'schemaId') !== XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID
    || !isCanonicalExtensions(ownData(value, 'extensionIds'))) {
    diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_SCHEMA', 'Draft config must use the canonical Tiptap schema and extension registry.'));
  }
  const planNodeId = ownData(value, 'planNodeId');
  if (typeof planNodeId !== 'string' || planNodeId.length === 0) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', 'Draft config requires a non-empty planNodeId.'));
  }
  return diagnostics;
}

function validateExactRecord(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): XnlRichDocumentTiptapDiagnostic[] {
  const diagnostics: XnlRichDocumentTiptapDiagnostic[] = [];
  if (!isPlainRecord(value)) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', `${label} must be a plain record.`));
    return diagnostics;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors];
    if (typeof key !== 'string'
      || !allowed.has(key)
      || descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_DRAFT', `${label} contains an unsupported or accessor-backed field.`));
    }
  }
  return diagnostics;
}

function isCanonicalExtensions(value: unknown): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (Reflect.ownKeys(descriptors).length !== XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.length + 1
    || lengthDescriptor === undefined
    || !('value' in lengthDescriptor)
    || lengthDescriptor.value !== XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.length) {
    return false;
  }
  return XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.every((expected, index) => {
    const descriptor = descriptors[String(index)];
    return descriptor !== undefined && 'value' in descriptor && descriptor.value === expected;
  });
}

function inspectEmissionResult(value: unknown):
  | Readonly<{ status: 'emitted' }>
  | Readonly<{ status: 'rejected'; reason: string }>
  | Readonly<{ status: 'invalid' }> {
  if (!isPlainRecord(value)) return { status: 'invalid' };
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const status = dataValue(descriptors, 'status');
  if (status === 'emitted' && Reflect.ownKeys(descriptors).length === 1) {
    return { status: 'emitted' };
  }
  const reason = dataValue(descriptors, 'reason');
  if (status === 'rejected' && typeof reason === 'string' && Reflect.ownKeys(descriptors).length === 2) {
    return { status: 'rejected', reason };
  }
  return { status: 'invalid' };
}

function ownData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' && typeof value !== 'function' || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function dataValue(descriptors: PropertyDescriptorMap, key: string): unknown {
  const descriptor = descriptors[key];
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function diagnostic(
  code: XnlRichDocumentTiptapDiagnostic['code'],
  message: string,
): XnlRichDocumentTiptapDiagnostic {
  return Object.freeze({ severity: 'error', code, message });
}

function result(
  state: InternalDraftState,
  outcome: Exclude<XnlRichDocumentTiptapDraftOutcome, { status: 'rejected' }>,
): XnlRichDocumentTiptapDraftResult {
  return Object.freeze({ state, outcome: deepFreeze(outcome) });
}

function rejected(
  state: InternalDraftState | undefined,
  diagnostics: readonly XnlRichDocumentTiptapDiagnostic[],
): XnlRichDocumentTiptapDraftResult {
  const entries: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]] = diagnostics.length > 0
    ? [diagnostics[0]!, ...diagnostics.slice(1)]
    : [diagnostic('INVALID_TIPTAP_DRAFT', 'Draft lifecycle rejected malformed input.')];
  return Object.freeze({
    ...(state !== undefined ? { state } : {}),
    outcome: deepFreeze({ status: 'rejected' as const, diagnostics: entries }),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  return value;
}
