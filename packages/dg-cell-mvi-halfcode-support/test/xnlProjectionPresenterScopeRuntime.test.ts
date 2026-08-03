import { describe, expect, it } from 'vitest';
import {
  asHalfcodeRef,
  asUnitFqn,
  assembleHalfcodeRuntimeUnit,
  createDefaultHalfcodeRuntime,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterMethodGrant,
  createXnlProjectionPresenterRegistry,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  presentXnlProjection,
  type DefaultHalfcodeRuntimeObject,
  type LoadedHalfcodeUnit,
  type MaterializedCallableEffect,
  type RuntimeScopeAssembly,
  type XnlProjectionPlan,
  type XnlProjectionPresenterCapabilityProtocol,
  type XnlProjectionPresenterCompatibleMethodSourceKey,
  type XnlProjectionPresenterCompatibleSnapshotSourceKey,
  type XnlProjectionPresenterMethodKey,
  type XnlProjectionPresenterSnapshotKey,
  type XnlProjectionRegisteredPresenterAdapter,
  type XnlProjectionSerializableRecord,
} from '../src';

const EMPTY = Object.freeze({});
const PRESENTER_ID = 'presenter.scope-polymorphism';
const SURFACE_ID = 'surface.scope-polymorphism';
const PLAN: XnlProjectionPlan = {
  kind: 'xnl-projection-plan',
  id: 'plan.scope-polymorphism',
  root: {
    id: 'scope-node',
    domain: { path: [], nodeId: 'scope-node', tag: 'Scope' },
    classification: { id: 'xnl.scope' },
    presenter: { id: PRESENTER_ID },
    children: [],
  },
};

type EffectPreview = XnlProjectionSerializableRecord & Readonly<{
  readonly owner: string;
  readonly scopeId: string;
}>;

interface DefaultScopePresenterView {
  readonly scopeId: string;
  readPreview(
    name: string,
    input: Readonly<Record<string, never>>,
    config?: unknown,
  ): Promise<EffectPreview> | EffectPreview;
}

type DefaultScopeHost = Omit<DefaultHalfcodeRuntimeObject, 'callEffect'> & {
  callEffect(
    name: string,
    input: Readonly<Record<string, never>>,
    config?: unknown,
  ): Promise<EffectPreview> | EffectPreview;
};

interface PrivateScopePresenterView {
  inheritedPreview(suffix: string): Readonly<{ value: string }>;
  mixinPreview(): Readonly<{ value: string }>;
  overriddenPreview(): Readonly<{ value: string }>;
}

let grantedAccessorReads = 0;
let ungrantedAccessorReads = 0;

class PrivateScopeBase {
  readonly scopeId: string;
  readonly parent?: PrivateScopeRuntime;
  readonly arbitraryHostAuthority = Object.freeze({ mutate: () => undefined });
  readonly renamedSubmitCapability = () => undefined;
  #lineage: string;

  constructor(scopeId: string, parent?: PrivateScopeRuntime) {
    this.scopeId = scopeId;
    this.parent = parent;
    this.#lineage = parent === undefined
      ? scopeId
      : `${parent.privateStatePreview()}>${scopeId}`;
  }

  inheritedPreview(suffix: string): Readonly<{ value: string }> {
    return { value: `inherited:${this.#lineage}:${suffix}` };
  }

  overriddenPreview(): Readonly<{ value: string }> {
    return { value: `base:${this.#lineage}` };
  }

  privateStatePreview(): string {
    return this.#lineage;
  }

  get accessorMethod(): () => Readonly<{ value: string }> {
    grantedAccessorReads += 1;
    return () => ({ value: 'accessor-must-not-run' });
  }

  get ungrantedAccessorCapability(): object {
    ungrantedAccessorReads += 1;
    throw new Error('ungranted accessor must not be read');
  }
}

class PrivateScopeRuntime extends PrivateScopeBase {
  deriveScope(input: RuntimeScopeAssembly<PrivateScopeRuntime>): PrivateScopeRuntime {
    return new PrivateScopeRuntime(input.scopeId, this);
  }

  override overriddenPreview(): Readonly<{ value: string }> {
    return { value: `override:${this.privateStatePreview()}` };
  }
}

interface PrivateScopeRuntime {
  mixinPreview(): Readonly<{ value: string }>;
}

const scopePreviewMixin = {
  mixinPreview(this: PrivateScopeRuntime): Readonly<{ value: string }> {
    return { value: `mixin:${this.privateStatePreview()}` };
  },
};

Object.defineProperty(PrivateScopeRuntime.prototype, 'mixinPreview', {
  value: scopePreviewMixin.mixinPreview,
  configurable: true,
  writable: true,
});

function effect(owner: string): MaterializedCallableEffect {
  return {
    id: 'preview',
    kind: 'function',
    impl(runtime) {
      if (
        runtime === null
        || typeof runtime !== 'object'
        || !('scopeId' in runtime)
        || typeof runtime.scopeId !== 'string'
      ) {
        throw new TypeError('Expected a DefaultHalfcodeRuntimeObject.');
      }
      return { owner, scopeId: runtime.scopeId } satisfies EffectPreview;
    },
  };
}

function presenterRegistry<TView extends object>(
  adapter: XnlProjectionRegisteredPresenterAdapter<TView>,
) {
  const result = createXnlProjectionPresenterRegistry(
    EMPTY,
    { adapters: [adapter] },
    { duplicate: 'reject' },
  );
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? 'registry failed');
  return result.registry;
}

function methodGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleMethodSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterMethodKey<TView>, string | symbol>,
>(
  id: string,
  sourceKey: TSourceKey,
  facadeKey: TFacadeKey,
) {
  return createXnlProjectionPresenterMethodGrant<THost, TView, TSourceKey, TFacadeKey>(
    EMPTY,
    { id, sourceKey, facadeKey },
    EMPTY,
  );
}

function privateScopeProtocol(
  id: string,
  includeAccessor = false,
): XnlProjectionPresenterCapabilityProtocol<PrivateScopeRuntime, PrivateScopePresenterView> {
  const grants = [
    methodGrant<PrivateScopeRuntime, PrivateScopePresenterView, 'inheritedPreview', 'inheritedPreview'>(`${id}.inherited`, 'inheritedPreview', 'inheritedPreview'),
    methodGrant<PrivateScopeRuntime, PrivateScopePresenterView, 'mixinPreview', 'mixinPreview'>(`${id}.mixin`, 'mixinPreview', 'mixinPreview'),
    methodGrant<PrivateScopeRuntime, PrivateScopePresenterView, 'overriddenPreview', 'overriddenPreview'>(`${id}.override`, 'overriddenPreview', 'overriddenPreview'),
  ];
  if (includeAccessor) {
    type AccessorView = { accessorMethod(): Readonly<{ value: string }> };
    const accessorGrant = methodGrant<
      PrivateScopeRuntime,
      AccessorView,
      'accessorMethod',
      'accessorMethod'
    >(`${id}.accessor`, 'accessorMethod', 'accessorMethod');
    return createXnlProjectionPresenterCapabilityProtocol<PrivateScopeRuntime, AccessorView>(
      EMPTY,
      { id, grants: [accessorGrant] },
      EMPTY,
    ) as unknown as XnlProjectionPresenterCapabilityProtocol<
      PrivateScopeRuntime,
      PrivateScopePresenterView
    >;
  }
  return createXnlProjectionPresenterCapabilityProtocol<
    PrivateScopeRuntime,
    PrivateScopePresenterView
  >(EMPTY, { id, grants }, EMPTY);
}

function runtimeUnit(): LoadedHalfcodeUnit {
  const fqn = asUnitFqn('dg.runtime.PresenterScopePolymorphism');
  return {
    fqn,
    kind: 'page',
    form: 'folder',
    path: '/runtime/presenter-scope-polymorphism',
    manifest: { kind: 'page', fqn, version: '1.0.0', domains: [] },
    domains: {},
    runtime: {
      id: 'presenter-scope-runtime',
      instances: [{
        id: 'private-scope',
        src: asHalfcodeRef('vfs://./runtime.ts#privateScope'),
      }],
    },
    scopeRuntimeBindings: [],
  };
}

describe('XNL Projection Presenter Scope runtime polymorphism', () => {
  it('projects a Default runtime bindScope object without losing nearest effect override', async () => {
    let unrelatedAccessorReads = 0;
    const host = createDefaultHalfcodeRuntime('host', undefined, {
      effects: { preview: effect('host') },
    });
    const root = host.bindScope({
      scopeId: 'root',
      runtime: host,
      bindings: { effects: { preview: effect('root') } },
    });
    const child = root.bindScope({
      scopeId: 'child',
      runtime: root,
      bindings: { effects: { preview: effect('child') } },
    });
    Object.defineProperty(child, 'arbitraryUngrantedAccessor', {
      get() {
        unrelatedAccessorReads += 1;
        throw new Error('ungranted accessor must not be read');
      },
    });

    const projectionSource: DefaultScopeHost = child;
    const scopeIdGrant = createXnlProjectionPresenterSnapshotGrant<
      DefaultScopeHost,
      DefaultScopePresenterView,
      'scopeId',
      'scopeId'
    >(
      EMPTY,
      { id: 'presenter.grant.default-scope-id', sourceKey: 'scopeId', facadeKey: 'scopeId' },
      EMPTY,
    );
    const callEffectGrant = methodGrant<
      DefaultScopeHost,
      DefaultScopePresenterView,
      'callEffect',
      'readPreview'
    >(
      'presenter.grant.default-call-effect',
      'callEffect',
      'readPreview',
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<
      DefaultScopeHost,
      DefaultScopePresenterView
    >(
      EMPTY,
      {
        id: 'presenter.protocol.default-bind-scope',
        grants: [scopeIdGrant, callEffectGrant],
      },
      EMPTY,
    );
    const facet = createXnlProjectionPresenterRuntimeFacet(
      { source: projectionSource, protocol },
      EMPTY,
      EMPTY,
    );
    let observedRuntime: DefaultScopePresenterView | undefined;
    const adapter: XnlProjectionRegisteredPresenterAdapter<DefaultScopePresenterView> = {
      id: PRESENTER_ID,
      surfaceId: SURFACE_ID,
      async present(runtime) {
        observedRuntime = runtime;
        const readPreview = runtime.readPreview;
        const preview = await readPreview(
          'preview',
          EMPTY,
        );
        return { surfaceId: SURFACE_ID, value: { scopeId: runtime.scopeId, preview } };
      },
    };

    const result = await presentXnlProjection(
      { presenterRegistry: presenterRegistry(adapter), presenterRuntime: facet },
      { plan: PLAN },
      { surfaceId: SURFACE_ID },
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        value: {
          scopeId: 'child',
          preview: { owner: 'child', scopeId: 'child' },
        },
      },
    });
    const presenterRuntime = observedRuntime;
    if (presenterRuntime === undefined) throw new Error('Presenter was not called.');
    expect(presenterRuntime).not.toBe(child);
    expect(Object.getPrototypeOf(presenterRuntime)).toBeNull();
    expect(Object.isFrozen(presenterRuntime)).toBe(true);
    expect(Reflect.ownKeys(presenterRuntime).sort()).toEqual(['readPreview', 'scopeId']);
    expect(unrelatedAccessorReads).toBe(0);
  });

  it('preserves class prototype, mixin, private state, inheritance, and override through deriveScope', async () => {
    const sourceRuntime = new PrivateScopeRuntime('host');
    const unit = runtimeUnit();
    const assembly = await assembleHalfcodeRuntimeUnit(unit, {
      scopeRuntimePlans: [
        {
          scopeId: 'root',
          ownerElementId: 'root',
          unitFqn: unit.fqn,
          runtime: asHalfcodeRef('runtime://#private-scope'),
        },
        {
          scopeId: 'child',
          parentScopeId: 'root',
          ownerElementId: 'child',
          unitFqn: unit.fqn,
        },
      ],
      resolveSymbol: () => sourceRuntime,
    });
    const scopeRuntime = assembly.scopeRuntimes.child;
    expect(assembly.diagnostics).toEqual([]);
    expect(scopeRuntime).toBeInstanceOf(PrivateScopeRuntime);
    if (!(scopeRuntime instanceof PrivateScopeRuntime)) {
      throw new TypeError('Expected deriveScope to produce PrivateScopeRuntime.');
    }
    expect(scopeRuntime.parent).toBe(assembly.scopeRuntimes.root);

    const protocol = privateScopeProtocol('presenter.protocol.private-derived-scope');
    const facet = createXnlProjectionPresenterRuntimeFacet(
      { source: scopeRuntime, protocol },
      EMPTY,
      EMPTY,
    );
    let observedRuntime: PrivateScopePresenterView | undefined;
    const adapter: XnlProjectionRegisteredPresenterAdapter<PrivateScopePresenterView> = {
      id: PRESENTER_ID,
      surfaceId: SURFACE_ID,
      present(runtime) {
        observedRuntime = runtime;
        const inheritedPreview = runtime.inheritedPreview;
        const mixinPreview = runtime.mixinPreview;
        const overriddenPreview = runtime.overriddenPreview;
        return {
          surfaceId: SURFACE_ID,
          value: {
            inherited: inheritedPreview('presenter').value,
            mixed: mixinPreview().value,
            overridden: overriddenPreview().value,
          },
        };
      },
    };

    const result = await presentXnlProjection(
      { presenterRegistry: presenterRegistry(adapter), presenterRuntime: facet },
      { plan: PLAN },
      { surfaceId: SURFACE_ID },
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        value: {
          inherited: 'inherited:host>root>child:presenter',
          mixed: 'mixin:host>root>child',
          overridden: 'override:host>root>child',
        },
      },
    });
    const presenterRuntime = observedRuntime;
    if (presenterRuntime === undefined) throw new Error('Presenter was not called.');
    expect(presenterRuntime).not.toBe(scopeRuntime);
    expect(Object.getPrototypeOf(presenterRuntime)).toBeNull();
    expect(Object.isFrozen(presenterRuntime)).toBe(true);
    expect(Reflect.ownKeys(presenterRuntime).sort()).toEqual([
      'inheritedPreview',
      'mixinPreview',
      'overriddenPreview',
    ]);
    expect(ungrantedAccessorReads).toBe(0);
  });

  it('rejects a granted accessor on a deriveScope output without invoking its getter', async () => {
    grantedAccessorReads = 0;
    const unit = runtimeUnit();
    const assembly = await assembleHalfcodeRuntimeUnit(unit, {
      scopeRuntimePlans: [{
        scopeId: 'root',
        ownerElementId: 'root',
        unitFqn: unit.fqn,
        runtime: asHalfcodeRef('runtime://#private-scope'),
      }],
      resolveSymbol: () => new PrivateScopeRuntime('host'),
    });
    const scopeRuntime = assembly.scopeRuntimes.root;
    expect(scopeRuntime).toBeInstanceOf(PrivateScopeRuntime);
    if (!(scopeRuntime instanceof PrivateScopeRuntime)) {
      throw new TypeError('Expected deriveScope to produce PrivateScopeRuntime.');
    }
    const protocol = privateScopeProtocol('presenter.protocol.accessor-negative', true);

    expect(() => createXnlProjectionPresenterRuntimeFacet(
      { source: scopeRuntime, protocol },
      EMPTY,
      EMPTY,
    )).toThrow(/must not target an accessor/i);
    expect(grantedAccessorReads).toBe(0);
  });
});
