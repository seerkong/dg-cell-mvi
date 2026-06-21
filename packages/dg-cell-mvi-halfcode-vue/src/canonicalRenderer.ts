import {
  defineComponent,
  h,
  onScopeDispose,
  ref,
  resolveDynamicComponent,
  watch as vueWatch,
  type PropType,
  type VNodeChild,
} from 'vue';
import { watch as watchGraph } from 'dg-cell-mvi-core';
import type {
  RenderNodePlan,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  HalfcodeAppRuntime,
  MountedHalfcodeDataGraph,
} from 'dg-cell-mvi-halfcode-support';

export interface CanonicalComponentRegistry {
  resolve(name: unknown, context?: CanonicalComponentResolutionContext): unknown;
}

export interface CanonicalComponentResolutionContext {
  readonly plan: UnitRenderPlan;
  readonly runtime: HalfcodeAppRuntime;
  readonly node: RenderNodePlan;
}

export interface CanonicalRenderContext {
  plan: UnitRenderPlan;
  runtime: HalfcodeAppRuntime;
  registry?: CanonicalComponentRegistry;
  compositionStack: readonly string[];
  updated(): void;
}

interface GraphRefPath {
  graphId: string;
  section: 'inputs' | 'outputs' | 'state' | 'internals';
  key: string;
}

interface GraphValueBinding {
  mounted: MountedHalfcodeDataGraph;
  ref: unknown;
}

export function renderCanonicalHalfcodeNode(
  node: RenderNodePlan,
  context: CanonicalRenderContext,
  hostProps?: Record<string, unknown>,
): VNodeChild {
  const props = resolveNodeProps(node, context, hostProps);
  const text = typeof props.text === 'string' ? props.text : undefined;
  if (text !== undefined) delete props.text;

  if ('commandBinding' in node && node.commandBinding) {
    const dispatchCommand = async (...args: unknown[]) => {
      const result = await context.runtime.dispatchCommand({
        unitFqn: context.plan.unitFqn,
        elementId: node.id,
        input: commandInput(node, args),
      });
      if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
      }
      context.updated();
      return result.output;
    };
    props[commandListenerProp(node)] = dispatchCommand;
  }

  if (node.kind === 'component' || node.kind === 'page-embed') {
    const targetFqn = node.kind === 'component' ? node.fqn : node.pageFqn;
    const targetPlan = context.runtime.plans.renderPlans.find(
      (candidate) => candidate.unitFqn === targetFqn,
    );
    if (!targetPlan) {
      throw new Error(`Render plan for composed unit "${targetFqn}" was not found.`);
    }
    if (context.compositionStack.includes(String(targetPlan.unitFqn))) {
      throw new Error(
        `Recursive Halfcode unit composition detected: ${[
          ...context.compositionStack,
          String(targetPlan.unitFqn),
        ].join(' -> ')}`,
      );
    }
    return renderCanonicalHalfcodeUnit(targetPlan, {
      ...context,
      plan: targetPlan,
      compositionStack: [...context.compositionStack, String(targetPlan.unitFqn)],
    }, props);
  }

  const registryIdentity = node.kind === 'capsule'
    ? 'div'
    : node.library
      ? node.tag.slice(`${node.library}.`.length)
      : node.tag;
  const component = node.kind === 'capsule'
    ? 'div'
    : context.registry?.resolve(registryIdentity, {
        plan: context.plan,
        runtime: context.runtime,
        node,
      }) ??
      (node.kind === 'atom' && !node.tag.includes('.') ? node.tag : resolveDynamicComponent(node.tag));
  const children = renderPlanChildren(node, context, text);
  return h(component as any, props, children as any);
}

export function renderCanonicalHalfcodeUnit(
  plan: UnitRenderPlan,
  context: CanonicalRenderContext,
  hostProps?: Record<string, unknown>,
): VNodeChild[] {
  return plan.root.map((node, index) =>
    renderCanonicalHalfcodeNode(node, context, index === 0 ? hostProps : undefined));
}

function renderPlanChildren(
  node: RenderNodePlan,
  context: CanonicalRenderContext,
  text?: string,
): VNodeChild | Record<string, () => VNodeChild> {
  if (node.slots?.length) {
    return Object.fromEntries(node.slots.map((slot) => [
      slot.id,
      () => slot.children.map((child) => renderCanonicalHalfcodeNode(child, context)),
    ]));
  }
  if (node.children?.length) {
    return node.children.map((child) => renderCanonicalHalfcodeNode(child, context));
  }
  return text;
}

function resolveNodeProps(
  node: RenderNodePlan,
  context: CanonicalRenderContext,
  hostProps?: Record<string, unknown>,
): Record<string, unknown> {
  const configProps = configBindingProps(node, context);
  const inlineProps = node.kind === 'atom' || node.kind === 'component'
    ? node.inlineProps ?? {}
    : {};
  return {
    ...configProps,
    ...(hostProps ?? {}),
    ...Object.fromEntries(
      Object.entries(inlineProps).map(([key, value]) => [key, resolvePlanValue(value, node, context)]),
    ),
  };
}

function configBindingProps(
  node: RenderNodePlan,
  context: CanonicalRenderContext,
): Record<string, unknown> {
  const ref = node.kind === 'atom' || node.kind === 'component'
    ? node.propsBinding
    : node.kind === 'page-embed'
      ? node.urlInputsBinding
      : undefined;
  if (!ref) return {};
  const value = context.runtime.resolveConfig(context.plan.unitFqn, ref);
  return isPlainProps(value) ? value : {};
}

function isPlainProps(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function commandListenerProp(node: RenderNodePlan): 'onInput' | 'onChange' | 'onClick' {
  const identity = node.kind === 'atom' && node.library
    ? node.tag.slice(`${node.library}.`.length)
    : node.kind === 'atom'
      ? node.tag
      : undefined;
  if (identity === 'ElInput' || identity === 'input') return 'onInput';
  if (identity === 'ElSelect' || identity === 'select') return 'onChange';
  return 'onClick';
}

function commandInput(node: RenderNodePlan, args: unknown[]): Record<string, unknown> {
  const value = eventValue(args[0]);
  return value === undefined ? { elementId: node.id } : { elementId: node.id, value };
}

function eventValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const target = (value as { target?: unknown }).target;
  if (!target || typeof target !== 'object' || !('value' in target)) return value;
  return (target as { value?: unknown }).value;
}

function resolvePlanValue(
  value: unknown,
  node: RenderNodePlan,
  context: CanonicalRenderContext,
): unknown {
  if (typeof value !== 'string' || !value.includes('://')) return value;
  if (value.startsWith('scope-data-graph://')) {
    const binding = resolveGraphValueBinding(value, node, context.plan, context.runtime);
    return binding ? binding.mounted.graph.get(binding.ref as any) : undefined;
  }
  if (value.startsWith('scope-runtime://') && node.scopeId) {
    const parsed = /^scope-runtime:\/\/#([^/]+)(?:\/(.+))?$/.exec(value);
    let current = context.runtime.resolveScope(context.plan.unitFqn, node.scopeId);
    for (const segment of parsed?.[2]?.split('/').flatMap((part) => part.split('.')) ?? []) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
  return value;
}

function parseGraphRefPath(value: string): GraphRefPath | undefined {
  const parsed = /^scope-data-graph:\/\/#([^/]+)\/(inputs|outputs|state|internals)\.([^/]+)$/.exec(value);
  if (!parsed) return undefined;
  return {
    graphId: parsed[1],
    section: parsed[2] as GraphRefPath['section'],
    key: parsed[3],
  };
}

function resolveGraphValueBinding(
  value: string,
  node: RenderNodePlan,
  plan: UnitRenderPlan,
  runtime: HalfcodeAppRuntime,
): GraphValueBinding | undefined {
  const parsed = parseGraphRefPath(value);
  if (!parsed || !node.scopeId) return undefined;
  const scopeRuntime = runtime.resolveScope(plan.unitFqn, node.scopeId) as {
    graph?<T>(name: string): T | undefined;
  } | undefined;
  const mounted = scopeRuntime?.graph?.<MountedHalfcodeDataGraph>(parsed.graphId);
  const refs = mounted?.refs;
  if (!mounted || !refs) return undefined;
  const section = parsed.section === 'inputs'
    ? refs.inputs
    : parsed.section === 'outputs'
      ? refs.outputs
      : parsed.section === 'state'
        ? refs.state
        : refs.internals;
  const refValue = (section as Record<string, unknown>)[parsed.key];
  return refValue ? { mounted, ref: refValue } : undefined;
}

function collectGraphValueBindings(
  plan: UnitRenderPlan,
  runtime: HalfcodeAppRuntime,
  compositionStack: readonly string[] = [String(plan.unitFqn)],
): GraphValueBinding[] {
  const bindings: GraphValueBinding[] = [];
  const visitValue = (value: unknown, node: RenderNodePlan, ownerPlan: UnitRenderPlan) => {
    if (typeof value !== 'string' || !value.startsWith('scope-data-graph://')) return;
    const binding = resolveGraphValueBinding(value, node, ownerPlan, runtime);
    if (binding) bindings.push(binding);
  };
  const visitNode = (node: RenderNodePlan, ownerPlan: UnitRenderPlan, stack: readonly string[]) => {
    if (node.kind === 'atom' || node.kind === 'component') {
      for (const value of Object.values(node.inlineProps ?? {})) visitValue(value, node, ownerPlan);
    }
    if (node.kind === 'component' || node.kind === 'page-embed') {
      const targetFqn = node.kind === 'component' ? node.fqn : node.pageFqn;
      const targetPlan = runtime.plans.renderPlans.find((candidate) => candidate.unitFqn === targetFqn);
      if (targetPlan && !stack.includes(String(targetPlan.unitFqn))) {
        visitPlan(targetPlan, [...stack, String(targetPlan.unitFqn)]);
      }
    }
    for (const child of node.children ?? []) visitNode(child, ownerPlan, stack);
    for (const slot of node.slots ?? []) {
      for (const child of slot.children) visitNode(child, ownerPlan, stack);
    }
  };
  const visitPlan = (ownerPlan: UnitRenderPlan, stack: readonly string[]) => {
    for (const node of ownerPlan.root) visitNode(node, ownerPlan, stack);
  };
  visitPlan(plan, compositionStack);
  return bindings;
}

export const CanonicalHalfcodeRenderer = defineComponent({
  name: 'CanonicalHalfcodeRenderer',
  props: {
    plan: { type: Object as PropType<UnitRenderPlan>, required: true },
    runtime: { type: Object as PropType<HalfcodeAppRuntime>, required: true },
    registry: { type: Object as PropType<CanonicalComponentRegistry>, required: false },
    revision: { type: Number, required: false, default: 0 },
    onRuntimeUpdated: { type: Function as PropType<() => void>, required: false },
  },
  setup(props) {
    const revision = ref(0);
    let graphStops: Array<() => void> = [];
    const disposeGraphSubscriptions = () => {
      for (const stop of graphStops.splice(0)) stop();
    };
    const triggerRuntimeUpdated = () => {
      revision.value += 1;
      props.onRuntimeUpdated?.();
    };
    vueWatch(
      () => [props.plan, props.runtime] as const,
      () => {
        disposeGraphSubscriptions();
        for (const binding of collectGraphValueBindings(props.plan, props.runtime)) {
          graphStops.push(watchGraph(
            () => binding.mounted.graph.get(binding.ref as any),
            triggerRuntimeUpdated,
          ));
        }
      },
      { immediate: true },
    );
    onScopeDispose(disposeGraphSubscriptions);
    return () => {
      void revision.value;
      void props.revision;
      const context: CanonicalRenderContext = {
        plan: props.plan,
        runtime: props.runtime,
        registry: props.registry,
        compositionStack: [String(props.plan.unitFqn)],
        updated: triggerRuntimeUpdated,
      };
      return renderCanonicalHalfcodeUnit(props.plan, context);
    };
  },
});
