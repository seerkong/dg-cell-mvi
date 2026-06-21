import type { HalfcodeDocument } from './document';

export interface HalfcodeDocumentValidationIssue {
  path: string;
  message: string;
}

export interface HalfcodeDocumentValidationResult {
  ok: boolean;
  issues: HalfcodeDocumentValidationIssue[];
}

const HALFCODE_DOCUMENT_TOP_LEVEL_KEYS = new Set([
  'kind',
  'apiVersion',
  'product',
  'modules',
  'materials',
  'elementTree',
  'scopes',
  'contracts',
  'stateModels',
  'resources',
  'effects',
  'extensions',
  'annotations',
]);

const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  'fetch',
  'componentConstructor',
  'constructor',
  'render',
  'setup',
  'handler',
  'hook',
]);

export function validateHalfcodeDocument(value: unknown): HalfcodeDocumentValidationResult {
  const issues: HalfcodeDocumentValidationIssue[] = [];

  if (!isPlainRecord(value)) {
    issues.push({ path: '$', message: 'HalfcodeDocument must be a plain serializable object.' });
    return { ok: false, issues };
  }

  for (const key of Object.keys(value)) {
    if (!HALFCODE_DOCUMENT_TOP_LEVEL_KEYS.has(key)) {
      issues.push({ path: `$.${key}`, message: 'Unknown top-level canonical document field.' });
    }
  }

  if (value.kind !== 'HalfcodeDocument') {
    issues.push({ path: '$.kind', message: 'HalfcodeDocument kind must be "HalfcodeDocument".' });
  }
  if (value.apiVersion !== 'halfcode.dg-cell-mvi/v1' && value.apiVersion !== 'halfcode.dg-cell-mvi/v2') {
    issues.push({
      path: '$.apiVersion',
      message: 'HalfcodeDocument apiVersion must be "halfcode.dg-cell-mvi/v1" or "halfcode.dg-cell-mvi/v2".',
    });
  }
  if (!isPlainRecord(value.product)) {
    issues.push({ path: '$.product', message: 'HalfcodeDocument product must be a plain object.' });
  }
  if (!Array.isArray(value.modules)) {
    issues.push({ path: '$.modules', message: 'HalfcodeDocument modules must be an array.' });
  }
  if (!Array.isArray(value.materials)) {
    issues.push({ path: '$.materials', message: 'HalfcodeDocument materials must be an array.' });
  }
  validateElementContracts(value, issues);
  validateElementTree(value, issues);

  collectSerializableIssues(value, '$', issues);
  return { ok: issues.length === 0, issues };
}

function validateElementContracts(
  value: Record<string, unknown>,
  issues: HalfcodeDocumentValidationIssue[],
): void {
  if (!Array.isArray(value.contracts)) return;
  value.contracts.forEach((contract, index) => {
    if (!isPlainRecord(contract)) return;
    if ('input' in contract) {
      issues.push({
        path: `$.contracts[${index}].input`,
        message: 'Frontend ElementContract must not define input; use props/slots/accepts/sends/exposes refs.',
      });
    }
    if ('output' in contract) {
      issues.push({
        path: `$.contracts[${index}].output`,
        message: 'Frontend ElementContract must not define output; use sends or exposes refs.',
      });
    }
  });
}

function validateElementTree(
  value: Record<string, unknown>,
  issues: HalfcodeDocumentValidationIssue[],
): void {
  if (value.elementTree === undefined) return;
  if (!isPlainRecord(value.elementTree)) {
    issues.push({ path: '$.elementTree', message: 'HalfcodeDocument elementTree must be a plain object.' });
    return;
  }
  if (typeof value.elementTree.root !== 'string' || !value.elementTree.root) {
    issues.push({ path: '$.elementTree.root', message: 'HalfcodeDocument elementTree requires a root element id.' });
  }
  if (!Array.isArray(value.elementTree.elements)) {
    issues.push({ path: '$.elementTree.elements', message: 'HalfcodeDocument elementTree elements must be an array.' });
  }
}

export function isHalfcodeDocument(value: unknown): value is HalfcodeDocument {
  return validateHalfcodeDocument(value).ok;
}

export function assertHalfcodeDocument(value: unknown): asserts value is HalfcodeDocument {
  const result = validateHalfcodeDocument(value);
  if (!result.ok) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new TypeError(`Invalid HalfcodeDocument. ${details}`);
  }
}

function collectSerializableIssues(
  value: unknown,
  path: string,
  issues: HalfcodeDocumentValidationIssue[],
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      issues.push({ path, message: 'Number values must be finite.' });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSerializableIssues(item, `${path}[${index}]`, issues));
    return;
  }

  if (typeof value === 'function') {
    issues.push({ path, message: 'Functions cannot be stored in canonical halfcode documents.' });
    return;
  }

  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push({ path, message: `Unsupported non-serializable value type: ${typeof value}.` });
    return;
  }

  if (!isPlainRecord(value)) {
    issues.push({ path, message: 'Only plain objects can be stored in canonical halfcode documents.' });
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
    if (FORBIDDEN_EXECUTABLE_KEYS.has(key)) {
      issues.push({ path: childPath, message: 'Executable runtime fields are not canonical document data.' });
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
