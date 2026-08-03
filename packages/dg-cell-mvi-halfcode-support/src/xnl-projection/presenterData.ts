import {
  XNL_PROJECTION_OWNERSHIP_FIELD_NAMES,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/;
const OWNERSHIP_FIELDS = new Set<string>(XNL_PROJECTION_OWNERSHIP_FIELD_NAMES);

export type XnlProjectionPureDataSnapshot<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; message: string }>;

export function isStableXnlProjectionId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

export function snapshotXnlProjectionSerializableRecord(
  value: unknown,
  label: string,
): XnlProjectionPureDataSnapshot<XnlProjectionSerializableRecord> {
  const snapshot = snapshotXnlProjectionPureData(value, label);
  if (!snapshot.ok) return snapshot;
  if (!isPlainRecord(snapshot.value)) {
    return {
      ok: false,
      message: `${label} must be a plain serializable record.`,
    };
  }
  return {
    ok: true,
    value: snapshot.value as XnlProjectionSerializableRecord,
  };
}

export function snapshotXnlProjectionSerializableValue(
  value: unknown,
  label: string,
): XnlProjectionPureDataSnapshot<XnlProjectionSerializableValue> {
  const snapshot = snapshotXnlProjectionPureData(value, label);
  if (!snapshot.ok) return snapshot;
  return {
    ok: true,
    value: snapshot.value as XnlProjectionSerializableValue,
  };
}

export function snapshotXnlProjectionPureData<T>(
  value: T,
  label: string,
): XnlProjectionPureDataSnapshot<T> {
  try {
    const snapshot = snapshotValue(value, label, new Set<object>());
    return snapshot.ok
      ? { ok: true, value: snapshot.value as T }
      : snapshot;
  } catch (error) {
    return {
      ok: false,
      message: `${label} could not be inspected: ${errorMessage(error)}`,
    };
  }
}

function snapshotValue(
  value: unknown,
  path: string,
  seen: Set<object>,
): XnlProjectionPureDataSnapshot<unknown> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: `${path} must contain only finite numbers.` };
  }
  if (typeof value !== 'object') {
    return {
      ok: false,
      message: `${path} contains a non-serializable ${typeof value} value.`,
    };
  }
  if (seen.has(value)) {
    return {
      ok: false,
      message: `${path} contains a cyclic value.`,
    };
  }

  seen.add(value);
  const result = Array.isArray(value)
    ? snapshotArray(value, path, seen)
    : snapshotRecord(value, path, seen);
  seen.delete(value);
  return result;
}

function snapshotArray(
  value: readonly unknown[],
  path: string,
  seen: Set<object>,
): XnlProjectionPureDataSnapshot<readonly unknown[]> {
  const snapshot: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return {
        ok: false,
        message: `${path}[${index}] is a sparse array slot.`,
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor)) {
      return {
        ok: false,
        message: `${path}[${index}] must be an own data property.`,
      };
    }
    const child = snapshotValue(descriptor.value, `${path}[${index}]`, seen);
    if (!child.ok) return child;
    snapshot.push(child.value);
  }
  return {
    ok: true,
    value: Object.freeze(snapshot),
  };
}

function snapshotRecord(
  value: object,
  path: string,
  seen: Set<object>,
): XnlProjectionPureDataSnapshot<Readonly<Record<string, unknown>>> {
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      message: `${path} contains a class, runtime, or host instance.`,
    };
  }

  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      return {
        ok: false,
        message: `${path} contains a symbol key.`,
      };
    }
    if (OWNERSHIP_FIELDS.has(key)) {
      return {
        ok: false,
        message: `${path}.${key} is a domain-authority or implementation field.`,
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      return {
        ok: false,
        message: `${path}.${key} must be an own data property.`,
      };
    }
    if (descriptor.value === undefined) {
      return {
        ok: false,
        message: `${path}.${key} contains a non-serializable undefined value.`,
      };
    }
    const child = snapshotValue(descriptor.value, `${path}.${key}`, seen);
    if (!child.ok) return child;
    snapshot[key] = child.value;
  }
  return {
    ok: true,
    value: Object.freeze(snapshot),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
