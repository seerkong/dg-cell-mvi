import {
  snapshotSerializableValue,
  type EditorPlanNode,
  type SchemaEditorCommandTemplate,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  SchemaEditorSession,
  SchemaEditorWildcardBinding,
} from 'dg-cell-mvi-halfcode-support';

import type {
  SchemaEditorEventBridgeDiagnostic,
  SchemaEditorEventBridgeInput,
  SchemaEditorEventBridgeResult,
  SchemaEditorEventBridgeRuntime,
} from './contracts';

export function dispatchSchemaEditorPresenterEvent(
  runtime: SchemaEditorEventBridgeRuntime,
  input: SchemaEditorEventBridgeInput,
  _config: Readonly<Record<string, never>>,
): SchemaEditorEventBridgeResult {
  const runtimeRecord = readRecord(runtime);
  const inputRecord = readRecord(input);
  const session = runtimeRecord?.get('session');
  const node = inputRecord?.get('node');
  const event = snapshotEvent(inputRecord?.get('event'));
  const wildcardBindings = snapshotWildcardBindings(inputRecord?.get('wildcardBindings'));

  if (
    !isSessionDispatchPort(session)
    || !isEditorPlanNode(node)
    || !event.ok
    || !wildcardBindings.ok
  ) {
    return failure(
      'INVALID_SCHEMA_EDITOR_PRESENTER_EVENT',
      'Schema Editor event dispatch requires own-data session, node, event and wildcard inputs.',
    );
  }

  if (isDisposed(session)) {
    return failure(
      'SCHEMA_EDITOR_SESSION_DISPOSED',
      'Schema Editor presenter events cannot dispatch to a disposed session.',
    );
  }

  const bindings = readArray(readRecord(node)?.get('commandBindings'));
  if (!bindings.ok) {
    return failure(
      'UNKNOWN_SCHEMA_EDITOR_PRESENTER_EVENT',
      `No command binding exists for presenter event "${event.value.event}".`,
    );
  }

  const matches: SchemaEditorCommandTemplate[] = [];
  for (const binding of bindings.value) {
    const record = readRecord(binding);
    if (!record || record.get('event') !== event.value.event) continue;
    const issues: SchemaEditorValidationIssue[] = [];
    const template = snapshotSerializableValue(
      record.get('commandTemplate'),
      '$.node.commandBindings.commandTemplate',
      issues,
    );
    if (template === undefined) {
      return failure(
        'INVALID_SCHEMA_EDITOR_COMMAND_BINDING',
        `Command binding for event "${event.value.event}" is not descriptor-safe contract data.`,
      );
    }
    matches.push(template as unknown as SchemaEditorCommandTemplate);
  }

  if (matches.length === 0) {
    return failure(
      'UNKNOWN_SCHEMA_EDITOR_PRESENTER_EVENT',
      `No command binding exists for presenter event "${event.value.event}".`,
    );
  }
  if (matches.length !== 1) {
    return failure(
      'DUPLICATE_SCHEMA_EDITOR_COMMAND_BINDING',
      `Presenter event "${event.value.event}" matches more than one command binding.`,
    );
  }

  try {
    const pending = session.dispatch({
      template: matches[0],
      event: event.value.payload,
      ...(wildcardBindings.value === undefined
        ? {}
        : { wildcardBindings: wildcardBindings.value }),
    });
    void Promise.resolve(pending).catch(() => undefined);
  } catch {
    return failure(
      'SCHEMA_EDITOR_SESSION_DISPATCH_FAILED',
      'Schema Editor session rejected presenter event dispatch.',
    );
  }

  return Object.freeze({ ok: true, diagnostics: EMPTY_EVENT_DIAGNOSTICS });
}

function snapshotEvent(value: unknown): Readonly<
  | {
      ok: true;
      value: Readonly<{
        event: string;
        payload: SchemaEditorContractValue;
      }>;
    }
  | { ok: false }
> {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$.event', issues);
  const record = readRecord(snapshot);
  const event = record?.get('event');
  if (
    typeof event !== 'string'
    || event.length === 0
    || !record?.has('payload')
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: Object.freeze({
      event,
      payload: record.get('payload') as SchemaEditorContractValue,
    }),
  };
}

function snapshotWildcardBindings(value: unknown): Readonly<
  | { ok: true; value: readonly SchemaEditorWildcardBinding[] | undefined }
  | { ok: false }
> {
  if (value === undefined) return { ok: true, value: undefined };
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$.wildcardBindings', issues);
  if (!Array.isArray(snapshot)) return { ok: false };
  const bindings: SchemaEditorWildcardBinding[] = [];
  for (const binding of snapshot) {
    if (
      (typeof binding === 'string' && binding.length > 0)
      || (
        typeof binding === 'number'
        && Number.isSafeInteger(binding)
        && binding >= 0
      )
    ) {
      bindings.push(binding);
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: Object.freeze(bindings) };
}

function isSessionDispatchPort(value: unknown): value is SchemaEditorSession {
  const record = readRecord(value);
  return typeof record?.get('dispatch') === 'function';
}

function isDisposed(session: SchemaEditorSession): boolean {
  const record = readRecord(session);
  const getState = record?.get('getState');
  if (typeof getState !== 'function') return false;
  try {
    const state = getState();
    return readRecord(state)?.get('disposed') === true;
  } catch {
    return true;
  }
}

function isEditorPlanNode(value: unknown): value is EditorPlanNode {
  const record = readRecord(value);
  return typeof record?.get('kind') === 'string'
    && typeof record.get('id') === 'string';
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

function failure(
  code: SchemaEditorEventBridgeDiagnostic['code'],
  message: string,
): SchemaEditorEventBridgeResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([Object.freeze({ code, message })]),
  });
}

const EMPTY_EVENT_DIAGNOSTICS = Object.freeze([]) as readonly [];
