import { getSchema, type Extensions } from '@tiptap/core';
import { Schema } from '@tiptap/pm/model';
import { createXnlRichDocumentTiptapHostExtensions } from './internalTiptapExtensionRegistry';
import {
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapDiagnostic,
  type XnlRichDocumentTiptapSchemaResult,
} from './types';

type CanonicalTypeSurface = Readonly<{
  attrs: readonly string[];
  spec: Readonly<Record<string, unknown>>;
}>;

const SCHEMA_SPEC_SURFACE_KEYS = [
  'content',
  'group',
  'marks',
  'code',
  'defining',
  'inline',
  'draggable',
  'isolating',
  'atom',
] as const;

/** Official table extensions own table schema, commands, plugins and TableView. */
export function createXnlRichDocumentTiptapExtensions(): Extensions {
  return createXnlRichDocumentTiptapHostExtensions({});
}

export function createXnlRichDocumentTiptapSchema(): XnlRichDocumentTiptapSchemaResult {
  try {
    return {
      status: 'ready',
      schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
      schema: getSchema(createXnlRichDocumentTiptapExtensions()),
    };
  } catch {
    const diagnostic: XnlRichDocumentTiptapDiagnostic = {
      severity: 'error',
      code: 'INVALID_TIPTAP_DOCUMENT',
      message: 'The canonical Tiptap extension registry could not produce a schema.',
      path: [],
    };
    return { status: 'rejected', diagnostics: [diagnostic] };
  }
}

/**
 * Internal owner-side schema capability for binding real EditorState instances.
 * It derives the expected surface from the canonical extension registry so
 * local draft lifecycle code never carries a second node/mark schema truth.
 */
export function isXnlRichDocumentTiptapCanonicalSchema(value: unknown): value is Schema {
  const owner = createXnlRichDocumentTiptapSchema();
  if (owner.status !== 'ready') return false;
  return matchesCanonicalSchemaSurface(value, owner.schema);
}

function matchesCanonicalSchemaSurface(value: unknown, canonical: Schema): value is Schema {
  if (!(value instanceof Schema)
    || Object.getPrototypeOf(value) !== Schema.prototype
    || !hasOnlyDataProperties(value)) {
    return false;
  }
  const nodes = ownData(value, 'nodes');
  const marks = ownData(value, 'marks');
  const spec = ownData(value, 'spec');
  const canonicalNodes = ownData(canonical, 'nodes');
  const canonicalMarks = ownData(canonical, 'marks');
  const canonicalSpec = ownData(canonical, 'spec');
  if (!isDataRecord(nodes)
    || !isDataRecord(marks)
    || !isDataRecord(spec)
    || !isDataRecord(canonicalNodes)
    || !isDataRecord(canonicalMarks)
    || !isDataRecord(canonicalSpec)
    || ownData(spec, 'topNode') !== ownData(canonicalSpec, 'topNode')
    || !hasExactDataKeys(nodes, Object.keys(canonicalNodes))
    || !hasExactDataKeys(marks, Object.keys(canonicalMarks))) {
    return false;
  }

  for (const name of Object.keys(canonicalNodes)) {
    if (!matchesSchemaTypeSurface(
      ownData(nodes, name),
      value,
      name,
      surfaceOfSchemaType(ownData(canonicalNodes, name)),
    )) {
      return false;
    }
  }
  for (const name of Object.keys(canonicalMarks)) {
    if (!matchesSchemaTypeSurface(
      ownData(marks, name),
      value,
      name,
      surfaceOfSchemaType(ownData(canonicalMarks, name)),
    )) {
      return false;
    }
  }
  return ownData(value, 'topNodeType') === ownData(nodes, String(ownData(canonicalSpec, 'topNode')));
}

function surfaceOfSchemaType(value: unknown): CanonicalTypeSurface {
  const attrs = ownData(value, 'attrs');
  const spec = ownData(value, 'spec');
  return Object.freeze({
    attrs: Object.freeze(isDataRecord(attrs) ? Object.keys(attrs) : []),
    spec: Object.freeze(Object.fromEntries(SCHEMA_SPEC_SURFACE_KEYS.map((key) => [key, ownData(spec, key)]))),
  });
}

function matchesSchemaTypeSurface(
  value: unknown,
  schema: Schema,
  name: string,
  expected: CanonicalTypeSurface,
): boolean {
  const spec = ownData(value, 'spec');
  const attrs = ownData(value, 'attrs');
  if (ownData(value, 'name') !== name
    || ownData(value, 'schema') !== schema
    || !isDataRecord(spec)
    || !isDataRecord(attrs)
    || !hasExactDataKeys(attrs, expected.attrs)) {
    return false;
  }
  return SCHEMA_SPEC_SURFACE_KEYS.every((key) => ownData(spec, key) === ownData(expected.spec, key));
}

function hasExactDataKeys(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || !hasOnlyDataProperties(value)) return false;
  const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  return keys.length === expectedKeys.length
    && expectedKeys.every((expected, index) => keys[index] === expected);
}

function isDataRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isPlainRecord(value) && hasOnlyDataProperties(value);
}

function hasOnlyDataProperties(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string'
      && descriptor !== undefined
      && descriptor.enumerable
      && 'value' in descriptor;
  });
}

function ownData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' && typeof value !== 'function' || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
