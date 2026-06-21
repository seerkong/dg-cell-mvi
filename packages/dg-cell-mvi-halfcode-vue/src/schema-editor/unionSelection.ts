import type {
  EditorPlanNode,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';

type OwnRecord = Readonly<Record<PropertyKey, unknown>>;

export type SchemaEditorUnionSelectionResult =
  | Readonly<{
      ok: true;
      alternativeId?: string;
    }>
  | Readonly<{
      ok: false;
      code: 'INVALID_UNION_ALTERNATIVE_DESCRIPTORS' | 'INVALID_UNION_ACCEPTED_SELECTION';
      message: string;
    }>;

type ContractShape =
  | 'array'
  | 'boolean'
  | 'map'
  | 'null'
  | 'number'
  | 'string';

/**
 * Resolves accepted union data without executing accessors.
 * Shape inference is allowed only when one alternative initialValue matches.
 */
export function resolveSchemaEditorUnionSelection(
  node: EditorPlanNode,
  value: SchemaEditorContractValue | undefined,
): SchemaEditorUnionSelectionResult {
  const nodeRecord = asOwnRecord(node);
  const metadata = asOwnRecord(readOwnData(nodeRecord, 'metadata').value);
  const descriptors = readAlternativeDescriptors(
    readOwnData(metadata, 'alternativeDescriptors').value,
  );
  if (!descriptors) {
    return invalid(
      'INVALID_UNION_ALTERNATIVE_DESCRIPTORS',
      'Union alternative descriptors are not readable own data.',
    );
  }
  if (value === undefined) return Object.freeze({ ok: true });

  const discriminator = readOwnData(metadata, 'discriminator');
  if (!discriminator.ok) {
    return invalid(
      'INVALID_UNION_ALTERNATIVE_DESCRIPTORS',
      'Union discriminator is not readable own data.',
    );
  }
  if (discriminator.found) {
    if (typeof discriminator.value !== 'string' || discriminator.value.length === 0) {
      return invalid(
        'INVALID_UNION_ALTERNATIVE_DESCRIPTORS',
        'Union discriminator must be a non-empty string.',
      );
    }
    const selected = readOwnData(asOwnRecord(value), discriminator.value);
    if (!selected.ok || !selected.found || typeof selected.value !== 'string') {
      return invalid(
        'INVALID_UNION_ACCEPTED_SELECTION',
        'Accepted union selection is not readable.',
      );
    }
    return descriptors.some(({ id }) => id === selected.value)
      ? Object.freeze({ ok: true, alternativeId: selected.value })
      : invalid(
          'INVALID_UNION_ACCEPTED_SELECTION',
          'Accepted union selection does not match an alternative.',
        );
  }

  if (
    typeof value === 'string'
    && descriptors.some(({ id }) => id === value)
  ) {
    return Object.freeze({ ok: true, alternativeId: value });
  }

  const acceptedShape = contractShape(value);
  if (!acceptedShape) {
    return invalid(
      'INVALID_UNION_ACCEPTED_SELECTION',
      'Accepted union selection is not readable.',
    );
  }
  const matches = descriptors.filter(
    ({ initialValue }) =>
      initialValue.found
      && contractShape(initialValue.value) === acceptedShape,
  );
  return matches.length === 1
    ? Object.freeze({ ok: true, alternativeId: matches[0]!.id })
    : invalid(
        'INVALID_UNION_ACCEPTED_SELECTION',
        'Accepted union selection does not match exactly one alternative.',
      );
}

interface AlternativeDescriptor {
  readonly id: string;
  readonly initialValue: OwnDataResult;
}

function readAlternativeDescriptors(value: unknown): readonly AlternativeDescriptor[] | undefined {
  const length = readArrayLength(value);
  if (length === undefined || length === 0) return undefined;
  const result: AlternativeDescriptor[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const item = readOwnData(value as object, String(index));
    if (!item.ok || !item.found) return undefined;
    const descriptor = asOwnRecord(item.value);
    const id = readOwnData(descriptor, 'id');
    if (
      !id.ok
      || !id.found
      || typeof id.value !== 'string'
      || id.value.length === 0
      || ids.has(id.value)
    ) {
      return undefined;
    }
    const initialValue = readOwnData(descriptor, 'initialValue');
    if (!initialValue.ok) return undefined;
    ids.add(id.value);
    result.push(Object.freeze({ id: id.value, initialValue }));
  }
  return Object.freeze(result);
}

function contractShape(value: unknown): ContractShape | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : undefined;
  if (Array.isArray(value)) return readArrayLength(value) === undefined ? undefined : 'array';
  return asOwnRecord(value) ? 'map' : undefined;
}

type OwnDataResult = Readonly<
  | { ok: true; found: false; value?: undefined }
  | { ok: true; found: true; value: unknown }
  | { ok: false; found: false; value?: undefined }
>;

function readOwnData(record: object | undefined, key: PropertyKey): OwnDataResult {
  if (!record) return Object.freeze({ ok: true, found: false });
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return Object.freeze({ ok: true, found: false });
    return 'value' in descriptor
      ? Object.freeze({ ok: true, found: true, value: descriptor.value })
      : Object.freeze({ ok: false, found: false });
  } catch {
    return Object.freeze({ ok: false, found: false });
  }
}

function readArrayLength(value: unknown): number | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !length
      || !('value' in length)
      || !Number.isSafeInteger(length.value)
      || length.value < 0
    ) {
      return undefined;
    }
    for (let index = 0; index < length.value; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !('value' in item)) return undefined;
    }
    return length.value;
  } catch {
    return undefined;
  }
}

function asOwnRecord(value: unknown): OwnRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? value as OwnRecord
      : undefined;
  } catch {
    return undefined;
  }
}

function invalid(
  code: Extract<SchemaEditorUnionSelectionResult, { ok: false }>['code'],
  message: string,
): SchemaEditorUnionSelectionResult {
  return Object.freeze({ ok: false, code, message });
}
