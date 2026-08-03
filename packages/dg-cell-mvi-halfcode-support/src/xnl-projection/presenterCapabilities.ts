import type {
  XnlProjectionPresenterCapabilityProtocol,
  XnlProjectionPresenterDeepReadonly,
  XnlProjectionPresenterMethodGrant,
  XnlProjectionPresenterMethodKey,
  XnlProjectionPresenterReadonlyView,
  XnlProjectionPresenterSnapshotGrant,
  XnlProjectionPresenterSnapshotKey,
  XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import { isStableXnlProjectionId } from './presenterData';
import {
  inspectOwnedXnlProjectionPresenterGrant,
  registerOwnedXnlProjectionPresenterGrant,
  registerOwnedXnlProjectionPresenterProtocol,
} from './presenterCapabilityOwnership';

export type XnlProjectionPresenterCapabilityFactoryRuntime = Readonly<
  Record<PropertyKey, never>
>;

export type XnlProjectionPresenterCapabilityFactoryConfig = Readonly<
  Record<PropertyKey, never>
>;

export interface CreateXnlProjectionPresenterSnapshotGrantInput<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleSnapshotSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterSnapshotKey<TView>, string | symbol>,
> {
  readonly id: string;
  readonly sourceKey: TSourceKey;
  readonly facadeKey: TFacadeKey;
}

export interface CreateXnlProjectionPresenterMethodGrantInput<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleMethodSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterMethodKey<TView>, string | symbol>,
> {
  readonly id: string;
  readonly sourceKey: TSourceKey;
  readonly facadeKey: TFacadeKey;
}

export interface XnlProjectionPresenterOwnedGrantLike {
  readonly id: string;
  readonly kind: 'snapshot' | 'method';
  readonly sourceKey: PropertyKey;
  readonly facadeKey: PropertyKey;
}

export interface CreateXnlProjectionPresenterCapabilityProtocolInput<
  THost extends object,
  TView extends object,
> {
  readonly id: string;
  readonly grants: readonly XnlProjectionPresenterCapabilityGrantFor<THost, TView>[];
}

export type XnlProjectionPresenterCapabilityGrantFor<
  THost extends object,
  TView extends object,
> =
  | XnlProjectionPresenterSnapshotGrant<THost, TView>
  | XnlProjectionPresenterMethodGrant<THost, TView>;

export type XnlProjectionPresenterCompatibleSnapshotSourceKey<
  THost extends object,
  TView extends object,
  TFacadeKey extends Extract<XnlProjectionPresenterSnapshotKey<TView>, string | symbol>,
> = {
  [TSourceKey in Extract<XnlProjectionPresenterSnapshotKey<THost>, string | symbol>]:
    XnlProjectionPresenterDeepReadonly<THost[TSourceKey]> extends
      XnlProjectionPresenterDeepReadonly<TView[TFacadeKey]>
      ? TSourceKey
      : never;
}[Extract<XnlProjectionPresenterSnapshotKey<THost>, string | symbol>];

export type XnlProjectionPresenterCompatibleMethodSourceKey<
  THost extends object,
  TView extends object,
  TFacadeKey extends Extract<XnlProjectionPresenterMethodKey<TView>, string | symbol>,
> = {
  [TSourceKey in Extract<XnlProjectionPresenterMethodKey<THost>, string | symbol>]:
    XnlProjectionPresenterMethodsAreCompatible<THost[TSourceKey], TView[TFacadeKey], TView> extends true
      ? TSourceKey
      : never;
}[Extract<XnlProjectionPresenterMethodKey<THost>, string | symbol>];

type XnlProjectionPresenterMethodsAreCompatible<
  THostMethod,
  TFacadeMethod,
  TView extends object,
> = THostMethod extends (...args: infer THostArgs) => infer THostResult
  ? TFacadeMethod extends (...args: infer TFacadeArgs) => infer TFacadeResult
    ? XnlProjectionPresenterTypesEqual<THostArgs, TFacadeArgs> extends true
      ? XnlProjectionPresenterIsDirectContainedResult<TFacadeResult, TView> extends true
        ? XnlProjectionPresenterContainedHostResult<THostResult, TView> extends infer TContained
          ? [TContained] extends [never]
            ? false
            : TContained extends Awaited<TFacadeResult> ? true : false
          : false
        : false
      : false
    : false
  : false;

type XnlProjectionPresenterContainedHostResult<
  THostResult,
  TView extends object,
> = Awaited<THostResult> extends infer TValue
  ? [TValue] extends [XnlProjectionPresenterContainableHostValue<TView>]
    ? XnlProjectionPresenterMapContainedHostValue<TValue, TView>
    : never
  : never;

type XnlProjectionPresenterContainableHostValue<TView extends object> =
  | XnlProjectionSerializableValue
  | XnlProjectionPresenterReadonlyView<TView>;

type XnlProjectionPresenterMapContainedHostValue<
  TValue,
  TView extends object,
> = TValue extends XnlProjectionSerializableValue
  ? XnlProjectionPresenterDeepReadonly<TValue>
  : TValue extends XnlProjectionPresenterReadonlyView<TView>
    ? XnlProjectionPresenterReadonlyView<TView>
    : never;

type XnlProjectionPresenterIsDirectContainedResult<
  TResult,
  TView extends object,
> = Awaited<TResult> extends infer TContained
  ? TContained extends Readonly<{ ok: boolean; kind: string }>
    ? false
    : TContained extends XnlProjectionSerializableValue | XnlProjectionPresenterReadonlyView<TView>
      ? true
      : false
  : false;

type XnlProjectionPresenterTypesEqual<TLeft, TRight> =
  [TLeft] extends [TRight]
    ? [TRight] extends [TLeft] ? true : false
    : false;

export function createXnlProjectionPresenterSnapshotGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleSnapshotSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterSnapshotKey<TView>, string | symbol>,
>(
  runtime: XnlProjectionPresenterCapabilityFactoryRuntime,
  input: CreateXnlProjectionPresenterSnapshotGrantInput<THost, TView, TSourceKey, TFacadeKey>,
  config: XnlProjectionPresenterCapabilityFactoryConfig,
): XnlProjectionPresenterSnapshotGrant<THost, TView, TSourceKey, TFacadeKey> {
  assertEmptyFactoryRecord(runtime, 'Presenter snapshot grant runtime');
  assertEmptyFactoryRecord(config, 'Presenter snapshot grant config');
  const fields = readGrantInput(input, 'snapshot');
  const grant = Object.freeze(fields);
  registerOwnedXnlProjectionPresenterGrant(grant, fields);
  return grant as unknown as XnlProjectionPresenterSnapshotGrant<THost, TView, TSourceKey, TFacadeKey>;
}

export function createXnlProjectionPresenterMethodGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleMethodSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterMethodKey<TView>, string | symbol>,
>(
  runtime: XnlProjectionPresenterCapabilityFactoryRuntime,
  input: CreateXnlProjectionPresenterMethodGrantInput<THost, TView, TSourceKey, TFacadeKey>,
  config: XnlProjectionPresenterCapabilityFactoryConfig,
): XnlProjectionPresenterMethodGrant<THost, TView, TSourceKey, TFacadeKey> {
  assertEmptyFactoryRecord(runtime, 'Presenter method grant runtime');
  assertEmptyFactoryRecord(config, 'Presenter method grant config');
  const fields = readGrantInput(input, 'method');
  const grant = Object.freeze(fields);
  registerOwnedXnlProjectionPresenterGrant(grant, fields);
  return grant as unknown as XnlProjectionPresenterMethodGrant<THost, TView, TSourceKey, TFacadeKey>;
}

export function createXnlProjectionPresenterCapabilityProtocol<
  THost extends object,
  TView extends object,
>(
  runtime: XnlProjectionPresenterCapabilityFactoryRuntime,
  input: CreateXnlProjectionPresenterCapabilityProtocolInput<THost, TView>,
  config: XnlProjectionPresenterCapabilityFactoryConfig,
): XnlProjectionPresenterCapabilityProtocol<THost, TView> {
  assertEmptyFactoryRecord(runtime, 'Presenter capability protocol runtime');
  assertEmptyFactoryRecord(config, 'Presenter capability protocol config');
  const fields = readExactDataRecord(
    input,
    ['id', 'grants'],
    'Presenter capability protocol input',
  );
  if (!isStableXnlProjectionId(fields.id)) {
    throw new TypeError('Presenter capability protocol id must be a stable non-empty string.');
  }
  const grants = snapshotOwnedGrantArray(fields.grants);
  assertUniqueProtocolGrants(grants);

  const protocol = Object.freeze({
    id: fields.id,
    grants,
  }) as unknown as XnlProjectionPresenterCapabilityProtocol<THost, TView>;
  registerOwnedXnlProjectionPresenterProtocol(protocol, grants);
  return protocol;
}

function readGrantInput(
  input: unknown,
  kind: 'snapshot' | 'method',
): Readonly<{
  id: string;
  kind: 'snapshot' | 'method';
  sourceKey: string | symbol;
  facadeKey: string | symbol;
}> {
  const fields = readExactDataRecord(
    input,
    ['id', 'sourceKey', 'facadeKey'],
    `Presenter ${kind} grant input`,
  );
  if (!isStableXnlProjectionId(fields.id)) {
    throw new TypeError(`Presenter ${kind} grant id must be a stable non-empty string.`);
  }
  if (!isPropertyKey(fields.sourceKey) || !isPropertyKey(fields.facadeKey)) {
    throw new TypeError(`Presenter ${kind} grant keys must be strings or symbols.`);
  }
  return {
    id: fields.id,
    kind,
    sourceKey: fields.sourceKey,
    facadeKey: fields.facadeKey,
  };
}

function snapshotOwnedGrantArray(value: unknown): readonly object[] {
  try {
    if (!Array.isArray(value)) {
      throw new TypeError('Presenter capability protocol grants must be an array.');
    }
    const keys = Reflect.ownKeys(value);
    const allowedKeys = new Set<PropertyKey>(['length']);
    for (let index = 0; index < value.length; index += 1) allowedKeys.add(String(index));
    if (keys.some((key) => !allowedKeys.has(key))) {
      throw new TypeError('Presenter capability protocol grants array contains extra own keys.');
    }

    const grants: object[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor) || !isObject(descriptor.value)) {
        throw new TypeError(`Presenter capability protocol grant at index ${index} must be an own data property.`);
      }
      if (inspectOwnedXnlProjectionPresenterGrant(descriptor.value) === undefined) {
        throw new TypeError(`Presenter capability protocol grant at index ${index} is not support-owned.`);
      }
      grants.push(descriptor.value);
    }
    return Object.freeze(grants);
  } catch (error) {
    throw closedTypeError('Presenter capability protocol grants could not be inspected', error);
  }
}

function assertUniqueProtocolGrants(grants: readonly object[]): void {
  const ids = new Set<string>();
  const facadeKeys = new Set<PropertyKey>();
  for (const grant of grants) {
    const record = inspectOwnedXnlProjectionPresenterGrant(grant);
    if (record === undefined) {
      throw new TypeError('Presenter capability protocol contains an unknown grant owner.');
    }
    if (ids.has(record.id)) {
      throw new TypeError(`Presenter capability protocol contains duplicate grant id "${record.id}".`);
    }
    if (facadeKeys.has(record.facadeKey)) {
      throw new TypeError(`Presenter capability protocol contains duplicate facade key ${String(record.facadeKey)}.`);
    }
    ids.add(record.id);
    facadeKeys.add(record.facadeKey);
  }
}

function assertEmptyFactoryRecord(value: unknown, label: string): void {
  try {
    if (!isObject(value) || Reflect.ownKeys(value).length !== 0) {
      throw new TypeError(`${label} must be an empty object.`);
    }
  } catch (error) {
    throw closedTypeError(`${label} could not be inspected`, error);
  }
}

function readExactDataRecord<const TKeys extends readonly string[]>(
  value: unknown,
  expectedKeys: TKeys,
  label: string,
): Record<TKeys[number], unknown> {
  try {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      throw new TypeError(`${label} must contain only ${expectedKeys.join(', ')}.`);
    }
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError(`${label}.${key} must be an own data property.`);
      }
      result[key] = descriptor.value;
    }
    return result as Record<TKeys[number], unknown>;
  } catch (error) {
    throw closedTypeError(`${label} could not be inspected`, error);
  }
}

function closedTypeError(label: string, error: unknown): TypeError {
  const message = error instanceof Error ? error.message : String(error);
  return new TypeError(`${label}: ${message}`);
}

function isPropertyKey(value: unknown): value is string | symbol {
  return typeof value === 'string' || typeof value === 'symbol';
}

function isObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}
