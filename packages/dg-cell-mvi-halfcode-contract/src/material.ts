import type { HalfcodeId, HalfcodeIdentity, SerializableRecord, SerializableValue, VersionedRef } from './common';
import type { BindingExpr, ComputeExpr } from './document';

export type HalfcodeMaterial =
  | AdminShellMaterial
  | CrudMaterial
  | ViewMaterial
  | WorkflowMaterial;

export type HalfcodeMaterialKind = HalfcodeMaterial['kind'];

export interface BaseHalfcodeMaterial extends HalfcodeIdentity {
  moduleId?: HalfcodeId;
  stateModelRef?: VersionedRef;
}

export interface AdminShellMaterial extends BaseHalfcodeMaterial {
  kind: 'admin-shell';
  routes?: AdminRouteSpec[];
  menus?: AdminMenuSpec[];
  permissions?: PermissionSpec[];
  settings?: SerializableRecord;
  theme?: AdminThemeSpec;
  i18n?: Record<string, Record<string, string>>;
}

export interface AdminRouteSpec {
  id: HalfcodeId;
  path: string;
  title?: string;
  materialRef?: VersionedRef;
  parentId?: HalfcodeId;
  permissionRefs?: string[];
  order?: number;
}

export interface AdminMenuSpec {
  id: HalfcodeId;
  title: string;
  routeId?: HalfcodeId;
  parentId?: HalfcodeId;
  iconRef?: string;
  order?: number;
}

export interface PermissionSpec {
  id: HalfcodeId;
  action: string;
  subject?: string;
  description?: string;
}

export interface AdminThemeSpec {
  preset?: string;
  tokens?: SerializableRecord;
}

export interface CrudMaterial extends BaseHalfcodeMaterial {
  kind: 'crud';
  entity: string;
  resourceRef: VersionedRef;
  operations: CrudOperationSpec[];
  fields: CrudFieldSpec[];
  table?: CrudTableSpec;
  form?: CrudFormSpec;
}

export interface CrudOperationSpec {
  id: HalfcodeId;
  purpose: 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom';
  resourceOperationId: HalfcodeId;
  label?: string;
  effectRef?: VersionedRef;
}

export interface CrudFieldSpec {
  id: HalfcodeId;
  path: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date-string' | 'unknown-json';
  required?: boolean;
  readonly?: boolean;
  display?: CrudFieldDisplaySpec;
}

export interface CrudFieldDisplaySpec {
  table?: boolean;
  form?: boolean;
  detail?: boolean;
  widgetRef?: string;
  options?: SerializableValue[];
}

export interface CrudTableSpec {
  primaryKey: string;
  columns: string[];
  defaultPageSize?: number;
}

export interface CrudFormSpec {
  fields: string[];
  submitOperationId?: HalfcodeId;
}

export interface ViewMaterial extends BaseHalfcodeMaterial {
  kind: 'view';
  root: ViewNodeSpec;
  slots?: Record<string, ViewNodeSpec[]>;
}

export interface ViewNodeSpec {
  id: HalfcodeId;
  component: ComponentRef;
  props?: Record<string, SerializableValue | BindingExpr | ComputeExpr>;
  events?: Record<string, ViewEventSpec>;
  children?: ViewNodeSpec[];
  slots?: Record<string, ViewNodeSpec[]>;
  visibility?: BindingExpr | boolean;
}

export interface ComponentRef {
  kind: 'component-ref' | 'intrinsic';
  ref: string;
  adapter?: string;
}

export interface ViewEventSpec {
  eventType?: string;
  effectRef?: VersionedRef;
  commandRef?: string;
  payload?: Record<string, SerializableValue | BindingExpr>;
}

export interface WorkflowMaterial extends BaseHalfcodeMaterial {
  kind: 'workflow';
  states: WorkflowStateSpec[];
  transitions: WorkflowTransitionSpec[];
  initialStateId: HalfcodeId;
}

export interface WorkflowStateSpec {
  id: HalfcodeId;
  title?: string;
  viewRef?: VersionedRef;
  entryEffectRefs?: VersionedRef[];
  exitEffectRefs?: VersionedRef[];
}

export interface WorkflowTransitionSpec {
  id: HalfcodeId;
  from: HalfcodeId;
  to: HalfcodeId;
  eventType: string;
  guard?: BindingExpr | ComputeExpr;
  effectRefs?: VersionedRef[];
}
