import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as vueRenderer from '../src';

const ROOT = resolve(__dirname, '..');

describe('canonical Vue surface', () => {
  it('contains no compatibility context, expression, props, renderer, or store composable', () => {
    for (const file of ['compat.ts', 'context.ts', 'expression.ts', 'processProps.ts', 'renderer.ts', 'useHalfcode.ts', 'legacy.ts']) {
      expect(existsSync(resolve(ROOT, 'src', file)), file).toBe(false);
    }

    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, string> };
    expect(manifest.exports).toEqual({ '.': './src/index.ts' });
  });

  it('exports only the canonical renderer and Schema Editor capsule runtime values', () => {
    expect(Object.keys(vueRenderer).sort()).toEqual([
      'CanonicalHalfcodeRenderer',
      'SchemaEditorSessionRenderer',
      'composeSchemaEditorPresenterRegistries',
      'createSchemaEditorCanonicalRegistry',
      'createSchemaEditorPresenterRegistry',
      'createSchemaEditorRendererIdentityProjection',
      'dispatchSchemaEditorPresenterEvent',
      'renderCanonicalHalfcodeNode',
      'renderSchemaEditorNode',
      'resolveSchemaEditorUnionSelection',
    ]);
  });
});
