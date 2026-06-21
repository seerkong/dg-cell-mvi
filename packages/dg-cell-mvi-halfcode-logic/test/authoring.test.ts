import { describe, expect, it } from 'vitest';
import { applyDocumentMutation, compilePreviewAfterMutation } from '../src/authoring';
import type { HalfcodeDocument } from 'dg-cell-mvi-halfcode-contract';

function createDocument(): HalfcodeDocument {
  return {
    kind: 'HalfcodeDocument',
    apiVersion: 'halfcode.dg-cell-mvi/v1',
    product: {
      id: 'product.admin',
      version: '1.0.0',
      name: 'Admin',
      entryModuleId: 'module.admin',
    },
    modules: [{
      id: 'module.admin',
      version: '1.0.0',
      materialRefs: [{ id: 'users.view', version: '1.0.0' }],
    }],
    materials: [{
      kind: 'view',
      id: 'users.view',
      version: '1.0.0',
      root: {
        id: 'root',
        component: { kind: 'intrinsic', ref: 'div' },
      },
    }],
    stateModels: [{
      id: 'users.state',
      version: '1.0.0',
      owner: 'runtime',
      fields: [],
    }],
  };
}

describe('halfcode authoring mutations', () => {
  it('updates product settings without mutating the source document', () => {
    const document = createDocument();
    const next = applyDocumentMutation(document, {
      kind: 'set-product-settings',
      path: 'layout.dense',
      value: true,
    });

    expect(next.product.settings).toEqual({ layout: { dense: true } });
    expect(document.product.settings).toBeUndefined();
  });

  it('compiles preview plans after document mutation', () => {
    const result = compilePreviewAfterMutation(createDocument(), {
      kind: 'upsert-material',
      material: {
        kind: 'view',
        id: 'orders.view',
        version: '1.0.0',
        root: {
          id: 'orders-root',
          component: { kind: 'intrinsic', ref: 'section' },
        },
      },
    });

    expect(result.document?.materials.some((material) => material.id === 'orders.view')).toBe(true);
    expect(result.plans.renderPlans.some((plan) => plan.materialRef.id === 'orders.view')).toBe(true);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });
});
