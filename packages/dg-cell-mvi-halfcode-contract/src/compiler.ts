import type { HalfcodeDocument } from './document';
import type { HalfcodeId, SerializableRecord, SerializableValue, VersionedRef } from './common';
import type { HalfcodeElement } from './element';
import type { AdminRouteSpec, AdminThemeSpec, CrudMaterial, PermissionSpec, ViewNodeSpec } from './material';

export interface HalfcodeCompileInput {
  kind: 'canonical';
  document: HalfcodeDocument;
}

export interface HalfcodeDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
}

export interface HalfcodeCompileResult {
  document: HalfcodeDocument | null;
  plans: HalfcodeCompiledPlans;
  diagnostics: HalfcodeDiagnostic[];
}

export interface HalfcodeCompiledPlans {
  renderPlans: RenderPlan[];
  crudPlans: CrudPlan[];
  adminShellPlans: AdminShellPlan[];
  effectPlans: EffectPlan[];
  elementPlans: ElementPlan[];
}

export interface RenderPlan {
  id: HalfcodeId;
  materialRef: VersionedRef;
  root: ViewNodeSpec;
  slots?: Record<string, ViewNodeSpec[]>;
}

export interface CrudPlan {
  id: HalfcodeId;
  materialRef: VersionedRef;
  material: CrudMaterial;
  resourceRefs: VersionedRef[];
  effectRefs: VersionedRef[];
}

export interface AdminShellPlan {
  id: HalfcodeId;
  materialRef: VersionedRef;
  routes: AdminRouteSpec[];
  menus?: Array<{ id: HalfcodeId; title: string; routeId?: HalfcodeId; parentId?: HalfcodeId }>;
  permissions?: PermissionSpec[];
  settings?: SerializableRecord;
  theme?: AdminThemeSpec;
  i18n?: Record<string, Record<string, string>>;
}

export interface EffectPlan {
  id: HalfcodeId;
  effectRef: VersionedRef;
  request: {
    type: string;
    payload?: Record<string, SerializableValue>;
  };
}

export interface ElementPlan {
  id: HalfcodeId;
  element: HalfcodeElement;
  scopeRef?: string;
  contractRef?: string;
  parentId?: HalfcodeId;
}

export function createEmptyCompiledPlans(): HalfcodeCompiledPlans {
  return {
    renderPlans: [],
    crudPlans: [],
    adminShellPlans: [],
    effectPlans: [],
    elementPlans: [],
  };
}
