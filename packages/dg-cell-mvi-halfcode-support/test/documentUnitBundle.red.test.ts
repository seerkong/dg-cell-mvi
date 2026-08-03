import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ImportResolver } from 'xnl-core';
import * as support from '../src';

interface RawXnlSource {
  path: string;
  text: string;
  xnlDocument: { nodes: readonly unknown[] };
}

interface DocumentSkeletonNode {
  kind: 'domain-node' | 'component-embed' | 'capsule' | 'document-embed';
  tag: string;
  id?: string;
  xId?: string;
  projectionRole?: string;
  scopeId?: string;
  inlineProps?: Readonly<Record<string, unknown>>;
  children?: readonly DocumentSkeletonNode[];
}

interface LoadedDocumentProjection {
  sourceDescriptor:
    | { kind: 'inline'; unitSourceRef: string; region: 'body' }
    | { kind: 'external'; ref: string };
  definitionSource: RawXnlSource;
  rawSource: RawXnlSource;
  contract: Readonly<Record<string, unknown>>;
  rootScope: Readonly<Record<string, unknown>>;
  presentation: Readonly<Record<string, unknown>>;
  skeleton: readonly DocumentSkeletonNode[];
}

interface LoadedDocumentUnit {
  fqn: string;
  kind: string;
  form: string;
  path: string;
  domains: Record<string, unknown>;
  elements?: unknown;
  contract?: Readonly<Record<string, unknown>>;
  document?: LoadedDocumentProjection;
}

interface LoadedBundle {
  units: Record<string, LoadedDocumentUnit>;
  registry: Record<string, { kind: string }>;
  diagnostics: readonly { severity: string; code: string; message: string; path?: string }[];
}

const fixtureRoot = new URL('./fixtures/xnl-unit-bundles', import.meta.url).pathname;

function normalizeFsPath(vfsPath: string): string {
  return path.posix.normalize(vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`);
}

function fixtureResolver(virtualWorkspaceRoot = '/'): ImportResolver {
  const normalizedWorkspaceRoot = normalizeFsPath(virtualWorkspaceRoot);
  const fsPathFor = (vfsPath: string) => {
    const normalizedPath = normalizeFsPath(vfsPath);
    const workspaceRelativePath = normalizedWorkspaceRoot === '/'
      ? normalizedPath
      : normalizedPath.slice(normalizedWorkspaceRoot.length);
    return path.join(fixtureRoot, workspaceRelativePath);
  };
  return {
    readFile(vfsPath) {
      try {
        return readFileSync(fsPathFor(vfsPath), 'utf8');
      } catch {
        return null;
      }
    },
    isDir(vfsPath) {
      try {
        return statSync(fsPathFor(vfsPath)).isDirectory();
      } catch {
        return false;
      }
    },
    readDir(vfsPath) {
      try {
        return readdirSync(fsPathFor(vfsPath));
      } catch {
        return null;
      }
    },
  };
}

function loadFixture(name: string, workspaceRoot = '/'): LoadedBundle {
  return support.loadHalfcodeUnitBundle(fixtureResolver(workspaceRoot), `vfs://@/${name}/`, {
    baseDir: workspaceRoot,
    workspaceRoot,
  }) as unknown as LoadedBundle;
}

let positiveBundle: LoadedBundle | undefined;
let positiveLoadError: unknown;
try {
  positiveBundle = loadFixture('document-units');
} catch (error) {
  positiveLoadError = error;
}

const documentLoaderAvailable = positiveBundle?.units['dg.docs.demo.SystemDesign']?.document !== undefined;

function errorDiagnostics(bundle: LoadedBundle) {
  return bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

function findSkeleton(
  nodes: readonly DocumentSkeletonNode[],
  id: string,
): DocumentSkeletonNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findSkeleton(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

describe('Document Unit XNL loader public surface', () => {
  it('loads the XNL-only Document fixture through the canonical AppBundle loader', () => {
    expect(positiveLoadError, 'loadHalfcodeUnitBundle must accept kind="document" and <Document>')
      .toBeUndefined();
    expect(positiveBundle?.registry['dg.docs.demo.SystemDesign']).toMatchObject({
      kind: 'document',
    });
    expect(positiveBundle?.units['dg.docs.demo.SystemDesign']?.document).toBeDefined();
  });
});

describe.runIf(documentLoaderAvailable)('Document Unit XNL source preservation', () => {
  it('retains inline text, comments, node families, and order in loaded raw source', () => {
    const unit = positiveBundle!.units['dg.docs.demo.SystemDesign'];
    const document = unit.document!;

    expect(document.sourceDescriptor).toEqual({
      kind: 'inline',
      unitSourceRef: 'vfs://@/document-units/documents/system-design.xnl',
      region: 'body',
    });
    expect(document.rawSource.path).toBe('/document-units/documents/system-design.xnl');
    expect(document.rawSource.xnlDocument.nodes).toHaveLength(1);

    const source = document.rawSource.text;
    const orderedTokens = [
      '<!-- inline:heading-before-overview -->',
      'System design',
      '<ArchitectureDecision #overview',
      'The runtime owns occurrence identity.',
      '<!-- inline:embeds-after-domain-content -->',
      '<dg.docs.ReviewPanel #review-panel',
      '<Capsule #architecture',
      '<dg.docs.demo.RelatedDesign #related-design',
    ];
    const positions = orderedTokens.map((token) => source.indexOf(token));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('canonicalizes inline source refs relative to a non-root workspace', () => {
    const bundle = loadFixture('document-units', '/virtual-workspace');
    const document = bundle.units['dg.docs.demo.SystemDesign'].document!;

    expect(document.definitionSource.path).toBe(
      '/virtual-workspace/document-units/documents/system-design.xnl',
    );
    expect(document.sourceDescriptor).toEqual({
      kind: 'inline',
      unitSourceRef: 'vfs://@/document-units/documents/system-design.xnl',
      region: 'body',
    });
  });

  it('loads an external DocumentSource.ref as UI-free raw XNL without replacing definition data', () => {
    const document = positiveBundle!.units['dg.docs.demo.SystemDesignView'].document!;

    expect(document.sourceDescriptor).toEqual({
      kind: 'external',
      ref: 'vfs://./domain/system-design.xnl',
    });
    expect(document.definitionSource.path).toBe(
      '/document-units/documents/system-design-view.xnl',
    );
    expect(document.rawSource.path).toBe(
      '/document-units/documents/domain/system-design.xnl',
    );
    expect(document.rawSource.text).toContain('<!-- external:overview-before-decisions -->');
    expect(document.rawSource.text).toContain('UI-free architecture source');

    const source = document.rawSource.text;
    expect(source.indexOf('<Overview #overview')).toBeLessThan(source.indexOf('<Decision #runtime-owner'));
    expect(source.indexOf('<Decision #runtime-owner')).toBeLessThan(source.indexOf('<Appendix #appendix'));
    expect(document.skeleton).toEqual([]);
  });

  it('loads a directory Document manifest with external source as the folder unit form', () => {
    const unit = positiveBundle!.units['dg.docs.demo.SystemDesignFolder'];
    const document = unit.document!;

    expect(unit).toMatchObject({
      kind: 'document',
      form: 'folder',
      path: '/document-units/documents/system-design-folder',
    });
    expect(unit.elements).toBeUndefined();
    expect(unit.domains).toEqual({});
    expect(document.definitionSource.path).toBe(
      '/document-units/documents/system-design-folder/manifest.xnl',
    );
    expect(document.sourceDescriptor).toEqual({
      kind: 'external',
      ref: 'vfs://../domain/system-design.xnl',
    });
    expect(document.rawSource.path).toBe('/document-units/documents/domain/system-design.xnl');
    expect(document.skeleton).toEqual([]);
  });

  it('parses unique Contract/Scope/Presentation subdomains and keeps source forms exclusive', () => {
    const inlineUnit = positiveBundle!.units['dg.docs.demo.SystemDesign'];
    const inline = inlineUnit.document!;
    const external = positiveBundle!.units['dg.docs.demo.SystemDesignView'].document!;

    expect(inline.contract).toMatchObject({ mode: 'edit', source: 'xnl-source-ref' });
    expect(inline.rootScope).toMatchObject({ scopeId: 'document-root' });
    expect(inline.presentation).toEqual({ id: 'system-design' });
    expect(inline.definitionSource).toBe(inline.rawSource);
    expect(inlineUnit.contract).toBe(inline.contract);
    expect(inlineUnit.elements).toBeUndefined();

    expect(external.contract).toMatchObject({ mode: 'view', source: 'xnl-source-ref' });
    expect(external.rootScope).toMatchObject({ scopeId: 'document-view-root' });
    expect(external.presentation).toEqual({ id: 'system-design-view' });
    expect(external.definitionSource.path).not.toBe(external.rawSource.path);
  });

  it('extracts only explicit embeds/address skeleton and treats x-id as structure, not props', () => {
    const skeleton = positiveBundle!.units['dg.docs.demo.SystemDesign'].document!.skeleton;
    const reviewPanel = findSkeleton(skeleton, 'review-panel');
    const summaryPanel = findSkeleton(skeleton, 'summary-panel');
    const architecture = findSkeleton(skeleton, 'architecture');
    const related = findSkeleton(skeleton, 'related-design');
    const unknownDomain = findSkeleton(skeleton, 'overview');

    expect(reviewPanel).toMatchObject({
      kind: 'component-embed',
      tag: 'dg.docs.ReviewPanel',
      xId: 'review-panel',
      projectionRole: 'main',
      inlineProps: { tone: 'review' },
    });
    expect(reviewPanel?.inlineProps).not.toHaveProperty('x-id');
    expect(summaryPanel).toMatchObject({ kind: 'component-embed', xId: 'summary-panel' });
    expect(architecture).toMatchObject({
      kind: 'capsule',
      xId: 'architecture',
      scopeId: 'architecture-scope',
    });
    expect(related).toMatchObject({ kind: 'document-embed', xId: 'related-design' });
    expect(unknownDomain).toMatchObject({
      kind: 'domain-node',
      tag: 'ArchitectureDecision',
    });
    expect(skeleton.some((node) => (node as { kind: string }).kind === 'atom')).toBe(false);
  });
});

describe.runIf(documentLoaderAvailable)('Document Unit invalid XNL fixtures', () => {
  it('reports duplicate unique subdomains, mixed source forms, duplicate x-id, and manifest mismatches', () => {
    const bundle = loadFixture('document-unit-negatives');
    const diagnostics = errorDiagnostics(bundle);
    const messages = diagnostics.map((diagnostic) => diagnostic.message).join('\n');

    for (const subdomain of [
      'DocumentContract',
      'DocumentSource',
      'Scope',
      'DocumentPresentation',
    ]) {
      expect(messages).toMatch(new RegExp(`${subdomain}.*(?:duplicate|more than once)|(?:duplicate|more than once).*${subdomain}`, 'i'));
    }
    expect(messages).toMatch(/inline.*external|external.*inline/i);
    expect(messages).toMatch(/x-id.*shared-target.*duplicate|duplicate.*x-id.*shared-target/i);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_DOCUMENT_DSL_INVALID' }),
      expect.objectContaining({ code: 'HALFCODE_UNIT_FQN_CONFLICT' }),
      expect.objectContaining({ code: 'HALFCODE_UNIT_KIND_MISMATCH' }),
    ]));
    expect(diagnostics.every((diagnostic) => typeof diagnostic.path === 'string')).toBe(true);
  });
});
