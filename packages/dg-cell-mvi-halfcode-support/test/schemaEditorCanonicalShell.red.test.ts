import { describe, expect, it } from 'vitest';
import type { ImportResolver } from 'xnl-core';
import {
  compileEditorPlan,
  compileHalfcodeUnitBundle,
  createSchemaEditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultHalfcodeRuntime,
  loadHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  resolveSchemaEditorScopeBridge,
  resolveUnitConfigRef,
  type DefaultHalfcodeRuntimeObject,
  type EditorPlan,
  type HalfcodeAppRuntime,
  type LowerEditorPlanConfig,
  type LowerEditorPlanInput,
  type LoweredEditorPlanSourceBundle,
  type RenderNodePlan,
} from '../src';

type LowerEditorPlan = (
  runtime: unknown,
  input: LowerEditorPlanInput,
  config: LowerEditorPlanConfig,
) => LoweredEditorPlanSourceBundle;

const support = await import('../src') as unknown as Record<string, unknown>;
const lowerEditorPlan =
  typeof support.lowerEditorPlan === 'function'
    ? support.lowerEditorPlan as LowerEditorPlan
    : undefined;
const loweringAvailable = lowerEditorPlan !== undefined;

const CONFIG = deepFreeze<LowerEditorPlanConfig>({
  target: 'halfcode',
  unitFqn: 'dg.schemaEditor.ProfileEditor',
  scopeId: 'profile-editor-scope',
  valueHostId: 'profile-value-host',
  sessionId: 'profile-editor-session',
  uiLibrary: 'schemaEditor',
});

const PLAN = deepFreeze(compileEditorPlan(
  createSchemaEditorCompilerRuntime(),
  {
    schema: {
      kind: 'object',
      id: 'profile',
      label: 'Profile',
      required: ['name'],
      fields: [
        {
          key: 'name',
          schema: {
            kind: 'scalar',
            id: 'profile.name',
            label: 'Display name',
            scalar: 'string',
            constraints: { minLength: 1 },
          },
        },
        {
          key: 'contacts',
          schema: {
            kind: 'array',
            id: 'profile.contacts',
            identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
            itemDefault: { id: 'new-contact', label: '' },
            item: {
              kind: 'object',
              id: 'profile.contact',
              fields: [{
                key: 'label',
                schema: { kind: 'scalar', id: 'profile.contact.label', scalar: 'string' },
              }],
            },
          },
        },
      ],
    },
    presentation: {
      presenter: { id: 'profile.form', explicit: true },
      children: {
        name: { presenter: { id: 'text.input', explicit: true } },
        contacts: {
          presenter: { id: 'collection.list', explicit: true },
          item: { presenter: { id: 'contact.row', explicit: true } },
        },
      },
    },
  },
  { planId: 'profile.editor' },
));

const LOWERING_RUNTIME = deepFreeze({
  acceptedSnapshot: { marker: 'accepted-snapshot-implementation' },
  callback: () => 'callback-implementation',
  componentImplementation: { marker: 'component-implementation' },
  presenterImplementation: { marker: 'presenter-implementation' },
  rendererImplementation: { marker: 'renderer-implementation' },
  hostWriter: { marker: 'host-writer-implementation' },
  globalRegistry: { marker: 'global-registry-implementation' },
});

function memorySourceResolver(sourceMap: Readonly<Record<string, string>>): ImportResolver {
  const directories = new Set<string>(['/']);
  for (const filePath of Object.keys(sourceMap)) {
    const parts = filePath.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`/${parts.slice(0, index).join('/')}`);
    }
  }

  return {
    readFile: (filePath) => sourceMap[filePath] ?? null,
    isDir: (filePath) => directories.has(filePath.replace(/\/$/, '') || '/'),
    readDir: (directoryPath) => {
      const prefix = `${directoryPath.replace(/\/$/, '')}/`;
      const entries = new Set<string>();
      for (const filePath of Object.keys(sourceMap)) {
        if (filePath.startsWith(prefix)) {
          entries.add(filePath.slice(prefix.length).split('/')[0]);
        }
      }
      return entries.size > 0 ? [...entries] : null;
    },
  };
}

function minimalCanonicalShellSources(): Readonly<Record<string, string>> {
  return {
    '/canonical-red/manifest.xnl': `<AppBundle #dg.schemaEditor.RedApp apiVersion="halfcode.dg-cell-mvi/v1" version="1" (
      <Units [
        <Unit kind="page" fqn="dg.schemaEditor.RedPage" src="vfs://./editor/manifest.xnl">
      ]>
    )>`,
    '/canonical-red/editor/manifest.xnl': '<Page #dg.schemaEditor.RedPage version="1">',
    '/canonical-red/editor/config.xnl': `<Config #schema-editor-config [
      <ConfigEntry #schema-editor-shell {
        plan = { kind = "editor-plan" id = "loader-probe" }
        scopeBridge = { valueHostId = "probe-host" sessionId = "probe-session" }
        uiLibrary = "schemaEditor"
      }>
    ]>`,
    '/canonical-red/editor/elements.xnl': `<Elements #schema-editor-elements (
      <Scope ref="probe-scope">
    ) [
      <schemaEditor.Editor #schema-editor-shell { props = "config://#schema-editor-shell" }>
    ]>`,
    '/canonical-red/editor/scopes.xnl': `<Scopes #schema-editor-scopes [
      <Scope #probe-scope { config = "config://#schema-editor-shell" }>
    ]>`,
  };
}

function lower(
  plan: EditorPlan = PLAN,
  runtime: unknown = LOWERING_RUNTIME,
  config: LowerEditorPlanConfig = CONFIG,
): LoweredEditorPlanSourceBundle {
  return lowerEditorPlan!(runtime, { plan }, config);
}

async function exerciseRealLifecycle(
  sourceBundle: Pick<
    LoweredEditorPlanSourceBundle,
    'manifestUri' | 'sourceMap' | 'uiLibrary'
  >,
  hostRuntime?: unknown,
  sourceMap: Readonly<Record<string, string>> = sourceBundle.sourceMap,
) {
  const resolver = memorySourceResolver(sourceMap);
  const loadOptions = {
    baseDir: '/',
    workspaceRoot: '/',
    uiLibraries: [sourceBundle.uiLibrary],
  };
  const loaded = loadHalfcodeUnitBundle(resolver, sourceBundle.manifestUri, loadOptions);
  const compiled = compileHalfcodeUnitBundle(loaded);
  const appRuntime = await loadHalfcodeAppRuntime(
    resolver,
    sourceBundle.manifestUri,
    loadOptions,
    {
      hostRuntime,
      resolveSymbol: () => undefined,
      resolveConfig: (ref, context) => resolveUnitConfigRef(context.unit, ref),
    },
  );
  return { loaded, compiled, appRuntime };
}

function shellNode(
  appRuntime: HalfcodeAppRuntime,
  config: LowerEditorPlanConfig = CONFIG,
): RenderNodePlan {
  const renderPlan = appRuntime.plans.renderPlans.find(
    (candidate) => String(candidate.unitFqn) === config.unitFqn,
  );
  expect(renderPlan, `missing render plan for ${config.unitFqn}`).toBeDefined();
  expect(renderPlan?.root).toHaveLength(1);
  return renderPlan!.root[0];
}

function shellConfig(
  appRuntime: HalfcodeAppRuntime,
  config: LowerEditorPlanConfig = CONFIG,
): {
  readonly plan: EditorPlan;
  readonly scopeBridge: { readonly valueHostId: string; readonly sessionId: string };
  readonly uiLibrary: string;
} {
  const shell = shellNode(appRuntime, config);
  expect(shell.kind).toBe('atom');
  if (shell.kind !== 'atom' || !shell.propsBinding) {
    throw new Error('Canonical schema-editor shell must expose one atom props binding.');
  }
  return appRuntime.resolveConfig(config.unitFqn, shell.propsBinding) as ReturnType<typeof shellConfig>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('Schema Editor canonical shell T3.1 loader baseline', () => {
  it('accepts the minimal shell XNL through the real memory resolver, loader, compiler, and app runtime', async () => {
    const sourceMap = minimalCanonicalShellSources();
    const sourceBundle: Pick<
      LoweredEditorPlanSourceBundle,
      'manifestUri' | 'sourceMap' | 'uiLibrary'
    > = {
      manifestUri: 'vfs://@/canonical-red/',
      sourceMap,
      uiLibrary: 'schemaEditor',
    };

    const { loaded, compiled, appRuntime } = await exerciseRealLifecycle(sourceBundle);

    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(appRuntime.bundle.manifestPath).toBe('/canonical-red/manifest.xnl');
    expect(appRuntime.plans.renderPlans[0]?.root).toEqual([
      expect.objectContaining({
        kind: 'atom',
        tag: 'schemaEditor.Editor',
        library: 'schemaEditor',
        propsBinding: 'config://#schema-editor-shell',
      }),
    ]);
    expect(appRuntime.resolveConfig('dg.schemaEditor.RedPage', 'config://#schema-editor-shell'))
      .toMatchObject({
        plan: { kind: 'editor-plan', id: 'loader-probe' },
        scopeBridge: { valueHostId: 'probe-host', sessionId: 'probe-session' },
        uiLibrary: 'schemaEditor',
      });
    appRuntime.dispose();
  });
});

describe('Schema Editor canonical shell T3.1 public surface', () => {
  it('exports lowerEditorPlan as a three-parameter support Processor', () => {
    expect(
      support.lowerEditorPlan,
      'support root must export lowerEditorPlan after the real canonical loader baseline is proven',
    ).toBeTypeOf('function');
    expect(support.lowerEditorPlan).toHaveLength(3);
  });
});

describe.runIf(loweringAvailable)('Schema Editor canonical shell T3.1 lowering lifecycle', () => {
  it('returns deterministic serializable manifest/source/UI-library material without mutating inputs', () => {
    const plan = structuredClone(PLAN);
    const config = structuredClone(CONFIG);
    const beforePlan = structuredClone(plan);
    const beforeConfig = structuredClone(config);

    const first = lower(plan, LOWERING_RUNTIME, config);
    const second = lower(plan, LOWERING_RUNTIME, config);

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.manifestUri).toMatch(/^vfs:\/\/@\//);
    expect(Object.keys(first.sourceMap).sort()).toEqual(Object.keys(second.sourceMap).sort());
    expect(first.uiLibrary).toBe(CONFIG.uiLibrary);
    expect(plan).toEqual(beforePlan);
    expect(config).toEqual(beforeConfig);
  });

  it('fails closed when config names a UI library other than the canonical schemaEditor namespace', () => {
    const unsafeConfig = {
      ...CONFIG,
      uiLibrary: 'elementPlus',
    } as unknown as LowerEditorPlanConfig;

    expect(() => lower(PLAN, LOWERING_RUNTIME, unsafeConfig)).toThrow(/uiLibrary|schemaEditor/);
  });

  it.each([
    '1dg.schemaEditor.ProfileEditor',
    'dg..ProfileEditor',
    'dg.schemaEditor.Profile-Editor',
    'dg.schemaEditor.Profile:Editor',
    'dg/schemaEditor/ProfileEditor',
    'dg.schemaEditor.ProfileEditor#other',
  ])('fails closed before rendering malformed Unit FQN %j', (unitFqn) => {
    expect(() => lower(PLAN, LOWERING_RUNTIME, {
      ...CONFIG,
      unitFqn,
    })).toThrow(/unitFqn|Unit FQN|identifier/);
  });

  it.each([
    '1profile-scope',
    'profile.scope',
    'profile:scope',
    'profile/scope',
    'profile#scope',
    '$profile-scope',
  ])('fails closed before rendering malformed Scope identifier %j', (scopeId) => {
    expect(() => lower(PLAN, LOWERING_RUNTIME, {
      ...CONFIG,
      scopeId,
    })).toThrow(/scopeId|identifier/);
  });

  it('accepts Scope ids through the real XNL #marker grammar', async () => {
    const markerConfig = deepFreeze<LowerEditorPlanConfig>({
      ...CONFIG,
      scopeId: '_profile-editor-scope',
    });
    const { loaded, compiled, appRuntime } = await exerciseRealLifecycle(
      lower(PLAN, LOWERING_RUNTIME, markerConfig),
    );

    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(shellNode(appRuntime, markerConfig)).toMatchObject({
      kind: 'atom',
      scopeId: markerConfig.scopeId,
    });
    appRuntime.dispose();
  });

  it('accepts a canonical Unit FQN independently of XNL marker syntax and safely encodes source identity', async () => {
    const canonicalDollarConfig = deepFreeze<LowerEditorPlanConfig>({
      ...CONFIG,
      unitFqn: 'dg.schemaEditor.$ProfileEditor',
    });
    const sourceBundle = lower(PLAN, LOWERING_RUNTIME, canonicalDollarConfig);

    expect(sourceBundle.manifestUri).toContain('/%24ProfileEditor/');
    expect(Object.keys(sourceBundle.sourceMap).every((path) => !path.includes('$'))).toBe(true);
    expect(sourceBundle.logicalUnitFqn).toBe('dg.schemaEditor.$ProfileEditor');
    expect(sourceBundle.runtimeUnitFqn).toBe('dg.schemaEditor._dProfileEditor');
    const underscoreBundle = lower(PLAN, LOWERING_RUNTIME, {
      ...canonicalDollarConfig,
      unitFqn: 'dg.schemaEditor._dProfileEditor',
    });
    expect(underscoreBundle.runtimeUnitFqn).toBe('dg.schemaEditor.__dProfileEditor');
    expect(underscoreBundle.runtimeUnitFqn).not.toBe(sourceBundle.runtimeUnitFqn);
    expect(underscoreBundle.manifestUri).not.toBe(sourceBundle.manifestUri);
    const manifest = sourceBundle.sourceMap[
      Object.keys(sourceBundle.sourceMap).find((path) => path.endsWith('/manifest.xnl'))!
    ];
    expect(manifest).toContain('fqn = "dg.schemaEditor._dProfileEditor"');
    expect(manifest).toContain('#dg.schemaEditor._dProfileEditor.SchemaEditorApp');

    const { loaded, compiled, appRuntime } = await exerciseRealLifecycle(sourceBundle);
    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(appRuntime.bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'))
      .toEqual([]);
    expect(appRuntime.plans.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'))
      .toEqual([]);
    expect(shellNode(appRuntime, {
      ...canonicalDollarConfig,
      unitFqn: sourceBundle.runtimeUnitFqn,
    })).toMatchObject({
      kind: 'atom',
      tag: 'schemaEditor.Editor',
    });
    appRuntime.dispose();
  });

  it('derives collision-free source and AppBundle identities for two bundles in one memory VFS', async () => {
    const alternateConfig = deepFreeze<LowerEditorPlanConfig>({
      ...CONFIG,
      unitFqn: 'dg.schemaEditor.SettingsEditor',
      scopeId: 'settings-editor-scope',
      valueHostId: 'settings-value-host',
      sessionId: 'settings-editor-session',
    });
    const profileBundle = lower();
    const settingsBundle = lower(PLAN, LOWERING_RUNTIME, alternateConfig);
    const profilePaths = Object.keys(profileBundle.sourceMap);
    const settingsPaths = Object.keys(settingsBundle.sourceMap);
    const combinedSourceMap = {
      ...profileBundle.sourceMap,
      ...settingsBundle.sourceMap,
    };

    expect(profileBundle.manifestUri).not.toBe(settingsBundle.manifestUri);
    expect(profilePaths.filter((path) => settingsPaths.includes(path))).toEqual([]);
    expect(Object.keys(combinedSourceMap)).toHaveLength(profilePaths.length + settingsPaths.length);
    expect(combinedSourceMap[profilePaths.find((path) => path.endsWith('/manifest.xnl'))!])
      .toContain('#dg.schemaEditor.ProfileEditor.SchemaEditorApp');
    expect(combinedSourceMap[settingsPaths.find((path) => path.endsWith('/manifest.xnl'))!])
      .toContain('#dg.schemaEditor.SettingsEditor.SchemaEditorApp');

    const profileLifecycle = await exerciseRealLifecycle(
      profileBundle,
      undefined,
      combinedSourceMap,
    );
    const settingsLifecycle = await exerciseRealLifecycle(
      settingsBundle,
      undefined,
      combinedSourceMap,
    );

    for (const lifecycle of [profileLifecycle, settingsLifecycle]) {
      expect(lifecycle.loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'))
        .toEqual([]);
      expect(lifecycle.compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'))
        .toEqual([]);
      expect(lifecycle.appRuntime.bundle.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error',
      )).toEqual([]);
      expect(lifecycle.appRuntime.plans.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error',
      )).toEqual([]);
    }
    expect(shellNode(profileLifecycle.appRuntime, CONFIG)).toMatchObject({
      kind: 'atom',
      tag: 'schemaEditor.Editor',
    });
    expect(shellNode(settingsLifecycle.appRuntime, alternateConfig)).toMatchObject({
      kind: 'atom',
      tag: 'schemaEditor.Editor',
    });
    expect(shellConfig(profileLifecycle.appRuntime, CONFIG).scopeBridge).toEqual({
      valueHostId: CONFIG.valueHostId,
      sessionId: CONFIG.sessionId,
    });
    expect(shellConfig(settingsLifecycle.appRuntime, alternateConfig).scopeBridge).toEqual({
      valueHostId: alternateConfig.valueHostId,
      sessionId: alternateConfig.sessionId,
    });
    profileLifecycle.appRuntime.dispose();
    settingsLifecycle.appRuntime.dispose();
  });

  it('loads generated sources through the real loader, compiler, and app runtime with zero errors', async () => {
    const { loaded, compiled, appRuntime } = await exerciseRealLifecycle(lower());

    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(appRuntime.bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(appRuntime.plans.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(appRuntime.bundle.manifestPath).toMatch(/manifest\.xnl$/);
    appRuntime.dispose();
  });

  it('compiles exactly one canonical schemaEditor.Editor atom with stable Scope and UI-library identity', async () => {
    const { appRuntime } = await exerciseRealLifecycle(lower());
    const shell = shellNode(appRuntime);

    expect(appRuntime.plans.renderPlans).toHaveLength(1);
    expect(shell).toMatchObject({
      kind: 'atom',
      tag: 'schemaEditor.Editor',
      library: CONFIG.uiLibrary,
      scopeId: CONFIG.scopeId,
      propsBinding: expect.stringMatching(/^config:\/\/#/),
    });
    expect(shell.children).toBeUndefined();
    expect(shell.slots).toBeUndefined();
    appRuntime.dispose();
  });

  it('round-trips the complete EditorPlan and stable runtime/session ids from runtime config', async () => {
    const { appRuntime } = await exerciseRealLifecycle(lower());

    expect(shellConfig(appRuntime)).toEqual({
      plan: PLAN,
      scopeBridge: {
        valueHostId: CONFIG.valueHostId,
        sessionId: CONFIG.sessionId,
      },
      uiLibrary: CONFIG.uiLibrary,
    });
    appRuntime.dispose();
  });

  it('resolves the configured Scope bridge without capturing ValueHost or session implementations', async () => {
    const valueHost = () => Promise.resolve({ status: 'rejected' as const });
    const session = Object.freeze({ id: 'runtime-session' });
    const hostRuntime = createDefaultHalfcodeRuntime('schema-editor-host', undefined, {
      schemaEditor: {
        valueHosts: { [CONFIG.valueHostId]: valueHost },
        sessions: { [CONFIG.sessionId]: session },
      },
    });
    const { appRuntime } = await exerciseRealLifecycle(lower(), hostRuntime);
    const config = shellConfig(appRuntime);
    const scopeRuntime = appRuntime.resolveScope(CONFIG.unitFqn, CONFIG.scopeId);

    expect(config.scopeBridge).toEqual({
      valueHostId: CONFIG.valueHostId,
      sessionId: CONFIG.sessionId,
    });
    expect(resolveSchemaEditorScopeBridge(scopeRuntime as DefaultHalfcodeRuntimeObject, {}, config.scopeBridge))
      .toEqual({
        valueHostId: CONFIG.valueHostId,
        sessionId: CONFIG.sessionId,
        valueHost,
        session,
      });
    expect(config.scopeBridge).not.toHaveProperty('valueHost');
    expect(config.scopeBridge).not.toHaveProperty('session');
    appRuntime.dispose();
  });

  it('does not emit accepted state or renderer, presenter, callback, writer, or registry implementations', () => {
    const sourceBundle = lower();
    const serialized = JSON.stringify(sourceBundle);

    for (const forbidden of [
      'accepted-snapshot-implementation',
      'callback-implementation',
      'component-implementation',
      'presenter-implementation',
      'renderer-implementation',
      'host-writer-implementation',
      'global-registry-implementation',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain('acceptedSnapshot');
    expect(JSON.parse(serialized)).toEqual(sourceBundle);
  });

  it('fails closed on accessor-backed or hostile plan/config input without executing accessors', () => {
    let planReads = 0;
    const accessorPlan = Object.defineProperty({}, 'kind', {
      enumerable: true,
      get() {
        planReads += 1;
        return 'editor-plan';
      },
    }) as EditorPlan;
    let configReads = 0;
    const accessorConfig = Object.defineProperties(structuredClone(CONFIG), {
      sessionId: {
        enumerable: true,
        get() {
          configReads += 1;
          return CONFIG.sessionId;
        },
      },
    }) as LowerEditorPlanConfig;
    const hostilePlan = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('hostile plan reflection');
      },
    }) as EditorPlan;

    expect(() => lower(accessorPlan)).toThrow();
    expect(() => lower(PLAN, LOWERING_RUNTIME, accessorConfig)).toThrow();
    expect(() => lower(hostilePlan)).toThrow();
    expect(planReads).toBe(0);
    expect(configReads).toBe(0);
  });

  it('keeps the real app-runtime lifecycle idempotently dispose-safe', async () => {
    const { appRuntime } = await exerciseRealLifecycle(lower());
    const scope = appRuntime.resolveScope(CONFIG.unitFqn, CONFIG.scopeId);

    expect(scope).toBeDefined();
    expect(() => appRuntime.dispose()).not.toThrow();
    expect(() => appRuntime.dispose()).not.toThrow();
    expect(() => appRuntime.resolveScope(CONFIG.unitFqn, CONFIG.scopeId)).not.toThrow();
  });
});
