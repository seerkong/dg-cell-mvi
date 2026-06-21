import type { EditorPlanDiagnostic, EditorPlanNode } from './plan';
import type { EditorPresentationOverlay } from './presentation';
import type { StructureSchema } from './schema';
import type { SchemaEditorContractRecord, SchemaEditorContractValue } from './serializable';

export const SCHEMA_EDITOR_RESOLUTION_PRECEDENCE = [
  'presentation',
  'semantic',
  'format',
  'structural',
  'unsupported',
] as const;

export type SchemaEditorResolutionStage = (typeof SCHEMA_EDITOR_RESOLUTION_PRECEDENCE)[number];

export interface SchemaEditorCompileRuntime<TInput = unknown, TOutput = unknown> {
  compile(input: TInput, config?: SchemaEditorContractRecord): TOutput | Promise<TOutput>;
}

export interface SchemaEditorProcessorInput {
  schema?: StructureSchema;
  presentation?: EditorPresentationOverlay;
  path?: Array<string | number | '*'>;
  value?: SchemaEditorContractValue;
  [key: string]: unknown;
}

export interface SchemaEditorClassification {
  presenterId?: string;
  semanticType?: string;
  format?: string;
  structuralKind?: string;
  unsupported?: boolean;
  diagnostics?: EditorPlanDiagnostic[];
}

export type SchemaEditorProcessor<
  TRuntime = SchemaEditorCompileRuntime<unknown, unknown>,
  TInput = SchemaEditorProcessorInput,
  TConfig = SchemaEditorContractRecord,
  TOutput = unknown,
> = (
  runtime: TRuntime,
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

export type SchemaEditorClassify<
  TRuntime = SchemaEditorCompileRuntime<unknown, unknown>,
  TInput = SchemaEditorProcessorInput,
  TConfig = SchemaEditorContractRecord,
> = SchemaEditorProcessor<
  TRuntime,
  TInput,
  TConfig,
  SchemaEditorClassification
>;

export type SchemaEditorTransformer<
  TRuntime = SchemaEditorCompileRuntime<unknown, unknown>,
  TInput = SchemaEditorProcessorInput,
  TConfig = SchemaEditorContractRecord,
  TOutput = EditorPlanNode,
> = SchemaEditorProcessor<
  TRuntime,
  TInput,
  TConfig,
  TOutput
>;

export type SchemaEditorTransformers<
  TRuntime = SchemaEditorCompileRuntime<unknown, unknown>,
  TInput = SchemaEditorProcessorInput,
  TConfig = SchemaEditorContractRecord,
  TOutput = EditorPlanNode,
> = Record<string, SchemaEditorTransformer<TRuntime, TInput, TConfig, TOutput>>;

export interface SchemaEditorDialect<
  TRuntime = SchemaEditorCompileRuntime<unknown, unknown>,
  TInput = SchemaEditorProcessorInput,
  TConfig = SchemaEditorContractRecord,
  TOutput = EditorPlanNode,
> {
  id: string;
  classify?: SchemaEditorClassify<TRuntime, TInput, TConfig>;
  transformers?: SchemaEditorTransformers<TRuntime, TInput, TConfig, TOutput>;
  config?: SchemaEditorContractRecord;
  metadata?: SchemaEditorContractRecord;
}
