import { describe, expect, it } from 'vitest';
import * as logic from '../src';

interface DocumentCompileResult {
  documentPlans?: readonly Record<string, unknown>[];
  renderPlans: readonly Record<string, unknown>[];
  scopeRuntimePlans: readonly Record<string, unknown>[];
  adminShellPlan: { routes: readonly Record<string, unknown>[] };
  diagnostics: readonly { severity: string; code: string; message: string; path?: string }[];
}

const DOCUMENT_FQN = 'dg.docs.demo.SystemDesign';
const COMPONENT_FQN = 'dg.docs.ReviewPanel';
const RELATED_DOCUMENT_FQN = 'dg.docs.demo.RelatedDesign';

function documentCompileInput(routeToDocument = false): Record<string, unknown> {
  const document = {
    fqn: DOCUMENT_FQN,
    kind: 'document',
    form: 'single-file',
    path: '/documents/system-design.xnl',
    manifest: { kind: 'document', fqn: DOCUMENT_FQN, version: '1.0.0', domains: [] },
    domains: {},
    contract: {
      kind: 'document-contract',
      fqn: DOCUMENT_FQN,
      mode: 'edit',
      source: 'xnl-source-ref',
      revision: 'string?',
      parameters: { locale: 'string?', audience: 'string?' },
    },
    document: {
      sourceDescriptor: {
        kind: 'inline',
        unitSourceRef: 'vfs://@/document-units/documents/system-design.xnl',
        region: 'body',
      },
      rootNodeId: DOCUMENT_FQN,
      rootScope: {
        scopeId: 'document-root',
        runtime: 'runtime-instance://#document-runtime',
      },
      presentation: { id: 'system-design' },
      skeleton: [
        {
          kind: 'domain-node',
          tag: 'ArchitectureDecision',
          id: 'overview',
          children: [],
        },
        {
          kind: 'component-embed',
          tag: COMPONENT_FQN,
          id: 'review-panel',
          xId: 'review-panel',
          projectionRole: 'main',
          inlineProps: { tone: 'review' },
          children: [],
        },
        {
          kind: 'component-embed',
          tag: COMPONENT_FQN,
          id: 'summary-panel',
          projectionRole: 'main',
          inlineProps: { tone: 'summary' },
          children: [],
        },
        {
          kind: 'capsule',
          tag: 'Capsule',
          id: 'architecture',
          xId: 'architecture',
          projectionRole: 'main',
          scopeId: 'architecture-scope',
          scope: {
            scopeId: 'architecture-scope',
            runtime: 'runtime-instance://#architecture-runtime',
          },
          children: [
            {
              kind: 'component-embed',
              tag: COMPONENT_FQN,
              id: 'architecture-panel',
              xId: 'architecture-panel',
              projectionRole: 'main',
              children: [],
            },
          ],
        },
        {
          kind: 'document-embed',
          tag: RELATED_DOCUMENT_FQN,
          id: 'related-design',
          xId: 'related-design',
          projectionRole: 'main',
          children: [],
        },
      ],
    },
    scopeRuntimeBindings: [],
  };
  const component = {
    fqn: COMPONENT_FQN,
    kind: 'component',
    path: '/components/review-panel.xnl',
    manifest: { kind: 'component', fqn: COMPONENT_FQN, version: '1.0.0', domains: [] },
    domains: {},
    scopeRuntimeBindings: [],
  };
  const related = {
    fqn: RELATED_DOCUMENT_FQN,
    kind: 'document',
    path: '/documents/related-design.xnl',
    manifest: { kind: 'document', fqn: RELATED_DOCUMENT_FQN, version: '1.0.0', domains: [] },
    domains: {},
    contract: { kind: 'document-contract', fqn: RELATED_DOCUMENT_FQN, mode: 'view' },
    document: {
      sourceDescriptor: { kind: 'external', ref: 'vfs://./domain/related-design.xnl' },
      rootNodeId: RELATED_DOCUMENT_FQN,
      rootScope: { scopeId: 'related-design-root' },
      presentation: { id: 'related-design' },
      skeleton: [],
    },
    scopeRuntimeBindings: [],
  };
  const units = {
    [DOCUMENT_FQN]: document,
    [COMPONENT_FQN]: component,
    [RELATED_DOCUMENT_FQN]: related,
  };
  return {
    manifest: {
      id: 'document-compiler-red',
      version: '1.0.0',
      apiVersion: 'halfcode.dg-cell-mvi/v1',
      domains: [],
      units: [],
    },
    app: {
      routes: routeToDocument
        ? [{ id: 'bad-document-route', path: '/document', page: `document://${DOCUMENT_FQN}` }]
        : [],
      wiring: [],
      domains: {},
    },
    units,
    registry: Object.fromEntries(Object.values(units).map((unit) => [
      unit.fqn,
      { fqn: unit.fqn, kind: unit.kind, path: unit.path },
    ])),
  };
}

function compile(routeToDocument = false): DocumentCompileResult {
  return logic.compileHalfcodeUnitBundle(
    documentCompileInput(routeToDocument) as never,
  ) as unknown as DocumentCompileResult;
}

let initialResult: DocumentCompileResult | undefined;
let initialCompileError: unknown;
try {
  initialResult = compile();
} catch (error) {
  initialCompileError = error;
}

const documentCompilerAvailable = Array.isArray(initialResult?.documentPlans);

describe('Document Unit compiler public surface', () => {
  it('adds DocumentUnitPlan output without routing domain content through UnitRenderPlan', () => {
    expect(initialCompileError).toBeUndefined();
    expect(initialResult?.documentPlans).toEqual(expect.any(Array));
    expect(initialResult?.documentPlans).toHaveLength(2);
    expect(initialResult?.renderPlans.some((plan) => plan.unitFqn === DOCUMENT_FQN)).toBe(false);
  });
});

describe.runIf(documentCompilerAvailable)('Document Unit plan and lexical Scope compilation', () => {
  it('compiles source, root Scope, Capsule Scope, Component embed, and Document embed', () => {
    const result = compile();
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);

    expect(plan).toMatchObject({
      id: `${DOCUMENT_FQN}.document-unit-plan`,
      unitFqn: DOCUMENT_FQN,
      source: {
        kind: 'inline',
        unitSourceRef: 'vfs://@/document-units/documents/system-design.xnl',
        region: 'body',
      },
      rootNodeId: DOCUMENT_FQN,
      mode: 'edit',
      presentationId: 'system-design',
      rootScopeId: 'document-root',
      parameters: { locale: 'string?', audience: 'string?' },
      embeddedUnits: expect.arrayContaining([
        expect.objectContaining({
          kind: 'component-embed',
          id: 'review-panel',
          unitFqn: COMPONENT_FQN,
          scopeId: 'document-root',
        }),
        expect.objectContaining({
          kind: 'component-embed',
          id: 'architecture-panel',
          unitFqn: COMPONENT_FQN,
          scopeId: 'architecture-scope',
        }),
        expect.objectContaining({
          kind: 'document-embed',
          id: 'related-design',
          unitFqn: RELATED_DOCUMENT_FQN,
          scopeId: 'document-root',
        }),
      ]),
    });

    expect(result.scopeRuntimePlans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeId: 'document-root',
        ownerElementId: DOCUMENT_FQN,
        unitFqn: DOCUMENT_FQN,
        runtime: 'runtime-instance://#document-runtime',
      }),
      expect.objectContaining({
        scopeId: 'architecture-scope',
        parentScopeId: 'document-root',
        ownerElementId: 'architecture',
        unitFqn: DOCUMENT_FQN,
        runtime: 'runtime-instance://#architecture-runtime',
      }),
    ]));
  });

  it('emits static address descriptors with explicit/default x-id and no occurrence identity', () => {
    const plan = compile().documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];

    expect(addresses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectionRole: 'main',
        xId: 'review-panel',
        documentNodeId: 'review-panel',
        unitFqn: COMPONENT_FQN,
        scopeId: 'document-root',
      }),
      expect.objectContaining({
        projectionRole: 'main',
        xId: 'summary-panel',
        documentNodeId: 'summary-panel',
        unitFqn: COMPONENT_FQN,
        scopeId: 'document-root',
      }),
      expect.objectContaining({
        projectionRole: 'main',
        xId: 'architecture-panel',
        documentNodeId: 'architecture-panel',
        unitFqn: COMPONENT_FQN,
        scopeId: 'architecture-scope',
      }),
    ]));
    for (const address of addresses) {
      expect(address).not.toHaveProperty('unitInstanceId');
      expect(address).not.toHaveProperty('target');
    }
    expect(plan).not.toHaveProperty('rawSource');
    expect(plan).not.toHaveProperty('xnlDocument');
    expect(plan).not.toHaveProperty('acceptedSnapshot');
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('does not turn an unknown domain tag into a UI atom or render-plan node', () => {
    const result = compile();
    expect(result.renderPlans.some((renderPlan) =>
      JSON.stringify(renderPlan).includes('ArchitectureDecision'),
    )).toBe(false);
    expect(result.documentPlans?.some((plan) =>
      JSON.stringify(plan).includes('ArchitectureDecision'),
    )).toBe(false);
  });

  it('rejects a document:// target in Route.page while retaining Page-only route semantics', () => {
    const result = compile(true);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'HALFCODE_UNIT_KIND_MISMATCH',
        path: 'route://#bad-document-route',
      }),
    ]));
  });

  it('reports duplicate x-id across roles instead of applying last-wins', () => {
    const input = documentCompileInput() as {
      units: Record<string, { document: { skeleton: Array<Record<string, unknown>> } }>;
    };
    input.units[DOCUMENT_FQN].document.skeleton.push({
      kind: 'component-embed',
      tag: COMPONENT_FQN,
      id: 'review-panel-secondary',
      xId: 'review-panel',
      projectionRole: 'secondary',
      children: [],
    });
    const result = logic.compileHalfcodeUnitBundle(input as never) as unknown as DocumentCompileResult;

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/duplicate.*x-id|x-id.*duplicate/i),
      }),
    ]));
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];
    expect(addresses.filter((address) => address.xId === 'review-panel')).toHaveLength(1);
  });

  it('preserves distinct explicit x-id values and roles for multi-role addresses', () => {
    const input = documentCompileInput() as {
      units: Record<string, { document: { skeleton: Array<Record<string, unknown>> } }>;
    };
    input.units[DOCUMENT_FQN].document.skeleton.push({
      kind: 'component-embed',
      tag: COMPONENT_FQN,
      id: 'review-panel-secondary',
      xId: 'review-panel-secondary-target',
      projectionRole: 'secondary',
      children: [],
    });
    const result = logic.compileHalfcodeUnitBundle(input as never) as unknown as DocumentCompileResult;
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(addresses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentNodeId: 'review-panel',
        projectionRole: 'main',
        xId: 'review-panel',
      }),
      expect.objectContaining({
        documentNodeId: 'review-panel-secondary',
        projectionRole: 'secondary',
        xId: 'review-panel-secondary-target',
      }),
    ]));
  });

  it('uses explicit x-id as a stable embedded unit id when #id is absent', () => {
    const input = documentCompileInput() as {
      units: Record<string, { document: { skeleton: Array<Record<string, unknown>> } }>;
    };
    input.units[DOCUMENT_FQN].document.skeleton.push({
      kind: 'component-embed',
      tag: COMPONENT_FQN,
      xId: 'inline-review-target',
      projectionRole: 'main',
      children: [],
    });
    const result = logic.compileHalfcodeUnitBundle(input as never) as unknown as DocumentCompileResult;
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const embeddedUnits = plan?.embeddedUnits as readonly Record<string, unknown>[];
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(embeddedUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'component-embed',
        id: 'inline-review-target',
        unitFqn: COMPONENT_FQN,
        scopeId: 'document-root',
      }),
    ]));
    expect(addresses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectionRole: 'main',
        xId: 'inline-review-target',
        unitFqn: COMPONENT_FQN,
        scopeId: 'document-root',
      }),
    ]));
  });

  it('rejects embedded units without #id or x-id instead of synthesizing index-based plan ids', () => {
    const baselinePlan = compile().documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const baselineEmbeddedUnits = baselinePlan?.embeddedUnits as readonly Record<string, unknown>[];
    const baselineAddresses = baselinePlan?.addressableInstances as readonly Record<string, unknown>[];
    const input = documentCompileInput() as {
      units: Record<string, { document: { skeleton: Array<Record<string, unknown>> } }>;
    };
    input.units[DOCUMENT_FQN].document.skeleton.push({
      kind: 'component-embed',
      tag: COMPONENT_FQN,
      projectionRole: 'main',
      children: [],
    });
    const result = logic.compileHalfcodeUnitBundle(input as never) as unknown as DocumentCompileResult;
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const embeddedUnits = plan?.embeddedUnits as readonly Record<string, unknown>[];
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'HALFCODE_DOCUMENT_DSL_INVALID',
        message: expect.stringMatching(/stable #id|explicit x-id/i),
      }),
    ]));
    expect(embeddedUnits).toHaveLength(baselineEmbeddedUnits.length);
    expect(addresses).toHaveLength(baselineAddresses.length);
    expect(embeddedUnits).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `${COMPONENT_FQN}.${baselineEmbeddedUnits.length}` }),
    ]));
  });

  it('rejects a non-main role without an explicit x-id', () => {
    const input = documentCompileInput() as {
      units: Record<string, { document: { skeleton: Array<Record<string, unknown>> } }>;
    };
    input.units[DOCUMENT_FQN].document.skeleton.push({
      kind: 'component-embed',
      tag: COMPONENT_FQN,
      id: 'review-panel-secondary-missing-x-id',
      projectionRole: 'secondary',
      children: [],
    });
    const result = logic.compileHalfcodeUnitBundle(input as never) as unknown as DocumentCompileResult;
    const plan = result.documentPlans?.find((candidate) => candidate.unitFqn === DOCUMENT_FQN);
    const addresses = plan?.addressableInstances as readonly Record<string, unknown>[];

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/non-main|secondary|role.*explicit.*x-id|x-id.*explicit/i),
      }),
    ]));
    expect(addresses).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentNodeId: 'review-panel-secondary-missing-x-id',
      }),
    ]));
  });
});
