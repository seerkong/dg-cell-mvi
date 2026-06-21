import type {
  SchemaEditorContractValue,
  SchemaEditorValidationIssue,
  ValuePath,
} from 'dg-cell-mvi-halfcode-contract';
import { snapshotSerializableValue } from 'dg-cell-mvi-halfcode-contract';

import type {
  CreateSchemaEditorRendererIdentityProjectionConfig,
  CreateSchemaEditorRendererIdentityProjectionInput,
  SchemaEditorRendererIdentityProjection,
  SchemaEditorRendererIdentityProjectionInput,
  SchemaEditorRendererIdentityProjectionResult,
} from './contracts';

interface ProjectedItem {
  readonly fingerprint: string;
  readonly key: string | number;
  readonly ephemeral: boolean;
}

export function createSchemaEditorRendererIdentityProjection(
  _runtime: unknown,
  _input: CreateSchemaEditorRendererIdentityProjectionInput,
  _config: CreateSchemaEditorRendererIdentityProjectionConfig,
): SchemaEditorRendererIdentityProjection {
  const acceptedByCollection = new Map<string, readonly ProjectedItem[]>();
  let nextEphemeralId = 0;

  const reconcile = (
    _projectionRuntime: unknown,
    input: SchemaEditorRendererIdentityProjectionInput,
    config: Readonly<{ keyPrefix: string }>,
  ): SchemaEditorRendererIdentityProjectionResult => {
    const snapshot = snapshotReconcileInput(input, config);
    if (!snapshot.ok) return snapshot;

    const collectionScope = encodeCollectionScope(
      snapshot.keyPrefix,
      snapshot.collectionId,
      snapshot.collectionPath,
    );
    const previous = acceptedByCollection.get(collectionScope) ?? EMPTY_PROJECTED_ITEMS;
    const previousUsed = new Set<number>();
    const candidateCounts = countCandidates(snapshot.propertyIdentities);
    const fingerprints = snapshot.items.map((item) => fingerprintContractValue(item));
    if (fingerprints.some((fingerprint) => fingerprint === undefined)) {
      return identityFailure(
        'Renderer identity items must be descriptor-safe serializable values.',
      );
    }
    const reservedKeys = new Set<string | number>();
    for (const [candidate, count] of candidateCounts) {
      if (count === 1) reservedKeys.add(candidate);
    }

    const usedKeys = new Set<string | number>();
    const projected: ProjectedItem[] = [];
    const keys: Array<string | number> = [];
    for (let index = 0; index < snapshot.items.length; index += 1) {
      const item = snapshot.items[index];
      const candidate = snapshot.propertyIdentities[index];
      const propertyWins = candidate !== undefined && candidateCounts.get(candidate) === 1;
      const key = propertyWins
        ? candidate
        : findRetainedEphemeralKey(
          fingerprints[index] as string,
          previous,
          previousUsed,
          reservedKeys,
          usedKeys,
        )
          ?? allocateEphemeralKey(collectionScope, reservedKeys, usedKeys, () => {
            const allocated = nextEphemeralId;
            nextEphemeralId += 1;
            return allocated;
          });

      usedKeys.add(key);
      keys.push(key);
      projected.push(Object.freeze({
        fingerprint: fingerprints[index] as string,
        key,
        ephemeral: !propertyWins,
      }));
    }

    acceptedByCollection.set(collectionScope, Object.freeze(projected));
    return Object.freeze({
      ok: true,
      keys: Object.freeze(keys),
    });
  };

  return Object.freeze({ reconcile });
}

function snapshotReconcileInput(
  input: SchemaEditorRendererIdentityProjectionInput,
  config: Readonly<{ keyPrefix: string }>,
): Readonly<
  | {
      ok: true;
      collectionId: string;
      collectionPath: ValuePath;
      items: readonly SchemaEditorContractValue[];
      propertyIdentities: readonly (string | number | undefined)[];
      keyPrefix: string;
    }
  | {
      ok: false;
      code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT';
      message: string;
    }
> {
  const inputRecord = readRecord(input);
  const configRecord = readRecord(config);
  const collectionId = inputRecord?.get('collectionId');
  const collectionPath = readPath(inputRecord?.get('collectionPath'));
  const items = readArray(inputRecord?.get('items'));
  const propertyIdentities = readArray(inputRecord?.get('propertyIdentities'));
  const keyPrefix = configRecord?.get('keyPrefix');

  if (
    typeof collectionId !== 'string'
    || collectionId.length === 0
    || !collectionPath.ok
    || !items.ok
    || !propertyIdentities.ok
    || items.value.length !== propertyIdentities.value.length
    || typeof keyPrefix !== 'string'
    || keyPrefix.length === 0
  ) {
    return identityFailure('Renderer identity reconciliation requires own-data collection inputs.');
  }

  const acceptedItems: SchemaEditorContractValue[] = [];
  const candidates: Array<string | number | undefined> = [];
  for (let index = 0; index < items.value.length; index += 1) {
    const item = items.value[index];
    const candidate = propertyIdentities.value[index];
    const issues: SchemaEditorValidationIssue[] = [];
    const acceptedItem = snapshotSerializableValue(
      item,
      `$.items[${index}]`,
      issues,
    );
    if (
      acceptedItem === undefined
      || (
        candidate !== undefined
        && typeof candidate !== 'string'
        && typeof candidate !== 'number'
      )
      || (typeof candidate === 'number' && !Number.isFinite(candidate))
    ) {
      return identityFailure('Renderer identity items and candidates must be contract values.');
    }
    acceptedItems.push(acceptedItem);
    candidates.push(candidate as string | number | undefined);
  }

  return {
    ok: true,
    collectionId,
    collectionPath: Object.freeze([...collectionPath.value]) as ValuePath,
    items: Object.freeze(acceptedItems),
    propertyIdentities: Object.freeze(candidates),
    keyPrefix,
  };
}

function findRetainedEphemeralKey(
  fingerprint: string,
  previous: readonly ProjectedItem[],
  previousUsed: Set<number>,
  reservedKeys: ReadonlySet<string | number>,
  usedKeys: ReadonlySet<string | number>,
): string | number | undefined {
  for (let index = 0; index < previous.length; index += 1) {
    const projected = previous[index];
    if (
      projected
      && projected.ephemeral
      && !previousUsed.has(index)
      && projected.fingerprint === fingerprint
      && !reservedKeys.has(projected.key)
      && !usedKeys.has(projected.key)
    ) {
      previousUsed.add(index);
      return projected.key;
    }
  }
  return undefined;
}

function fingerprintContractValue(value: SchemaEditorContractValue): string | undefined {
  return fingerprintValue(value, new Set<object>());
}

function fingerprintValue(
  value: unknown,
  ancestors: Set<object>,
): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return value ? 'boolean:true' : 'boolean:false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Object.is(value, -0) ? 'number:-0' : `number:${String(value)}`;
  }
  if (!isObject(value) || typeof value === 'function' || ancestors.has(value)) {
    return undefined;
  }

  ancestors.add(value);
  try {
    if (isArraySafely(value)) {
      const items = readArray(value);
      if (!items.ok) return undefined;
      const fingerprints: string[] = [];
      for (const item of items.value) {
        const fingerprint = fingerprintValue(item, ancestors);
        if (fingerprint === undefined) return undefined;
        fingerprints.push(fingerprint);
      }
      return `array:[${fingerprints.join(',')}]`;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors)
      .filter((key) => descriptors[key]?.enumerable)
      .sort();
    const fields: string[] = [];
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor) return undefined;
      if (!('value' in descriptor)) {
        fields.push(`${JSON.stringify(key)}:accessor`);
        continue;
      }
      const fingerprint = fingerprintValue(descriptor.value, ancestors);
      if (fingerprint === undefined) return undefined;
      fields.push(`${JSON.stringify(key)}:${fingerprint}`);
    }
    return `record:{${fields.join(',')}}`;
  } catch {
    return undefined;
  } finally {
    ancestors.delete(value);
  }
}

function allocateEphemeralKey(
  collectionScope: string,
  reservedKeys: ReadonlySet<string | number>,
  usedKeys: ReadonlySet<string | number>,
  allocateId: () => number,
): string {
  let key: string;
  do {
    key = `schema-editor:${collectionScope}:ephemeral:${allocateId()}`;
  } while (reservedKeys.has(key) || usedKeys.has(key));
  return key;
}

function countCandidates(
  values: readonly (string | number | undefined)[],
): ReadonlyMap<string | number, number> {
  const counts = new Map<string | number, number>();
  for (const value of values) {
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function readPath(
  value: unknown,
): Readonly<{ ok: true; value: readonly (string | number)[] } | { ok: false }> {
  const path = readArray(value);
  if (!path.ok) return path;
  const result: Array<string | number> = [];
  for (const segment of path.value) {
    if (
      (typeof segment === 'string' && segment.length > 0)
      || (typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0)
    ) {
      result.push(segment as string | number);
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: result };
}

function readArray(
  value: unknown,
): Readonly<{ ok: true; value: readonly unknown[] } | { ok: false }> {
  if (!isArraySafely(value)) return { ok: false };
  try {
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !length
      || !('value' in length)
      || !Number.isSafeInteger(length.value)
      || length.value < 0
    ) {
      return { ok: false };
    }
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return { ok: false };
      result.push(descriptor.value);
    }
    return { ok: true, value: result };
  } catch {
    return { ok: false };
  }
}

function readRecord(value: unknown): ReadonlyMap<string, unknown> | undefined {
  if (!isObject(value) || isArraySafely(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = new Map<string, unknown>();
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return undefined;
      result.set(key, descriptor.value);
    }
    return result;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isArraySafely(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function encodeCollectionScope(
  keyPrefix: string,
  collectionId: string,
  path: readonly (string | number)[],
): string {
  return JSON.stringify([
    ['keyPrefix', 'string', keyPrefix],
    ['collectionId', 'string', collectionId],
    [
      'path',
      path.map((segment) => typeof segment === 'string'
        ? ['string', segment]
        : ['number', Object.is(segment, -0) ? '-0' : String(segment)]),
    ],
  ]);
}

function identityFailure(
  message: string,
): Readonly<{
  ok: false;
  code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT';
  message: string;
}> {
  return Object.freeze({
    ok: false,
    code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT',
    message,
  });
}

const EMPTY_PROJECTED_ITEMS = Object.freeze([]) as readonly ProjectedItem[];
