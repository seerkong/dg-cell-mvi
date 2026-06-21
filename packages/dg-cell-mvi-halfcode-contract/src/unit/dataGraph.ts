import type { SerializableRecord, SerializableValue } from './common';
import type { HalfcodeRef } from './refs';

export type DataGraphLogicKind = 'computed' | 'processor' | 'async' | 'consumer';

export interface DataGraphNodeBindingSpec {
  id: string;
  kind: DataGraphLogicKind;
  impl: HalfcodeRef;
  config?: HalfcodeRef;
}

export interface DataGraphObjectBindingSpec {
  id: string;
  src: HalfcodeRef;
  config?: HalfcodeRef;
}

export interface DataGraphMountBindingSpec {
  id: string;
  graph?: HalfcodeRef;
  module: HalfcodeRef;
  scope?: string;
  seed?: HalfcodeRef;
  impls?: HalfcodeRef;
  nodeBindings: DataGraphNodeBindingSpec[];
}

export interface DataGraphExtensionBindingSpec {
  id: string;
  graph?: HalfcodeRef;
  src: HalfcodeRef;
  config?: HalfcodeRef;
}

export interface DataGraphBindingsSpec {
  objects: DataGraphObjectBindingSpec[];
  mounts: DataGraphMountBindingSpec[];
  extensions: DataGraphExtensionBindingSpec[];
}

export interface DataGraphSignalNodePlan {
  kind: 'signal';
  id: string;
  slot: string;
  initial: SerializableValue;
  flags?: SerializableRecord;
}

export interface DataGraphComputedNodePlan {
  kind: 'computed';
  id: string;
  slot: string;
  deps: string[];
  logicId: string;
  type?: HalfcodeRef;
  flags?: SerializableRecord;
}

export interface DataGraphProcessorNodePlan {
  kind: 'processor';
  id: string;
  slot: string;
  deps: string[];
  outputs: string[];
  logicId: string;
  type?: HalfcodeRef;
  flags?: SerializableRecord;
}

export interface DataGraphAsyncNodePlan {
  kind: 'async';
  id: string;
  /** Internal node slot used as the async operation identity. */
  slot: string;
  deps: string[];
  logicId: string;
  type?: HalfcodeRef;
  initial: SerializableValue;
  projections?: {
    result?: string;
    loading?: string;
    error?: string;
  };
  flags?: SerializableRecord;
}

export interface DataGraphConsumerNodePlan {
  kind: 'consumer';
  id: string;
  slot: string;
  deps: string[];
  logicId: string;
  type?: HalfcodeRef;
  flags?: SerializableRecord;
}

export type DataGraphNodePlan =
  | DataGraphSignalNodePlan
  | DataGraphComputedNodePlan
  | DataGraphProcessorNodePlan
  | DataGraphAsyncNodePlan
  | DataGraphConsumerNodePlan;

export interface DataGraphModulePlan {
  id: string;
  src?: HalfcodeRef;
  nodes: DataGraphNodePlan[];
}

export interface DataGraphMountPlan extends Omit<DataGraphMountBindingSpec, 'module'> {
  scopeId: string;
  module: DataGraphModulePlan;
  seedValues?: SerializableRecord;
}

export interface DataGraphScopePlan {
  objects: DataGraphObjectBindingSpec[];
  mounts: DataGraphMountPlan[];
  extensions: DataGraphExtensionBindingSpec[];
}
