import {
  formatDocumentInstanceRef,
  isUnitFqn,
  parseDocumentInstanceRef,
  type DocumentInstanceRef,
  type SerializableRecord,
  type SerializableValue,
  type XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import { deriveXnlRichDocumentOccurrenceXId } from 'dg-cell-mvi-halfcode-logic';
import { snapshotXnlRichDocumentEmbeddedSerializableRecord } from './embeddedPresenterCapability';
import type {
  XnlRichDocumentHalfcodeNodeViewDiagnostic,
  XnlRichDocumentHalfcodeNodeViewOccurrence,
  XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyConfig,
  XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyInput,
  XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyResult,
  XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyRuntime,
} from './types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

export function assembleXnlRichDocumentHalfcodeNodeViewOccurrence(
  runtime: XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyRuntime,
  input: XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyInput,
  config: XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyConfig,
): XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyResult {
  const runtimeResult = exactSerializableRecord(runtime, [], 'NodeView occurrence assembly runtime');
  if (!runtimeResult.ok) return rejected(runtimeResult.message);
  const configResult = exactSerializableRecord(config, [], 'NodeView occurrence assembly config');
  if (!configResult.ok) return rejected(configResult.message);
  const inputResult = exactSerializableRecord(
    input,
    ['nodeId', 'unitInstanceId', 'role', 'roleCardinality', 'descriptor'],
    'NodeView occurrence assembly input',
  );
  if (!inputResult.ok) return rejected(inputResult.message);
  const descriptorResult = exactSerializableRecord(
    inputResult.value.descriptor,
    ['scopeId'],
    'NodeView occurrence descriptor facts',
    ['unitFqn', 'metadata'],
  );
  if (!descriptorResult.ok) return rejected(descriptorResult.message);

  const { nodeId, unitInstanceId, role, roleCardinality } = inputResult.value;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return rejected('NodeView occurrence requires an established persistent Domain #id.');
  }
  if (typeof unitInstanceId !== 'string' || unitInstanceId.length === 0) {
    return rejected('NodeView occurrence unitInstanceId must be non-empty.');
  }
  if (typeof role !== 'string' || role.length === 0) {
    return rejected('NodeView occurrence role must be non-empty.');
  }
  if (roleCardinality !== 'single' && roleCardinality !== 'multiple') {
    return rejected('NodeView occurrence role cardinality must be single or multiple.');
  }
  const { scopeId, unitFqn, metadata } = descriptorResult.value;
  if (typeof scopeId !== 'string' || scopeId.length === 0) {
    return rejected('NodeView occurrence scopeId must be non-empty.');
  }
  if (unitFqn !== undefined && (typeof unitFqn !== 'string' || !isUnitFqn(unitFqn))) {
    return rejected('NodeView occurrence unitFqn is invalid.');
  }
  if (metadata !== undefined && !isDocumentSerializableRecord(metadata)) {
    return rejected('NodeView occurrence metadata must be a serializable record.');
  }

  const identity = deriveXnlRichDocumentOccurrenceXId(EMPTY, {
    nodeId: nodeId as XnlRichDocumentDomainNodeId,
    role,
    roleCardinality,
  }, EMPTY);
  if (identity.status !== 'derived') {
    return rejected(identity.diagnostics.map((item) => item.message).join('; '));
  }

  let canonicalRef: Readonly<DocumentInstanceRef>;
  try {
    canonicalRef = Object.freeze(parseDocumentInstanceRef(formatDocumentInstanceRef({
      unitInstanceId,
      projectionRole: identity.role,
      xId: identity.xId,
    })));
  } catch (error) {
    return rejected(errorMessage(error));
  }
  const instanceRef: XnlRichDocumentHalfcodeNodeViewOccurrence['instanceRef'] = Object.freeze({
    ...canonicalRef,
    xId: identity.xId,
  });
  const descriptor: XnlRichDocumentHalfcodeNodeViewOccurrence['descriptor'] = Object.freeze({
    projectionRole: identity.role,
    xId: identity.xId,
    documentNodeId: identity.nodeId,
    scopeId,
    ...(typeof unitFqn === 'string' ? { unitFqn } : {}),
    ...(metadata === undefined ? {} : { metadata }),
  });
  const occurrence: XnlRichDocumentHalfcodeNodeViewOccurrence = Object.freeze({
    nodeId: identity.nodeId,
    role: identity.role,
    roleCardinality,
    instanceRef,
    descriptor,
  });
  return Object.freeze({
    status: 'assembled' as const,
    occurrence,
    diagnostics: Object.freeze([]) as readonly [],
  });
}

export function verifyXnlRichDocumentHalfcodeNodeViewOccurrence(
  value: unknown,
): XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyResult {
  const occurrenceResult = exactSerializableRecord(
    value,
    ['nodeId', 'role', 'roleCardinality', 'instanceRef', 'descriptor'],
    'Halfcode NodeView occurrence',
  );
  if (!occurrenceResult.ok) return rejected(occurrenceResult.message);
  const refResult = exactSerializableRecord(
    occurrenceResult.value.instanceRef,
    ['unitInstanceId', 'projectionRole', 'xId'],
    'Halfcode NodeView occurrence instanceRef',
  );
  if (!refResult.ok) return rejected(refResult.message);
  const descriptorResult = exactSerializableRecord(
    occurrenceResult.value.descriptor,
    ['projectionRole', 'xId', 'documentNodeId', 'scopeId'],
    'Halfcode NodeView occurrence descriptor',
    ['unitFqn', 'metadata'],
  );
  if (!descriptorResult.ok) return rejected(descriptorResult.message);

  const assembled = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
    nodeId: occurrenceResult.value.nodeId as XnlRichDocumentDomainNodeId,
    unitInstanceId: refResult.value.unitInstanceId as string,
    role: occurrenceResult.value.role as string,
    roleCardinality: occurrenceResult.value.roleCardinality as 'single' | 'multiple',
    descriptor: {
      scopeId: descriptorResult.value.scopeId as string,
      ...(descriptorResult.value.unitFqn === undefined
        ? {}
        : { unitFqn: descriptorResult.value.unitFqn as never }),
      ...(descriptorResult.value.metadata === undefined
        ? {}
        : { metadata: descriptorResult.value.metadata as never }),
    },
  }, EMPTY);
  if (assembled.status !== 'assembled') return assembled;
  const canonical = assembled.occurrence;
  if (
    refResult.value.projectionRole !== canonical.instanceRef.projectionRole
    || refResult.value.xId !== canonical.instanceRef.xId
    || descriptorResult.value.projectionRole !== canonical.descriptor.projectionRole
    || descriptorResult.value.xId !== canonical.descriptor.xId
    || descriptorResult.value.documentNodeId !== canonical.descriptor.documentNodeId
  ) {
    return rejected('Halfcode NodeView occurrence identity, instanceRef and descriptor do not match.');
  }
  return assembled;
}

interface RecordResult {
  readonly ok: true;
  readonly value: Readonly<Record<string, unknown>>;
}

interface RecordFailure {
  readonly ok: false;
  readonly message: string;
}

function exactSerializableRecord(
  value: unknown,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): RecordResult | RecordFailure {
  const snapshot = snapshotXnlRichDocumentEmbeddedSerializableRecord(value, label);
  if (!snapshot.ok) return snapshot;
  const keys = Object.keys(snapshot.value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !keys.includes(key))
    || keys.some((key) => !allowed.has(key))
  ) {
    return {
      ok: false,
      message: `${label} must contain ${requiredKeys.join(', ')} and only supported optional fields.`,
    };
  }
  return { ok: true, value: snapshot.value };
}

function isDocumentSerializableRecord(value: unknown): value is SerializableRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => isDocumentSerializableValue(item));
}

function isDocumentSerializableValue(value: unknown): value is SerializableValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isDocumentSerializableValue(item));
  }
  return isDocumentSerializableRecord(value);
}

function rejected(message: string): XnlRichDocumentHalfcodeNodeViewOccurrenceAssemblyResult {
  const item: XnlRichDocumentHalfcodeNodeViewDiagnostic = Object.freeze({
    severity: 'error',
    code: 'INVALID_HALFCODE_NODEVIEW_OCCURRENCE',
    message,
  });
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: Object.freeze([item]) as readonly [XnlRichDocumentHalfcodeNodeViewDiagnostic],
  });
}

function errorMessage(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
      if (descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'string') {
        return descriptor.value;
      }
    } catch {
      return 'NodeView occurrence address could not be inspected safely.';
    }
  }
  return 'NodeView occurrence address is invalid.';
}
