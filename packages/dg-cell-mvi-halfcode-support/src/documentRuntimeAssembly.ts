import {
  formatDocumentInstanceRef,
  parseDocumentInstanceRef,
  type AssembleDocumentOccurrenceInput,
  type CloseDocumentInput,
  type DiagnosticResult,
  type DocumentAuthoringHostPort,
  type DocumentInstanceHandle,
  type DocumentInstanceRef,
  type DocumentInstanceRegistry,
  type DocumentOccurrenceAssembly,
  type DocumentOccurrenceParentLease,
  type DocumentOccurrenceRecord,
  type DocumentOccurrenceRegistryPort,
  type DocumentOccurrenceRuntime,
  type DocumentScopeRuntime,
  type DocumentRuntimeConfig,
  type DocumentRuntimeDiagnostic,
  type DocumentRuntimePort,
  type DocumentUnitPlan,
  type RuntimeScopeAssembly,
  type OpenDocumentInput,
  type XnlAuthoringControlPort,
  type XnlAuthoringOpenedSession,
  type XnlAuthoringProposalPort,
  type XnlAuthoringSerializableValue,
  XNL_AUTHORING_OWNERSHIP_FIELD_NAMES,
  validateXnlAuthoringScopeAuthoringFacet,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringViewScopeFacet,
} from './xnl-authoring/scopeFacet';

const DOCUMENT_DEFINITION_NOT_FOUND = 'HALFCODE_DOCUMENT_DEFINITION_NOT_FOUND';
const DOCUMENT_OPEN_CONTEXT_INVALID = 'HALFCODE_DOCUMENT_OPEN_CONTEXT_INVALID';
const DOCUMENT_SOURCE_OVERRIDE_INVALID = 'HALFCODE_DOCUMENT_SOURCE_OVERRIDE_INVALID';
const DOCUMENT_OCCURRENCE_DUPLICATE = 'HALFCODE_DOCUMENT_OCCURRENCE_DUPLICATE';
const DOCUMENT_OCCURRENCE_COMMIT_STALE = 'HALFCODE_DOCUMENT_OCCURRENCE_COMMIT_STALE';
const DOCUMENT_OCCURRENCE_COMMIT_MISMATCH = 'HALFCODE_DOCUMENT_OCCURRENCE_COMMIT_MISMATCH';
const DOCUMENT_OCCURRENCE_RELEASE_STALE = 'HALFCODE_DOCUMENT_OCCURRENCE_RELEASE_STALE';
const DOCUMENT_OCCURRENCE_CLOSE_STALE = 'HALFCODE_DOCUMENT_OCCURRENCE_CLOSE_STALE';
const DOCUMENT_OCCURRENCE_HOST_NOT_FOUND = 'HALFCODE_DOCUMENT_OCCURRENCE_HOST_NOT_FOUND';
const DOCUMENT_OCCURRENCE_HOST_CAPABILITY_MISMATCH =
  'HALFCODE_DOCUMENT_OCCURRENCE_HOST_CAPABILITY_MISMATCH';
const DOCUMENT_OCCURRENCE_SCOPE_CAPABILITY_MISMATCH =
  'HALFCODE_DOCUMENT_OCCURRENCE_SCOPE_CAPABILITY_MISMATCH';
const DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED = 'HALFCODE_DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED';
const DOCUMENT_OCCURRENCE_ROOT_SCOPE_MISMATCH =
  'HALFCODE_DOCUMENT_OCCURRENCE_ROOT_SCOPE_MISMATCH';
const DOCUMENT_OCCURRENCE_DISPOSE_FAILED = 'HALFCODE_DOCUMENT_OCCURRENCE_DISPOSE_FAILED';
const DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH =
  'HALFCODE_DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH';
const DOCUMENT_AUTHORING_SESSION_MISMATCH = 'HALFCODE_DOCUMENT_AUTHORING_SESSION_MISMATCH';
const DOCUMENT_AUTHORING_SCOPE_LEAK = 'HALFCODE_DOCUMENT_AUTHORING_SCOPE_LEAK';
const DOCUMENT_DATA_BOUNDARY_INVALID = 'HALFCODE_DOCUMENT_DATA_BOUNDARY_INVALID';

const OPENED_SESSION_KEYS = new Set(['proposal', 'control']);
const OPEN_DOCUMENT_INPUT_KEYS = new Set(['definitionFqn', 'context', 'hostOccurrenceRef']);
const DOCUMENT_OPEN_CONTEXT_KEYS = new Set([
  'unitInstanceId',
  'externalSourceRef',
  'revision',
  'mode',
  'parameters',
]);
const DOCUMENT_INSTANCE_REF_KEYS = new Set(['unitInstanceId', 'projectionRole', 'xId']);
const DOCUMENT_PLAN_KEYS = new Set([
  'id',
  'unitFqn',
  'source',
  'rootNodeId',
  'mode',
  'presentationId',
  'rootScopeId',
  'parameters',
  'embeddedUnits',
  'addressableInstances',
]);
const DOCUMENT_INLINE_SOURCE_KEYS = new Set(['kind', 'unitSourceRef', 'region']);
const DOCUMENT_EXTERNAL_SOURCE_KEYS = new Set(['kind', 'ref']);
const DOCUMENT_EMBEDDED_UNIT_KEYS = new Set(['kind', 'id', 'unitFqn', 'scopeId']);
const DOCUMENT_ADDRESS_DESCRIPTOR_KEYS = new Set([
  'projectionRole',
  'xId',
  'documentNodeId',
  'unitFqn',
  'scopeId',
  'metadata',
]);
const ASSEMBLY_KEYS = new Set([
  'rootScopeId',
  'rootRuntime',
  'capsuleScopeRuntimes',
  'componentScopeRuntimes',
  'childOccurrences',
  'diagnostics',
  'dispose',
]);
const AUTHORING_LEAK_KEYS = new Set([
  'factory',
  'control',
  'session',
  'writer',
  'persistence',
  'submit',
  'proposal',
  'documentAuthoring',
  'retryPersistence',
  'reloadDiscardingAccepted',
]);
const DATA_OWNERSHIP_KEYS = new Set([
  ...XNL_AUTHORING_OWNERSHIP_FIELD_NAMES,
  ...AUTHORING_LEAK_KEYS,
  'documentOccurrences',
  'documentRuntime',
  'documentInstances',
  'documentAuthoring',
  'authority',
]);

function diagnostic(code: string, message: string): DocumentRuntimeDiagnostic {
  return Object.freeze({ severity: 'error' as const, code, message });
}

function result(diagnostics: readonly DocumentRuntimeDiagnostic[] = []): DiagnosticResult {
  return { diagnostics };
}

function hasErrors(diagnostics: readonly DocumentRuntimeDiagnostic[] | undefined): boolean {
  return diagnostics?.some((item) => item.severity === 'error') ?? false;
}

function cloneRef(ref: DocumentInstanceRef): DocumentInstanceRef {
  return Object.freeze({
    unitInstanceId: ref.unitInstanceId,
    projectionRole: ref.projectionRole,
    xId: ref.xId,
  });
}

function readonlyRefs(refs: readonly DocumentInstanceRef[]): readonly DocumentInstanceRef[] {
  return Object.freeze(refs.map((ref) => Object.freeze(cloneRef(ref))));
}

function ownData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function protocolData(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  let current: object | null = value;
  try {
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return 'value' in descriptor ? descriptor.value : undefined;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function captureMethod<TMethod extends (...args: never[]) => unknown>(
  value: unknown,
  key: string,
): TMethod | undefined {
  const method = protocolData(value, key);
  return typeof method === 'function' ? method.bind(value) as TMethod : undefined;
}

function hasExactOwnKeys(value: unknown, expected: ReadonlySet<string>): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const names = Object.getOwnPropertyNames(value);
    return Object.getOwnPropertySymbols(value).length === 0 &&
      names.length === expected.size &&
      names.every((name) => expected.has(name));
  } catch {
    return false;
  }
}

function dataBoundaryIssue(
  issues: DocumentRuntimeDiagnostic[],
  path: string,
  message: string,
): void {
  issues.push(diagnostic(DOCUMENT_DATA_BOUNDARY_INVALID, `${path}: ${message}`));
}

function dataBoundaryResult(issues: readonly DocumentRuntimeDiagnostic[]): DiagnosticResult {
  return result(issues.length === 0
    ? [diagnostic(DOCUMENT_DATA_BOUNDARY_INVALID, 'Document data boundary validation failed.')]
    : issues);
}

function dataOwnNames(
  value: object,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): readonly string[] {
  try {
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length !== 0) {
      dataBoundaryIssue(issues, path, 'serializable Document facts must not contain symbol keys.');
    }
    return Object.getOwnPropertyNames(value);
  } catch {
    dataBoundaryIssue(issues, path, 'Document fact property names could not be inspected safely.');
    return [];
  }
}

function dataDescriptor(
  value: object,
  key: string,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): PropertyDescriptor | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      dataBoundaryIssue(issues, path, 'Document fact property descriptor is missing.');
      return undefined;
    }
    if (!('value' in descriptor)) {
      dataBoundaryIssue(issues, path, 'Document facts must use data properties, not accessors.');
      return undefined;
    }
    return descriptor;
  } catch {
    dataBoundaryIssue(issues, path, 'Document fact property descriptor could not be inspected safely.');
    return undefined;
  }
}

function isPlainDataRecord(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    dataBoundaryIssue(issues, path, `${label} must be a plain object.`);
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) return true;
    dataBoundaryIssue(issues, path, `${label} must be plain data, not a class, runtime, registry, or authority object.`);
    return false;
  } catch {
    dataBoundaryIssue(issues, path, `${label} prototype could not be inspected safely.`);
    return false;
  }
}

function exactDataRecord(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  required: readonly string[],
  label: string,
  issues: DocumentRuntimeDiagnostic[],
): Record<string, unknown> | undefined {
  if (!isPlainDataRecord(value, path, issues, label)) return undefined;
  const names = dataOwnNames(value, path, issues);
  for (const name of names) {
    if (DATA_OWNERSHIP_KEYS.has(name)) {
      dataBoundaryIssue(issues, `${path}.${name}`, 'runtime capability, registry, writer, or authority is not Document fact data.');
    }
    if (!allowed.has(name)) {
      dataBoundaryIssue(issues, `${path}.${name}`, `${label} does not allow field "${name}".`);
    }
    dataDescriptor(value, name, `${path}.${name}`, issues);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      dataBoundaryIssue(issues, `${path}.${key}`, `${label} requires field "${key}".`);
    }
  }
  return value;
}

function dataValue(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): unknown {
  const descriptor = dataDescriptor(record, key, `${path}.${key}`, issues);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function optionalDataValue(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return dataValue(record, key, path, issues);
}

function stringData(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): string {
  if (typeof value !== 'string' || value === '') {
    dataBoundaryIssue(issues, path, `${label} must be a non-empty string.`);
    return '';
  }
  return value;
}

function optionalStringData(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): string | undefined {
  if (value === undefined) {
    dataBoundaryIssue(issues, path, `${label} must be absent or a string; explicit undefined is not serializable.`);
    return undefined;
  }
  return stringData(value, path, issues, label);
}

function cloneSerializableData(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  seen = new Set<object>(),
): XnlAuthoringSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    dataBoundaryIssue(issues, path, 'serializable Document numbers must be finite.');
    return undefined;
  }
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    dataBoundaryIssue(issues, path, `unsupported non-serializable value type: ${typeof value}.`);
    return undefined;
  }
  if (Array.isArray(value)) {
    try {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        dataBoundaryIssue(issues, path, 'serializable Document arrays must use the built-in Array prototype.');
      }
    } catch {
      dataBoundaryIssue(issues, path, 'Document array prototype could not be inspected safely.');
    }
    if (seen.has(value)) {
      dataBoundaryIssue(issues, path, 'serializable Document facts must not contain cycles.');
      return undefined;
    }
    seen.add(value);
    const names = dataOwnNames(value, path, issues);
    for (const name of names) {
      if (name !== 'length' && !/^(0|[1-9]\d*)$/.test(name)) {
        dataBoundaryIssue(issues, `${path}.${name}`, 'serializable Document arrays must not contain named properties.');
      }
    }
    const clone: XnlAuthoringSerializableValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, String(index))) {
        dataBoundaryIssue(issues, `${path}[${index}]`, 'serializable Document arrays must not contain sparse entries.');
        continue;
      }
      const descriptor = dataDescriptor(value, String(index), `${path}[${index}]`, issues);
      if (descriptor && 'value' in descriptor) {
        const child = cloneSerializableData(descriptor.value, `${path}[${index}]`, issues, seen);
        if (child !== undefined) clone.push(child);
      }
    }
    seen.delete(value);
    return Object.freeze(clone);
  }
  if (!isPlainDataRecord(value, path, issues, 'Serializable Document value')) return undefined;
  if (seen.has(value)) {
    dataBoundaryIssue(issues, path, 'serializable Document facts must not contain cycles.');
    return undefined;
  }
  seen.add(value);
  const clone: Record<string, XnlAuthoringSerializableValue> = {};
  for (const key of dataOwnNames(value, path, issues)) {
    if (DATA_OWNERSHIP_KEYS.has(key)) {
      dataBoundaryIssue(issues, `${path}.${key}`, 'runtime capability, registry, writer, or authority is not Document fact data.');
    }
    const descriptor = dataDescriptor(value, key, `${path}.${key}`, issues);
    if (descriptor && 'value' in descriptor) {
      const child = cloneSerializableData(descriptor.value, `${path}.${key}`, issues, seen);
      if (child !== undefined) clone[key] = child;
    }
  }
  seen.delete(value);
  return Object.freeze(clone);
}

function cloneSerializableRecord(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): Readonly<Record<string, XnlAuthoringSerializableValue>> {
  if (!isPlainDataRecord(value, path, issues, label)) return Object.freeze({});
  return cloneSerializableData(value, path, issues) as Readonly<Record<string, XnlAuthoringSerializableValue>>;
}

function cloneStringRecord(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): Readonly<Record<string, string>> {
  if (!isPlainDataRecord(value, path, issues, label)) return Object.freeze({});
  const clone: Record<string, string> = {};
  for (const key of dataOwnNames(value, path, issues)) {
    if (DATA_OWNERSHIP_KEYS.has(key)) {
      dataBoundaryIssue(issues, `${path}.${key}`, 'runtime capability, registry, writer, or authority is not Document fact data.');
    }
    const child = dataValue(value, key, path, issues);
    if (typeof child === 'string') {
      clone[key] = child;
    } else {
      dataBoundaryIssue(issues, `${path}.${key}`, `${label} values must be strings.`);
    }
  }
  return Object.freeze(clone);
}

function dataArrayValues(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    dataBoundaryIssue(issues, path, `${label} must be an array.`);
    return [];
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      dataBoundaryIssue(issues, path, `${label} must use the built-in Array prototype.`);
    }
  } catch {
    dataBoundaryIssue(issues, path, `${label} prototype could not be inspected safely.`);
  }
  for (const name of dataOwnNames(value, path, issues)) {
    if (name !== 'length' && !/^(0|[1-9]\d*)$/.test(name)) {
      dataBoundaryIssue(issues, `${path}.${name}`, `${label} must not contain named properties.`);
    }
  }
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, String(index))) {
      dataBoundaryIssue(issues, `${path}[${index}]`, `${label} must not contain sparse entries.`);
      continue;
    }
    const descriptor = dataDescriptor(value, String(index), `${path}[${index}]`, issues);
    if (descriptor && 'value' in descriptor) result.push(descriptor.value);
  }
  return result;
}

function snapshotDocumentInstanceRef(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): DocumentInstanceRef {
  const record = exactDataRecord(
    value,
    path,
    DOCUMENT_INSTANCE_REF_KEYS,
    ['unitInstanceId', 'projectionRole', 'xId'],
    'DocumentInstanceRef',
    issues,
  );
  return Object.freeze({
    unitInstanceId: stringData(record ? dataValue(record, 'unitInstanceId', path, issues) : undefined, `${path}.unitInstanceId`, issues, 'unitInstanceId'),
    projectionRole: stringData(record ? dataValue(record, 'projectionRole', path, issues) : undefined, `${path}.projectionRole`, issues, 'projectionRole'),
    xId: stringData(record ? dataValue(record, 'xId', path, issues) : undefined, `${path}.xId`, issues, 'xId'),
  });
}

function snapshotDocumentOpenContext(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): OpenDocumentInput['context'] {
  const record = exactDataRecord(
    value,
    path,
    DOCUMENT_OPEN_CONTEXT_KEYS,
    ['unitInstanceId', 'mode'],
    'DocumentOpenContext',
    issues,
  );
  const mode = record ? dataValue(record, 'mode', path, issues) : undefined;
  if (mode !== 'view' && mode !== 'edit') {
    dataBoundaryIssue(issues, `${path}.mode`, 'DocumentOpenContext.mode must be view or edit.');
  }
  const externalSourceRef = record && Object.prototype.hasOwnProperty.call(record, 'externalSourceRef')
    ? optionalStringData(
      dataValue(record, 'externalSourceRef', path, issues),
      `${path}.externalSourceRef`,
      issues,
      'externalSourceRef',
    ) as OpenDocumentInput['context']['externalSourceRef']
    : undefined;
  const revision = record && Object.prototype.hasOwnProperty.call(record, 'revision')
    ? optionalStringData(dataValue(record, 'revision', path, issues), `${path}.revision`, issues, 'revision')
    : undefined;
  const parameters = record && Object.prototype.hasOwnProperty.call(record, 'parameters')
    ? cloneSerializableRecord(
      dataValue(record, 'parameters', path, issues),
      `${path}.parameters`,
      issues,
      'DocumentOpenContext.parameters',
    ) as OpenDocumentInput['context']['parameters']
    : undefined;
  return Object.freeze({
    unitInstanceId: stringData(record ? dataValue(record, 'unitInstanceId', path, issues) : undefined, `${path}.unitInstanceId`, issues, 'unitInstanceId'),
    mode: mode === 'view' || mode === 'edit' ? mode : 'view',
    ...(externalSourceRef === undefined ? {} : { externalSourceRef }),
    ...(revision === undefined ? {} : { revision }),
    ...(parameters === undefined ? {} : { parameters }),
  });
}

function snapshotOpenDocumentInput(value: unknown): OpenDocumentInput | DiagnosticResult {
  const issues: DocumentRuntimeDiagnostic[] = [];
  const record = exactDataRecord(
    value,
    '$.input',
    OPEN_DOCUMENT_INPUT_KEYS,
    ['definitionFqn', 'context'],
    'OpenDocumentInput',
    issues,
  );
  const context = snapshotDocumentOpenContext(
    record ? dataValue(record, 'context', '$.input', issues) : undefined,
    '$.input.context',
    issues,
  );
  const hostOccurrenceRef = record && Object.prototype.hasOwnProperty.call(record, 'hostOccurrenceRef')
    ? snapshotDocumentInstanceRef(dataValue(record, 'hostOccurrenceRef', '$.input', issues), '$.input.hostOccurrenceRef', issues)
    : undefined;
  const snapshot = Object.freeze({
    definitionFqn: stringData(record ? dataValue(record, 'definitionFqn', '$.input', issues) : undefined, '$.input.definitionFqn', issues, 'definitionFqn') as OpenDocumentInput['definitionFqn'],
    context,
    ...(hostOccurrenceRef === undefined ? {} : { hostOccurrenceRef }),
  });
  return issues.length === 0 ? snapshot : dataBoundaryResult(issues);
}

function snapshotDocumentRuntimeConfig(value: unknown): DocumentRuntimeConfig | DiagnosticResult {
  const issues: DocumentRuntimeDiagnostic[] = [];
  exactDataRecord(value, '$.config', new Set<string>(), [], 'DocumentRuntimeConfig', issues);
  return issues.length === 0 ? Object.freeze({}) : dataBoundaryResult(issues);
}

function snapshotDocumentSource(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): DocumentUnitPlan['source'] {
  const base = isPlainDataRecord(value, path, issues, 'Document source') ? value : undefined;
  const kind = base ? dataValue(base, 'kind', path, issues) : undefined;
  if (kind === 'inline') {
    const record = exactDataRecord(value, path, DOCUMENT_INLINE_SOURCE_KEYS, ['kind', 'unitSourceRef', 'region'], 'Document inline source', issues);
    const region = record ? dataValue(record, 'region', path, issues) : undefined;
    if (region !== 'body') dataBoundaryIssue(issues, `${path}.region`, 'Document inline source region must be body.');
    return Object.freeze({
      kind: 'inline',
      unitSourceRef: stringData(
        record ? dataValue(record, 'unitSourceRef', path, issues) : undefined,
        `${path}.unitSourceRef`,
        issues,
        'unitSourceRef',
      ) as Extract<DocumentUnitPlan['source'], { kind: 'inline' }>['unitSourceRef'],
      region: 'body',
    });
  }
  if (kind === 'external') {
    const record = exactDataRecord(value, path, DOCUMENT_EXTERNAL_SOURCE_KEYS, ['kind', 'ref'], 'Document external source', issues);
    return Object.freeze({
      kind: 'external',
      ref: stringData(
        record ? dataValue(record, 'ref', path, issues) : undefined,
        `${path}.ref`,
        issues,
        'ref',
      ) as Extract<DocumentUnitPlan['source'], { kind: 'external' }>['ref'],
    });
  }
  dataBoundaryIssue(issues, `${path}.kind`, 'Document source kind must be inline or external.');
  return Object.freeze({ kind: 'external', ref: '' as Extract<DocumentUnitPlan['source'], { kind: 'external' }>['ref'] });
}

function snapshotEmbeddedUnits(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): readonly DocumentUnitPlan['embeddedUnits'][number][] {
  const cloned = dataArrayValues(value, path, issues, 'Document embeddedUnits').map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const record = exactDataRecord(
      item,
      itemPath,
      DOCUMENT_EMBEDDED_UNIT_KEYS,
      ['kind', 'id', 'unitFqn', 'scopeId'],
      'Document embedded unit',
      issues,
    );
    const kind = record ? dataValue(record, 'kind', itemPath, issues) : undefined;
    if (kind !== 'component-embed' && kind !== 'document-embed') {
      dataBoundaryIssue(issues, `${itemPath}.kind`, 'Document embedded unit kind must be component-embed or document-embed.');
    }
    return Object.freeze({
      kind: kind === 'document-embed' ? 'document-embed' as const : 'component-embed' as const,
      id: stringData(record ? dataValue(record, 'id', itemPath, issues) : undefined, `${itemPath}.id`, issues, 'id'),
      unitFqn: stringData(record ? dataValue(record, 'unitFqn', itemPath, issues) : undefined, `${itemPath}.unitFqn`, issues, 'unitFqn') as DocumentUnitPlan['embeddedUnits'][number]['unitFqn'],
      scopeId: stringData(record ? dataValue(record, 'scopeId', itemPath, issues) : undefined, `${itemPath}.scopeId`, issues, 'scopeId'),
    });
  });
  return Object.freeze(cloned);
}

function snapshotAddressDescriptors(
  value: unknown,
  path: string,
  issues: DocumentRuntimeDiagnostic[],
): readonly DocumentUnitPlan['addressableInstances'][number][] {
  const cloned = dataArrayValues(value, path, issues, 'Document addressableInstances').map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const record = exactDataRecord(
      item,
      itemPath,
      DOCUMENT_ADDRESS_DESCRIPTOR_KEYS,
      ['projectionRole', 'xId', 'scopeId'],
      'Document address descriptor',
      issues,
    );
    const metadata = record && Object.prototype.hasOwnProperty.call(record, 'metadata')
      ? cloneSerializableRecord(
        dataValue(record, 'metadata', itemPath, issues),
        `${itemPath}.metadata`,
        issues,
        'Document address metadata',
      ) as DocumentUnitPlan['addressableInstances'][number]['metadata']
      : undefined;
    const documentNodeId = record && Object.prototype.hasOwnProperty.call(record, 'documentNodeId')
      ? optionalStringData(dataValue(record, 'documentNodeId', itemPath, issues), `${itemPath}.documentNodeId`, issues, 'documentNodeId')
      : undefined;
    const unitFqn = record && Object.prototype.hasOwnProperty.call(record, 'unitFqn')
      ? optionalStringData(
        dataValue(record, 'unitFqn', itemPath, issues),
        `${itemPath}.unitFqn`,
        issues,
        'unitFqn',
      ) as DocumentUnitPlan['addressableInstances'][number]['unitFqn']
      : undefined;
    return Object.freeze({
      projectionRole: stringData(record ? dataValue(record, 'projectionRole', itemPath, issues) : undefined, `${itemPath}.projectionRole`, issues, 'projectionRole'),
      xId: stringData(record ? dataValue(record, 'xId', itemPath, issues) : undefined, `${itemPath}.xId`, issues, 'xId'),
      ...(documentNodeId === undefined ? {} : { documentNodeId }),
      ...(unitFqn === undefined ? {} : { unitFqn }),
      scopeId: stringData(record ? dataValue(record, 'scopeId', itemPath, issues) : undefined, `${itemPath}.scopeId`, issues, 'scopeId'),
      ...(metadata === undefined ? {} : { metadata }),
    });
  });
  return Object.freeze(cloned);
}

function snapshotDocumentUnitPlan(value: unknown): DocumentUnitPlan | DiagnosticResult {
  const issues: DocumentRuntimeDiagnostic[] = [];
  const record = exactDataRecord(
    value,
    '$.plan',
    DOCUMENT_PLAN_KEYS,
    ['id', 'unitFqn', 'source', 'rootNodeId', 'mode', 'presentationId', 'rootScopeId', 'embeddedUnits', 'addressableInstances'],
    'DocumentUnitPlan',
    issues,
  );
  const mode = record ? dataValue(record, 'mode', '$.plan', issues) : undefined;
  if (mode !== 'view' && mode !== 'edit') {
    dataBoundaryIssue(issues, '$.plan.mode', 'DocumentUnitPlan.mode must be view or edit.');
  }
  const parameters = record && Object.prototype.hasOwnProperty.call(record, 'parameters')
    ? cloneStringRecord(dataValue(record, 'parameters', '$.plan', issues), '$.plan.parameters', issues, 'DocumentUnitPlan.parameters')
    : undefined;
  const snapshot = Object.freeze({
    id: stringData(record ? dataValue(record, 'id', '$.plan', issues) : undefined, '$.plan.id', issues, 'id'),
    unitFqn: stringData(record ? dataValue(record, 'unitFqn', '$.plan', issues) : undefined, '$.plan.unitFqn', issues, 'unitFqn') as DocumentUnitPlan['unitFqn'],
    source: snapshotDocumentSource(record ? dataValue(record, 'source', '$.plan', issues) : undefined, '$.plan.source', issues),
    rootNodeId: stringData(record ? dataValue(record, 'rootNodeId', '$.plan', issues) : undefined, '$.plan.rootNodeId', issues, 'rootNodeId'),
    mode: mode === 'edit' ? 'edit' as const : 'view' as const,
    presentationId: stringData(record ? dataValue(record, 'presentationId', '$.plan', issues) : undefined, '$.plan.presentationId', issues, 'presentationId'),
    rootScopeId: stringData(record ? dataValue(record, 'rootScopeId', '$.plan', issues) : undefined, '$.plan.rootScopeId', issues, 'rootScopeId'),
    ...(parameters === undefined ? {} : { parameters }),
    embeddedUnits: snapshotEmbeddedUnits(record ? dataValue(record, 'embeddedUnits', '$.plan', issues) : undefined, '$.plan.embeddedUnits', issues),
    addressableInstances: snapshotAddressDescriptors(record ? dataValue(record, 'addressableInstances', '$.plan', issues) : undefined, '$.plan.addressableInstances', issues),
  }) satisfies DocumentUnitPlan;
  return issues.length === 0 ? snapshot : dataBoundaryResult(issues);
}

interface CapturedOccurrenceRegistryPort {
  readonly port: DocumentOccurrenceRegistryPort;
  readonly reserve: DocumentOccurrenceRegistryPort['reserve'];
  readonly get: DocumentOccurrenceRegistryPort['get'];
  readonly beginClose: DocumentOccurrenceRegistryPort['beginClose'];
  readonly commit: DocumentOccurrenceRegistryPort['commit'];
  readonly release: DocumentOccurrenceRegistryPort['release'];
  readonly resolveHost: DocumentOccurrenceRegistryPort['resolveHost'];
  readonly list: DocumentOccurrenceRegistryPort['list'];
}

interface CapturedDocumentRuntimePort {
  readonly port: DocumentRuntimePort;
  readonly resolveDefinition: DocumentRuntimePort['resolveDefinition'];
  readonly createRegistry: DocumentRuntimePort['createRegistry'];
  readonly assembleOccurrence: DocumentRuntimePort['assembleOccurrence'];
}

interface CapturedDocumentRuntimeCapabilities {
  readonly occurrences: CapturedOccurrenceRegistryPort;
  readonly runtime: CapturedDocumentRuntimePort;
}

function captureOccurrenceRegistryPort(value: unknown): CapturedOccurrenceRegistryPort | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const reserve = captureMethod<DocumentOccurrenceRegistryPort['reserve']>(value, 'reserve');
  const get = captureMethod<DocumentOccurrenceRegistryPort['get']>(value, 'get');
  const beginClose = captureMethod<DocumentOccurrenceRegistryPort['beginClose']>(value, 'beginClose');
  const commit = captureMethod<DocumentOccurrenceRegistryPort['commit']>(value, 'commit');
  const release = captureMethod<DocumentOccurrenceRegistryPort['release']>(value, 'release');
  const resolveHost = captureMethod<DocumentOccurrenceRegistryPort['resolveHost']>(value, 'resolveHost');
  const list = captureMethod<DocumentOccurrenceRegistryPort['list']>(value, 'list');
  return reserve && get && beginClose && commit && release && resolveHost && list
    ? { port: value as DocumentOccurrenceRegistryPort, reserve, get, beginClose, commit, release, resolveHost, list }
    : undefined;
}

function captureDocumentRuntimePort(value: unknown): CapturedDocumentRuntimePort | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const resolveDefinition = captureMethod<DocumentRuntimePort['resolveDefinition']>(value, 'resolveDefinition');
  const createRegistry = captureMethod<DocumentRuntimePort['createRegistry']>(value, 'createRegistry');
  const assembleOccurrence = captureMethod<DocumentRuntimePort['assembleOccurrence']>(value, 'assembleOccurrence');
  return resolveDefinition && createRegistry && assembleOccurrence
    ? { port: value as DocumentRuntimePort, resolveDefinition, createRegistry, assembleOccurrence }
    : undefined;
}

function captureDocumentRuntimeCapabilities(
  value: unknown,
): CapturedDocumentRuntimeCapabilities | undefined {
  const occurrences = captureOccurrenceRegistryPort(protocolData(value, 'documentOccurrences'));
  const runtime = captureDocumentRuntimePort(protocolData(value, 'documentRuntime'));
  return occurrences && runtime ? { occurrences, runtime } : undefined;
}

function diagnosticFromContractError(error: unknown): DocumentRuntimeDiagnostic {
  const code = typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : DOCUMENT_OPEN_CONTEXT_INVALID;
  return diagnostic(code, errorMessage(error));
}

function validateCanonicalInstanceRef(ref: DocumentInstanceRef): DocumentRuntimeDiagnostic | undefined {
  try {
    const formatted = formatDocumentInstanceRef(ref);
    const parsed = parseDocumentInstanceRef(formatted);
    if (
      parsed.unitInstanceId !== ref.unitInstanceId ||
      parsed.projectionRole !== ref.projectionRole ||
      parsed.xId !== ref.xId
    ) {
      return diagnostic(
        DOCUMENT_OPEN_CONTEXT_INVALID,
        'Document instance ref canonical formatter/parser round-trip mismatch.',
      );
    }
    return undefined;
  } catch (error) {
    return diagnosticFromContractError(error);
  }
}

function validateCanonicalUnitInstanceId(unitInstanceId: string): DiagnosticResult {
  const invalid = validateCanonicalInstanceRef({
    unitInstanceId,
    projectionRole: 'main',
    xId: 'main',
  });
  return invalid === undefined ? result() : result([invalid]);
}

function bindAddresses(
  unitInstanceId: string,
  plan: DocumentUnitPlan,
): readonly DocumentInstanceRef[] | DiagnosticResult {
  const unitInstanceIdValidation = validateCanonicalUnitInstanceId(unitInstanceId);
  if (hasErrors(unitInstanceIdValidation.diagnostics)) {
    return unitInstanceIdValidation;
  }

  const addresses: DocumentInstanceRef[] = [];
  for (const descriptor of plan.addressableInstances) {
    const ref = {
      unitInstanceId,
      projectionRole: descriptor.projectionRole,
      xId: descriptor.xId,
    };
    const invalid = validateCanonicalInstanceRef(ref);
    if (invalid !== undefined) {
      return result([invalid]);
    }
    addresses.push(ref);
  }

  return readonlyRefs(addresses);
}

function effectiveSource(
  plan: DocumentUnitPlan,
  input: OpenDocumentInput,
): DocumentUnitPlan['source'] | DiagnosticResult {
  const override = input.context.externalSourceRef;
  if (override === undefined) return plan.source;
  if (plan.source.kind === 'inline') {
    return result([
      diagnostic(
        DOCUMENT_SOURCE_OVERRIDE_INVALID,
        'Inline Document source cannot be replaced with an external source override.',
      ),
    ]);
  }
  return Object.freeze({ kind: 'external' as const, ref: override });
}

function validateOpenInput(
  capabilities: CapturedDocumentRuntimeCapabilities | undefined,
  input: OpenDocumentInput,
): DocumentUnitPlan | DiagnosticResult {
  if (capabilities === undefined) {
    return result([
      diagnostic(
        DOCUMENT_OPEN_CONTEXT_INVALID,
        'Document open requires documentOccurrences and documentRuntime capabilities.',
      ),
    ]);
  }
  if (!input.context.unitInstanceId) {
    return result([
      diagnostic(DOCUMENT_OPEN_CONTEXT_INVALID, 'DocumentOpenContext.unitInstanceId is required.'),
    ]);
  }
  if (input.context.mode !== 'view' && input.context.mode !== 'edit') {
    return result([
      diagnostic(DOCUMENT_OPEN_CONTEXT_INVALID, 'DocumentOpenContext.mode must be view or edit.'),
    ]);
  }
  const resolvedPlan = capabilities.runtime.resolveDefinition(input.definitionFqn);
  if (resolvedPlan === undefined) {
    return result([
      diagnostic(
        DOCUMENT_DEFINITION_NOT_FOUND,
        `Document definition "${input.definitionFqn}" was not found.`,
      ),
    ]);
  }
  const plan = snapshotDocumentUnitPlan(resolvedPlan);
  if (isDiagnosticResult(plan)) return plan;
  if (plan.mode !== input.context.mode) {
    return result([
      diagnostic(
        DOCUMENT_OPEN_CONTEXT_INVALID,
        'DocumentOpenContext.mode must match the compiled Document occurrence mode.',
      ),
    ]);
  }
  return plan;
}

function isDiagnosticResult(value: unknown): value is DiagnosticResult {
  return value !== null &&
    typeof value === 'object' &&
    Array.isArray((value as { diagnostics?: unknown }).diagnostics);
}

type AnyProposalPort = XnlAuthoringProposalPort<XnlAuthoringSerializableValue, XnlAuthoringSerializableValue>;
type AnyControlPort = XnlAuthoringControlPort<XnlAuthoringSerializableValue>;

interface OpenedDocumentAuthoring {
  readonly facet: DocumentScopeRuntime['authoring'];
  readonly dispose: () => Promise<void>;
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;
    await dispose();
  };
}

function authoringSource(source: DocumentUnitPlan['source']): Readonly<Record<string, string>> {
  return source.kind === 'external'
    ? Object.freeze({ kind: 'external', ref: source.ref })
    : Object.freeze({ kind: 'inline', unitSourceRef: source.unitSourceRef, region: source.region });
}

interface CapturedHostAuthoringPort {
  readonly runtime: DocumentAuthoringHostPort['runtime'];
  readonly open: DocumentAuthoringHostPort['factory']['open'];
}

function captureHostAuthoringPort(value: unknown): CapturedHostAuthoringPort | undefined {
  const factory = protocolData(value, 'factory');
  const runtime = protocolData(value, 'runtime');
  const open = captureMethod<DocumentAuthoringHostPort['factory']['open']>(factory, 'open');
  return runtime !== undefined && open !== undefined
    ? { runtime: runtime as DocumentAuthoringHostPort['runtime'], open }
    : undefined;
}

function provisionalControlDispose(value: unknown): (() => void | Promise<void>) | undefined {
  const control = ownData(value, 'control');
  return captureMethod<XnlAuthoringControlPort['dispose']>(control, 'dispose');
}

function isolateControl(value: unknown): AnyControlPort | undefined {
  const retryPersistence = captureMethod<AnyControlPort['retryPersistence']>(value, 'retryPersistence');
  const reloadDiscardingAccepted = captureMethod<AnyControlPort['reloadDiscardingAccepted']>(
    value,
    'reloadDiscardingAccepted',
  );
  const dispose = captureMethod<AnyControlPort['dispose']>(value, 'dispose');
  if (!retryPersistence || !reloadDiscardingAccepted || !dispose) return undefined;
  const disposeOnce = onceAsync(dispose);
  return Object.freeze({
    retryPersistence,
    reloadDiscardingAccepted,
    dispose: disposeOnce,
  }) as AnyControlPort;
}

function proposalSessionId(proposal: AnyProposalPort): string | undefined {
  const state = proposal.state();
  const accepted = ownData(state, 'accepted');
  const liveRevision = ownData(accepted, 'liveRevision');
  const sessionId = ownData(liveRevision, 'sessionId');
  return Object.isFrozen(state) &&
    Object.isFrozen(accepted) &&
    Object.isFrozen(liveRevision) &&
    ownData(state, 'kind') === 'xnl-authoring-session-state' &&
    ownData(accepted, 'kind') === 'xnl-authoring-accepted-snapshot' &&
    ownData(liveRevision, 'kind') === 'xnl-authoring-live-revision' &&
    typeof sessionId === 'string'
    ? sessionId
    : undefined;
}

async function openDocumentAuthoring(input: {
  runtime: DocumentOccurrenceRuntime;
  mode: DocumentUnitPlan['mode'];
  sessionId: string;
  source: DocumentUnitPlan['source'];
}): Promise<OpenedDocumentAuthoring> {
  if (input.mode === 'view') {
    return {
      facet: createXnlAuthoringViewScopeFacet(),
      dispose: async () => undefined,
    };
  }

  const hostPort = captureHostAuthoringPort(protocolData(input.runtime, 'documentAuthoring'));
  if (hostPort === undefined) {
    throw new Error(`${DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH}: edit Document host authoring factory/runtime capability is malformed.`);
  }
  const opened = await hostPort.open(
    hostPort.runtime,
    Object.freeze({ id: input.sessionId, source: authoringSource(input.source) }),
    Object.freeze({}),
  ) as XnlAuthoringOpenedSession<XnlAuthoringSerializableValue, XnlAuthoringSerializableValue>;
  const provisionalDispose = provisionalControlDispose(opened);
  const disposeProvisional = onceAsync(provisionalDispose ?? (() => undefined));

  try {
    if (!hasExactOwnKeys(opened, OPENED_SESSION_KEYS) || !Object.isFrozen(opened)) {
      throw new Error(`${DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH}: authoring factory returned a non-exact or mutable opened session.`);
    }
    const rawProposal = ownData(opened, 'proposal') as AnyProposalPort;
    const rawControl = ownData(opened, 'control');
    const editFacet = createXnlAuthoringEditScopeFacet(rawProposal);
    const control = isolateControl(rawControl);
    if (control === undefined) {
      throw new Error(`${DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH}: authoring factory returned a malformed control port.`);
    }
    if (proposalSessionId(editFacet.proposal as AnyProposalPort) !== input.sessionId) {
      throw new Error(`${DOCUMENT_AUTHORING_SESSION_MISMATCH}: opened authoring session identity does not match its occurrence binding.`);
    }
    return {
      facet: editFacet,
      dispose: control.dispose as () => Promise<void>,
    };
  } catch (error) {
    await disposeProvisional();
    throw error;
  }
}

function validateAssemblyShape(value: unknown): value is DocumentOccurrenceAssembly {
  if (value === null || typeof value !== 'object') return false;
  let names: string[];
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    names = Object.getOwnPropertyNames(value);
    if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  } catch {
    return false;
  }
  if (names.some((name) => !ASSEMBLY_KEYS.has(name))) return false;
  if (names.some((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return !descriptor || !('value' in descriptor);
  })) return false;
  for (const required of ['rootScopeId', 'rootRuntime', 'dispose']) {
    if (ownData(value, required) === undefined) return false;
  }
  return typeof ownData(value, 'rootScopeId') === 'string' &&
    typeof ownData(value, 'dispose') === 'function';
}

function validateNoBoundaryAuthoringLeak(
  value: unknown,
  mode: 'view' | 'edit',
  allowedProposal: AnyProposalPort | undefined,
): boolean {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    for (const name of Object.getOwnPropertyNames(value)) {
      if (name === 'constructor' || name === 'authoring') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor) return false;
      if (AUTHORING_LEAK_KEYS.has(name)) return false;
      if ('value' in descriptor && descriptor.value === allowedProposal) return false;
    }
  } catch {
    return false;
  }
  return mode === 'view' || allowedProposal !== undefined;
}

function validateScopeAuthoringRuntime(
  runtime: unknown,
  expectedRuntime: DocumentScopeRuntime,
): DocumentRuntimeDiagnostic | undefined {
  const capabilities = captureDocumentRuntimeCapabilities(runtime);
  if (capabilities === undefined) {
    return diagnostic(
      DOCUMENT_OCCURRENCE_SCOPE_CAPABILITY_MISMATCH,
      'Document occurrence Scope runtime capability port mismatch.',
    );
  }
  const authoring = protocolData(runtime, 'authoring');
  const validation = validateXnlAuthoringScopeAuthoringFacet(authoring);
  if (!validation.ok || !Object.isFrozen(authoring)) {
    return diagnostic(
      DOCUMENT_AUTHORING_SCOPE_LEAK,
      'Document Scope authoring facet is malformed, mutable, or missing.',
    );
  }
  const expectedAuthoring = expectedRuntime.authoring;
  const mode = ownData(authoring, 'mode');
  if (mode !== expectedAuthoring.mode) {
    return diagnostic(
      DOCUMENT_AUTHORING_SCOPE_LEAK,
      'Document Scope authoring mode does not match the occurrence mode.',
    );
  }
  const allowedProposal = expectedAuthoring.mode === 'edit'
    ? expectedAuthoring.proposal as AnyProposalPort
    : undefined;
  if (expectedAuthoring.mode === 'edit') {
    const proposal = ownData(authoring, 'proposal') as AnyProposalPort;
    if (
      !Object.isFrozen(proposal) ||
      proposal !== expectedAuthoring.proposal
    ) {
      return diagnostic(
        DOCUMENT_AUTHORING_SESSION_MISMATCH,
        'Document Scope proposal facade does not match the opened owner-local session.',
      );
    }
  }
  if (!validateNoBoundaryAuthoringLeak(runtime, expectedAuthoring.mode, allowedProposal)) {
    return diagnostic(
      DOCUMENT_AUTHORING_SCOPE_LEAK,
      'Document Scope runtime leaked an authoring factory, control, session, persistence, or submit capability.',
    );
  }
  return undefined;
}

function validateAssemblyPorts(
  assembly: DocumentOccurrenceAssembly,
  expectedRuntime: DocumentScopeRuntime,
): DiagnosticResult {
  const runtimes = [
    assembly.rootRuntime,
    ...(assembly.capsuleScopeRuntimes ?? []),
    ...(assembly.componentScopeRuntimes ?? []),
  ];
  for (const runtime of runtimes) {
    const authoringDiagnostic = validateScopeAuthoringRuntime(runtime, expectedRuntime);
    if (authoringDiagnostic !== undefined) return result([authoringDiagnostic]);
    const capabilities = captureDocumentRuntimeCapabilities(runtime);
    if (
      capabilities === undefined ||
      capabilities.occurrences.port !== expectedRuntime.documentOccurrences ||
      capabilities.runtime.port !== expectedRuntime.documentRuntime ||
      protocolData(runtime, 'documentInstances') !== expectedRuntime.documentInstances
    ) {
      return result([
        diagnostic(
          DOCUMENT_OCCURRENCE_SCOPE_CAPABILITY_MISMATCH,
          'Document occurrence Scope runtime capability port mismatch.',
        ),
      ]);
    }
  }
  return result();
}

interface DocumentScopeRuntimeProtocol {
  readonly bindScope?: (input: RuntimeScopeAssembly<unknown>) => unknown | Promise<unknown>;
  readonly deriveScope?: (input: RuntimeScopeAssembly<unknown>) => unknown | Promise<unknown>;
}

function captureDocumentScopeRuntimeProtocol(value: unknown): DocumentScopeRuntimeProtocol | undefined {
  const bindScope = captureMethod<DocumentScopeRuntimeProtocol['bindScope'] & ((input: RuntimeScopeAssembly<unknown>) => unknown)>(
    value,
    'bindScope',
  );
  const deriveScope = captureMethod<DocumentScopeRuntimeProtocol['deriveScope'] & ((input: RuntimeScopeAssembly<unknown>) => unknown)>(
    value,
    'deriveScope',
  );
  return bindScope || deriveScope ? { bindScope, deriveScope } : undefined;
}

async function deriveDocumentScopeRuntime(
  parentRuntime: unknown,
  capabilities: CapturedDocumentRuntimeCapabilities,
  documentInstances: DocumentInstanceRegistry,
  authoring: DocumentScopeRuntime['authoring'],
  rootScopeId: string,
): Promise<DocumentScopeRuntime> {
  const bindings = Object.freeze({
    documentOccurrences: capabilities.occurrences.port,
    documentRuntime: capabilities.runtime.port,
    documentInstances,
    authoring,
  });
  const input: RuntimeScopeAssembly<unknown> = Object.freeze({
    scopeId: rootScopeId,
    runtime: parentRuntime,
    bindings,
  });
  const protocol = captureDocumentScopeRuntimeProtocol(parentRuntime);
  const protocolRuntime = protocol?.bindScope
    ? await protocol.bindScope(input)
    : await protocol?.deriveScope?.(input);
  if (protocolRuntime !== undefined) {
    return protocolRuntime as DocumentScopeRuntime;
  }

  const parent = parentRuntime !== null &&
      (typeof parentRuntime === 'object' || typeof parentRuntime === 'function')
    ? parentRuntime as object
    : null;
  const fallback = Object.create(parent) as Record<string, unknown>;
  Object.defineProperties(fallback, {
    documentOccurrences: { value: capabilities.occurrences.port, enumerable: true },
    documentRuntime: { value: capabilities.runtime.port, enumerable: true },
    documentInstances: { value: documentInstances, enumerable: true },
    authoring: { value: authoring, enumerable: true },
  });
  return Object.freeze(fallback) as unknown as DocumentScopeRuntime;
}

function validateAssemblyRootScope(
  assembly: DocumentOccurrenceAssembly,
  plan: DocumentUnitPlan,
): DiagnosticResult {
  if (assembly.rootScopeId === plan.rootScopeId) return result();
  return result([
    diagnostic(
      DOCUMENT_OCCURRENCE_ROOT_SCOPE_MISMATCH,
      `Document occurrence assembly root Scope "${assembly.rootScopeId}" does not match plan root Scope "${plan.rootScopeId}".`,
    ),
  ]);
}

function freezeAssembly(
  assembly: DocumentOccurrenceAssembly,
  authoringDispose: () => Promise<void>,
): DocumentOccurrenceAssembly {
  const childOccurrences = captureChildOccurrences(ownData(assembly, 'childOccurrences'));
  const disposeAssemblyRoot = onceAsync(async () => {
    const dispose = ownData(assembly, 'dispose');
    try {
      if (typeof dispose === 'function') await dispose();
    } finally {
      await authoringDispose();
    }
  });
  const capsuleScopeRuntimes = ownData(assembly, 'capsuleScopeRuntimes');
  const componentScopeRuntimes = ownData(assembly, 'componentScopeRuntimes');
  const diagnostics = ownData(assembly, 'diagnostics');
  return Object.freeze({
    rootScopeId: ownData(assembly, 'rootScopeId') as string,
    rootRuntime: ownData(assembly, 'rootRuntime') as DocumentScopeRuntime,
    ...(Array.isArray(capsuleScopeRuntimes)
      ? { capsuleScopeRuntimes: Object.freeze([...capsuleScopeRuntimes]) }
      : {}),
    ...(Array.isArray(componentScopeRuntimes)
      ? { componentScopeRuntimes: Object.freeze([...componentScopeRuntimes]) }
      : {}),
    ...(childOccurrences === undefined ? {} : { childOccurrences }),
    ...(Array.isArray(diagnostics) ? { diagnostics: Object.freeze([...diagnostics]) } : {}),
    dispose: disposeAssemblyRoot,
  });
}

function captureChildOccurrences(value: unknown): DocumentOccurrenceAssembly['childOccurrences'] {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED}: childOccurrences must be an array when present.`);
  }
  const children = value.map((child, index) => {
    const dispose = captureMethod<() => void | Promise<void>>(child, 'dispose');
    if (dispose === undefined) {
      throw new Error(`${DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED}: child occurrence ${index} is missing a data or prototype dispose protocol.`);
    }
    return Object.freeze({ dispose: onceAsync(dispose) });
  });
  return Object.freeze(children);
}

async function disposeAssembly(
  assembly: DocumentOccurrenceAssembly | undefined,
): Promise<readonly DocumentRuntimeDiagnostic[]> {
  if (assembly === undefined) return [];
  const diagnostics: DocumentRuntimeDiagnostic[] = [];
  const childOccurrences = ownData(assembly, 'childOccurrences');
  const children = Array.isArray(childOccurrences) ? [...childOccurrences].reverse() : [];
  for (const child of children) {
    try {
      const dispose = ownData(child, 'dispose');
      if (typeof dispose === 'function') await dispose();
    } catch (error) {
      diagnostics.push(diagnostic(
        DOCUMENT_OCCURRENCE_DISPOSE_FAILED,
        `Document child occurrence dispose failed: ${errorMessage(error)}`,
      ));
    }
  }
  try {
    const dispose = ownData(assembly, 'dispose');
    if (typeof dispose === 'function') await dispose();
  } catch (error) {
    diagnostics.push(diagnostic(
      DOCUMENT_OCCURRENCE_DISPOSE_FAILED,
      `Document occurrence assembly dispose failed: ${errorMessage(error)}`,
    ));
  }
  return diagnostics;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openFailureDiagnostic(error: unknown): DocumentRuntimeDiagnostic {
  const message = errorMessage(error);
  const code = [
    DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH,
    DOCUMENT_AUTHORING_SESSION_MISMATCH,
  ].find((candidate) => message.startsWith(candidate)) ?? DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED;
  return diagnostic(code, `Document occurrence assembly failed: ${message}`);
}

async function rollbackOpen(input: {
  port: CapturedOccurrenceRegistryPort;
  unitInstanceId: string;
  lease: string;
  registry?: DocumentInstanceRegistry;
  assembly?: DocumentOccurrenceAssembly;
  authoringDispose?: () => Promise<void>;
}): Promise<readonly DocumentRuntimeDiagnostic[]> {
  const diagnostics: DocumentRuntimeDiagnostic[] = [
    ...await disposeAssembly(input.assembly),
  ];
  if (input.authoringDispose !== undefined) {
    try {
      await input.authoringDispose();
    } catch (error) {
      diagnostics.push(diagnostic(
        DOCUMENT_OCCURRENCE_DISPOSE_FAILED,
        `Document authoring session dispose failed: ${errorMessage(error)}`,
      ));
    }
  }
  if (input.registry !== undefined) {
    const disposed = input.registry.disposeNamespace(input.unitInstanceId);
    if (disposed.diagnostics !== undefined) diagnostics.push(...disposed.diagnostics);
  }
  const released = input.port.release({
    unitInstanceId: input.unitInstanceId,
    lease: input.lease,
  });
  diagnostics.push(...released.diagnostics);
  return diagnostics;
}

export function createDocumentOccurrenceRegistry(): DocumentOccurrenceRegistryPort {
  type Reservation = Readonly<{
    lease: string;
    parent?: DocumentOccurrenceParentLease;
  }>;
  const reservations = new Map<string, Reservation>();
  const records = new Map<string, DocumentOccurrenceRecord>();
  const closingRecords = new Map<string, DocumentOccurrenceRecord>();
  let leaseSequence = 0;

  function nextLease(unitInstanceId: string): string {
    leaseSequence += 1;
    return `document-occurrence:${unitInstanceId}:${leaseSequence}`;
  }

  function leaseKey(input: DocumentOccurrenceParentLease): string {
    return `${input.unitInstanceId}\u0000${input.lease}`;
  }

  function isParentActive(parent: DocumentOccurrenceParentLease): boolean {
    return records.get(parent.unitInstanceId)?.lease === parent.lease;
  }

  function sameParent(
    left: DocumentOccurrenceParentLease | undefined,
    right: DocumentOccurrenceParentLease | undefined,
  ): boolean {
    if (left === undefined || right === undefined) return left === right;
    return left.unitInstanceId === right.unitInstanceId && left.lease === right.lease;
  }

  function cloneParent(parent: DocumentOccurrenceParentLease): DocumentOccurrenceParentLease {
    return Object.freeze({
      unitInstanceId: parent.unitInstanceId,
      lease: parent.lease,
    });
  }

  function claimDescendants(parent: DocumentOccurrenceParentLease): readonly DocumentOccurrenceRecord[] {
    const claimedKeys = new Set([leaseKey(parent)]);
    const descendants: DocumentOccurrenceRecord[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const [unitInstanceId, reservation] of [...reservations]) {
        if (reservation.parent !== undefined && claimedKeys.has(leaseKey(reservation.parent))) {
          reservations.delete(unitInstanceId);
          claimedKeys.add(leaseKey({ unitInstanceId, lease: reservation.lease }));
          changed = true;
        }
      }
      for (const [unitInstanceId, record] of [...records]) {
        if (record.parent !== undefined && claimedKeys.has(leaseKey(record.parent))) {
          records.delete(unitInstanceId);
          closingRecords.set(unitInstanceId, record);
          claimedKeys.add(leaseKey(record));
          descendants.unshift(record);
          changed = true;
        }
      }
    }
    return Object.freeze(descendants);
  }

  const port: DocumentOccurrenceRegistryPort = {
    reserve(input) {
      if (
        reservations.has(input.unitInstanceId) ||
        records.has(input.unitInstanceId) ||
        closingRecords.has(input.unitInstanceId)
      ) {
        return {
          diagnostics: [
            diagnostic(
              DOCUMENT_OCCURRENCE_DUPLICATE,
              `Document occurrence "${input.unitInstanceId}" is already active or reserved.`,
            ),
          ],
        };
      }
      if (input.parent !== undefined && !isParentActive(input.parent)) {
        return {
          diagnostics: [
            diagnostic(
              DOCUMENT_OCCURRENCE_COMMIT_STALE,
              `Document occurrence parent lease for "${input.unitInstanceId}" is stale or inactive.`,
            ),
          ],
        };
      }
      const lease = nextLease(input.unitInstanceId);
      reservations.set(input.unitInstanceId, {
        lease,
        ...(input.parent === undefined ? {} : { parent: cloneParent(input.parent) }),
      });
      return { lease, diagnostics: [] };
    },

    get(unitInstanceId) {
      return records.get(unitInstanceId);
    },

    beginClose(input) {
      const record = records.get(input.unitInstanceId);
      if (record === undefined || record.lease !== input.lease) {
        return {
          diagnostics: [
            diagnostic(
              DOCUMENT_OCCURRENCE_CLOSE_STALE,
              `Document occurrence lease for "${input.unitInstanceId}" is stale, inactive, or already closing.`,
            ),
          ],
        };
      }
      records.delete(input.unitInstanceId);
      closingRecords.set(input.unitInstanceId, record);
      const descendants = claimDescendants(record);
      return { record, descendants, diagnostics: [] };
    },

    commit(input) {
      const reservation = reservations.get(input.unitInstanceId);
      if (reservation?.lease !== input.lease) {
        return result([
          diagnostic(
            DOCUMENT_OCCURRENCE_COMMIT_STALE,
            `Document occurrence lease for "${input.unitInstanceId}" is stale.`,
          ),
        ]);
      }
      if (
        reservation.parent !== undefined &&
        !isParentActive(reservation.parent)
      ) {
        return result([
          diagnostic(
            DOCUMENT_OCCURRENCE_COMMIT_STALE,
            `Document occurrence parent lease for "${input.unitInstanceId}" is stale or closing.`,
          ),
        ]);
      }
      if (
        input.record.unitInstanceId !== input.unitInstanceId ||
        input.record.lease !== input.lease ||
        !sameParent(input.record.parent, reservation.parent)
      ) {
        return result([
          diagnostic(
            DOCUMENT_OCCURRENCE_COMMIT_MISMATCH,
            'Document occurrence record does not match its reservation.',
          ),
        ]);
      }
      reservations.delete(input.unitInstanceId);
      records.set(input.unitInstanceId, input.record);
      return result();
    },

    release(input) {
      const activeLease = records.get(input.unitInstanceId)?.lease ??
        closingRecords.get(input.unitInstanceId)?.lease ??
        reservations.get(input.unitInstanceId)?.lease;
      if (activeLease !== input.lease) {
        return result([
          diagnostic(
            DOCUMENT_OCCURRENCE_RELEASE_STALE,
            `Document occurrence lease for "${input.unitInstanceId}" is stale or inactive.`,
          ),
        ]);
      }
      reservations.delete(input.unitInstanceId);
      records.delete(input.unitInstanceId);
      closingRecords.delete(input.unitInstanceId);
      return result();
    },

    resolveHost(ref) {
      const record = records.get(ref.unitInstanceId);
      if (record === undefined) return undefined;
      const resolved = record.registry.resolve(ref);
      return resolved.ok ? resolved.value?.target : undefined;
    },

    list() {
      return Object.freeze([...records.values()]);
    },
  };
  return Object.freeze(port);
}

export async function openDocument(
  runtime: DocumentOccurrenceRuntime,
  input: OpenDocumentInput,
  config: DocumentRuntimeConfig,
): Promise<DocumentInstanceHandle | DiagnosticResult> {
  const capabilities = captureDocumentRuntimeCapabilities(runtime);
  const inputSnapshot = snapshotOpenDocumentInput(input);
  if (isDiagnosticResult(inputSnapshot)) return inputSnapshot;
  const configSnapshot = snapshotDocumentRuntimeConfig(config);
  if (isDiagnosticResult(configSnapshot)) return configSnapshot;

  const plan = validateOpenInput(capabilities, inputSnapshot);
  if (isDiagnosticResult(plan)) return plan;
  if (capabilities === undefined) return result([
    diagnostic(DOCUMENT_OPEN_CONTEXT_INVALID, 'Document runtime capabilities are unavailable.'),
  ]);

  const source = effectiveSource(plan, inputSnapshot);
  if (isDiagnosticResult(source)) return source;

  const port = capabilities.occurrences;
  const runtimePort = capabilities.runtime;
  const unitInstanceId = inputSnapshot.context.unitInstanceId;
  const addresses = bindAddresses(unitInstanceId, plan);
  if (isDiagnosticResult(addresses)) return addresses;
  if (inputSnapshot.hostOccurrenceRef !== undefined) {
    const invalidHostRef = validateCanonicalInstanceRef(inputSnapshot.hostOccurrenceRef);
    if (invalidHostRef !== undefined) return result([invalidHostRef]);
  }
  const assemblyInput: AssembleDocumentOccurrenceInput = Object.freeze({
    plan,
    effectiveSource: source,
    context: inputSnapshot.context,
    addresses,
  });

  let parentRuntime: unknown = runtime;
  let parent: DocumentOccurrenceParentLease | undefined;
  if (inputSnapshot.hostOccurrenceRef !== undefined) {
    const parentRecord = port.get(inputSnapshot.hostOccurrenceRef.unitInstanceId);
    const host = port.resolveHost(inputSnapshot.hostOccurrenceRef);
    if (parentRecord === undefined || host === undefined) {
      return result([
        diagnostic(
          DOCUMENT_OCCURRENCE_HOST_NOT_FOUND,
          'Document host occurrence ref was not found in the owner runtime registry.',
        ),
      ]);
    }
    const hostCapabilities = captureDocumentRuntimeCapabilities(host);
    if (
      hostCapabilities === undefined ||
      hostCapabilities.occurrences.port !== port.port ||
      hostCapabilities.runtime.port !== runtimePort.port
    ) {
      return result([
        diagnostic(
          DOCUMENT_OCCURRENCE_HOST_CAPABILITY_MISMATCH,
          'Document host target does not expose the owner-local occurrence runtime capability.',
        ),
      ]);
    }
    parentRuntime = host;
    parent = Object.freeze({
      unitInstanceId: parentRecord.unitInstanceId,
      lease: parentRecord.lease,
    });
  }

  const reservation = port.reserve({
    unitInstanceId,
    ...(parent === undefined ? {} : { parent }),
  });
  if (hasErrors(reservation.diagnostics) || reservation.lease === undefined) {
    return reservation;
  }
  const lease = reservation.lease;

  let registry: DocumentInstanceRegistry | undefined;
  let assembly: DocumentOccurrenceAssembly | undefined;
  let authoringDispose: (() => Promise<void>) | undefined;
  try {
    const authoring = await openDocumentAuthoring({
      runtime,
      mode: plan.mode,
      sessionId: unitInstanceId,
      source,
    });
    authoringDispose = authoring.dispose;
    registry = runtimePort.createRegistry();
    const scopeRuntime = await deriveDocumentScopeRuntime(
      parentRuntime,
      capabilities,
      registry,
      authoring.facet,
      plan.rootScopeId,
    );
    assembly = await runtimePort.assembleOccurrence(scopeRuntime, assemblyInput, configSnapshot);

    if (!validateAssemblyShape(assembly)) {
      const rollbackDiagnostics = await rollbackOpen({
        port,
        unitInstanceId,
        lease,
        registry,
        assembly,
        authoringDispose,
      });
      return result([
        diagnostic(
          DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED,
          'Document occurrence assembly returned a malformed or accessor-bearing facade.',
        ),
        ...rollbackDiagnostics,
      ]);
    }

    assembly = freezeAssembly(assembly, authoringDispose);
    authoringDispose = undefined;

    if (hasErrors(assembly.diagnostics)) {
      const rollbackDiagnostics = await rollbackOpen({
        port,
        unitInstanceId,
        lease,
        registry,
        assembly,
        authoringDispose,
      });
      return result([
        ...(assembly.diagnostics ?? []),
        ...rollbackDiagnostics,
      ]);
    }

    const portValidation = validateAssemblyPorts(assembly, scopeRuntime);
    if (hasErrors(portValidation.diagnostics)) {
      const rollbackDiagnostics = await rollbackOpen({
        port,
        unitInstanceId,
        lease,
        registry,
        assembly,
        authoringDispose,
      });
      return result([
        ...portValidation.diagnostics,
        ...rollbackDiagnostics,
      ]);
    }

    const rootScopeValidation = validateAssemblyRootScope(assembly, plan);
    if (hasErrors(rootScopeValidation.diagnostics)) {
      const rollbackDiagnostics = await rollbackOpen({
        port,
        unitInstanceId,
        lease,
        registry,
        assembly,
        authoringDispose,
      });
      return result([
        ...rootScopeValidation.diagnostics,
        ...rollbackDiagnostics,
      ]);
    }

    const record: DocumentOccurrenceRecord = Object.freeze({
      unitInstanceId,
      lease,
      ...(parent === undefined ? {} : { parent }),
      rootScopeId: plan.rootScopeId,
      addresses,
      registry,
      assembly,
    });
    const committed = port.commit({ unitInstanceId, lease, record });
    if (hasErrors(committed.diagnostics)) {
      const rollbackDiagnostics = await rollbackOpen({
        port,
        unitInstanceId,
        lease,
        registry,
        assembly,
        authoringDispose,
      });
      return result([...committed.diagnostics, ...rollbackDiagnostics]);
    }

    return Object.freeze({
      unitInstanceId,
      lease,
      rootScopeId: plan.rootScopeId,
      addresses,
    });
  } catch (error) {
    const rollbackDiagnostics = await rollbackOpen({
      port,
      unitInstanceId,
      lease,
      registry,
      assembly,
      authoringDispose,
    });
    return result([
      openFailureDiagnostic(error),
      ...rollbackDiagnostics,
    ]);
  }
}

export async function closeDocument(
  runtime: DocumentOccurrenceRuntime,
  input: CloseDocumentInput,
  _config: DocumentRuntimeConfig,
): Promise<DiagnosticResult> {
  const capabilities = captureDocumentRuntimeCapabilities(runtime);
  if (capabilities === undefined) {
    return result([
      diagnostic(
        DOCUMENT_OPEN_CONTEXT_INVALID,
        'Document close requires documentOccurrences and documentRuntime capabilities.',
      ),
    ]);
  }

  const port = capabilities.occurrences;
  const claim = port.beginClose({
    unitInstanceId: input.unitInstanceId,
    lease: input.lease,
  });
  if (hasErrors(claim.diagnostics) || claim.record === undefined) {
    return result(claim.diagnostics);
  }
  const record = claim.record;
  const descendants = claim.descendants ?? [];

  const diagnostics: DocumentRuntimeDiagnostic[] = [
    ...(
      await Promise.all(descendants.map(async (descendant) => [
        ...await disposeAssembly(descendant.assembly),
        ...(descendant.registry.disposeNamespace(descendant.unitInstanceId).diagnostics ?? []),
        ...port.release({
          unitInstanceId: descendant.unitInstanceId,
          lease: descendant.lease,
        }).diagnostics,
      ]))
    ).flat(),
    ...await disposeAssembly(record.assembly),
  ];
  const namespaceDisposed = record.registry.disposeNamespace(input.unitInstanceId);
  if (namespaceDisposed.diagnostics !== undefined) {
    diagnostics.push(...namespaceDisposed.diagnostics);
  }
  diagnostics.push(...port.release({
    unitInstanceId: input.unitInstanceId,
    lease: input.lease,
  }).diagnostics);

  return result(diagnostics);
}
