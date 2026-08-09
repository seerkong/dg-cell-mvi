import type { Extensions, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type {
  DocumentInstanceRef,
  DocumentAddressDescriptor,
  DocumentInstanceRegistry,
  SerializableRecord,
  UnitRenderPlan,
  UnitFqn,
  XnlProjectionInteraction,
  XnlProjectionPresenterDeepReadonly,
  XnlProjectionPresenterEditIntent,
  XnlProjectionPresenterReadonlyView,
  XnlProjectionPresenterRuntimeFacet,
  XnlProjectionSerializableRecord,
  XnlRichDocument,
  XnlRichDocumentDiagnostic,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditInteractionPayload,
  XnlRichDocumentInlineRun,
  XnlRichDocumentLocalNodeRef,
  XnlRichDocumentOccurrenceXId,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentSemanticNode,
  XnlRichDocumentSerializableRecord,
  XnlRichDocumentStableNodeRef,
} from 'dg-cell-mvi-halfcode-contract';
import type { HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import type { CanonicalComponentRegistry } from 'dg-cell-mvi-halfcode-vue';

export type XnlRichDocumentEmbeddedPresenterDiagnosticCode =
  | 'INVALID_EMBEDDED_PRESENTER_RUNTIME'
  | 'INVALID_EMBEDDED_PRESENTER_FACET'
  | 'INVALID_EMBEDDED_PRESENTER_INPUT'
  | 'INVALID_EMBEDDED_PRESENTER_SNAPSHOT'
  | 'INVALID_EMBEDDED_PRESENTER_INSTANCE_REF'
  | 'INVALID_EMBEDDED_PRESENTER_EDIT_INTENT'
  | 'EMBEDDED_PRESENTER_EDIT_PORT_REJECTED';

export type XnlRichDocumentEmbeddedPresenterDiagnostic = Readonly<{
  severity: 'error';
  code: XnlRichDocumentEmbeddedPresenterDiagnosticCode;
  message: string;
}>;

export type XnlRichDocumentEmbeddedPresenterLifecyclePhase = 'mount' | 'update';

export type XnlRichDocumentEmbeddedPresenterEditPortInput = Readonly<{
  intent: XnlProjectionPresenterEditIntent;
}>;

export type XnlRichDocumentEmbeddedPresenterEditResult =
  | Readonly<{ status: 'emitted' }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentEmbeddedPresenterDiagnostic,
        ...XnlRichDocumentEmbeddedPresenterDiagnostic[],
      ];
    }>;

export type XnlRichDocumentEmbeddedPresenterEditPort<THost extends object> = (
  runtime: THost,
  input: XnlRichDocumentEmbeddedPresenterEditPortInput,
  config: Readonly<Record<PropertyKey, never>>,
) => XnlRichDocumentEmbeddedPresenterEditResult
  | Promise<XnlRichDocumentEmbeddedPresenterEditResult>;

export interface XnlRichDocumentEmbeddedPresenterHostRuntime<
  TView extends object,
  THost extends object = object,
> {
  readonly presenterFacet: XnlProjectionPresenterRuntimeFacet<TView>;
  readonly editIntentPort: XnlRichDocumentEmbeddedPresenterEditPort<THost>;
}

export type XnlRichDocumentEmbeddedPresenterEmitEditIntentGrant<
  TView extends object,
> = (
  runtime: XnlProjectionPresenterReadonlyView<TView>,
  input: XnlRichDocumentEmbeddedPresenterEditPortInput,
  config: Readonly<Record<PropertyKey, never>>,
) => Promise<XnlRichDocumentEmbeddedPresenterEditResult>;

export type XnlRichDocumentEmbeddedPresenterInput<
  TView extends object,
  TSnapshot extends XnlProjectionSerializableRecord = XnlProjectionSerializableRecord,
> = Readonly<{
  view: XnlProjectionPresenterReadonlyView<TView>;
  snapshot: XnlProjectionPresenterDeepReadonly<TSnapshot>;
  instanceRef: Readonly<DocumentInstanceRef>;
  emitEditIntent: XnlRichDocumentEmbeddedPresenterEmitEditIntentGrant<TView>;
}>;

export type XnlRichDocumentEmbeddedPresenterCapabilityInput<
  TSnapshot extends XnlProjectionSerializableRecord,
> = Readonly<{
  phase: XnlRichDocumentEmbeddedPresenterLifecyclePhase;
  instanceRef: DocumentInstanceRef;
  snapshot: TSnapshot;
}>;

export type XnlRichDocumentEmbeddedPresenterCapabilityConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentEmbeddedPresenterCapabilityResult<
  TView extends object,
  TSnapshot extends XnlProjectionSerializableRecord,
> =
  | Readonly<{
      status: 'ready';
      phase: XnlRichDocumentEmbeddedPresenterLifecyclePhase;
      embeddedInput: XnlRichDocumentEmbeddedPresenterInput<TView, TSnapshot>;
      diagnostics: readonly [];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentEmbeddedPresenterDiagnostic,
        ...XnlRichDocumentEmbeddedPresenterDiagnostic[],
      ];
    }>;

export type XnlRichDocumentHalfcodeNodeViewDiagnosticCode =
  | 'INVALID_HALFCODE_NODEVIEW_RUNTIME'
  | 'INVALID_HALFCODE_NODEVIEW_INPUT'
  | 'INVALID_HALFCODE_NODEVIEW_FACET'
  | 'INVALID_HALFCODE_NODEVIEW_OCCURRENCE'
  | 'UNKNOWN_HALFCODE_COMPONENT'
  | 'UNKNOWN_HALFCODE_CAPSULE'
  | 'DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE'
  | 'HALFCODE_NODEVIEW_VUE_MOUNT_FAILED'
  | 'HALFCODE_NODEVIEW_UPDATE_REJECTED'
  | 'HALFCODE_NODEVIEW_CLEANUP_REJECTED';

export type XnlRichDocumentHalfcodeNodeViewDiagnostic = Readonly<{
  severity: 'error';
  code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode;
  message: string;
}>;

export type XnlRichDocumentHalfcodeNodeViewTarget = Readonly<{
  kind: 'component-embed' | 'capsule-embed';
  ref: string;
  presenterIdentity: string;
  plan: UnitRenderPlan;
}>;

export type XnlRichDocumentHalfcodeNodeViewOccurrence = Readonly<{
  nodeId: XnlRichDocumentDomainNodeId;
  role: string;
  roleCardinality: 'single' | 'multiple';
  instanceRef: Readonly<{
    unitInstanceId: string;
    projectionRole: string;
    xId: XnlRichDocumentOccurrenceXId;
  }>;
  descriptor: Readonly<{
    projectionRole: string;
    documentNodeId: XnlRichDocumentDomainNodeId;
    xId: XnlRichDocumentOccurrenceXId;
    unitFqn?: UnitFqn;
    scopeId: string;
    metadata?: SerializableRecord;
  }>;
}>;

export type XnlRichDocumentHalfcodeNodeViewOccurrenceDescriptorFacts = Readonly<{
  scopeId: string;
  unitFqn?: UnitFqn;
  metadata?: SerializableRecord;
}>;

export type XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyRuntime = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyInput = Readonly<{
  nodeId: XnlRichDocumentDomainNodeId;
  unitInstanceId: string;
  role: string;
  roleCardinality: 'single' | 'multiple';
  descriptor: XnlRichDocumentHalfcodeNodeViewOccurrenceDescriptorFacts;
}>;

export type XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyResult =
  | Readonly<{
      status: 'assembled';
      occurrence: XnlRichDocumentHalfcodeNodeViewOccurrence;
      diagnostics: readonly [];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentHalfcodeNodeViewDiagnostic,
        ...XnlRichDocumentHalfcodeNodeViewDiagnostic[],
      ];
    }>;

export type XnlRichDocumentHalfcodeNodeViewHostInput = Readonly<{
  targets: readonly XnlRichDocumentHalfcodeNodeViewTarget[];
  occurrences: readonly XnlRichDocumentHalfcodeNodeViewOccurrence[];
}>;

export interface XnlRichDocumentHalfcodeNodeViewHostRuntime<
  TView extends object,
  THost extends object = object,
> extends XnlRichDocumentEmbeddedPresenterHostRuntime<TView, THost> {
  readonly documentInstances: DocumentInstanceRegistry;
  readonly halfcodeRuntime: HalfcodeAppRuntime;
  readonly canonicalRegistry?: CanonicalComponentRegistry;
}

export type XnlRichDocumentHalfcodeNodeViewHostConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentHalfcodeNodeViewHostResult =
  | Readonly<{
      status: 'ready';
      extensions: Extensions;
      readDiagnostics: () => readonly XnlRichDocumentHalfcodeNodeViewDiagnostic[];
      dispose: () => void;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentHalfcodeNodeViewDiagnostic,
        ...XnlRichDocumentHalfcodeNodeViewDiagnostic[],
      ];
    }>;

export type XnlRichDocumentMermaidTheme = 'default' | 'dark' | 'neutral';

export type XnlRichDocumentMermaidDiagnosticCode =
  | 'INVALID_MERMAID_NODEVIEW_RUNTIME'
  | 'INVALID_MERMAID_NODEVIEW_INPUT'
  | 'INVALID_MERMAID_NODEVIEW_CONFIG'
  | 'MERMAID_RENDER_REJECTED'
  | 'MERMAID_RENDER_FAILED'
  | 'INVALID_MERMAID_RENDER_RESULT'
  | 'MERMAID_RENDER_RESULT_MISMATCH'
  | 'UNSAFE_MERMAID_RENDER_OUTPUT';

export type XnlRichDocumentMermaidDiagnostic<
  TRequestId extends string = string,
> = Readonly<{
  severity: 'error';
  code: XnlRichDocumentMermaidDiagnosticCode;
  message: string;
  requestId: TRequestId;
}>;

export type XnlRichDocumentMermaidRenderInput<
  TRequestId extends string = string,
> = Readonly<{
  source: string;
  requestId: TRequestId;
}>;

export type XnlRichDocumentMermaidRenderConfig = Readonly<{
  theme: XnlRichDocumentMermaidTheme;
}>;

export type XnlRichDocumentMermaidRenderResult<
  TRequestId extends string = string,
> =
  | Readonly<{
      status: 'rendered';
      requestId: TRequestId;
      svg: SVGSVGElement;
    }>
  | Readonly<{
      status: 'rejected';
      requestId: TRequestId;
      diagnostics: readonly [
        XnlRichDocumentMermaidDiagnostic<TRequestId>,
        ...XnlRichDocumentMermaidDiagnostic<TRequestId>[],
      ];
    }>;

export type XnlRichDocumentMermaidRenderEffect<
  TRenderRuntime extends object,
> = <TRequestId extends string>(
  runtime: TRenderRuntime,
  input: XnlRichDocumentMermaidRenderInput<TRequestId>,
  config: XnlRichDocumentMermaidRenderConfig,
) => Promise<XnlRichDocumentMermaidRenderResult<TRequestId>>;

export type XnlRichDocumentMermaidDiagnosticInput = Readonly<{
  diagnostic: XnlRichDocumentMermaidDiagnostic;
}>;

export type XnlRichDocumentMermaidDiagnosticConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentMermaidDiagnosticEffect<
  TDiagnosticRuntime extends object,
> = (
  runtime: TDiagnosticRuntime,
  input: XnlRichDocumentMermaidDiagnosticInput,
  config: XnlRichDocumentMermaidDiagnosticConfig,
) => void | Promise<void>;

export interface XnlRichDocumentMermaidNodeViewRuntime<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
> {
  readonly renderer: Readonly<{
    runtime: TRenderRuntime;
    effect: XnlRichDocumentMermaidRenderEffect<TRenderRuntime>;
  }>;
  readonly diagnostics: Readonly<{
    runtime: TDiagnosticRuntime;
    effect: XnlRichDocumentMermaidDiagnosticEffect<TDiagnosticRuntime>;
  }>;
}

export type XnlRichDocumentMermaidNodeViewHostInput = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentMermaidNodeViewHostConfig =
  XnlRichDocumentMermaidRenderConfig;

export type XnlRichDocumentMermaidNodeViewHostResult =
  | Readonly<{
      status: 'ready';
      extensions: Extensions;
      dispose: () => void;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentMermaidDiagnostic,
        ...XnlRichDocumentMermaidDiagnostic[],
      ];
    }>;

export type XnlRichDocumentMermaidNodeViewHostFactory<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
> = (
  runtime: XnlRichDocumentMermaidNodeViewRuntime<TRenderRuntime, TDiagnosticRuntime>,
  input: XnlRichDocumentMermaidNodeViewHostInput,
  config: XnlRichDocumentMermaidNodeViewHostConfig,
) => XnlRichDocumentMermaidNodeViewHostResult;

export interface XnlRichDocumentTiptapBrowserHostRuntime<
  TView extends object,
  THost extends object = object,
  TRenderRuntime extends object = object,
  TDiagnosticRuntime extends object = object,
> {
  readonly halfcode: THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>;
  readonly mermaid: XnlRichDocumentMermaidNodeViewRuntime<TRenderRuntime, TDiagnosticRuntime>;
}

export type XnlRichDocumentTiptapBrowserHostInput =
  XnlRichDocumentHalfcodeNodeViewHostInput;

export type XnlRichDocumentTiptapBrowserHostConfig =
  XnlRichDocumentMermaidNodeViewHostConfig;

export type XnlRichDocumentTiptapBrowserHostDiagnosticCode =
  | 'INVALID_TIPTAP_BROWSER_HOST_RUNTIME'
  | 'TIPTAP_BROWSER_HOST_ASSEMBLY_FAILED';

export type XnlRichDocumentTiptapBrowserHostDiagnostic = Readonly<{
  severity: 'error';
  code: XnlRichDocumentTiptapBrowserHostDiagnosticCode;
  message: string;
}>;

export type XnlRichDocumentTiptapBrowserHostResult =
  | Readonly<{
      status: 'ready';
      extensions: Extensions;
      readDiagnostics: () => readonly XnlRichDocumentHalfcodeNodeViewDiagnostic[];
      dispose: () => void;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentTiptapBrowserHostDiagnostic
          | XnlRichDocumentHalfcodeNodeViewDiagnostic
          | XnlRichDocumentMermaidDiagnostic,
        ...(XnlRichDocumentTiptapBrowserHostDiagnostic
          | XnlRichDocumentHalfcodeNodeViewDiagnostic
          | XnlRichDocumentMermaidDiagnostic)[],
      ];
    }>;

export type XnlRichDocumentTiptapBrowserHostFactory<
  TView extends object,
  THost extends object,
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
> = (
  runtime: XnlRichDocumentTiptapBrowserHostRuntime<
    TView,
    THost,
    TRenderRuntime,
    TDiagnosticRuntime
  >,
  input: XnlRichDocumentTiptapBrowserHostInput,
  config: XnlRichDocumentTiptapBrowserHostConfig,
) => XnlRichDocumentTiptapBrowserHostResult;

export const XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID = 'xnl-rich-document/tiptap-v1' as const;

export const XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS = [
  'starter-kit',
  'persistent-node-id',
  'link-title',
  'text-alignment',
  'text-color',
  'highlight',
  'task-list',
  'image',
  'table',
  'mermaid',
  'component-embed',
  'capsule-embed',
] as const;

export type XnlRichDocumentTiptapExtensionId =
  (typeof XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS)[number];

export type XnlRichDocumentTiptapDiagnosticCode =
  | 'INVALID_TIPTAP_DOCUMENT'
  | 'LOSSY_TIPTAP_VALUE'
  | 'UNSUPPORTED_TIPTAP_EXTENSION'
  | 'UNSUPPORTED_TIPTAP_MARK'
  | 'UNSUPPORTED_TIPTAP_NODE'
  | 'UNSUPPORTED_TIPTAP_SCHEMA'
  | 'INVALID_TIPTAP_TRANSACTION'
  | 'INVALID_TIPTAP_DRAFT'
  | 'LOSSY_TIPTAP_TRANSACTION'
  | 'TIPTAP_DRAFT_CONFLICT'
  | 'TIPTAP_PUBLICATION_FAILED'
  | 'UNSUPPORTED_TIPTAP_TRANSACTION';

export type XnlRichDocumentTiptapDiagnostic = Readonly<{
  severity: 'error';
  code: XnlRichDocumentTiptapDiagnosticCode;
  message: string;
  path?: readonly (string | number)[];
  nodeId?: XnlRichDocumentDomainNodeId;
  details?: XnlRichDocumentSerializableRecord;
}>;

export type XnlRichDocumentTiptapConfig = Readonly<{
  schemaId: typeof XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID | string;
  extensionIds: readonly string[];
}>;

export type XnlRichDocumentTiptapRuntime = Readonly<Record<string, never>>;

export type XnlRichDocumentTiptapProjectionInput = Readonly<{
  document: XnlRichDocument;
}>;

export type XnlRichDocumentTiptapParseInput = Readonly<{
  document: JSONContent;
}>;

export type XnlRichDocumentTiptapIdentityProjection = Readonly<{
  field: 'nodeId';
  source: 'domain-#id';
  ordinaryPayloadUpdate: false;
}>;

export type XnlRichDocumentTiptapProjectionResult =
  | Readonly<{
      status: 'projected';
      schemaId: typeof XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID;
      document: JSONContent;
      identity: XnlRichDocumentTiptapIdentityProjection;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentTiptapDiagnostic | XnlRichDocumentDiagnostic,
        ...(XnlRichDocumentTiptapDiagnostic | XnlRichDocumentDiagnostic)[],
      ];
    }>;

export type XnlRichDocumentTiptapParseResult =
  | Readonly<{
      status: 'parsed';
      document: XnlRichDocument;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        XnlRichDocumentTiptapDiagnostic | XnlRichDocumentDiagnostic,
        ...(XnlRichDocumentTiptapDiagnostic | XnlRichDocumentDiagnostic)[],
      ];
    }>;

export type XnlRichDocumentTiptapProjectionProcessor = (
  runtime: XnlRichDocumentTiptapRuntime,
  input: XnlRichDocumentTiptapProjectionInput,
  config: XnlRichDocumentTiptapConfig,
) => XnlRichDocumentTiptapProjectionResult;

export type XnlRichDocumentTiptapParseProcessor = (
  runtime: XnlRichDocumentTiptapRuntime,
  input: XnlRichDocumentTiptapParseInput,
  config: XnlRichDocumentTiptapConfig,
) => XnlRichDocumentTiptapParseResult;

export type XnlRichDocumentTiptapSchemaResult =
  | Readonly<{
      status: 'ready';
      schemaId: typeof XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID;
      schema: ReturnType<(typeof import('@tiptap/core'))['getSchema']>;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
    }>;

export type XnlRichDocumentTiptapStableNodeRef = XnlRichDocumentStableNodeRef;

export type XnlRichDocumentTiptapLocalNodeRef = XnlRichDocumentLocalNodeRef;

export type XnlRichDocumentTiptapNodeRef =
  | XnlRichDocumentTiptapStableNodeRef
  | XnlRichDocumentTiptapLocalNodeRef;

export type XnlRichDocumentTiptapSemanticNode = XnlRichDocumentSemanticNode;

export type XnlRichDocumentTiptapInlineRun = XnlRichDocumentInlineRun;

export type XnlRichDocumentTiptapSemanticEdit = XnlRichDocumentSemanticEdit;

export type XnlRichDocumentTiptapInteractionPayload = XnlRichDocumentEditInteractionPayload;

export type XnlRichDocumentTiptapInteractionIntent = Readonly<{
  kind: 'interaction';
  proposal: XnlProjectionInteraction & Readonly<{
    type: 'xnl.rich-document.edit';
    payload: XnlRichDocumentTiptapInteractionPayload;
  }>;
}> & Extract<XnlProjectionPresenterEditIntent, { kind: 'interaction' }>;

export type XnlRichDocumentTiptapCompositionPhase = 'intermediate' | 'settled';

export type XnlRichDocumentTiptapTransactionInput = Readonly<{
  transaction: Transaction;
  composition?: XnlRichDocumentTiptapCompositionPhase;
}>;

export type XnlRichDocumentTiptapTransactionConfig = XnlRichDocumentTiptapConfig & Readonly<{
  planNodeId: string;
}>;

export type XnlRichDocumentTiptapTransactionSilentReason =
  | 'selection-only'
  | 'metadata-only'
  | 'no-document-change'
  | 'intermediate-composition';

export type XnlRichDocumentTiptapTransactionResult =
  | Readonly<{
      status: 'normalized';
      intent: XnlRichDocumentTiptapInteractionIntent;
    }>
  | Readonly<{
      status: 'silent';
      reason: XnlRichDocumentTiptapTransactionSilentReason;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
    }>;

export type XnlRichDocumentTiptapTransactionProcessor = (
  runtime: XnlRichDocumentTiptapRuntime,
  input: XnlRichDocumentTiptapTransactionInput,
  config: XnlRichDocumentTiptapTransactionConfig,
) => XnlRichDocumentTiptapTransactionResult;

export type XnlRichDocumentTiptapAcceptedObservation = string;

export type XnlRichDocumentTiptapDraftState = Readonly<{
  editorState: EditorState;
  acceptedDocument: ProseMirrorNode;
  acceptedObservation?: XnlRichDocumentTiptapAcceptedObservation;
  pendingAcceptance: boolean;
  compositionActive: boolean;
}>;

export type XnlRichDocumentTiptapEmitInteractionInput = Readonly<{
  intent: XnlRichDocumentTiptapInteractionIntent;
}>;

export type XnlRichDocumentTiptapEmitInteractionResult =
  | Readonly<{ status: 'emitted' }>
  | Readonly<{ status: 'rejected'; reason: string }>;

export type XnlRichDocumentTiptapEmitInteractionEffect = (
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapEmitInteractionInput,
  config: Readonly<Record<string, never>>,
) => XnlRichDocumentTiptapEmitInteractionResult;

export type XnlRichDocumentTiptapDraftRuntime = Readonly<{
  emitInteraction?: XnlRichDocumentTiptapEmitInteractionEffect;
}>;

export type XnlRichDocumentTiptapDraftConfig = XnlRichDocumentTiptapTransactionConfig;

export type XnlRichDocumentTiptapDraftCreateInput = Readonly<{
  document: JSONContent;
  acceptedObservation?: XnlRichDocumentTiptapAcceptedObservation;
}>;

export type XnlRichDocumentTiptapDraftEditorStateBindingInput = Readonly<{
  editorState: EditorState;
  acceptedObservation?: XnlRichDocumentTiptapAcceptedObservation;
}>;

export type XnlRichDocumentTiptapDraftTransactionInput = Readonly<{
  state: XnlRichDocumentTiptapDraftState;
  transaction: Transaction;
  composition?: 'intermediate';
}>;

export type XnlRichDocumentTiptapDraftAdoptInput = Readonly<{
  state: XnlRichDocumentTiptapDraftState;
  transaction: Transaction;
  editorState: EditorState;
  composition?: 'intermediate';
}>;

export type XnlRichDocumentTiptapDraftStateInput = Readonly<{
  state: XnlRichDocumentTiptapDraftState;
}>;

export type XnlRichDocumentTiptapStaleDraftPolicy = 'conflict' | 'replace';

export type XnlRichDocumentTiptapReprojectConfig = XnlRichDocumentTiptapConfig & Readonly<{
  planNodeId: string;
  staleDraftPolicy: XnlRichDocumentTiptapStaleDraftPolicy;
}>;

export type XnlRichDocumentTiptapAcceptedProjectionInput = Readonly<{
  state: XnlRichDocumentTiptapDraftState;
  document: JSONContent;
  acceptedObservation?: XnlRichDocumentTiptapAcceptedObservation;
}>;

export type XnlRichDocumentTiptapDraftPublication = 'local-only' | 'published' | 'silent';

export type XnlRichDocumentTiptapDraftOutcome =
  | Readonly<{
      status: 'ready';
      localDraft: false;
      pendingAcceptance: false;
      selection: 'preserved' | 'fallback-start';
    }>
  | Readonly<{
      status: 'applied';
      publication: XnlRichDocumentTiptapDraftPublication;
      reason?: XnlRichDocumentTiptapTransactionSilentReason | 'history-empty';
      localDraft: boolean;
      pendingAcceptance: boolean;
    }>
  | Readonly<{
      status: 'composition-buffered';
      published: false;
      localDraft: boolean;
      pendingAcceptance: boolean;
    }>
  | Readonly<{
      status: 'composition-settled';
      publication: XnlRichDocumentTiptapDraftPublication;
      reason?: 'no-document-change';
      localDraft: boolean;
      pendingAcceptance: boolean;
    }>
  | Readonly<{
      status: 'publication-failed';
      localDraft: boolean;
      pendingAcceptance: boolean;
      diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
    }>
  | Readonly<{
      status: 'reprojected';
      reason: 'accepted-local-draft' | 'external-accepted' | 'replaced-stale-draft';
      selection: 'preserved' | 'fallback-start';
      localDraft: false;
      pendingAcceptance: false;
    }>
  | Readonly<{
      status: 'conflict';
      policy: 'conflict';
      localDraftPreserved: true;
      diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
    }>;

export type XnlRichDocumentTiptapDraftResult = Readonly<{
  state?: XnlRichDocumentTiptapDraftState;
  outcome: XnlRichDocumentTiptapDraftOutcome;
}>;

export type XnlRichDocumentTiptapDraftEditorStateBindingProcessor = (
  runtime: XnlRichDocumentTiptapDraftRuntime,
  input: XnlRichDocumentTiptapDraftEditorStateBindingInput,
  config: XnlRichDocumentTiptapDraftConfig,
) => XnlRichDocumentTiptapDraftResult;
