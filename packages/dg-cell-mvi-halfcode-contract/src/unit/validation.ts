/**
 * v3 unit contract red-line validation — pure functions, no IO.
 *
 * Carried-over v2 red lines: canonical data holds no functions/constructors/
 * direct-fetch fields; frontend contracts never declare input/output.
 * New v3 red lines: PageContract never declares props/slots/exposes (D2);
 * WireSpec from/to must address route instances via route:// (D13).
 *
 * Cross-file/registry checks (FQN uniqueness, ref resolution, urlInputs vs
 * route path, Requires vs host scope chain) belong to the loader/compiler
 * tracks; this module only validates local shapes.
 */

import { isUnitFqn } from './common';
import { parseHalfcodeRef } from './refs';
import {
  HALFCODE_REF_UNRESOLVED,
  type HalfcodeUnitDiagnosticCode,
} from './diagnostics';

export interface HalfcodeUnitValidationIssue {
  path: string;
  message: string;
  code?: HalfcodeUnitDiagnosticCode;
}

export interface HalfcodeUnitValidationResult {
  ok: boolean;
  issues: HalfcodeUnitValidationIssue[];
}

const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  'fetch',
  'componentConstructor',
  'constructor',
  'render',
  'setup',
  'handler',
  'hook',
]);

const PAGE_CONTRACT_FORBIDDEN_KEYS = ['props', 'slots', 'exposes'] as const;
const DOCUMENT_CONTRACT_FORBIDDEN_KEYS = ['urlInputs', 'props', 'slots', 'exposes'] as const;
const FRONTEND_CONTRACT_FORBIDDEN_KEYS = ['input', 'output'] as const;
const RETIRED_MESSAGE_KEYS = ['emits'] as const;

/**
 * Validate a PageContractSpec-shaped value. A page's public input is URL shape
 * only (D2): any props/slots/exposes key is an error, as are non-serializable
 * values anywhere in the contract.
 */
export function validatePageContract(value: unknown): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'PageContract must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const key of PAGE_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `PageContract must not declare ${key}; a page's public input is URL shape (urlInputs) and its output is sends.`,
      });
    }
  }
  for (const key of FRONTEND_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `Frontend contract must not declare ${key}; use urlInputs/accepts/sends.`,
      });
    }
  }

  if ('kind' in value && value.kind !== 'page-contract') {
    issues.push({ path: '$.kind', message: 'PageContract kind must be "page-contract".' });
  }
  if ('fqn' in value && (typeof value.fqn !== 'string' || !isUnitFqn(value.fqn))) {
    issues.push({ path: '$.fqn', message: 'PageContract fqn must be a dot-separated unit FQN.' });
  }
  validateUrlInputs(value.urlInputs, '$.urlInputs', issues);
  validateMessageRefList(value.accepts, '$.accepts', issues);
  validateMessageRefList(value.sends, '$.sends', issues);
  validateRetiredMessageKeys(value, issues);

  validateElementContractList(value.elementContracts, '$.elementContracts', issues);

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

/**
 * Validate a ComponentContractSpec-shaped value. Components do declare
 * props/slots/exposes, but the frontend input/output red line still holds.
 */
export function validateComponentContract(value: unknown): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'ComponentContract must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const key of FRONTEND_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `Frontend contract must not declare ${key}; use props/slots/accepts/sends/exposes.`,
      });
    }
  }
  if ('kind' in value && value.kind !== 'component-contract') {
    issues.push({ path: '$.kind', message: 'ComponentContract kind must be "component-contract".' });
  }
  if ('fqn' in value && (typeof value.fqn !== 'string' || !isUnitFqn(value.fqn))) {
    issues.push({ path: '$.fqn', message: 'ComponentContract fqn must be a dot-separated unit FQN.' });
  }
  validateMessageRefList(value.accepts, '$.accepts', issues);
  validateMessageRefList(value.sends, '$.sends', issues);
  validateRetiredMessageKeys(value, issues);

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

/**
 * Validate a DocumentContractSpec-shaped value. Document owns source/revision
 * type descriptors, mode, parameters and message boundaries; Page and
 * Component input channels are rejected even when their values are empty.
 */
export function validateDocumentContract(value: unknown): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'DocumentContract must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const key of DOCUMENT_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `DocumentContract must not declare ${key}; its input boundary is source/revision/mode/parameters.`,
      });
    }
  }
  for (const key of FRONTEND_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `DocumentContract must not declare ${key}; use accepts/sends for message traffic.`,
      });
    }
  }

  if (value.kind !== 'document-contract') {
    issues.push({ path: '$.kind', message: 'DocumentContract kind must be "document-contract".' });
  }
  if (typeof value.fqn !== 'string' || !isUnitFqn(value.fqn)) {
    issues.push({ path: '$.fqn', message: 'DocumentContract fqn must be a dot-separated unit FQN.' });
  }
  if (value.mode !== 'view' && value.mode !== 'edit') {
    issues.push({ path: '$.mode', message: 'DocumentContract mode must be "view" or "edit".' });
  }

  validateOptionalTypeDescriptor(value.source, '$.source', issues);
  validateOptionalTypeDescriptor(value.revision, '$.revision', issues);
  validateStringRecord(value.parameters, '$.parameters', issues);
  validateMessageRefList(value.accepts, '$.accepts', issues);
  validateMessageRefList(value.sends, '$.sends', issues);
  validateRetiredMessageKeys(value, issues);
  validateElementContractList(value.elementContracts, '$.elementContracts', issues);

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

/**
 * Validate a UnitElementContractSpec-shaped value (esp. inline Capsule
 * contracts). input/output are rejected (v2 red line, kept); requires must be
 * the D14 three-part shape: command/effect/config refs.
 */
export function validateUnitElementContract(value: unknown): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'ElementContract must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const key of FRONTEND_CONTRACT_FORBIDDEN_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `Frontend ElementContract must not declare ${key}; use accepts/sends/requires.`,
      });
    }
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    issues.push({ path: '$.id', message: 'ElementContract id must be a non-empty string.' });
  }
  validateMessageRefList(value.accepts, '$.accepts', issues);
  validateMessageRefList(value.sends, '$.sends', issues);
  validateRetiredMessageKeys(value, issues);
  validateRequires(value.requires, '$.requires', issues);

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

function validateOptionalTypeDescriptor(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: 'Type descriptor must be a string when declared.' });
  }
}

function validateStringRecord(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isPlainRecord(value)) {
    issues.push({ path, message: 'Expected a plain object mapping names to type descriptor strings.' });
    return;
  }
  for (const [key, descriptor] of Object.entries(value)) {
    if (typeof descriptor !== 'string') {
      issues.push({
        path: `${path}.${key}`,
        message: 'Type descriptor map values must be strings.',
      });
    }
  }
}

function validateElementContractList(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'elementContracts must be an array.' });
    return;
  }
  value.forEach((contract, index) => {
    const nested = validateUnitElementContract(contract);
    for (const issue of nested.issues) {
      issues.push({ ...issue, path: `${path}[${index}]${issue.path.slice(1)}` });
    }
  });
}

/**
 * Validate a WireSpec-shaped value. Wires address route instances (D13):
 * from/to must be route:// refs (route://#id or route://<path>), never
 * page FQNs or other schemes.
 */
export function validateWireSpec(value: unknown): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'WireSpec must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const endpoint of ['from', 'to'] as const) {
    const ref = value[endpoint];
    if (typeof ref !== 'string') {
      issues.push({ path: `$.${endpoint}`, message: `WireSpec ${endpoint} must be a ref string.` });
      continue;
    }
    let parsed;
    try {
      parsed = parseHalfcodeRef(ref);
    } catch {
      issues.push({
        path: `$.${endpoint}`,
        message: `WireSpec ${endpoint} "${ref}" is not a parseable halfcode ref.`,
        code: HALFCODE_REF_UNRESOLVED,
      });
      continue;
    }
    if (parsed.scheme !== 'route') {
      issues.push({
        path: `$.${endpoint}`,
        message: `WireSpec ${endpoint} must address a route instance (route://#id or route://<path>), got scheme "${parsed.scheme}".`,
      });
    }
  }

  if (typeof value.message !== 'string') {
    issues.push({ path: '$.message', message: 'WireSpec message must be a Command/Event ref string.' });
  } else {
    validateMessageRef(value.message, '$.message', issues);
  }

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

function validateUrlInputs(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isPlainRecord(value)) {
    issues.push({ path, message: 'urlInputs must be a plain object with path/query/hash variable maps.' });
    return;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'path' && key !== 'query' && key !== 'hash') {
      issues.push({ path: `${path}.${key}`, message: 'urlInputs only allows path/query/hash variable maps.' });
      continue;
    }
    const section = value[key];
    if (!isPlainRecord(section) || Object.values(section).some((type) => typeof type !== 'string')) {
      issues.push({
        path: `${path}.${key}`,
        message: `urlInputs.${key} must map variable names to type descriptor strings.`,
      });
    }
  }
}

function validateRequires(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isPlainRecord(value)) {
    issues.push({ path, message: 'requires must be a plain object with commands/effects/config arrays.' });
    return;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'commands' && key !== 'effects' && key !== 'config') {
      issues.push({ path: `${path}.${key}`, message: 'requires only allows commands/effects/config sections.' });
    }
  }

  for (const key of ['commands', 'effects', 'config'] as const) {
    const list = value[key];
    if (!Array.isArray(list)) {
      issues.push({ path: `${path}.${key}`, message: `requires.${key} must be an array of halfcode refs.` });
      continue;
    }
    const expectedScheme = key === 'commands' ? 'command' : key === 'effects' ? 'scope-effect' : 'config';
    list.forEach((entry, index) => validateRefScheme(
      entry,
      `${path}.${key}[${index}]`,
      expectedScheme,
      issues,
    ));
  }
}

function validateMessageRefList(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Message ref list must be an array of { ref } entries.' });
    return;
  }
  value.forEach((entry, index) => {
    if (!isPlainRecord(entry) || typeof entry.ref !== 'string') {
      issues.push({
        path: `${path}[${index}]`,
        message: 'Message ref entries must be { ref: "command://..." | "event://..." }.',
        code: HALFCODE_REF_UNRESOLVED,
      });
      return;
    }
    validateMessageRef(entry.ref, `${path}[${index}].ref`, issues);
  });
}

function validateMessageRef(input: string, path: string, issues: HalfcodeUnitValidationIssue[]): void {
  try {
    const parsed = parseHalfcodeRef(input);
    if (parsed.scheme === 'command' || parsed.scheme === 'event') return;
    issues.push({
      path,
      message: `Message refs must use command:// or event://, got "${parsed.scheme}://".`,
      code: HALFCODE_REF_UNRESOLVED,
    });
  } catch {
    issues.push({
      path,
      message: 'Message refs must be parseable command:// or event:// URIs.',
      code: HALFCODE_REF_UNRESOLVED,
    });
  }
}

function validateRefScheme(
  value: unknown,
  path: string,
  expectedScheme: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push({ path, message: `Expected a ${expectedScheme}:// ref string.`, code: HALFCODE_REF_UNRESOLVED });
    return;
  }
  try {
    const parsed = parseHalfcodeRef(value);
    if (parsed.scheme === expectedScheme) return;
    issues.push({
      path,
      message: `Expected a ${expectedScheme}:// ref, got "${parsed.scheme}://".`,
      code: HALFCODE_REF_UNRESOLVED,
    });
  } catch {
    issues.push({ path, message: `Expected a parseable ${expectedScheme}:// ref.`, code: HALFCODE_REF_UNRESOLVED });
  }
}

function validateRetiredMessageKeys(value: Record<string, unknown>, issues: HalfcodeUnitValidationIssue[]): void {
  for (const key of RETIRED_MESSAGE_KEYS) {
    if (key in value) {
      issues.push({
        path: `$.${key}`,
        message: `Frontend contract field "${key}" is retired; use "sends" with Command/Event refs.`,
        code: HALFCODE_REF_UNRESOLVED,
      });
    }
  }
}

function isParseableRef(input: string): boolean {
  try {
    parseHalfcodeRef(input);
    return true;
  } catch {
    return false;
  }
}

function collectSerializableIssues(
  value: unknown,
  path: string,
  issues: HalfcodeUnitValidationIssue[],
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: 'Number values must be finite.' });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSerializableIssues(item, `${path}[${index}]`, issues));
    return;
  }

  if (typeof value === 'function') {
    issues.push({ path, message: 'Functions cannot be stored in canonical halfcode unit contracts.' });
    return;
  }

  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push({ path, message: `Unsupported non-serializable value type: ${typeof value}.` });
    return;
  }

  if (!isPlainRecord(value)) {
    issues.push({ path, message: 'Only plain objects can be stored in canonical halfcode unit contracts.' });
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
    if (FORBIDDEN_EXECUTABLE_KEYS.has(key)) {
      issues.push({ path: childPath, message: 'Executable runtime fields are not canonical contract data.' });
    }
    collectSerializableIssues(child, childPath, issues);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
