import { describe, expect, it } from 'vitest';
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerConfig,
  type EditorCompilerInput,
} from 'dg-cell-mvi-halfcode-logic';

const FORBIDDEN_CONFIG_ENTRIES = [
  ['dialect', {}],
  ['dialects', []],
  ['classify', 'business'],
  ['classifier', 'business'],
  ['transformers', {}],
  ['resolver', 'schema-resolver'],
  ['registry', {}],
  ['precedence', ['semantic', 'structural']],
  ['resolutionPrecedence', ['local', 'shared']],
  ['selectionOrder', ['presenter', 'semantic']],
] as const;

const input: EditorCompilerInput = {
  schema: { kind: 'scalar', id: 'amount', scalar: 'number' },
};

describe('EditorCompilerConfig contract', () => {
  it('accepts planId and extensible serializable business options', () => {
    const seenConfigs: EditorCompilerConfig[] = [];
    const runtime = createSchemaEditorCompilerRuntime({
      dialects: [
        createDefaultSchemaEditorDialect(),
        {
          id: 'billing-options-observer',
          classify: (_runtime, _input, config) => {
            seenConfigs.push(config);
            return {};
          },
        },
      ],
    });
    const config: EditorCompilerConfig = {
      planId: 'amount.editor',
      business: {
        boundedContext: 'billing',
        featureFlags: ['compact-money'],
        limits: { decimals: 2 },
      },
    };

    const plan = compileEditorPlan(runtime, input, config);

    expect(plan.id).toBe('amount.editor');
    expect(seenConfigs).toEqual([config]);
  });

  it.each(FORBIDDEN_CONFIG_ENTRIES)(
    'rejects compiler-owned key %s through every compile entry',
    (key, value) => {
      const runtime = createSchemaEditorCompilerRuntime();
      const config = { [key]: value } as unknown as EditorCompilerConfig;
      const message = `Schema editor compile config contains forbidden keys: ${key}.`;

      expect(() => compileEditorPlan(runtime, input, config)).toThrowError(message);
      expect(() => runtime.compile(input, config)).toThrowError(message);
    },
  );

  it('reports all forbidden keys in stable policy order', () => {
    const runtime = createSchemaEditorCompilerRuntime();
    const config = {
      selectionOrder: ['structural'],
      dialect: {},
      resolver: 'schema-resolver',
    } as unknown as EditorCompilerConfig;

    expect(() => compileEditorPlan(runtime, input, config)).toThrowError(
      'Schema editor compile config contains forbidden keys: dialect, resolver, selectionOrder.',
    );
  });

  it('continues to reject function-bearing and non-serializable business options', () => {
    const runtime = createSchemaEditorCompilerRuntime();
    const invalidConfigs = [
      { business: { callback: () => undefined } },
      { business: { createdAt: new Date('2026-07-16T00:00:00Z') } },
    ] as unknown as EditorCompilerConfig[];

    for (const config of invalidConfigs) {
      expect(() => compileEditorPlan(runtime, input, config)).toThrowError(
        'Schema editor compile config must be a plain serializable object.',
      );
      expect(() => runtime.compile(input, config)).toThrowError(
        'Schema editor compile config must be a plain serializable object.',
      );
    }
  });
});
