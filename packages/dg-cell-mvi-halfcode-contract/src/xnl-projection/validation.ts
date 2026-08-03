import { XNL_PROJECTION_OWNERSHIP_FIELD_NAMES } from './serializable';

export interface XnlProjectionValidationIssue {
  path: string;
  code?: string;
  message: string;
}

export interface XnlProjectionValidationResult {
  ok: boolean;
  issues: XnlProjectionValidationIssue[];
}

const OWNERSHIP_FIELDS = new Set<string>(XNL_PROJECTION_OWNERSHIP_FIELD_NAMES);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error']);
const COMMAND_RESULT_STATUSES = new Set(['translated', 'rejected', 'unsupported']);

const PRESENTATION_KEYS = new Set(['kind', 'id', 'rules', 'metadata']);
const PRESENTATION_RULE_KEYS = new Set(['id', 'match', 'presenter', 'visible', 'data', 'metadata']);
const PRESENTATION_MATCH_KEYS = new Set(['path', 'nodeId', 'tag', 'classification', 'role', 'sourceKind']);
const PRESENTER_REF_KEYS = new Set(['id', 'options']);
const PLAN_KEYS = new Set(['kind', 'id', 'root', 'diagnostics', 'provenance']);
const PLAN_NODE_KEYS = new Set([
  'kind',
  'id',
  'domain',
  'classification',
  'presenter',
  'facts',
  'data',
  'children',
  'diagnostics',
  'provenance',
]);
const DOMAIN_REF_KEYS = new Set(['path', 'nodeId', 'tag', 'sourceKind', 'role', 'sourceRef', 'metadata']);
const CLASSIFICATION_KEYS = new Set(['id', 'traits', 'facts', 'diagnostics']);
const DIAGNOSTIC_KEYS = new Set(['severity', 'code', 'message', 'path', 'planNodeId', 'details']);
const DIALECT_KEYS = new Set([
  'id',
  'children',
  'classify',
  'transformers',
  'presenterBindings',
  'translateInteraction',
  'config',
  'metadata',
]);
const SEMANTIC_BINDING_KEYS = new Set(['classification', 'trait', 'role', 'sourceKind', 'presenter', 'diagnostics']);
const INTERACTION_KEYS = new Set(['id', 'type', 'target', 'payload', 'provenance']);
const INTERACTION_TARGET_KEYS = new Set(['planNodeId', 'domain', 'path']);
const COMMAND_RESULT_KEYS_BY_STATUS: Record<string, Set<string>> = {
  translated: new Set(['status', 'command', 'diagnostics']),
  rejected: new Set(['status', 'diagnostics']),
  unsupported: new Set(['status', 'diagnostics']),
};
const DOMAIN_COMMAND_KEYS = new Set(['type', 'target', 'payload', 'provenance', 'metadata']);

export function validateXnlProjectionPresentation(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validatePresentation(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlProjectionPlan(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validatePlan(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlProjectionDiagnostics(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validateDiagnostics(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlProjectionDialect(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  validateDialect(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlProjectionInteraction(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validateInteraction(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlProjectionCommandResult(value: unknown): XnlProjectionValidationResult {
  const issues: XnlProjectionValidationIssue[] = [];
  validateCommandResult(value, '$', issues);
  return validationResult(issues);
}

function validationResult(issues: XnlProjectionValidationIssue[]): XnlProjectionValidationResult {
  return { ok: issues.length === 0, issues };
}

function validatePresentation(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PRESENTATION', 'XNL Projection Presentation must be a plain object.');
    return;
  }
  validateAllowedKeys(value, PRESENTATION_KEYS, path, issues, 'Presentation');
  if (own(value, 'kind') !== 'xnl-projection-presentation') {
    issue(issues, appendPath(path, 'kind'), 'INVALID_PRESENTATION_KIND', 'Presentation kind must be "xnl-projection-presentation".');
  }
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'presentation id');
  validateArray(own(value, 'rules'), appendPath(path, 'rules'), issues, (rule, rulePath) => {
    validatePresentationRule(rule, rulePath, issues);
  });
  validateOptionalSerializableRecord(own(value, 'metadata'), appendPath(path, 'metadata'), issues, 'presentation metadata');
}

function validatePresentationRule(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PRESENTATION_RULE', 'Presentation rule must be a plain object.');
    return;
  }
  validateAllowedKeys(value, PRESENTATION_RULE_KEYS, path, issues, 'Presentation rule');
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'presentation rule id');
  validatePresentationRuleMatch(own(value, 'match'), appendPath(path, 'match'), issues);
  if (own(value, 'presenter') !== undefined) {
    validatePresenterRef(own(value, 'presenter'), appendPath(path, 'presenter'), issues);
  }
  const visible = own(value, 'visible');
  if (visible !== undefined && typeof visible !== 'boolean') {
    issue(issues, appendPath(path, 'visible'), 'INVALID_VISIBLE_FLAG', 'Presentation rule visible must be boolean.');
  }
  validateOptionalSerializableRecord(own(value, 'data'), appendPath(path, 'data'), issues, 'presentation rule data');
  validateOptionalSerializableRecord(own(value, 'metadata'), appendPath(path, 'metadata'), issues, 'presentation rule metadata');
}

function validatePresentationRuleMatch(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PRESENTATION_MATCH', 'Presentation rule match must be a plain object.');
    return;
  }
  validateAllowedKeys(value, PRESENTATION_MATCH_KEYS, path, issues, 'Presentation match');
  validateOptionalDomainPath(own(value, 'path'), appendPath(path, 'path'), issues);
  validateOptionalStableString(own(value, 'nodeId'), appendPath(path, 'nodeId'), issues, 'match nodeId');
  validateOptionalStableString(own(value, 'tag'), appendPath(path, 'tag'), issues, 'match tag');
  validateOptionalStableString(own(value, 'classification'), appendPath(path, 'classification'), issues, 'match classification');
  validateOptionalStableString(own(value, 'role'), appendPath(path, 'role'), issues, 'match role');
  validateOptionalStableString(own(value, 'sourceKind'), appendPath(path, 'sourceKind'), issues, 'match sourceKind');
}

function validatePlan(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PLAN', 'XNL Projection Plan must be a plain object.');
    return;
  }
  validateAllowedKeys(value, PLAN_KEYS, path, issues, 'Projection plan');
  if (own(value, 'kind') !== 'xnl-projection-plan') {
    issue(issues, appendPath(path, 'kind'), 'INVALID_PLAN_KIND', 'Projection plan kind must be "xnl-projection-plan".');
  }
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'projection plan id');
  validatePlanNode(
    own(value, 'root'),
    appendPath(path, 'root'),
    issues,
    new Set(),
    new Set(),
  );
  validateOptionalDiagnostics(own(value, 'diagnostics'), appendPath(path, 'diagnostics'), issues);
  validateOptionalSerializableRecord(own(value, 'provenance'), appendPath(path, 'provenance'), issues, 'plan provenance');
}

function validatePlanNode(
  value: unknown,
  path: string,
  issues: XnlProjectionValidationIssue[],
  seenIds: Set<string>,
  seenObjects: Set<object>,
): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PLAN_NODE', 'Projection plan node must be a plain object.');
    return;
  }
  if (seenObjects.has(value)) {
    issue(issues, path, 'CYCLIC_PLAN_NODE', 'Projection plan nodes must not contain structural cycles.');
    return;
  }
  seenObjects.add(value);
  validateAllowedKeys(value, PLAN_NODE_KEYS, path, issues, 'Projection plan node');
  const kind = own(value, 'kind');
  if (kind !== undefined && kind !== 'xnl-projection-plan-node') {
    issue(issues, appendPath(path, 'kind'), 'INVALID_PLAN_NODE_KIND', 'Plan node kind must be "xnl-projection-plan-node" when present.');
  }
  const id = own(value, 'id');
  validateStableId(id, appendPath(path, 'id'), issues, 'plan node id');
  if (typeof id === 'string') {
    if (seenIds.has(id)) {
      issue(issues, appendPath(path, 'id'), 'DUPLICATE_PLAN_NODE_ID', `Plan node id "${id}" must be unique.`);
    } else {
      seenIds.add(id);
    }
  }
  validateDomainRef(own(value, 'domain'), appendPath(path, 'domain'), issues);
  validateClassification(own(value, 'classification'), appendPath(path, 'classification'), issues);
  validatePresenterRef(own(value, 'presenter'), appendPath(path, 'presenter'), issues);
  validateOptionalSerializableRecord(own(value, 'facts'), appendPath(path, 'facts'), issues, 'plan node facts');
  if (own(value, 'data') !== undefined) {
    collectSerializableIssues(own(value, 'data'), appendPath(path, 'data'), issues);
  }
  validateArray(own(value, 'children'), appendPath(path, 'children'), issues, (child, childPath) => {
    validatePlanNode(
      child,
      childPath,
      issues,
      seenIds,
      seenObjects,
    );
  });
  validateOptionalDiagnostics(own(value, 'diagnostics'), appendPath(path, 'diagnostics'), issues);
  validateOptionalSerializableRecord(own(value, 'provenance'), appendPath(path, 'provenance'), issues, 'plan node provenance');
  seenObjects.delete(value);
}

function validateDialect(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_DIALECT', 'XNL Projection Dialect must be a plain object.');
    return;
  }
  validateAllowedKeys(value, DIALECT_KEYS, path, issues, 'Projection dialect');
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'dialect id');
  validateRequiredFunction(own(value, 'children'), appendPath(path, 'children'), issues, 'children processor');
  validateRequiredFunction(own(value, 'classify'), appendPath(path, 'classify'), issues, 'classifier');
  validateTransformerMap(own(value, 'transformers'), appendPath(path, 'transformers'), issues);
  validateOptionalSemanticPresenterBindings(own(value, 'presenterBindings'), appendPath(path, 'presenterBindings'), issues);
  const translator = own(value, 'translateInteraction');
  if (translator !== undefined) {
    validateRequiredFunction(translator, appendPath(path, 'translateInteraction'), issues, 'interaction translator');
  }
  validateOptionalSerializableRecord(own(value, 'config'), appendPath(path, 'config'), issues, 'dialect config');
  validateOptionalSerializableRecord(own(value, 'metadata'), appendPath(path, 'metadata'), issues, 'dialect metadata');
}

function validateInteraction(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_INTERACTION', 'XNL Projection Interaction must be a plain object.');
    return;
  }
  validateAllowedKeys(value, INTERACTION_KEYS, path, issues, 'Projection interaction');
  validateOptionalStableString(own(value, 'id'), appendPath(path, 'id'), issues, 'interaction id');
  validateStableId(own(value, 'type'), appendPath(path, 'type'), issues, 'interaction type');
  validateInteractionTarget(own(value, 'target'), appendPath(path, 'target'), issues);
  if (own(value, 'payload') !== undefined) {
    collectSerializableIssues(own(value, 'payload'), appendPath(path, 'payload'), issues);
  }
  validateOptionalSerializableRecord(own(value, 'provenance'), appendPath(path, 'provenance'), issues, 'interaction provenance');
}

function validateCommandResult(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_COMMAND_RESULT', 'XNL Projection command result must be a plain object.');
    return;
  }
  const status = own(value, 'status');
  if (typeof status !== 'string' || !COMMAND_RESULT_STATUSES.has(status)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_COMMAND_RESULT_STATUS', 'Command result status must be translated, rejected, or unsupported.');
    return;
  }
  validateAllowedKeys(value, COMMAND_RESULT_KEYS_BY_STATUS[status] ?? new Set(['status']), path, issues, 'Command result');
  if (status === 'translated') {
    validateDomainCommand(own(value, 'command'), appendPath(path, 'command'), issues);
    validateOptionalDiagnostics(own(value, 'diagnostics'), appendPath(path, 'diagnostics'), issues);
  } else {
    validateDiagnostics(own(value, 'diagnostics'), appendPath(path, 'diagnostics'), issues);
  }
}

function validateDomainCommand(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_DOMAIN_COMMAND', 'Domain command must be a plain object.');
    return;
  }
  collectSerializableIssues(value, path, issues);
  validateAllowedKeys(value, DOMAIN_COMMAND_KEYS, path, issues, 'Domain command');
  validateStableId(own(value, 'type'), appendPath(path, 'type'), issues, 'domain command type');
  validateDomainRef(own(value, 'target'), appendPath(path, 'target'), issues);
  if (own(value, 'payload') !== undefined) {
    collectSerializableIssues(own(value, 'payload'), appendPath(path, 'payload'), issues);
  }
  validateOptionalSerializableRecord(own(value, 'provenance'), appendPath(path, 'provenance'), issues, 'domain command provenance');
  validateOptionalSerializableRecord(own(value, 'metadata'), appendPath(path, 'metadata'), issues, 'domain command metadata');
}

function validateInteractionTarget(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_INTERACTION_TARGET', 'Interaction target must be a plain object.');
    return;
  }
  validateAllowedKeys(value, INTERACTION_TARGET_KEYS, path, issues, 'Interaction target');
  validateStableId(own(value, 'planNodeId'), appendPath(path, 'planNodeId'), issues, 'interaction target planNodeId');
  if (own(value, 'domain') !== undefined) {
    validateDomainRef(own(value, 'domain'), appendPath(path, 'domain'), issues);
  }
  validateOptionalDomainPath(own(value, 'path'), appendPath(path, 'path'), issues);
}

function validateDomainRef(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_DOMAIN_REF', 'Domain ref must be a plain object.');
    return;
  }
  validateAllowedKeys(value, DOMAIN_REF_KEYS, path, issues, 'Domain ref');
  validateDomainPath(own(value, 'path'), appendPath(path, 'path'), issues);
  validateOptionalStableString(own(value, 'nodeId'), appendPath(path, 'nodeId'), issues, 'domain nodeId');
  validateOptionalStableString(own(value, 'tag'), appendPath(path, 'tag'), issues, 'domain tag');
  validateOptionalStableString(own(value, 'sourceKind'), appendPath(path, 'sourceKind'), issues, 'domain sourceKind');
  validateOptionalStableString(own(value, 'role'), appendPath(path, 'role'), issues, 'domain role');
  validateOptionalStableString(own(value, 'sourceRef'), appendPath(path, 'sourceRef'), issues, 'domain sourceRef');
  validateOptionalSerializableRecord(own(value, 'metadata'), appendPath(path, 'metadata'), issues, 'domain metadata');
}

function validateClassification(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_CLASSIFICATION', 'Classification must be a plain object.');
    return;
  }
  validateAllowedKeys(value, CLASSIFICATION_KEYS, path, issues, 'Classification');
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'classification id');
  validateOptionalStableStringArray(own(value, 'traits'), appendPath(path, 'traits'), issues, 'classification trait');
  validateOptionalSerializableRecord(own(value, 'facts'), appendPath(path, 'facts'), issues, 'classification facts');
  validateOptionalDiagnostics(own(value, 'diagnostics'), appendPath(path, 'diagnostics'), issues);
}

function validatePresenterRef(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_PRESENTER_REF', 'Presenter ref must be a plain object.');
    return;
  }
  validateAllowedKeys(value, PRESENTER_REF_KEYS, path, issues, 'Presenter ref');
  validateStableId(own(value, 'id'), appendPath(path, 'id'), issues, 'presenter id');
  validateOptionalSerializableRecord(own(value, 'options'), appendPath(path, 'options'), issues, 'presenter options');
}

function validateTransformerMap(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_TRANSFORMER_MAP', 'Dialect transformers must be a plain object map.');
    return;
  }
  const keys = ownKeys(value, path, issues);
  for (const key of keys) {
    validateStableId(key, appendPath(path, key), issues, 'transformer classification key');
    validateRequiredFunction(own(value, key), appendPath(path, key), issues, 'transformer');
  }
}

function validateOptionalSemanticPresenterBindings(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (value === undefined) return;
  validateArray(value, path, issues, (binding, bindingPath) => {
    if (!isPlainRecord(binding)) {
      issue(issues, bindingPath, 'INVALID_SEMANTIC_BINDING', 'Semantic presenter binding must be a plain object.');
      return;
    }
    validateAllowedKeys(binding, SEMANTIC_BINDING_KEYS, bindingPath, issues, 'Semantic presenter binding');
    validateOptionalStableString(own(binding, 'classification'), appendPath(bindingPath, 'classification'), issues, 'semantic classification');
    validateOptionalStableString(own(binding, 'trait'), appendPath(bindingPath, 'trait'), issues, 'semantic trait');
    validateOptionalStableString(own(binding, 'role'), appendPath(bindingPath, 'role'), issues, 'semantic role');
    validateOptionalStableString(own(binding, 'sourceKind'), appendPath(bindingPath, 'sourceKind'), issues, 'semantic sourceKind');
    validatePresenterRef(own(binding, 'presenter'), appendPath(bindingPath, 'presenter'), issues);
    validateOptionalDiagnostics(own(binding, 'diagnostics'), appendPath(bindingPath, 'diagnostics'), issues);
  });
}

function validateDiagnostics(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  validateArray(value, path, issues, (diagnostic, diagnosticPath) => {
    if (!isPlainRecord(diagnostic)) {
      issue(issues, diagnosticPath, 'INVALID_DIAGNOSTIC', 'Diagnostic must be a plain object.');
      return;
    }
    validateAllowedKeys(diagnostic, DIAGNOSTIC_KEYS, diagnosticPath, issues, 'Diagnostic');
    const severity = own(diagnostic, 'severity');
    if (typeof severity !== 'string' || !DIAGNOSTIC_SEVERITIES.has(severity)) {
      issue(issues, appendPath(diagnosticPath, 'severity'), 'INVALID_DIAGNOSTIC_SEVERITY', 'Diagnostic severity must be info, warning, or error.');
    }
    validateStableId(own(diagnostic, 'code'), appendPath(diagnosticPath, 'code'), issues, 'diagnostic code');
    validateNonEmptyString(own(diagnostic, 'message'), appendPath(diagnosticPath, 'message'), issues, 'diagnostic message');
    validateOptionalDomainPath(own(diagnostic, 'path'), appendPath(diagnosticPath, 'path'), issues);
    validateOptionalStableString(own(diagnostic, 'planNodeId'), appendPath(diagnosticPath, 'planNodeId'), issues, 'diagnostic planNodeId');
    validateOptionalSerializableRecord(own(diagnostic, 'details'), appendPath(diagnosticPath, 'details'), issues, 'diagnostic details');
  });
}

function validateOptionalDiagnostics(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (value !== undefined) validateDiagnostics(value, path, issues);
}

function validateOptionalSerializableRecord(
  value: unknown,
  path: string,
  issues: XnlProjectionValidationIssue[],
  label: string,
): void {
  if (value === undefined) return;
  if (!isPlainRecord(value)) {
    issue(issues, path, 'INVALID_SERIALIZABLE_RECORD', `${label} must be a plain serializable object.`);
    return;
  }
  collectSerializableIssues(value, path, issues);
}

function validateDomainPath(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'INVALID_DOMAIN_PATH', 'Domain path must be an array of string or number segments.');
    return;
  }
  value.forEach((segment, index) => validatePathSegment(segment, appendPath(path, index), issues));
}

function validateOptionalDomainPath(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (value !== undefined) validateDomainPath(value, path, issues);
}

function validatePathSegment(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  if (typeof value !== 'string' && typeof value !== 'number') {
    issue(issues, path, 'INVALID_DOMAIN_PATH_SEGMENT', 'Domain path segment must be a string or number.');
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    issue(issues, path, 'NON_FINITE_NUMBER', 'Domain path number segments must be finite.');
  }
}

function validateOptionalStableStringArray(value: unknown, path: string, issues: XnlProjectionValidationIssue[], label: string): void {
  if (value === undefined) return;
  validateArray(value, path, issues, (item, itemPath) => validateStableId(item, itemPath, issues, label));
}

function validateOptionalStableString(value: unknown, path: string, issues: XnlProjectionValidationIssue[], label: string): void {
  if (value !== undefined) validateStableId(value, path, issues, label);
}

function validateStableId(value: unknown, path: string, issues: XnlProjectionValidationIssue[], label = 'id'): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(value)) {
    issue(issues, path, 'INVALID_STABLE_ID', `${label} must be a stable non-empty string id.`);
  }
}

function validateNonEmptyString(value: unknown, path: string, issues: XnlProjectionValidationIssue[], label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    issue(issues, path, 'INVALID_STRING', `${label} must be a non-empty string.`);
  }
}

function validateRequiredFunction(value: unknown, path: string, issues: XnlProjectionValidationIssue[], label: string): void {
  if (typeof value !== 'function') {
    issue(issues, path, 'INVALID_PROCESSOR', `${label} must be a code-owned function.`);
  }
}

function validateArray(
  value: unknown,
  path: string,
  issues: XnlProjectionValidationIssue[],
  validateItem: (item: unknown, path: string) => void,
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'INVALID_ARRAY', 'Value must be an array.');
    return;
  }
  value.forEach((item, index) => validateItem(item, appendPath(path, index)));
}

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: XnlProjectionValidationIssue[],
  label: string,
): void {
  const keys = ownKeys(value, path, issues);
  for (const key of keys) {
    if (OWNERSHIP_FIELDS.has(key)) {
      issue(issues, appendPath(path, key), 'OWNERSHIP_FIELD', 'Component, function, runtime, writer, or host ownership fields are not projection contract data.');
    }
    if (!allowed.has(key)) {
      issue(issues, appendPath(path, key), 'UNKNOWN_FIELD', `${label} does not allow field "${key}".`);
    }
  }
}

function collectSerializableIssues(value: unknown, path: string, issues: XnlProjectionValidationIssue[]): void {
  inspectSerializableValue(value, path, issues, new Set());
}

function inspectSerializableValue(
  value: unknown,
  path: string,
  issues: XnlProjectionValidationIssue[],
  seen: Set<object>,
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issue(issues, path, 'NON_FINITE_NUMBER', 'Numbers must be finite.');
      return false;
    }
    return true;
  }
  if (typeof value === 'function') {
    issue(issues, path, 'EXECUTABLE_VALUE', 'Executable values are not serializable projection contract data.');
    return false;
  }
  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issue(issues, path, 'NON_SERIALIZABLE_VALUE', `Unsupported non-serializable value type: ${typeof value}.`);
    return false;
  }
  if (Array.isArray(value)) {
    return inspectSerializableArray(value, path, issues, seen);
  }
  if (!isPlainRecord(value)) {
    issue(issues, path, 'RUNTIME_INSTANCE', 'Runtime, component, class, or host instances are not serializable projection contract data.');
    return false;
  }
  if (seen.has(value)) {
    issue(issues, path, 'CYCLIC_CONTRACT_VALUE', 'Serializable projection contract data must not contain cycles.');
    return false;
  }
  seen.add(value);
  let ok = true;
  for (const key of ownKeys(value, path, issues)) {
    const childPath = appendPath(path, key);
    if (OWNERSHIP_FIELDS.has(key)) {
      issue(issues, childPath, 'OWNERSHIP_FIELD', 'Component, function, runtime, writer, or host ownership fields are not projection contract data.');
      ok = false;
    }
    const descriptor = ownDescriptor(value, key, childPath, issues);
    if (!descriptor) {
      ok = false;
      continue;
    }
    if (!('value' in descriptor)) {
      issue(issues, childPath, 'ACCESSOR_CONTRACT_FIELD', 'Serializable projection contract data must use own data properties, not accessors.');
      ok = false;
      continue;
    }
    if (!inspectSerializableValue(descriptor.value, childPath, issues, seen)) ok = false;
  }
  seen.delete(value);
  return ok;
}

function inspectSerializableArray(
  value: readonly unknown[],
  path: string,
  issues: XnlProjectionValidationIssue[],
  seen: Set<object>,
): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    issue(issues, path, 'RUNTIME_INSTANCE', 'Serializable arrays must use the built-in Array prototype.');
    return false;
  }
  if (seen.has(value)) {
    issue(issues, path, 'CYCLIC_CONTRACT_VALUE', 'Serializable projection contract data must not contain cycles.');
    return false;
  }
  seen.add(value);
  let ok = true;
  for (let index = 0; index < value.length; index += 1) {
    const childPath = appendPath(path, index);
    const descriptor = ownDescriptor(value, String(index), childPath, issues);
    if (!descriptor) {
      issue(issues, childPath, 'SPARSE_CONTRACT_ARRAY', 'Serializable projection arrays must not contain sparse entries.');
      ok = false;
      continue;
    }
    if (!('value' in descriptor)) {
      issue(issues, childPath, 'ACCESSOR_CONTRACT_FIELD', 'Serializable projection contract data must use own data properties, not accessors.');
      ok = false;
      continue;
    }
    if (!inspectSerializableValue(descriptor.value, childPath, issues, seen)) ok = false;
  }
  seen.delete(value);
  return ok;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
}

function ownKeys(value: Record<string, unknown>, path: string, issues: XnlProjectionValidationIssue[]): string[] {
  try {
    return Object.getOwnPropertyNames(value);
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Projection contract property names could not be inspected safely.');
    return [];
  }
}

function ownDescriptor(
  value: object,
  key: string,
  path: string,
  issues: XnlProjectionValidationIssue[],
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Projection contract property descriptors could not be inspected safely.');
    return undefined;
  }
}

function appendPath(path: string, segment: string | number): string {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${path}.${segment}` : `${path}[${JSON.stringify(segment)}]`;
}

function issue(
  issues: XnlProjectionValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}
