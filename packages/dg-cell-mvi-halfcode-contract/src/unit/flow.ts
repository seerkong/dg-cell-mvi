/**
 * Flow semantics are owned by depa-flows. Halfcode only carries the canonical
 * upstream source projections beside its AppBundle identity and VFS metadata.
 */

import type { EagerDataFlowAuthoringPlan } from 'eager-data-flow-contract';
import type { FlowBundleSpec } from 'instant-ctrl-flow-contract';
import type { AIWorkflowDefinitionBinding } from 'ai-workflow-contract';

export type {
  FlowBundleSpec,
  FlowDiagnostic,
  FlowForm,
  FlowNodeSpec,
  FlowSourceCollection,
  FlowXnlSource,
  LoadFlowSourcesOptions,
} from 'instant-ctrl-flow-contract';

export type {
  EagerDataFlowAuthoringPlan,
  EagerDataFlowContract,
  EagerDataFlowDiagnostic,
  EagerDataFlowLoadResult,
  EagerDataFlowNodePlan,
  EagerDataFlowRegistry,
  EagerDataFlowRegistryEntry,
  EagerDataFlowSourceCollection,
  EagerDataFlowXnlSource,
  LoadEagerDataFlowOptions,
} from 'eager-data-flow-contract';

export type HalfcodeFlowSpec = FlowBundleSpec | EagerDataFlowAuthoringPlan;

/** AI product profile identity paired with its canonical substrate definition. */
export type HalfcodeFlowProfileBinding = AIWorkflowDefinitionBinding;
