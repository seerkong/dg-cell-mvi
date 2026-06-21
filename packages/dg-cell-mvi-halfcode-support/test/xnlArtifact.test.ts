import { describe, expect, it } from 'vitest';
import { XNL, parseXnl, type ImportResolver } from 'xnl-core';
import {
  applyHalfcodeDocumentMutationToXnl,
  createXnlArtifactPort,
  diffHalfcodeXnlDocuments,
  loadHalfcodeXnlDocument,
  parseHalfcodeDocumentFromXnl,
  resolveHalfcodeXnlImports,
  serializeHalfcodeDocumentToXnl,
  serializeHalfcodeXnlArtifact,
  type HalfcodeXnlArtifactSnapshot,
} from '../src';
import { canonicalAdminCrudDocumentFixture } from 'dg-cell-mvi-halfcode-contract';
import type { ArtifactRef } from 'dg-cell-mvi-halfcode-contract';

function mockResolver(files: Record<string, string>): ImportResolver {
  const dirs = new Set<string>(['/']);
  for (const file of Object.keys(files)) {
    let dir = file.slice(0, file.lastIndexOf('/')) || '/';
    while (dir && dir !== '/') {
      dirs.add(dir);
      dir = dir.slice(0, dir.lastIndexOf('/')) || '/';
    }
  }
  return {
    readFile: (path) => files[path] ?? null,
    isDir: (path) => dirs.has(path) && !(path in files),
    readDir: (path) => {
      if (!dirs.has(path)) return null;
      const prefix = path === '/' ? '/' : `${path}/`;
      return [...new Set(
        Object.keys(files)
          .filter((file) => file.startsWith(prefix))
          .map((file) => file.slice(prefix.length).split('/')[0]),
      )];
    },
  };
}

function keyFor(ref: ArtifactRef): string {
  return ref.uri || `${ref.id}@${ref.version || 'latest'}`;
}

describe('halfcode XNL artifact pipeline', () => {
  it('roundtrips canonical HalfcodeDocument through xnl-core text and AST', () => {
    const core = serializeHalfcodeDocumentToXnl(canonicalAdminCrudDocumentFixture);
    const parsed = parseHalfcodeDocumentFromXnl(core);

    expect(core).toContain('<HalfcodeDocument #admin-product');
    expect(core).not.toContain('</HalfcodeDocument>');
    expect(parsed.xnlDocument.nodes[0]).toMatchObject({ kind: 'DataElement', tag: 'HalfcodeDocument' });
    expect(parsed.document.product.id).toBe('admin-product');
    expect(parsed.document.product.name).toBe('工业化 Admin 示例');
    expect(parsed.document.materials.find((material) => material.kind === 'crud')).toMatchObject({
      id: 'users-crud',
      fields: expect.arrayContaining([
        expect.objectContaining({ id: 'score', path: 'score', valueType: 'number' }),
      ]),
    });
    expect(parsed.document.materials.find((material) => material.kind === 'admin-shell')).toMatchObject({
      permissions: [{ id: 'users.read', action: 'read', subject: 'users' }],
      theme: { preset: 'light', tokens: { primary: '#1677ff' } },
      i18n: { zh: { users: '用户' } },
    });
  });

  it('roundtrips v2 ElementTree, Scope, and Contract domains through XNL', () => {
    const core = serializeHalfcodeDocumentToXnl({
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v2',
      product: { id: 'element-product', version: '1.0.0', name: 'Element App' },
      modules: [],
      materials: [],
      elementTree: {
        root: 'users-page',
        elements: [{
          kind: 'page',
          id: 'users-page',
          version: '1.0.0',
          route: '/users',
          title: '用户',
          mount: 'both',
          scopeRef: 'scopes:users-page',
          contractRef: 'contracts:users-page',
          children: [{
            kind: 'capsule',
            id: 'users-filter',
            version: '1.0.0',
            scopeRef: 'scopes:users-filter',
            contractRef: 'contracts:users-filter',
            children: [{
              kind: 'atomic',
              id: 'keyword-input',
              version: '1.0.0',
              ui: 'element-plus:ElInput',
              propsRef: 'config:users-filter.keywordInput',
              contractRef: 'contracts:keyword-input',
            }],
          }],
        }],
      },
      scopes: [{
        id: 'users-page',
        version: '1.0.0',
        runtimeProfileRef: 'runtime:browser-local',
        configRef: 'config:users-page',
        stateSeedRef: 'state-seed:users-page',
        effectsRef: 'effects:users-page',
      }],
      contracts: [{
        id: 'users-page',
        version: '1.0.0',
        propsDefRef: 'contracts-def:users-page.props',
        slotsDefRef: 'contracts-def:users-page.slots',
        acceptsRef: 'events:users-page.accepts',
        emitsRef: 'commands:users-page.emits',
        exposesRef: 'contracts-def:users-page.exposes',
      }],
    });
    const parsed = parseHalfcodeDocumentFromXnl(core);

    expect(core).toContain('<ElementTree');
    expect(core).toContain('<PageElement #users-page');
    expect(core).toContain('<ElInput #keyword-input');
    expect(core).not.toContain('<AtomicElement');
    expect(core).not.toContain('id = "keyword-input"');
    expect(parsed.document.apiVersion).toBe('halfcode.dg-cell-mvi/v2');
    expect(parsed.document.elementTree?.root).toBe('users-page');
    expect(parsed.document.elementTree?.elements[0]).toMatchObject({
      kind: 'page',
      id: 'users-page',
      children: [
        expect.objectContaining({
          kind: 'capsule',
          id: 'users-filter',
          children: [expect.objectContaining({ kind: 'atomic', id: 'keyword-input' })],
        }),
      ],
    });
    expect(parsed.document.scopes?.[0]).toMatchObject({
      id: 'users-page',
      effectsRef: 'effects:users-page',
    });
    expect(parsed.document.contracts?.[0]).toMatchObject({
      id: 'users-page',
      acceptsRef: 'events:users-page.accepts',
    });
  });

  it('maps authoring document mutations to xnl-core path and mutation evidence', () => {
    const core = serializeHalfcodeDocumentToXnl(canonicalAdminCrudDocumentFixture);
    const applied = applyHalfcodeDocumentMutationToXnl(core, {
      kind: 'document-mutation',
      mutation: { kind: 'set-product-settings', path: 'layout.dense', value: true },
    });

    const xnlDocument = parseXnl(applied.core);
    const resolved = XNL.path.resolve(
      xnlDocument,
      "#admin-product:attributes::'product':attributes::'settings'::'layout'::'dense'",
    );
    const parsed = parseHalfcodeDocumentFromXnl(applied.core);

    expect(resolved).toBe(true);
    expect(parsed.document.product.settings).toEqual({ layout: { dense: true } });
    expect(applied.xnlMutations.length).toBeGreaterThan(0);
    expect(applied.xnlMutations.some((mutation) => String(mutation.path).includes("::'dense'"))).toBe(true);

    const replaceEvidence = applied.xnlMutations;
    const reapplied = XNL.mutation.apply(
      JSON.parse(JSON.stringify(parseXnl(core).nodes[0])),
      replaceEvidence,
    );
    expect(reapplied).toEqual(parseXnl(applied.core).nodes[0]);
  });

  it('uses xnl-core diffNodes/applyMutations for compatible document replacement', () => {
    const core = serializeHalfcodeDocumentToXnl(canonicalAdminCrudDocumentFixture);
    const nextDocument = {
      ...canonicalAdminCrudDocumentFixture,
      product: {
        ...canonicalAdminCrudDocumentFixture.product,
        name: '工业化 Admin 示例 v2',
      },
    };
    const applied = applyHalfcodeDocumentMutationToXnl(core, {
      kind: 'replace-document',
      document: nextDocument,
    });
    const diffEvidence = diffHalfcodeXnlDocuments(core, applied.core);

    expect(diffEvidence.some((mutation) => String(mutation.path).includes("::'name'"))).toBe(true);
    const reapplied = XNL.mutation.apply(
      JSON.parse(JSON.stringify(parseXnl(core).nodes[0])),
      diffEvidence,
      { metadataIdMode: 'identity' },
    );
    expect(reapplied).toEqual(parseXnl(applied.core).nodes[0]);
  });

  it('uses xnl-core loader for Prefabs/export material expansion', () => {
    const core = `<CrudMaterial #usersCrud proto=CrudBase export=true { entity = "users" } [
  <Field #score { path = "score" valueType = "number" }>
] (
  <Prefabs [
    <CrudMaterial #CrudBase export=true { version = "1.0.0" entity = "base" resourceRef = { id = "base-resource" } operations = [] table = {} form = {} } [
      <Field #name { path = "name" valueType = "string" }>
    ]>
  ]>
)>`;

    const loaded = loadHalfcodeXnlDocument(core);
    const material = loaded.xnlDocument.nodes[0] as any;

    expect(material.attributes.version).toBe('1.0.0');
    expect(material.body.map((field: any) => field.id.name)).toEqual(['name', 'score']);
    expect(loaded.exports.CrudMaterial.usersCrud).toBeDefined();
    expect(loaded.exports.CrudMaterial.CrudBase).toBeDefined();
  });

  it('uses xnl-core import resolver for vfs material packages', () => {
    const files = {
      '/defs/CrudBase.xnl': '<CrudMaterial #CrudBase export=true { version = "1.0.0" entity = "users" resourceRef = { id = "users-resource" } operations = [] fields = [] table = {} form = {} }>',
    };
    const core = `<Imports [
  <Import as="crud" src="vfs://@/defs/CrudBase.xnl">
]>
<HalfcodeDocument #admin-product { ref = "crud:CrudBase" }>`;

    const resolved = resolveHalfcodeXnlImports(core, mockResolver(files), {
      baseDir: '/',
      workspaceRoot: '/',
    });

    expect(resolved.symbols.crud.CrudBase).toMatchObject({
      tag: 'CrudMaterial',
      id: { name: 'CrudBase' },
      attributes: { entity: 'users' },
    });
  });

  it('keeps core XNL, halfcodeExt, and graphExt as separate artifact domains', async () => {
    const artifact = serializeHalfcodeXnlArtifact(
      canonicalAdminCrudDocumentFixture,
      { inspector: { selectedMaterialId: 'users-crud' } },
      { nodes: [{ id: 'users-crud', x: 12, y: 24 }] },
    );
    const store = new Map<string, HalfcodeXnlArtifactSnapshot>();
    store.set('admin-doc@latest', {
      ref: { id: 'admin-doc' },
      artifact,
      revision: '1',
    });
    const port = createXnlArtifactPort({
      async load(ref) {
        const snapshot = store.get(keyFor(ref));
        if (!snapshot) throw new Error(`missing ${keyFor(ref)}`);
        return snapshot;
      },
      async save(snapshot) {
        const next = { ...snapshot, revision: String(Number(snapshot.revision) + 1) };
        store.set(keyFor(next.ref), next);
        return next;
      },
    });

    const loaded = await port.load({ id: 'admin-doc' });
    const originalCore = store.get('admin-doc@latest')?.artifact.core;
    await port.save({
      ...loaded,
      metadata: {
        halfcodeExt: { inspector: { selectedMaterialId: 'admin-shell' } },
        graphExt: { nodes: [{ id: 'admin-shell', x: 40, y: 64 }] },
      },
    });
    const mutated = await port.mutate?.({ id: 'admin-doc' }, {
      kind: 'document-mutation',
      mutation: { kind: 'set-product-settings', path: 'layout.dense', value: true },
    });

    const saved = store.get('admin-doc@latest');
    expect(saved?.artifact.halfcodeExt).toEqual({ inspector: { selectedMaterialId: 'admin-shell' } });
    expect(saved?.artifact.graphExt).toEqual({ nodes: [{ id: 'admin-shell', x: 40, y: 64 }] });
    expect(originalCore).toContain('<HalfcodeDocument #admin-product');
    expect(saved?.artifact.core).toContain('<HalfcodeDocument #admin-product');
    expect(mutated?.document.product.settings).toEqual({ layout: { dense: true } });
    expect(mutated?.metadata?.lastXnlMutations).toBeDefined();
  });
});
