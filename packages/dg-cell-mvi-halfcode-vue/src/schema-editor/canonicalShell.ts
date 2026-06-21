import {
  defineComponent,
  h,
  type Component,
  type PropType,
} from 'vue';
import {
  validateEditorPlan,
  type EditorPlan,
} from 'dg-cell-mvi-halfcode-contract';
import {
  resolveSchemaEditorScopeBridge,
  type SchemaEditorSession,
} from 'dg-cell-mvi-halfcode-support';

import type {
  CanonicalComponentRegistry,
  CanonicalComponentResolutionContext,
} from '../canonicalRenderer';
import type {
  SchemaEditorCanonicalRegistryConfig,
  SchemaEditorCanonicalRegistryDiagnostic,
  SchemaEditorCanonicalRegistryInput,
  SchemaEditorCanonicalRegistryResult,
  SchemaEditorCanonicalRegistryRuntime,
  SchemaEditorPresenterRegistry,
} from './contracts';
import { SchemaEditorSessionRenderer } from './sessionRenderer';

export function createSchemaEditorCanonicalRegistry(
  runtime: SchemaEditorCanonicalRegistryRuntime,
  input: SchemaEditorCanonicalRegistryInput,
  config: SchemaEditorCanonicalRegistryConfig,
): SchemaEditorCanonicalRegistryResult {
  const runtimeRecord = readRecord(runtime);
  const inputRecord = readRecord(input);
  const configRecord = readRecord(config);
  const presenterRegistry = runtimeRecord?.get('presenterRegistry');
  const parentRegistry = inputRecord?.get('parentRegistry');
  const componentIdentity = configRecord?.get('componentIdentity');
  const parentResolve = parentRegistry === undefined
    ? undefined
    : readCanonicalResolve(parentRegistry);

  if (
    !runtimeRecord
    || !inputRecord
    || !configRecord
    || !isPresenterRegistry(presenterRegistry)
    || (
      parentRegistry !== undefined
      && !parentResolve
    )
    || typeof componentIdentity !== 'string'
    || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(componentIdentity)
  ) {
    return failure(
      'INVALID_SCHEMA_EDITOR_CANONICAL_REGISTRY_INPUT',
      'Canonical Schema Editor registry requires own-data presenter, parent and component identity inputs.',
    );
  }

  const componentCache = new WeakMap<
    object,
    WeakMap<object, WeakMap<object, Component>>
  >();
  const registry: CanonicalComponentRegistry = Object.freeze({
    resolve(
      name: unknown,
      context?: CanonicalComponentResolutionContext,
    ): unknown {
      if (name !== componentIdentity) {
        if (!parentResolve) return undefined;
        try {
          return parentResolve.call(parentRegistry, name, context);
        } catch {
          return undefined;
        }
      }
      const resolutionContext = readResolutionContext(context);
      if (!resolutionContext) {
        return undefined;
      }
      let byPlan = componentCache.get(resolutionContext.runtime);
      if (!byPlan) {
        byPlan = new WeakMap();
        componentCache.set(resolutionContext.runtime, byPlan);
      }
      let byNode = byPlan.get(resolutionContext.plan);
      if (!byNode) {
        byNode = new WeakMap();
        byPlan.set(resolutionContext.plan, byNode);
      }
      const cached = byNode.get(resolutionContext.node);
      if (cached) return cached;
      const component = createContextBoundShell(
        resolutionContext,
        presenterRegistry,
      );
      byNode.set(resolutionContext.node, component);
      return component;
    },
  });

  return Object.freeze({
    ok: true,
    registry,
    diagnostics: EMPTY_CANONICAL_DIAGNOSTICS,
  });
}

function createContextBoundShell(
  context: CanonicalComponentResolutionContext,
  presenterRegistry: SchemaEditorPresenterRegistry,
): Component {
  return defineComponent({
    name: 'CanonicalSchemaEditorShell',
    props: {
      plan: {
        type: Object as PropType<EditorPlan>,
        required: true,
      },
      scopeBridge: {
        type: Object as PropType<Readonly<{
          valueHostId: string;
          sessionId: string;
        }>>,
        required: true,
      },
      uiLibrary: {
        type: String,
        required: true,
      },
    },
    setup(props) {
      return () => {
        const planValidation = validateEditorPlan(props.plan);
        const scopeId = context.node.scopeId;
        const scopeRuntime = scopeId
          ? context.runtime.resolveScope(context.plan.unitFqn, scopeId)
          : undefined;
        const bridge = resolveSchemaEditorScopeBridge(
          scopeRuntime ?? {},
          Object.freeze({}),
          props.scopeBridge,
        );
        if (
          props.uiLibrary !== 'schemaEditor'
          || !planValidation.ok
          || !bridge
          || !isSchemaEditorSession(bridge.session)
        ) {
          return h('div', {
            'data-schema-editor-error': 'SCHEMA_EDITOR_CANONICAL_SHELL_UNRESOLVED',
          });
        }
        return h(SchemaEditorSessionRenderer, {
          session: bridge.session,
          node: props.plan.root,
          presenterRegistry,
          keyPrefix: `${String(context.plan.unitFqn)}:${context.node.id}`,
        });
      };
    },
  });
}

function isPresenterRegistry(value: unknown): value is SchemaEditorPresenterRegistry {
  return typeof readRecord(value)?.get('resolve') === 'function';
}

function readCanonicalResolve(
  value: unknown,
): CanonicalComponentRegistry['resolve'] | undefined {
  const resolve = readRecord(value)?.get('resolve');
  return typeof resolve === 'function'
    ? resolve as CanonicalComponentRegistry['resolve']
    : undefined;
}

function readResolutionContext(
  value: unknown,
): CanonicalComponentResolutionContext | undefined {
  const record = readRecord(value);
  const runtime = record?.get('runtime');
  const plan = record?.get('plan');
  const node = record?.get('node');
  if (!isObject(runtime) || !isObject(plan) || !isObject(node)) {
    return undefined;
  }
  return Object.freeze({
    runtime: runtime as CanonicalComponentResolutionContext['runtime'],
    plan: plan as CanonicalComponentResolutionContext['plan'],
    node: node as CanonicalComponentResolutionContext['node'],
  });
}

function isSchemaEditorSession(value: unknown): value is SchemaEditorSession {
  const record = readRecord(value);
  return typeof record?.get('getState') === 'function'
    && typeof record.get('subscribe') === 'function'
    && typeof record.get('dispatch') === 'function';
}

function readRecord(value: unknown): ReadonlyMap<string, unknown> | undefined {
  if (!isObject(value) || isArraySafely(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = new Map<string, unknown>();
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return undefined;
      result.set(key, descriptor.value);
    }
    return result;
  } catch {
    return undefined;
  }
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

function failure(
  code: SchemaEditorCanonicalRegistryDiagnostic['code'],
  message: string,
): SchemaEditorCanonicalRegistryResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([Object.freeze({ code, message })]),
  });
}

const EMPTY_CANONICAL_DIAGNOSTICS = Object.freeze([]) as readonly [];
