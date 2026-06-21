import type {
  EditorPlanDiagnostic,
  EditorPlanNode,
  SchemaEditorContractRecord,
  SchemaEditorContractValue,
  ValuePath,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  SchemaEditorRevision,
  SchemaEditorSession,
  SchemaEditorSessionState,
  SchemaEditorWildcardBinding,
} from 'dg-cell-mvi-halfcode-support';
import type { VNode } from 'vue';
import type { CanonicalComponentRegistry } from '../canonicalRenderer';

export interface SchemaEditorPresenterAdapter<TComponent = unknown> {
  readonly component: TComponent;
}

export interface SchemaEditorPresenterEvent {
  readonly event: string;
  readonly payload: SchemaEditorContractValue;
}

export interface SchemaEditorPresenterEventContext {
  readonly wildcardBindings: readonly SchemaEditorWildcardBinding[];
  readonly renderScopeKey?: string;
}

export interface SchemaEditorPresenterProps {
  readonly node: EditorPlanNode;
  readonly value: SchemaEditorContractValue | undefined;
  readonly path: ValuePath;
  readonly presenterOptions: SchemaEditorContractRecord | undefined;
  readonly pending: boolean;
  readonly diagnostics: readonly EditorPlanDiagnostic[];
  readonly eventContext: SchemaEditorPresenterEventContext;
  readonly onSchemaEditorEvent: (event: SchemaEditorPresenterEvent) => void;
}

export interface SchemaEditorPresenterRegistryDiagnostic {
  readonly code:
    | 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT'
    | 'INVALID_SCHEMA_EDITOR_PRESENTER_ID'
    | 'INVALID_SCHEMA_EDITOR_PRESENTER_ADAPTER'
    | 'INVALID_SCHEMA_EDITOR_PRESENTER_REGISTRY'
    | 'DUPLICATE_SCHEMA_EDITOR_PRESENTER'
    | 'UNKNOWN_SCHEMA_EDITOR_PRESENTER';
  readonly id: string;
  readonly message: string;
}

export type SchemaEditorPresenterResolution<
  TAdapter = SchemaEditorPresenterAdapter,
> =
  | Readonly<{
      ok: true;
      id: string;
      adapter: TAdapter;
    }>
  | Readonly<{
      ok: false;
      id: string;
      diagnostic: SchemaEditorPresenterRegistryDiagnostic;
    }>;

export interface SchemaEditorPresenterRegistry<
  TAdapter = SchemaEditorPresenterAdapter,
> {
  readonly entries: readonly SchemaEditorPresenterEntry<TAdapter>[];
  resolve(id: string): SchemaEditorPresenterResolution<TAdapter>;
}

export interface SchemaEditorRendererRuntime {
  readonly presenterRegistry: SchemaEditorPresenterRegistry;
  readonly identityProjection: SchemaEditorRendererIdentityProjection;
  readonly session?: SchemaEditorSession;
  readonly sessionState?: SchemaEditorSessionState;
}

export interface SchemaEditorRenderInput {
  readonly node: EditorPlanNode;
  readonly snapshot: Readonly<{
    value: SchemaEditorContractValue;
    revision: SchemaEditorRevision;
  }>;
  readonly wildcardBindings?: readonly (string | number)[];
}

export interface SchemaEditorRenderConfig {
  readonly keyPrefix: string;
}

export type CreateSchemaEditorRendererIdentityProjectionInput =
  Readonly<Record<string, never>>;

export type CreateSchemaEditorRendererIdentityProjectionConfig =
  Readonly<Record<string, never>>;

export interface SchemaEditorRendererIdentityProjectionInput {
  readonly collectionId: string;
  readonly collectionPath: ValuePath;
  readonly items: readonly SchemaEditorContractValue[];
  readonly propertyIdentities: readonly (string | number | undefined)[];
}

export type SchemaEditorRendererIdentityProjectionResult =
  | Readonly<{
      ok: true;
      keys: readonly (string | number)[];
    }>
  | Readonly<{
      ok: false;
      code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT';
      message: string;
    }>;

export interface SchemaEditorRendererIdentityProjection {
  reconcile(
    runtime: unknown,
    input: SchemaEditorRendererIdentityProjectionInput,
    config: Readonly<{ keyPrefix: string }>,
  ): SchemaEditorRendererIdentityProjectionResult;
}

export type SchemaEditorRenderResult =
  | Readonly<{
      ok: true;
      vnode: VNode;
      diagnostics: readonly EditorPlanDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly EditorPlanDiagnostic[];
    }>;

export interface SchemaEditorPresenterEntry<
  TAdapter = SchemaEditorPresenterAdapter,
> {
  readonly id: string;
  readonly adapter: TAdapter;
}

export type SchemaEditorPresenterRegistryResult<
  TAdapter = SchemaEditorPresenterAdapter,
> =
  | Readonly<{
      ok: true;
      registry: SchemaEditorPresenterRegistry<TAdapter>;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly SchemaEditorPresenterRegistryDiagnostic[];
    }>;

export interface SchemaEditorEventBridgeRuntime {
  readonly session: SchemaEditorSession;
}

export interface SchemaEditorEventBridgeInput {
  readonly node: EditorPlanNode;
  readonly event: unknown;
  readonly wildcardBindings?: readonly SchemaEditorWildcardBinding[];
}

export interface SchemaEditorEventBridgeDiagnostic {
  readonly code:
    | 'INVALID_SCHEMA_EDITOR_PRESENTER_EVENT'
    | 'UNKNOWN_SCHEMA_EDITOR_PRESENTER_EVENT'
    | 'DUPLICATE_SCHEMA_EDITOR_COMMAND_BINDING'
    | 'INVALID_SCHEMA_EDITOR_COMMAND_BINDING'
    | 'SCHEMA_EDITOR_SESSION_DISPOSED'
    | 'SCHEMA_EDITOR_SESSION_DISPATCH_FAILED';
  readonly message: string;
}

export type SchemaEditorEventBridgeResult =
  | Readonly<{
      ok: true;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly SchemaEditorEventBridgeDiagnostic[];
    }>;

export interface SchemaEditorCanonicalRegistryRuntime {
  readonly presenterRegistry: SchemaEditorPresenterRegistry;
}

export interface SchemaEditorCanonicalRegistryInput {
  readonly parentRegistry?: CanonicalComponentRegistry;
}

export interface SchemaEditorCanonicalRegistryConfig {
  readonly componentIdentity: string;
}

export interface SchemaEditorCanonicalRegistryDiagnostic {
  readonly code: 'INVALID_SCHEMA_EDITOR_CANONICAL_REGISTRY_INPUT';
  readonly message: string;
}

export type SchemaEditorCanonicalRegistryResult =
  | Readonly<{
      ok: true;
      registry: CanonicalComponentRegistry;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly SchemaEditorCanonicalRegistryDiagnostic[];
    }>;
