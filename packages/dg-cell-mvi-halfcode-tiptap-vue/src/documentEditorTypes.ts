import type { Extensions } from '@tiptap/core';
import type {
  DocumentEditorCapabilities,
  DocumentEditorContext,
  DocumentEditorPresentation,
  DocumentEditorSerializableRecord,
  DocumentEditorToolbarDiagnostic,
  DocumentEditorToolbarPlan,
  DocumentDisplayModeProjection,
  XnlRichDocument,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  DocumentEditorPresentationCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  XnlRichDocumentTiptapDraftRuntime,
  XnlRichDocumentTiptapStaleDraftPolicy,
} from './types';
import type { XnlRichDocumentStructuredNodeViewModeRuntime } from './structuredNodeViewMode';

export type XnlDocumentEditorClipboardInput = Readonly<{
  text: string;
}>;

export type XnlDocumentEditorClipboardResult =
  | Readonly<{ status: 'written' }>
  | Readonly<{ status: 'rejected'; reason: string }>;

export type XnlDocumentEditorClipboardEffect<TRuntime extends object = object> = (
  runtime: TRuntime,
  input: XnlDocumentEditorClipboardInput,
  config: Readonly<Record<PropertyKey, never>>,
) => XnlDocumentEditorClipboardResult | Promise<XnlDocumentEditorClipboardResult>;

export type XnlDocumentEditorClipboardBinding<TRuntime extends object = object> = Readonly<{
  runtime: TRuntime;
  effect: XnlDocumentEditorClipboardEffect<TRuntime>;
}>;

export type XnlDocumentEditorHighlightToken = Readonly<{
  from: number;
  to: number;
  className: string;
}>;

export type XnlDocumentEditorHighlightInput = Readonly<{
  language?: string;
  source: string;
}>;

export type XnlDocumentEditorHighlightConfig = Readonly<{
  theme: string;
}>;

export type XnlDocumentEditorHighlightResult =
  | Readonly<{
      status: 'highlighted';
      tokens: readonly XnlDocumentEditorHighlightToken[];
    }>
  | Readonly<{
      status: 'unsupported';
      reason: string;
    }>;

export type XnlDocumentEditorHighlightEffect<TRuntime extends object = object> = (
  runtime: TRuntime,
  input: XnlDocumentEditorHighlightInput,
  config: XnlDocumentEditorHighlightConfig,
) => XnlDocumentEditorHighlightResult;

export type XnlDocumentEditorHighlightBinding<TRuntime extends object = object> = Readonly<{
  runtime: TRuntime;
  effect: XnlDocumentEditorHighlightEffect<TRuntime>;
}>;

export type XnlDocumentEditorRuntime = Readonly<{
  authoring: XnlRichDocumentTiptapDraftRuntime;
  presentation: DocumentEditorPresentationCompilerRuntime;
  commands?: ReadonlyMap<string, XnlDocumentEditorCommandBinding>;
  clipboard?: XnlDocumentEditorClipboardBinding;
  highlighter?: XnlDocumentEditorHighlightBinding;
  structuredNodeViews?: XnlRichDocumentStructuredNodeViewModeRuntime;
  rendererHost?: Readonly<{
    extensions: Extensions;
  }>;
}>;

export type XnlDocumentEditorDiagnosticSinkInput<TDiagnostic = unknown> = Readonly<{
  diagnostics: readonly TDiagnostic[];
}>;

export type XnlDocumentEditorDiagnosticSinkBinding<TDiagnostic = unknown> = Readonly<{
  runtime: object;
  effect: (
    runtime: object,
    input: XnlDocumentEditorDiagnosticSinkInput<TDiagnostic>,
    config: Readonly<Record<PropertyKey, never>>,
  ) => void;
}>;

export type XnlDocumentEditorCommandProcessor<TRuntime extends object = object> = (
  runtime: TRuntime,
  input: Readonly<{ options?: DocumentEditorSerializableRecord }>,
  config: Readonly<{ commandId: string }>,
) => XnlDocumentEditorCommandOutcome | Promise<XnlDocumentEditorCommandOutcome>;

export type XnlDocumentEditorCommandBinding<TRuntime extends object = object> = Readonly<{
  runtime: TRuntime;
  processor: XnlDocumentEditorCommandProcessor<TRuntime>;
  /** Defaults to true. Set false only for a non-authoring business command. */
  requiresEditable?: boolean;
}>;

export type XnlDocumentEditorInput = Readonly<{
  document: XnlRichDocument;
  acceptedObservation?: string;
  presentation: DocumentEditorPresentation;
  capabilities: DocumentEditorCapabilities;
  /** Frozen observation only. The editor never receives mode owner authority. */
  displayMode?: DocumentDisplayModeProjection;
}>;

export type XnlDocumentEditorConfig = Readonly<{
  planNodeId: string;
  staleDraftPolicy: XnlRichDocumentTiptapStaleDraftPolicy;
  unknownToolPolicy: 'diagnostic' | 'reject';
  codeTheme?: string;
}>;

export type XnlDocumentEditorCommandInput = Readonly<{
  commandId: string;
  options?: DocumentEditorSerializableRecord;
}>;

export type XnlDocumentEditorCommandOutcome =
  | Readonly<{ status: 'executed' }>
  | Readonly<{ status: 'unavailable'; reason: string }>
  | Readonly<{ status: 'rejected'; reason: string }>;

export type XnlDocumentEditorSnapshot = Readonly<{
  context: DocumentEditorContext;
  toolbar: DocumentEditorToolbarPlan;
  diagnostics: readonly DocumentEditorToolbarDiagnostic[];
  pendingAcceptance: boolean;
  compositionActive: boolean;
  codeFolded: boolean;
  displayMode: DocumentDisplayModeProjection | undefined;
}>;

export interface XnlDocumentEditorCommandFacade {
  execute(input: XnlDocumentEditorCommandInput): XnlDocumentEditorCommandOutcome | Promise<XnlDocumentEditorCommandOutcome>;
  canExecute(input: XnlDocumentEditorCommandInput): boolean;
  focus(): void;
}

export interface XnlDocumentEditorSession {
  readonly commands: XnlDocumentEditorCommandFacade;
  read(): XnlDocumentEditorSnapshot;
  subscribe(listener: (snapshot: XnlDocumentEditorSnapshot) => void): () => void;
  update(input: XnlDocumentEditorInput): void;
  reproject(input: Pick<XnlDocumentEditorInput, 'document' | 'acceptedObservation'>): void;
  destroy(): void;
}

export type XnlDocumentEditorCreateResult =
  | Readonly<{ status: 'ready'; session: XnlDocumentEditorSession }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [DocumentEditorToolbarDiagnostic, ...DocumentEditorToolbarDiagnostic[]];
    }>;
