import type { XnlProjectionDiagnostic } from './diagnostics';
import type { XnlProjectionDomainPathSegment, XnlProjectionDomainRef } from './domain';
import type { XnlProjectionInteraction, XnlProjectionCommandResult } from './interaction';
import type { XnlProjectionClassification, XnlProjectionPlanNode } from './plan';
import type { XnlProjectionPresenterRef } from './presentation';
import type { XnlProjectionSerializableRecord } from './serializable';

export const XNL_PROJECTION_RESOLUTION_PRECEDENCE = [
  'presentation',
  'semantic',
  'classification',
  'source-kind',
  'unsupported',
] as const;

export type XnlProjectionResolutionStage = (typeof XNL_PROJECTION_RESOLUTION_PRECEDENCE)[number];

export interface XnlProjectionCompileContext {
  domain: XnlProjectionDomainRef;
  ancestors?: readonly XnlProjectionDomainRef[];
  presentationId?: string;
  metadata?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionCompileRuntime<TNode = unknown, TOutput = XnlProjectionPlanNode> {
  compile(
    input: XnlProjectionCompileChild<TNode>,
    config: XnlProjectionSerializableRecord,
  ): TOutput | Promise<TOutput>;
}

export interface XnlProjectionCompileChild<TNode = unknown> {
  node: TNode;
  /**
   * Relative path from the parent domain node. When present, it is appended as
   * multiple structural segments and takes precedence over pathSegment.
   */
  path?: readonly XnlProjectionDomainPathSegment[];
  pathSegment: XnlProjectionDomainPathSegment;
  nodeId?: string;
  tag?: string;
  role?: string;
  sourceKind?: string;
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionProcessorInput<TNode = unknown> {
  node: TNode;
  context: XnlProjectionCompileContext;
  children?: readonly XnlProjectionPlanNode[];
  classification?: XnlProjectionClassification;
  presentation?: XnlProjectionPresenterRef;
  presentationData?: XnlProjectionSerializableRecord;
  presentationRuleIds?: readonly string[];
  interaction?: XnlProjectionInteraction;
  metadata?: XnlProjectionSerializableRecord;
}

export type XnlProjectionProcessor<
  TRuntime = XnlProjectionCompileRuntime,
  TInput = XnlProjectionProcessorInput,
  TConfig = XnlProjectionSerializableRecord,
  TOutput = unknown,
> = (
  runtime: TRuntime,
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

export type XnlProjectionChildrenProcessor<
  TNode = unknown,
  TRuntime = XnlProjectionCompileRuntime<TNode>,
  TConfig = XnlProjectionSerializableRecord,
> = XnlProjectionProcessor<
  TRuntime,
  { node: TNode; context: XnlProjectionCompileContext },
  TConfig,
  readonly XnlProjectionCompileChild<TNode>[]
>;

export type XnlProjectionClassifier<
  TNode = unknown,
  TRuntime = XnlProjectionCompileRuntime<TNode>,
  TConfig = XnlProjectionSerializableRecord,
> = XnlProjectionProcessor<
  TRuntime,
  { node: TNode; context: XnlProjectionCompileContext },
  TConfig,
  XnlProjectionClassification
>;

export type XnlProjectionTransformer<
  TNode = unknown,
  TRuntime = XnlProjectionCompileRuntime<TNode>,
  TConfig = XnlProjectionSerializableRecord,
> = XnlProjectionProcessor<
  TRuntime,
  XnlProjectionProcessorInput<TNode>,
  TConfig,
  XnlProjectionPlanNode
>;

export type XnlProjectionInteractionTranslator<
  TNode = unknown,
  TRuntime = unknown,
  TConfig = XnlProjectionSerializableRecord,
> = XnlProjectionProcessor<
  TRuntime,
  { planNode: XnlProjectionPlanNode; interaction: XnlProjectionInteraction; sourceNode?: TNode },
  TConfig,
  XnlProjectionCommandResult
>;

export interface XnlProjectionSemanticPresenterBinding {
  classification?: string;
  trait?: string;
  role?: string;
  sourceKind?: string;
  presenter: XnlProjectionPresenterRef;
  diagnostics?: readonly XnlProjectionDiagnostic[];
}

export interface XnlProjectionDialect<
  TNode = unknown,
  TRuntime = XnlProjectionCompileRuntime<TNode>,
  TConfig = XnlProjectionSerializableRecord,
> {
  id: string;
  children: XnlProjectionChildrenProcessor<TNode, TRuntime, TConfig>;
  classify: XnlProjectionClassifier<TNode, TRuntime, TConfig>;
  transformers: Readonly<Record<string, XnlProjectionTransformer<TNode, TRuntime, TConfig>>>;
  presenterBindings?: readonly XnlProjectionSemanticPresenterBinding[];
  translateInteraction?: XnlProjectionInteractionTranslator<TNode, TRuntime, TConfig>;
  config?: TConfig;
  metadata?: XnlProjectionSerializableRecord;
}
