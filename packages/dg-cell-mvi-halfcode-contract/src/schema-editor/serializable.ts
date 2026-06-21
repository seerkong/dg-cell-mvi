export interface SchemaEditorValidationIssue {
  path: string;
  code?: string;
  message: string;
}

export interface SchemaEditorValidationResult {
  ok: boolean;
  issues: SchemaEditorValidationIssue[];
}

const OWNERSHIP_FIELD_NAMES = [
  'apply',
  'callback',
  'component',
  'componentConstructor',
  'databaseWriter',
  'dispatch',
  'factory',
  'hostEffect',
  'hostWriter',
  'persistenceClient',
  'rendererEvent',
  'runtime',
  'signalSetter',
  'valueHost',
  'vfsClient',
  'writer',
  'xnlMutationWriter',
] as const;

type SchemaEditorOwnershipFieldName = (typeof OWNERSHIP_FIELD_NAMES)[number];

export type SchemaEditorContractPrimitive = string | number | boolean | null;
export type SchemaEditorContractValue =
  | SchemaEditorContractPrimitive
  | SchemaEditorContractValue[]
  | SchemaEditorContractRecord;
export type SchemaEditorContractRecord = {
  [key: string]: SchemaEditorContractValue | undefined;
} & {
  [TKey in SchemaEditorOwnershipFieldName]?: never;
};

const OWNERSHIP_FIELDS = new Set<string>(OWNERSHIP_FIELD_NAMES);

export function validationResult(issues: SchemaEditorValidationIssue[]): SchemaEditorValidationResult {
  return { ok: issues.length === 0, issues };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function appendPath(path: string, segment: string | number): string {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${path}.${segment}` : `${path}[${JSON.stringify(segment)}]`;
}

export function collectSerializableIssues(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  inspectSerializableValue(value, path, issues, new Set());
}

export function snapshotSerializableValue(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): SchemaEditorContractValue | undefined {
  const result = inspectSerializableValue(value, path, issues, new Set());
  return result.ok ? result.value : undefined;
}

type SerializableInspectionResult =
  | { ok: true; value: SchemaEditorContractValue }
  | { ok: false };

function inspectSerializableValue(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seen: Set<object>,
): SerializableInspectionResult {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issues.push({ path, code: 'NON_FINITE_NUMBER', message: 'Numbers must be finite.' });
      return { ok: false };
    }
    return { ok: true, value };
  }

  if (typeof value === 'function') {
    issues.push({ path, code: 'EXECUTABLE_VALUE', message: 'Executable values are not serializable contract data.' });
    return { ok: false };
  }

  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push({
      path,
      code: 'NON_SERIALIZABLE_VALUE',
      message: `Unsupported non-serializable value type: ${typeof value}.`,
    });
    return { ok: false };
  }

  const array = inspectArrayKind(value, path, issues);
  if (array === undefined) return { ok: false };
  if (array) {
    const prototype = inspectPrototype(value, path, issues);
    if (!prototype.ok) return { ok: false };
    if (prototype.value !== Array.prototype) {
      issues.push({
        path,
        code: 'RUNTIME_INSTANCE',
        message: 'Serializable arrays must use the built-in Array prototype.',
      });
      return { ok: false };
    }
    if (seen.has(value)) {
      issues.push({ path, code: 'CYCLIC_CONTRACT_VALUE', message: 'Serializable contract data must not contain cycles.' });
      return { ok: false };
    }
    seen.add(value);
    const lengthDescriptor = getOwnDescriptor(value, 'length', path, issues);
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      !Number.isInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Serializable arrays require an own numeric length data property.' });
      seen.delete(value);
      return { ok: false };
    }
    const length = lengthDescriptor.value as number;
    const clone: SchemaEditorContractValue[] = new Array(length);
    let ok = true;
    for (let index = 0; index < length; index += 1) {
      const childPath = appendPath(path, index);
      const descriptor = getOwnDescriptor(value, String(index), childPath, issues);
      if (!descriptor) {
        issues.push({ path: childPath, code: 'SPARSE_CONTRACT_ARRAY', message: 'Serializable contract arrays must not contain sparse entries.' });
        ok = false;
        continue;
      }
      if (!('value' in descriptor)) {
        issues.push({ path: childPath, code: 'ACCESSOR_CONTRACT_FIELD', message: 'Serializable contract data must use own data properties, not accessors.' });
        ok = false;
        continue;
      }
      const child = inspectSerializableValue(descriptor.value, childPath, issues, seen);
      if (!child.ok) {
        ok = false;
        continue;
      }
      clone[index] = child.value;
    }
    seen.delete(value);
    return ok ? { ok: true, value: clone } : { ok: false };
  }

  const prototype = inspectPrototype(value, path, issues);
  if (!prototype.ok) return { ok: false };
  if (prototype.value !== Object.prototype && prototype.value !== null) {
    issues.push({
      path,
      code: 'RUNTIME_INSTANCE',
      message: 'Runtime instances and class instances are not serializable contract data.',
    });
    return { ok: false };
  }

  if (seen.has(value)) {
    issues.push({ path, code: 'CYCLIC_CONTRACT_VALUE', message: 'Serializable contract data must not contain cycles.' });
    return { ok: false };
  }
  seen.add(value);
  const clone = Object.create(null) as Record<string, SchemaEditorContractValue>;
  let ok = true;
  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(value);
  } catch {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract property names could not be inspected safely.' });
    seen.delete(value);
    return { ok: false };
  }
  for (const key of keys) {
    const childPath = appendPath(path, key);
    if (OWNERSHIP_FIELDS.has(key)) {
      issues.push({
        path: childPath,
        code: 'OWNERSHIP_FIELD',
        message: 'Callback, renderer, runtime, or host-effect ownership fields are not contract data.',
      });
      ok = false;
    }
    const descriptor = getOwnDescriptor(value, key, childPath, issues);
    if (!descriptor) {
      ok = false;
      continue;
    }
    if (!('value' in descriptor)) {
      issues.push({ path: childPath, code: 'ACCESSOR_CONTRACT_FIELD', message: 'Serializable contract data must use own data properties, not accessors.' });
      ok = false;
      continue;
    }
    const child = inspectSerializableValue(descriptor.value, childPath, issues, seen);
    if (!child.ok) {
      ok = false;
      continue;
    }
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      writable: true,
      value: child.value,
    });
  }
  seen.delete(value);
  return ok ? { ok: true, value: clone } : { ok: false };
}

function inspectArrayKind(
  value: object,
  path: string,
  issues: SchemaEditorValidationIssue[],
): boolean | undefined {
  try {
    return Array.isArray(value);
  } catch {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract container kind could not be inspected safely.' });
    return undefined;
  }
}

function inspectPrototype(
  value: object,
  path: string,
  issues: SchemaEditorValidationIssue[],
): { ok: true; value: object | null } | { ok: false } {
  try {
    return { ok: true, value: Object.getPrototypeOf(value) };
  } catch {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract prototype could not be inspected safely.' });
    return { ok: false };
  }
}

function getOwnDescriptor(
  value: object,
  property: string,
  path: string,
  issues: SchemaEditorValidationIssue[],
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, property);
  } catch {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract property descriptors could not be inspected safely.' });
    return undefined;
  }
}

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(value);
}

export function validateStableId(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  label = 'id',
): void {
  if (!isStableId(value)) {
    issues.push({ path, code: 'INVALID_STABLE_ID', message: `${label} must be a stable non-empty string id.` });
  }
}

export function addDuplicateIssue(
  path: string,
  value: string,
  issues: SchemaEditorValidationIssue[],
  label: string,
): void {
  issues.push({ path, code: 'DUPLICATE_IDENTITY', message: `${label} "${value}" must be unique.` });
}
