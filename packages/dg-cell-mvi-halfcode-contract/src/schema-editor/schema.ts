import {
  addDuplicateIssue,
  appendPath,
  collectSerializableIssues,
  isPlainRecord,
  validateStableId,
  validationResult,
  type SchemaEditorContractRecord,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
  type SchemaEditorValidationResult,
} from './serializable';

export type StructureScalarKind = 'string' | 'number' | 'integer' | 'boolean' | 'null';
export type CollectionIdentityPathSegment = string | number;

export interface PropertyCollectionIdentityHint {
  strategy: 'property';
  path: CollectionIdentityPathSegment[];
  fallback: 'ephemeral';
}

export interface EphemeralCollectionIdentityHint {
  strategy: 'ephemeral';
}

export type CollectionIdentityHint = PropertyCollectionIdentityHint | EphemeralCollectionIdentityHint;

declare const STRUCTURE_SCHEMA_VALUE: unique symbol;

export interface StructureSchemaValueBrand<TValue> {
  readonly [STRUCTURE_SCHEMA_VALUE]?: TValue;
}

export type StructureSemanticAnnotations = SchemaEditorContractRecord & {
  semanticType?: string;
  format?: string;
  tags?: string[];
  metadata?: SchemaEditorContractRecord;
};

export interface StructureSchemaBase<TValue = unknown> extends StructureSchemaValueBrand<TValue> {
  kind: string;
  id?: string;
  label?: string;
  description?: string;
  annotations?: StructureSemanticAnnotations;
  constraints?: SchemaEditorContractRecord;
  default?: SchemaEditorContractValue;
}

export interface ScalarStructureSchema<TValue extends SchemaEditorContractValue = SchemaEditorContractValue> extends StructureSchemaBase<TValue> {
  kind: 'scalar';
  scalar: StructureScalarKind;
  enum?: SchemaEditorContractValue[];
  const?: SchemaEditorContractValue;
}

export interface ObjectStructureField<TValue = unknown> {
  key: string;
  schema: StructureSchema<TValue>;
  label?: string;
  description?: string;
  annotations?: StructureSemanticAnnotations;
}

export interface ObjectStructureSchema<TValue = Record<string, unknown>> extends StructureSchemaBase<TValue> {
  kind: 'object';
  fields: ObjectStructureField[];
  required?: string[];
  additionalProperties?: boolean | StructureSchema;
}

export interface ArrayStructureSchema<TItem = unknown> extends StructureSchemaBase<TItem[]> {
  kind: 'array';
  item: StructureSchema<TItem>;
  itemDefault?: SchemaEditorContractValue;
  identity?: CollectionIdentityHint;
}

export interface MapStructureSchema<TValue = unknown> extends StructureSchemaBase<Record<string, TValue>> {
  kind: 'map';
  key: ScalarStructureSchema<string>;
  value: StructureSchema<TValue>;
  valueDefault?: SchemaEditorContractValue;
}

export interface UnionStructureAlternative<TValue = unknown> {
  id: string;
  schema: StructureSchema<TValue>;
  label?: string;
  description?: string;
  annotations?: StructureSemanticAnnotations;
  initialValue?: SchemaEditorContractValue;
}

export interface UnionStructureSchema<TValue = unknown> extends StructureSchemaBase<TValue> {
  kind: 'union';
  alternatives: UnionStructureAlternative[];
  discriminator?: string;
}

export interface RefStructureSchema<TValue = unknown> extends StructureSchemaBase<TValue> {
  kind: 'ref';
  ref: string;
}

export type StructureSchema<TValue = unknown> =
  | ScalarStructureSchema<Extract<TValue, SchemaEditorContractValue> extends never ? SchemaEditorContractValue : Extract<TValue, SchemaEditorContractValue>>
  | ObjectStructureSchema<TValue>
  | ArrayStructureSchema
  | MapStructureSchema
  | UnionStructureSchema<TValue>
  | RefStructureSchema<TValue>;

const STRUCTURE_SCHEMA_KINDS = new Set(['scalar', 'object', 'array', 'map', 'union', 'ref']);
const SCALAR_KINDS = new Set(['string', 'number', 'integer', 'boolean', 'null']);

export function validateStructureSchema(value: unknown): SchemaEditorValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validateSchemaNode(value, '$', issues, new Set());
  return validationResult(issues);
}

function validateSchemaNode(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenIds: Set<string>,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_SCHEMA_NODE', message: 'StructureSchema node must be a plain object.' });
    return;
  }

  if (typeof value.kind !== 'string' || !STRUCTURE_SCHEMA_KINDS.has(value.kind)) {
    issues.push({ path: appendPath(path, 'kind'), code: 'UNKNOWN_SCHEMA_KIND', message: 'Unknown StructureSchema kind.' });
    return;
  }

  if ('id' in value) {
    validateStableId(value.id, appendPath(path, 'id'), issues, 'schema id');
    if (typeof value.id === 'string') {
      if (seenIds.has(value.id)) {
        addDuplicateIssue(appendPath(path, 'id'), value.id, issues, 'schema id');
      } else {
        seenIds.add(value.id);
      }
    }
  }

  if ('annotations' in value && !isPlainRecord(value.annotations)) {
    issues.push({
      path: appendPath(path, 'annotations'),
      code: 'INVALID_ANNOTATIONS',
      message: 'StructureSchema annotations must be a serializable object.',
    });
  }

  if ('constraints' in value && !isPlainRecord(value.constraints)) {
    issues.push({
      path: appendPath(path, 'constraints'),
      code: 'INVALID_CONSTRAINTS',
      message: 'StructureSchema constraints must be serializable object data.',
    });
  }

  if ('default' in value) {
    validateDefaultForSchema(value.default, value, appendPath(path, 'default'), issues);
  }

  switch (value.kind) {
    case 'scalar':
      validateScalarNode(value, path, issues);
      return;
    case 'object':
      validateObjectNode(value, path, issues, seenIds);
      return;
    case 'array':
      validateChildSchema(value.item, appendPath(path, 'item'), issues, seenIds);
      if ('itemDefault' in value) {
        validateDefaultForSchema(value.itemDefault, value.item, appendPath(path, 'itemDefault'), issues);
      }
      if ('identity' in value) {
        validateCollectionIdentity(value.identity, appendPath(path, 'identity'), issues);
      }
      return;
    case 'map':
      validateMapNode(value, path, issues, seenIds);
      return;
    case 'union':
      validateUnionNode(value, path, issues, seenIds);
      return;
    case 'ref':
      validateStableId(value.ref, appendPath(path, 'ref'), issues, 'ref identity');
  }
}

function validateScalarNode(
  value: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (typeof value.scalar !== 'string' || !SCALAR_KINDS.has(value.scalar)) {
    issues.push({
      path: appendPath(path, 'scalar'),
      code: 'INVALID_SCALAR',
      message: 'Scalar schema requires a supported scalar kind.',
    });
  }


  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0) {
      issues.push({ path: appendPath(path, 'enum'), code: 'INVALID_ENUM', message: 'Scalar enum must be a non-empty array.' });
    } else {
      value.enum.forEach((entry, index) => {
        validateScalarValue(entry, value.scalar, appendPath(appendPath(path, 'enum'), index), issues);
      });
    }
  }
  if ('const' in value) {
    validateScalarValue(value.const, value.scalar, appendPath(path, 'const'), issues);
  }
}

function validateObjectNode(
  value: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenIds: Set<string>,
): void {
  if (!Array.isArray(value.fields)) {
    issues.push({ path: appendPath(path, 'fields'), code: 'INVALID_FIELDS', message: 'Object schema fields must be an array.' });
    return;
  }

  const fieldKeys = new Set<string>();
  value.fields.forEach((field, index) => {
    const fieldPath = `${appendPath(path, 'fields')}[${index}]`;
    if (!isPlainRecord(field)) {
      issues.push({ path: fieldPath, code: 'INVALID_FIELD', message: 'Object field must be a plain object.' });
      return;
    }
    if (typeof field.key !== 'string' || field.key.length === 0) {
      issues.push({ path: appendPath(fieldPath, 'key'), code: 'INVALID_FIELD_KEY', message: 'Object field key is required.' });
    } else if (fieldKeys.has(field.key)) {
      addDuplicateIssue(appendPath(fieldPath, 'key'), field.key, issues, 'object field key');
    } else {
      fieldKeys.add(field.key);
    }
    validateChildSchema(field.schema, appendPath(fieldPath, 'schema'), issues, seenIds);
  });

  if (value.required !== undefined) {
    if (!Array.isArray(value.required)) {
      issues.push({
        path: appendPath(path, 'required'),
        code: 'INVALID_REQUIRED',
        message: 'Object required field list must be an array.',
      });
    } else {
      const requiredKeys = new Set<string>();
      value.required.forEach((requiredKey, index) => {
        const requiredPath = `${appendPath(path, 'required')}[${index}]`;
        if (typeof requiredKey !== 'string' || requiredKey.length === 0) {
          issues.push({ path: requiredPath, code: 'INVALID_REQUIRED_KEY', message: 'Required entries must be field keys.' });
        } else if (requiredKeys.has(requiredKey)) {
          addDuplicateIssue(requiredPath, requiredKey, issues, 'required field key');
        } else {
          requiredKeys.add(requiredKey);
        }
        if (typeof requiredKey === 'string' && !fieldKeys.has(requiredKey)) {
          issues.push({
            path: requiredPath,
            code: 'UNKNOWN_REQUIRED_FIELD',
            message: `Required field "${requiredKey}" must exist in fields.`,
          });
        }
      });
    }
  }

  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== 'boolean') {
    validateChildSchema(value.additionalProperties, appendPath(path, 'additionalProperties'), issues, seenIds);
  }
}

function validateMapNode(
  value: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenIds: Set<string>,
): void {
  if (!isPlainRecord(value.key) || value.key.kind !== 'scalar') {
    issues.push({
      path: appendPath(path, 'key'),
      code: 'INVALID_MAP_KEY_SCHEMA',
      message: 'Map key must be a scalar schema.',
    });
  } else {
    validateScalarNode(value.key, appendPath(path, 'key'), issues);
    if (value.key.scalar !== 'string') {
      issues.push({
        path: appendPath(appendPath(path, 'key'), 'scalar'),
        code: 'INVALID_MAP_KEY_SCALAR',
        message: 'Map key scalar must be string.',
      });
    }
  }
  validateChildSchema(value.value, appendPath(path, 'value'), issues, seenIds);
  if ('valueDefault' in value) {
    validateDefaultForSchema(value.valueDefault, value.value, appendPath(path, 'valueDefault'), issues);
  }
}

function validateUnionNode(
  value: Record<string, unknown>,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenIds: Set<string>,
): void {
  if (!Array.isArray(value.alternatives) || value.alternatives.length === 0) {
    issues.push({
      path: appendPath(path, 'alternatives'),
      code: 'INVALID_UNION_ALTERNATIVES',
      message: 'Union schema alternatives must be a non-empty array.',
    });
    return;
  }

  const alternativeIds = new Set<string>();
  value.alternatives.forEach((alternative, index) => {
    const alternativePath = `${appendPath(path, 'alternatives')}[${index}]`;
    if (!isPlainRecord(alternative)) {
      issues.push({ path: alternativePath, code: 'INVALID_UNION_ALTERNATIVE', message: 'Union alternative must be an object.' });
      return;
    }
    validateStableId(alternative.id, appendPath(alternativePath, 'id'), issues, 'union alternative id');
    if (typeof alternative.id === 'string') {
      if (alternativeIds.has(alternative.id)) {
        addDuplicateIssue(appendPath(alternativePath, 'id'), alternative.id, issues, 'union alternative id');
      } else {
        alternativeIds.add(alternative.id);
      }
    }
    validateChildSchema(alternative.schema, appendPath(alternativePath, 'schema'), issues, seenIds);
    if ('initialValue' in alternative) {
      validateDefaultForSchema(
        alternative.initialValue,
        alternative.schema,
        appendPath(alternativePath, 'initialValue'),
        issues,
      );
    }
  });
}

function validateCollectionIdentity(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_COLLECTION_IDENTITY', message: 'Collection identity must be plain data.' });
    return;
  }
  if (value.strategy === 'ephemeral') {
    if (Object.keys(value).some((key) => key !== 'strategy')) {
      issues.push({ path, code: 'INVALID_COLLECTION_IDENTITY', message: 'Ephemeral identity accepts only its strategy.' });
    }
    return;
  }
  if (value.strategy !== 'property') {
    issues.push({ path: appendPath(path, 'strategy'), code: 'INVALID_IDENTITY_STRATEGY', message: 'Identity strategy must be property or ephemeral.' });
    return;
  }
  if (!Array.isArray(value.path) || value.path.length === 0) {
    issues.push({ path: appendPath(path, 'path'), code: 'INVALID_IDENTITY_PATH', message: 'Property identity requires a non-empty path.' });
  } else {
    value.path.forEach((segment, index) => {
      if ((typeof segment !== 'string' || segment.length === 0) && (!Number.isInteger(segment) || (segment as number) < 0)) {
        issues.push({ path: appendPath(appendPath(path, 'path'), index), code: 'INVALID_IDENTITY_PATH', message: 'Identity path segments must be non-empty strings or non-negative integers.' });
      }
    });
  }
  if (value.fallback !== 'ephemeral') {
    issues.push({ path: appendPath(path, 'fallback'), code: 'INVALID_IDENTITY_FALLBACK', message: 'Property identity fallback must be ephemeral.' });
  }
  for (const key of Object.keys(value)) {
    if (key !== 'strategy' && key !== 'path' && key !== 'fallback') {
      issues.push({ path: appendPath(path, key), code: 'UNKNOWN_CONTRACT_FIELD', message: `Collection identity does not allow field "${key}".` });
    }
  }
}

function validateDefaultForSchema(
  value: unknown,
  schema: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!isPlainRecord(schema) || typeof schema.kind !== 'string') return;
  switch (schema.kind) {
    case 'scalar':
      validateScalarValue(value, schema.scalar, path, issues);
      if (Array.isArray(schema.enum) && !schema.enum.some((entry) => serializableEquals(entry, value))) {
        issues.push({ path, code: 'DEFAULT_OUTSIDE_ENUM', message: 'Scalar default must be one of the enum values.' });
      }
      if ('const' in schema && !serializableEquals(schema.const, value)) {
        issues.push({ path, code: 'DEFAULT_DIFFERS_FROM_CONST', message: 'Scalar default must equal the const value.' });
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        issues.push({ path, code: 'INVALID_DEFAULT', message: 'Array schema default must be an array.' });
      }
      return;
    case 'object':
    case 'map':
      if (!isPlainRecord(value)) {
        issues.push({ path, code: 'INVALID_DEFAULT', message: `${schema.kind} schema default must be an object.` });
      }
      return;
  }
}

function validateScalarValue(
  value: unknown,
  scalar: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const valid =
    (scalar === 'string' && typeof value === 'string') ||
    (scalar === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (scalar === 'integer' && Number.isInteger(value)) ||
    (scalar === 'boolean' && typeof value === 'boolean') ||
    (scalar === 'null' && value === null);
  if (!valid) {
    issues.push({ path, code: 'INVALID_SCALAR_VALUE', message: `Value must match scalar kind ${String(scalar)}.` });
  }
}

function serializableEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateChildSchema(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  seenIds: Set<string>,
): void {
  validateSchemaNode(value, path, issues, seenIds);
}
