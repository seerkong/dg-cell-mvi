/**
 * Flow semantics are owned by depa-flows. Halfcode only carries the canonical
 * upstream source projections beside its AppBundle identity and VFS metadata.
 */

import type { EagerDataFlowAuthoringPlan } from 'eager-data-flow-contract';
import type { FlowBundleSpec } from 'instant-flow-contract';

export type {
  FlowBundleSpec,
  FlowDiagnostic,
  FlowForm,
  FlowNodeSpec,
  FlowSourceCollection,
  FlowXnlSource,
  LoadFlowSourcesOptions,
} from 'instant-flow-contract';

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
