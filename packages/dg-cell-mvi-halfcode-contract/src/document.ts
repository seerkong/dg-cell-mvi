import type { HalfcodeMaterial } from './material';
import type { HalfcodeId, HalfcodeIdentity, SerializableRecord, SerializableValue, VersionedRef } from './common';
import type {
  ElementContractSpec,
  ElementTreeSpec,
  ScopeSpec,
} from './element';

export type HalfcodeDocumentKind = 'HalfcodeDocument';
export type HalfcodeDocumentApiVersion = 'halfcode.dg-cell-mvi/v1' | 'halfcode.dg-cell-mvi/v2';

export interface HalfcodeDocument {
  kind: HalfcodeDocumentKind;
  apiVersion: HalfcodeDocumentApiVersion;
  product: ProductSpec;
  modules: ModuleSpec[];
  materials: HalfcodeMaterial[];
  elementTree?: ElementTreeSpec;
  scopes?: ScopeSpec[];
  contracts?: ElementContractSpec[];
  stateModels?: StateModelSpec[];
  resources?: ResourceSpec[];
  effects?: EffectSpec[];
  extensions?: ExtensionSpec[];
  annotations?: SerializableRecord;
}

export interface ProductSpec extends HalfcodeIdentity {
  productLine?: string;
  owner?: string;
  entryModuleId?: HalfcodeId;
  settings?: SerializableRecord;
}

export interface ModuleSpec extends HalfcodeIdentity {
  productId?: HalfcodeId;
  parentModuleId?: HalfcodeId;
  materialRefs?: VersionedRef[];
  stateModelRefs?: VersionedRef[];
  resourceRefs?: VersionedRef[];
  effectRefs?: VersionedRef[];
  extensionRefs?: VersionedRef[];
  route?: ModuleRouteSpec;
  visibility?: 'public' | 'internal' | 'hidden';
}

export interface ModuleRouteSpec {
  path: string;
  title?: string;
  order?: number;
  iconRef?: string;
}

export interface StateModelSpec extends HalfcodeIdentity {
  owner: 'runtime' | 'module' | 'material';
  fields: StateFieldSpec[];
  initialSnapshot?: SerializableRecord;
  loadEventType?: string;
  resetEventType?: string;
}

export interface StateFieldSpec {
  id: HalfcodeId;
  path: string;
  valueType: StateValueType;
  required?: boolean;
  defaultValue?: SerializableValue;
  description?: string;
}

export type StateValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'date-string'
  | 'unknown-json';

export interface ResourceSpec extends HalfcodeIdentity {
  kind: 'http-resource' | 'memory-resource' | 'custom-port-resource';
  baseUrlRef?: string;
  portRef?: string;
  operations: ResourceOperationSpec[];
}

export interface ResourceOperationSpec {
  id: HalfcodeId;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  input?: ResourcePayloadSpec;
  output?: ResourcePayloadSpec;
  headers?: Record<string, BindingExpr | string>;
  query?: Record<string, BindingExpr | string | number | boolean>;
}

export interface ResourcePayloadSpec {
  contentType?: string;
  schemaRef?: VersionedRef;
  value?: SerializableValue | BindingExpr;
}

export interface EffectSpec extends HalfcodeIdentity {
  kind: 'resource-operation' | 'event-dispatch' | 'command' | 'extension';
  resourceId?: HalfcodeId;
  operationId?: HalfcodeId;
  eventType?: string;
  commandType?: string;
  extensionId?: HalfcodeId;
  input?: Record<string, SerializableValue | BindingExpr>;
  onSuccessEventType?: string;
  onFailureEventType?: string;
}

export interface ExtensionSpec extends HalfcodeIdentity {
  outlet: 'compiler' | 'projector' | 'runtime-port' | 'authoring-tool';
  capabilityRefs?: string[];
  config?: SerializableRecord;
}

export interface BindingExpr {
  kind: 'binding';
  path: string;
  fallback?: SerializableValue;
}

export interface ComputeExpr {
  kind: 'compute';
  processorRef: string;
  args?: Record<string, SerializableValue | BindingExpr>;
}
