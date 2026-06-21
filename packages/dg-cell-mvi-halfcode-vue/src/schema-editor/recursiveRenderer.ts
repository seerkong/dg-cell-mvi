import {
  h,
  type Component,
  type VNode,
  type VNodeChild,
} from 'vue';
import type {
  EditorPlanDiagnostic,
  EditorPlanNode,
  SchemaEditorContractValue,
  ValuePath,
} from 'dg-cell-mvi-halfcode-contract';

import type {
  SchemaEditorPresenterAdapter,
  SchemaEditorPresenterProps,
  SchemaEditorRenderConfig,
  SchemaEditorRenderInput,
  SchemaEditorRendererRuntime,
  SchemaEditorRenderResult,
} from './contracts';
import { dispatchSchemaEditorPresenterEvent } from './eventBridge';
import { resolveSchemaEditorUnionSelection } from './unionSelection';

const EMPTY_DIAGNOSTICS = Object.freeze([]) as readonly EditorPlanDiagnostic[];
const NOOP_EVENT = (): void => {};

interface RenderContext {
  readonly registry: SchemaEditorRendererRuntime['presenterRegistry'];
  readonly identityProjection: SchemaEditorRendererRuntime['identityProjection'];
  readonly snapshotValue: SchemaEditorContractValue;
  readonly wildcardBindings: readonly (string | number)[];
  readonly identityBindings: readonly (string | number)[];
  readonly keyPrefix: string;
  readonly session: SchemaEditorRendererRuntime['session'];
  readonly sessionState: SchemaEditorRendererRuntime['sessionState'];
}

type InternalRenderResult =
  | Readonly<{ ok: true; vnode: VNode }>
  | Readonly<{ ok: false; diagnostic: EditorPlanDiagnostic }>;

type OwnValueResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false }>;

export function renderSchemaEditorNode(
  runtime: SchemaEditorRendererRuntime,
  input: SchemaEditorRenderInput,
  config: SchemaEditorRenderConfig,
): SchemaEditorRenderResult {
  const runtimeRecord = readRecord(runtime);
  const inputRecord = readRecord(input);
  const configRecord = readRecord(config);
  const snapshotRecord = readRecord(inputRecord?.get('snapshot'));
  const registry = runtimeRecord?.get('presenterRegistry');
  const identityProjection = runtimeRecord?.get('identityProjection');
  const node = inputRecord?.get('node');
  const snapshotValue = snapshotRecord?.get('value');
  const keyPrefix = configRecord?.get('keyPrefix');
  const session = runtimeRecord?.get('session') as SchemaEditorRendererRuntime['session'];
  const sessionState = runtimeRecord?.get('sessionState') as SchemaEditorRendererRuntime['sessionState'];
  const wildcardBindings = readWildcardBindings(inputRecord?.get('wildcardBindings'));

  if (
    !isPresenterRegistry(registry)
    || !isIdentityProjection(identityProjection)
    || !isEditorPlanNode(node)
    || !isContractValue(snapshotValue)
    || typeof keyPrefix !== 'string'
    || keyPrefix.length === 0
    || !wildcardBindings.ok
  ) {
    return renderFailure(rendererDiagnostic(
      'INVALID_SCHEMA_EDITOR_RENDER_INPUT',
      'Schema Editor rendering requires own-data runtime, node, snapshot and keyPrefix inputs.',
    ));
  }

  const result = renderNode(node, {
    registry,
    identityProjection,
    snapshotValue,
    wildcardBindings: wildcardBindings.value,
    identityBindings: wildcardBindings.value,
    keyPrefix,
    session,
    sessionState,
  });
  return result.ok
    ? Object.freeze({ ok: true, vnode: result.vnode, diagnostics: EMPTY_DIAGNOSTICS })
    : renderFailure(result.diagnostic);
}

function renderNode(
  node: EditorPlanNode,
  context: RenderContext,
  vueKey?: PropertyKey,
): InternalRenderResult {
  const nodeRecord = readRecord(node);
  const kind = nodeRecord?.get('kind');
  const id = nodeRecord?.get('id');
  const pathResult = materializePath(nodeRecord?.get('path'), context.wildcardBindings);
  const presenterRecord = readRecord(nodeRecord?.get('presenter'));
  const presenterId = presenterRecord?.get('id');
  const presenterOptions = presenterRecord?.get('options');

  if (
    !isNodeKind(kind)
    || typeof id !== 'string'
    || !pathResult.ok
    || typeof presenterId !== 'string'
  ) {
    return {
      ok: false,
      diagnostic: rendererDiagnostic(
        'INVALID_SCHEMA_EDITOR_PLAN_NODE',
        'EditorPlan node data is malformed or has no presenter.',
        pathResult.ok ? pathResult.value : undefined,
      ),
    };
  }

  const valueResult = readValueAtPath(context.snapshotValue, pathResult.value);
  if (!valueResult.ok) {
    return {
      ok: false,
      diagnostic: rendererDiagnostic(
        'INVALID_SCHEMA_EDITOR_ACCEPTED_VALUE',
        `Accepted snapshot cannot be read safely for node "${id}".`,
        pathResult.value,
      ),
    };
  }

  const childrenResult = renderChildren(
    node,
    kind,
    valueResult.value as SchemaEditorContractValue | undefined,
    context,
  );
  if (!childrenResult.ok) return childrenResult;

  const resolution = resolvePresenter(context.registry, presenterId);
  if (!resolution.ok) {
    return {
      ok: false,
      diagnostic: rendererDiagnostic(
        resolution.code,
        resolution.message,
        pathResult.value,
      ),
    };
  }

  const diagnostics = readNodeDiagnostics(nodeRecord?.get('diagnostics'));
  if (!diagnostics.ok) {
    return {
      ok: false,
      diagnostic: rendererDiagnostic(
        'INVALID_SCHEMA_EDITOR_PLAN_NODE',
        `Diagnostics for node "${id}" are not own-data values.`,
        pathResult.value,
      ),
    };
  }

  const sessionDiagnostics = projectSessionDiagnostics(context.sessionState);
  const props: SchemaEditorPresenterProps = {
    node,
    value: valueResult.value as SchemaEditorContractValue | undefined,
    path: pathResult.value,
    presenterOptions: presenterOptions as SchemaEditorPresenterProps['presenterOptions'],
    pending: (context.sessionState?.pending.length ?? 0) > 0,
    diagnostics: Object.freeze([...diagnostics.value, ...sessionDiagnostics]),
    eventContext: Object.freeze({
      wildcardBindings: context.wildcardBindings,
      renderScopeKey: context.keyPrefix,
    }),
    onSchemaEditorEvent: context.session
      ? (event) => {
          dispatchSchemaEditorPresenterEvent(
            { session: context.session! },
            {
              node,
              event,
              wildcardBindings: context.wildcardBindings,
            },
            Object.freeze({}),
          );
        }
      : NOOP_EVENT,
  };
  const key = vueKey ?? `${context.keyPrefix}:${id}:${encodePath(pathResult.value)}`;
  return {
    ok: true,
    vnode: h(
      resolution.component,
      { ...props, key },
      childrenResult.children.length > 0
        ? { default: (): VNodeChild => [...childrenResult.children] }
        : undefined,
    ),
  };
}

function renderChildren(
  node: EditorPlanNode,
  kind: EditorPlanNode['kind'],
  value: SchemaEditorContractValue | undefined,
  context: RenderContext,
): Readonly<
  | { ok: true; children: readonly VNode[] }
  | { ok: false; diagnostic: EditorPlanDiagnostic }
> {
  if (kind === 'field' || kind === 'custom') {
    return { ok: true, children: EMPTY_VNODES };
  }

  const nodeRecord = readRecord(node);
  if (!nodeRecord) return invalidNodeChildren(node);

  if (kind === 'group') {
    const children = readArray(nodeRecord.get('children'));
    if (!children.ok) return invalidNodeChildren(node);
    return renderNodeList(children.value, context);
  }

  if (kind === 'collection') {
    if (value === undefined) return { ok: true, children: EMPTY_VNODES };
    const items = readArray(value);
    const template = nodeRecord.get('itemTemplate');
    if (!items.ok || !isEditorPlanNode(template)) return invalidAcceptedCollection(node);
    const keys = collectionKeys(node, items.value, context);
    if (!keys.ok) return invalidAcceptedCollection(node);

    const children: VNode[] = [];
    for (let index = 0; index < items.value.length; index += 1) {
      const child = renderNode(
        template,
        {
          ...context,
          wildcardBindings: Object.freeze([...context.wildcardBindings, index]),
          identityBindings: Object.freeze([...context.identityBindings, keys.value[index]]),
        },
        keys.value[index],
      );
      if (!child.ok) return child;
      children.push(child.vnode);
    }
    return { ok: true, children };
  }

  if (kind === 'map') {
    if (value === undefined) return { ok: true, children: EMPTY_VNODES };
    const entries = readOwnEntries(value);
    const template = nodeRecord.get('valueTemplate');
    if (!entries.ok || !isEditorPlanNode(template)) return invalidAcceptedMap(node);

    const children: VNode[] = [];
    for (const [key] of entries.value) {
      const child = renderNode(
        template,
        {
          ...context,
          wildcardBindings: Object.freeze([...context.wildcardBindings, key]),
          identityBindings: Object.freeze([...context.identityBindings, key]),
        },
        key,
      );
      if (!child.ok) return child;
      children.push(child.vnode);
    }
    return { ok: true, children };
  }

  const selectedAlternative = selectUnionAlternative(node, value);
  if (!selectedAlternative.ok) return selectedAlternative;
  if (selectedAlternative.node === undefined) {
    return { ok: true, children: EMPTY_VNODES };
  }
  const rendered = renderNode(selectedAlternative.node, context);
  return rendered.ok
    ? { ok: true, children: [rendered.vnode] }
    : rendered;
}

function renderNodeList(
  values: readonly unknown[],
  context: RenderContext,
): Readonly<
  | { ok: true; children: readonly VNode[] }
  | { ok: false; diagnostic: EditorPlanDiagnostic }
> {
  const children: VNode[] = [];
  for (const value of values) {
    if (!isEditorPlanNode(value)) {
      return {
        ok: false,
        diagnostic: rendererDiagnostic(
          'INVALID_SCHEMA_EDITOR_PLAN_NODE',
          'EditorPlan children must contain own-data nodes.',
        ),
      };
    }
    const child = renderNode(value, context);
    if (!child.ok) return child;
    children.push(child.vnode);
  }
  return { ok: true, children };
}

function selectUnionAlternative(
  node: EditorPlanNode,
  value: SchemaEditorContractValue | undefined,
): Readonly<
  | { ok: true; node: EditorPlanNode | undefined }
  | { ok: false; diagnostic: EditorPlanDiagnostic }
> {
  const nodeRecord = readRecord(node);
  const alternatives = readRecord(nodeRecord?.get('alternatives'));
  if (!alternatives) return invalidNodeChildren(node);
  const selected = resolveSchemaEditorUnionSelection(node, value);
  if (!selected.ok) {
    return {
      ok: false,
      diagnostic: rendererDiagnostic(
        'INVALID_SCHEMA_EDITOR_ACCEPTED_VALUE',
        selected.message,
        readNodePath(node),
      ),
    };
  }
  if (selected.alternativeId === undefined) return { ok: true, node: undefined };
  const alternative = alternatives.get(selected.alternativeId);
  return alternative === undefined || isEditorPlanNode(alternative)
    ? { ok: true, node: alternative }
    : invalidNodeChildren(node);
}

function collectionKeys(
  node: EditorPlanNode,
  items: readonly unknown[],
  context: RenderContext,
): Readonly<{ ok: true; value: readonly (string | number)[] } | { ok: false }> {
  const nodeRecord = readRecord(node);
  const metadata = readRecord(nodeRecord?.get('metadata'));
  const identity = readRecord(metadata?.get('identity'));
  const strategy = identity?.get('strategy');
  let candidates: readonly (string | number | undefined)[];
  if (strategy === 'property') {
    const identityPath = readArray(identity?.get('path'));
    if (!identityPath.ok) return { ok: false };
    candidates = items.map((item) => {
      const result = readRelativeValue(item, identityPath.value);
      return result.ok
        && (
          typeof result.value === 'string'
          || (typeof result.value === 'number' && Number.isFinite(result.value))
        )
        ? result.value
        : undefined;
    });
  } else if (strategy === 'ephemeral') {
    candidates = items.map(() => undefined);
  } else {
    return { ok: false };
  }

  const collectionPath = materializePath(readNodePath(node), context.identityBindings);
  if (
    !collectionPath.ok
    || items.some((item) => !isContractValue(item))
  ) {
    return { ok: false };
  }

  try {
    const result = context.identityProjection.reconcile(
      context.identityProjection,
      {
        collectionId: readNodeId(node),
        collectionPath: collectionPath.value,
        items: items as readonly SchemaEditorContractValue[],
        propertyIdentities: candidates,
      },
      { keyPrefix: context.keyPrefix },
    );
    return result.ok
      ? { ok: true, value: result.keys }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

function projectSessionDiagnostics(
  state: SchemaEditorRendererRuntime['sessionState'],
): readonly EditorPlanDiagnostic[] {
  if (!state) return EMPTY_DIAGNOSTICS;
  return Object.freeze(state.diagnostics.map((diagnostic) => Object.freeze({
    severity: 'error' as const,
    code: diagnostic.code,
    message: diagnostic.message,
    details: Object.freeze({ sessionPath: diagnostic.path }),
  })));
}

function resolvePresenter(
  registry: SchemaEditorRendererRuntime['presenterRegistry'],
  id: string,
): Readonly<
  | { ok: true; component: Component }
  | { ok: false; code: string; message: string }
> {
  try {
    const result = registry.resolve(id);
    if (!result.ok) {
      return {
        ok: false,
        code: result.diagnostic.code,
        message: result.diagnostic.message,
      };
    }
    const adapterRecord = readRecord(result.adapter as SchemaEditorPresenterAdapter);
    const component = adapterRecord?.get('component');
    return isComponent(component)
      ? { ok: true, component }
      : {
          ok: false,
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_ADAPTER',
          message: `Presenter "${id}" has no usable Vue component.`,
        };
  } catch {
    return {
      ok: false,
      code: 'INVALID_SCHEMA_EDITOR_PRESENTER_REGISTRY',
      message: `Presenter "${id}" could not be resolved safely.`,
    };
  }
}

function readValueAtPath(
  root: SchemaEditorContractValue,
  path: ValuePath,
): OwnValueResult {
  let current: unknown = root;
  for (const segment of path) {
    if (segment === '*') return { ok: false };
    const result = readOwnData(current, segment);
    if (!result.ok) return result;
    current = result.value;
    if (current === undefined) return { ok: true, value: undefined };
  }
  return { ok: true, value: current };
}

function readRelativeValue(root: unknown, path: readonly unknown[]): OwnValueResult {
  let current = root;
  for (const segment of path) {
    if (typeof segment !== 'string' && !isNonNegativeInteger(segment)) return { ok: false };
    const result = readOwnData(current, segment);
    if (!result.ok) return result;
    current = result.value;
    if (current === undefined) return { ok: true, value: undefined };
  }
  return { ok: true, value: current };
}

function readOwnData(value: unknown, key: string | number): OwnValueResult {
  if (!isObject(value)) return { ok: true, value: undefined };
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(key));
    if (!descriptor) return { ok: true, value: undefined };
    return 'value' in descriptor
      ? { ok: true, value: descriptor.value }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

function readOwnEntries(
  value: unknown,
): Readonly<{ ok: true; value: readonly (readonly [string, unknown])[] } | { ok: false }> {
  if (!isObject(value) || isArraySafely(value)) return { ok: false };
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries: Array<readonly [string, unknown]> = [];
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable) continue;
      if (!('value' in descriptor)) return { ok: false };
      entries.push([key, descriptor.value]);
    }
    return { ok: true, value: entries };
  } catch {
    return { ok: false };
  }
}

function materializePath(
  value: unknown,
  bindings: readonly (string | number)[],
): Readonly<{ ok: true; value: ValuePath } | { ok: false }> {
  const path = readArray(value);
  if (!path.ok) return path;
  const result: ValuePath = [];
  let bindingIndex = 0;
  for (const segment of path.value) {
    if (segment === '*') {
      const binding = bindings[bindingIndex];
      if (binding === undefined) return { ok: false };
      result.push(binding);
      bindingIndex += 1;
    } else if (
      (typeof segment === 'string' && segment.length > 0)
      || isNonNegativeInteger(segment)
    ) {
      result.push(segment as string | number);
    } else {
      return { ok: false };
    }
  }
  if (bindingIndex !== bindings.length) return { ok: false };
  return { ok: true, value: result };
}

function readWildcardBindings(
  value: unknown,
): Readonly<{ ok: true; value: readonly (string | number)[] } | { ok: false }> {
  if (value === undefined) return { ok: true, value: EMPTY_BINDINGS };
  const bindings = readArray(value);
  if (!bindings.ok) return bindings;
  const result: Array<string | number> = [];
  for (const binding of bindings.value) {
    if (
      (typeof binding === 'string' && binding.length > 0)
      || isNonNegativeInteger(binding)
    ) {
      result.push(binding as string | number);
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: Object.freeze(result) };
}

function readNodeDiagnostics(
  value: unknown,
): Readonly<{ ok: true; value: readonly EditorPlanDiagnostic[] } | { ok: false }> {
  if (value === undefined) return { ok: true, value: EMPTY_DIAGNOSTICS };
  const diagnostics = readArray(value);
  if (!diagnostics.ok) return diagnostics;
  for (const diagnostic of diagnostics.value) {
    if (!readRecord(diagnostic)) return { ok: false };
  }
  return { ok: true, value: diagnostics.value as readonly EditorPlanDiagnostic[] };
}

function readArray(value: unknown): Readonly<{ ok: true; value: readonly unknown[] } | { ok: false }> {
  if (!isArraySafely(value)) return { ok: false };
  try {
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !length
      || !('value' in length)
      || !Number.isSafeInteger(length.value)
      || length.value < 0
    ) {
      return { ok: false };
    }
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return { ok: false };
      result.push(descriptor.value);
    }
    return { ok: true, value: result };
  } catch {
    return { ok: false };
  }
}

function readRecord(value: unknown): ReadonlyMap<string, unknown> | undefined {
  if (!isObject(value) || isArraySafely(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const fields = new Map<string, unknown>();
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return undefined;
  }
}

function isEditorPlanNode(value: unknown): value is EditorPlanNode {
  const record = readRecord(value);
  return isNodeKind(record?.get('kind'))
    && typeof record?.get('id') === 'string'
    && readArray(record.get('path')).ok;
}

function isPresenterRegistry(
  value: unknown,
): value is SchemaEditorRendererRuntime['presenterRegistry'] {
  const record = readRecord(value);
  return typeof record?.get('resolve') === 'function';
}

function isIdentityProjection(
  value: unknown,
): value is SchemaEditorRendererRuntime['identityProjection'] {
  const record = readRecord(value);
  return typeof record?.get('reconcile') === 'function';
}

function isContractValue(value: unknown): value is SchemaEditorContractValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || (typeof value === 'object' && value !== null);
}

function isComponent(value: unknown): value is Component {
  return isObject(value);
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isArraySafely(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function isNodeKind(value: unknown): value is EditorPlanNode['kind'] {
  return value === 'group'
    || value === 'field'
    || value === 'collection'
    || value === 'map'
    || value === 'union'
    || value === 'custom';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function invalidNodeChildren(
  node: EditorPlanNode,
): Readonly<{ ok: false; diagnostic: EditorPlanDiagnostic }> {
  return {
    ok: false,
    diagnostic: rendererDiagnostic(
      'INVALID_SCHEMA_EDITOR_PLAN_NODE',
      `EditorPlan node "${readNodeId(node)}" has malformed recursive children.`,
      readNodePath(node),
    ),
  };
}

function invalidAcceptedCollection(
  node: EditorPlanNode,
): Readonly<{ ok: false; diagnostic: EditorPlanDiagnostic }> {
  return {
    ok: false,
    diagnostic: rendererDiagnostic(
      'INVALID_SCHEMA_EDITOR_ACCEPTED_VALUE',
      `Collection node "${readNodeId(node)}" requires an accepted array value.`,
      readNodePath(node),
    ),
  };
}

function invalidAcceptedMap(
  node: EditorPlanNode,
): Readonly<{ ok: false; diagnostic: EditorPlanDiagnostic }> {
  return {
    ok: false,
    diagnostic: rendererDiagnostic(
      'INVALID_SCHEMA_EDITOR_ACCEPTED_VALUE',
      `Map node "${readNodeId(node)}" requires an accepted own-data record value.`,
      readNodePath(node),
    ),
  };
}

function readNodeId(node: EditorPlanNode): string {
  const id = readRecord(node)?.get('id');
  return typeof id === 'string' ? id : '';
}

function readNodePath(node: EditorPlanNode): ValuePath | undefined {
  const path = readArray(readRecord(node)?.get('path'));
  return path.ok ? path.value as ValuePath : undefined;
}

function encodePath(path: readonly (string | number)[] | undefined): string {
  return path?.map((segment) => encodeURIComponent(String(segment))).join('/') ?? '';
}

function rendererDiagnostic(
  code: string,
  message: string,
  path?: ValuePath,
): EditorPlanDiagnostic {
  return Object.freeze({
    severity: 'error',
    code,
    message,
    ...(path ? { path: Object.freeze([...path]) as ValuePath } : {}),
  });
}

function renderFailure(diagnostic: EditorPlanDiagnostic): SchemaEditorRenderResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([diagnostic]),
  });
}

const EMPTY_VNODES = Object.freeze([]) as readonly VNode[];
const EMPTY_BINDINGS = Object.freeze([]) as readonly (string | number)[];
