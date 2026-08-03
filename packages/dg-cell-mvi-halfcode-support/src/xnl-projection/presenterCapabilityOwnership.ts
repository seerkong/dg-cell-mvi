import type {
  XnlProjectionPresenterCapabilityDiagnostic,
  XnlProjectionPresenterCapabilityDiagnosticCode,
  XnlProjectionPresenterCapabilityProtocol,
} from 'dg-cell-mvi-halfcode-contract';
import { snapshotXnlProjectionSerializableValue } from './presenterData';

export type XnlProjectionPresenterOwnedGrantKind = 'snapshot' | 'method';

export interface XnlProjectionPresenterOwnedGrantRecord {
  readonly grant: object;
  readonly id: string;
  readonly kind: XnlProjectionPresenterOwnedGrantKind;
  readonly sourceKey: string | symbol;
  readonly facadeKey: string | symbol;
  protocol?: object;
}

export interface XnlProjectionPresenterOwnedProtocolRecord {
  readonly protocol: object;
  readonly id: string;
  readonly grants: readonly XnlProjectionPresenterOwnedGrantRecord[];
}

export interface XnlProjectionPresenterOwnedFacadeRecord {
  readonly facade: object;
  readonly protocol: object;
}

export interface XnlProjectionPresenterOwnedFacetRecord {
  readonly facet: object;
  readonly protocol: object;
  readonly protocolId: string;
  readonly facade: object;
}

export type XnlProjectionPresenterGrantCapture =
  | Readonly<{
      kind: 'snapshot';
      facadeKey: PropertyKey;
      value: unknown;
    }>
  | Readonly<{
      kind: 'method';
      facadeKey: PropertyKey;
      value: (...args: unknown[]) => unknown;
    }>;

export type XnlProjectionPresenterProtocolResolution =
  | Readonly<{
      ok: true;
      record: XnlProjectionPresenterOwnedProtocolRecord;
    }>
  | Readonly<{
      ok: false;
      diagnostic: XnlProjectionPresenterCapabilityDiagnostic;
    }>;

export type XnlProjectionPresenterGrantCaptureResult =
  | Readonly<{
      ok: true;
      captures: readonly XnlProjectionPresenterGrantCapture[];
    }>
  | Readonly<{
      ok: false;
      diagnostic: XnlProjectionPresenterCapabilityDiagnostic;
    }>;

const OWNED_GRANTS = new WeakMap<object, XnlProjectionPresenterOwnedGrantRecord>();
const OWNED_PROTOCOLS = new WeakMap<object, XnlProjectionPresenterOwnedProtocolRecord>();
const OWNED_FACADES = new WeakMap<object, XnlProjectionPresenterOwnedFacadeRecord>();
const OWNED_FACETS = new WeakMap<object, XnlProjectionPresenterOwnedFacetRecord>();

export function registerOwnedXnlProjectionPresenterGrant(
  grant: object,
  record: Omit<XnlProjectionPresenterOwnedGrantRecord, 'grant' | 'protocol'>,
): void {
  OWNED_GRANTS.set(grant, { grant, ...record });
}

export function registerOwnedXnlProjectionPresenterProtocol<
  THost extends object,
  TView extends object,
>(
  protocol: XnlProjectionPresenterCapabilityProtocol<THost, TView>,
  grants: readonly object[],
): void {
  const records: XnlProjectionPresenterOwnedGrantRecord[] = [];
  for (const grant of grants) {
    const record = OWNED_GRANTS.get(grant);
    if (record === undefined) {
      throw new TypeError('Presenter protocol contains a grant not owned by this support capsule.');
    }
    if (record.protocol !== undefined) {
      throw new TypeError(`Presenter grant "${record.id}" already has a protocol owner.`);
    }
    records.push(record);
  }

  for (const record of records) record.protocol = protocol;
  OWNED_PROTOCOLS.set(protocol, {
    protocol,
    id: protocol.id,
    grants: Object.freeze([...records]),
  });
}

export function inspectOwnedXnlProjectionPresenterGrant(
  value: unknown,
): XnlProjectionPresenterOwnedGrantRecord | undefined {
  return isObject(value) ? OWNED_GRANTS.get(value) : undefined;
}

export function registerOwnedXnlProjectionPresenterFacade(
  facade: object,
  protocol: object,
): void {
  OWNED_FACADES.set(facade, { facade, protocol });
}

export function inspectOwnedXnlProjectionPresenterFacade(
  value: unknown,
): XnlProjectionPresenterOwnedFacadeRecord | undefined {
  return isObject(value) ? OWNED_FACADES.get(value) : undefined;
}

export function registerOwnedXnlProjectionPresenterFacet(
  facet: object,
  protocol: object,
  facade: object,
): void {
  if (OWNED_FACETS.has(facet)) {
    throw new TypeError('Presenter runtime facet already has an owner record.');
  }
  const protocolRecord = OWNED_PROTOCOLS.get(protocol);
  if (protocolRecord === undefined) {
    throw new TypeError('Presenter runtime facet protocol is not support-owned.');
  }
  const record = Object.freeze({
    facet,
    protocol,
    protocolId: protocolRecord.id,
    facade,
  });
  if (!isValidOwnedPresenterFacetRecord(record)) {
    throw new TypeError('Presenter runtime facet owner record does not match its protocol and facade.');
  }
  OWNED_FACETS.set(facet, record);
}

export function resolveOwnedXnlProjectionPresenterFacet(
  value: unknown,
): XnlProjectionPresenterOwnedFacetRecord | undefined {
  if (!isObject(value)) return undefined;
  const record = OWNED_FACETS.get(value);
  if (record === undefined) return undefined;
  try {
    return isValidOwnedPresenterFacetRecord(record) ? record : undefined;
  } catch {
    return undefined;
  }
}

export function wrapOwnedXnlProjectionPresenterMethod(
  method: (...args: unknown[]) => unknown,
  source: object,
  protocol: object,
): (...args: unknown[]) => unknown {
  return Object.freeze(function presenterMethodReturnGuard(...args: unknown[]): unknown {
    const result = method(...args);
    if (result instanceof Promise) {
      return result.then((value) => containPresenterMethodResult(value, source, protocol));
    }
    return containPresenterMethodResult(result, source, protocol);
  });
}

export function resolveOwnedXnlProjectionPresenterProtocol(
  value: unknown,
): XnlProjectionPresenterProtocolResolution {
  if (!isObject(value)) {
    return protocolFailure(
      'INVALID_XNL_PROJECTION_PRESENTER_PROTOCOL',
      'Presenter protocol must be an object owned by this support capsule.',
    );
  }
  const record = OWNED_PROTOCOLS.get(value);
  if (record === undefined) {
    return protocolFailure(
      'UNKNOWN_XNL_PROJECTION_PRESENTER_PROTOCOL',
      'Presenter protocol is not owned by this support capsule.',
    );
  }
  return {
    ok: true,
    record,
  };
}

export function captureXnlProjectionPresenterProtocolGrants<
  THost extends object,
  TView extends object,
>(
  source: THost,
  protocol: XnlProjectionPresenterCapabilityProtocol<THost, TView>,
): XnlProjectionPresenterGrantCaptureResult {
  const resolution = resolveOwnedXnlProjectionPresenterProtocol(protocol);
  if (!resolution.ok) return resolution;
  if (!isObject(source)) {
    return grantFailure('Presenter grant source must be an object.');
  }

  const captures: XnlProjectionPresenterGrantCapture[] = [];
  for (const grant of resolution.record.grants) {
    if (grant.protocol !== protocol) {
      return grantFailure(`Presenter grant "${grant.id}" has an unknown protocol owner.`);
    }
    const descriptor = findExplicitDataDescriptor(source, grant);
    if (!descriptor.ok) return descriptor;

    if (grant.kind === 'method') {
      if (typeof descriptor.value !== 'function') {
        return grantFailure(`Presenter method grant "${grant.id}" must target a data-function descriptor.`);
      }
      try {
        const bound = Function.prototype.bind.call(descriptor.value, source) as
          (...args: unknown[]) => unknown;
        captures.push(Object.freeze({
          kind: 'method',
          facadeKey: grant.facadeKey,
          value: bound,
        }));
      } catch (error) {
        return grantFailure(
          `Presenter method grant "${grant.id}" could not bind its owner: ${errorMessage(error)}`,
        );
      }
      continue;
    }

    const snapshot = snapshotXnlProjectionSerializableValue(
      descriptor.value,
      `Presenter snapshot grant "${grant.id}"`,
    );
    if (!snapshot.ok) return grantFailure(snapshot.message);
    captures.push(Object.freeze({
      kind: 'snapshot',
      facadeKey: grant.facadeKey,
      value: snapshot.value,
    }));
  }

  return { ok: true, captures: Object.freeze(captures) };
}

function findExplicitDataDescriptor(
  source: object,
  grant: XnlProjectionPresenterOwnedGrantRecord,
):
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; diagnostic: XnlProjectionPresenterCapabilityDiagnostic }> {
  const visited = new Set<object>();
  let current: object | null = source;
  try {
    while (current !== null) {
      if (visited.has(current)) {
        return grantFailure(`Presenter grant "${grant.id}" encountered a cyclic prototype chain.`);
      }
      visited.add(current);
      const descriptor = Object.getOwnPropertyDescriptor(current, grant.sourceKey);
      if (descriptor !== undefined) {
        if (!('value' in descriptor)) {
          return grantFailure(`Presenter grant "${grant.id}" must not target an accessor.`);
        }
        return { ok: true, value: descriptor.value };
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch (error) {
    return grantFailure(
      `Presenter grant "${grant.id}" reflection failed closed: ${errorMessage(error)}`,
    );
  }
  return grantFailure(
    `Presenter grant "${grant.id}" target ${String(grant.sourceKey)} was not found as a data descriptor.`,
  );
}

function protocolFailure(
  code: Extract<
    XnlProjectionPresenterCapabilityDiagnosticCode,
    'INVALID_XNL_PROJECTION_PRESENTER_PROTOCOL' | 'UNKNOWN_XNL_PROJECTION_PRESENTER_PROTOCOL'
  >,
  message: string,
): Readonly<{ ok: false; diagnostic: XnlProjectionPresenterCapabilityDiagnostic }> {
  return { ok: false, diagnostic: capabilityDiagnostic(code, message) };
}

function grantFailure(
  message: string,
): Readonly<{ ok: false; diagnostic: XnlProjectionPresenterCapabilityDiagnostic }> {
  return {
    ok: false,
    diagnostic: capabilityDiagnostic('INVALID_XNL_PROJECTION_PRESENTER_GRANT', message),
  };
}

function capabilityDiagnostic(
  code: XnlProjectionPresenterCapabilityDiagnosticCode,
  message: string,
): XnlProjectionPresenterCapabilityDiagnostic {
  return Object.freeze({ severity: 'error', code, message });
}

function containPresenterMethodResult(
  value: unknown,
  source: object,
  protocol: object,
): unknown {
  if (value === source) {
    throw invalidMethodResult(
      'Presenter method returned its raw source identity; method effects may already have occurred.',
    );
  }

  const ownedFacade = inspectOwnedXnlProjectionPresenterFacade(value);
  if (ownedFacade !== undefined) {
    if (ownedFacade.protocol !== protocol) {
      throw invalidMethodResult(
        'Presenter method returned a facade owned by a different protocol; method effects may already have occurred.',
      );
    }
    return ownedFacade.facade;
  }

  const snapshot = snapshotXnlProjectionSerializableValue(
    value,
    'Presenter method result',
  );
  if (!snapshot.ok) {
    throw invalidMethodResult(
      `${snapshot.message} Method effects may already have occurred.`,
    );
  }
  return snapshot.value;
}

function isValidOwnedPresenterFacetRecord(
  record: XnlProjectionPresenterOwnedFacetRecord,
): boolean {
  if (
    !Object.isFrozen(record)
    || record.facet === record.facade
    || !Object.isFrozen(record.facet)
    || Object.getPrototypeOf(record.facet) !== Object.prototype
  ) {
    return false;
  }

  const protocolRecord = OWNED_PROTOCOLS.get(record.protocol);
  const facadeRecord = OWNED_FACADES.get(record.facade);
  if (
    protocolRecord === undefined
    || protocolRecord.protocol !== record.protocol
    || protocolRecord.id !== record.protocolId
    || facadeRecord === undefined
    || facadeRecord.facade !== record.facade
    || facadeRecord.protocol !== record.protocol
  ) {
    return false;
  }

  const facetKeys = Reflect.ownKeys(record.facet);
  if (
    facetKeys.length !== 2
    || !facetKeys.includes('protocolId')
    || !facetKeys.includes('view')
  ) {
    return false;
  }
  const protocolId = Object.getOwnPropertyDescriptor(record.facet, 'protocolId');
  const view = Object.getOwnPropertyDescriptor(record.facet, 'view');
  if (
    !isFrozenEnumerableDataPropertyWithValue(protocolId, record.protocolId)
    || !isFrozenEnumerableDataPropertyWithValue(view, record.facade)
  ) {
    return false;
  }

  if (!Object.isFrozen(record.facade) || Object.getPrototypeOf(record.facade) !== null) {
    return false;
  }
  const facadeKeys = Reflect.ownKeys(record.facade);
  if (facadeKeys.length !== protocolRecord.grants.length) return false;
  for (const grant of protocolRecord.grants) {
    if (grant.protocol !== record.protocol || !facadeKeys.includes(grant.facadeKey)) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(record.facade, grant.facadeKey);
    if (!isFrozenEnumerableDataProperty(descriptor)) return false;
  }
  return true;
}

function isFrozenEnumerableDataProperty(
  descriptor: PropertyDescriptor | undefined,
): boolean {
  return descriptor !== undefined
    && 'value' in descriptor
    && descriptor.enumerable === true
    && descriptor.configurable === false
    && descriptor.writable === false;
}

function isFrozenEnumerableDataPropertyWithValue(
  descriptor: PropertyDescriptor | undefined,
  expectedValue: unknown,
): boolean {
  return isFrozenEnumerableDataProperty(descriptor)
    && descriptor?.value === expectedValue;
}

function invalidMethodResult(message: string): TypeError {
  return new TypeError(`INVALID_XNL_PROJECTION_PRESENTER_METHOD_RESULT: ${message}`);
}

function isObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
