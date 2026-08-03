import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as contract from '../src';
import type {
  XnlProjectionCommandResult,
  XnlProjectionDiagnostic,
  XnlProjectionDialect,
  XnlProjectionInteraction,
  XnlProjectionPlan,
  XnlProjectionPlanNode,
  XnlProjectionPresentation,
  XnlProjectionPresentationRule,
  XnlProjectionPresenterAdapter,
  XnlProjectionProcessor,
} from '../src';

type ValidationIssue = { path: string; code?: string; message: string };
type ValidationResult = { ok: boolean; issues: ValidationIssue[] };

type XnlProjectionSurface = typeof contract & {
  XNL_PROJECTION_RESOLUTION_PRECEDENCE?: readonly string[];
  validateXnlProjectionDiagnostics?: (value: unknown) => ValidationResult;
  validateXnlProjectionPresentation?: (value: unknown) => ValidationResult;
  validateXnlProjectionPlan?: (value: unknown) => ValidationResult;
  validateXnlProjectionDialect?: (value: unknown) => ValidationResult;
  validateXnlProjectionInteraction?: (value: unknown) => ValidationResult;
};

const xnlProjection = contract as XnlProjectionSurface;
const TEST_SOURCE = resolve(__dirname, './xnl-projection-contracts.red.test.ts');
const EXPECTED_XNL_PROJECTION_RUNTIME_EXPORTS = [
  'XNL_PROJECTION_RESOLUTION_PRECEDENCE',
  'validateXnlProjectionDiagnostics',
  'validateXnlProjectionPresentation',
  'validateXnlProjectionPlan',
  'validateXnlProjectionDialect',
  'validateXnlProjectionInteraction',
] as const;

function forbiddenSchemaEditorKindAssignmentPattern(): RegExp {
  const schemaEditorPlanKinds = [
    'g' + 'roup',
    'f' + 'ield',
    'collec' + 'tion',
    'm' + 'ap',
    'u' + 'nion',
    'cu' + 'stom',
  ];
  return new RegExp(String.raw`\bkind\s*:\s*['"](?:${schemaEditorPlanKinds.join('|')})['"]`);
}

describe('xnl-projection public contract boundary', () => {
  it('exports the intended renderer-neutral xnl-projection runtime surface from the package root', () => {
    for (const exportName of EXPECTED_XNL_PROJECTION_RUNTIME_EXPORTS) {
      expect(exportName in contract, exportName).toBe(true);
    }

    expect(xnlProjection.XNL_PROJECTION_RESOLUTION_PRECEDENCE).toEqual([
      'presentation',
      'semantic',
      'classification',
      'source-kind',
      'unsupported',
    ]);
    expect(xnlProjection.validateXnlProjectionDiagnostics).toBeTypeOf('function');
    expect(xnlProjection.validateXnlProjectionPresentation).toBeTypeOf('function');
    expect(xnlProjection.validateXnlProjectionPlan).toBeTypeOf('function');
    expect(xnlProjection.validateXnlProjectionDialect).toBeTypeOf('function');
    expect(xnlProjection.validateXnlProjectionInteraction).toBeTypeOf('function');
  });

  it('exposes type contracts for open projection plans without requiring a form model', () => {
    type PublicXnlProjectionTypes = {
      presentation: XnlProjectionPresentation;
      presentationRule: XnlProjectionPresentationRule;
      plan: XnlProjectionPlan;
      planNode: XnlProjectionPlanNode;
      diagnostic: XnlProjectionDiagnostic;
      interaction: XnlProjectionInteraction;
      commandResult: XnlProjectionCommandResult;
      processor: XnlProjectionProcessor<unknown, unknown, unknown>;
      dialect: XnlProjectionDialect<unknown>;
      presenter: XnlProjectionPresenterAdapter<unknown>;
    };

    expectTypeOf<PublicXnlProjectionTypes>().toBeObject();
  });

  it('validates a non-form architecture document projection with open classifications', () => {
    const presentation = {
      kind: 'xnl-projection-presentation',
      id: 'architecture-document.presentation',
      rules: [
        {
          id: 'system-summary',
          match: { tag: 'SystemDesign', role: 'summary' },
          presenter: { id: 'doc.system-summary', options: { headingLevel: 1 } },
        },
        {
          id: 'service-card',
          match: { classification: 'architecture.service' },
          presenter: { id: 'doc.service-card', options: { density: 'compact' } },
        },
      ],
    } satisfies XnlProjectionPresentation;

    const plan = {
      kind: 'xnl-projection-plan',
      id: 'architecture-document.plan',
      root: {
        id: 'domain://system-design#checkout-system/summary',
        domain: {
          path: ['SystemDesign', 'summary'],
          nodeId: 'checkout-system',
          tag: 'SystemDesign',
          role: 'summary',
        },
        classification: {
          id: 'architecture.system-design',
          traits: ['narrative', 'bounded-context-map'],
        },
        presenter: { id: 'doc.system-summary', options: { headingLevel: 1 } },
        data: {
          title: 'Checkout System',
          owner: 'platform-team',
        },
        children: [
          {
            id: 'domain://system-design#payment-service',
            domain: {
              path: ['SystemDesign', 'services', 0],
              nodeId: 'payment-service',
              tag: 'Service',
              role: 'service',
            },
            classification: {
              id: 'architecture.service',
              traits: ['api-provider'],
            },
            presenter: { id: 'doc.service-card', options: { density: 'compact' } },
            data: {
              name: 'PaymentService',
              language: 'TypeScript',
            },
            children: [
              {
                id: 'domain://system-design#payment-service/database',
                domain: {
                  path: ['SystemDesign', 'services', 0, 'dependencies', 0],
                  nodeId: 'payment-db',
                  tag: 'Dependency',
                  role: 'dependency',
                },
                classification: {
                  id: 'architecture.dependency',
                  traits: ['storage'],
                },
                presenter: { id: 'doc.dependency-chip' },
                data: {
                  name: 'payment-ledger',
                  protocol: 'postgres',
                },
                children: [],
              },
            ],
          },
        ],
      },
    } satisfies XnlProjectionPlan;

    expect(xnlProjection.validateXnlProjectionPresentation?.(presentation)).toEqual({
      ok: true,
      issues: [],
    });
    expect(xnlProjection.validateXnlProjectionPlan?.(plan)).toEqual({ ok: true, issues: [] });
    expect(JSON.parse(JSON.stringify({ presentation, plan }))).toEqual({ presentation, plan });
    expect(JSON.stringify(plan)).not.toMatch(forbiddenSchemaEditorKindAssignmentPattern());
  });

  it('allows multiple projection instances to reference one domain identity', () => {
    const plan = {
      kind: 'xnl-projection-plan',
      id: 'multi-role.plan',
      root: {
        id: 'projection://doc#service/summary',
        domain: { path: ['services', 0], nodeId: 'service', role: 'summary' },
        classification: { id: 'architecture.service' },
        presenter: { id: 'doc.service-summary' },
        children: [{
          id: 'projection://doc#service/graph',
          domain: { path: ['services', 0], nodeId: 'service', role: 'graph' },
          classification: { id: 'architecture.service' },
          presenter: { id: 'graph.service-node' },
          children: [],
        }],
      },
    } satisfies XnlProjectionPlan;

    expect(xnlProjection.validateXnlProjectionPlan?.(plan)).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('keeps executable presenters and ownership-bearing values out of serializable presentation data', () => {
    const cyclicData: Record<string, unknown> = { label: 'cycle' };
    cyclicData.self = cyclicData;
    const invalidPresentation = {
      kind: 'xnl-projection-presentation',
      id: 'invalid.presentation',
      rules: [
        {
          id: 'service-card',
          match: { classification: 'architecture.service' },
          presenter: {
            id: 'doc.service-card',
            options: {
              component: { name: 'ServiceCard' },
              writer: { id: 'domain-mutation-writer' },
            },
          },
          data: {
            transformer: () => undefined,
            cyclicData,
          },
        },
      ],
    };

    const result = xnlProjection.validateXnlProjectionPresentation?.(invalidPresentation);

    expect(result?.ok).toBe(false);
    expect(result?.issues.map((issue) => issue.path).join('\n')).toMatch(
      /\$\.rules\[0\]\.(presenter\.options|data)/,
    );
    expect(result?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['EXECUTABLE_VALUE', 'OWNERSHIP_FIELD', 'CYCLIC_CONTRACT_VALUE']),
    );
  });

  it('rejects non-unique plan node identities and unsafe plan data', () => {
    const unsafeData = Object.create({ inherited: true }) as Record<string, unknown>;
    unsafeData.title = 'unsafe';
    const invalidPlan = {
      kind: 'xnl-projection-plan',
      id: 'invalid-plan',
      root: {
        id: 'domain://system-design#duplicate',
        domain: { path: ['SystemDesign'], nodeId: 'root' },
        classification: { id: 'architecture.system-design' },
        presenter: { id: 'doc.system-summary' },
        data: { component: 'ServiceCard' },
        children: [
          {
            id: 'domain://system-design#duplicate',
            domain: { path: ['SystemDesign', 'services', 0], nodeId: 'root' },
            classification: { id: 'architecture.service' },
            presenter: { id: 'doc.service-card' },
            data: unsafeData,
            children: [],
          },
        ],
      },
    };

    const result = xnlProjection.validateXnlProjectionPlan?.(invalidPlan);

    expect(result?.ok).toBe(false);
    expect(result?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_PLAN_NODE_ID',
        'OWNERSHIP_FIELD',
        'RUNTIME_INSTANCE',
      ]),
    );
  });

  it('validates diagnostics as a complete closed public contract', () => {
    const valid = [{
      severity: 'warning',
      code: 'LOSSY_PRESENTATION',
      message: 'A presentation choice omitted source detail.',
      path: ['body', 0],
      planNodeId: 'xnlp:node-id:doc',
      details: { omitted: ['metadata'] },
    }];
    const invalid = [
      {
        severity: 'warning',
        code: 'LOSSY_PRESENTATION',
        message: 'Malformed path.',
        path: ['body', { index: 0 }],
      },
      {
        severity: 'error',
        code: 'INVALID_TARGET',
        message: 'Malformed plan node id.',
        planNodeId: 'not a stable id',
      },
      {
        severity: 'info',
        code: 'EXTRA_FIELD',
        message: 'Unknown fields are not contract data.',
        extra: true,
      },
      {
        severity: 'error',
        code: 'UNDEFINED_FIELD',
        message: 'Own undefined fields fail closed.',
        details: undefined,
      },
    ];

    expect(xnlProjection.validateXnlProjectionDiagnostics?.(valid)).toEqual({
      ok: true,
      issues: [],
    });
    const result = xnlProjection.validateXnlProjectionDiagnostics?.(invalid);
    expect(result?.ok).toBe(false);
    expect(result?.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'INVALID_DOMAIN_PATH_SEGMENT',
      'INVALID_STABLE_ID',
      'UNKNOWN_FIELD',
      'NON_SERIALIZABLE_VALUE',
    ]));
  });

  it('validates code-owned dialect shape without accepting ownership fields in data', () => {
    const validDialect = {
      id: 'architecture.xnl',
      children: () => [],
      classify: () => ({ id: 'architecture.node' }),
      transformers: {
        'architecture.node': () => ({
          id: 'domain://node#root',
          domain: { path: ['Node'] },
          classification: { id: 'architecture.node' },
          presenter: { id: 'doc.node' },
          children: [],
        }),
      },
      presenterBindings: [{ classification: 'architecture.node', presenter: { id: 'doc.node' } }],
      config: { mode: 'summary' },
    };
    const invalidDialect = {
      ...validDialect,
      runtime: {},
      config: { writer: 'domain-writer' },
      presenterBindings: [
        { classification: 'architecture.node', presenter: { id: 'doc.node', options: { component: 'NodeCard' } } },
      ],
    };

    expect(xnlProjection.validateXnlProjectionDialect?.(validDialect)).toEqual({ ok: true, issues: [] });
    const invalid = xnlProjection.validateXnlProjectionDialect?.(invalidDialect);
    expect(invalid?.ok).toBe(false);
    expect(invalid?.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['UNKNOWN_FIELD', 'OWNERSHIP_FIELD']));
  });

  it('validates interaction payloads as serializable command proposals only', () => {
    const validInteraction = {
      id: 'interaction.edit-title.1',
      type: 'domain.edit-title',
      target: {
        planNodeId: 'domain://system-design#checkout-system/summary',
        domain: { path: ['SystemDesign', 'summary'], nodeId: 'checkout-system' },
      },
      payload: { title: 'Checkout System' },
    };
    const invalidInteraction = {
      ...validInteraction,
      acceptedSnapshot: {},
      payload: {
        runtime: {},
      },
    };

    expect(xnlProjection.validateXnlProjectionInteraction?.(validInteraction)).toEqual({ ok: true, issues: [] });
    const invalid = xnlProjection.validateXnlProjectionInteraction?.(invalidInteraction);
    expect(invalid?.ok).toBe(false);
    expect(invalid?.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['UNKNOWN_FIELD', 'OWNERSHIP_FIELD']));
  });

  it('does not use schema-editor plan node kinds as the generic projection model in this red test', () => {
    const source = readFileSync(TEST_SOURCE, 'utf8');

    expect(source).not.toMatch(forbiddenSchemaEditorKindAssignmentPattern());
  });
});
