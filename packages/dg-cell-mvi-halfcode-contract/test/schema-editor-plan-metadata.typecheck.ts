import type { EditorPlanNode, SchemaEditorContractValue, StructureSchema } from '../src';

const display = { label: 'Name', visible: true, readOnly: false } as const;
const validField = {
  kind: 'field',
  id: 'name',
  path: ['name'],
  metadata: { display, scalar: { kind: 'string' } },
} satisfies EditorPlanNode;
const validNestedObjectField = {
  kind: 'group',
  id: 'address',
  path: ['address'],
  metadata: {
    display: { label: 'Address', visible: true, readOnly: false },
    field: { key: 'address', required: true },
  },
  children: [],
} satisfies EditorPlanNode;

const businessDataWithHost = {
  host: 'api.internal.example',
  nested: { host: 'worker-01' },
} satisfies SchemaEditorContractValue;

const schemaWithHostAnnotation = {
  kind: 'scalar',
  scalar: 'string',
  annotations: { host: 'api.internal.example' },
} satisfies StructureSchema;

// @ts-expect-error every public plan node requires kind-specific metadata.
const missingMetadata: EditorPlanNode = { kind: 'field', id: 'name', path: ['name'] };

// @ts-expect-error collection nodes require collection metadata, not field scalar facts.
const fieldMetadataOnCollection: EditorPlanNode = { kind: 'collection', id: 'items', path: ['items'], metadata: { display, scalar: { kind: 'string' } }, itemTemplate: validField };

// @ts-expect-error field nodes require exactly one of scalar or ref facts.
const scalarAndRefField: EditorPlanNode = { kind: 'field', id: 'owner', path: ['owner'], metadata: { display, scalar: { kind: 'string' }, ref: 'schema://owner' } };

// @ts-expect-error metadata is pure data and cannot carry callbacks.
const callbackMetadata: EditorPlanNode = { kind: 'custom', id: 'custom', path: [], metadata: { display, config: { resolve: () => 'runtime' } } };

// @ts-expect-error component ownership is outside the renderer-neutral contract.
const componentMetadata: EditorPlanNode = { kind: 'custom', id: 'component', path: [], metadata: { display, component: { name: 'FieldEditor' } } };

// @ts-expect-error runtime ownership is outside the renderer-neutral contract.
const runtimeMetadata: EditorPlanNode = { kind: 'custom', id: 'runtime', path: [], metadata: { display, runtime: { id: 'session' } } };

// @ts-expect-error writer ownership is outside the renderer-neutral contract.
const writerMetadata: EditorPlanNode = { kind: 'custom', id: 'writer', path: [], metadata: { display, writer: { id: 'mutation' } } };

// These use serializable values so the failure proves ownership-field closure,
// independently of the executable-value check.
// @ts-expect-error callback ownership is outside serializable contract data.
const callbackOwnership: SchemaEditorContractValue = { callback: 'host-callback' };

// @ts-expect-error host effects are runtime ownership, not contract data.
const hostEffectOwnership: SchemaEditorContractValue = { hostEffect: { id: 'persist' } };

// @ts-expect-error host writers are runtime ownership, not contract data.
const hostWriterOwnership: SchemaEditorContractValue = { hostWriter: 'document-writer' };

// @ts-expect-error value hosts are runtime ownership, not contract data.
const valueHostOwnership: SchemaEditorContractValue = { valueHost: { id: 'editor-session' } };

const callbackAnnotationSchema: StructureSchema = {
  kind: 'scalar',
  scalar: 'string',
  // @ts-expect-error semantic annotations share the same closed ownership boundary.
  annotations: { callback: 'host-callback' },
};

void [
  missingMetadata,
  validNestedObjectField,
  fieldMetadataOnCollection,
  scalarAndRefField,
  callbackMetadata,
  componentMetadata,
  runtimeMetadata,
  writerMetadata,
  businessDataWithHost,
  schemaWithHostAnnotation,
  callbackOwnership,
  hostEffectOwnership,
  hostWriterOwnership,
  valueHostOwnership,
  callbackAnnotationSchema,
];
