import type { DocumentInstanceRef, DocumentMode } from '../unit';

/** Reuses the canonical Document Unit mode vocabulary. */
export type DocumentDisplayMode = DocumentMode;
export type DocumentDisplayModeOverlay = 'inherit' | DocumentDisplayMode;

export interface DocumentDisplayModeDocumentTarget {
  readonly kind: 'document';
  readonly unitInstanceId: string;
}

export interface DocumentDisplayModeOccurrenceTarget {
  readonly kind: 'occurrence';
  readonly ref: DocumentInstanceRef;
}

export type DocumentDisplayModeTarget =
  | DocumentDisplayModeDocumentTarget
  | DocumentDisplayModeOccurrenceTarget;

/** Opaque freshness proof issued independently from the document instance registry. */
export type DocumentDisplayModeLease = string;

export interface DocumentDisplayModeOccurrenceState {
  readonly ref: DocumentInstanceRef;
  readonly lease: DocumentDisplayModeLease;
  /** Absence is the canonical representation of inherit. */
  readonly overlay?: DocumentDisplayMode;
}

export interface DocumentDisplayModeState {
  readonly unitInstanceId: string;
  readonly baseMode: DocumentDisplayMode;
  readonly revision: number;
  readonly occurrences: readonly DocumentDisplayModeOccurrenceState[];
}

export type DocumentDisplayModeTransitionKind =
  | 'observe'
  | 'set-base'
  | 'set-overlay'
  | 'clear-overlay';

export interface DocumentDisplayModePolicyInput {
  readonly transition: DocumentDisplayModeTransitionKind;
  readonly target: DocumentDisplayModeTarget;
  readonly inheritedMode: DocumentDisplayMode;
  readonly currentMode: DocumentDisplayMode;
  readonly requestedMode: DocumentDisplayMode;
}

/** Marker interface; concrete runtimes may expose typed permission/effect capabilities. */
export interface DocumentDisplayModePolicyRuntime {}

export interface DocumentDisplayModePolicyConfig {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface DocumentDisplayModePolicyDecision {
  readonly allowed: boolean;
  readonly allowedModes: readonly DocumentDisplayMode[];
  readonly reason?: string;
}

/** DEPA processor: output = fn(runtime, input, config). */
export type DocumentDisplayModePolicy<
  TRuntime extends DocumentDisplayModePolicyRuntime = DocumentDisplayModePolicyRuntime,
  TConfig extends DocumentDisplayModePolicyConfig = DocumentDisplayModePolicyConfig,
> = (
  runtime: TRuntime,
  input: DocumentDisplayModePolicyInput,
  config: TConfig,
) => DocumentDisplayModePolicyDecision | Promise<DocumentDisplayModePolicyDecision>;

export interface DocumentDisplayModeProjection {
  readonly valid: boolean;
  readonly target: DocumentDisplayModeTarget;
  readonly inheritedMode: DocumentDisplayMode;
  readonly overlay: DocumentDisplayModeOverlay;
  readonly effectiveMode: DocumentDisplayMode;
  readonly allowedModes: readonly DocumentDisplayMode[];
  readonly canSwitch: boolean;
  readonly diagnostics: readonly DocumentDisplayModeDiagnostic[];
  readonly reason?: string;
}

export type DocumentDisplayModeCommand =
  | Readonly<{
      type: 'set-base';
      correlationId: string;
      mode: DocumentDisplayMode;
    }>
  | Readonly<{
      type: 'set-overlay';
      correlationId: string;
      ref: DocumentInstanceRef;
      lease: DocumentDisplayModeLease;
      mode: DocumentDisplayMode;
    }>
  | Readonly<{
      type: 'clear-overlay';
      correlationId: string;
      ref: DocumentInstanceRef;
      lease: DocumentDisplayModeLease;
    }>;

export type DocumentDisplayModeDiagnosticCode =
  | 'DOCUMENT_DISPLAY_MODE_INVALID_MODE'
  | 'DOCUMENT_DISPLAY_MODE_INVALID_TARGET'
  | 'DOCUMENT_DISPLAY_MODE_DUPLICATE_OCCURRENCE'
  | 'DOCUMENT_DISPLAY_MODE_UNKNOWN_TARGET'
  | 'DOCUMENT_DISPLAY_MODE_STALE_LEASE'
  | 'DOCUMENT_DISPLAY_MODE_POLICY_MISSING'
  | 'DOCUMENT_DISPLAY_MODE_POLICY_FAILED'
  | 'DOCUMENT_DISPLAY_MODE_POLICY_INCONSISTENT'
  | 'DOCUMENT_DISPLAY_MODE_TRANSITION_DENIED'
  | 'DOCUMENT_DISPLAY_MODE_SESSION_DESTROYED';

export interface DocumentDisplayModeDiagnostic {
  readonly code: DocumentDisplayModeDiagnosticCode;
  readonly message: string;
}

export interface DocumentDisplayModeTransitionResult {
  readonly ok: boolean;
  readonly changed: boolean;
  readonly state: DocumentDisplayModeState;
  readonly projection?: DocumentDisplayModeProjection;
  readonly diagnostics: readonly DocumentDisplayModeDiagnostic[];
  readonly correlationId?: string;
}

export interface DocumentDisplayModeRegistrationResult {
  readonly ok: boolean;
  readonly state: DocumentDisplayModeState;
  readonly lease?: DocumentDisplayModeLease;
  readonly diagnostics: readonly DocumentDisplayModeDiagnostic[];
}

export interface DocumentDisplayModeSessionSnapshot {
  readonly state: DocumentDisplayModeState;
  readonly projections: readonly DocumentDisplayModeProjection[];
}

export interface DocumentDisplayModeSession {
  readonly snapshot: () => DocumentDisplayModeSessionSnapshot;
  /** Re-evaluate projections after runtime permission facts change. */
  readonly refreshPolicy: () => Promise<DocumentDisplayModeSessionSnapshot>;
  readonly register: (ref: DocumentInstanceRef) => Promise<DocumentDisplayModeRegistrationResult>;
  readonly unregister: (
    ref: DocumentInstanceRef,
    lease: DocumentDisplayModeLease,
  ) => Promise<DocumentDisplayModeTransitionResult>;
  readonly dispatch: (command: DocumentDisplayModeCommand) => Promise<DocumentDisplayModeTransitionResult>;
  readonly subscribe: (listener: (snapshot: DocumentDisplayModeSessionSnapshot) => void) => () => void;
  readonly destroy: () => void;
}
