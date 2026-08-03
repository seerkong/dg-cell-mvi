import { describe, expect, it } from 'vitest';
import { parseXnl, type XnlNode } from 'xnl-core';
import type {
  XnlProjectionPresenterCapabilityProtocol,
  XnlProjectionPresenterMethodKey,
  XnlProjectionPresenterReadonlyView,
  XnlProjectionPresenterSnapshotKey,
} from 'dg-cell-mvi-halfcode-contract';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  type XnlProjectionPlan,
  type XnlProjectionPresentation,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-logic';
import {
  composeXnlProjectionPresenterRegistries,
  createDefaultXnlProjectionDialect,
  createXnlProjectionInspectionPresenterAdapter,
  createXnlProjectionOutlinePresenterAdapter,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterMethodGrant,
  createXnlProjectionPresenterRegistry,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  createXnlProjectionRootInput,
  presentXnlProjection,
  XNL_PROJECTION_INSPECTION_SURFACE_ID,
  XNL_PROJECTION_OUTLINE_SURFACE_ID,
  type XnlProjectionPresentationRunnerInput,
  type XnlProjectionPresentationRunnerRuntime,
  type CreateXnlProjectionPresenterCapabilityProtocolInput,
  type CreateXnlProjectionPresenterMethodGrantInput,
  type CreateXnlProjectionPresenterSnapshotGrantInput,
  type XnlProjectionPresenterRuntimeFacet,
  type XnlProjectionPresenterCompatibleMethodSourceKey,
  type XnlProjectionPresenterCompatibleSnapshotSourceKey,
  type XnlProjectionPresenterRegistry,
  type XnlProjectionRegisteredPresenterAdapter,
} from '../src';

const EMPTY = Object.freeze({});
const NEUTRAL_PRESENTER_ID = 'neutral.presenter.node';
const FACADE_BOUNDARY_SURFACE_ID = 'neutral.surface.facade-boundary';

type FacadeGrantKey = string | symbol;
type PresenterGrantLike = Readonly<{
  id: string;
  kind: 'snapshot' | 'method';
  sourceKey: PropertyKey;
  facadeKey: PropertyKey;
}>;

type BoundarySource = Readonly<{
  title: string;
  summary: string;
  self?: object;
}>;

type BoundaryPresenterView = Readonly<{
  title: string;
  summary: string;
}>;

type MethodBoundarySource = Readonly<{
  title: string;
  calculatePreview():
    | XnlProjectionSerializableValue
    | XnlProjectionPresenterReadonlyView<MethodBoundaryPresenterView>
    | Promise<
        XnlProjectionSerializableValue
        | XnlProjectionPresenterReadonlyView<MethodBoundaryPresenterView>
      >;
}>;

type MethodBoundaryPresenterView = Readonly<{
  title: string;
  readPreview():
    | XnlProjectionSerializableValue
    | XnlProjectionPresenterReadonlyView<MethodBoundaryPresenterView>
    | Promise<
        XnlProjectionSerializableValue
        | XnlProjectionPresenterReadonlyView<MethodBoundaryPresenterView>
      >;
}>;

const EMPTY_PRESENTER_PROTOCOL = createXnlProjectionPresenterCapabilityProtocol<
  Record<string, never>,
  Record<string, never>
>(
  EMPTY,
  { id: 'presenter.protocol.empty-runner-fixture', grants: [] },
  EMPTY,
);

const EMPTY_PRESENTER_RUNTIME_FACET = createXnlProjectionPresenterRuntimeFacet(
  { source: EMPTY, protocol: EMPTY_PRESENTER_PROTOCOL },
  EMPTY,
  EMPTY,
);

function emptyPresenterRuntimeFacet(): XnlProjectionPresenterRuntimeFacet<Record<string, never>> {
  return EMPTY_PRESENTER_RUNTIME_FACET;
}

function rootFrom(source: string): XnlNode {
  const parsed = parseXnl(source);
  const root = parsed.nodes[0];
  if (root === undefined) throw new Error('Expected one XNL root node.');
  return root;
}

function compileNeutralPlan(
  source = '<Document #doc [<Section #section>]>',
): XnlProjectionPlan {
  const presentation: XnlProjectionPresentation = {
    kind: 'xnl-projection-presentation',
    id: 'neutral.presentation',
    rules: [{
      id: 'neutral.presentation.all-nodes',
      match: {},
      presenter: {
        id: NEUTRAL_PRESENTER_ID,
        options: { density: 'compact' },
      },
    }],
  };
  const runtime = createXnlProjectionCompilerRuntime({
    dialects: [createDefaultXnlProjectionDialect()],
    presentation,
  });
  return compileXnlProjection(
    runtime,
    createXnlProjectionRootInput(rootFrom(source), {
      role: 'document',
      sourceRef: 'vfs://./presenter-sample.xnl',
    }),
    { planId: 'neutral.presenter.plan' },
  );
}

function registryFrom<TRuntime extends object = Record<string, never>>(
  ...adapters: readonly XnlProjectionRegisteredPresenterAdapter<TRuntime>[]
): XnlProjectionPresenterRegistry<TRuntime> {
  const result = createXnlProjectionPresenterRegistry(
    EMPTY,
    { adapters },
    { duplicate: 'reject' },
  );
  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  return result.registry;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function collectOwnKeys(value: unknown, keys = new Set<string>()): ReadonlySet<string> {
  if (value === null || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectOwnKeys(item, keys));
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectOwnKeys(child, keys);
  }
  return keys;
}

function createBoundaryProtocol(
): XnlProjectionPresenterCapabilityProtocol<BoundarySource, BoundaryPresenterView> {
  const titleGrant = createXnlProjectionPresenterSnapshotGrant<
    BoundarySource,
    BoundaryPresenterView,
    'title',
    'title'
  >(
    EMPTY,
    { id: 'presenter.grant.title', sourceKey: 'title', facadeKey: 'title' },
    EMPTY,
  );
  const summaryGrant = createXnlProjectionPresenterSnapshotGrant<
    BoundarySource,
    BoundaryPresenterView,
    'summary',
    'summary'
  >(
    EMPTY,
    { id: 'presenter.grant.summary', sourceKey: 'summary', facadeKey: 'summary' },
    EMPTY,
  );
  return createXnlProjectionPresenterCapabilityProtocol<BoundarySource, BoundaryPresenterView>(
    EMPTY,
    {
      id: 'presenter.protocol.boundary-view',
      grants: [titleGrant, summaryGrant],
    },
    EMPTY,
  );
}

function createSnapshotGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleSnapshotSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterSnapshotKey<TView>, FacadeGrantKey>,
>(input: CreateXnlProjectionPresenterSnapshotGrantInput<THost, TView, TSourceKey, TFacadeKey>) {
  return createXnlProjectionPresenterSnapshotGrant<THost, TView, TSourceKey, TFacadeKey>(
    EMPTY, input, EMPTY,
  );
}

function createMethodGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends XnlProjectionPresenterCompatibleMethodSourceKey<THost, TView, TFacadeKey>,
  TFacadeKey extends Extract<XnlProjectionPresenterMethodKey<TView>, FacadeGrantKey>,
>(input: CreateXnlProjectionPresenterMethodGrantInput<THost, TView, TSourceKey, TFacadeKey>) {
  return createXnlProjectionPresenterMethodGrant<THost, TView, TSourceKey, TFacadeKey>(
    EMPTY, input, EMPTY,
  );
}

function createProtocolFromGrants<THost extends object, TView extends object>(
  input: Readonly<{ id: string; grants: readonly unknown[] }>,
): XnlProjectionPresenterCapabilityProtocol<THost, TView> {
  return createXnlProjectionPresenterCapabilityProtocol<THost, TView>(
    EMPTY,
    input as CreateXnlProjectionPresenterCapabilityProtocolInput<THost, TView>,
    EMPTY,
  );
}

function createBoundaryFacet(
  source: BoundarySource,
  protocol = createBoundaryProtocol(),
): XnlProjectionPresenterRuntimeFacet<BoundaryPresenterView> {
  return createXnlProjectionPresenterRuntimeFacet<BoundarySource, BoundaryPresenterView>(
    { source, protocol },
    EMPTY,
    EMPTY,
  );
}

function createMethodBoundaryProtocol(
  id: string,
): XnlProjectionPresenterCapabilityProtocol<MethodBoundarySource, MethodBoundaryPresenterView> {
  const methodGrant = createMethodGrant<
    MethodBoundarySource,
    MethodBoundaryPresenterView,
    'calculatePreview',
    'readPreview'
  >({
    id: `${id}.grant.calculate-preview`,
    sourceKey: 'calculatePreview',
    facadeKey: 'readPreview',
  });
  const titleGrant = createSnapshotGrant<
    MethodBoundarySource,
    MethodBoundaryPresenterView,
    'title',
    'title'
  >({
    id: `${id}.grant.title`,
    sourceKey: 'title',
    facadeKey: 'title',
  });
  return createProtocolFromGrants<MethodBoundarySource, MethodBoundaryPresenterView>({
    id,
    grants: [titleGrant, methodGrant],
  });
}

function createMethodBoundaryFacet(
  source: MethodBoundarySource,
  protocol: XnlProjectionPresenterCapabilityProtocol<
    MethodBoundarySource,
    MethodBoundaryPresenterView
  >,
): XnlProjectionPresenterRuntimeFacet<MethodBoundaryPresenterView> {
  return createXnlProjectionPresenterRuntimeFacet<MethodBoundarySource, MethodBoundaryPresenterView>(
    { source, protocol },
    EMPTY,
    EMPTY,
  );
}

async function expectPresenterBoundaryFailure(
  makeRuntime: () => XnlProjectionPresenterRuntimeFacet<object> | object,
): Promise<void> {
  let presenterCalls = 0;
  const adapter: XnlProjectionRegisteredPresenterAdapter<object> = {
    id: NEUTRAL_PRESENTER_ID,
    surfaceId: FACADE_BOUNDARY_SURFACE_ID,
    present() {
      presenterCalls += 1;
      return {
        surfaceId: FACADE_BOUNDARY_SURFACE_ID,
        value: { reached: true },
      };
    },
  };

  let presenterRuntime: XnlProjectionPresenterRuntimeFacet<object> | object;
  try {
    presenterRuntime = makeRuntime();
  } catch {
    expect(presenterCalls).toBe(0);
    return;
  }

  const result = await presentXnlProjection(
    {
      presenterRegistry: registryFrom(adapter),
      presenterRuntime: presenterRuntime as XnlProjectionPresenterRuntimeFacet<object>,
    },
    { plan: compileNeutralPlan('<Document #doc>') },
    { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
  );

  expect(result).toMatchObject({
    ok: false,
    diagnostics: [{ code: 'INVALID_XNL_PROJECTION_PRESENTER_RUNTIME' }],
  });
  expect(presenterCalls).toBe(0);
}

describe('XNL Projection presenter registry and recursive runner', () => {
  it('uses stable ids, rejects duplicate construction, and makes layered conflict policy explicit', () => {
    expect(createXnlProjectionPresenterRegistry).toHaveLength(3);
    expect(composeXnlProjectionPresenterRegistries).toHaveLength(3);
    expect(presentXnlProjection).toHaveLength(3);

    const outline = createXnlProjectionOutlinePresenterAdapter(
      EMPTY,
      { id: NEUTRAL_PRESENTER_ID },
      EMPTY,
    );
    const inspection = createXnlProjectionInspectionPresenterAdapter(
      EMPTY,
      { id: NEUTRAL_PRESENTER_ID },
      EMPTY,
    );
    expect(outline.present).toHaveLength(3);
    expect(inspection.present).toHaveLength(3);

    const duplicate = createXnlProjectionPresenterRegistry(
      EMPTY,
      { adapters: [outline, outline] },
      { duplicate: 'reject' },
    );
    expect(duplicate).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'DUPLICATE_XNL_PROJECTION_PRESENTER' }],
    });

    const invalidId = createXnlProjectionPresenterRegistry(
      EMPTY,
      { adapters: [{ ...outline, id: 'not a stable id' }] },
      { duplicate: 'reject' },
    );
    expect(invalidId).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INVALID_XNL_PROJECTION_PRESENTER_ID' }],
    });

    const outlineRegistry = registryFrom(outline);
    const inspectionRegistry = registryFrom(inspection);
    const rejectedComposition = composeXnlProjectionPresenterRegistries(
      EMPTY,
      { registries: [outlineRegistry, inspectionRegistry] },
      { conflict: 'reject' },
    );
    expect(rejectedComposition).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'DUPLICATE_XNL_PROJECTION_PRESENTER' }],
    });

    const layered = composeXnlProjectionPresenterRegistries(
      EMPTY,
      { registries: [outlineRegistry, inspectionRegistry] },
      { conflict: 'last-wins' },
    );
    expect(layered.ok).toBe(true);
    if (!layered.ok) return;
    expect(layered.registry.resolve(NEUTRAL_PRESENTER_ID)).toMatchObject({
      ok: true,
      adapter: { surfaceId: XNL_PROJECTION_INSPECTION_SURFACE_ID },
    });
    expect(outlineRegistry.resolve(NEUTRAL_PRESENTER_ID)).toMatchObject({
      ok: true,
      adapter: { surfaceId: XNL_PROJECTION_OUTLINE_SURFACE_ID },
    });
  });

  it('presents one immutable compiled Plan as distinct outline and inspection surfaces', async () => {
    const plan = deepFreeze(compileNeutralPlan());
    const rootPlanNodeId = plan.root.id;
    const sectionPlanNodeId = plan.root.children[0]?.id;
    if (sectionPlanNodeId === undefined) throw new Error('Expected one section plan node.');
    const surfaceState = deepFreeze({
      expandedNodeIds: ['doc', 'section'],
    } satisfies XnlProjectionSerializableRecord);
    const input = deepFreeze({ plan, surfaceState });
    const before = JSON.stringify(input);
    expect(plan.root.presenter).toEqual({
      id: NEUTRAL_PRESENTER_ID,
      options: { density: 'compact' },
    });
    expect(collectOwnKeys(plan)).not.toContain('adapter');
    expect(collectOwnKeys(plan)).not.toContain('present');
    const outlineRegistry = registryFrom(createXnlProjectionOutlinePresenterAdapter(
      EMPTY,
      { id: NEUTRAL_PRESENTER_ID },
      EMPTY,
    ));
    const inspectionRegistry = registryFrom(createXnlProjectionInspectionPresenterAdapter(
      EMPTY,
      { id: NEUTRAL_PRESENTER_ID },
      EMPTY,
    ));

    const outline = await presentXnlProjection(
      {
        presenterRegistry: outlineRegistry,
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      input,
      { surfaceId: XNL_PROJECTION_OUTLINE_SURFACE_ID },
    );
    const inspection = await presentXnlProjection(
      {
        presenterRegistry: inspectionRegistry,
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      input,
      { surfaceId: XNL_PROJECTION_INSPECTION_SURFACE_ID },
    );

    expect(outline).toMatchObject({
      ok: true,
      surfaceId: XNL_PROJECTION_OUTLINE_SURFACE_ID,
      output: {
        value: {
          kind: 'xnl-projection.outline-node',
          planNodeId: rootPlanNodeId,
          label: 'Document',
          children: [{
            kind: 'xnl-projection.outline-node',
            planNodeId: sectionPlanNodeId,
            label: 'Section',
          }],
        },
      },
    });
    expect(inspection).toMatchObject({
      ok: true,
      surfaceId: XNL_PROJECTION_INSPECTION_SURFACE_ID,
      output: {
        value: {
          kind: 'xnl-projection.inspection-node',
          planNodeId: rootPlanNodeId,
          domain: {
            path: [],
            nodeId: 'doc',
            tag: 'Document',
          },
          classification: {
            id: 'xnl.data-element',
            traits: ['xnl.element'],
          },
          presenter: {
            id: NEUTRAL_PRESENTER_ID,
            options: { density: 'compact' },
          },
          childCount: 1,
        },
      },
    });
    expect(outline.ok && inspection.ok && outline.output.value)
      .not.toEqual(inspection.ok && inspection.output.value);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(surfaceState)).toBe(true);
  });

  it('runs children first with caller-owned runtime and explicit later-wins invocation options', async () => {
    const plan = deepFreeze(compileNeutralPlan(`
      <Document #doc { writer = "domain-payload" } [
        <Section #section [
          <Paragraph #paragraph>
        ]>
      ]>
    `));
    const callOrder: string[] = [];
    const observations: Array<{
      runtime: unknown;
      input: unknown;
      config: unknown;
      childCount: number;
    }> = [];
    const adapterConfig = deepFreeze({
      adapterPolicy: 'probe-only',
      density: 'comfortable',
    } satisfies XnlProjectionSerializableRecord);
    class ProbePresenterRuntime {
      readonly runtimeKind = 'probe';

      formatPlanNodeId(value: string): string {
        return `formatted:${value}`;
      }
    }
    const hostRuntime = {
      presenter: new ProbePresenterRuntime(),
      renamedDomainCommitCapability: () => undefined,
    };
    const presenterRuntime = hostRuntime.presenter;
    type ProbePresenterView = Pick<ProbePresenterRuntime, 'formatPlanNodeId'>;
    const formatPlanNodeIdGrant = createXnlProjectionPresenterMethodGrant<
      ProbePresenterRuntime,
      ProbePresenterView,
      'formatPlanNodeId',
      'formatPlanNodeId'
    >(
      EMPTY,
      {
        id: 'presenter.grant.runner-format-plan-node-id',
        sourceKey: 'formatPlanNodeId',
        facadeKey: 'formatPlanNodeId',
      },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<
      ProbePresenterRuntime,
      ProbePresenterView
    >(
      EMPTY,
      {
        id: 'presenter.protocol.runner-format-plan-node-id',
        grants: [formatPlanNodeIdGrant],
      },
      EMPTY,
    );
    const facet = createXnlProjectionPresenterRuntimeFacet(
      { source: presenterRuntime, protocol },
      EMPTY,
      EMPTY,
    );
    const probeAdapter: XnlProjectionRegisteredPresenterAdapter<
      ProbePresenterView
    > = {
      id: NEUTRAL_PRESENTER_ID,
      surfaceId: 'neutral.surface.probe',
      config: adapterConfig,
      present(runtime, input, config) {
        callOrder.push(input.node.id);
        observations.push({
          runtime,
          input,
          config,
          childCount: input.childOutputs.length,
        });
        return {
          surfaceId: 'neutral.surface.probe',
          value: {
            planNodeId: runtime.formatPlanNodeId(input.node.id),
            childValues: input.childOutputs.map((child) => child.value),
          },
        };
      },
    };

    const result = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(probeAdapter),
        presenterRuntime: facet,
      },
      {
        plan,
        surfaceState: deepFreeze({ selectedNodeId: 'paragraph' }),
      },
      { surfaceId: 'neutral.surface.probe' },
    );

    expect(result.ok).toBe(true);
    expect(callOrder).toEqual([
      plan.root.children[0]?.children[0]?.id,
      plan.root.children[0]?.id,
      plan.root.id,
    ]);
    expect(observations.map((observation) => observation.childCount)).toEqual([0, 1, 1]);
    for (const observation of observations) {
      expect(observation.runtime).not.toBe(presenterRuntime);
      expect(observation.runtime).not.toBe(hostRuntime);
      expect(Reflect.ownKeys(observation.runtime as object)).toEqual(['formatPlanNodeId']);
      expect(observation.config).toEqual({
        surfaceId: 'neutral.surface.probe',
        options: {
          adapterPolicy: 'probe-only',
          density: 'compact',
        },
      });
      expect(Object.keys(observation.input as object).sort()).toEqual([
        'childOutputs',
        'node',
        'surfaceState',
      ]);
      expect(Object.keys(observation.config as object).sort()).toEqual([
        'options',
        'surfaceId',
      ]);
      expect(observation.config).not.toHaveProperty('presenterId');
      const inputKeys = collectOwnKeys(observation.input);
      expect(inputKeys).not.toContain('xnlAst');
      expect(inputKeys).not.toContain('vfs');
      expect(inputKeys).not.toContain('vfsClient');
      expect(inputKeys).not.toContain('valueHost');
      expect(inputKeys).not.toContain('mutationWriter');
      expect(inputKeys).not.toContain('writer');
      expect(inputKeys).not.toContain('domainAuthority');
    }
  });

  it('rejects own undefined fields in surface state and presenter output snapshots', async () => {
    const surfaceId = 'neutral.surface.undefined-probe';
    const plan = compileNeutralPlan('<Document #doc>');
    const validAdapter: XnlProjectionRegisteredPresenterAdapter = {
      id: NEUTRAL_PRESENTER_ID,
      surfaceId,
      present() {
        return {
          surfaceId,
          value: { ok: true },
        };
      },
    };
    const invalidValueAdapter = {
      ...validAdapter,
      present() {
        return {
          surfaceId,
          value: { ownUndefined: undefined },
        };
      },
    } as unknown as XnlProjectionRegisteredPresenterAdapter;
    const invalidOptionalOutputAdapter = {
      ...validAdapter,
      present() {
        return {
          surfaceId,
          value: { ok: true },
          metadata: undefined,
        };
      },
    } as unknown as XnlProjectionRegisteredPresenterAdapter;

    const invalidState = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(validAdapter),
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      {
        plan,
        surfaceState: { selectedNodeId: undefined },
      },
      { surfaceId },
    );
    const invalidValue = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(invalidValueAdapter),
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      { plan },
      { surfaceId },
    );
    const invalidOptionalOutput = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(invalidOptionalOutputAdapter),
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      { plan },
      { surfaceId },
    );

    expect(invalidState).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INVALID_XNL_PROJECTION_SURFACE_STATE' }],
    });
    expect(invalidValue).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INVALID_XNL_PROJECTION_PRESENTER_OUTPUT' }],
    });
    expect(invalidOptionalOutput).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INVALID_XNL_PROJECTION_PRESENTER_OUTPUT' }],
    });
  });

  it('rejects a raw unprojected host runtime without inspecting capability field names', async () => {
    const surfaceId = 'neutral.surface.facet-boundary';
    let presenterCalls = 0;
    const adapter: XnlProjectionRegisteredPresenterAdapter<{
      readonly renamedDomainCommitCapability: () => void;
    }> = {
      id: NEUTRAL_PRESENTER_ID,
      surfaceId,
      present() {
        presenterCalls += 1;
        return {
          surfaceId,
          value: { reached: true },
        };
      },
    };
    const rawHostRuntime = {
      renamedDomainCommitCapability: () => undefined,
    };

    const result = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(adapter),
        presenterRuntime: rawHostRuntime as never,
      },
      { plan: compileNeutralPlan('<Document #doc>') },
      { surfaceId },
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'INVALID_XNL_PROJECTION_PRESENTER_RUNTIME',
      }],
    });
    expect(presenterCalls).toBe(0);
  });

  it('rejects a legacy raw-object dynamic factory call with an explicit closed failure', () => {
    const rawHostRuntime = {
      title: 'visible',
      renamedEffectCapability: () => undefined,
    };
    const legacyRawViewFactory = createXnlProjectionPresenterRuntimeFacet as unknown as (
      view: typeof rawHostRuntime,
    ) => XnlProjectionPresenterRuntimeFacet<typeof rawHostRuntime>;

    expect(createXnlProjectionPresenterRuntimeFacet).toHaveLength(3);
    expect(() => legacyRawViewFactory(rawHostRuntime)).toThrowError(
      /Presenter runtime facet input could not be inspected/,
    );
  });

  it('projects a valid source with arbitrary ungranted capabilities into an exact grant-only facade', async () => {
    let unrelatedAccessorReads = 0;
    const source = {
      title: 'Document',
      summary: 'Safe summary',
      renamedEffectCapability: () => undefined,
      nestedHostAuthority: { run: () => undefined },
    };
    Object.defineProperty(source, 'ungrantedAccessorCapability', {
      enumerable: true,
      get() {
        unrelatedAccessorReads += 1;
        throw new Error('ungranted accessor must not be read');
      },
    });
    Object.defineProperty(source, Symbol('ungrantedCapability'), {
      enumerable: true,
      get() {
        unrelatedAccessorReads += 1;
        throw new Error('ungranted symbol accessor must not be read');
      },
    });
    let observedRuntime: unknown;
    const adapter: XnlProjectionRegisteredPresenterAdapter<BoundaryPresenterView> = {
      id: NEUTRAL_PRESENTER_ID,
      surfaceId: FACADE_BOUNDARY_SURFACE_ID,
      present(runtime) {
        observedRuntime = runtime;
        return {
          surfaceId: FACADE_BOUNDARY_SURFACE_ID,
          value: {
            title: runtime.title,
            summary: runtime.summary,
          },
        };
      },
    };

    const result = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(adapter),
        presenterRuntime: createBoundaryFacet(source),
      },
      { plan: compileNeutralPlan('<Document #doc>') },
      { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
    );

    expect(result).toMatchObject({
      ok: true,
      output: { value: { title: 'Document', summary: 'Safe summary' } },
    });
    expect(Object.is(observedRuntime, source)).toBe(false);
    expect(Object.isFrozen(observedRuntime)).toBe(true);
    expect(Reflect.ownKeys(observedRuntime as object).sort()).toEqual(['summary', 'title']);
    expect(unrelatedAccessorReads).toBe(0);
  });

  it.each([
    'raw host view',
    'forged protocol',
    'forged facet',
    'unknown grant',
    'forged grant',
    'identity projection',
    'accessor target',
    'facet extra own key',
    'mutable facet',
    'malformed facet',
    'owner mismatch',
  ] as const)('fails closed before Presenter for invalid runtime boundary: %s', async (caseName) => {
    let accessorReads = 0;
    const source: BoundarySource = {
      title: 'Document',
      summary: 'Safe summary',
    };

    await expectPresenterBoundaryFailure(() => {
      if (caseName === 'raw host view') return source;
      if (caseName === 'forged facet') {
        return Object.freeze({
          protocolId: 'presenter.protocol.boundary-view',
          view: Object.freeze({ title: source.title, summary: source.summary }),
        });
      }
      if (caseName === 'mutable facet') {
        return {
          protocolId: 'presenter.protocol.boundary-view',
          view: Object.freeze({ title: source.title, summary: source.summary }),
        };
      }
      if (caseName === 'malformed facet') {
        return Object.freeze(Object.defineProperty(
          { protocolId: 'presenter.protocol.boundary-view' },
          'view',
          {
            enumerable: true,
            get() {
              accessorReads += 1;
              throw new Error('malformed facet accessor must not execute');
            },
          },
        ));
      }
      const protocol = createBoundaryProtocol();
      if (caseName === 'forged protocol') {
        const forgedProtocol = Object.freeze({
          id: protocol.id,
          grants: protocol.grants,
        }) as XnlProjectionPresenterCapabilityProtocol<BoundarySource, BoundaryPresenterView>;
        return createBoundaryFacet(source, forgedProtocol);
      }
      if (caseName === 'unknown grant' || caseName === 'forged grant') {
        const forgedGrant = Object.freeze({
          id: caseName === 'unknown grant'
            ? 'presenter.grant.unknown'
            : protocol.grants[0]?.id ?? 'presenter.grant.title',
          kind: 'snapshot',
          sourceKey: 'title',
          facadeKey: 'title',
        }) satisfies PresenterGrantLike;
        const forgedGrantProtocol = createProtocolFromGrants<
          BoundarySource,
          Pick<BoundaryPresenterView, 'title'>
        >({
          id: `presenter.protocol.${caseName.replace(' ', '-')}`,
          grants: [forgedGrant],
        });
        return createXnlProjectionPresenterRuntimeFacet<
          BoundarySource,
          Pick<BoundaryPresenterView, 'title'>
        >(
          { source, protocol: forgedGrantProtocol },
          EMPTY,
          EMPTY,
        );
      }
      if (caseName === 'identity projection') {
        const identitySource = { ...source };
        const mutableIdentitySource = identitySource as BoundarySource & { self: object };
        mutableIdentitySource.self = mutableIdentitySource;
        const dynamicSelfGrantFactory = createXnlProjectionPresenterSnapshotGrant as unknown as (
          runtime: typeof EMPTY,
          input: Readonly<{
            id: string;
            sourceKey: 'self';
            facadeKey: 'self';
          }>,
          config: typeof EMPTY,
        ) => PresenterGrantLike;
        const selfGrant = dynamicSelfGrantFactory(
          EMPTY,
          { id: 'presenter.grant.self', sourceKey: 'self', facadeKey: 'self' },
          EMPTY,
        );
        const identityProtocol = createProtocolFromGrants<typeof mutableIdentitySource, { self: object }>(
          {
            id: 'presenter.protocol.identity-projection',
            grants: [selfGrant],
          },
        );
        return createXnlProjectionPresenterRuntimeFacet<
          typeof mutableIdentitySource,
          { self: object }
        >(
          { source: mutableIdentitySource, protocol: identityProtocol },
          EMPTY,
          EMPTY,
        );
      }
      if (caseName === 'accessor target') {
        const accessorSource = { ...source };
        Object.defineProperty(accessorSource, 'title', {
          enumerable: true,
          get() {
            accessorReads += 1;
            throw new Error('granted accessor target must fail without executing');
          },
        });
        return createBoundaryFacet(accessorSource, protocol);
      }
      const validFacet = createBoundaryFacet(source, protocol);
      if (caseName === 'facet extra own key') {
        return Object.freeze({
          ...validFacet,
          extraFacadeKey: true,
        });
      }
      const otherFacet = createBoundaryFacet({
        title: 'Other document',
        summary: 'Other summary',
      }, protocol);
      return Object.freeze({
        ...validFacet,
        view: otherFacet.view,
      });
    });
    expect(accessorReads).toBe(0);
  });

  describe('granted method return boundary and trusted policy', () => {
    it.each(['sync', 'async'] as const)(
      'returns an immutable serializable snapshot from a %s granted method',
      async (mode) => {
        const rawSnapshot = {
          kind: 'preview',
          nested: { items: ['first'] },
        };
        const source: MethodBoundarySource = {
          title: 'Snapshot source',
          calculatePreview() {
            return mode === 'sync' ? rawSnapshot : Promise.resolve(rawSnapshot);
          },
        };
        const protocol = createMethodBoundaryProtocol(
          `presenter.protocol.method-snapshot-${mode}`,
        );
        let observedReturn: unknown;
        const adapter: XnlProjectionRegisteredPresenterAdapter<MethodBoundaryPresenterView> = {
          id: NEUTRAL_PRESENTER_ID,
          surfaceId: FACADE_BOUNDARY_SURFACE_ID,
          async present(runtime) {
            observedReturn = await runtime.readPreview();
            return {
              surfaceId: FACADE_BOUNDARY_SURFACE_ID,
              value: { received: true },
            };
          },
        };

        const result = await presentXnlProjection(
          {
            presenterRegistry: registryFrom(adapter),
            presenterRuntime: createMethodBoundaryFacet(source, protocol),
          },
          { plan: compileNeutralPlan('<Document #doc>') },
          { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
        );

        expect(result).toMatchObject({ ok: true });
        expect(observedReturn).toEqual(rawSnapshot);
        expect(observedReturn).not.toBe(rawSnapshot);
        expect(Object.isFrozen(observedReturn)).toBe(true);
        const snapshot = observedReturn as Readonly<{
          nested: Readonly<{ items: readonly string[] }>;
        }>;
        expect(Object.isFrozen(snapshot.nested)).toBe(true);
        expect(Object.isFrozen(snapshot.nested.items)).toBe(true);
        rawSnapshot.nested.items.push('source mutation');
        expect(snapshot.nested.items).toEqual(['first']);
      },
    );

    it.each(['sync', 'async'] as const)(
      'returns a same-protocol owned facade from a %s granted method',
      async (mode) => {
        const protocol = createMethodBoundaryProtocol(
          `presenter.protocol.same-owner-facade-${mode}`,
        );
        const childSource: MethodBoundarySource = {
          title: 'Child source',
          calculatePreview: () => ({ kind: 'child-preview' }),
        };
        const childFacet = createMethodBoundaryFacet(childSource, protocol);
        const parentSource: MethodBoundarySource = {
          title: 'Parent source',
          calculatePreview() {
            return mode === 'sync'
              ? childFacet.view
              : Promise.resolve(childFacet.view);
          },
        };
        let observedReturn: unknown;
        const adapter: XnlProjectionRegisteredPresenterAdapter<MethodBoundaryPresenterView> = {
          id: NEUTRAL_PRESENTER_ID,
          surfaceId: FACADE_BOUNDARY_SURFACE_ID,
          async present(runtime) {
            observedReturn = await runtime.readPreview();
            return {
              surfaceId: FACADE_BOUNDARY_SURFACE_ID,
              value: { received: true },
            };
          },
        };

        const result = await presentXnlProjection(
          {
            presenterRegistry: registryFrom(adapter),
            presenterRuntime: createMethodBoundaryFacet(parentSource, protocol),
          },
          { plan: compileNeutralPlan('<Document #doc>') },
          { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
        );

        expect(result).toMatchObject({ ok: true });
        expect(observedReturn).toBe(childFacet.view);
        expect(Object.isFrozen(observedReturn)).toBe(true);
        expect(Reflect.ownKeys(observedReturn as object).sort()).toEqual([
          'readPreview',
          'title',
        ]);
      },
    );

    it('treats an explicitly granted renamed effectful method as trusted policy', async () => {
      let internalEffects = 0;
      const source: MethodBoundarySource = {
        title: 'Trusted policy source',
        calculatePreview() {
          internalEffects += 1;
          return { status: 'effect-already-occurred' };
        },
      };
      const protocol = createMethodBoundaryProtocol(
        'presenter.protocol.trusted-renamed-effectful-method',
      );
      let observedReturn: unknown;
      const adapter: XnlProjectionRegisteredPresenterAdapter<MethodBoundaryPresenterView> = {
        id: NEUTRAL_PRESENTER_ID,
        surfaceId: FACADE_BOUNDARY_SURFACE_ID,
        async present(runtime) {
          observedReturn = await runtime.readPreview();
          return {
            surfaceId: FACADE_BOUNDARY_SURFACE_ID,
            value: { received: true },
          };
        },
      };

      const result = await presentXnlProjection(
        {
          presenterRegistry: registryFrom(adapter),
          presenterRuntime: createMethodBoundaryFacet(source, protocol),
        },
        { plan: compileNeutralPlan('<Document #doc>') },
        { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
      );

      expect(result).toMatchObject({ ok: true });
      expect(internalEffects).toBe(1);
      expect(observedReturn).toEqual({ status: 'effect-already-occurred' });
      expect(Object.isFrozen(observedReturn)).toBe(true);
    });

    const rejectedReturnCases = (
      [
        'raw source',
        'host authority',
        'foreign facade',
        'cyclic object graph',
        'unserializable object graph',
      ] as const
    ).flatMap((caseName) =>
      (['sync', 'async'] as const).map((mode) => [caseName, mode] as const),
    );

    it.each(rejectedReturnCases)(
      'fails closed after a %s is returned from a %s granted method without claiming rollback',
      async (caseName, mode) => {
        const suffix = `${caseName.replace(/ /g, '-')}-${mode}`;
        const protocol = createMethodBoundaryProtocol(
          `presenter.protocol.rejected-return-${suffix}`,
        );
        let forbiddenReturn: unknown;
        let internalEffects = 0;
        const source = {
          title: 'Rejected return source',
          calculatePreview() {
            internalEffects += 1;
            return mode === 'sync'
              ? forbiddenReturn
              : Promise.resolve(forbiddenReturn);
          },
        } as unknown as MethodBoundarySource;

        if (caseName === 'raw source') {
          forbiddenReturn = source;
        } else if (caseName === 'host authority') {
          forbiddenReturn = Object.freeze({ opaquePort: () => 'authority' });
        } else if (caseName === 'foreign facade') {
          const foreignProtocol = createMethodBoundaryProtocol(
            `presenter.protocol.foreign-return-${suffix}`,
          );
          const foreignSource: MethodBoundarySource = {
            title: 'Foreign source',
            calculatePreview: () => ({ kind: 'foreign-preview' }),
          };
          forbiddenReturn = createMethodBoundaryFacet(
            foreignSource,
            foreignProtocol,
          ).view;
        } else if (caseName === 'cyclic object graph') {
          const cyclic: { self?: unknown } = {};
          cyclic.self = cyclic;
          forbiddenReturn = cyclic;
        } else {
          forbiddenReturn = { nested: { token: Symbol('not-serializable') } };
        }

        let presenterObtainedReturn = false;
        const adapter: XnlProjectionRegisteredPresenterAdapter<MethodBoundaryPresenterView> = {
          id: NEUTRAL_PRESENTER_ID,
          surfaceId: FACADE_BOUNDARY_SURFACE_ID,
          async present(runtime) {
            await runtime.readPreview();
            presenterObtainedReturn = true;
            return {
              surfaceId: FACADE_BOUNDARY_SURFACE_ID,
              value: { reached: true },
            };
          },
        };

        const result = await presentXnlProjection(
          {
            presenterRegistry: registryFrom(adapter),
            presenterRuntime: createMethodBoundaryFacet(source, protocol),
          },
          { plan: compileNeutralPlan('<Document #doc>') },
          { surfaceId: FACADE_BOUNDARY_SURFACE_ID },
        );

        expect(result.ok).toBe(false);
        expect(presenterObtainedReturn).toBe(false);
        expect(internalEffects).toBe(1);
      },
    );
  });

  it('rejects malformed Presenter diagnostics through the complete contract validator', async () => {
    const surfaceId = 'neutral.surface.diagnostic-validation';
    const malformedDiagnostics = [
      {
        severity: 'error',
        code: 'MALFORMED_PATH',
        message: 'Path segments must use the public domain path contract.',
        path: ['body', { index: 0 }],
      },
      {
        severity: 'warning',
        code: 'MALFORMED_PLAN_NODE_ID',
        message: 'Plan node ids must be stable ids.',
        planNodeId: 'not a stable id',
      },
      {
        severity: 'info',
        code: 'UNKNOWN_DIAGNOSTIC_FIELD',
        message: 'Diagnostics are closed contract records.',
        extra: true,
      },
    ];

    for (const malformed of malformedDiagnostics) {
      const adapter = {
        id: NEUTRAL_PRESENTER_ID,
        surfaceId,
        present() {
          return {
            surfaceId,
            value: { ok: true },
            diagnostics: [malformed],
          };
        },
      } as unknown as XnlProjectionRegisteredPresenterAdapter;
      const result = await presentXnlProjection(
        {
          presenterRegistry: registryFrom(adapter),
          presenterRuntime: emptyPresenterRuntimeFacet(),
        },
        { plan: compileNeutralPlan('<Document #doc>') },
        { surfaceId },
      );

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{
          code: 'INVALID_XNL_PROJECTION_PRESENTER_OUTPUT',
        }],
      });
    }
  });

  it('returns an actionable diagnostic for an unknown presenter without invoking a fallback', async () => {
    let fallbackCalls = 0;
    const fallback: XnlProjectionRegisteredPresenterAdapter = {
      id: 'neutral.presenter.fallback',
      surfaceId: 'neutral.surface.fallback',
      present() {
        fallbackCalls += 1;
        return {
          surfaceId: 'neutral.surface.fallback',
          value: { fallback: true },
        };
      },
    };
    const plan = compileNeutralPlan('<Document #doc>');

    const result = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(fallback),
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      { plan },
      { surfaceId: 'neutral.surface.fallback' },
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        severity: 'error',
        code: 'UNKNOWN_XNL_PROJECTION_PRESENTER',
        planNodeId: plan.root.id,
        details: { presenterId: NEUTRAL_PRESENTER_ID },
      }],
    });
    expect(fallbackCalls).toBe(0);
  });

  it.each([
    'extra-string-key',
    'extra-symbol-key',
    'plan-accessor',
    'surface-state-accessor',
    'own-keys-reflection-failure',
    'descriptor-reflection-failure',
  ] as const)('fails closed on non-positive runner input shape: %s', async (caseName) => {
    const plan = compileNeutralPlan('<Document #doc>');
    let presenterCalls = 0;
    let accessorReads = 0;
    const surfaceId = 'neutral.surface.runner-input-boundary';
    const adapter: XnlProjectionRegisteredPresenterAdapter = {
      id: NEUTRAL_PRESENTER_ID,
      surfaceId,
      present() {
        presenterCalls += 1;
        return { surfaceId, value: { reached: true } };
      },
    };

    let input: unknown;
    if (caseName === 'extra-string-key') {
      input = { plan, unexpectedField: Object.freeze({ value: true }) };
    } else if (caseName === 'extra-symbol-key') {
      input = { plan, [Symbol('unexpected')]: Object.freeze({ value: true }) };
    } else if (caseName === 'plan-accessor') {
      input = Object.defineProperty({}, 'plan', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return plan;
        },
      });
    } else if (caseName === 'surface-state-accessor') {
      input = Object.defineProperty({ plan }, 'surfaceState', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return {};
        },
      });
    } else if (caseName === 'own-keys-reflection-failure') {
      input = new Proxy({ plan }, {
        ownKeys() {
          throw new Error('runner input ownKeys reflection denied');
        },
      });
    } else {
      input = new Proxy({ plan }, {
        getOwnPropertyDescriptor() {
          throw new Error('runner input descriptor reflection denied');
        },
      });
    }

    const result = await presentXnlProjection(
      {
        presenterRegistry: registryFrom(adapter),
        presenterRuntime: emptyPresenterRuntimeFacet(),
      },
      input as XnlProjectionPresentationRunnerInput,
      { surfaceId },
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INVALID_XNL_PROJECTION_PRESENTER_INPUT' }],
    });
    expect(presenterCalls).toBe(0);
    expect(accessorReads).toBe(0);
  });
});

if (false) {
  const plan = {} as XnlProjectionPlan;
  const invalidRunnerInput: XnlProjectionPresentationRunnerInput = {
    plan,
    // @ts-expect-error domain authority handles are not runner input
    writer: {},
  };
  void invalidRunnerInput;

  const registry = {} as XnlProjectionPresenterRegistry;
  const rawRuntime = {};
  const invalidRunnerRuntime: XnlProjectionPresentationRunnerRuntime = {
    presenterRegistry: registry,
    // @ts-expect-error presenter runtime must be an assembly-created facet.
    presenterRuntime: rawRuntime,
  };
  void invalidRunnerRuntime;
}
