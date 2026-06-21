import {
  snapshotSerializableValue,
  type SchemaEditorCommand,
  type SchemaEditorCommandTemplate,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
} from 'dg-cell-mvi-halfcode-contract';

import {
  resolveSchemaEditorCommand,
  type SchemaEditorCommandResolutionDiagnostic,
  type SchemaEditorWildcardBinding,
} from './commandResolver';

export type SchemaEditorRevision = string | number;

export interface SchemaEditorSnapshot<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> {
  readonly value: T;
  readonly revision: SchemaEditorRevision;
}

export interface SchemaEditorApplyRequest {
  readonly command: SchemaEditorCommand;
  readonly expectedRevision: SchemaEditorRevision;
}

export interface SchemaEditorSessionDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type SchemaEditorApplyResult<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> =
  | {
      readonly status: 'accepted';
      readonly baseRevision: SchemaEditorRevision;
      readonly snapshot: SchemaEditorSnapshot<T>;
    }
  | {
      readonly status: 'rejected';
      readonly baseRevision: SchemaEditorRevision;
      readonly issues: readonly SchemaEditorSessionDiagnostic[];
    }
  | {
      readonly status: 'conflict';
      readonly baseRevision: SchemaEditorRevision;
      readonly actualSnapshot?: SchemaEditorSnapshot<T>;
      readonly issues?: readonly SchemaEditorSessionDiagnostic[];
    };

export type SchemaEditorValueHostConfig = Readonly<Record<string, unknown>>;

export type SchemaEditorValueHost<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> = (
  runtime: unknown,
  input: SchemaEditorApplyRequest,
  config: SchemaEditorValueHostConfig,
) => SchemaEditorApplyResult<T> | Promise<SchemaEditorApplyResult<T>>;

export interface CreateSchemaEditorSessionInput<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> {
  readonly initialSnapshot: SchemaEditorSnapshot<T>;
  readonly valueHost: SchemaEditorValueHost<T>;
}

export interface CreateSchemaEditorSessionConfig {
  readonly sessionId: string;
  readonly valueHostId: string;
  readonly valueHostConfig?: SchemaEditorValueHostConfig;
}

export interface SchemaEditorSessionDispatchInput {
  readonly template: SchemaEditorCommandTemplate;
  readonly event: SchemaEditorContractValue;
  readonly wildcardBindings?: readonly SchemaEditorWildcardBinding[];
}

export interface SchemaEditorSessionPendingRequest {
  readonly requestId: string;
  readonly expectedRevision: SchemaEditorRevision;
}

export interface SchemaEditorSessionState<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> {
  readonly sessionId: string;
  readonly snapshot: SchemaEditorSnapshot<T>;
  readonly pending: readonly SchemaEditorSessionPendingRequest[];
  readonly diagnostics: readonly SchemaEditorSessionDiagnostic[];
  readonly disposed: boolean;
}

export interface SchemaEditorSession<
  T extends SchemaEditorContractValue = SchemaEditorContractValue,
> {
  getState(): SchemaEditorSessionState<T>;
  subscribe(subscriber: (state: SchemaEditorSessionState<T>) => void): () => void;
  dispatch(input: SchemaEditorSessionDispatchInput): Promise<void>;
  dispose(): void;
}

type SafeRecord = Record<string, SchemaEditorContractValue | undefined>;

interface InternalState<T extends SchemaEditorContractValue> {
  snapshot: SchemaEditorSnapshot<T>;
  pending: SchemaEditorSessionPendingRequest[];
  diagnostics: SchemaEditorSessionDiagnostic[];
  disposed: boolean;
}

interface ParsedHostResult<T extends SchemaEditorContractValue> {
  status: 'accepted' | 'rejected' | 'conflict';
  baseRevision: SchemaEditorRevision;
  snapshot?: SchemaEditorSnapshot<T>;
  issues: SchemaEditorSessionDiagnostic[];
}

const EMPTY_RESOLVER_CONFIG = Object.freeze({});

export function createSchemaEditorSession<T extends SchemaEditorContractValue>(
  runtime: unknown,
  input: CreateSchemaEditorSessionInput<T>,
  config: CreateSchemaEditorSessionConfig,
): SchemaEditorSession<T> {
  const initialSnapshotValue = readRequiredDataProperty(input, 'initialSnapshot');
  const valueHost = readRequiredDataProperty(input, 'valueHost');
  const sessionId = readRequiredDataProperty(config, 'sessionId');
  const valueHostId = readRequiredDataProperty(config, 'valueHostId');
  const valueHostConfig = readOptionalDataProperty(config, 'valueHostConfig');

  if (typeof valueHost !== 'function') {
    throw new TypeError('SchemaEditorSession requires a ValueHost function.');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('SchemaEditorSession requires a non-empty sessionId.');
  }
  if (typeof valueHostId !== 'string' || valueHostId.length === 0) {
    throw new TypeError('SchemaEditorSession requires a non-empty valueHostId.');
  }
  const ownedValueHost = valueHost as SchemaEditorValueHost<T>;
  const ownedSessionId: string = sessionId;

  const initialSnapshot = parseSnapshot<T>(initialSnapshotValue, '$.initialSnapshot');
  if (!initialSnapshot.ok) {
    throw new TypeError('SchemaEditorSession requires a valid descriptor-safe initial snapshot.');
  }

  const hostConfig = createHostConfig(valueHostConfig, ownedSessionId, valueHostId);
  const state: InternalState<T> = {
    snapshot: initialSnapshot.value,
    pending: [],
    diagnostics: [],
    disposed: false,
  };
  const subscribers = new Set<(value: SchemaEditorSessionState<T>) => void>();
  let nextRequestId = 1;

  function getState(): SchemaEditorSessionState<T> {
    return publishableState(ownedSessionId, state);
  }

  function publish(): void {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(getState());
      } catch {
        // Subscriber failures do not alter authoritative session state.
      }
    }
  }

  function appendDiagnostics(diagnostics: readonly SchemaEditorSessionDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
      state.diagnostics.push(freezeDiagnostic(diagnostic));
    }
  }

  function removePending(requestId: string): SchemaEditorSessionPendingRequest | undefined {
    const index = state.pending.findIndex((item) => item.requestId === requestId);
    if (index < 0) return undefined;
    return state.pending.splice(index, 1)[0];
  }

  async function dispatch(dispatchInput: SchemaEditorSessionDispatchInput): Promise<void> {
    if (state.disposed) throw new Error('SchemaEditorSession is disposed.');

    const capturedSnapshot = cloneFrozenSnapshot(state.snapshot);
    const dispatchSnapshot = snapshotDispatchInput(dispatchInput);
    if (!dispatchSnapshot.ok) {
      appendDiagnostics(dispatchSnapshot.diagnostics);
      publish();
      return;
    }

    let resolution;
    try {
      resolution = resolveSchemaEditorCommand(
        runtime,
        {
          template: dispatchSnapshot.value.template,
          event: dispatchSnapshot.value.event,
          snapshot: capturedSnapshot.value,
          ...(dispatchSnapshot.value.wildcardBindings === undefined
            ? {}
            : { wildcardBindings: dispatchSnapshot.value.wildcardBindings }),
        },
        EMPTY_RESOLVER_CONFIG,
      );
    } catch {
      appendDiagnostics([sessionDiagnostic(
        '$.dispatch',
        'SCHEMA_EDITOR_RESOLUTION_FAILED',
        'Command resolution failed without producing a valid command.',
      )]);
      publish();
      return;
    }

    if (!resolution.ok) {
      appendDiagnostics(resolution.diagnostics);
      publish();
      return;
    }

    const requestId = `${ownedSessionId}:${nextRequestId}`;
    nextRequestId += 1;
    const pending = Object.freeze({
      requestId,
      expectedRevision: capturedSnapshot.revision,
    });
    state.pending.push(pending);
    publish();

    const request = freezeApplyRequest({
      command: resolution.command,
      expectedRevision: capturedSnapshot.revision,
    });

    let hostResult: unknown;
    try {
      hostResult = await ownedValueHost(runtime, request, hostConfig);
    } catch {
      if (state.disposed) return;
      if (!removePending(requestId)) return;
      appendDiagnostics([sessionDiagnostic(
        '$.host',
        'SCHEMA_EDITOR_HOST_FAILED',
        'ValueHost failed while applying the command.',
      )]);
      publish();
      return;
    }

    if (state.disposed) return;
    const activePending = removePending(requestId);
    if (!activePending) return;

    const parsed = parseHostResult<T>(hostResult);
    if (!parsed.ok) {
      appendDiagnostics(parsed.diagnostics);
      publish();
      return;
    }

    if (parsed.value.status !== 'accepted') {
      appendDiagnostics([
        ...parsed.value.issues,
        sessionDiagnostic(
          '$.hostResult.status',
          parsed.value.status === 'rejected'
            ? 'SCHEMA_EDITOR_HOST_REJECTED'
            : 'SCHEMA_EDITOR_HOST_CONFLICT',
          parsed.value.status === 'rejected'
            ? 'ValueHost rejected the command.'
            : 'ValueHost reported a revision conflict.',
        ),
      ]);
      publish();
      return;
    }

    const acceptedSnapshot = parsed.value.snapshot!;
    const currentRevision = state.snapshot.revision;
    if (
      parsed.value.baseRevision !== activePending.expectedRevision ||
      activePending.expectedRevision !== currentRevision ||
      acceptedSnapshot.revision === currentRevision
    ) {
      appendDiagnostics([sessionDiagnostic(
        '$.hostResult',
        'SCHEMA_EDITOR_STALE_ACCEPTANCE',
        'Accepted host result does not advance the current authoritative revision.',
      )]);
      publish();
      return;
    }

    state.snapshot = cloneFrozenSnapshot(acceptedSnapshot);
    publish();
  }

  function subscribe(subscriber: (value: SchemaEditorSessionState<T>) => void): () => void {
    if (typeof subscriber !== 'function' || state.disposed) return () => undefined;
    subscriber(getState());
    if (state.disposed) return () => undefined;
    subscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(subscriber);
    };
  }

  function dispose(): void {
    if (state.disposed) return;
    state.disposed = true;
    state.pending = [];
    publish();
    subscribers.clear();
  }

  return Object.freeze({ getState, subscribe, dispatch, dispose });
}

function snapshotDispatchInput(input: unknown):
  | {
      ok: true;
      value: {
        template: SchemaEditorCommandTemplate;
        event: SchemaEditorContractValue;
        wildcardBindings?: readonly SchemaEditorWildcardBinding[];
      };
    }
  | { ok: false; diagnostics: SchemaEditorSessionDiagnostic[] } {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(input, '$.dispatch', issues);
  if (snapshot === undefined || !isSafeRecord(snapshot)) {
    return { ok: false, diagnostics: validationDiagnostics(issues, '$.dispatch') };
  }
  if (!hasOwn(snapshot, 'template') || !hasOwn(snapshot, 'event')) {
    return {
      ok: false,
      diagnostics: [sessionDiagnostic(
        '$.dispatch',
        'INVALID_SCHEMA_EDITOR_DISPATCH',
        'Dispatch requires own template and event data properties.',
      )],
    };
  }
  const wildcardBindings = hasOwn(snapshot, 'wildcardBindings')
    ? snapshot.wildcardBindings
    : undefined;
  if (wildcardBindings !== undefined && !Array.isArray(wildcardBindings)) {
    return {
      ok: false,
      diagnostics: [sessionDiagnostic(
        '$.dispatch.wildcardBindings',
        'INVALID_WILDCARD_BINDINGS',
        'Wildcard bindings must be an array.',
      )],
    };
  }
  return {
    ok: true,
    value: {
      template: snapshot.template as unknown as SchemaEditorCommandTemplate,
      event: snapshot.event as SchemaEditorContractValue,
      ...(wildcardBindings === undefined
        ? {}
        : { wildcardBindings: wildcardBindings as readonly SchemaEditorWildcardBinding[] }),
    },
  };
}

function parseHostResult<T extends SchemaEditorContractValue>(result: unknown):
  | { ok: true; value: ParsedHostResult<T> }
  | { ok: false; diagnostics: SchemaEditorSessionDiagnostic[] } {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(result, '$.hostResult', issues);
  if (snapshot === undefined || !isSafeRecord(snapshot)) {
    return { ok: false, diagnostics: validationDiagnostics(issues, '$.hostResult') };
  }

  const status = snapshot.status;
  const baseRevision = snapshot.baseRevision;
  if (
    (status !== 'accepted' && status !== 'rejected' && status !== 'conflict') ||
    !hasOwn(snapshot, 'baseRevision') ||
    !isRevision(baseRevision)
  ) {
    return malformedHostResult();
  }

  if (status === 'accepted') {
    if (!hasOwn(snapshot, 'snapshot')) return malformedHostResult();
    const acceptedSnapshot = parseClonedSnapshot<T>(snapshot.snapshot);
    if (!acceptedSnapshot) return malformedHostResult();
    return {
      ok: true,
      value: { status, baseRevision, snapshot: acceptedSnapshot, issues: [] },
    };
  }

  const hostIssues = hasOwn(snapshot, 'issues')
    ? parseHostIssues(snapshot.issues)
    : status === 'rejected'
      ? undefined
      : [];
  if (hostIssues === undefined) return malformedHostResult();

  return {
    ok: true,
    value: { status, baseRevision, issues: hostIssues },
  };
}

function parseSnapshot<T extends SchemaEditorContractValue>(value: unknown, path: string):
  | { ok: true; value: SchemaEditorSnapshot<T> }
  | { ok: false } {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, path, issues);
  if (snapshot === undefined) return { ok: false };
  const parsed = parseClonedSnapshot<T>(snapshot);
  return parsed ? { ok: true, value: parsed } : { ok: false };
}

function parseClonedSnapshot<T extends SchemaEditorContractValue>(
  value: SchemaEditorContractValue | undefined,
): SchemaEditorSnapshot<T> | undefined {
  if (!isSafeRecord(value) || !hasOwn(value, 'value') || !hasOwn(value, 'revision')) return undefined;
  if (!isRevision(value.revision)) return undefined;
  return cloneFrozenSnapshot({
    value: value.value as T,
    revision: value.revision,
  });
}

function parseHostIssues(value: SchemaEditorContractValue | undefined): SchemaEditorSessionDiagnostic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const diagnostics: SchemaEditorSessionDiagnostic[] = [];
  for (const item of value) {
    if (
      !isSafeRecord(item) ||
      typeof item.path !== 'string' ||
      typeof item.code !== 'string' ||
      typeof item.message !== 'string'
    ) {
      return undefined;
    }
    diagnostics.push(freezeDiagnostic({
      path: item.path,
      code: item.code,
      message: item.message,
    }));
  }
  return diagnostics;
}

function malformedHostResult(): { ok: false; diagnostics: SchemaEditorSessionDiagnostic[] } {
  return {
    ok: false,
    diagnostics: [sessionDiagnostic(
      '$.hostResult',
      'MALFORMED_SCHEMA_EDITOR_HOST_RESULT',
      'ValueHost returned a malformed apply result.',
    )],
  };
}

function validationDiagnostics(
  issues: readonly SchemaEditorValidationIssue[],
  fallbackPath: string,
): SchemaEditorSessionDiagnostic[] {
  if (issues.length === 0) {
    return [sessionDiagnostic(
      fallbackPath,
      'MALFORMED_SCHEMA_EDITOR_DATA',
      'Schema-editor data could not be read safely.',
    )];
  }
  return issues.map((issue) => freezeDiagnostic({
    path: issue.path,
    code: issue.code ?? 'MALFORMED_SCHEMA_EDITOR_DATA',
    message: issue.message,
  }));
}

function publishableState<T extends SchemaEditorContractValue>(
  sessionId: string,
  state: InternalState<T>,
): SchemaEditorSessionState<T> {
  return Object.freeze({
    sessionId,
    snapshot: cloneFrozenSnapshot(state.snapshot),
    pending: Object.freeze(state.pending.map((item) => Object.freeze({ ...item }))),
    diagnostics: Object.freeze(state.diagnostics.map((item) => freezeDiagnostic(item))),
    disposed: state.disposed,
  });
}

function cloneFrozenSnapshot<T extends SchemaEditorContractValue>(
  snapshot: SchemaEditorSnapshot<T>,
): SchemaEditorSnapshot<T> {
  return Object.freeze({
    value: cloneFrozenContractValue(snapshot.value),
    revision: snapshot.revision,
  });
}

function cloneFrozenContractValue<T extends SchemaEditorContractValue>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneFrozenContractValue(item))) as T;
  }
  const clone = Object.create(null) as Record<string, SchemaEditorContractValue | undefined>;
  for (const key of Object.keys(value)) {
    Object.defineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: cloneFrozenContractValue(value[key]!),
    });
  }
  return Object.freeze(clone) as T;
}

function freezeApplyRequest(request: SchemaEditorApplyRequest): SchemaEditorApplyRequest {
  return Object.freeze({
    command: cloneFrozenContractValue(request.command as SchemaEditorContractValue) as SchemaEditorCommand,
    expectedRevision: request.expectedRevision,
  });
}

function createHostConfig(
  value: unknown,
  sessionId: string,
  valueHostId: string,
): SchemaEditorValueHostConfig {
  const base = value === undefined ? {} : cloneConfigRecord(value);
  return Object.freeze({ ...base, sessionId, valueHostId });
}

function cloneConfigRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('SchemaEditorSession valueHostConfig must be a record.');
  }
  let names: string[];
  try {
    names = Object.getOwnPropertyNames(value);
  } catch {
    throw new TypeError('SchemaEditorSession valueHostConfig could not be inspected safely.');
  }
  const clone: Record<string, unknown> = {};
  for (const name of names) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      throw new TypeError('SchemaEditorSession valueHostConfig could not be inspected safely.');
    }
    if (!descriptor || !('value' in descriptor)) {
      throw new TypeError('SchemaEditorSession valueHostConfig must use data properties.');
    }
    Object.defineProperty(clone, name, {
      configurable: false,
      enumerable: descriptor.enumerable ?? false,
      writable: false,
      value: descriptor.value,
    });
  }
  return Object.freeze(clone);
}

function readRequiredDataProperty(value: unknown, name: string): unknown {
  const property = readDataProperty(value, name);
  if (!property.found) throw new TypeError(`SchemaEditorSession requires own ${name}.`);
  return property.value;
}

function readOptionalDataProperty(value: unknown, name: string): unknown {
  const property = readDataProperty(value, name);
  return property.found ? property.value : undefined;
}

function readDataProperty(value: unknown, name: string): { found: boolean; value?: unknown } {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return { found: false };
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !('value' in descriptor)) return { found: false };
    return { found: true, value: descriptor.value };
  } catch {
    return { found: false };
  }
}

function isSafeRecord(value: unknown): value is SafeRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: SafeRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRevision(value: unknown): value is SchemaEditorRevision {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function sessionDiagnostic(path: string, code: string, message: string): SchemaEditorSessionDiagnostic {
  return Object.freeze({ path, code, message });
}

function freezeDiagnostic(
  diagnostic: SchemaEditorSessionDiagnostic | SchemaEditorCommandResolutionDiagnostic,
): SchemaEditorSessionDiagnostic {
  return sessionDiagnostic(diagnostic.path, diagnostic.code, diagnostic.message);
}
