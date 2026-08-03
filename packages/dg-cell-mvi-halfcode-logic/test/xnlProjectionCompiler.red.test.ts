import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as logic from '../src';
import {
  validateXnlProjectionCommandResult,
  validateXnlProjectionPlan,
  type XnlProjectionCommandResult,
  type XnlProjectionCompileRuntime,
  type XnlProjectionDialect,
  type XnlProjectionDomainRef,
  type XnlProjectionInteraction,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionPresentation,
  type XnlProjectionProcessorInput,
  type XnlProjectionSerializableRecord,
} from 'dg-cell-mvi-halfcode-contract';

type SystemDesignTag = 'SystemDesign' | 'Service' | 'Dependency' | 'UnknownBlock';

interface SystemDesignNode {
  tag: SystemDesignTag;
  id: string;
  title: string;
  owner?: string;
  dependsOn?: string;
  children?: readonly SystemDesignNode[];
}

type ProjectionRuntime<TNode = SystemDesignNode> = XnlProjectionCompileRuntime<TNode, XnlProjectionPlanNode> & {
  dialect: XnlProjectionDialect<TNode>;
};

interface CompileInput<TNode = SystemDesignNode> {
  node: TNode;
  presentation?: XnlProjectionPresentation;
  nodeId?: string;
  tag?: string;
  role?: string;
  sourceKind?: string;
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
}

interface TranslateInput<TNode = SystemDesignNode> {
  planNode: XnlProjectionPlanNode;
  interaction: XnlProjectionInteraction;
  sourceNode?: TNode;
}

interface ProjectionLogicApi {
  compileXnlProjection<TNode = SystemDesignNode>(
    runtime: ProjectionRuntime<TNode>,
    input: CompileInput<TNode>,
    config?: XnlProjectionSerializableRecord,
  ): XnlProjectionPlan;
  composeXnlProjectionDialects<TNode = SystemDesignNode>(
    dialects: readonly XnlProjectionDialect<TNode>[],
  ): XnlProjectionDialect<TNode>;
  createXnlProjectionCompilerRuntime<TNode = SystemDesignNode>(options?: {
    dialects?: readonly XnlProjectionDialect<TNode>[];
    presentation?: XnlProjectionPresentation;
  }): ProjectionRuntime<TNode>;
  translateXnlProjectionInteraction<TNode = SystemDesignNode>(
    runtime: ProjectionRuntime<TNode>,
    input: TranslateInput<TNode>,
    config?: XnlProjectionSerializableRecord,
  ): XnlProjectionCommandResult;
}

type ProcessorCall = {
  name: string;
  runtime: unknown;
  input: unknown;
  config: unknown;
};

const systemTree: SystemDesignNode = {
  tag: 'SystemDesign',
  id: 'dg.system.checkout',
  title: 'Checkout Platform',
  children: [
    {
      tag: 'Service',
      id: 'dg.service.checkout-api',
      title: 'Checkout API',
      owner: 'payments',
      children: [{
        tag: 'Dependency',
        id: 'dg.dependency.stripe',
        title: 'Stripe',
        dependsOn: 'external.stripe',
      }],
    },
    {
      tag: 'Service',
      id: 'dg.service.billing-api',
      title: 'Billing API',
      owner: 'finance',
    },
    {
      tag: 'UnknownBlock',
      id: 'dg.unknown.legacy-note',
      title: 'Legacy note',
    },
  ],
};

const presentation: XnlProjectionPresentation = {
  kind: 'xnl-projection-presentation',
  id: 'architecture-document.presentation',
  rules: [
    {
      id: 'explicit-service-card',
      match: { nodeId: 'dg.service.checkout-api' },
      presenter: { id: 'presentation.service-card', options: { density: 'compact' } },
    },
    {
      id: 'lossy-dependency-hidden',
      match: { nodeId: 'dg.dependency.stripe' },
      visible: false,
      metadata: { reason: 'collapsed by document template' },
    },
  ],
};

function api(): ProjectionLogicApi {
  const candidate = logic as unknown as Partial<ProjectionLogicApi>;

  expect(candidate.compileXnlProjection).toBeTypeOf('function');
  expect(candidate.composeXnlProjectionDialects).toBeTypeOf('function');
  expect(candidate.createXnlProjectionCompilerRuntime).toBeTypeOf('function');
  expect(candidate.translateXnlProjectionInteraction).toBeTypeOf('function');

  return candidate as ProjectionLogicApi;
}

function roleFor(node: SystemDesignNode): string {
  if (node.tag === 'SystemDesign') return 'document';
  if (node.tag === 'Service') return 'component';
  if (node.tag === 'Dependency') return 'dependency';
  return 'note';
}

function sourceKindFor(node: SystemDesignNode): string {
  return `${node.tag.replace(/[A-Z]/g, (letter, index) => `${index === 0 ? '' : '-'}${letter.toLowerCase()}`)}-node`;
}

function systemRootInput(
  node: SystemDesignNode,
  overrides: Omit<CompileInput<SystemDesignNode>, 'node' | 'nodeId' | 'tag' | 'role' | 'sourceKind'> = {},
): CompileInput<SystemDesignNode> {
  return {
    node,
    nodeId: node.id,
    tag: node.tag,
    role: 'document',
    sourceKind: sourceKindFor(node),
    ...overrides,
  };
}

function classificationFor(node: SystemDesignNode): string {
  return `architecture.${sourceKindFor(node).replace(/-node$/, '')}`;
}

function makeSystemDialect(calls: ProcessorCall[] = []): XnlProjectionDialect<SystemDesignNode> {
  return {
    id: 'architecture.system-design',
      children: (runtime, input, config) => {
      calls.push({ name: 'children', runtime, input, config });
      return (input.node.children ?? []).map((child, index) => ({
        node: child,
        pathSegment: index,
        nodeId: child.id,
        tag: child.tag,
        role: roleFor(child),
        sourceKind: sourceKindFor(child),
        sourceRef: `system-design://${child.id}`,
      }));
    },
    classify: (runtime, input, config) => {
      calls.push({ name: 'classify', runtime, input, config });
      return {
        id: classificationFor(input.node),
        traits: input.node.owner ? ['owned-service'] : [],
        facts: {
          title: input.node.title,
          ...(input.node.owner ? { owner: input.node.owner } : {}),
        },
      };
    },
    transformers: {
      'architecture.system-design': makePlanTransformer(calls),
      'architecture.service': makePlanTransformer(calls),
      'architecture.dependency': makePlanTransformer(calls),
    },
    presenterBindings: [
      {
        classification: 'architecture.service',
        trait: 'owned-service',
        presenter: { id: 'semantic.service-summary' },
      },
      {
        classification: 'architecture.system-design',
        presenter: { id: 'classification.system-design' },
      },
      {
        sourceKind: 'dependency-node',
        presenter: { id: 'source.dependency-chip' },
      },
    ],
    translateInteraction: (runtime, input, config) => {
      calls.push({ name: 'translateInteraction', runtime, input, config });

      if (input.interaction.type !== 'projection.rename-title') {
        return {
          status: 'unsupported',
          diagnostics: [{
            severity: 'error',
            code: 'UNSUPPORTED_INTERACTION',
            message: `Interaction ${input.interaction.type} is not supported by this projection.`,
            planNodeId: input.planNode.id,
          }],
        };
      }

      const payload = input.interaction.payload;
      const renamePayload = payload as { title?: unknown };
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || typeof renamePayload.title !== 'string') {
        return {
          status: 'rejected',
          diagnostics: [{
            severity: 'error',
            code: 'INVALID_RENAME_PAYLOAD',
            message: 'Rename interaction requires a string title payload.',
            planNodeId: input.planNode.id,
          }],
        };
      }

      return {
        status: 'translated',
        command: {
          type: 'system-design.rename-title',
          target: input.planNode.domain,
          payload: { title: renamePayload.title },
          provenance: { interactionId: input.interaction.id ?? 'anonymous' },
        },
      };
    },
    config: { dialect: 'architecture' },
  };
}

function makePlanTransformer(calls: ProcessorCall[]) {
  return (
    runtime: XnlProjectionCompileRuntime<SystemDesignNode, XnlProjectionPlanNode>,
    input: XnlProjectionProcessorInput<SystemDesignNode>,
    config: XnlProjectionSerializableRecord,
  ): XnlProjectionPlanNode => {
    calls.push({ name: `transform:${input.classification?.id ?? 'unknown'}`, runtime, input, config });
    return {
      kind: 'xnl-projection-plan-node',
      id: logic.createXnlProjectionPlanNodeId(input.context.domain),
      domain: input.context.domain,
      classification: input.classification ?? { id: 'architecture.unknown' },
      presenter: input.presentation ?? { id: 'unsupported' },
      facts: {
        title: input.node.title,
        ...(input.node.owner ? { owner: input.node.owner } : {}),
        ...(input.node.dependsOn ? { dependsOn: input.node.dependsOn } : {}),
        ...(input.presentationData !== undefined ? { presentationData: input.presentationData } : {}),
      },
      children: input.children ?? [],
      diagnostics: [
        ...(input.classification?.diagnostics ?? []),
        ...((input.presentation?.id === 'unsupported') ? [{
          severity: 'error' as const,
          code: 'UNSUPPORTED_PROJECTION_NODE',
          message: 'No presenter could be resolved for this domain node.',
          path: input.context.domain.path,
        }] : []),
      ],
      provenance: {
        dialectId: 'architecture.system-design',
        transformer: input.classification?.id ?? 'unknown',
        ...(input.presentationRuleIds !== undefined ? { presentationRuleIds: [...input.presentationRuleIds] } : {}),
      },
    };
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function planNodeByDomainId(node: XnlProjectionPlanNode, nodeId: string): XnlProjectionPlanNode {
  const match = findPlanNodeByDomainId(node, nodeId);
  if (match) return match;
  throw new Error(`Missing projection plan node for domain node ${nodeId}`);
}

function findPlanNodeByDomainId(node: XnlProjectionPlanNode, nodeId: string): XnlProjectionPlanNode | undefined {
  if (node.domain.nodeId === nodeId) return node;
  for (const child of node.children) {
    const match = findPlanNodeByDomainId(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

describe('generic XNL Projection compiler foundation', () => {
  it('keeps this generic test independent from XNL parsing, form-editor, UI, and authoring writers', () => {
    const source = readFileSync(new URL(import.meta.url), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*(xnl-core|schema-editor|vue|element-plus|@tiptap|tiptap)[^'"]*['"]/);
    expect(source).not.toMatch(/\bfrom\s+['"][^'"]*(writer|mutation|ValueHost)[^'"]*['"]/);
  });

  it('recurses through runtime.compile with deterministic path, role, and #id-derived plan identity', () => {
    const calls: ProcessorCall[] = [];
    const projection = api();
    const dialect = makeSystemDialect(calls);
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [dialect], presentation });
    const invocationConfig = { planId: 'architecture.document.projection', tenant: 'demo' };

    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(deepFreeze(clone(systemTree))),
      deepFreeze(invocationConfig),
    );

    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan).toMatchObject({
      kind: 'xnl-projection-plan',
      id: 'architecture.document.projection',
      root: {
        id: logic.createXnlProjectionPlanNodeId({
          path: [],
          nodeId: 'dg.system.checkout',
          role: 'document',
        }),
        domain: {
          path: [],
          nodeId: 'dg.system.checkout',
          tag: 'SystemDesign',
          role: 'document',
          sourceKind: 'system-design-node',
        },
        presenter: { id: 'classification.system-design' },
      },
    });

    const checkout = planNodeByDomainId(plan.root, 'dg.service.checkout-api');
    const billing = planNodeByDomainId(plan.root, 'dg.service.billing-api');
    const stripe = planNodeByDomainId(plan.root, 'dg.dependency.stripe');
    const unknown = planNodeByDomainId(plan.root, 'dg.unknown.legacy-note');

    expect(checkout).toMatchObject({
      id: logic.createXnlProjectionPlanNodeId({
        path: [0],
        nodeId: 'dg.service.checkout-api',
        role: 'component',
      }),
      domain: { path: [0], role: 'component', sourceKind: 'service-node' },
      presenter: { id: 'presentation.service-card', options: { density: 'compact' } },
    });
    expect(billing.presenter).toEqual({ id: 'semantic.service-summary' });
    expect(stripe).toMatchObject({
      id: logic.createXnlProjectionPlanNodeId({
        path: [0, 0],
        nodeId: 'dg.dependency.stripe',
        role: 'dependency',
      }),
      domain: { path: [0, 0], role: 'dependency', sourceKind: 'dependency-node' },
      presenter: { id: 'source.dependency-chip' },
    });
    expect(stripe.diagnostics?.map(({ code }) => code)).toContain('LOSSY_PRESENTATION_HIDDEN');
    expect(unknown.presenter).toEqual({ id: 'unsupported' });
    expect(unknown.diagnostics?.map(({ code }) => code)).toContain('UNSUPPORTED_PROJECTION_NODE');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(({ runtime: seenRuntime }) => seenRuntime === runtime)).toBe(true);
    expect(calls.every(({ config: seenConfig }) => seenConfig === runtime.dialect.config)).toBe(true);
    expect(calls.every(({ config: seenConfig }) => {
      const record = seenConfig as Record<string, unknown>;
      return record.planId === undefined && record.tenant === undefined;
    })).toBe(true);
    expect([
      dialect.children.length,
      dialect.classify.length,
      ...Object.values(dialect.transformers).map((processor) => processor.length),
      dialect.translateInteraction?.length,
    ]).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('derives explicit identity independently from path and role while framing fallback identity', () => {
    const createPlanNodeId = logic.createXnlProjectionPlanNodeId as
      (domain: XnlProjectionDomainRef) => string;

    expect(createPlanNodeId).toBeTypeOf('function');

    expect(createPlanNodeId({
      path: ['body', 0],
      role: 'body',
      nodeId: 'moved-node',
    })).toBe(createPlanNodeId({
      path: ['extend', 'MovedNode'],
      role: 'extend',
      nodeId: 'moved-node',
    }));
    expect(createPlanNodeId({
      path: ['a', 'b'],
      role: 'unsupported-child',
    })).not.toBe(createPlanNodeId({
      path: ['a.b'],
      role: 'unsupported-child',
    }));
    expect(createPlanNodeId({
      path: [0],
      role: 'unsupported-child',
    })).not.toBe(createPlanNodeId({
      path: ['0'],
      role: 'unsupported-child',
    }));
  });

  it('keeps unsupported fallback ids injective and default processors observably three-argument', () => {
    const projection = api();
    const defaultRuntime = projection.createXnlProjectionCompilerRuntime();

    expect(defaultRuntime.dialect.children).toHaveLength(3);
    expect(defaultRuntime.dialect.classify).toHaveLength(3);

    interface UnsupportedNode {
      readonly children?: readonly {
        readonly node: UnsupportedNode;
        readonly path: readonly (string | number)[];
      }[];
    }
    const runtime = projection.createXnlProjectionCompilerRuntime<UnsupportedNode>({
      dialects: [{
        id: 'unsupported.path-collision',
        children: (_runtime, input, _config) => (input.node.children ?? []).map((child) => ({
          node: child.node,
          path: child.path,
          pathSegment: child.path[child.path.length - 1] ?? 'root',
          role: 'unsupported-child',
        })),
        classify: (_runtime, _input, _config) => ({ id: 'unsupported.path-node' }),
        transformers: {},
      }],
    });
    const plan = projection.compileXnlProjection(runtime, {
      node: {
        children: [
          { node: {}, path: ['a', 'b'] },
          { node: {}, path: ['a.b'] },
        ],
      },
      role: 'root',
    });

    expect(plan.root.children.map((child) => child.domain.path)).toEqual([
      ['a', 'b'],
      ['a.b'],
    ]);
    expect(plan.root.children[0]?.id).not.toBe(plan.root.children[1]?.id);
    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
  });

  it('clones resolved presenter refs and nested options into each compiled plan', () => {
    const projection = api();
    const dialect = makeSystemDialect();
    const binding = {
      classification: 'architecture.system-design',
      presenter: {
        id: 'classification.system-design',
        options: {
          density: 'compact',
          nested: { headingLevel: 1 },
        },
      },
    };
    dialect.presenterBindings = [
      ...(dialect.presenterBindings ?? []),
      binding,
    ];
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [dialect] });
    expect(Object.isFrozen(runtime.dialect.presenterBindings)).toBe(true);
    const first = projection.compileXnlProjection(runtime, systemRootInput(systemTree));

    const mutableFirstPresenter = first.root.presenter as {
      id: string;
      options?: {
        density?: string;
        nested?: { headingLevel?: number };
      };
    };
    mutableFirstPresenter.id = 'consumer.mutated';
    if (mutableFirstPresenter.options !== undefined) {
      mutableFirstPresenter.options.density = 'mutated';
      if (mutableFirstPresenter.options.nested !== undefined) {
        mutableFirstPresenter.options.nested.headingLevel = 99;
      }
    }

    const second = projection.compileXnlProjection(runtime, systemRootInput(systemTree));

    expect(second.root.presenter).toEqual({
      id: 'classification.system-design',
      options: {
        density: 'compact',
        nested: { headingLevel: 1 },
      },
    });
    expect(second.root.presenter).not.toBe(first.root.presenter);
    expect(second.root.presenter.options).not.toBe(first.root.presenter.options);
    expect(binding.presenter).toEqual({
      id: 'classification.system-design',
      options: {
        density: 'compact',
        nested: { headingLevel: 1 },
      },
    });
  });

  it('lets adapters pass explicit nodeId/tag without relying on raw XNL node fields being strings', () => {
    type AdapterNode = {
      rawId: { word: string };
      rawTag: { word: string };
      nodeId: string;
      tagName: string;
      title: string;
      children?: readonly AdapterNode[];
    };
    const adapterTree: AdapterNode = {
      rawId: { word: '#root-word' },
      rawTag: { word: 'RootTagWord' },
      nodeId: 'dg.adapter.root',
      tagName: 'AdapterRoot',
      title: 'Adapter Root',
      children: [{
        rawId: { word: '#child-word' },
        rawTag: { word: 'ChildTagWord' },
        nodeId: 'dg.adapter.child',
        tagName: 'AdapterChild',
        title: 'Adapter Child',
      }],
    };
    const projection = api();
    const runtime = projection.createXnlProjectionCompilerRuntime<AdapterNode>({
      dialects: [{
        id: 'adapter.explicit-identity',
        children: (_runtime, input, _config) => (input.node.children ?? []).map((child, index) => ({
          node: child,
          pathSegment: index,
          nodeId: child.nodeId,
          tag: child.tagName,
          role: 'adapter-child',
          sourceKind: 'adapter-node',
        })),
        classify: (_runtime, _input, _config) => ({ id: 'adapter.node' }),
        transformers: {
          'adapter.node': (_runtime, input, _config) => ({
            kind: 'xnl-projection-plan-node',
            id: logic.createXnlProjectionPlanNodeId(input.context.domain),
            domain: input.context.domain,
            classification: input.classification ?? { id: 'adapter.node' },
            presenter: input.presentation ?? { id: 'adapter.presenter' },
            facts: { title: input.node.title },
            children: input.children ?? [],
          }),
        },
        presenterBindings: [{ classification: 'adapter.node', presenter: { id: 'adapter.presenter' } }],
      }],
    });

    const plan = projection.compileXnlProjection(runtime, {
      node: adapterTree,
      nodeId: adapterTree.nodeId,
      tag: adapterTree.tagName,
      role: 'adapter-root',
      sourceKind: 'adapter-node',
    });

    expect(plan.root.domain).toMatchObject({
      nodeId: 'dg.adapter.root',
      tag: 'AdapterRoot',
      role: 'adapter-root',
    });
    expect(plan.root.id).toBe(logic.createXnlProjectionPlanNodeId({
      path: [],
      nodeId: 'dg.adapter.root',
      role: 'adapter-root',
    }));
    expect(plan.root.children[0]?.domain).toMatchObject({
      nodeId: 'dg.adapter.child',
      tag: 'AdapterChild',
      role: 'adapter-child',
    });
    expect(plan.root.children[0]?.id).toBe(logic.createXnlProjectionPlanNodeId({
      path: [0],
      nodeId: 'dg.adapter.child',
      role: 'adapter-child',
    }));
  });

  it('keeps duplicate plain-record id/tag fields out of DomainRef and semantic matching', () => {
    type PayloadRecord = {
      id: string;
      tag: string;
    };
    type PayloadNode = readonly PayloadRecord[] | PayloadRecord;
    const isPayloadRecord = (node: PayloadNode): node is PayloadRecord => !Array.isArray(node);
    const projection = api();
    const runtime = projection.createXnlProjectionCompilerRuntime<PayloadNode>({
      dialects: [{
        id: 'payload.records',
        children: (_runtime, input, _config) => Array.isArray(input.node)
          ? input.node.map((node, index) => ({
              node,
              pathSegment: index,
              role: 'array-item',
              sourceKind: 'payload-record',
            }))
          : [],
        classify: (_runtime, input, _config) => ({
          id: Array.isArray(input.node) ? 'payload.array' : 'payload.record',
        }),
        transformers: {
          'payload.array': (_runtime, input, _config) => ({
            kind: 'xnl-projection-plan-node',
            id: logic.createXnlProjectionPlanNodeId(input.context.domain),
            domain: input.context.domain,
            classification: input.classification ?? { id: 'payload.array' },
            presenter: input.presentation ?? { id: 'payload.array' },
            children: input.children ?? [],
          }),
          'payload.record': (_runtime, input, _config) => {
            if (!isPayloadRecord(input.node)) {
              throw new Error('Payload record transformer received a non-record node.');
            }
            return {
              kind: 'xnl-projection-plan-node',
              id: logic.createXnlProjectionPlanNodeId(input.context.domain),
              domain: input.context.domain,
              classification: input.classification ?? { id: 'payload.record' },
              presenter: input.presentation ?? { id: 'payload.record' },
              data: { id: input.node.id, tag: input.node.tag },
              children: input.children ?? [],
            };
          },
        },
        presenterBindings: [
          { classification: 'payload.array', presenter: { id: 'payload.array' } },
          { classification: 'payload.record', presenter: { id: 'payload.record' } },
        ],
      }],
      presentation: {
        kind: 'xnl-projection-presentation',
        id: 'payload.presentation',
        rules: [{
          id: 'payload-tag-must-not-match',
          match: { tag: 'payload' },
          presenter: { id: 'payload.tag-match' },
        }],
      },
    });

    const plan = projection.compileXnlProjection(runtime, {
      node: [
        { id: 'same', tag: 'payload' },
        { id: 'same', tag: 'payload' },
      ],
      role: 'root',
      sourceKind: 'payload-array',
    });
    const first = plan.root.children[0];
    const second = plan.root.children[1];

    expect(first?.domain).toEqual({
      path: [0],
      role: 'array-item',
      sourceKind: 'payload-record',
    });
    expect(second?.domain).toEqual({
      path: [1],
      role: 'array-item',
      sourceKind: 'payload-record',
    });
    expect(first?.id).toBe(logic.createXnlProjectionPlanNodeId({
      path: [0],
      role: 'array-item',
    }));
    expect(second?.id).toBe(logic.createXnlProjectionPlanNodeId({
      path: [1],
      role: 'array-item',
    }));
    expect(first?.id).not.toBe(second?.id);
    expect(first?.presenter.id).toBe('payload.record');
    expect(second?.presenter.id).toBe('payload.record');
    expect(first?.data).toEqual({ id: 'same', tag: 'payload' });
    expect(second?.data).toEqual({ id: 'same', tag: 'payload' });
    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
  });

  it('composes Dialects as later-wins without mutating or sharing source layers', () => {
    const projection = api();
    const baseTransformer = makePlanTransformer([]);
    const instanceTransformer = makePlanTransformer([]);
    const baseTranslator: NonNullable<XnlProjectionDialect<SystemDesignNode>['translateInteraction']> = (_runtime, input, _config) => ({
      status: 'unsupported',
      diagnostics: [{
        severity: 'error',
        code: 'BASE_TRANSLATOR',
        message: 'Base translator was preserved through optional composition.',
        planNodeId: input.planNode.id,
      }],
    });
    const base = deepFreeze<XnlProjectionDialect<SystemDesignNode>>({
      id: 'base',
      children: (_runtime, input, _config) => input.node.children?.map((node, index) => ({
        node,
        pathSegment: index,
        role: roleFor(node),
        sourceKind: sourceKindFor(node),
      })) ?? [],
      classify: (_runtime, input, _config) => ({ id: classificationFor(input.node) }),
      transformers: { 'architecture.service': baseTransformer },
      translateInteraction: baseTranslator,
      config: { density: 'comfortable', retained: { value: true } },
      metadata: { scope: 'base' },
    });
    const instance = deepFreeze<XnlProjectionDialect<SystemDesignNode>>({
      id: 'instance',
      children: (_runtime, input, _config) => input.node.children?.map((node, index) => ({
        node,
        pathSegment: index,
        role: roleFor(node),
        sourceKind: sourceKindFor(node),
      })) ?? [],
      classify: (_runtime, input, _config) => ({ id: classificationFor(input.node), traits: ['owned-service'] }),
      transformers: { 'architecture.service': instanceTransformer },
      presenterBindings: [{ classification: 'architecture.service', presenter: { id: 'instance.service' } }],
      config: { density: 'compact' },
      metadata: { scope: 'instance' },
    });

    const composed = projection.composeXnlProjectionDialects([base, instance]);
    const runtimeA = projection.createXnlProjectionCompilerRuntime({ dialects: [base, instance] });
    const runtimeB = projection.createXnlProjectionCompilerRuntime({ dialects: [base] });

    expect(composed).not.toBe(base);
    expect(composed).not.toBe(instance);
    expect(composed.transformers['architecture.service']).toBe(instanceTransformer);
    expect(composed.config).toEqual({ density: 'compact', retained: { value: true } });
    expect(composed.metadata).toEqual({ scope: 'instance' });
    expect(base.transformers['architecture.service']).toBe(baseTransformer);
    expect(instance.transformers['architecture.service']).toBe(instanceTransformer);
    expect(runtimeA.dialect.transformers['architecture.service']).toBe(instanceTransformer);
    expect(runtimeB.dialect.transformers['architecture.service']).toBe(baseTransformer);
    expect(composed.translateInteraction).toBe(baseTranslator);
  });

  it('keeps invocation policy separate from composed Dialect processor config', () => {
    const calls: ProcessorCall[] = [];
    const projection = api();
    const base = makeSystemDialect();
    base.id = 'architecture.processor-config-base';
    base.config = {
      density: 'comfortable',
      retained: { fromBase: true },
      nested: { baseOnly: true, shared: 'base' },
    };
    const overlay = makeSystemDialect(calls);
    overlay.id = 'architecture.processor-config-overlay';
    overlay.config = {
      density: 'compact',
      nested: { overlayOnly: true, shared: 'overlay' },
    };
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [base, overlay], presentation });

    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(systemTree),
      {
        planId: 'architecture.processor-config',
        tenant: 'compile-invocation',
        density: 'invocation-should-not-win',
      },
    );
    const checkout = planNodeByDomainId(plan.root, 'dg.service.checkout-api');
    projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.rename-title',
        target: { planNodeId: checkout.id },
        payload: { title: 'Config Boundary' },
      },
    }, { reason: 'translate-invocation' });

    expect(plan.id).toBe('architecture.processor-config');
    expect(runtime.dialect.config).toEqual({
      density: 'compact',
      retained: { fromBase: true },
      nested: { baseOnly: true, shared: 'overlay', overlayOnly: true },
    });
    expect(calls.map(({ name }) => name)).toContain('children');
    expect(calls.map(({ name }) => name)).toContain('classify');
    expect(calls.map(({ name }) => name)).toContain('transform:architecture.system-design');
    expect(calls.map(({ name }) => name)).toContain('translateInteraction');
    expect(calls.every(({ config }) => config === runtime.dialect.config)).toBe(true);
    expect(calls.every(({ config }) => {
      const record = config as Record<string, unknown>;
      return record.planId === undefined
        && record.tenant === undefined
        && record.reason === undefined
        && record.density !== 'invocation-should-not-win';
    })).toBe(true);
  });

  it('passes a stable empty Dialect config record when a Dialect has no code-owned config', () => {
    const calls: ProcessorCall[] = [];
    const projection = api();
    const noConfigDialect = makeSystemDialect(calls);
    delete noConfigDialect.config;
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [noConfigDialect] });

    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(systemTree),
      { planId: 'architecture.empty-dialect-config' },
    );
    const checkout = planNodeByDomainId(plan.root, 'dg.service.checkout-api');
    projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.rename-title',
        target: { planNodeId: checkout.id },
        payload: { title: 'Empty Config Boundary' },
      },
    }, { reason: 'translate-invocation' });

    const seenConfigs = calls.map(({ config }) => config);
    expect(new Set(seenConfigs)).toHaveLength(1);
    expect(seenConfigs[0]).toEqual({});
    expect(seenConfigs.every((config) => {
      const record = config as Record<string, unknown>;
      return record.planId === undefined && record.reason === undefined;
    })).toBe(true);
  });

  it('resolves presenters in explicit, semantic, classification, source-kind, unsupported order', () => {
    const projection = api();
    const runtime = projection.createXnlProjectionCompilerRuntime({
      dialects: [makeSystemDialect()],
    });
    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(systemTree, { presentation }),
      { planId: 'architecture.resolution-order' },
    );

    expect(planNodeByDomainId(plan.root, 'dg.service.checkout-api').presenter.id).toBe('presentation.service-card');
    expect(planNodeByDomainId(plan.root, 'dg.service.billing-api').presenter.id).toBe('semantic.service-summary');
    expect(plan.root.presenter.id).toBe('classification.system-design');
    expect(planNodeByDomainId(plan.root, 'dg.dependency.stripe').presenter.id).toBe('source.dependency-chip');
    expect(planNodeByDomainId(plan.root, 'dg.unknown.legacy-note').presenter.id).toBe('unsupported');
  });

  it('uses later matching Presentation rules for presenter and deterministic data while preserving hidden diagnostics', () => {
    const projection = api();
    const overlayPresentation: XnlProjectionPresentation = {
      kind: 'xnl-projection-presentation',
      id: 'architecture.overlay.presentation',
      rules: [
        {
          id: 'service-base',
          match: { nodeId: 'dg.service.checkout-api' },
          presenter: { id: 'presentation.service-base' },
          data: { density: 'comfortable', nested: { ownerLabel: 'Owner' }, slots: ['title'] },
        },
        {
          id: 'service-hidden-marker',
          match: { nodeId: 'dg.service.checkout-api' },
          visible: false,
          data: { hiddenByTemplate: true },
        },
        {
          id: 'service-overlay',
          match: { nodeId: 'dg.service.checkout-api' },
          presenter: { id: 'presentation.service-overlay' },
          data: { density: 'compact', nested: { badge: 'team' }, slots: ['title', 'owner'] },
        },
      ],
    };
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [makeSystemDialect()] });
    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(systemTree, { presentation: overlayPresentation }),
      { planId: 'architecture.presentation-overlays' },
    );
    const checkout = planNodeByDomainId(plan.root, 'dg.service.checkout-api');

    expect(checkout.presenter).toEqual({ id: 'presentation.service-overlay' });
    expect(checkout.facts?.presentationData).toEqual({
      density: 'compact',
      nested: { ownerLabel: 'Owner', badge: 'team' },
      slots: ['title', 'owner'],
      hiddenByTemplate: true,
    });
    expect(checkout.provenance?.presentationRuleIds).toEqual([
      'service-base',
      'service-hidden-marker',
      'service-overlay',
    ]);
    expect(checkout.diagnostics?.map(({ code }) => code)).toContain('LOSSY_PRESENTATION_HIDDEN');
  });

  it('turns invalid transformer output into a closed unsupported plan diagnostic', () => {
    const projection = api();
    const invalidDialect: XnlProjectionDialect<SystemDesignNode> = {
      ...makeSystemDialect(),
      transformers: {
        'architecture.system-design': (_runtime, _input, _config) => ({
          id: 'invalid',
          domain: 'not-a-domain-ref',
        }) as unknown as XnlProjectionPlanNode,
      },
    };
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [invalidDialect] });

    const plan = projection.compileXnlProjection(runtime, systemRootInput({
      tag: 'SystemDesign',
      id: 'dg.system.invalid',
      title: 'Invalid Transformer',
    }));

    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root.presenter.id).toBe('unsupported');
    expect(plan.root.diagnostics?.map(({ code }) => code)).toContain('INVALID_TRANSFORMER_OUTPUT');
  });

  it('keeps compile input immutable and rejects config-owned implementation hooks', () => {
    const projection = api();
    const tree = deepFreeze(clone(systemTree));
    const treeBefore = clone(tree);
    const frozenPresentation = deepFreeze(clone(presentation));
    const presentationBefore = clone(frozenPresentation);
    const runtime = projection.createXnlProjectionCompilerRuntime({
      dialects: [deepFreeze(makeSystemDialect())],
      presentation: frozenPresentation,
    });

    projection.compileXnlProjection(runtime, systemRootInput(tree), {
      planId: 'architecture.immutable',
      business: { locale: 'en-US' },
    });

    expect(tree).toEqual(treeBefore);
    expect(frozenPresentation).toEqual(presentationBefore);

    for (const config of [
      { dialect: makeSystemDialect() },
      { dialects: [makeSystemDialect()] },
      { transformers: {} },
      { presenterRegistry: { render: () => undefined } },
      { runtime },
      { business: { writer: 'host-owned-writer' } },
      { business: { nested: { valueHost: 'host-owned-value-host' } } },
      { business: [{ vfsClient: 'host-owned-vfs-client' }] },
    ]) {
      expect(() => projection.compileXnlProjection(
        runtime,
        systemRootInput(systemTree),
        config as unknown as XnlProjectionSerializableRecord,
      )).toThrow(/XNL Projection compile config contains forbidden keys|runtime ownership field|plain serializable object/);
    }
  });

  it('translates interactions only into closed translated, rejected, or unsupported command outcomes', () => {
    const calls: ProcessorCall[] = [];
    const projection = api();
    const runtime = projection.createXnlProjectionCompilerRuntime({ dialects: [makeSystemDialect(calls)], presentation });
    const plan = projection.compileXnlProjection(
      runtime,
      systemRootInput(systemTree),
      { planId: 'architecture.interactions' },
    );
    const checkout = planNodeByDomainId(plan.root, 'dg.service.checkout-api');

    const translated = projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        id: 'rename-1',
        type: 'projection.rename-title',
        target: { planNodeId: checkout.id },
        payload: { title: 'Checkout API v2' },
      },
    }, { reason: 'user-edit' });
    const rejected = projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.rename-title',
        target: { planNodeId: checkout.id },
        payload: { title: 42 },
      },
    });
    const unsupported = projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.execute-script',
        target: { planNodeId: checkout.id },
      },
    });
    const callsBeforeInvalidTargets = calls.filter(({ name }) => name === 'translateInteraction').length;
    const targetMismatch = projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.rename-title',
        target: { planNodeId: 'component:other-node' },
        payload: { title: 'Should Not Translate' },
      },
    });
    const invalidInteraction = projection.translateXnlProjectionInteraction(runtime, {
      planNode: checkout,
      interaction: {
        type: 'projection.rename-title',
        target: { planNodeId: '' },
        payload: { title: 'Should Not Translate' },
      },
    });

    expect(validateXnlProjectionCommandResult(translated)).toEqual({ ok: true, issues: [] });
    expect(translated).toMatchObject({
      status: 'translated',
      command: {
        type: 'system-design.rename-title',
        target: { nodeId: 'dg.service.checkout-api', path: [0] },
        payload: { title: 'Checkout API v2' },
      },
    });
    expect(validateXnlProjectionCommandResult(rejected)).toEqual({ ok: true, issues: [] });
    expect(rejected.status).toBe('rejected');
    expect(validateXnlProjectionCommandResult(unsupported)).toEqual({ ok: true, issues: [] });
    expect(unsupported.status).toBe('unsupported');
    expect(validateXnlProjectionCommandResult(targetMismatch)).toEqual({ ok: true, issues: [] });
    expect(targetMismatch.status).toBe('rejected');
    if (targetMismatch.status !== 'rejected') throw new Error('Expected target mismatch to be rejected.');
    expect(targetMismatch.diagnostics.map(({ code }) => code)).toContain('INVALID_INTERACTION_TARGET');
    expect(validateXnlProjectionCommandResult(invalidInteraction)).toEqual({ ok: true, issues: [] });
    expect(invalidInteraction.status).toBe('rejected');
    expect(calls.filter(({ name }) => name === 'translateInteraction')).toHaveLength(callsBeforeInvalidTargets);
    expect(calls.filter(({ name }) => name === 'translateInteraction').every(({ runtime: seenRuntime, config }) => {
      const record = config as Record<string, unknown>;
      return seenRuntime === runtime && config === runtime.dialect.config && record.reason === undefined;
    })).toBe(true);
  });
});
