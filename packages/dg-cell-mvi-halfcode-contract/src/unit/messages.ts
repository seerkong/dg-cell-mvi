import type { SerializableRecord } from './common';
import type { HalfcodeRef } from './refs';
import {
  HALFCODE_MESSAGE_DSL_INVALID,
  type HalfcodeUnitDiagnosticCode,
} from './diagnostics';

export interface CommandSpec {
  /** Command type identity. The #id is the type; do not repeat it in a type field. */
  id: string;
  payloadDef?: HalfcodeRef;
  /** Optional runtime-first code entry: output = fn(runtime, input, config). */
  handler?: HalfcodeRef;
  config?: HalfcodeRef;
  metadata?: SerializableRecord;
}

export interface EventSpec {
  /** Event type identity. The #id is the type; do not repeat it in a type field. */
  id: string;
  payloadDef?: HalfcodeRef;
  metadata?: SerializableRecord;
}

/** A scope-local propagation rule for a Command or Event. */
export interface MessageRuleSpec {
  message: HalfcodeRef;
  action: 'consume' | 'bubble' | 'reject';
}

/**
 * Propagation policy only. MessagePolicy never selects a handler or performs
 * a message transformation; those remain in runtime-owned code.
 */
export interface MessagePolicySpec {
  id?: string;
  default?: 'bubble' | 'reject';
  rules?: MessageRuleSpec[];
  metadata?: SerializableRecord;
}

export interface HalfcodeUnitMessageValidationIssue {
  path: string;
  message: string;
  code?: HalfcodeUnitDiagnosticCode;
}

export interface HalfcodeUnitMessageValidationResult {
  ok: boolean;
  issues: HalfcodeUnitMessageValidationIssue[];
}

/** Events describe facts, so runtime request handlers are forbidden. */
export function validateEventSpec(value: unknown): HalfcodeUnitMessageValidationResult {
  const issues: HalfcodeUnitMessageValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'Event must be a plain serializable object.' });
    return { ok: false, issues };
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    issues.push({ path: '$.id', message: 'Event id must be a non-empty string.' });
  }
  for (const field of ['handler', 'config', 'type'] as const) {
    if (field in value) {
      issues.push({
        path: `$.${field}`,
        message: field === 'handler'
          ? 'Event must not declare a handler; reactions belong in runtime code that accepts the event.'
          : `Event must not declare ${field}; an Event #id is its protocol identity.`,
        code: HALFCODE_MESSAGE_DSL_INVALID,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
