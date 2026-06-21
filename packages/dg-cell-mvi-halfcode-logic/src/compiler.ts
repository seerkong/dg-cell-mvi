import {
  createEmptyCompiledPlans,
  validateHalfcodeDocument,
  type ComponentRef,
  type CrudMaterial,
  type CrudPlan,
  type ElementPlan,
  type HalfcodeCompileInput,
  type HalfcodeCompileResult,
  type HalfcodeDiagnostic,
  type HalfcodeDocument,
  type HalfcodeElement,
  type PageElementSpec,
  type RenderPlan,
  type SerializableValue,
  type ViewMaterial,
  type ViewNodeSpec,
} from 'dg-cell-mvi-halfcode-contract';

const DOCUMENT_VERSION = '1.0.0';

export function compileHalfcode(input: HalfcodeCompileInput): HalfcodeCompileResult {
  return compileCanonicalDocument(input.document);
}

export function compileCanonicalDocument(doc: HalfcodeDocument): HalfcodeCompileResult {
  const plans = createEmptyCompiledPlans();
  const diagnostics: HalfcodeDiagnostic[] = [];
  const validation = validateHalfcodeDocument(doc);
  diagnostics.push(...validation.issues.map((issue) => ({
    severity: 'error' as const,
    code: 'HALFCODE_DOCUMENT_INVALID',
    message: issue.message,
    path: issue.path,
  })));

  if (doc.elementTree) {
    compileElementTree(doc, plans.elementPlans, plans.renderPlans, plans.adminShellPlans, plans.crudPlans, diagnostics);
  }

  for (const material of doc.materials) {
    if (material.kind === 'view') {
      plans.renderPlans.push(renderPlanFromViewMaterial(material));
      continue;
    }
    if (material.kind === 'crud') {
      plans.crudPlans.push(crudPlanFromMaterial(material));
      continue;
    }
    if (material.kind === 'admin-shell') {
      plans.adminShellPlans.push({
        id: `${material.id}.admin-shell-plan`,
        materialRef: { id: material.id, version: material.version },
        routes: material.routes ?? [],
        menus: material.menus,
        permissions: material.permissions,
        settings: material.settings,
        theme: material.theme,
        i18n: material.i18n,
      });
      continue;
    }
    diagnostics.push({
      severity: 'info',
      code: 'HALFCODE_MATERIAL_PLAN_DEFERRED',
      message: `Material kind "${material.kind}" does not produce a first-class plan yet.`,
      path: `$.materials.${material.id}`,
    });
  }

  return { document: doc, plans, diagnostics };
}

function compileElementTree(
  doc: HalfcodeDocument,
  elementPlans: ElementPlan[],
  renderPlans: RenderPlan[],
  adminShellPlans: HalfcodeCompileResult['plans']['adminShellPlans'],
  crudPlans: CrudPlan[],
  diagnostics: HalfcodeDiagnostic[],
): void {
  const tree = doc.elementTree;
  if (!tree) return;
  const root = tree.elements.find((element) => element.id === tree.root);
  if (!root) {
    diagnostics.push({
      severity: 'error',
      code: 'HALFCODE_ELEMENT_ROOT_MISSING',
      message: `ElementTree root "${tree.root}" does not exist.`,
      path: '$.elementTree.root',
    });
    return;
  }
  for (const element of tree.elements) flattenElement(element, undefined, elementPlans);
  renderPlans.push(renderPlanFromElement(root));
  if (root.kind === 'page') adminShellPlans.push(adminShellPlanFromPage(root));
  for (const element of elementPlans.map((plan) => plan.element)) {
    if (element.kind === 'component' && isCrudComponentRef(element.componentRef)) {
      crudPlans.push(crudPlanFromComponentElement(element));
    }
  }
}

function flattenElement(element: HalfcodeElement, parentId: string | undefined, out: ElementPlan[]): void {
  out.push({
    id: element.id,
    element,
    scopeRef: element.scopeRef,
    contractRef: element.contractRef,
    parentId,
  });
  for (const child of element.children ?? []) flattenElement(child, element.id, out);
  for (const slotChildren of Object.values(element.slots ?? {})) {
    for (const child of slotChildren) flattenElement(child, element.id, out);
  }
}

function renderPlanFromElement(element: HalfcodeElement): RenderPlan {
  return {
    id: `${element.id}.render-plan`,
    materialRef: { id: element.id, version: element.version },
    root: viewNodeFromElement(element),
  };
}

function viewNodeFromElement(element: HalfcodeElement): ViewNodeSpec {
  const props: Record<string, SerializableValue> = {};
  if ('props' in element && element.props) Object.assign(props, element.props);
  if ('text' in element && typeof element.text === 'string') props.text = element.text;
  if (element.propsRef) props.propsRef = element.propsRef;
  if (element.scopeRef) props.scopeRef = element.scopeRef;
  if (element.contractRef) props.contractRef = element.contractRef;
  if (element.kind === 'page' && element.route) props.route = element.route;
  if (element.kind === 'page' && element.title) props.title = element.title;

  return {
    id: element.id,
    component: componentRefFromElement(element),
    props,
    children: (element.children ?? []).map(viewNodeFromElement),
    slots: element.slots ? Object.fromEntries(
      Object.entries(element.slots).map(([name, nodes]) => [name, nodes.map(viewNodeFromElement)]),
    ) : undefined,
  };
}

function componentRefFromElement(element: HalfcodeElement): ComponentRef {
  if (element.kind === 'atomic') {
    if (element.tag) return { kind: 'intrinsic', ref: element.tag };
    if (element.ui) return componentRefFromStableId(element.ui);
    return { kind: 'intrinsic', ref: 'div' };
  }
  if (element.kind === 'component') return componentRefFromStableId(element.componentRef);
  if (element.kind === 'page') return { kind: 'component-ref', ref: 'Page' };
  return { kind: 'component-ref', ref: 'Capsule' };
}

function componentRefFromStableId(ref: string): ComponentRef {
  const [adapter, name] = ref.includes(':') ? ref.split(':', 2) : [undefined, ref];
  return {
    kind: 'component-ref',
    ref: name || ref,
    adapter,
  };
}

function adminShellPlanFromPage(page: PageElementSpec): HalfcodeCompileResult['plans']['adminShellPlans'][number] {
  const routePath = page.route ?? `/${page.id}`;
  return {
    id: `${page.id}.admin-shell-plan`,
    materialRef: { id: page.id, version: page.version },
    routes: [{
      id: `route-${page.id}`,
      path: routePath,
      title: page.title,
      materialRef: { id: page.id, version: page.version },
    }],
    menus: page.title ? [{ id: `menu-${page.id}`, title: page.title, routeId: `route-${page.id}` }] : undefined,
    settings: page.mount ? { mount: page.mount } : undefined,
  };
}

function isCrudComponentRef(ref: string): boolean {
  return ref === 'components:CrudTable' || ref === 'CrudTable' || ref.endsWith(':CrudTable');
}

function crudPlanFromComponentElement(element: HalfcodeElement): CrudPlan {
  const material: CrudMaterial = {
    kind: 'crud',
    id: `${element.id}.crud`,
    version: element.version,
    entity: element.id,
    resourceRef: { id: `${element.id}.resource`, version: element.version },
    operations: [],
    fields: [],
  };
  return crudPlanFromMaterial(material);
}

function renderPlanFromViewMaterial(material: ViewMaterial): RenderPlan {
  return {
    id: `${material.id}.render-plan`,
    materialRef: { id: material.id, version: material.version },
    root: material.root,
    slots: material.slots,
  };
}

function crudPlanFromMaterial(material: CrudMaterial): CrudPlan {
  return {
    id: `${material.id}.crud-plan`,
    materialRef: { id: material.id, version: material.version },
    material,
    resourceRefs: [material.resourceRef],
    effectRefs: material.operations.flatMap((operation) => (operation.effectRef ? [operation.effectRef] : [])),
  };
}
