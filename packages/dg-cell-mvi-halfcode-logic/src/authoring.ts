import {
  type ArtifactMutation,
  type DocumentMutation,
  type HalfcodeCompileResult,
  type HalfcodeDocument,
  type SerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import { compileCanonicalDocument } from './compiler';

function toSerializableValue(value: unknown): SerializableValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (value && typeof value === 'object') {
    const out: Record<string, SerializableValue> = {};
    for (const [key, child] of Object.entries(value)) out[key] = toSerializableValue(child);
    return out;
  }
  return null;
}

function setRecordPath(source: Record<string, SerializableValue>, path: string, value: unknown): Record<string, SerializableValue> {
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return source;

  const root: Record<string, SerializableValue> = { ...source };
  let cursor: Record<string, SerializableValue> = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!;
    const current = cursor[key];
    const next = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    cursor[key] = next;
    cursor = next;
  }
  cursor[parts[parts.length - 1]!] = toSerializableValue(value);
  return root;
}

export function applyDocumentMutation(doc: HalfcodeDocument, mutation: DocumentMutation): HalfcodeDocument {
  switch (mutation.kind) {
    case 'set-product-settings':
      return {
        ...doc,
        product: {
          ...doc.product,
          settings: setRecordPath(doc.product.settings ?? {}, mutation.path, mutation.value),
        },
      };
    case 'upsert-material':
      return {
        ...doc,
        materials: [
          ...doc.materials.filter((material) => material.id !== mutation.material.id),
          mutation.material,
        ],
      };
    case 'remove-material':
      return {
        ...doc,
        materials: doc.materials.filter((material) => material.id !== mutation.materialId),
      };
    case 'upsert-state-field':
      return {
        ...doc,
        stateModels: (doc.stateModels ?? []).map((stateModel) => stateModel.id === mutation.stateModelId
          ? {
              ...stateModel,
              fields: [
                ...stateModel.fields.filter((field) => field.id !== mutation.field.id),
                mutation.field,
              ],
            }
          : stateModel),
      };
    case 'set-state-initial-value':
      return {
        ...doc,
        stateModels: (doc.stateModels ?? []).map((stateModel) => stateModel.id === mutation.stateModelId
          ? {
              ...stateModel,
              initialSnapshot: setRecordPath(stateModel.initialSnapshot ?? {}, mutation.path, mutation.value),
            }
          : stateModel),
      };
  }
}

export function applyArtifactMutation(doc: HalfcodeDocument, mutation: ArtifactMutation): HalfcodeDocument {
  if (mutation.kind === 'replace-document') return mutation.document;
  return applyDocumentMutation(doc, mutation.mutation);
}

export function compilePreviewAfterMutation(doc: HalfcodeDocument, mutation?: DocumentMutation | ArtifactMutation): HalfcodeCompileResult {
  if (!mutation) return compileCanonicalDocument(doc);
  const nextDocument = mutation.kind === 'replace-document' || mutation.kind === 'document-mutation'
    ? applyArtifactMutation(doc, mutation as ArtifactMutation)
    : applyDocumentMutation(doc, mutation as DocumentMutation);
  return compileCanonicalDocument(nextDocument);
}
