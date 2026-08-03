/**
 * Renderer-neutral Document Unit definition and occurrence contracts.
 *
 * Static plans contain only definition-time data. Runtime occurrence identity
 * and opaque mounted targets enter through the runtime ports below.
 */

import {
  HalfcodeUnitContractError,
  type SerializableRecord,
  type UnitFqn,
} from './common';
import type { DocumentMode } from './contracts';
import type { HalfcodeRef } from './refs';
import type {
  XnlAuthoringRuntime,
  XnlAuthoringScopeAuthoringFacet,
  XnlAuthoringSerializableValue,
  XnlAuthoringSessionFactoryPort,
} from '../xnl-authoring';

interface DocumentInlineSourceDescriptor {
  readonly kind: 'inline';
  readonly unitSourceRef: HalfcodeRef;
  readonly region: 'body';
}

interface DocumentExternalSourceDescriptor {
  readonly kind: 'external';
  readonly ref: HalfcodeRef;
}

/** Definition-time source. Inline Unit structure cannot be replaced at open time. */
export type DocumentSourceDescriptor =
  | DocumentInlineSourceDescriptor
  | DocumentExternalSourceDescriptor;

/** Values supplied for one occurrence without mutating its static definition. */
export interface DocumentOpenContext {
  readonly unitInstanceId: string;
  /** Valid only when the definition uses an external source. */
  readonly externalSourceRef?: HalfcodeRef;
  readonly revision?: string;
  readonly mode: DocumentMode;
  readonly parameters?: SerializableRecord;
}

/** Static local address emitted by the compiler before an occurrence exists. */
export interface DocumentAddressDescriptor {
  readonly projectionRole: string;
  readonly xId: string;
  readonly documentNodeId?: string;
  readonly unitFqn?: UnitFqn;
  readonly scopeId: string;
  readonly metadata?: SerializableRecord;
}

/** Complete runtime address owned by one Document occurrence. */
export interface DocumentInstanceRef {
  readonly unitInstanceId: string;
  readonly projectionRole: string;
  readonly xId: string;
}

const DOCUMENT_INSTANCE_REF_SCHEME = 'unit-instance';
export const HALFCODE_DOCUMENT_INSTANCE_REF_INVALID =
  'HALFCODE_DOCUMENT_INSTANCE_REF_INVALID';

const DOCUMENT_INSTANCE_REF_PREFIX = `${DOCUMENT_INSTANCE_REF_SCHEME}://`;
const URI_SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;
const PROJECTION_ROLE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function documentInstanceRefError(value: unknown, reason: string): HalfcodeUnitContractError {
  return new HalfcodeUnitContractError(
    HALFCODE_DOCUMENT_INSTANCE_REF_INVALID,
    `Invalid Document instance ref "${String(value)}": ${reason}`,
  );
}

function assertUriSafeSegment(
  value: unknown,
  name: 'unitInstanceId' | 'xId',
): asserts value is string {
  if (typeof value !== 'string' || !URI_SAFE_SEGMENT_PATTERN.test(value)) {
    throw documentInstanceRefError(
      value,
      `${name} must be a non-empty URI-safe segment using only unreserved characters.`,
    );
  }
}

function assertCanonicalProjectionRole(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PROJECTION_ROLE_PATTERN.test(value)) {
    throw documentInstanceRefError(
      value,
      'projectionRole must be a canonical lowercase kebab-case URI segment.',
    );
  }
}

/** Format `unit-instance://<unit-instance-id>/<projection-role>/<x-id>`. */
export function formatDocumentInstanceRef(ref: DocumentInstanceRef): string {
  if (ref === null || typeof ref !== 'object') {
    throw documentInstanceRefError(ref, 'ref must be an object.');
  }
  assertUriSafeSegment(ref.unitInstanceId, 'unitInstanceId');
  assertCanonicalProjectionRole(ref.projectionRole);
  assertUriSafeSegment(ref.xId, 'xId');
  return `${DOCUMENT_INSTANCE_REF_PREFIX}${ref.unitInstanceId}/${ref.projectionRole}/${ref.xId}`;
}

/** Parse a canonical three-segment Document occurrence address. */
export function parseDocumentInstanceRef(input: string): DocumentInstanceRef {
  if (typeof input !== 'string' || !input.startsWith(DOCUMENT_INSTANCE_REF_PREFIX)) {
    throw documentInstanceRefError(
      input,
      `ref must use the "${DOCUMENT_INSTANCE_REF_SCHEME}://" scheme.`,
    );
  }

  const segments = input.slice(DOCUMENT_INSTANCE_REF_PREFIX.length).split('/');
  if (segments.length !== 3) {
    throw documentInstanceRefError(input, 'ref must contain exactly three non-empty segments.');
  }

  const [unitInstanceId, projectionRole, xId] = segments;
  assertUriSafeSegment(unitInstanceId, 'unitInstanceId');
  assertCanonicalProjectionRole(projectionRole);
  assertUriSafeSegment(xId, 'xId');

  return { unitInstanceId, projectionRole, xId };
}

export interface DocumentEmbeddedUnitPlan {
  readonly kind: 'component-embed' | 'document-embed';
  readonly id: string;
  readonly unitFqn: UnitFqn;
  readonly scopeId: string;
}

/** Reusable definition plan containing only static assembly data. */
export interface DocumentUnitPlan {
  readonly id: string;
  readonly unitFqn: UnitFqn;
  readonly source: DocumentSourceDescriptor;
  readonly rootNodeId: string;
  readonly mode: DocumentMode;
  readonly presentationId: string;
  readonly rootScopeId: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly embeddedUnits: readonly DocumentEmbeddedUnitPlan[];
  readonly addressableInstances: readonly DocumentAddressDescriptor[];
}

export interface DocumentRuntimeDiagnostic {
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface DiagnosticResult {
  readonly diagnostics: readonly DocumentRuntimeDiagnostic[];
}

interface DocumentInstanceRegistryEntry<TTarget> {
  readonly ref: DocumentInstanceRef;
  readonly descriptor: DocumentAddressDescriptor;
  readonly target: TTarget;
}

interface DocumentInstanceRegisterInput<TTarget> {
  readonly ref: DocumentInstanceRef;
  readonly descriptor: DocumentAddressDescriptor;
  readonly target: TTarget;
}

interface DocumentInstanceRegisterResult {
  readonly ok: boolean;
  readonly ownerToken?: string;
  readonly diagnostics?: readonly DocumentRuntimeDiagnostic[];
}

interface DocumentInstanceResolveResult<TTarget> {
  readonly ok: boolean;
  readonly value?: DocumentInstanceRegistryEntry<TTarget>;
  readonly diagnostics?: readonly DocumentRuntimeDiagnostic[];
}

interface DocumentInstanceRegistryMutationResult {
  readonly ok: boolean;
  readonly diagnostics?: readonly DocumentRuntimeDiagnostic[];
}

/** Runtime-only target registry. No implementation or global authority is provided here. */
export interface DocumentInstanceRegistry {
  readonly register: <TTarget>(
    input: DocumentInstanceRegisterInput<TTarget>,
  ) => DocumentInstanceRegisterResult;
  readonly resolve: <TTarget>(
    ref: DocumentInstanceRef,
  ) => DocumentInstanceResolveResult<TTarget>;
  readonly list: (unitInstanceId?: string) => readonly DocumentInstanceRegistryEntry<unknown>[];
  readonly unregister: (input: Readonly<{
    ref: DocumentInstanceRef;
    ownerToken: string;
  }>) => DocumentInstanceRegistryMutationResult;
  readonly disposeNamespace: (
    unitInstanceId: string,
  ) => DocumentInstanceRegistryMutationResult;
}

interface DocumentOccurrenceChild {
  readonly dispose: () => void | Promise<void>;
}

export interface DocumentOccurrenceAssembly {
  readonly rootScopeId: string;
  readonly rootRuntime: DocumentScopeRuntime;
  readonly capsuleScopeRuntimes?: readonly DocumentScopeRuntime[];
  readonly componentScopeRuntimes?: readonly DocumentScopeRuntime[];
  readonly childOccurrences?: readonly DocumentOccurrenceChild[];
  readonly diagnostics?: readonly DocumentRuntimeDiagnostic[];
  readonly dispose: () => void | Promise<void>;
}

export interface DocumentOccurrenceRecord {
  readonly unitInstanceId: string;
  readonly lease: string;
  readonly parent?: DocumentOccurrenceParentLease;
  readonly rootScopeId: string;
  readonly addresses: readonly DocumentInstanceRef[];
  readonly registry: DocumentInstanceRegistry;
  readonly assembly: DocumentOccurrenceAssembly;
}

export interface DocumentOccurrenceParentLease {
  readonly unitInstanceId: string;
  readonly lease: string;
}

interface DocumentOccurrenceReserveResult extends DiagnosticResult {
  readonly lease?: string;
}

interface DocumentOccurrenceBeginCloseResult extends DiagnosticResult {
  readonly record?: DocumentOccurrenceRecord;
  readonly descendants?: readonly DocumentOccurrenceRecord[];
}

/** Owner-local occurrence authority injected through a runtime capability. */
export interface DocumentOccurrenceRegistryPort {
  readonly reserve: (input: Readonly<{
    unitInstanceId: string;
    parent?: DocumentOccurrenceParentLease;
  }>) => DocumentOccurrenceReserveResult;
  readonly get: (unitInstanceId: string) => DocumentOccurrenceRecord | undefined;
  readonly beginClose: (input: Readonly<{
    unitInstanceId: string;
    lease: string;
  }>) => DocumentOccurrenceBeginCloseResult;
  readonly commit: (input: Readonly<{
    unitInstanceId: string;
    lease: string;
    record: DocumentOccurrenceRecord;
  }>) => DiagnosticResult;
  readonly release: (input: Readonly<{
    unitInstanceId: string;
    lease: string;
  }>) => DiagnosticResult;
  readonly resolveHost: (ref: DocumentInstanceRef) => unknown;
  readonly list: () => readonly DocumentOccurrenceRecord[];
}

/** Call-local static data passed to Document runtime processors. */
export type DocumentRuntimeConfig = Readonly<Record<string, never>>;

/** Owner-only capability. Neither this factory nor its raw runtime is Scope-visible. */
export interface DocumentAuthoringHostPort<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
  TMutation = XnlAuthoringSerializableValue,
> {
  readonly factory: XnlAuthoringSessionFactoryPort<TDocument, TCommand, TMutation>;
  readonly runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>;
}

/** Scope-visible occurrence runtime. Authoring is always the exact mode facet. */
export interface DocumentScopeRuntime<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
> {
  readonly documentOccurrences: DocumentOccurrenceRegistryPort;
  readonly documentRuntime: DocumentRuntimePort;
  readonly documentInstances: DocumentInstanceRegistry;
  readonly authoring: XnlAuthoringScopeAuthoringFacet<TDocument, TCommand>;
}

/** Stable Document capabilities supplied by the runtime authority. */
export interface DocumentRuntimePort {
  readonly resolveDefinition: (definitionFqn: UnitFqn) => DocumentUnitPlan | undefined;
  readonly createRegistry: () => DocumentInstanceRegistry;
  readonly assembleOccurrence: (
    runtime: DocumentScopeRuntime,
    input: AssembleDocumentOccurrenceInput,
    config: DocumentRuntimeConfig,
  ) => DocumentOccurrenceAssembly | Promise<DocumentOccurrenceAssembly>;
}

export interface DocumentOccurrenceRuntime {
  readonly documentOccurrences: DocumentOccurrenceRegistryPort;
  readonly documentRuntime: DocumentRuntimePort;
  readonly documentAuthoring?: DocumentAuthoringHostPort;
}

export interface DocumentInstanceHandle {
  readonly unitInstanceId: string;
  readonly lease: string;
  readonly rootScopeId: string;
  readonly addresses: readonly DocumentInstanceRef[];
}

export interface OpenDocumentInput {
  readonly definitionFqn: UnitFqn;
  readonly context: DocumentOpenContext;
  readonly hostOccurrenceRef?: DocumentInstanceRef;
}

export interface CloseDocumentInput {
  readonly unitInstanceId: string;
  readonly lease: string;
}

export interface AssembleDocumentOccurrenceInput {
  readonly plan: DocumentUnitPlan;
  readonly effectiveSource: DocumentSourceDescriptor;
  readonly context: DocumentOpenContext;
  readonly addresses: readonly DocumentInstanceRef[];
}
