import type {
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import type {
  SchemaEditorPresenterComponentProps,
} from './presentationShell';

type OwnRecord = Readonly<Record<PropertyKey, unknown>>;
type ContractValue = Exclude<SchemaEditorPresenterProps['value'], undefined>;

export interface ScalarPresenterFacts {
  readonly kind?: 'string' | 'number' | 'integer' | 'boolean' | 'null';
  readonly values: readonly ContractValue[];
  readonly constant?: ContractValue;
}

export interface NumberPresenterConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly multipleOf?: number;
}

export function readScalarPresenterFacts(
  props: SchemaEditorPresenterComponentProps,
): ScalarPresenterFacts {
  const metadata = asOwnRecord(readOwnData(asOwnRecord(props.node), 'metadata'));
  const scalar = asOwnRecord(readOwnData(metadata, 'scalar'));
  const kind = readOwnData(scalar, 'kind');
  const enumValue = readOwnData(scalar, 'enum');
  const constant = readContractScalar(readOwnData(scalar, 'const'));

  return Object.freeze({
    ...(
      kind === 'string'
      || kind === 'number'
      || kind === 'integer'
      || kind === 'boolean'
      || kind === 'null'
        ? { kind }
        : {}
    ),
    values: readContractScalarArray(enumValue),
    ...(constant !== undefined ? { constant } : {}),
  });
}

export function readNumberPresenterConstraints(
  props: SchemaEditorPresenterComponentProps,
): NumberPresenterConstraints {
  const metadata = asOwnRecord(readOwnData(asOwnRecord(props.node), 'metadata'));
  const constraints = asOwnRecord(readOwnData(metadata, 'constraints'));
  const minimum = readFiniteNumber(
    readOwnData(constraints, 'minimum')
      ?? readOwnData(constraints, 'min'),
  );
  const maximum = readFiniteNumber(
    readOwnData(constraints, 'maximum')
      ?? readOwnData(constraints, 'max'),
  );
  const multipleOf = readPositiveNumber(
    readOwnData(constraints, 'multipleOf')
      ?? readOwnData(constraints, 'step'),
  );

  return Object.freeze({
    ...(minimum !== undefined ? { min: minimum } : {}),
    ...(maximum !== undefined ? { max: maximum } : {}),
    ...(
      multipleOf !== undefined
        ? { step: multipleOf, multipleOf }
        : {}
    ),
  });
}

export function isContractScalar(
  value: unknown,
): value is null | boolean | number | string {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function readContractScalar(
  value: unknown,
): ContractValue | undefined {
  return isContractScalar(value) ? value : undefined;
}

function readContractScalarArray(
  value: unknown,
): readonly ContractValue[] {
  try {
    if (!Array.isArray(value)) return Object.freeze([]);
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !length
      || !('value' in length)
      || !Number.isSafeInteger(length.value)
      || length.value < 0
    ) {
      return Object.freeze([]);
    }
    const values: ContractValue[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !('value' in item) || !isContractScalar(item.value)) {
        return Object.freeze([]);
      }
      values.push(item.value);
    }
    return Object.freeze(values);
  } catch {
    return Object.freeze([]);
  }
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function asOwnRecord(value: unknown): OwnRecord | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    return value as OwnRecord;
  } catch {
    return undefined;
  }
}

function readOwnData(
  record: OwnRecord | undefined,
  key: PropertyKey,
): unknown {
  if (!record) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
