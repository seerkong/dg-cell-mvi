import {
  appendPath,
  collectSerializableIssues,
  isPlainRecord,
  validateStableId,
  validationResult,
  type SchemaEditorContractRecord,
  type SchemaEditorValidationIssue,
  type SchemaEditorValidationResult,
} from './serializable';

export interface EditorPresenterRef {
  id: string;
  options?: SchemaEditorContractRecord;
  explicit?: boolean;
  reason?: string;
}

export interface EditorPresentationOverlay {
  presenter?: EditorPresenterRef;
  order?: string[];
  group?: string;
  visible?: boolean | SchemaEditorContractRecord;
  readOnly?: boolean | SchemaEditorContractRecord;
  options?: SchemaEditorContractRecord;
  children?: Record<string, EditorPresentationOverlay>;
  item?: EditorPresentationOverlay;
  value?: EditorPresentationOverlay;
  alternatives?: Record<string, EditorPresentationOverlay>;
}

export interface EditorPresentation extends EditorPresentationOverlay {
  kind?: 'presentation';
  id?: string;
  schemaId?: string;
  overlays?: Array<{ path: Array<string | number>; overlay: EditorPresentationOverlay }>;
}

export function validateEditorPresentation(value: unknown): SchemaEditorValidationResult {
  const issues: SchemaEditorValidationIssue[] = [];
  collectSerializableIssues(value, '$', issues);
  validatePresentationOverlay(value, '$', issues, true);
  return validationResult(issues);
}

function validatePresentationOverlay(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
  isRoot = false,
): void {
  if (!isPlainRecord(value)) {
    issues.push({
      path,
      code: 'INVALID_PRESENTATION_OVERLAY',
      message: 'EditorPresentation overlay must be a plain serializable object.',
    });
    return;
  }

  if (isRoot && 'kind' in value && value.kind !== 'presentation') {
    issues.push({
      path: appendPath(path, 'kind'),
      code: 'INVALID_PRESENTATION_KIND',
      message: 'EditorPresentation kind must be "presentation" when present.',
    });
  }
  if (isRoot && 'id' in value) {
    validateStableId(value.id, appendPath(path, 'id'), issues, 'presentation id');
  }
  if (isRoot && 'schemaId' in value) {
    validateStableId(value.schemaId, appendPath(path, 'schemaId'), issues, 'schema id');
  }

  if (value.presenter !== undefined) {
    validatePresenterRef(value.presenter, appendPath(path, 'presenter'), issues);
  }
  if (value.children !== undefined) {
    validateOverlayRecord(value.children, appendPath(path, 'children'), issues);
  }
  if (value.item !== undefined) {
    validatePresentationOverlay(value.item, appendPath(path, 'item'), issues);
  }
  if (value.value !== undefined) {
    validatePresentationOverlay(value.value, appendPath(path, 'value'), issues);
  }
  if (value.alternatives !== undefined) {
    validateOverlayRecord(value.alternatives, appendPath(path, 'alternatives'), issues);
  }
  if (value.overlays !== undefined) {
    validatePathOverlays(value.overlays, appendPath(path, 'overlays'), issues);
  }
}

function validatePresenterRef(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_PRESENTER', message: 'Presenter reference must be a plain object.' });
    return;
  }
  validateStableId(value.id, appendPath(path, 'id'), issues, 'presenter id');
  if ('options' in value && !isPlainRecord(value.options)) {
    issues.push({
      path: appendPath(path, 'options'),
      code: 'INVALID_PRESENTER_OPTIONS',
      message: 'Presenter options must be a serializable object.',
    });
  }
  if ('explicit' in value && typeof value.explicit !== 'boolean') {
    issues.push({
      path: appendPath(path, 'explicit'),
      code: 'INVALID_EXPLICIT_FLAG',
      message: 'Presenter explicit flag must be boolean when present.',
    });
  }
}

function validateOverlayRecord(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: 'INVALID_OVERLAY_RECORD', message: 'Recursive presentation overlays must be an object map.' });
    return;
  }
  for (const [key, overlay] of Object.entries(value)) {
    validatePresentationOverlay(overlay, appendPath(path, key), issues);
  }
}

function validatePathOverlays(
  value: unknown,
  path: string,
  issues: SchemaEditorValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_PATH_OVERLAYS', message: 'Path-targeted overlays must be an array.' });
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isPlainRecord(entry)) {
      issues.push({ path: entryPath, code: 'INVALID_PATH_OVERLAY', message: 'Path overlay must be an object.' });
      return;
    }
    if (!Array.isArray(entry.path) || entry.path.some((segment) => typeof segment !== 'string' && typeof segment !== 'number')) {
      issues.push({
        path: appendPath(entryPath, 'path'),
        code: 'INVALID_VALUE_PATH',
        message: 'Path overlay path must be an array of string or number segments.',
      });
    }
    validatePresentationOverlay(entry.overlay, appendPath(entryPath, 'overlay'), issues);
  });
}
