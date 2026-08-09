import {
  appendPath,
  isPlainRecord,
  snapshotSerializableValue,
  type SchemaEditorValidationIssue,
} from '../schema-editor/serializable';
import type {
  DocumentEditorPresentationValidationResult,
  DocumentEditorToolbarDiagnostic,
} from './model';

const PRESENTATION_KEYS = new Set(['kind', 'id', 'groups', 'metadata']);
const GROUP_KEYS = new Set(['id', 'label', 'priority', 'tools']);
const TOOL_KEYS = new Set(['id', 'presenter', 'visibleWhen', 'options']);
const REF_KEYS = new Set(['id', 'options']);
const PLAN_KEYS = new Set(['kind', 'id', 'groups', 'diagnostics']);
const PLAN_GROUP_KEYS = new Set(['id', 'label', 'priority', 'tools']);
const PLAN_TOOL_KEYS = new Set([
  'id', 'commandId', 'label', 'icon', 'presenter', 'options', 'visible', 'enabled',
]);
const DIAGNOSTIC_KEYS = new Set(['severity', 'code', 'message', 'path']);

export function validateDocumentEditorPresentation(
  value: unknown,
): DocumentEditorPresentationValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$', issues);
  if (snapshot !== undefined) validatePresentation(snapshot, '$', issues);
  return result(issues);
}

export function validateDocumentEditorToolbarPlan(
  value: unknown,
): DocumentEditorPresentationValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$', issues);
  if (snapshot !== undefined) validatePlan(snapshot, '$', issues);
  return result(issues);
}

function validatePresentation(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!record(value, path, issues, 'Presentation')) return;
  allowed(value, PRESENTATION_KEYS, path, issues, 'Presentation');
  if (value.kind !== 'document-editor-presentation') {
    issue(issues, appendPath(path, 'kind'), 'INVALID_PRESENTATION_KIND',
      'DocumentEditorPresentation kind must be "document-editor-presentation".');
  }
  stableId(value.id, appendPath(path, 'id'), issues, 'presentation id');
  optionalRecord(value.metadata, appendPath(path, 'metadata'), issues, 'metadata');
  const groups = array(value.groups, appendPath(path, 'groups'), issues, 'groups');
  const groupIds = new Set<string>();
  const toolIds = new Set<string>();
  groups?.forEach((group, index) => {
    const groupPath = `${path}.groups[${index}]`;
    if (!record(group, groupPath, issues, 'Toolbar group')) return;
    allowed(group, GROUP_KEYS, groupPath, issues, 'Toolbar group');
    stableId(group.id, appendPath(groupPath, 'id'), issues, 'group id');
    duplicate(group.id, groupIds, appendPath(groupPath, 'id'), issues, 'DUPLICATE_GROUP_ID');
    optionalString(group.label, appendPath(groupPath, 'label'), issues, 'group label');
    if (group.priority !== undefined
      && (!Number.isInteger(group.priority) || (group.priority as number) < 0)) {
      issue(issues, appendPath(groupPath, 'priority'), 'INVALID_GROUP_PRIORITY',
        'Toolbar group priority must be a non-negative integer.');
    }
    const tools = array(group.tools, appendPath(groupPath, 'tools'), issues, 'tools');
    tools?.forEach((tool, toolIndex) => {
      const toolPath = `${groupPath}.tools[${toolIndex}]`;
      if (!record(tool, toolPath, issues, 'Toolbar tool')) return;
      allowed(tool, TOOL_KEYS, toolPath, issues, 'Toolbar tool');
      stableId(tool.id, appendPath(toolPath, 'id'), issues, 'tool id');
      duplicate(tool.id, toolIds, appendPath(toolPath, 'id'), issues, 'DUPLICATE_TOOL_ID');
      optionalRef(tool.presenter, appendPath(toolPath, 'presenter'), issues, 'presenter');
      optionalRef(tool.visibleWhen, appendPath(toolPath, 'visibleWhen'), issues, 'condition');
      optionalRecord(tool.options, appendPath(toolPath, 'options'), issues, 'tool options');
    });
  });
}

function validatePlan(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!record(value, path, issues, 'Toolbar plan')) return;
  allowed(value, PLAN_KEYS, path, issues, 'Toolbar plan');
  if (value.kind !== 'document-editor-toolbar-plan') {
    issue(issues, appendPath(path, 'kind'), 'INVALID_PLAN_KIND',
      'ToolbarPlan kind must be "document-editor-toolbar-plan".');
  }
  stableId(value.id, appendPath(path, 'id'), issues, 'plan id');
  const groups = array(value.groups, appendPath(path, 'groups'), issues, 'groups');
  groups?.forEach((group, index) => {
    const groupPath = `${path}.groups[${index}]`;
    if (!record(group, groupPath, issues, 'Toolbar plan group')) return;
    allowed(group, PLAN_GROUP_KEYS, groupPath, issues, 'Toolbar plan group');
    stableId(group.id, appendPath(groupPath, 'id'), issues, 'plan group id');
    if (!Number.isInteger(group.priority) || (group.priority as number) < 0) {
      issue(issues, appendPath(groupPath, 'priority'), 'INVALID_GROUP_PRIORITY',
        'Toolbar plan group priority must be a non-negative integer.');
    }
    array(group.tools, appendPath(groupPath, 'tools'), issues, 'tools')?.forEach((tool, toolIndex) => {
      const toolPath = `${groupPath}.tools[${toolIndex}]`;
      if (!record(tool, toolPath, issues, 'Toolbar plan tool')) return;
      allowed(tool, PLAN_TOOL_KEYS, toolPath, issues, 'Toolbar plan tool');
      for (const field of ['id', 'commandId', 'label'] as const) {
        stableId(tool[field], appendPath(toolPath, field), issues, `tool ${field}`);
      }
      optionalString(tool.icon, appendPath(toolPath, 'icon'), issues, 'tool icon');
      optionalRef(tool.presenter, appendPath(toolPath, 'presenter'), issues, 'presenter', false);
      optionalRecord(tool.options, appendPath(toolPath, 'options'), issues, 'tool options');
      if (typeof tool.visible !== 'boolean' || typeof tool.enabled !== 'boolean') {
        issue(issues, toolPath, 'INVALID_TOOL_STATE', 'Toolbar plan tool state must be boolean.');
      }
    });
  });
  array(value.diagnostics, appendPath(path, 'diagnostics'), issues, 'diagnostics')?.forEach((entry, index) => {
    const diagnosticPath = `${path}.diagnostics[${index}]`;
    if (!record(entry, diagnosticPath, issues, 'Toolbar diagnostic')) return;
    allowed(entry, DIAGNOSTIC_KEYS, diagnosticPath, issues, 'Toolbar diagnostic');
    if (entry.severity !== 'warning' && entry.severity !== 'error') {
      issue(issues, appendPath(diagnosticPath, 'severity'), 'INVALID_DIAGNOSTIC_SEVERITY',
        'Toolbar diagnostic severity must be warning or error.');
    }
    for (const field of ['code', 'message', 'path'] as const) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        issue(issues, appendPath(diagnosticPath, field), 'INVALID_DIAGNOSTIC_FIELD',
          `Toolbar diagnostic ${field} must be non-empty.`);
      }
    }
  });
}

function result(issues: SchemaEditorValidationIssue[]): DocumentEditorPresentationValidationResult {
  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues.map((entry): DocumentEditorToolbarDiagnostic => Object.freeze({
      severity: 'error',
      code: entry.code ?? 'INVALID_DOCUMENT_EDITOR_DATA',
      message: entry.message,
      path: entry.path,
    }))),
  });
}

function record(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  name: string,
): value is Record<string, unknown> {
  if (isPlainRecord(value)) return true;
  issue(issues, path, `INVALID_${name.toUpperCase().replaceAll(' ', '_')}`, `${name} must be a plain object.`);
  return false;
}

function allowed(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  name: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issue(issues, appendPath(path, key), 'UNKNOWN_FIELD', `${name} field "${key}" is not supported.`);
  }
}

function stableId(value: unknown, path: string, issues: SchemaEditorValidationIssue[], name: string): void {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    issue(issues, path, 'INVALID_STABLE_ID', `${name} must be a non-empty trimmed string.`);
  }
}

function optionalString(value: unknown, path: string, issues: SchemaEditorValidationIssue[], name: string): void {
  if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
    issue(issues, path, 'INVALID_STRING', `${name} must be a non-empty string when present.`);
  }
}

function optionalRecord(value: unknown, path: string, issues: SchemaEditorValidationIssue[], name: string): void {
  if (value !== undefined && !isPlainRecord(value)) {
    issue(issues, path, 'INVALID_SERIALIZABLE_RECORD', `${name} must be a serializable record when present.`);
  }
}

function optionalRef(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  name: string,
  optional = true,
): void {
  if (value === undefined && optional) return;
  if (!record(value, path, issues, `${name} reference`)) return;
  allowed(value, REF_KEYS, path, issues, `${name} reference`);
  stableId(value.id, appendPath(path, 'id'), issues, `${name} id`);
  optionalRecord(value.options, appendPath(path, 'options'), issues, `${name} options`);
}

function array(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  name: string,
): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  issue(issues, path, 'INVALID_ARRAY', `${name} must be an array.`);
  return undefined;
}

function duplicate(
  value: unknown,
  seen: Set<string>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  code: string,
): void {
  if (typeof value !== 'string') return;
  if (seen.has(value)) issue(issues, path, code, `Stable id "${value}" must be unique.`);
  else seen.add(value);
}

function issue(
  issues: SchemaEditorValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

