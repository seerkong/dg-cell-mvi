import { describe, expect, it } from 'vitest';
import {
  compileEditorPlan,
  composeSchemaEditorDialects,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerDialect,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
} from '../src';
import {
  validateEditorPlan,
  validateSchemaEditorDialect,
  type EditorPlanNode,
  type SchemaEditorClassification,
} from 'dg-cell-mvi-halfcode-contract';

function fieldTransformer(presenterId: string) {
  return (
    _runtime: EditorCompilerRuntime,
    input: EditorCompilerInput,
    _config: Record<string, unknown>,
  ): EditorPlanNode => ({
    kind: 'field',
    id: input.schema.id ?? presenterId,
    path: input.path ?? [],
    metadata: {
      display: {
        label: input.schema.label ?? input.schema.id ?? input.schema.kind,
        visible: true,
        readOnly: false,
      },
      scalar: {
        kind: input.schema.kind === 'scalar' ? input.schema.scalar : 'string',
      },
    },
    presenter: { id: presenterId },
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('schema-editor scoped dialect composition', () => {
  it('composes ordered classification with defined-only overrides and ordered diagnostics', () => {
    const calls: string[] = [];
    const layers: EditorCompilerDialect[] = [
      {
        id: 'default',
        classify: (_runtime, _input, _config) => {
          calls.push('default');
          return {
            semanticType: 'Money',
            format: 'email',
            unsupported: true,
            diagnostics: [{
              severity: 'info',
              code: 'DEFAULT_CLASSIFICATION',
              message: 'Default classification applied.',
              details: { layer: 'default' },
            }],
          };
        },
        config: { density: 'comfortable', retained: { enabled: true } },
        metadata: { scope: 'default', version: 1 },
      },
      {
        id: 'shared',
        classify: (_runtime, _input, _config) => {
          calls.push('shared');
          return {
            semanticType: undefined,
            format: 'currency',
            diagnostics: [{
              severity: 'warning',
              code: 'SHARED_CLASSIFICATION',
              message: 'Shared classification refined the format.',
              details: { layer: 'shared' },
            }],
          };
        },
        config: { density: 'compact' },
        metadata: { scope: 'shared' },
      },
      {
        id: 'bounded-context',
        classify: (_runtime, _input, _config) => {
          calls.push('bounded-context');
          return { semanticType: 'BusinessMoney', unsupported: undefined };
        },
      },
      {
        id: 'editor-instance',
        classify: (_runtime, _input, _config) => {
          calls.push('editor-instance');
          return { semanticType: undefined, unsupported: false, diagnostics: [] };
        },
        metadata: { instance: 'invoice-editor' },
      },
    ];

    layers.forEach(deepFreeze);
    const composed = composeSchemaEditorDialects(layers);
    const runtime = createSchemaEditorCompilerRuntime({ dialects: layers });
    const input: EditorCompilerInput = {
      schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
    };
    const config = { planId: 'amount.editor' };
    const result = composed.classify?.(runtime, input, config) as SchemaEditorClassification;

    expect(calls).toEqual(['default', 'shared', 'bounded-context', 'editor-instance']);
    expect(result).toEqual({
      semanticType: 'BusinessMoney',
      format: 'currency',
      unsupported: false,
      diagnostics: [
        {
          severity: 'info',
          code: 'DEFAULT_CLASSIFICATION',
          message: 'Default classification applied.',
          details: { layer: 'default' },
        },
        {
          severity: 'warning',
          code: 'SHARED_CLASSIFICATION',
          message: 'Shared classification refined the format.',
          details: { layer: 'shared' },
        },
      ],
    });
    expect(composed.classify?.length).toBe(3);
    expect(composed.config).toEqual({ density: 'compact', retained: { enabled: true } });
    expect(composed.metadata).toEqual({ scope: 'shared', version: 1, instance: 'invoice-editor' });
    expect(composed.config).not.toBe(layers[0].config);
    expect(composed.metadata).not.toBe(layers[0].metadata);
    expect(composed.config?.retained).not.toBe(layers[0].config?.retained);
    expect(composed.config).not.toHaveProperty('precedence');
    expect(composed.config).not.toHaveProperty('selectionOrder');
    expect(composed).not.toHaveProperty('resolver');
    expect(composed).not.toHaveProperty('registry');
    expect(composed).not.toHaveProperty('classifier');
    expect(validateSchemaEditorDialect(composed)).toEqual({ ok: true, issues: [] });
  });

  it('preserves ordered classification diagnostics on the transformed root and collected plan', () => {
    const runtime = createSchemaEditorCompilerRuntime({
      dialects: [
        {
          id: 'default-classification',
          classify: (_runtime, _input, _config) => ({
            diagnostics: [{
              severity: 'info',
              code: 'DEFAULT_CLASSIFICATION',
              message: 'Default classification applied.',
              path: ['amount'],
              details: { layer: 'default' },
            }],
          }),
        },
        {
          id: 'business-classification',
          classify: (_runtime, _input, _config) => ({
            semanticType: 'Money',
            diagnostics: [{
              severity: 'warning',
              code: 'BUSINESS_CLASSIFICATION',
              message: 'Business classification applied.',
              path: ['amount'],
              details: { layer: 'business' },
            }],
          }),
          transformers: {
            'semantic:Money': (_runtime, input, _config) => ({
              kind: 'field',
              id: input.schema.id ?? 'amount',
              path: input.path ?? [],
              metadata: {
                display: {
                  label: input.schema.label ?? input.schema.id ?? input.schema.kind,
                  visible: true,
                  readOnly: false,
                },
                scalar: {
                  kind: input.schema.kind === 'scalar' ? input.schema.scalar : 'string',
                },
              },
              presenter: { id: 'money.input' },
              diagnostics: [{
                severity: 'warning',
                code: 'TRANSFORMER_DIAGNOSTIC',
                message: 'Transformer diagnostic retained.',
              }],
            }),
          },
        },
      ],
    });

    const plan = compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
      path: ['amount'],
    });
    const expectedCodes = [
      'DEFAULT_CLASSIFICATION',
      'BUSINESS_CLASSIFICATION',
      'TRANSFORMER_DIAGNOSTIC',
    ];

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root.diagnostics?.map(({ code }) => code)).toEqual(expectedCodes);
    expect(plan.diagnostics?.map(({ code }) => code)).toEqual(expectedCodes);
  });

  it('turns invalid classification output and diagnostics into a valid unsupported plan', () => {
    const invalidResults: unknown[] = [
      'not-classification-data',
      {
        structuralKind: 'scalar',
        diagnostics: [{
          severity: 'warning',
          code: 'INVALID_PATH',
          message: 'This diagnostic path is invalid.',
          path: [-1],
        }],
      },
      {
        structuralKind: 'scalar',
        diagnostics: [{
          severity: 'warning',
          code: 'INVALID_DETAILS',
          message: 'This diagnostic detail is not serializable.',
          details: { callback: () => undefined },
        }],
      },
    ];

    for (const invalidResult of invalidResults) {
      const runtime = createSchemaEditorCompilerRuntime({
        dialects: [{
          id: 'invalid-classification',
          classify: (_runtime, _input, _config) => invalidResult as SchemaEditorClassification,
          transformers: { 'structural:scalar': fieldTransformer('should.not.run') },
        }],
      });
      const plan = compileEditorPlan(runtime, {
        schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
      });

      expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
      expect(plan.root).toMatchObject({
        presenter: { id: 'unsupported' },
        diagnostics: [{
          severity: 'error',
          code: 'UNSUPPORTED_INVALID_CLASSIFICATION',
        }],
      });
      expect(plan.diagnostics).toEqual(plan.root.diagnostics);
    }
  });

  it('uses the later transformer while leaving every source object unchanged', () => {
    const baseTransformer = fieldTransformer('base.scalar');
    const instanceTransformer = fieldTransformer('instance.scalar');
    const base = deepFreeze<EditorCompilerDialect>({
      id: 'base',
      transformers: { 'structural:scalar': baseTransformer },
      config: { source: 'base' },
      metadata: { scope: 'default' },
    });
    const instance = deepFreeze<EditorCompilerDialect>({
      id: 'instance',
      transformers: { 'structural:scalar': instanceTransformer },
      config: { source: 'instance' },
      metadata: { scope: 'instance' },
    });

    const runtime = createSchemaEditorCompilerRuntime({ dialects: [base, instance] });
    const plan = compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'title', scalar: 'string' },
    });

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root.presenter?.id).toBe('instance.scalar');
    expect(runtime.dialect).not.toBe(base);
    expect(runtime.dialect).not.toBe(instance);
    expect(runtime.dialect.transformers).not.toBe(base.transformers);
    expect(runtime.dialect.transformers?.['structural:scalar']).toBe(instanceTransformer);
    expect(base.transformers?.['structural:scalar']).toBe(baseTransformer);
    expect(instance.transformers?.['structural:scalar']).toBe(instanceTransformer);
    expect(base.config).toEqual({ source: 'base' });
    expect(instance.metadata).toEqual({ scope: 'instance' });
  });

  it('isolates the same semantic type transformer between runtimes', () => {
    const semanticLayer: EditorCompilerDialect = {
      id: 'semantic-classification',
      classify: (_runtime, _input, _config) => ({ semanticType: 'Money' }),
    };
    const runtimeA = createSchemaEditorCompilerRuntime({
      dialects: [semanticLayer, {
        id: 'runtime-a',
        transformers: { 'semantic:Money': fieldTransformer('money.a') },
      }],
    });
    const runtimeB = createSchemaEditorCompilerRuntime({
      dialects: [semanticLayer, {
        id: 'runtime-b',
        transformers: { 'semantic:Money': fieldTransformer('money.b') },
      }],
    });
    const input: EditorCompilerInput = {
      schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
    };

    expect(compileEditorPlan(runtimeA, input).root.presenter?.id).toBe('money.a');
    expect(compileEditorPlan(runtimeB, input).root.presenter?.id).toBe('money.b');
    expect(compileEditorPlan(runtimeA, input).root.presenter?.id).toBe('money.a');
    expect(runtimeA.dialect.transformers?.['semantic:Money'])
      .not.toBe(runtimeB.dialect.transformers?.['semantic:Money']);
  });

  it('supports explicit default plus business layering with structural fallback', () => {
    const business: EditorCompilerDialect = {
      id: 'billing',
      classify: (_runtime, input, _config) => ({
        semanticType: input.schema.annotations?.semanticType,
      }),
      transformers: { 'semantic:Money': fieldTransformer('billing.money') },
    };
    const runtime = createSchemaEditorCompilerRuntime({
      dialects: [createDefaultSchemaEditorDialect(), business],
    });

    const businessPlan = compileEditorPlan(runtime, {
      schema: {
        kind: 'scalar',
        id: 'amount',
        scalar: 'number',
        annotations: { semanticType: 'Money' },
      },
    });
    const fallbackPlan = compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'title', scalar: 'string' },
    });

    expect(businessPlan.root.presenter?.id).toBe('billing.money');
    expect(fallbackPlan.root.presenter?.id).toBe('scalar.text');
    expect(createSchemaEditorCompilerRuntime().dialect.id).toBe('schema-editor.default');
  });

  it('preserves the T1.3 single-layer identity behavior', () => {
    const single: EditorCompilerDialect = {
      id: 'single',
      transformers: { 'structural:scalar': fieldTransformer('single.scalar') },
    };

    expect(createSchemaEditorCompilerRuntime({ dialects: [single] }).dialect).toBe(single);
    expect(composeSchemaEditorDialects([single])).not.toBe(single);
  });

  it('rejects asynchronous classify from any composed layer', () => {
    const runtime = createSchemaEditorCompilerRuntime({
      dialects: [
        {
          id: 'sync',
          classify: (_runtime, _input, _config) => ({ semanticType: 'Money' }),
        },
        {
          id: 'async',
          classify: async (_runtime, _input, _config) => ({ semanticType: 'AsyncMoney' }),
        },
      ],
    });

    expect(() => compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
    })).toThrow(/classify processor returned a Promise; synchronous compilation is required/);
  });

  it('rejects non-serializable layer config before composition', () => {
    const invalid = {
      id: 'invalid-config',
      config: { precedence: () => ['semantic', 'structural'] },
    } as unknown as EditorCompilerDialect;

    expect(() => createSchemaEditorCompilerRuntime({
      dialects: [createDefaultSchemaEditorDialect(), invalid],
    })).toThrow(/dialect layer 1 validation failed/);
  });
});
