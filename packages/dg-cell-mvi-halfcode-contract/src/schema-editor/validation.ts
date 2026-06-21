import {
  appendPath,
  collectSerializableIssues,
  isPlainRecord,
  snapshotSerializableValue,
  validateStableId,
  validationResult,
  type SchemaEditorValidationIssue,
  type SchemaEditorValidationResult,
} from './serializable';
import { SCHEMA_EDITOR_COMMAND_KINDS } from './commands';
import { SCHEMA_EDITOR_RESOLUTION_PRECEDENCE } from './dialect';

const PLAN_NODE_KINDS = new Set(['group', 'field', 'collection', 'map', 'union', 'custom']);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error']);
const RAW_PRESENTER_IDS = new Set(['raw.json', 'raw.json.textarea', 'raw.code', 'raw.code.editor']);
const COMMAND_KINDS = new Set<string>(SCHEMA_EDITOR_COMMAND_KINDS);
const DIALECT_KEYS = new Set(['id', 'classify', 'transformers', 'config', 'metadata']);
const COMMAND_KEYS_BY_KIND: Record<string, Set<string>> = {
  'value.set': new Set(['kind', 'target', 'value']),
  'collection.insert': new Set(['kind', 'target', 'index', 'value']),
  'collection.remove': new Set(['kind', 'target', 'index']),
  'collection.move': new Set(['kind', 'target', 'from', 'to']),
  'map.set': new Set(['kind', 'target', 'key', 'value']),
  'map.remove': new Set(['kind', 'target', 'key']),
  'map.rename-key': new Set(['kind', 'target', 'from', 'to']),
  'union.select': new Set(['kind', 'target', 'alternativeId', 'initialValue']),
};
const COMMAND_TEMPLATE_KEYS = new Set(['kind', 'target', 'arguments']);
const COMMAND_ARGUMENT_KEYS_BY_KIND: Record<string, Set<string>> = {
  'value.set': new Set(['value']),
  'collection.insert': new Set(['index', 'value']),
  'collection.remove': new Set(['index']),
  'collection.move': new Set(['from', 'to']),
  'map.set': new Set(['key', 'value']),
  'map.remove': new Set(['key']),
  'map.rename-key': new Set(['from', 'to']),
  'union.select': new Set(['alternativeId', 'initialValue']),
};
const REQUIRED_COMMAND_ARGUMENTS_BY_KIND: Record<string, readonly string[]> = {
  'value.set': ['value'],
  'collection.insert': [],
  'collection.remove': ['index'],
  'collection.move': ['from', 'to'],
  'map.set': ['key', 'value'],
  'map.remove': ['key'],
  'map.rename-key': ['from', 'to'],
  'union.select': ['alternativeId'],
};
const COMMAND_ARGUMENT_BINDING_KEYS_BY_SOURCE: Record<string, Set<string>> = {
  event: new Set(['source', 'path']),
  value: new Set(['source', 'path']),
  literal: new Set(['source', 'value']),
};
const UNSAFE_COMMAND_TARGET_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const PLAN_NODE_ID_PATTERN = /^[A-Za-z0-9_$][A-Za-z0-9_$.:/#-]*$/;
const SCALAR_KINDS = new Set(['string', 'number', 'integer', 'boolean', 'null']);
const PLAN_METADATA_KEYS_BY_KIND: Record<string, Set<string>> = {
  group: new Set(['display', 'field', 'constraints']),
  field: new Set(['display', 'field', 'constraints', 'scalar', 'ref']),
  collection: new Set(['display', 'field', 'constraints', 'itemDefault', 'identity']),
  map: new Set(['display', 'field', 'constraints', 'key', 'valueDefault']),
  union: new Set(['display', 'field', 'constraints', 'discriminator', 'alternativeDescriptors']),
  custom: new Set(['display', 'field', 'constraints', 'config']),
};

export function validateEditorPlan(value: unknown): SchemaEditorValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$', issues);
  if (snapshot !== undefined) validatePlan(snapshot, '$', issues);
  return validationResult(issues);
}

export function validateSchemaEditorDialect(value: unknown): SchemaEditorValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  validateDialect(value, '$', issues);
  return validationResult(issues);
}

export function validateSchemaEditorCommand(value: unknown): SchemaEditorValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$', issues);
  if (snapshot !== undefined) validateCommand(snapshot, '$', issues);
  return validationResult(issues);
}

function validatePlan(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_EDITOR_PLAN', message: 'EditorPlan must be a plain object.' });
    return;
  }
  const kind = ownPropertyValue(value, 'kind');
  if (kind !== 'editor-plan') {
    issues.push({ path: appendPath(path, 'kind'), code: 'INVALID_EDITOR_PLAN_KIND', message: 'EditorPlan kind must be "editor-plan".' });
  }
  validateStableId(ownPropertyValue(value, 'id'), appendPath(path, 'id'), issues, 'editor plan id');
  validatePlanNode(ownPropertyValue(value, 'root'), appendPath(path, 'root'), issues, new Set());
  const diagnostics = ownPropertyValue(value, 'diagnostics');
  if (diagnostics !== undefined) {
    validateDiagnostics(diagnostics, appendPath(path, 'diagnostics'), issues);
  }
  const provenance = ownPropertyValue(value, 'provenance');
  if (provenance !== undefined && !isPlainRecord(provenance)) {
    issues.push({ path: appendPath(path, 'provenance'), code: 'INVALID_PROVENANCE', message: 'Plan provenance must be serializable object data.' });
  }
}

function validatePlanNode(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenNodeIds: Set<string>,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_PLAN_NODE', message: 'EditorPlan node must be a plain object.' });
    return;
  }

  const kind = ownPropertyValue(value, 'kind');
  if (typeof kind !== 'string' || !PLAN_NODE_KINDS.has(kind)) {
    issues.push({ path: appendPath(path, 'kind'), code: 'UNKNOWN_PLAN_NODE_KIND', message: 'EditorPlan node kind must be one of group, field, collection, map, union, or custom.' });
    return;
  }

  const id = ownPropertyValue(value, 'id');
  validatePlanNodeId(id, appendPath(path, 'id'), issues);
  if (typeof id === 'string') {
    if (seenNodeIds.has(id)) {
      issues.push({ path: appendPath(path, 'id'), code: 'DUPLICATE_PLAN_NODE_ID', message: `Plan node id "${id}" must be unique.` });
    } else {
      seenNodeIds.add(id);
    }
  }

  validateValuePath(ownPropertyValue(value, 'path'), appendPath(path, 'path'), issues);
  const presenter = ownPropertyValue(value, 'presenter');
  if (presenter !== undefined) {
    validatePresenterRef(presenter, appendPath(path, 'presenter'), issues);
  }
  const valueBinding = ownPropertyValue(value, 'value');
  if (valueBinding !== undefined) {
    validateBinding(valueBinding, appendPath(path, 'value'), issues, 'value binding');
  }
  const validation = ownPropertyValue(value, 'validation');
  if (validation !== undefined) {
    validateBinding(validation, appendPath(path, 'validation'), issues, 'validation binding');
  }
  const validationBindings = ownPropertyValue(value, 'validationBindings');
  if (validationBindings !== undefined) {
    validateBindingList(validationBindings, appendPath(path, 'validationBindings'), issues, 'validation binding');
  }
  const commandBindings = ownPropertyValue(value, 'commandBindings');
  if (commandBindings !== undefined) {
    validateCommandBindings(commandBindings, appendPath(path, 'commandBindings'), issues);
  }
  const diagnostics = ownPropertyValue(value, 'diagnostics');
  if (diagnostics !== undefined) {
    validateDiagnostics(diagnostics, appendPath(path, 'diagnostics'), issues);
  }
  const provenance = ownPropertyValue(value, 'provenance');
  if (provenance !== undefined && !isPlainRecord(provenance)) {
    issues.push({ path: appendPath(path, 'provenance'), code: 'INVALID_PROVENANCE', message: 'Node provenance must be serializable object data.' });
  }

  validatePlanMetadata(value, path, issues);

  validateUnsupportedPolicy(value, path, issues);

  switch (kind) {
    case 'group':
      validateNodeList(ownPropertyValue(value, 'children'), appendPath(path, 'children'), issues, seenNodeIds, true);
      return;
    case 'field':
    case 'custom':
      return;
    case 'collection':
      const itemTemplate = ownPropertyValue(value, 'itemTemplate');
      validatePlanNode(itemTemplate, appendPath(path, 'itemTemplate'), issues, seenNodeIds);
      validateWildcardTemplate(itemTemplate, appendPath(path, 'itemTemplate'), issues);
      if (ownPropertyValue(value, 'children') !== undefined) {
        validateNodeList(ownPropertyValue(value, 'children'), appendPath(path, 'children'), issues, seenNodeIds);
      }
      return;
    case 'map':
      const valueTemplate = ownPropertyValue(value, 'valueTemplate');
      validatePlanNode(valueTemplate, appendPath(path, 'valueTemplate'), issues, seenNodeIds);
      validateWildcardTemplate(valueTemplate, appendPath(path, 'valueTemplate'), issues);
      if (ownPropertyValue(value, 'entries') !== undefined) {
        validateNodeList(ownPropertyValue(value, 'entries'), appendPath(path, 'entries'), issues, seenNodeIds);
      }
      return;
    case 'union':
      validateNodeRecord(ownPropertyValue(value, 'alternatives'), appendPath(path, 'alternatives'), issues, seenNodeIds);
      return;
  }
}

function validatePlanMetadata(
  node: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const metadataPath = appendPath(path, 'metadata');
  const kind = ownPropertyValue(node, 'kind');
  const metadataValue = ownPropertyValue(node, 'metadata');
  if (!isPlainRecord(metadataValue)) {
    issues.push({ path: metadataPath, code: 'MISSING_PLAN_METADATA', message: `${String(kind)} plan nodes require typed metadata.` });
    return;
  }

  const metadata = metadataValue;
  validateAllowedKeys(metadata, PLAN_METADATA_KEYS_BY_KIND[String(kind)], metadataPath, issues, `${String(kind)} metadata`);
  validateDisplayMetadata(ownPropertyValue(metadata, 'display'), appendPath(metadataPath, 'display'), issues);
  if (ownPropertyValue(metadata, 'field') !== undefined) {
    validateFieldMetadata(ownPropertyValue(metadata, 'field'), appendPath(metadataPath, 'field'), issues);
  }
  const constraints = ownPropertyValue(metadata, 'constraints');
  if (constraints !== undefined && !isPlainRecord(constraints)) {
    issues.push({ path: appendPath(metadataPath, 'constraints'), code: 'INVALID_CONSTRAINTS', message: 'Plan constraints must be serializable object data.' });
  }

  switch (kind) {
    case 'field':
      validateFieldFacts(metadata, metadataPath, issues);
      return;
    case 'collection':
      validateCollectionIdentity(ownPropertyValue(metadata, 'identity'), appendPath(metadataPath, 'identity'), issues);
      return;
    case 'map':
      validateMapKeyFacts(ownPropertyValue(metadata, 'key'), appendPath(metadataPath, 'key'), issues);
      return;
    case 'union':
      validateUnionFacts(metadata, ownPropertyValue(node, 'alternatives'), metadataPath, issues);
      return;
    case 'custom':
      const config = ownPropertyValue(metadata, 'config');
      if (config !== undefined && !isPlainRecord(config)) {
        issues.push({ path: appendPath(metadataPath, 'config'), code: 'INVALID_CUSTOM_CONFIG', message: 'Custom metadata config must be serializable object data.' });
      }
  }
}

function validateDisplayMetadata(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_DISPLAY_METADATA', message: 'Plan metadata requires display facts.' });
    return;
  }
  validateAllowedKeys(value, new Set(['label', 'description', 'visible', 'readOnly', 'group']), path, issues, 'display metadata');
  validateNonEmptyString(ownPropertyValue(value, 'label'), appendPath(path, 'label'), issues, 'display label');
  const description = ownPropertyValue(value, 'description');
  if (description !== undefined && typeof description !== 'string') {
    issues.push({ path: appendPath(path, 'description'), code: 'INVALID_DISPLAY_DESCRIPTION', message: 'Display description must be a string.' });
  }
  if (typeof ownPropertyValue(value, 'visible') !== 'boolean') {
    issues.push({ path: appendPath(path, 'visible'), code: 'INVALID_VISIBLE_FLAG', message: 'Display visible must be boolean.' });
  }
  if (typeof ownPropertyValue(value, 'readOnly') !== 'boolean') {
    issues.push({ path: appendPath(path, 'readOnly'), code: 'INVALID_READ_ONLY_FLAG', message: 'Display readOnly must be boolean.' });
  }
  const group = ownPropertyValue(value, 'group');
  if (group !== undefined && (typeof group !== 'string' || group.length === 0)) {
    issues.push({ path: appendPath(path, 'group'), code: 'INVALID_DISPLAY_GROUP', message: 'Display group must be a non-empty string.' });
  }
}

function validateFieldMetadata(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_FIELD_METADATA', message: 'Field metadata must be plain data.' });
    return;
  }
  validateAllowedKeys(value, new Set(['key', 'required']), path, issues, 'field metadata');
  validateNonEmptyString(ownPropertyValue(value, 'key'), appendPath(path, 'key'), issues, 'field key');
  if (typeof ownPropertyValue(value, 'required') !== 'boolean') {
    issues.push({ path: appendPath(path, 'required'), code: 'INVALID_REQUIRED_FLAG', message: 'Field required must be boolean.' });
  }
}

function validateFieldFacts(
  metadata: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const scalar = ownPropertyValue(metadata, 'scalar');
  const ref = ownPropertyValue(metadata, 'ref');
  const hasScalar = scalar !== undefined;
  const hasRef = ref !== undefined;
  if (hasScalar === hasRef) {
    issues.push({ path, code: 'INVALID_FIELD_FACTS', message: 'Field metadata requires exactly one of scalar or ref facts.' });
    return;
  }
  if (hasScalar) validateScalarFacts(scalar, appendPath(path, 'scalar'), issues);
  if (hasRef) validateStableId(ref, appendPath(path, 'ref'), issues, 'ref identity');
}

function validateScalarFacts(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_SCALAR_FACTS', message: 'Scalar facts must be plain data.' });
    return;
  }
  validateAllowedKeys(value, new Set(['kind', 'enum', 'const', 'default']), path, issues, 'scalar facts');
  const scalarKind = ownPropertyValue(value, 'kind');
  if (typeof scalarKind !== 'string' || !SCALAR_KINDS.has(scalarKind)) {
    issues.push({ path: appendPath(path, 'kind'), code: 'INVALID_SCALAR', message: 'Scalar facts require a supported kind.' });
    return;
  }
  const enumValue = ownPropertyValue(value, 'enum');
  if (enumValue !== undefined) {
    if (!Array.isArray(enumValue) || ownArrayLength(enumValue) === 0) {
      issues.push({ path: appendPath(path, 'enum'), code: 'INVALID_ENUM', message: 'Scalar enum must be a non-empty array.' });
    } else {
      forEachOwnArray(enumValue, appendPath(path, 'enum'), issues, (entry, index) =>
        validateScalarValue(entry, scalarKind, appendPath(appendPath(path, 'enum'), index), issues));
    }
  }
  const constValue = ownPropertyValue(value, 'const');
  const defaultValue = ownPropertyValue(value, 'default');
  if (Object.hasOwn(value, 'const')) validateScalarValue(constValue, scalarKind, appendPath(path, 'const'), issues);
  if (Object.hasOwn(value, 'default')) {
    validateScalarValue(defaultValue, scalarKind, appendPath(path, 'default'), issues);
    if (Array.isArray(enumValue) && !ownArrayValues(enumValue).some((entry) => serializableEquals(entry, defaultValue))) {
      issues.push({ path: appendPath(path, 'default'), code: 'DEFAULT_OUTSIDE_ENUM', message: 'Scalar default must be one of the enum values.' });
    }
    if (Object.hasOwn(value, 'const') && !serializableEquals(constValue, defaultValue)) {
      issues.push({ path: appendPath(path, 'default'), code: 'DEFAULT_DIFFERS_FROM_CONST', message: 'Scalar default must equal const.' });
    }
  }
}

function validateCollectionIdentity(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_COLLECTION_IDENTITY', message: 'Collection metadata requires an identity hint.' });
    return;
  }
  const strategy = ownPropertyValue(value, 'strategy');
  if (strategy === 'ephemeral') {
    validateAllowedKeys(value, new Set(['strategy']), path, issues, 'ephemeral identity');
    return;
  }
  if (strategy !== 'property') {
    issues.push({ path: appendPath(path, 'strategy'), code: 'INVALID_IDENTITY_STRATEGY', message: 'Identity strategy must be property or ephemeral.' });
    return;
  }
  validateAllowedKeys(value, new Set(['strategy', 'path', 'fallback']), path, issues, 'property identity');
  const identityPath = ownPropertyValue(value, 'path');
  if (!Array.isArray(identityPath) || ownArrayLength(identityPath) === 0) {
    issues.push({ path: appendPath(path, 'path'), code: 'INVALID_IDENTITY_PATH', message: 'Property identity requires a non-empty path.' });
  } else {
    forEachOwnArray(identityPath, appendPath(path, 'path'), issues, (segment, index) => {
      if ((typeof segment !== 'string' || segment.length === 0) && (!Number.isInteger(segment) || (segment as number) < 0)) {
        issues.push({ path: appendPath(appendPath(path, 'path'), index), code: 'INVALID_IDENTITY_PATH', message: 'Identity path segments must be non-empty strings or non-negative integers.' });
      }
    });
  }
  if (ownPropertyValue(value, 'fallback') !== 'ephemeral') {
    issues.push({ path: appendPath(path, 'fallback'), code: 'INVALID_IDENTITY_FALLBACK', message: 'Property identity fallback must be ephemeral.' });
  }
}

function validateMapKeyFacts(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_MAP_KEY_FACTS', message: 'Map metadata requires key facts.' });
    return;
  }
  validateAllowedKeys(value, new Set(['scalar', 'constraints']), path, issues, 'map key facts');
  if (ownPropertyValue(value, 'scalar') !== 'string') {
    issues.push({ path: appendPath(path, 'scalar'), code: 'INVALID_MAP_KEY_SCALAR', message: 'Map key scalar must be string.' });
  }
  const constraints = ownPropertyValue(value, 'constraints');
  if (constraints !== undefined && !isPlainRecord(constraints)) {
    issues.push({ path: appendPath(path, 'constraints'), code: 'INVALID_CONSTRAINTS', message: 'Map key constraints must be serializable object data.' });
  }
}

function validateUnionFacts(
  metadata: Record<string, unknown>,
  alternatives: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const discriminator = ownPropertyValue(metadata, 'discriminator');
  if (discriminator !== undefined && (typeof discriminator !== 'string' || discriminator.length === 0)) {
    issues.push({ path: appendPath(path, 'discriminator'), code: 'INVALID_DISCRIMINATOR', message: 'Union discriminator must be a non-empty string.' });
  }
  const alternativeDescriptors = ownPropertyValue(metadata, 'alternativeDescriptors');
  if (!Array.isArray(alternativeDescriptors) || ownArrayLength(alternativeDescriptors) === 0) {
    issues.push({ path: appendPath(path, 'alternativeDescriptors'), code: 'INVALID_ALTERNATIVE_DESCRIPTORS', message: 'Union metadata requires ordered alternative descriptors.' });
    return;
  }
  const descriptorIds = new Set<string>();
  forEachOwnArray(alternativeDescriptors, appendPath(path, 'alternativeDescriptors'), issues, (descriptor, index) => {
    const descriptorPath = appendPath(appendPath(path, 'alternativeDescriptors'), index);
    if (!isPlainRecord(descriptor)) {
      issues.push({ path: descriptorPath, code: 'INVALID_ALTERNATIVE_DESCRIPTOR', message: 'Union alternative descriptor must be plain data.' });
      return;
    }
    validateAllowedKeys(descriptor, new Set(['id', 'label', 'description', 'initialValue']), descriptorPath, issues, 'union alternative descriptor');
    const descriptorId = ownPropertyValue(descriptor, 'id');
    validateStableId(descriptorId, appendPath(descriptorPath, 'id'), issues, 'union alternative id');
    if (typeof descriptorId === 'string') {
      if (descriptorIds.has(descriptorId)) {
        issues.push({ path: appendPath(descriptorPath, 'id'), code: 'DUPLICATE_IDENTITY', message: `Union alternative id "${descriptorId}" must be unique.` });
      }
      descriptorIds.add(descriptorId);
    }
    for (const key of ['label', 'description'] as const) {
      const text = ownPropertyValue(descriptor, key);
      if (text !== undefined && typeof text !== 'string') {
        issues.push({ path: appendPath(descriptorPath, key), code: 'INVALID_STRING', message: `Union alternative ${key} must be a string.` });
      }
    }
  });
  if (isPlainRecord(alternatives)) {
    const alternativeIds = Object.keys(alternatives);
    if (alternativeIds.some((id) => !descriptorIds.has(id)) || [...descriptorIds].some((id) => !(id in alternatives))) {
      issues.push({ path: appendPath(path, 'alternativeDescriptors'), code: 'ALTERNATIVE_DESCRIPTOR_MISMATCH', message: 'Union descriptors must match alternative ids exactly.' });
    }
  }
}

function validateWildcardTemplate(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  const templatePath = isPlainRecord(value) ? ownPropertyValue(value, 'path') : undefined;
  if (!Array.isArray(templatePath) || !ownArrayValues(templatePath).includes('*')) {
    issues.push({ path: appendPath(path, 'path'), code: 'INVALID_WILDCARD_TEMPLATE_PATH', message: 'Collection and map template paths must contain a wildcard segment.' });
  }
}

function validateScalarValue(value: unknown, scalar: string, path: string, issues: SchemaEditorValidationIssue[]): void {
  const valid =
    (scalar === 'string' && typeof value === 'string') ||
    (scalar === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (scalar === 'integer' && Number.isInteger(value)) ||
    (scalar === 'boolean' && typeof value === 'boolean') ||
    (scalar === 'null' && value === null);
  if (!valid) {
    issues.push({ path, code: 'INVALID_SCALAR_VALUE', message: `Value must match scalar kind ${scalar}.` });
  }
}

function serializableEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateNodeList(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenNodeIds: Set<string>,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_PLAN_NODE_LIST', message: 'Plan child nodes must be an array.' });
    return;
  }
  forEachOwnArray(value, path, issues, (node, index) =>
    validatePlanNode(node, appendPath(path, index), issues, seenNodeIds));
}

function validateNodeRecord(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenNodeIds: Set<string>,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_PLAN_NODE_RECORD', message: 'Plan node alternatives must be an object map.' });
    return;
  }
  for (const [key, node] of ownDataEntries(value, path, issues)) {
    validateStableId(key, appendPath(path, key), issues, 'plan alternative id');
    validatePlanNode(node, appendPath(path, key), issues, seenNodeIds);
  }
}

function validatePresenterRef(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_PRESENTER', message: 'Presenter reference must be a plain object.' });
    return;
  }
  const id = ownPropertyValue(value, 'id');
  validateStableId(id, appendPath(path, 'id'), issues, 'presenter id');
  if (typeof id === 'string' && RAW_PRESENTER_IDS.has(id) && ownPropertyValue(value, 'explicit') !== true) {
    issues.push({ path, code: 'IMPLICIT_RAW_PRESENTER', message: 'Raw JSON or code presenters must be explicitly selected.' });
  }
  if (Object.hasOwn(value, 'options') && !isPlainRecord(ownPropertyValue(value, 'options'))) {
    issues.push({ path: appendPath(path, 'options'), code: 'INVALID_PRESENTER_OPTIONS', message: 'Presenter options must be serializable object data.' });
  }
  if (Object.hasOwn(value, 'explicit') && typeof ownPropertyValue(value, 'explicit') !== 'boolean') {
    issues.push({ path: appendPath(path, 'explicit'), code: 'INVALID_EXPLICIT_FLAG', message: 'Presenter explicit flag must be boolean.' });
  }
  if (Object.hasOwn(value, 'reason') && typeof ownPropertyValue(value, 'reason') !== 'string') {
    issues.push({ path: appendPath(path, 'reason'), code: 'INVALID_EXPLICIT_REASON', message: 'Presenter explicit reason must be a string.' });
  }
}

function validateBinding(value: unknown, path: string, issues: SchemaEditorValidationIssue[], label: string): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_BINDING', message: `${label} must be a plain object.` });
    return;
  }
  const source = ownPropertyValue(value, 'source');
  if (!Object.hasOwn(value, 'source') || typeof source !== 'string' || source.length === 0) {
    issues.push({ path: appendPath(path, 'source'), code: 'INVALID_BINDING_SOURCE', message: `${label} requires a non-empty source.` });
  }
  if (Object.hasOwn(value, 'path')) {
    validateValuePath(ownPropertyValue(value, 'path'), appendPath(path, 'path'), issues);
  }
}

function validateBindingList(value: unknown, path: string, issues: SchemaEditorValidationIssue[], label: string): void {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_BINDING_LIST', message: `${label} list must be an array.` });
    return;
  }
  forEachOwnArray(value, path, issues, (binding, index) =>
    validateBinding(binding, appendPath(path, index), issues, label));
}

function validateCommandBindings(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_COMMAND_BINDINGS', message: 'Command bindings must be an array.' });
    return;
  }
  forEachOwnArray(value, path, issues, (binding, index) => {
    const bindingPath = appendPath(path, index);
    if (!isPlainRecord(binding)) {
      issues.push({ path: bindingPath, code: 'INVALID_COMMAND_BINDING', message: 'Command binding must be a plain object.' });
      return;
    }
    const event = ownPropertyValue(binding, 'event');
    if (!Object.hasOwn(binding, 'event') || typeof event !== 'string' || event.length === 0) {
      issues.push({ path: appendPath(bindingPath, 'event'), code: 'INVALID_COMMAND_EVENT', message: 'Command binding event must be a non-empty string.' });
    }
    validateAllowedKeys(binding, new Set(['event', 'commandTemplate']), bindingPath, issues, 'EditorCommandBinding');
    validateCommandTemplate(ownPropertyValue(binding, 'commandTemplate'), appendPath(bindingPath, 'commandTemplate'), issues);
  });
}

function validateDiagnostics(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_DIAGNOSTICS', message: 'Diagnostics must be an array.' });
    return;
  }
  forEachOwnArray(value, path, issues, (diagnostic, index) => {
    const diagnosticPath = appendPath(path, index);
    if (!isPlainRecord(diagnostic)) {
      issues.push({ path: diagnosticPath, code: 'INVALID_DIAGNOSTIC', message: 'Diagnostic must be a plain object.' });
      return;
    }
    const severity = ownPropertyValue(diagnostic, 'severity');
    const code = ownPropertyValue(diagnostic, 'code');
    const message = ownPropertyValue(diagnostic, 'message');
    const diagnosticValuePath = ownPropertyValue(diagnostic, 'path');
    if (typeof severity !== 'string' || !DIAGNOSTIC_SEVERITIES.has(severity)) {
      issues.push({ path: appendPath(diagnosticPath, 'severity'), code: 'INVALID_DIAGNOSTIC_SEVERITY', message: 'Diagnostic severity must be info, warning, or error.' });
    }
    if (typeof code !== 'string' || code.length === 0) {
      issues.push({ path: appendPath(diagnosticPath, 'code'), code: 'INVALID_DIAGNOSTIC_CODE', message: 'Diagnostic code is required.' });
    }
    if (typeof message !== 'string' || message.length === 0) {
      issues.push({ path: appendPath(diagnosticPath, 'message'), code: 'INVALID_DIAGNOSTIC_MESSAGE', message: 'Diagnostic message is required.' });
    }
    if (diagnosticValuePath !== undefined) {
      validateValuePath(diagnosticValuePath, appendPath(diagnosticPath, 'path'), issues);
    }
  });
}

function validateUnsupportedPolicy(
  value: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const presenter = ownPropertyValue(value, 'presenter');
  if (!isPlainRecord(presenter) || ownPropertyValue(presenter, 'id') !== 'unsupported') return;
  const diagnostics = ownPropertyValue(value, 'diagnostics');
  if (
    !Array.isArray(diagnostics) ||
    !ownArrayValues(diagnostics).some((diagnostic) => {
      if (!isPlainRecord(diagnostic)) return false;
      const severity = ownPropertyValue(diagnostic, 'severity');
      const code = ownPropertyValue(diagnostic, 'code');
      return severity === 'error' && typeof code === 'string' && code.includes('UNSUPPORTED');
    })
  ) {
    issues.push({ path: appendPath(path, 'diagnostics'), code: 'MISSING_UNSUPPORTED_DIAGNOSTIC', message: 'Unsupported presenter nodes must carry an unsupported error diagnostic.' });
  }
}

function validateDialect(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_DIALECT', message: 'SchemaEditorDialect must be a plain object.' });
    return;
  }

  validateStableId(ownPropertyValue(value, 'id'), appendPath(path, 'id'), issues, 'dialect id');
  validateBaseResolutionPrecedence(issues);

  for (const [key, child] of ownDataEntries(value, path, issues)) {
    const childPath = appendPath(path, key);
    if (!DIALECT_KEYS.has(key)) {
      issues.push({ path: childPath, code: 'UNKNOWN_DIALECT_FIELD', message: 'SchemaEditorDialect supports only id, classify, transformers, config, and metadata.' });
      continue;
    }
    if (key === 'classify') {
      validateProcessor(child, childPath, issues);
      continue;
    }
    if (key === 'transformers') {
      validateTransformers(child, childPath, issues);
      continue;
    }
    if (key === 'id') {
      collectSerializableIssues(child, childPath, issues);
      continue;
    }
    collectSerializableIssues(child, childPath, issues);
  }
}

function validateProcessor(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (typeof value !== 'function') {
    issues.push({ path, code: 'INVALID_PROCESSOR', message: 'Schema editor processors must be callable functions.' });
    return;
  }
  if (ownPropertyValue(value, 'length') !== 3) {
    issues.push({ path, code: 'INVALID_PROCESSOR_ARITY', message: 'Schema editor processors must have exactly runtime, input, config parameters.' });
  }
}

function validateTransformers(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_TRANSFORMERS', message: 'Transformers must be an object map.' });
    return;
  }
  for (const [key, child] of ownDataEntries(value, path, issues)) {
    const childPath = appendPath(path, key);
    if (typeof child === 'function') {
      validateProcessor(child, childPath, issues);
    } else {
      issues.push({ path: childPath, code: 'INVALID_TRANSFORMER', message: 'Transformer entries must be processor functions.' });
    }
  }
}

function validateBaseResolutionPrecedence(issues: SchemaEditorValidationIssue[]): void {
  if (
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE.length !== 5 ||
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE[0] !== 'presentation' ||
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE[1] !== 'semantic' ||
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE[2] !== 'format' ||
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE[3] !== 'structural' ||
    SCHEMA_EDITOR_RESOLUTION_PRECEDENCE[4] !== 'unsupported'
  ) {
    issues.push({
      path: '$',
      code: 'INVALID_RESOLUTION_PRECEDENCE',
      message: 'Base resolution precedence must be presentation > semantic > format > structural > unsupported.',
    });
  }
}

function validatePlanNodeId(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (typeof value !== 'string' || !PLAN_NODE_ID_PATTERN.test(value)) {
    issues.push({ path, code: 'INVALID_STABLE_ID', message: 'plan node id must be a stable non-empty string id.' });
  }
}

function validateCommand(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_COMMAND', message: 'Schema editor command must be a plain object.' });
    return;
  }
  const kind = ownPropertyValue(value, 'kind');
  if (!Object.hasOwn(value, 'kind') || typeof kind !== 'string' || !COMMAND_KINDS.has(kind)) {
    issues.push({ path: appendPath(path, 'kind'), code: 'UNKNOWN_COMMAND_KIND', message: 'Schema editor command kind is not supported.' });
    return;
  }

  validateAllowedKeys(value, COMMAND_KEYS_BY_KIND[kind], path, issues, 'SchemaEditorCommand');
  requireProperty(value, 'target', path, issues);
  validateCommandTargetPath(ownPropertyValue(value, 'target'), appendPath(path, 'target'), issues);

  switch (kind) {
    case 'value.set':
      requireProperty(value, 'value', path, issues);
      return;
    case 'collection.insert':
      if (Object.hasOwn(value, 'index')) validateNonNegativeInteger(ownPropertyValue(value, 'index'), appendPath(path, 'index'), issues);
      return;
    case 'collection.remove':
      requireProperty(value, 'index', path, issues);
      validateNonNegativeInteger(ownPropertyValue(value, 'index'), appendPath(path, 'index'), issues);
      return;
    case 'collection.move':
      requireProperty(value, 'from', path, issues);
      requireProperty(value, 'to', path, issues);
      validateNonNegativeInteger(ownPropertyValue(value, 'from'), appendPath(path, 'from'), issues);
      validateNonNegativeInteger(ownPropertyValue(value, 'to'), appendPath(path, 'to'), issues);
      return;
    case 'map.set':
      requireProperty(value, 'key', path, issues);
      requireProperty(value, 'value', path, issues);
      validateNonEmptyString(ownPropertyValue(value, 'key'), appendPath(path, 'key'), issues, 'map key');
      return;
    case 'map.remove':
      requireProperty(value, 'key', path, issues);
      validateNonEmptyString(ownPropertyValue(value, 'key'), appendPath(path, 'key'), issues, 'map key');
      return;
    case 'map.rename-key':
      requireProperty(value, 'from', path, issues);
      requireProperty(value, 'to', path, issues);
      validateNonEmptyString(ownPropertyValue(value, 'from'), appendPath(path, 'from'), issues, 'source map key');
      validateNonEmptyString(ownPropertyValue(value, 'to'), appendPath(path, 'to'), issues, 'target map key');
      return;
    case 'union.select':
      requireProperty(value, 'alternativeId', path, issues);
      validateStableId(ownPropertyValue(value, 'alternativeId'), appendPath(path, 'alternativeId'), issues, 'union alternative id');
      return;
  }
}

function validateCommandTemplate(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_COMMAND_TEMPLATE', message: 'Schema editor command template must be a plain object.' });
    return;
  }
  const kind = ownPropertyValue(value, 'kind');
  if (!Object.hasOwn(value, 'kind') || typeof kind !== 'string' || !COMMAND_KINDS.has(kind)) {
    issues.push({ path: appendPath(path, 'kind'), code: 'UNKNOWN_COMMAND_KIND', message: 'Schema editor command template kind is not supported.' });
    return;
  }

  validateAllowedKeys(value, COMMAND_TEMPLATE_KEYS, path, issues, 'SchemaEditorCommandTemplate');
  requireTemplateProperty(value, 'target', path, issues);
  validateCommandArgumentBinding(ownPropertyValue(value, 'target'), appendPath(path, 'target'), issues, 'target');

  const argumentPath = appendPath(path, 'arguments');
  const argumentsValue = ownPropertyValue(value, 'arguments');
  if (!Object.hasOwn(value, 'arguments') || argumentsValue === undefined) {
    if (REQUIRED_COMMAND_ARGUMENTS_BY_KIND[kind].length > 0) {
      issues.push({ path: argumentPath, code: 'MISSING_COMMAND_ARGUMENTS', message: `Command template ${kind} requires arguments.` });
    }
    return;
  }
  if (!isPlainRecord(argumentsValue)) {
    issues.push({ path: argumentPath, code: 'INVALID_COMMAND_ARGUMENTS', message: 'Command template arguments must be a plain object.' });
    return;
  }

  const allowedArguments = COMMAND_ARGUMENT_KEYS_BY_KIND[kind];
  validateAllowedKeys(argumentsValue, allowedArguments, argumentPath, issues, 'SchemaEditorCommandTemplate arguments');
  for (const requiredArgument of REQUIRED_COMMAND_ARGUMENTS_BY_KIND[kind]) {
    if (!Object.hasOwn(argumentsValue, requiredArgument)) {
      issues.push({
        path: appendPath(argumentPath, requiredArgument),
        code: 'MISSING_COMMAND_ARGUMENT',
        message: `Command template ${kind} requires argument ${requiredArgument}.`,
      });
    }
  }
  for (const [argument, binding] of ownDataEntries(argumentsValue, argumentPath, issues)) {
    if (!allowedArguments.has(argument)) continue;
    validateCommandArgumentBinding(
      binding,
      appendPath(argumentPath, argument),
      issues,
      commandArgumentLiteralKind(kind, argument),
    );
  }
}

function validateCommandArgumentBinding(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  literalKind: 'target' | 'index' | 'string' | 'alternativeId' | 'value',
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_COMMAND_ARGUMENT_BINDING', message: 'Command template bindings must be plain objects.' });
    return;
  }
  const source = ownPropertyValue(value, 'source');
  if (
    !Object.hasOwn(value, 'source') ||
    typeof source !== 'string' ||
    !Object.hasOwn(COMMAND_ARGUMENT_BINDING_KEYS_BY_SOURCE, source)
  ) {
    issues.push({ path: appendPath(path, 'source'), code: 'INVALID_COMMAND_ARGUMENT_SOURCE', message: 'Command template binding source must be event, value, or literal.' });
    return;
  }

  validateAllowedKeys(
    value,
    COMMAND_ARGUMENT_BINDING_KEYS_BY_SOURCE[source],
    path,
    issues,
    'SchemaEditorCommandArgument',
  );
  if (source === 'event' || source === 'value') {
    validateValuePath(ownPropertyValue(value, 'path'), appendPath(path, 'path'), issues);
    return;
  }
  if (!Object.hasOwn(value, 'value')) {
    issues.push({ path: appendPath(path, 'value'), code: 'MISSING_COMMAND_ARGUMENT_VALUE', message: 'Literal command template bindings require value.' });
    return;
  }

  const literalValue = ownPropertyValue(value, 'value');
  switch (literalKind) {
    case 'target':
      validateCommandTargetPath(literalValue, appendPath(path, 'value'), issues);
      return;
    case 'index':
      validateNonNegativeInteger(literalValue, appendPath(path, 'value'), issues);
      return;
    case 'string':
      validateNonEmptyString(literalValue, appendPath(path, 'value'), issues, 'literal command argument');
      return;
    case 'alternativeId':
      validateStableId(literalValue, appendPath(path, 'value'), issues, 'union alternative id');
      return;
    case 'value':
      return;
  }
}

function commandArgumentLiteralKind(
  commandKind: string,
  argument: string,
): 'index' | 'string' | 'alternativeId' | 'value' {
  if (commandKind.startsWith('collection.') && (argument === 'index' || argument === 'from' || argument === 'to')) {
    return 'index';
  }
  if (commandKind.startsWith('map.') && argument !== 'value') {
    return 'string';
  }
  if (commandKind === 'union.select' && argument === 'alternativeId') {
    return 'alternativeId';
  }
  return 'value';
}

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  label: string,
): void {
  for (const [key] of ownDataEntries(value, path, issues)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: appendPath(path, key), code: 'UNKNOWN_CONTRACT_FIELD', message: `${label} does not allow unknown field "${key}".` });
    }
  }
}

function validateValuePath(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_VALUE_PATH', message: 'ValuePath must be an array.' });
    return;
  }
  forEachOwnArray(value, path, issues, (segment, index) => {
    if (
      segment !== '*' &&
      (typeof segment !== 'string' || segment.length === 0) &&
      (!Number.isInteger(segment) || (segment as number) < 0)
    ) {
      issues.push({ path: appendPath(path, index), code: 'INVALID_VALUE_PATH_SEGMENT', message: 'ValuePath segments must be non-empty strings, non-negative integers, or "*".' });
    }
  });
}

function validateCommandTargetPath(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  validateValuePath(value, path, issues);
  if (!Array.isArray(value)) return;
  forEachOwnArray(value, path, issues, (segment, index) => {
    if (typeof segment === 'string' && UNSAFE_COMMAND_TARGET_SEGMENTS.has(segment)) {
      issues.push({
        path: appendPath(path, index),
        code: 'UNSAFE_VALUE_PATH_SEGMENT',
        message: `Command target segment "${segment}" is unsafe.`,
      });
    }
  });
}

function validateNonNegativeInteger(value: unknown, path: string, issues: SchemaEditorValidationIssue[]): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    issues.push({ path, code: 'INVALID_INDEX', message: 'Index values must be non-negative integers.' });
  }
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  label: string,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, code: 'INVALID_STRING', message: `${label} must be a non-empty string.` });
  }
}

function requireProperty(
  value: Record<string, unknown>,
  property: string,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!Object.hasOwn(value, property)) {
    issues.push({ path: appendPath(path, property), code: 'MISSING_COMMAND_PAYLOAD', message: `Command requires ${property}.` });
  }
}

function requireTemplateProperty(
  value: Record<string, unknown>,
  property: string,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!Object.hasOwn(value, property)) {
    issues.push({
      path: appendPath(path, property),
      code: 'MISSING_COMMAND_TEMPLATE_PAYLOAD',
      message: `Command template requires ${property}.`,
    });
  }
}

function ownPropertyValue(value: object, property: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function ownDataEntries(
  value: object,
  path: string,
  issues: SchemaEditorValidationIssue[],
): Array<[string, unknown]> {
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract property names could not be inspected safely.' });
    return [];
  }
  const entries: Array<[string, unknown]> = [];
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      issues.push({ path: appendPath(path, key), code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract property descriptors could not be inspected safely.' });
      continue;
    }
    if (!descriptor || !('value' in descriptor)) {
      issues.push({ path: appendPath(path, key), code: 'ACCESSOR_CONTRACT_FIELD', message: 'Contract validation does not execute accessor properties.' });
      continue;
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function ownArrayLength(value: readonly unknown[]): number {
  const length = ownPropertyValue(value, 'length');
  return typeof length === 'number' && Number.isInteger(length) && length >= 0 ? length : 0;
}

function ownArrayValues(value: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  const length = ownArrayLength(value);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor && 'value' in descriptor) result.push(descriptor.value);
  }
  return result;
}

function forEachOwnArray(
  value: readonly unknown[],
  path: string,
  issues: SchemaEditorValidationIssue[],
  visit: (entry: unknown, index: number) => void,
): void {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    issues.push({ path, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract arrays require an own numeric length data property.' });
    return;
  }
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const entryPath = appendPath(path, index);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      issues.push({ path: entryPath, code: 'UNSAFE_CONTRACT_DESCRIPTOR', message: 'Contract array descriptors could not be inspected safely.' });
      continue;
    }
    if (!descriptor) {
      issues.push({ path: entryPath, code: 'SPARSE_CONTRACT_ARRAY', message: 'Contract arrays must not contain sparse entries.' });
      continue;
    }
    if (!('value' in descriptor)) {
      issues.push({ path: entryPath, code: 'ACCESSOR_CONTRACT_FIELD', message: 'Contract validation does not execute array accessors.' });
      continue;
    }
    visit(descriptor.value, index);
  }
}
