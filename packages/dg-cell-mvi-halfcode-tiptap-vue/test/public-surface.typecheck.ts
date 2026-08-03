import type { JSONContent, NodeViewRenderer } from '@tiptap/core';
import type {
  DocumentInstanceRef,
  XnlAuthoringProposalPort,
  XnlProjectionPresenterEditIntent,
  XnlProjectionPresenterRuntimeFacet,
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
  applyXnlRichDocumentTiptapDraftTransaction,
  bindXnlRichDocumentTiptapDraftToEditorState,
  createXnlRichDocumentTiptapDraft,
  createXnlRichDocumentTiptapExtensions,
  createXnlRichDocumentEmbeddedPresenterCapability,
  createXnlRichDocumentHalfcodeNodeViewHost,
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
  normalizeTiptapTransaction,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapConfig,
  type XnlRichDocumentTiptapDraftConfig,
  type XnlRichDocumentTiptapDraftEditorStateBindingInput,
  type XnlRichDocumentTiptapDraftEditorStateBindingProcessor,
  type XnlRichDocumentTiptapDraftOutcome,
  type XnlRichDocumentTiptapDraftResult,
  type XnlRichDocumentTiptapDraftRuntime,
  type XnlRichDocumentTiptapParseResult,
  type XnlRichDocumentTiptapProjectionResult,
  type XnlRichDocumentTiptapTransactionResult,
  type XnlRichDocumentTiptapStableNodeRef,
  type XnlRichDocumentEmbeddedPresenterHostRuntime,
  type XnlRichDocumentEmbeddedPresenterInput,
  type XnlRichDocumentHalfcodeNodeViewHostInput,
  type XnlRichDocumentHalfcodeNodeViewHostRuntime,
  type XnlRichDocumentHalfcodeNodeViewOccurrence,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

const config: XnlRichDocumentTiptapConfig = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
};
declare const richDocument: XnlRichDocument;
declare const tiptapDocument: JSONContent;
declare const editorState: EditorState;
declare const transaction: Transaction;
declare const domainNodeId: XnlRichDocumentDomainNodeId;
declare const rawNodeViewRenderer: NodeViewRenderer;

createXnlRichDocumentTiptapExtensions();
// @ts-expect-error The canonical package-root factory cannot accept raw NodeView renderers.
createXnlRichDocumentTiptapExtensions({ mermaid: rawNodeViewRenderer });

const stableNodeRef: XnlRichDocumentTiptapStableNodeRef = {
  kind: 'stable',
  nodeId: domainNodeId,
};
// @ts-expect-error Stable references require established Domain identity.
const unbrandedStableNodeRef: XnlRichDocumentTiptapStableNodeRef = { kind: 'stable', nodeId: 'local:0' };
void stableNodeRef;
void unbrandedStableNodeRef;

const projected: XnlRichDocumentTiptapProjectionResult = projectTiptapDocument(
  {},
  { document: richDocument },
  config,
);
const parsed: XnlRichDocumentTiptapParseResult = parseTiptapDocument(
  {},
  { document: tiptapDocument },
  config,
);
const transactionResult: XnlRichDocumentTiptapTransactionResult = normalizeTiptapTransaction(
  {},
  { transaction },
  { ...config, planNodeId: 'xnlp:node:document' },
);
const draftResult: XnlRichDocumentTiptapDraftResult = createXnlRichDocumentTiptapDraft(
  {},
  { document: tiptapDocument, acceptedObservation: 'opaque:1' },
  { ...config, planNodeId: 'xnlp:node:document' },
);
declare const draftRuntime: XnlRichDocumentTiptapDraftRuntime;
declare const bindingInput: XnlRichDocumentTiptapDraftEditorStateBindingInput;
const bindDraftToEditorState: XnlRichDocumentTiptapDraftEditorStateBindingProcessor =
  bindXnlRichDocumentTiptapDraftToEditorState;
const boundDraftResult: XnlRichDocumentTiptapDraftResult = bindDraftToEditorState(
  draftRuntime,
  { editorState, acceptedObservation: 'opaque:1' },
  { ...config, planNodeId: 'xnlp:node:document' },
);
type DraftBindingInputKeys = keyof XnlRichDocumentTiptapDraftEditorStateBindingInput;
type DraftRuntimeKeys = keyof XnlRichDocumentTiptapDraftRuntime;
type DraftConfigKeys = keyof XnlRichDocumentTiptapDraftConfig;
type DraftBindingInputIsExact = Expect<Equal<
  DraftBindingInputKeys,
  'editorState' | 'acceptedObservation'
>>;
type DraftRuntimeIsExact = Expect<Equal<DraftRuntimeKeys, 'emitInteraction'>>;
type DraftConfigIsExact = Expect<Equal<
  DraftConfigKeys,
  'schemaId' | 'extensionIds' | 'planNodeId'
>>;
type DraftBindingProcessorIsRuntimeFirst = Expect<Equal<
  XnlRichDocumentTiptapDraftEditorStateBindingProcessor,
  (
    runtime: XnlRichDocumentTiptapDraftRuntime,
    input: XnlRichDocumentTiptapDraftEditorStateBindingInput,
    config: XnlRichDocumentTiptapDraftConfig,
  ) => XnlRichDocumentTiptapDraftResult
>>;
type DraftReadyOutcome = Extract<XnlRichDocumentTiptapDraftOutcome, { status: 'ready' }>;
type DraftReadySelectionIsPublic = Expect<Equal<
  DraftReadyOutcome['selection'],
  'preserved' | 'fallback-start'
>>;

// @ts-expect-error Binding input has no parallel document authority.
void bindingInput.document;
// @ts-expect-error Binding input has no Editor owner.
void bindingInput.editor;
// @ts-expect-error Binding input has no DOM authority.
void bindingInput.dom;
// @ts-expect-error Binding input has no NodeView authority.
void bindingInput.nodeView;
// @ts-expect-error Binding input has no authoring session authority.
void bindingInput.session;
// @ts-expect-error Binding input has no revision authority.
void bindingInput.revision;
// @ts-expect-error Binding input has no VFS authority.
void bindingInput.vfs;
// @ts-expect-error Binding input has no writer authority.
void bindingInput.writer;
// @ts-expect-error Binding processors require runtime, input, then config.
bindDraftToEditorState(
  { editorState },
  { ...config, planNodeId: 'xnlp:node:document' },
);

if (draftResult.state !== undefined) {
  applyXnlRichDocumentTiptapDraftTransaction(
    { emitInteraction: (_runtime, _input, _config) => ({ status: 'emitted' }) },
    { state: draftResult.state, transaction },
    { ...config, planNodeId: 'xnlp:node:document' },
  );
  // @ts-expect-error Local editor state cannot expose an accepted revision authority.
  void draftResult.state.acceptedRevision;
}

if (transactionResult.status === 'normalized') {
  const interactionKind: 'interaction' = transactionResult.intent.kind;
  void interactionKind;
  // @ts-expect-error The Tiptap normalizer cannot produce a Domain command.
  const commandKind: 'command' = transactionResult.intent.kind;
  void commandKind;
}

void projected;
void parsed;
void transactionResult;
void draftResult;
void boundDraftResult;
void (true as DraftBindingInputIsExact);
void (true as DraftRuntimeIsExact);
void (true as DraftConfigIsExact);
void (true as DraftBindingProcessorIsRuntimeFirst);
void (true as DraftReadySelectionIsPublic);

type EmbeddedView = Readonly<{ title: string }>;
type EmbeddedSnapshot = Readonly<{ kind: 'component-embed'; input: Readonly<{ label: string }> }>;
declare const presenterFacet: XnlProjectionPresenterRuntimeFacet<EmbeddedView>;
declare const instanceRef: DocumentInstanceRef;
declare const editIntent: XnlProjectionPresenterEditIntent;
declare const authoringProposalPort: XnlAuthoringProposalPort;
const embeddedHost: XnlRichDocumentEmbeddedPresenterHostRuntime<EmbeddedView, object> = {
  presenterFacet,
  editIntentPort: (_runtime, input, _config) => {
    const intent: XnlProjectionPresenterEditIntent = input.intent;
    void intent;
    return { status: 'emitted' };
  },
};
const embeddedResult = createXnlRichDocumentEmbeddedPresenterCapability(
  embeddedHost,
  {
    phase: 'mount',
    instanceRef,
    snapshot: { kind: 'component-embed' as const, input: { label: 'Open' } },
  },
  {},
);
const invalidEmbeddedHost: XnlRichDocumentEmbeddedPresenterHostRuntime<EmbeddedView, object> = {
  presenterFacet,
  // @ts-expect-error Edit port cannot be replaced by the authoring proposal submit callback.
  editIntentPort: authoringProposalPort.submit,
};
if (embeddedResult.status === 'ready') {
  const embeddedInput: XnlRichDocumentEmbeddedPresenterInput<EmbeddedView, EmbeddedSnapshot> =
    embeddedResult.embeddedInput;
  embeddedInput.emitEditIntent(embeddedInput.view, { intent: editIntent }, {});
  // @ts-expect-error Embedded code receives no ProseMirror editor state.
  void embeddedInput.state;
  // @ts-expect-error Embedded code receives no authoring submit capability.
  void embeddedInput.submit;
  // @ts-expect-error Embedded code receives no live/base revision authority.
  void embeddedInput.baseLiveRevision;
  // @ts-expect-error Embedded code receives no persistent identity allocator.
  void embeddedInput.identityAllocator;
  // @ts-expect-error Edit grant accepts Presenter edit intent, not authoring proposal data.
  embeddedInput.emitEditIntent(embeddedInput.view, { proposal: { baseLiveRevision: 1 } }, {});
}
void embeddedResult;
void invalidEmbeddedHost;

declare const nodeViewHostRuntime: XnlRichDocumentHalfcodeNodeViewHostRuntime<EmbeddedView>;
declare const nodeViewHostInput: XnlRichDocumentHalfcodeNodeViewHostInput;
const nodeViewHostResult = createXnlRichDocumentHalfcodeNodeViewHost(
  nodeViewHostRuntime,
  nodeViewHostInput,
  {},
);
if (nodeViewHostResult.status === 'ready') {
  void nodeViewHostResult.extensions;
  nodeViewHostResult.readDiagnostics();
  nodeViewHostResult.dispose();
}
void nodeViewHostResult;

const assembledOccurrence = assembleXnlRichDocumentHalfcodeNodeViewOccurrence({}, {
  nodeId: domainNodeId,
  unitInstanceId: 'document-1',
  role: 'main',
  roleCardinality: 'single',
  descriptor: { scopeId: 'document-root' },
}, {});
if (assembledOccurrence.status === 'assembled') {
  const occurrence: XnlRichDocumentHalfcodeNodeViewOccurrence = assembledOccurrence.occurrence;
  const stableDomainId: XnlRichDocumentDomainNodeId = occurrence.nodeId;
  void stableDomainId;
  // @ts-expect-error NodeView occurrence assembly exposes no identity allocator.
  void occurrence.identityAllocator;
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence({}, {
    nodeId: domainNodeId,
    unitInstanceId: 'document-1',
    role: 'main',
    roleCardinality: 'single',
    descriptor: { scopeId: 'document-root' },
    // @ts-expect-error Canonical x-id cannot be supplied as a candidate input.
    xId: 'candidate',
  }, {});
}

// @ts-expect-error runtime-first processors require an explicit runtime argument
projectTiptapDocument({ document: richDocument }, config);

// @ts-expect-error Runtime authority is not part of the normalizer runtime.
normalizeTiptapTransaction({ submit: () => undefined }, { transaction }, { ...config, planNodeId: 'xnlp:node:document' });

// @ts-expect-error Command routing is not part of transaction input.
normalizeTiptapTransaction({}, { transaction, kind: 'command' }, { ...config, planNodeId: 'xnlp:node:document' });

// @ts-expect-error Draft runtime exposes only the optional emitInteraction effect grant.
createXnlRichDocumentTiptapDraft({ submit: () => undefined }, { document: tiptapDocument }, { ...config, planNodeId: 'xnlp:node:document' });

// @ts-expect-error Draft config cannot carry a live/base revision.
createXnlRichDocumentTiptapDraft({}, { document: tiptapDocument }, { ...config, planNodeId: 'xnlp:node:document', baseLiveRevision: 1 });
