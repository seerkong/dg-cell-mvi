import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as vuePackage from '../src';

const PACKAGE_ROOT = resolve(__dirname, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '../..');
const SRC = join(PACKAGE_ROOT, 'src');
const SCHEMA_EDITOR = join(SRC, 'schema-editor');
const DOCS = join(
  WORKSPACE_ROOT,
  'docs/halfcode/dsl-bundle/spec/frontend/schema-editor',
);
const ALLOWED_EXTERNAL_IMPORTS = new Set([
  'dg-cell-mvi-halfcode-contract',
  'dg-cell-mvi-halfcode-support',
  'vue',
]);
const PUBLIC_PROCESSORS = [
  'composeSchemaEditorPresenterRegistries',
  'createSchemaEditorCanonicalRegistry',
  'createSchemaEditorPresenterRegistry',
  'createSchemaEditorRendererIdentityProjection',
  'dispatchSchemaEditorPresenterEvent',
  'renderSchemaEditorNode',
] as const;

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = join(directory, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

interface ImportFact {
  readonly file: string;
  readonly specifier: string;
  readonly importedNames: readonly string[];
}

function importFacts(): {
  readonly imports: readonly ImportFact[];
  readonly dynamicImports: readonly string[];
} {
  const imports: ImportFact[] = [];
  const dynamicImports: string[] = [];

  for (const file of files(SCHEMA_EDITOR).filter((candidate) => candidate.endsWith('.ts'))) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const importedNames = ts.isImportDeclaration(node)
          && node.importClause?.namedBindings
          && ts.isNamedImports(node.importClause.namedBindings)
          ? node.importClause.namedBindings.elements.map((element) => element.name.text)
          : [];
        imports.push({
          file,
          specifier: node.moduleSpecifier.text,
          importedNames,
        });
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        dynamicImports.push(relative(SCHEMA_EDITOR, file));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return { imports, dynamicImports };
}

describe('Schema Editor Vue public boundary', () => {
  it('exposes one package-root entry and the complete implemented runtime surface', () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { readonly exports: Readonly<Record<string, string>> };

    expect(manifest.exports).toEqual({ '.': './src/index.ts' });
    expect(Object.keys(vuePackage).sort()).toEqual([
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
    for (const name of PUBLIC_PROCESSORS) {
      expect(vuePackage[name], name).toHaveLength(3);
    }
  });

  it('contains no deferred or not-implemented public declaration', () => {
    const publicSource = [
      readFileSync(join(SRC, 'index.ts'), 'utf8'),
      readFileSync(join(SCHEMA_EDITOR, 'index.ts'), 'utf8'),
      readFileSync(join(SCHEMA_EDITOR, 'contracts.ts'), 'utf8'),
    ].join('\n');

    expect(publicSource).not.toMatch(/SchemaEditorDeferred/);
    expect(publicSource).not.toMatch(/NOT_IMPLEMENTED/);
    expect(files(SCHEMA_EDITOR).map((file) => relative(SCHEMA_EDITOR, file)))
      .not.toContain('deferredProcessors.ts');
  });
});

describe('Schema Editor Vue dependency and ownership boundary', () => {
  it('uses package roots and capsule-local imports only', () => {
    const { imports, dynamicImports } = importFacts();

    for (const fact of imports) {
      if (fact.specifier.startsWith('.')) {
        const localTarget = resolve(dirname(fact.file), fact.specifier);
        const isCapsuleLocal = localTarget === SCHEMA_EDITOR
          || localTarget.startsWith(`${SCHEMA_EDITOR}${sep}`);
        const isCanonicalRenderer = localTarget === join(SRC, 'canonicalRenderer');
        expect(
          isCapsuleLocal || isCanonicalRenderer,
          `${relative(SCHEMA_EDITOR, fact.file)} imports ${fact.specifier}`,
        ).toBe(true);
        continue;
      }
      expect(
        ALLOWED_EXTERNAL_IMPORTS.has(fact.specifier),
        `${relative(SCHEMA_EDITOR, fact.file)} imports ${fact.specifier}`,
      ).toBe(true);
      expect(fact.specifier.split('/')).not.toContain('src');
    }
    expect(dynamicImports).toEqual([]);
  });

  it('does not own UI kit, Flow, XNL mutation, VFS, database, or browser IO', () => {
    const source = files(SCHEMA_EDITOR)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    for (const forbidden of [
      /from\s+['"]element-plus(?:\/[^'"]*)?['"]/,
      /from\s+['"][^'"]*(?:flow|bp-ctrl-flow|work-ctrl-flow)[^'"]*['"]/i,
      /from\s+['"]xnl(?:-core)?(?:\/[^'"]*)?['"]/i,
      /from\s+['"][^'"]*(?:vfs|database|indexeddb)[^'"]*['"]/i,
      /\bdocument\.|\bwindow\.|\blocalStorage\b|\bindexedDB\b/,
      /\bfetch\s*\(/,
      /\b(?:apply|write|persist)(?:Xnl|XNL)\b/,
      /\b(?:create|open)(?:Database|Vfs|VFS)\b/,
    ]) {
      expect(source, forbidden.source).not.toMatch(forbidden);
    }
  });

  it('does not expose or own ValueHost, optimistic mutation, or session disposal', () => {
    const sources = files(SCHEMA_EDITOR)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => ({
        file,
        source: readFileSync(file, 'utf8'),
      }));
    const { imports } = importFacts();

    expect(
      imports.flatMap((fact) => fact.importedNames),
    ).not.toContain('SchemaEditorValueHost');
    for (const { file, source } of sources) {
      expect(source, relative(SCHEMA_EDITOR, file)).not.toMatch(/bridge\.valueHost/);
      expect(source, relative(SCHEMA_EDITOR, file)).not.toMatch(/session\.dispose\s*\(/);
      expect(source, relative(SCHEMA_EDITOR, file)).not.toMatch(
        /optimistic|applyCommand|applySchemaEditorCommand/i,
      );
    }
  });
});

describe('Schema Editor documentation truth', () => {
  it('documents the implemented Vue lifecycle and the downstream host ownership', () => {
    const docs = files(DOCS)
      .filter((file) => file.endsWith('.md'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(docs).toMatch(/SchemaEditorPresenterRegistry/);
    expect(docs).toMatch(/SchemaEditorSessionRenderer/);
    expect(docs).toMatch(/wildcardBindings/);
    expect(docs).toMatch(/createSchemaEditorCanonicalRegistry/);
    expect(docs).toMatch(/componentIdentity:\s*'Editor'/);
    expect(docs).toMatch(/normalized presenter event/i);
    expect(docs).toMatch(/Element Plus presenters/);
    expect(docs).toMatch(/26 项 presenter matrix|26 个稳定 id\/alias/);
    expect(docs).toMatch(/Workbench Flow Editor.*G4 consumer migration 已完成/);
    expect(docs).toMatch(/FlowSchemaEditorValueHost/);
    expect(docs).toMatch(/raw\/code 只能通过显式 stable presenter id|raw JSON \/ raw code 不是 fallback/);
    expect(docs).not.toMatch(
      /(?:Vue renderer|presenter registry).{0,40}(?:尚未实现|未实现)/i,
    );
  });
});
