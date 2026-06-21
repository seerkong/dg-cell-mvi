import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as logic from 'dg-cell-mvi-halfcode-logic';
import {
  compileEditorPlan,
  composeSchemaEditorDialects,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type CreateEditorCompilerRuntimeOptions,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerFieldContext,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';

const ROOT = resolve(__dirname, '..');
const COMPILER_EXPORTS = [
  'compileEditorPlan',
  'composeSchemaEditorDialects',
  'createDefaultSchemaEditorDialect',
  'createSchemaEditorCompilerRuntime',
] as const;
const INTERNAL_COMPILER_EXPORTS = [
  'classify',
  'compileEditorNode',
  'composeClassifiers',
  'selectionCandidates',
  'transformArray',
  'transformMap',
  'transformObject',
  'transformRef',
  'transformScalar',
  'transformUnion',
  'transformUnsupported',
] as const;

describe('canonical logic surface', () => {
  it('contains no retired store, reducer, projector, normalization, or conversion modules', () => {
    for (const file of ['store.ts', 'reducers.ts', 'projectors.ts', 'normalization.ts', 'path.ts']) {
      expect(existsSync(resolve(ROOT, 'src', file)), file).toBe(false);
    }

    const index = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
    expect(index).not.toMatch(/\.\/(store|reducers|projectors|normalization|path)/);
    expect(index).not.toContain('schemaToDocument');
  });

  it('exports only canonical document, authoring, and unit compilation behavior', () => {
    expect(logic.compileCanonicalDocument).toBeTypeOf('function');
    expect(logic.compileHalfcodeUnitBundle).toBeTypeOf('function');
    expect(logic.applyArtifactMutation).toBeTypeOf('function');
  });

  it('publishes the stable compiler API and types from the package root', () => {
    const config: EditorCompilerConfig = { planId: 'public-surface.editor', diagnostics: true };
    const fieldContext: EditorCompilerFieldContext = {
      key: 'title',
      required: true,
      label: 'Title',
      annotations: { source: 'public-root' },
    };
    const input: EditorCompilerInput = {
      schema: { kind: 'scalar', scalar: 'string' },
      fieldContext,
      identityScope: ['public-root'],
    };
    const dialect: EditorCompilerDialect = createDefaultSchemaEditorDialect();
    const options: CreateEditorCompilerRuntimeOptions = { dialects: [dialect] };
    const runtime: EditorCompilerRuntime = createSchemaEditorCompilerRuntime(options);

    for (const exportName of COMPILER_EXPORTS) {
      expect(logic[exportName], exportName).toBeTypeOf('function');
    }
    expect(composeSchemaEditorDialects([dialect])).not.toBe(dialect);
    const plan = compileEditorPlan(runtime, input, config);
    expect(plan.id).toBe('public-surface.editor');
    expect(plan.root).toMatchObject({
      id: 'schema.public-root',
      metadata: {
        display: { label: 'Title' },
        field: { key: 'title', required: true },
      },
    });
    expect(runtime.dialect).toBe(dialect);
    expect(config).toEqual({ planId: 'public-surface.editor', diagnostics: true });
    for (const key of ['dialect', 'resolver', 'registry', 'classifier', 'precedence']) {
      expect(config).not.toHaveProperty(key);
    }
  });

  it('does not expose compiler helpers, transformers, or selector internals', () => {
    for (const exportName of INTERNAL_COMPILER_EXPORTS) {
      expect(exportName in logic, exportName).toBe(false);
    }

    const rootIndex = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
    const capsuleIndex = readFileSync(resolve(ROOT, 'src/schema-editor/index.ts'), 'utf8');
    expect(rootIndex).not.toMatch(/export\s+\*\s+from\s+['"]\.\/schema-editor['"]/);
    expect(capsuleIndex).not.toMatch(/export\s+\*\s+from/);
  });

  it('keeps the package root as the only public entry', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>;
    };
    const exportKeys = Object.keys(packageJson.exports ?? {});

    expect(exportKeys).toEqual(['.']);
    expect(exportKeys).not.toContain('./schema-editor');
    expect(exportKeys.some((key) => /internal|compiler|schema-editor/.test(key))).toBe(false);
  });
});
