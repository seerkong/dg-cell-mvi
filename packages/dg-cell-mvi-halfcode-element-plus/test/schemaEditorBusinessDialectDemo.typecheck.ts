import type {
  EditorPresentation,
  StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import {
  BUSINESS_DIALECT_PRESENTATIONS,
  BUSINESS_DIALECT_SHARED_SCHEMA,
  createSchemaEditorBusinessDialectDemoRuntime,
  createSharedBusinessPropertyCapsule,
  mountSchemaEditorBusinessDialectDemo,
  type MountedSchemaEditorBusinessDialectDemo,
  type SchemaEditorBusinessDialectDemoRuntime,
  type SharedBusinessPropertyCapsule,
} from '../demo/schema-editor-business-dialect';

const schema: StructureSchema = BUSINESS_DIALECT_SHARED_SCHEMA;
const presentations: Readonly<Record<string, EditorPresentation>> =
  BUSINESS_DIALECT_PRESENTATIONS;

const capsuleFactory: (
  runtime: Readonly<Record<string, never>>,
  input: Readonly<Record<string, never>>,
  config: Readonly<Record<string, never>>,
) => SharedBusinessPropertyCapsule = createSharedBusinessPropertyCapsule;

const runtimeFactory: (
  runtime: Readonly<Record<string, never>>,
  input: Readonly<Record<string, never>>,
  config: Readonly<Record<string, never>>,
) => Promise<SchemaEditorBusinessDialectDemoRuntime> =
  createSchemaEditorBusinessDialectDemoRuntime;

const mountFactory: (
  target: Element,
) => Promise<MountedSchemaEditorBusinessDialectDemo> =
  mountSchemaEditorBusinessDialectDemo;

type ForbiddenPresenterProps = Extract<
  keyof SchemaEditorPresenterProps,
  'runtime' | 'session' | 'valueHost' | 'writer'
>;
const presenterPropsStayNeutral: ForbiddenPresenterProps extends never
  ? true
  : never = true;

void [
  schema,
  presentations,
  capsuleFactory,
  runtimeFactory,
  mountFactory,
  presenterPropsStayNeutral,
];
