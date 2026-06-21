import {
  snapshotSerializableValue,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
  type SchemaEditorValidationResult,
} from './serializable';
import {
  validateStructureSchema,
  type ArrayStructureSchema,
  type MapStructureSchema,
  type ObjectStructureSchema,
  type RefStructureSchema,
  type ScalarStructureSchema,
  type StructureSchema,
  type UnionStructureSchema,
} from './schema';

export interface ValidateStructureSchemaCandidateInput {
  readonly schema: StructureSchema;
  readonly candidate: unknown;
}

export type ValidateStructureSchemaCandidateConfig = Readonly<Record<string, never>>;

interface ValidationContext {
  readonly schemasById: ReadonlyMap<string, StructureSchema>;
  readonly activeRefs: Set<string>;
}

/** Validates serializable candidate data against a StructureSchema contract. */
export function validateStructureSchemaCandidate(
  _runtime: unknown,
  input: ValidateStructureSchemaCandidateInput,
  _config: ValidateStructureSchemaCandidateConfig,
): SchemaEditorValidationResult {
  const schemaResult = validateStructureSchema(input.schema);
  if (!schemaResult.ok) {
    return {
      ok: false,
      issues: schemaResult.issues.map((issue) => ({
        ...issue,
        path: replaceRoot(issue.path, '$.schema'),
      })),
    };
  }

  const issues: SchemaEditorValidationIssue[] = [];
  const candidate = snapshotSerializableValue(input.candidate, '$.candidate', issues);
  if (candidate === undefined) return { ok: false, issues };

  validateCandidate(
    input.schema,
    candidate,
    '$.candidate',
    issues,
    {
      schemasById: collectSchemas(input.schema),
      activeRefs: new Set(),
    },
  );
  return { ok: issues.length === 0, issues };
}

function validateCandidate(
  schema: StructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  switch (schema.kind) {
    case 'scalar':
      validateScalar(schema, value, path, issues);
      return;
    case 'object':
      validateObject(schema, value, path, issues, context);
      return;
    case 'array':
      validateArray(schema, value, path, issues, context);
      return;
    case 'map':
      validateMap(schema, value, path, issues, context);
      return;
    case 'union':
      validateUnion(schema, value, path, issues, context);
      return;
    case 'ref':
      validateRef(schema, value, path, issues, context);
  }
}

function validateScalar(
  schema: ScalarStructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  const valid =
    (schema.scalar === 'string' && typeof value === 'string')
    || (schema.scalar === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (schema.scalar === 'integer' && Number.isInteger(value))
    || (schema.scalar === 'boolean' && typeof value === 'boolean')
    || (schema.scalar === 'null' && value === null);
  if (!valid) {
    issue(
      issues,
      path,
      'SCHEMA_CANDIDATE_SCALAR_TYPE',
      `Candidate must match scalar kind ${schema.scalar}.`,
    );
    return;
  }
  if (schema.enum && !schema.enum.some((entry) => equalValue(entry, value))) {
    issue(issues, path, 'SCHEMA_CANDIDATE_ENUM', 'Candidate must be one of the declared enum values.');
  }
  if (Object.hasOwn(schema, 'const') && !equalValue(schema.const, value)) {
    issue(issues, path, 'SCHEMA_CANDIDATE_CONST', 'Candidate must equal the declared const value.');
  }

  const constraints = schema.constraints;
  if (typeof value === 'string') {
    const pattern = stringConstraint(constraints, 'pattern');
    if (pattern !== undefined) {
      try {
        if (!new RegExp(pattern).test(value)) {
          issue(issues, path, 'SCHEMA_CANDIDATE_PATTERN', `Candidate must match pattern ${pattern}.`);
        }
      } catch {
        issue(
          issues,
          path,
          'INVALID_SCHEMA_PATTERN',
          `StructureSchema pattern is not a valid regular expression: ${pattern}.`,
        );
      }
    }
    checkMinimum(
      issues,
      path,
      value.length,
      numberConstraint(constraints, 'minLength'),
      'SCHEMA_CANDIDATE_MIN_LENGTH',
      'string length',
    );
    checkMaximum(
      issues,
      path,
      value.length,
      numberConstraint(constraints, 'maxLength'),
      'SCHEMA_CANDIDATE_MAX_LENGTH',
      'string length',
    );
  }
  if (typeof value === 'number') {
    checkMinimum(
      issues,
      path,
      value,
      numberConstraint(constraints, 'minimum'),
      'SCHEMA_CANDIDATE_MINIMUM',
      'number',
    );
    checkMaximum(
      issues,
      path,
      value,
      numberConstraint(constraints, 'maximum'),
      'SCHEMA_CANDIDATE_MAXIMUM',
      'number',
    );
  }
}

function validateObject(
  schema: ObjectStructureSchema<unknown>,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  if (!isRecord(value)) {
    issue(issues, path, 'SCHEMA_CANDIDATE_OBJECT_TYPE', 'Candidate must be an object.');
    return;
  }

  const required = new Set(schema.required ?? []);
  const fields = new Map(schema.fields.map((field) => [field.key, field.schema]));
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      issue(
        issues,
        appendPath(path, key),
        'SCHEMA_CANDIDATE_REQUIRED',
        `Candidate is missing required field "${key}".`,
      );
    }
  }
  for (const [key, child] of Object.entries(value)) {
    const fieldSchema = fields.get(key);
    if (fieldSchema) {
      validateCandidate(fieldSchema, child, appendPath(path, key), issues, context);
    } else if (schema.additionalProperties === false) {
      issue(
        issues,
        appendPath(path, key),
        'SCHEMA_CANDIDATE_ADDITIONAL_PROPERTY',
        `Candidate field "${key}" is not declared by the StructureSchema.`,
      );
    } else if (typeof schema.additionalProperties === 'object') {
      validateCandidate(schema.additionalProperties, child, appendPath(path, key), issues, context);
    }
  }

}

function validateArray(
  schema: ArrayStructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'SCHEMA_CANDIDATE_ARRAY_TYPE', 'Candidate must be an array.');
    return;
  }
  checkMinimum(
    issues,
    path,
    value.length,
    numberConstraint(schema.constraints, 'minItems'),
    'SCHEMA_CANDIDATE_MIN_ITEMS',
    'item count',
  );
  checkMaximum(
    issues,
    path,
    value.length,
    numberConstraint(schema.constraints, 'maxItems'),
    'SCHEMA_CANDIDATE_MAX_ITEMS',
    'item count',
  );
  value.forEach((item, index) => {
    validateCandidate(schema.item, item, appendPath(path, index), issues, context);
  });
  if (schema.constraints?.uniqueItems === true) {
    const identities = value.map((item) => collectionIdentity(schema, item));
    const seen = new Set<string>();
    identities.forEach((identity, index) => {
      if (seen.has(identity)) {
        issue(
          issues,
          appendPath(path, index),
          'SCHEMA_CANDIDATE_UNIQUE_ITEMS',
          'Candidate collection items must be unique.',
        );
      }
      seen.add(identity);
    });
  }
}

function validateMap(
  schema: MapStructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  if (!isRecord(value)) {
    issue(issues, path, 'SCHEMA_CANDIDATE_MAP_TYPE', 'Candidate must be a map.');
    return;
  }
  const entries = Object.entries(value);
  checkMinimum(
    issues,
    path,
    entries.length,
    numberConstraint(schema.constraints, 'minEntries'),
    'SCHEMA_CANDIDATE_MIN_ENTRIES',
    'entry count',
  );
  checkMaximum(
    issues,
    path,
    entries.length,
    numberConstraint(schema.constraints, 'maxEntries'),
    'SCHEMA_CANDIDATE_MAX_ENTRIES',
    'entry count',
  );
  for (const [key, child] of entries) {
    validateScalar(schema.key, key, appendPath(path, key), issues);
    validateCandidate(schema.value, child, appendPath(path, key), issues, context);
  }
}

function validateUnion(
  schema: UnionStructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  const alternatives = schema.discriminator && isRecord(value)
    ? schema.alternatives.filter(({ id }) => value[schema.discriminator!] === id)
    : schema.alternatives;
  const matched = alternatives.some((alternative) => {
    const alternativeIssues: SchemaEditorValidationIssue[] = [];
    validateCandidate(alternative.schema, value, path, alternativeIssues, context);
    return alternativeIssues.length === 0;
  });
  if (!matched) {
    issue(
      issues,
      path,
      'SCHEMA_CANDIDATE_UNION',
      'Candidate does not match any declared union alternative.',
    );
  }
}

function validateRef(
  schema: RefStructureSchema,
  value: SchemaEditorContractValue,
  path: string,
  issues: SchemaEditorValidationIssue[],
  context: ValidationContext,
): void {
  const target = context.schemasById.get(schema.ref);
  if (!target) {
    issue(
      issues,
      path,
      'SCHEMA_CANDIDATE_REF_UNRESOLVED',
      `StructureSchema ref "${schema.ref}" cannot validate a candidate value.`,
    );
    return;
  }
  const activeKey = `${schema.ref}\0${path}`;
  if (context.activeRefs.has(activeKey)) {
    issue(
      issues,
      path,
      'SCHEMA_CANDIDATE_REF_CYCLE',
      `StructureSchema ref "${schema.ref}" cannot resolve recursively at the same candidate path.`,
    );
    return;
  }
  context.activeRefs.add(activeKey);
  validateCandidate(target, value, path, issues, context);
  context.activeRefs.delete(activeKey);
}

function collectSchemas(root: StructureSchema): ReadonlyMap<string, StructureSchema> {
  const result = new Map<string, StructureSchema>();
  const visit = (schema: StructureSchema): void => {
    if (schema.id) result.set(schema.id, schema);
    switch (schema.kind) {
      case 'object':
        schema.fields.forEach((field) => visit(field.schema));
        if (typeof schema.additionalProperties === 'object') visit(schema.additionalProperties);
        return;
      case 'array':
        visit(schema.item);
        return;
      case 'map':
        visit(schema.key);
        visit(schema.value);
        return;
      case 'union':
        schema.alternatives.forEach((alternative) => visit(alternative.schema));
    }
  };
  visit(root);
  return result;
}

function collectionIdentity(
  schema: ArrayStructureSchema,
  value: SchemaEditorContractValue,
): string {
  if (schema.identity?.strategy !== 'property') return stableValue(value);
  let current: SchemaEditorContractValue | undefined = value;
  for (const segment of schema.identity.path) {
    if (typeof segment === 'number' && Array.isArray(current)) current = current[segment];
    else if (typeof segment === 'string' && isRecord(current)) current = current[segment];
    else return stableValue(value);
  }
  return stableValue(current);
}

function isRecord(
  value: SchemaEditorContractValue | undefined,
): value is Record<string, SchemaEditorContractValue> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function stringConstraint(
  constraints: StructureSchema['constraints'],
  key: string,
): string | undefined {
  const value = constraints?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberConstraint(
  constraints: StructureSchema['constraints'],
  key: string,
): number | undefined {
  const value = constraints?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function checkMinimum(
  issues: SchemaEditorValidationIssue[],
  path: string,
  actual: number,
  minimum: number | undefined,
  code: string,
  label: string,
): void {
  if (minimum !== undefined && actual < minimum) {
    issue(issues, path, code, `Candidate ${label} must be at least ${minimum}.`);
  }
}

function checkMaximum(
  issues: SchemaEditorValidationIssue[],
  path: string,
  actual: number,
  maximum: number | undefined,
  code: string,
  label: string,
): void {
  if (maximum !== undefined && actual > maximum) {
    issue(issues, path, code, `Candidate ${label} must be at most ${maximum}.`);
  }
}

function issue(
  issues: SchemaEditorValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function appendPath(path: string, segment: string | number): string {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment)
    ? `${path}.${segment}`
    : `${path}[${JSON.stringify(segment)}]`;
}

function replaceRoot(path: string, root: string): string {
  return path === '$' ? root : `${root}${path.slice(1)}`;
}

function equalValue(
  left: SchemaEditorContractValue | undefined,
  right: SchemaEditorContractValue,
): boolean {
  return stableValue(left) === stableValue(right);
}

function stableValue(value: SchemaEditorContractValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableValue(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
