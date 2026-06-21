import {
  XNL,
  applyMutations,
  diffNodes,
  parsePath,
  parseXnl,
  stringifyLineBlock,
  wordToString,
  type DataElementNode,
  type ImportSymbols,
  type ImportResolver,
  type ResolveImportsOptions,
  type ResolveImportsResult,
  type XnlDocument,
  type XnlMutation,
  type XnlNode,
} from 'xnl-core';
import type {
  AdminMenuSpec,
  AdminRouteSpec,
  ArtifactMutation,
  ArtifactPort,
  ArtifactRef,
  ArtifactSnapshot,
  CrudFieldSpec,
  CrudMaterial,
  CrudOperationSpec,
  ElementContractSpec,
  HalfcodeElement,
  HalfcodeDocument,
  HalfcodeMaterial,
  ResourceOperationSpec,
  ResourceSpec,
  StateFieldSpec,
  StateModelSpec,
  ScopeSpec,
  ViewMaterial,
  ViewNodeSpec,
} from 'dg-cell-mvi-halfcode-contract';

export interface HalfcodeXnlArtifact {
  core: string;
  halfcodeExt?: Record<string, unknown>;
  graphExt?: Record<string, unknown>;
}

export interface HalfcodeXnlArtifactSnapshot {
  ref: ArtifactRef;
  artifact: HalfcodeXnlArtifact;
  revision: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface HalfcodeXnlCodecResult {
  document: HalfcodeDocument;
  xnlDocument: XnlDocument;
}

export interface XnlArtifactStorage {
  load(ref: ArtifactRef): Promise<HalfcodeXnlArtifactSnapshot>;
  save(snapshot: HalfcodeXnlArtifactSnapshot): Promise<HalfcodeXnlArtifactSnapshot>;
  list?(query?: { productId?: string; tag?: string }): Promise<ArtifactRef[]>;
}

export interface HalfcodeXnlLoadResult {
  xnlDocument: XnlDocument;
  exports: ImportSymbols;
}

function wordId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[^A-Za-z_]+/, '_$&');
}

function quotedMapKey(key: string): string {
  return `::'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function documentPathToXnlMapPath(path: string): string {
  return path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(quotedMapKey)
    .join('');
}

function documentPathSegments(path: string): string[] {
  return path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function validatedXnlPath(path: string): string {
  parsePath(path);
  return path;
}

function isPlainObjectValue(value: unknown): value is Record<string, XnlNode> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !isDataElement(value);
}

function createXnlMapParentMutations(target: XnlDocument, basePath: string, segments: string[]): XnlMutation[] {
  const mutations: XnlMutation[] = [];
  let currentPath = basePath;
  for (const segment of segments.slice(0, -1)) {
    currentPath += quotedMapKey(segment);
    const current = XNL.path.resolve(target, currentPath, { strict: false });
    if (!isPlainObjectValue(current)) {
      mutations.push({
        type: current === undefined ? 'OBJECT_ADD' : 'OBJECT_UPDATE',
        path: validatedXnlPath(currentPath),
        valueAfter: {},
      });
      XNL.path.set(target, currentPath, {}, { mode: 'replace', strict: false });
    }
  }
  return mutations;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function omitUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function element(tag: string, id: string | undefined, attributes: Record<string, XnlNode> = {}, body?: XnlNode[]): DataElementNode {
  return {
    kind: 'DataElement',
    tag,
    id: id ? { kind: 'Word', namespace: [], name: wordId(id) } : undefined,
    metadata: {},
    attributes,
    body,
  };
}

function refNode(tag: string, ref: { id: string; version?: string }): DataElementNode {
  return element(tag, ref.id, { version: ref.version ?? null });
}

function elementId(node: DataElementNode): string {
  return wordToString(node.id) || stringValue(node, 'id') || '';
}

function withoutId<T extends { id?: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return rest;
}

function atomicNodeTag(node: Extract<HalfcodeElement, { kind: 'atomic' }>): string {
  if (node.tag) return node.tag;
  if (node.ui) return node.ui.includes(':') ? node.ui.split(':').pop() || node.ui : node.ui;
  return 'div';
}

function isCompositeElementTag(tag: string): boolean {
  return tag === 'PageElement' || tag === 'ComponentElement' || tag === 'CapsuleElement';
}

function valueOf(node: DataElementNode | undefined, key: string): unknown {
  return node?.attributes?.[key];
}

function stringValue(node: DataElementNode | undefined, key: string, fallback = ''): string {
  const value = valueOf(node, key);
  return typeof value === 'string' ? value : fallback;
}

function arrayValue<T = XnlNode>(node: DataElementNode | undefined, key: string): T[] {
  const value = valueOf(node, key);
  return Array.isArray(value) ? value as T[] : [];
}

function objectValue<T extends Record<string, unknown> = Record<string, unknown>>(node: DataElementNode | undefined, key: string): T | undefined {
  const value = valueOf(node, key);
  return value && typeof value === 'object' && !Array.isArray(value) && !isDataElement(value) ? value as T : undefined;
}

function isDataElement(value: unknown): value is DataElementNode {
  return !!value && typeof value === 'object' && (value as DataElementNode).kind === 'DataElement';
}

function nodesByTag(doc: XnlDocument, tag: string): DataElementNode[] {
  const out: DataElementNode[] = [];
  const walk = (node: XnlNode): void => {
    if (isDataElement(node)) {
      if (node.tag === tag) out.push(node);
      for (const child of node.body ?? []) walk(child);
    }
    if (Array.isArray(node)) for (const child of node) walk(child);
  };
  for (const node of doc.nodes) walk(node);
  return out;
}

function firstByTag(doc: XnlDocument, tag: string): DataElementNode | undefined {
  return nodesByTag(doc, tag)[0];
}

function routeToNode(route: AdminRouteSpec): DataElementNode {
  const { id, materialRef, ...rest } = route;
  return element('Route', route.id, {
    ...rest,
    materialRef: materialRef ? { id: materialRef.id, version: materialRef.version ?? null } : null,
  });
}

function menuToNode(menu: AdminMenuSpec): DataElementNode {
  return element('Menu', menu.id, withoutId(menu));
}

function crudOperationToNode(operation: CrudOperationSpec): DataElementNode {
  const { id, effectRef, ...rest } = operation;
  return element('Operation', operation.id, {
    ...rest,
    effectRef: effectRef ? { id: effectRef.id, version: effectRef.version ?? null } : null,
  });
}

function crudFieldToNode(field: CrudFieldSpec): DataElementNode {
  return element('Field', field.id, withoutId(field));
}

function viewNodeToNode(node: ViewNodeSpec): DataElementNode {
  return element('ViewNode', node.id, {
    component: node.component,
    props: node.props ?? {},
    events: node.events ?? {},
    visibility: node.visibility ?? null,
  }, node.children?.map(viewNodeToNode));
}

function halfcodeElementToNode(node: HalfcodeElement): DataElementNode {
  const attributes: Record<string, XnlNode> = {
    version: node.version,
    scopeRef: node.scopeRef ?? null,
    contractRef: node.contractRef ?? null,
    propsRef: node.propsRef ?? null,
    annotations: node.annotations ?? {},
  };
  if (node.kind === 'atomic') {
    Object.assign(attributes, {
      tag: node.tag ?? null,
      ui: node.ui ?? null,
      text: node.text ?? null,
      props: node.props ?? {},
    });
  }
  if (node.kind === 'component') attributes.componentRef = node.componentRef;
  if (node.kind === 'page') {
    attributes.route = node.route ?? null;
    attributes.title = node.title ?? null;
    attributes.mount = node.mount ?? null;
  }
  const body: DataElementNode[] = [];
  if (node.children?.length) {
    body.push(element('Children', undefined, {}, node.children.map(halfcodeElementToNode)));
  }
  if (node.slots) {
    body.push(element('Slots', undefined, {}, Object.entries(node.slots).map(([name, children]) => (
      element('Slot', name, { name }, children.map(halfcodeElementToNode))
    ))));
  }
  const tag = node.kind === 'atomic'
    ? atomicNodeTag(node)
    : node.kind === 'capsule'
      ? 'CapsuleElement'
      : node.kind === 'component'
        ? 'ComponentElement'
        : 'PageElement';
  return element(tag, node.id, attributes, body.length ? body : undefined);
}

function elementTreeToNode(document: HalfcodeDocument): DataElementNode | undefined {
  if (!document.elementTree) return undefined;
  return element('ElementTree', undefined, {
    root: document.elementTree.root,
  }, document.elementTree.elements.map(halfcodeElementToNode));
}

function scopeToNode(scope: ScopeSpec): DataElementNode {
  return element('Scope', scope.id, withoutId(scope));
}

function contractToNode(contract: ElementContractSpec): DataElementNode {
  return element('ElementContract', contract.id, withoutId(contract));
}

function materialToNode(material: HalfcodeMaterial): DataElementNode {
  if (material.kind === 'admin-shell') {
    const { id, routes, menus, ...rest } = material;
    return element('AdminShellMaterial', material.id, {
      ...rest,
      moduleId: material.moduleId ?? null,
      routes: (routes ?? []).map(routeToNode),
      menus: (menus ?? []).map(menuToNode),
      permissions: rest.permissions ?? [],
      settings: rest.settings ?? {},
      theme: rest.theme ?? {},
      i18n: rest.i18n ?? {},
    });
  }
  if (material.kind === 'crud') {
    const { id, resourceRef, operations, fields, ...rest } = material;
    return element('CrudMaterial', material.id, {
      ...rest,
      moduleId: material.moduleId ?? null,
      resourceRef: { id: resourceRef.id, version: resourceRef.version ?? null },
      operations: operations.map(crudOperationToNode),
      fields: fields.map(crudFieldToNode),
      table: rest.table ?? {},
      form: rest.form ?? {},
    });
  }
  if (material.kind === 'view') {
    const { id, root, ...rest } = material;
    return element('ViewMaterial', material.id, {
      ...rest,
      moduleId: material.moduleId ?? null,
      slots: material.slots ?? {},
      root: null,
    } as Record<string, XnlNode>, [viewNodeToNode(root)]);
  }
  const { id, ...rest } = material;
  return element('WorkflowMaterial', material.id, {
    ...rest,
  });
}

function stateModelToNode(model: StateModelSpec): DataElementNode {
  const { id, fields, ...rest } = model;
  return element('StateModel', model.id, {
    ...rest,
    initialSnapshot: model.initialSnapshot ?? {},
    fields: fields.map((field) => element('StateField', field.id, withoutId(field))),
  });
}

function resourceToNode(resource: ResourceSpec): DataElementNode {
  const { id, operations, ...rest } = resource;
  return element('Resource', resource.id, {
    ...rest,
    baseUrlRef: resource.baseUrlRef ?? null,
    portRef: resource.portRef ?? null,
    operations: operations.map((operation) => element('ResourceOperation', operation.id, withoutId(operation))),
  });
}

function documentToNode(document: HalfcodeDocument): DataElementNode {
  return element('HalfcodeDocument', document.product.id, {
    kind: document.kind,
    apiVersion: document.apiVersion,
    product: element('Product', document.product.id, withoutId(document.product)),
    modules: document.modules.map((module) => element('Module', module.id, {
      ...withoutId(module),
      materialRefs: (module.materialRefs ?? []).map((ref) => refNode('MaterialRef', ref)),
      resourceRefs: (module.resourceRefs ?? []).map((ref) => refNode('ResourceRef', ref)),
      effectRefs: (module.effectRefs ?? []).map((ref) => refNode('EffectRef', ref)),
    })),
    materials: document.materials.map(materialToNode),
    elementTree: elementTreeToNode(document) ?? null,
    scopes: (document.scopes ?? []).map(scopeToNode),
    contracts: (document.contracts ?? []).map(contractToNode),
    stateModels: (document.stateModels ?? []).map(stateModelToNode),
    resources: (document.resources ?? []).map(resourceToNode),
    effects: (document.effects ?? []).map((effect) => element('Effect', effect.id, withoutId(effect))),
    extensions: document.extensions ?? [],
    annotations: document.annotations ?? {},
  });
}

export function serializeHalfcodeDocumentToXnl(document: HalfcodeDocument): string {
  return stringifyLineBlock({ nodes: [documentToNode(document)] }, { textBlockStyle: true });
}

function refFromObject(value: unknown): { id: string; version?: string } {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { id: String(record.id ?? ''), version: typeof record.version === 'string' ? record.version : undefined };
}

function routeFromNode(node: DataElementNode): AdminRouteSpec {
  return {
    id: elementId(node),
    path: stringValue(node, 'path'),
    title: stringValue(node, 'title') || undefined,
    materialRef: valueOf(node, 'materialRef') ? refFromObject(valueOf(node, 'materialRef')) : undefined,
    parentId: stringValue(node, 'parentId') || undefined,
    permissionRefs: arrayValue<string>(node, 'permissionRefs'),
    order: typeof valueOf(node, 'order') === 'number' ? valueOf(node, 'order') as number : undefined,
  };
}

function menuFromNode(node: DataElementNode): AdminMenuSpec {
  return {
    id: elementId(node),
    title: stringValue(node, 'title'),
    routeId: stringValue(node, 'routeId') || undefined,
    parentId: stringValue(node, 'parentId') || undefined,
    iconRef: stringValue(node, 'iconRef') || undefined,
    order: typeof valueOf(node, 'order') === 'number' ? valueOf(node, 'order') as number : undefined,
  };
}

function crudOperationFromNode(node: DataElementNode): CrudOperationSpec {
  return {
    id: elementId(node),
    purpose: stringValue(node, 'purpose') as CrudOperationSpec['purpose'],
    resourceOperationId: stringValue(node, 'resourceOperationId'),
    label: stringValue(node, 'label') || undefined,
    effectRef: valueOf(node, 'effectRef') ? refFromObject(valueOf(node, 'effectRef')) : undefined,
  };
}

function crudFieldFromNode(node: DataElementNode): CrudFieldSpec {
  return {
    id: elementId(node),
    path: stringValue(node, 'path'),
    label: stringValue(node, 'label') || undefined,
    valueType: stringValue(node, 'valueType') as CrudFieldSpec['valueType'],
    required: valueOf(node, 'required') === true,
    readonly: valueOf(node, 'readonly') === true,
    display: objectValue(node, 'display') as CrudFieldSpec['display'],
  };
}

function viewNodeFromNode(node: DataElementNode): ViewNodeSpec {
  return {
    id: elementId(node),
    component: objectValue(node, 'component') as unknown as ViewNodeSpec['component'],
    props: objectValue(node, 'props') as ViewNodeSpec['props'],
    events: objectValue(node, 'events') as ViewNodeSpec['events'],
    children: (node.body ?? []).filter(isDataElement).map(viewNodeFromNode),
  };
}

function childHost(node: DataElementNode, tag: 'Children' | 'Slots'): DataElementNode | undefined {
  const bodyHost = (node.body ?? []).filter(isDataElement).find((child) => child.tag === tag);
  if (bodyHost) return bodyHost;
  const extended = node.extend?.children?.[tag];
  return isDataElement(extended) ? extended : undefined;
}

function halfcodeElementFromNode(node: DataElementNode): HalfcodeElement {
  const children = (childHost(node, 'Children')?.body ?? []).filter(isDataElement).map(halfcodeElementFromNode);
  const slots = Object.fromEntries(
    (childHost(node, 'Slots')?.body ?? [])
      .filter(isDataElement)
      .filter((slot) => slot.tag === 'Slot')
      .map((slot) => [
        stringValue(slot, 'name') || wordToString(slot.id) || 'default',
        (slot.body ?? []).filter(isDataElement).map(halfcodeElementFromNode),
      ]),
  );
  const base = {
    id: elementId(node),
    version: stringValue(node, 'version'),
    scopeRef: stringValue(node, 'scopeRef') || undefined,
    contractRef: stringValue(node, 'contractRef') || undefined,
    propsRef: stringValue(node, 'propsRef') || undefined,
    children: children.length ? children : undefined,
    slots: Object.keys(slots).length ? slots : undefined,
    annotations: objectValue(node, 'annotations') as any,
  };
  if (!isCompositeElementTag(node.tag)) {
    return {
      ...base,
      kind: 'atomic',
      tag: stringValue(node, 'tag') || (node.tag.includes(':') ? undefined : node.tag),
      ui: stringValue(node, 'ui') || undefined,
      text: stringValue(node, 'text') || undefined,
      props: objectValue(node, 'props') as any,
    };
  }
  if (node.tag === 'ComponentElement') {
    return {
      ...base,
      kind: 'component',
      componentRef: stringValue(node, 'componentRef'),
    };
  }
  if (node.tag === 'PageElement') {
    return {
      ...base,
      kind: 'page',
      route: stringValue(node, 'route') || undefined,
      title: stringValue(node, 'title') || undefined,
      mount: stringValue(node, 'mount') as any || undefined,
    };
  }
  return {
    ...base,
    kind: 'capsule',
  };
}

function elementTreeFromNode(node: DataElementNode | undefined): HalfcodeDocument['elementTree'] {
  if (!node) return undefined;
  return {
    root: stringValue(node, 'root'),
    elements: (node.body ?? []).filter(isDataElement).map(halfcodeElementFromNode),
  };
}

function scopeFromNode(node: DataElementNode): ScopeSpec {
  return {
    id: elementId(node),
    version: stringValue(node, 'version'),
    parentRef: stringValue(node, 'parentRef') || undefined,
    runtimeProfileRef: stringValue(node, 'runtimeProfileRef') || undefined,
    configRef: stringValue(node, 'configRef') || undefined,
    configDefRef: stringValue(node, 'configDefRef') || undefined,
    stateSeedRef: stringValue(node, 'stateSeedRef') || undefined,
    stateDefRef: stringValue(node, 'stateDefRef') || undefined,
    effectsRef: stringValue(node, 'effectsRef') || undefined,
    effectsDefRef: stringValue(node, 'effectsDefRef') || undefined,
  };
}

function contractFromNode(node: DataElementNode): ElementContractSpec {
  return {
    id: elementId(node),
    version: stringValue(node, 'version'),
    propsDefRef: stringValue(node, 'propsDefRef') || undefined,
    slotsDefRef: stringValue(node, 'slotsDefRef') || undefined,
    acceptsRef: stringValue(node, 'acceptsRef') || undefined,
    emitsRef: stringValue(node, 'emitsRef') || undefined,
    exposesRef: stringValue(node, 'exposesRef') || undefined,
  };
}

function materialFromNode(node: DataElementNode): HalfcodeMaterial {
  if (node.tag === 'AdminShellMaterial') {
    return {
      kind: 'admin-shell',
      id: elementId(node),
      version: stringValue(node, 'version'),
      moduleId: stringValue(node, 'moduleId') || undefined,
      routes: arrayValue<DataElementNode>(node, 'routes').filter(isDataElement).map(routeFromNode),
      menus: arrayValue<DataElementNode>(node, 'menus').filter(isDataElement).map(menuFromNode),
      permissions: arrayValue(node, 'permissions') as any,
      settings: objectValue(node, 'settings') as any,
      theme: objectValue(node, 'theme') as any,
      i18n: objectValue(node, 'i18n') as any,
    };
  }
  if (node.tag === 'CrudMaterial') {
    return {
      kind: 'crud',
      id: elementId(node),
      version: stringValue(node, 'version'),
      moduleId: stringValue(node, 'moduleId') || undefined,
      entity: stringValue(node, 'entity'),
      resourceRef: refFromObject(valueOf(node, 'resourceRef')),
      operations: arrayValue<DataElementNode>(node, 'operations').filter(isDataElement).map(crudOperationFromNode),
      fields: arrayValue<DataElementNode>(node, 'fields').filter(isDataElement).map(crudFieldFromNode),
      table: objectValue(node, 'table') as CrudMaterial['table'],
      form: objectValue(node, 'form') as CrudMaterial['form'],
    };
  }
  if (node.tag === 'ViewMaterial') {
    return {
      kind: 'view',
      id: elementId(node),
      version: stringValue(node, 'version'),
      moduleId: stringValue(node, 'moduleId') || undefined,
      root: viewNodeFromNode((node.body ?? []).filter(isDataElement)[0]),
      slots: objectValue(node, 'slots') as ViewMaterial['slots'],
    };
  }
  return {
    kind: 'workflow',
    id: elementId(node),
    version: stringValue(node, 'version'),
    states: arrayValue(node, 'states') as any,
    transitions: arrayValue(node, 'transitions') as any,
    initialStateId: stringValue(node, 'initialStateId'),
  };
}

function stateModelFromNode(node: DataElementNode): StateModelSpec {
  return {
    id: elementId(node),
    version: stringValue(node, 'version'),
    owner: stringValue(node, 'owner') as StateModelSpec['owner'],
    initialSnapshot: objectValue(node, 'initialSnapshot') as any,
    fields: arrayValue<DataElementNode>(node, 'fields').filter(isDataElement).map((field): StateFieldSpec => ({
      id: elementId(field),
      path: stringValue(field, 'path'),
      valueType: stringValue(field, 'valueType') as StateFieldSpec['valueType'],
      required: valueOf(field, 'required') === true,
      defaultValue: valueOf(field, 'defaultValue') as any,
      description: stringValue(field, 'description') || undefined,
    })),
  };
}

function resourceFromNode(node: DataElementNode): ResourceSpec {
  return {
    id: elementId(node),
    version: stringValue(node, 'version'),
    kind: stringValue(node, 'kind') as ResourceSpec['kind'],
    baseUrlRef: stringValue(node, 'baseUrlRef') || undefined,
    portRef: stringValue(node, 'portRef') || undefined,
    operations: arrayValue<DataElementNode>(node, 'operations').filter(isDataElement).map((operation): ResourceOperationSpec => ({
      id: elementId(operation),
      method: stringValue(operation, 'method') as ResourceOperationSpec['method'],
      path: stringValue(operation, 'path') || undefined,
      input: objectValue(operation, 'input') as ResourceOperationSpec['input'],
      output: objectValue(operation, 'output') as ResourceOperationSpec['output'],
      headers: objectValue(operation, 'headers') as ResourceOperationSpec['headers'],
      query: objectValue(operation, 'query') as ResourceOperationSpec['query'],
    })),
  };
}

export function parseHalfcodeDocumentFromXnl(core: string): HalfcodeXnlCodecResult {
  const xnlDocument = parseXnl(core);
  const root = firstByTag(xnlDocument, 'HalfcodeDocument');
  if (!root) throw new Error('Halfcode XNL artifact must contain <HalfcodeDocument>');
  const productNode = valueOf(root, 'product');
  if (!isDataElement(productNode)) throw new Error('Halfcode XNL artifact missing product node');

  const document: HalfcodeDocument = {
    kind: 'HalfcodeDocument',
    apiVersion: stringValue(root, 'apiVersion') as HalfcodeDocument['apiVersion'],
    product: {
      ...productNode.attributes,
      id: elementId(productNode),
    } as HalfcodeDocument['product'],
    modules: arrayValue<DataElementNode>(root, 'modules').filter(isDataElement).map((module) => ({
      ...module.attributes,
      id: elementId(module),
      version: stringValue(module, 'version'),
      materialRefs: arrayValue<DataElementNode>(module, 'materialRefs').filter(isDataElement).map((ref) => ({
        id: elementId(ref),
        version: stringValue(ref, 'version') || undefined,
      })),
      resourceRefs: arrayValue<DataElementNode>(module, 'resourceRefs').filter(isDataElement).map((ref) => ({
        id: elementId(ref),
        version: stringValue(ref, 'version') || undefined,
      })),
      effectRefs: arrayValue<DataElementNode>(module, 'effectRefs').filter(isDataElement).map((ref) => ({
        id: elementId(ref),
        version: stringValue(ref, 'version') || undefined,
      })),
    })) as HalfcodeDocument['modules'],
    materials: arrayValue<DataElementNode>(root, 'materials').filter(isDataElement).map(materialFromNode),
    elementTree: elementTreeFromNode(valueOf(root, 'elementTree') as DataElementNode | undefined),
    scopes: arrayValue<DataElementNode>(root, 'scopes').filter(isDataElement).map(scopeFromNode),
    contracts: arrayValue<DataElementNode>(root, 'contracts').filter(isDataElement).map(contractFromNode),
    stateModels: arrayValue<DataElementNode>(root, 'stateModels').filter(isDataElement).map(stateModelFromNode),
    resources: arrayValue<DataElementNode>(root, 'resources').filter(isDataElement).map(resourceFromNode),
    effects: arrayValue<DataElementNode>(root, 'effects').filter(isDataElement).map((effect) => ({
      ...effect.attributes,
      id: elementId(effect),
    } as any)),
    extensions: arrayValue(root, 'extensions') as any,
    annotations: objectValue(root, 'annotations') as any,
  };
  return { document: omitUndefined(document), xnlDocument };
}

export function serializeHalfcodeXnlArtifact(
  document: HalfcodeDocument,
  halfcodeExt: Record<string, unknown> = {},
  graphExt: Record<string, unknown> = {},
): HalfcodeXnlArtifact {
  return { core: serializeHalfcodeDocumentToXnl(document), halfcodeExt, graphExt };
}

export function parseHalfcodeXnlArtifact(artifact: HalfcodeXnlArtifact): HalfcodeXnlCodecResult {
  return parseHalfcodeDocumentFromXnl(artifact.core);
}

export function applyHalfcodeDocumentMutationToXnl(core: string, mutation: ArtifactMutation): {
  core: string;
  xnlMutations: XnlMutation[];
} {
  const { document } = parseHalfcodeDocumentFromXnl(core);
  const before = parseXnl(core).nodes[0] as XnlNode;
  if (mutation.kind === 'replace-document') {
    const afterCore = serializeHalfcodeDocumentToXnl(mutation.document);
    const after = parseXnl(afterCore).nodes[0] as XnlNode;
    const xnlMutations = diffNodes(before, after, `#${wordId(document.product.id)}`, { metadataIdMode: 'identity' });
    const applied = applyMutations(clone(before), xnlMutations, { metadataIdMode: 'identity' });
    return { core: stringifyLineBlock(applied, { textBlockStyle: true }), xnlMutations };
  }
  if (mutation.mutation.kind === 'set-product-settings') {
    const next = parseXnl(core);
    const rootId = wordId(document.product.id);
    const basePath = `#${rootId}:attributes::'product':attributes::'settings'`;
    const segments = documentPathSegments(mutation.mutation.path);
    const path = `${basePath}${documentPathToXnlMapPath(mutation.mutation.path)}`;
    const parentMutations = createXnlMapParentMutations(next, basePath, segments);
    const existing = XNL.path.resolve(next, path, { strict: false });
    const xnlMutations: XnlMutation[] = [
      ...parentMutations,
      {
        type: existing === undefined ? 'OBJECT_ADD' : 'OBJECT_UPDATE',
        path: validatedXnlPath(path),
        valueAfter: mutation.mutation.value as XnlNode,
      },
    ];
    const applied = applyMutations(clone(before), xnlMutations, { metadataIdMode: 'identity' });
    return { core: stringifyLineBlock(applied, { textBlockStyle: true }), xnlMutations };
  }
  throw new Error(`Unsupported XNL artifact mutation "${mutation.mutation.kind}"`);
}

export function diffHalfcodeXnlDocuments(beforeCore: string, afterCore: string): XnlMutation[] {
  const before = parseXnl(beforeCore).nodes[0] as XnlNode;
  const after = parseXnl(afterCore).nodes[0] as XnlNode;
  return diffNodes(before, after, [], { metadataIdMode: 'identity' });
}

export function loadHalfcodeXnlDocument(core: string): HalfcodeXnlLoadResult {
  const parsed = parseXnl(core);
  const loaded = XNL.loader.loadFromString(core);
  const dataNodes = parsed.nodes.filter(isDataElement);
  const { resolved, exports } = XNL.loader.batchLoad([dataNodes]);
  return {
    xnlDocument: { ...loaded, nodes: resolved[0] },
    exports,
  };
}

export function resolveHalfcodeXnlImports(
  core: string,
  resolver: ImportResolver,
  options: ResolveImportsOptions,
): ResolveImportsResult {
  return XNL.import.resolve(parseXnl(core), resolver, options);
}

export function createXnlArtifactPort(storage: XnlArtifactStorage): ArtifactPort<HalfcodeDocument> {
  return {
    async load(ref) {
      const snapshot = await storage.load(ref);
      const { document } = parseHalfcodeXnlArtifact(snapshot.artifact);
      return {
        ref: snapshot.ref,
        document,
        revision: snapshot.revision,
        updatedAt: snapshot.updatedAt,
        metadata: {
          ...(snapshot.metadata ?? {}),
          halfcodeExt: snapshot.artifact.halfcodeExt ?? {},
          graphExt: snapshot.artifact.graphExt ?? {},
        },
      };
    },
    async save(snapshot) {
      const artifact = serializeHalfcodeXnlArtifact(
        snapshot.document,
        snapshot.metadata?.halfcodeExt as Record<string, unknown> | undefined,
        snapshot.metadata?.graphExt as Record<string, unknown> | undefined,
      );
      const saved = await storage.save({
        ref: snapshot.ref,
        artifact,
        revision: snapshot.revision,
        updatedAt: snapshot.updatedAt,
        metadata: snapshot.metadata,
      });
      const { document } = parseHalfcodeXnlArtifact(saved.artifact);
      return {
        ref: saved.ref,
        document,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        metadata: {
          ...(saved.metadata ?? {}),
          halfcodeExt: saved.artifact.halfcodeExt ?? {},
          graphExt: saved.artifact.graphExt ?? {},
        },
      };
    },
    async list(query) {
      return storage.list?.(query) ?? [];
    },
    async mutate(ref, mutation) {
      const snapshot = await storage.load(ref);
      const applied = applyHalfcodeDocumentMutationToXnl(snapshot.artifact.core, mutation);
      const saved = await storage.save({
        ...snapshot,
        artifact: {
          ...snapshot.artifact,
          core: applied.core,
        },
        metadata: {
          ...(snapshot.metadata ?? {}),
          lastXnlMutations: applied.xnlMutations,
        },
      });
      const { document } = parseHalfcodeXnlArtifact(saved.artifact);
      return {
        ref: saved.ref,
        document,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        metadata: {
          ...(saved.metadata ?? {}),
          halfcodeExt: saved.artifact.halfcodeExt ?? {},
          graphExt: saved.artifact.graphExt ?? {},
        },
      };
    },
    async import(source) {
      const artifact = typeof source === 'string'
        ? { core: source }
        : source as HalfcodeXnlArtifact;
      const { document } = parseHalfcodeXnlArtifact(artifact);
      return {
        ref: { id: document.product.id },
        document,
        revision: '0',
        metadata: {
          halfcodeExt: artifact.halfcodeExt ?? {},
          graphExt: artifact.graphExt ?? {},
        },
      };
    },
  };
}
