import type {
  SchemaEditorContractRecord,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  compileEditorPlan,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultHalfcodeRuntime,
  createSchemaEditorSession,
  loadHalfcodeAppRuntime,
  lowerEditorPlan,
  resolveUnitConfigRef,
  type HalfcodeAppRuntime,
  type HalfcodeUnitBundleResolver,
  type LoweredEditorPlanSourceBundle,
} from 'dg-cell-mvi-halfcode-support';
import {
  CanonicalHalfcodeRenderer,
  createSchemaEditorPresenterRegistry,
  type CanonicalComponentRegistry,
  type SchemaEditorPresenterAdapter,
  type SchemaEditorPresenterEvent,
  type SchemaEditorPresenterProps,
  type SchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import {
  createElementPlusSchemaEditorCanonicalRegistry,
  type ElementPlusSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';
import {
  createApp,
  h,
  nextTick,
  type App,
  type Component,
  type FunctionalComponent,
} from 'vue';

import {
  createBusinessDialectScopeAssembly,
  createBusinessDialectValueHost,
  type BusinessDialectEditorAssembly,
  type BusinessDialectEditorId,
  type BusinessDialectFactoryArgument,
  type BusinessDialectHostHarness,
} from './boundedContext';
import {
  BUSINESS_DIALECT_PRESENTATIONS,
  BUSINESS_DIALECT_SHARED_SCHEMA,
} from './fixture';
import {
  SHARED_BUSINESS_PROPERTY_CAPABILITIES,
} from './sharedCapsule';

export interface SchemaEditorBusinessDialectEditorRuntime {
  readonly id: BusinessDialectEditorId;
  readonly scopeId: string;
  readonly schema: typeof BUSINESS_DIALECT_SHARED_SCHEMA;
  readonly presentation:
    (typeof BUSINESS_DIALECT_PRESENTATIONS)[keyof typeof BUSINESS_DIALECT_PRESENTATIONS];
  readonly plan: BusinessDialectEditorAssembly['plan'];
  readonly phonePresenterId: string;
  readonly capabilities: Readonly<Record<
    'address' | 'entityRef' | 'enum',
    Readonly<{ transformer: unknown; presenter: unknown }>
  >>;
  readonly presenterRegistry: SchemaEditorPresenterRegistry;
  readonly session: BusinessDialectEditorAssembly['session'];
  readonly sourceBundle: LoweredEditorPlanSourceBundle;
  readonly appRuntime: HalfcodeAppRuntime;
  readonly canonicalRegistry: CanonicalComponentRegistry;
  readonly renderPlan: HalfcodeAppRuntime['plans']['renderPlans'][number];
  readonly diagnostics: readonly string[];
  readonly presenterEvents: readonly SchemaEditorPresenterEvent[];
  readonly host: BusinessDialectHostHarness;
  dispose(): void;
}

export interface SchemaEditorBusinessDialectDemoRuntime {
  readonly schema: typeof BUSINESS_DIALECT_SHARED_SCHEMA;
  readonly presentations: typeof BUSINESS_DIALECT_PRESENTATIONS;
  readonly sharedCapabilities: Readonly<Record<
    'address' | 'entityRef' | 'enum',
    Readonly<{ transformer: unknown; presenter: unknown }>
  >>;
  readonly editors: Readonly<{
    businessA: SchemaEditorBusinessDialectEditorRuntime;
    businessB: SchemaEditorBusinessDialectEditorRuntime;
    businessAOverride: SchemaEditorBusinessDialectEditorRuntime;
  }>;
  dispose(): void;
}

export interface MountedSchemaEditorBusinessDialectEditor
  extends SchemaEditorBusinessDialectEditorRuntime {
  readonly app: App;
  readonly target: Element;
}

export interface MountedSchemaEditorBusinessDialectDemo {
  readonly schema: SchemaEditorBusinessDialectDemoRuntime['schema'];
  readonly presentations: SchemaEditorBusinessDialectDemoRuntime['presentations'];
  readonly sharedCapabilities:
    SchemaEditorBusinessDialectDemoRuntime['sharedCapabilities'];
  readonly editors: Readonly<{
    businessA: MountedSchemaEditorBusinessDialectEditor;
    businessB: MountedSchemaEditorBusinessDialectEditor;
    businessAOverride: MountedSchemaEditorBusinessDialectEditor;
  }>;
  dispose(): void;
}

const EMPTY = Object.freeze({});

export async function createSchemaEditorBusinessDialectDemoRuntime(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): Promise<SchemaEditorBusinessDialectDemoRuntime> {
  const assembly = createBusinessDialectScopeAssembly(EMPTY, EMPTY, EMPTY);
  const created: SchemaEditorBusinessDialectEditorRuntime[] = [];
  try {
    const businessA = await createEditorRuntime(assembly.editors.businessA);
    created.push(businessA);
    const businessB = await createEditorRuntime(assembly.editors.businessB);
    created.push(businessB);
    const businessAOverride = await createEditorRuntime(
      assembly.editors.businessAOverride,
    );
    created.push(businessAOverride);
    let disposed = false;
    return {
      schema: assembly.schema,
      presentations: assembly.presentations,
      sharedCapabilities: projectSharedCapabilities(),
      editors: Object.freeze({
        businessA,
        businessB,
        businessAOverride,
      }),
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const editor of created) editor.dispose();
        assembly.rootRuntime.dispose?.();
      },
    };
  } catch (error) {
    for (const editor of created) editor.dispose();
    for (const editor of Object.values(assembly.editors)) {
      editor.session.dispose();
    }
    assembly.rootRuntime.dispose?.();
    throw error;
  }
}

export async function mountSchemaEditorBusinessDialectDemo(
  target: Element,
): Promise<MountedSchemaEditorBusinessDialectDemo> {
  const runtime = await createSchemaEditorBusinessDialectDemoRuntime(
    EMPTY,
    EMPTY,
    EMPTY,
  );
  const mounted: MountedSchemaEditorBusinessDialectEditor[] = [];
  try {
    const businessA = await mountEditor(
      target,
      runtime.editors.businessA,
    );
    mounted.push(businessA);
    const businessB = await mountEditor(
      target,
      runtime.editors.businessB,
    );
    mounted.push(businessB);
    const businessAOverride = await mountEditor(
      target,
      runtime.editors.businessAOverride,
    );
    mounted.push(businessAOverride);
    let disposed = false;
    return {
      schema: runtime.schema,
      presentations: runtime.presentations,
      sharedCapabilities: runtime.sharedCapabilities,
      editors: Object.freeze({
        businessA,
        businessB,
        businessAOverride,
      }),
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const editor of mounted) editor.app.unmount();
        runtime.dispose();
      },
    };
  } catch (error) {
    for (const editor of mounted) editor.app.unmount();
    runtime.dispose();
    throw error;
  }
}

async function createEditorRuntime(
  assembly: BusinessDialectEditorAssembly,
): Promise<SchemaEditorBusinessDialectEditorRuntime> {
  const plan = compileEditorPlan(
    assembly.compiler,
    {
      schema: assembly.schema,
      presentation: assembly.presentation,
      path: ['user'],
    },
    {},
  );
  const host = createBusinessDialectValueHost(
    EMPTY,
    Object.freeze({ editorId: assembly.id }),
    EMPTY,
  );
  const valueHostId = `${assembly.id}.value-host`;
  const sessionId = `${assembly.id}.session`;
  const session = createSchemaEditorSession(
    Object.freeze({
      kind: 'business-dialect-canonical-session-runtime',
      scopeId: assembly.scopeId,
    }),
    {
      initialSnapshot: {
        value: cloneContractValue(
          assembly.session.getState().snapshot.value as SchemaEditorContractValue,
        ),
        revision: `${assembly.id}.revision.0`,
      },
      valueHost: host,
    },
    {
      sessionId,
      valueHostId,
    },
  );
  const canonicalHostRuntime = createDefaultHalfcodeRuntime(
    `${assembly.id}:canonical-host`,
    assembly.scopeRuntime,
    {
      schemaEditor: {
        valueHosts: { [valueHostId]: host },
        sessions: { [sessionId]: session },
      },
      schemaEditorCompiler: assembly.compiler,
      schemaEditorPresenterRegistry: assembly.presenterRegistry,
    },
  );
  assembly.session.dispose();
  const presenterEvents: SchemaEditorPresenterEvent[] = [];
  const observingRegistry = createObservingRegistry(
    assembly,
    presenterEvents,
  );
  const sourceBundle = lowerEditorPlan(
    EMPTY,
    { plan },
    {
      target: 'halfcode',
      unitFqn: `dg.schemaEditor.${editorUnitName(assembly.id)}`,
      scopeId: assembly.scopeId,
      valueHostId,
      sessionId,
      uiLibrary: 'schemaEditor',
    },
  );
  const appRuntime = await loadHalfcodeAppRuntime(
    createMemoryResolver(sourceBundle.sourceMap),
    sourceBundle.manifestUri,
    {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: [sourceBundle.uiLibrary],
    },
    {
      hostRuntime: canonicalHostRuntime,
      resolveSymbol: () => undefined,
      resolveConfig: (ref, context) => resolveUnitConfigRef(
        context.unit,
        ref,
      ),
    },
  );
  const renderPlan = appRuntime.plans.renderPlans.find(
    (candidate) => String(candidate.unitFqn) === sourceBundle.runtimeUnitFqn,
  );
  const canonical = createElementPlusSchemaEditorCanonicalRegistry(
    Object.freeze({
      presenterRegistries: Object.freeze([
        assembly.presenterRegistry,
        observingRegistry,
      ]),
    }),
    EMPTY,
    Object.freeze({
      presenterConflict: 'last-wins',
      componentIdentity: 'Editor',
    }),
  );
  const diagnostics = collectRuntimeErrors(appRuntime);
  if (!renderPlan) {
    diagnostics.push(`RUNTIME: ${assembly.id} render plan is missing.`);
  }
  if (!canonical.ok) {
    diagnostics.push(...canonical.diagnostics.map(
      ({ code, message }) => `CANONICAL: ${code}: ${message}`,
    ));
  }
  let disposed = false;
  return {
    id: assembly.id,
    scopeId: assembly.scopeId,
    schema: assembly.schema,
    presentation: assembly.presentation,
    plan,
    phonePresenterId: assembly.phonePresenterId,
    capabilities: projectSharedCapabilities(),
    presenterRegistry: canonical.ok
      ? canonical.presenterRegistry
      : assembly.presenterRegistry,
    session,
    sourceBundle,
    appRuntime,
    canonicalRegistry: canonical.ok
      ? canonical.registry
      : Object.freeze({ resolve: () => undefined }),
    renderPlan: renderPlan ?? appRuntime.plans.renderPlans[0]!,
    diagnostics: Object.freeze(diagnostics),
    get presenterEvents() {
      return Object.freeze([...presenterEvents]);
    },
    host,
    dispose() {
      if (disposed) return;
      disposed = true;
      appRuntime.dispose();
      session.dispose();
      canonicalHostRuntime.dispose?.();
      assembly.scopeRuntime.dispose?.();
    },
  };
}

async function mountEditor(
  target: Element,
  runtime: SchemaEditorBusinessDialectEditorRuntime,
): Promise<MountedSchemaEditorBusinessDialectEditor> {
  const editorTarget = document.createElement('section');
  editorTarget.dataset.schemaEditorBusinessId = runtime.id;
  target.appendChild(editorTarget);
  const app = createApp(CanonicalHalfcodeRenderer, {
    plan: runtime.renderPlan,
    runtime: runtime.appRuntime,
    registry: runtime.canonicalRegistry,
  });
  try {
    app.mount(editorTarget);
    await nextTick();
  } catch (error) {
    app.unmount();
    editorTarget.remove();
    throw error;
  }
  const mounted = {
    ...runtime,
    app,
    target: editorTarget,
  };
  Object.defineProperty(mounted, 'presenterEvents', {
    enumerable: true,
    get: () => runtime.presenterEvents,
  });
  return mounted;
}

function createObservingRegistry(
  assembly: BusinessDialectEditorAssembly,
  events: SchemaEditorPresenterEvent[],
): ElementPlusSchemaEditorPresenterRegistry {
  const resolved = assembly.presenterRegistry.resolve(
    assembly.phonePresenterId,
  );
  if (!resolved.ok) {
    throw new Error(resolved.diagnostic.message);
  }
  const component = observePresenterEvents(
    resolved.adapter.component as Component,
    events,
  );
  const result = createSchemaEditorPresenterRegistry<
    SchemaEditorPresenterAdapter<Component>
  >(
    EMPTY,
    Object.freeze({
      entries: Object.freeze([
        Object.freeze({
          id: assembly.phonePresenterId,
          adapter: Object.freeze({ component }),
        }),
      ]),
    }),
    Object.freeze({ duplicate: 'reject' }),
  );
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map(({ message }) => message).join('; '),
    );
  }
  return result.registry;
}

function observePresenterEvents(
  component: Component,
  events: SchemaEditorPresenterEvent[],
): FunctionalComponent<SchemaEditorPresenterProps> {
  const observer: FunctionalComponent<SchemaEditorPresenterProps> = (
    props,
  ) => h(component, {
    ...props,
    onSchemaEditorEvent(event: SchemaEditorPresenterEvent) {
      events.push(snapshotPresenterEvent(event));
      props.onSchemaEditorEvent(event);
    },
  });
  observer.displayName = 'BusinessDialectPresenterEventObserver';
  observer.props = [
    'node',
    'value',
    'path',
    'presenterOptions',
    'pending',
    'diagnostics',
    'eventContext',
    'onSchemaEditorEvent',
  ];
  return observer;
}

function snapshotPresenterEvent(
  event: SchemaEditorPresenterEvent,
): SchemaEditorPresenterEvent {
  return Object.freeze({
    event: event.event,
    payload: cloneContractValue(event.payload),
  });
}

function projectSharedCapabilities() {
  return Object.freeze({
    address: Object.freeze({
      transformer:
        SHARED_BUSINESS_PROPERTY_CAPABILITIES.address.transformer,
      presenter: SHARED_BUSINESS_PROPERTY_CAPABILITIES.address.presenter,
    }),
    entityRef: Object.freeze({
      transformer:
        SHARED_BUSINESS_PROPERTY_CAPABILITIES.entityRef.transformer,
      presenter: SHARED_BUSINESS_PROPERTY_CAPABILITIES.entityRef.presenter,
    }),
    enum: Object.freeze({
      transformer:
        SHARED_BUSINESS_PROPERTY_CAPABILITIES.enum.transformer,
      presenter: SHARED_BUSINESS_PROPERTY_CAPABILITIES.enum.presenter,
    }),
  });
}

function createMemoryResolver(
  sourceMap: Readonly<Record<string, string>>,
): HalfcodeUnitBundleResolver {
  const directories = new Set<string>(['/']);
  for (const path of Object.keys(sourceMap)) {
    const parts = path.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`/${parts.slice(0, index).join('/')}`);
    }
  }
  return {
    readFile: (path) => sourceMap[path] ?? null,
    isDir: (path) => directories.has(path.replace(/\/$/, '') || '/'),
    readDir: (path) => {
      const prefix = `${path.replace(/\/$/, '')}/`;
      const entries = new Set<string>();
      for (const file of Object.keys(sourceMap)) {
        if (file.startsWith(prefix)) {
          entries.add(file.slice(prefix.length).split('/')[0]);
        }
      }
      return entries.size > 0 ? [...entries] : null;
    },
  };
}

function collectRuntimeErrors(runtime: HalfcodeAppRuntime): string[] {
  return [
    ...runtime.bundle.diagnostics
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `LOADER: ${code}: ${message}`),
    ...runtime.plans.diagnostics
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `COMPILER: ${code}: ${message}`),
    ...Object.values(runtime.assemblies)
      .flatMap(({ diagnostics }) => diagnostics)
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `RUNTIME: ${code}: ${message}`),
  ];
}

function editorUnitName(id: BusinessDialectEditorId): string {
  return id
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function cloneContractValue<T extends SchemaEditorContractValue>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneContractValue(item)) as T;
  }
  return Object.fromEntries(
    Object.entries(value as SchemaEditorContractRecord).map(([key, child]) => [
      key,
      cloneContractValue(child as SchemaEditorContractValue),
    ]),
  ) as T;
}
