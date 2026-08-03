import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '../..');
const CONTRACT_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-contract');
const LOGIC_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-logic');
const SUPPORT_PROJECTION_ROOT = resolve(PACKAGE_ROOT, 'src/xnl-projection');
const TYPECHECK_PROBE = resolve(
  PACKAGE_ROOT,
  'typecheck/xnl-projection-presenter-public-surface.typecheck.ts',
);
const PROJECTION_DOCS_ROOT = resolve(
  PROJECT_ROOT,
  'docs/halfcode/dsl-bundle/spec/frontend/xnl-projection',
);
const FACTORY_NAME = 'createXnlProjectionPresenterRuntimeFacet';
const SKIPPED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

function files(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name))) {
      return [];
    }
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function sources(root: string): string {
  return files(root)
    .filter((file) => ['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extname(file)))
    .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

function manifest(root: string): PackageManifest {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
}

function productionDependencies(root: string): readonly string[] {
  const packageManifest = manifest(root);
  return Object.keys({
    ...packageManifest.dependencies,
    ...packageManifest.peerDependencies,
  });
}

function isUiDependency(name: string): boolean {
  return /^(?:vue(?:-|$)|@vue\/|tiptap(?:-|$)|@tiptap\/|prosemirror(?:-|$)|@?prosemirror-|react$|react-dom$|jsdom$|happy-dom$)/.test(name);
}

function typescriptSnippets(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  if (extname(file) !== '.md') return [source];
  return Array.from(
    source.matchAll(/```(?:ts|typescript)\s*\n([\s\S]*?)```/g),
    (match) => match[1] ?? '',
  );
}

function successfulFactoryCalls(source: string, file: string): readonly number[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const lines = source.split('\n');
  const arities: number[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === FACTORY_NAME
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      if (!lines[line - 1]?.includes('@ts-expect-error')) {
        arities.push(node.arguments.length);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return arities;
}

describe('XNL Projection Presenter architecture and residue boundary', () => {
  it('keeps production dependencies directed from contract through logic to support', () => {
    const reverseDependencies = new Set([
      'dg-cell-mvi-halfcode-support',
      'xnl-core',
      'xnl-vcs',
      'xnl-vfs',
    ]);
    for (const root of [CONTRACT_ROOT, LOGIC_ROOT]) {
      expect(
        productionDependencies(root).filter((dependency) =>
          reverseDependencies.has(dependency) || isUiDependency(dependency),
        ),
        relative(PROJECT_ROOT, root),
      ).toEqual([]);
    }

    expect(productionDependencies(PACKAGE_ROOT).filter((name) =>
      name === 'xnl-vcs' || isUiDependency(name),
    ))
      .toEqual([]);
  });

  it('keeps projection production imports renderer-neutral and free of reverse dependencies', () => {
    const contractLogicSource = [
      sources(resolve(CONTRACT_ROOT, 'src/xnl-projection')),
      sources(resolve(LOGIC_ROOT, 'src/xnl-projection')),
    ].join('\n');
    const forbiddenReverseImport = /(?:from|import\s*\()\s*['"](?:dg-cell-mvi-halfcode-support|xnl-core|xnl-vfs|xnl-vcs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom)(?:\/[^'"]*)?['"]/;
    expect(contractLogicSource).not.toMatch(forbiddenReverseImport);

    const supportSource = sources(SUPPORT_PROJECTION_ROOT);
    const forbiddenSupportImport = /(?:from|import\s*\()\s*['"](?:xnl-vcs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom|jsdom|happy-dom)(?:\/[^'"]*)?['"]/;
    const forbiddenBrowserApi = /\b(?:window|globalThis\.document|document\.|querySelector|HTMLElement|HTML[A-Z][A-Za-z]*Element|NodeView)\b/;
    expect(supportSource).not.toMatch(forbiddenSupportImport);
    expect(supportSource).not.toMatch(forbiddenBrowserApi);
  });

  it('keeps the legal package-root type consumer free of widening and raw casts', () => {
    const typecheckSource = readFileSync(TYPECHECK_PROBE, 'utf8');
    expect(typecheckSource).not.toMatch(/\bany\b/);
    expect(typecheckSource).not.toMatch(/\bas\b/);
    expect(typecheckSource).not.toMatch(/\[[^\]]*:\s*string\s*\]/);
    expect(typecheckSource).toContain('type ScopeFacadeHasExactKeys = Expect<');
    expect(typecheckSource).toContain('@ts-expect-error the projected Scope facade is readonly.');
    expect(typecheckSource).toContain('@ts-expect-error ungranted Scope parent identity is excluded.');
  });

  it('keeps every repository TypeScript example on owned three-argument facet construction', () => {
    const findings = files(PROJECT_ROOT)
      .filter((file) => ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md'].includes(extname(file)))
      .flatMap((file) => typescriptSnippets(file).flatMap((source) =>
        successfulFactoryCalls(source, file).map((arity) => ({ file, arity })),
      ));

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.filter(({ arity }) => arity !== 3)).toEqual([]);
  });

  it('keeps authority selection grant-driven and safety claims bounded', () => {
    const ownershipSource = readFileSync(
      resolve(SUPPORT_PROJECTION_ROOT, 'presenterCapabilityOwnership.ts'),
      'utf8',
    );
    const captureStart = ownershipSource.indexOf(
      'export function captureXnlProjectionPresenterProtocolGrants',
    );
    const captureEnd = ownershipSource.indexOf('function findExplicitDataDescriptor', captureStart);
    const captureSource = ownershipSource.slice(captureStart, captureEnd);
    expect(captureSource).toContain('for (const grant of resolution.record.grants)');
    expect(captureSource).not.toMatch(
      /(?:Reflect\.ownKeys|Object\.(?:keys|values|entries))\(source\)|for\s*\([^)]*\bin\s+source\)/,
    );

    const capabilityTest = readFileSync(
      resolve(PACKAGE_ROOT, 'test/xnlProjectionPresenterCapabilities.test.ts'),
      'utf8',
    );
    const runnerTest = readFileSync(
      resolve(PACKAGE_ROOT, 'test/xnlProjectionPresenterRunner.test.ts'),
      'utf8',
    );
    expect(capabilityTest).toContain('renamedEffectCapability');
    expect(capabilityTest).toContain('source fields must not be scanned');
    expect(runnerTest).toContain('trusted-renamed-effectful-method');
    expect(runnerTest).toContain('expect(internalEffects).toBe(1)');

    const docs = files(PROJECTION_DOCS_ROOT)
      .filter((file) => extname(file) === '.md')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(docs).toContain('positive grants');
    expect(docs).toContain('closure');
    expect(docs).not.toMatch(/runtime (?:proves|guarantees|ensures) (?:arbitrary )?(?:closure )?purity/i);
    expect(docs).not.toMatch(/(?:rejects|blocks|forbids) .*?(?:writer|valueHost|vfs).*?(?:field|name)/i);
  });
});
