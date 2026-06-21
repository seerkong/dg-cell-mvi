import { describe, expect, it } from 'vitest';
import { createBrowserArtifactPort, createMemoryArtifactPort } from '../src';
import type { ArtifactMutation, ArtifactSnapshot, HalfcodeDocument } from 'dg-cell-mvi-halfcode-contract';

function createDocument(productId = 'product.admin'): HalfcodeDocument {
  return {
    kind: 'HalfcodeDocument',
    apiVersion: 'halfcode.dg-cell-mvi/v1',
    product: {
      id: productId,
      version: '1.0.0',
      tags: ['admin'],
    },
    modules: [],
    materials: [],
  };
}

function createSnapshot(id = 'admin.document'): ArtifactSnapshot {
  return {
    ref: { id },
    document: createDocument(),
    revision: '1',
  };
}

function applyMutation(document: HalfcodeDocument, mutation: ArtifactMutation): HalfcodeDocument {
  if (mutation.kind === 'replace-document') return mutation.document;
  if (mutation.mutation.kind !== 'set-product-settings') return document;
  return {
    ...document,
    product: {
      ...document.product,
      settings: { layout: { dense: mutation.mutation.value as boolean } },
    },
  };
}

describe('artifact ports', () => {
  it('stores halfcode document artifacts in memory and applies injected mutations', async () => {
    const port = createMemoryArtifactPort({
      snapshots: [createSnapshot()],
      applyMutation,
      now: () => '2026-06-28T00:00:00.000Z',
    });

    const saved = await port.mutate?.({ id: 'admin.document' }, {
      kind: 'document-mutation',
      mutation: { kind: 'set-product-settings', path: 'layout.dense', value: true },
    });

    expect(saved?.revision).toBe('2');
    expect(saved?.document.product.settings).toEqual({ layout: { dense: true } });
    await expect(port.list?.({ productId: 'product.admin' })).resolves.toEqual([{ id: 'admin.document' }]);
  });

  it('uses injected browser storage instead of owning persistence directly', async () => {
    const map = new Map<string, string>();
    const storage = {
      get length() {
        return map.size;
      },
      key(index: number) {
        return [...map.keys()][index] ?? null;
      },
      getItem(key: string) {
        return map.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        map.set(key, value);
      },
    };
    const port = createBrowserArtifactPort(storage, { now: () => '2026-06-28T00:00:00.000Z' });

    await port.save(createSnapshot('browser.document'));

    expect(await port.load({ id: 'browser.document' })).toMatchObject({
      ref: { id: 'browser.document' },
      revision: '2',
    });
    await expect(port.list?.({ productId: 'product.admin' })).resolves.toEqual([{ id: 'browser.document' }]);
  });
});
