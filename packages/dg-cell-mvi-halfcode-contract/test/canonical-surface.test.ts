import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contract from 'dg-cell-mvi-halfcode-contract';
import {
  validateStructureSchemaCandidate,
  validateStructureSchema,
  type CollectionIdentityHint,
  type EditorCollectionPlanMetadata,
  type SchemaEditorContractRecord,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';

const ROOT = resolve(__dirname, '..');

describe('canonical contract surface', () => {
  it('does not restore retired schema, state, message, or renderer-port modules', () => {
    for (const file of ['schema.ts', 'state.ts', 'events.ts', 'effects.ts', 'projection.ts', 'legacy.ts']) {
      expect(existsSync(resolve(ROOT, 'src', file)), file).toBe(false);
    }

    const index = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
    const ports = readFileSync(resolve(ROOT, 'src/ports.ts'), 'utf8');
    expect(index).not.toMatch(/\.\/(schema(?=['"])|state|events|effects|projection)/);
    expect(ports).toMatch(/export interface ArtifactPort/);
    expect(ports).not.toMatch(/interface (Schema|DataSource|Expression|PluginManifest|Style|ComponentRegistry)Port/);
  });

  it('keeps canonical document and unit APIs available from the package root', () => {
    expect(contract.validateHalfcodeDocument).toBeTypeOf('function');
    expect(contract.createEmptyCompiledPlans).toBeTypeOf('function');
  });

  it('publishes renderer-neutral schema-editor contract types from the package root', () => {
    const constraints: SchemaEditorContractRecord = { minItems: 1 };
    const identity: CollectionIdentityHint = {
      strategy: 'property',
      path: ['id'],
      fallback: 'ephemeral',
    };
    const metadata: EditorCollectionPlanMetadata = {
      display: {
        label: 'Rows',
        visible: true,
        readOnly: false,
      },
      constraints,
      itemDefault: { id: 'new-row' },
      identity,
    };
    const schema: StructureSchema = {
      kind: 'array',
      constraints,
      identity,
      itemDefault: metadata.itemDefault ?? null,
      item: {
        kind: 'object',
        fields: [{ key: 'id', schema: { kind: 'scalar', scalar: 'string' } }],
        required: ['id'],
      },
    };

    expect(validateStructureSchema(schema)).toEqual({ ok: true, issues: [] });
    expect(validateStructureSchemaCandidate(
      undefined,
      { schema, candidate: [{ id: 'row-1' }] },
      {},
    )).toEqual({ ok: true, issues: [] });
    expect(metadata.identity).toEqual(identity);
    expect(contract.validateEditorPlan).toBeTypeOf('function');
  });

  it('keeps one production root plus the canonical test-fixture entry', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>;
    };
    const exportKeys = Object.keys(packageJson.exports ?? {});

    expect(exportKeys).toEqual(['.', './test-fixtures/xnl-rich-document']);
    expect(exportKeys).not.toContain('./schema-editor');
    expect(exportKeys.filter((key) => key !== './test-fixtures/xnl-rich-document')
      .some((key) => /internal|schema-editor|test-fixtures/.test(key))).toBe(false);
  });
});
