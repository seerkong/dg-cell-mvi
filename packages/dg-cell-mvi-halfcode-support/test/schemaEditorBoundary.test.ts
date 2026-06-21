import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  createSchemaEditorSession,
  lowerEditorPlan,
  resolveSchemaEditorCommand,
  resolveSchemaEditorScopeBridge,
} from '../src';

const PACKAGE_ROOT = resolve(__dirname, '..');
const SRC = join(PACKAGE_ROOT, 'src');
const SCHEMA_EDITOR = join(SRC, 'schema-editor');
const ALLOWED_EXTERNAL_IMPORTS = new Set([
  'dg-cell-mvi-halfcode-contract',
  'xnl-core',
]);
const ALLOWED_XNL_IMPORTS = new Set([
  'DataElementNode',
  'MakeWord',
  'XnlDocument',
  'XnlNode',
  'parseXnlSingleNode',
  'stringifyLineBlock',
]);

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
        && node.moduleSpecifier !== undefined
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const importedNames = ts.isImportDeclaration(node)
          ? importNames(node.importClause)
          : exportNames(node.exportClause);
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

function importNames(clause: ts.ImportClause | undefined): string[] {
  if (!clause) return [];
  const names = clause.name ? [clause.name.text] : [];
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    names.push(...clause.namedBindings.elements.map((element) => element.name.text));
  }
  return names;
}

function exportNames(clause: ts.NamedExportBindings | undefined): string[] {
  return clause && ts.isNamedExports(clause)
    ? clause.elements.map((element) => element.name.text)
    : [];
}

describe('schema-editor support public boundary', () => {
  it('exports only the package-root capsule and all public processors keep arity three', () => {
    const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      readonly exports: Readonly<Record<string, string>>;
    };

    expect(packageJson.exports).toEqual({ '.': './src/index.ts' });
    expect(resolveSchemaEditorCommand).toHaveLength(3);
    expect(createSchemaEditorSession).toHaveLength(3);
    expect(resolveSchemaEditorScopeBridge).toHaveLength(3);
    expect(lowerEditorPlan).toHaveLength(3);
  });

  it('keeps capsule imports local or limited to neutral contract and XNL source APIs', () => {
    const { imports, dynamicImports } = importFacts();

    for (const fact of imports) {
      if (fact.specifier.startsWith('.')) {
        const localTarget = resolve(dirname(fact.file), fact.specifier);
        expect(
          localTarget === SCHEMA_EDITOR || localTarget.startsWith(`${SCHEMA_EDITOR}${sep}`),
          `${relative(SCHEMA_EDITOR, fact.file)} imports ${fact.specifier}`,
        ).toBe(true);
        continue;
      }
      expect(
        ALLOWED_EXTERNAL_IMPORTS.has(fact.specifier),
        `${relative(SCHEMA_EDITOR, fact.file)} imports ${fact.specifier}`,
      ).toBe(true);
      if (fact.specifier === 'xnl-core') {
        expect(
          fact.importedNames.filter((name) => !ALLOWED_XNL_IMPORTS.has(name)),
          `${relative(SCHEMA_EDITOR, fact.file)} imports non-source XNL APIs`,
        ).toEqual([]);
      }
    }
    expect(dynamicImports).toEqual([]);
  });

  it('does not own renderer, Flow, persistence, browser, or host-writer implementations', () => {
    const source = files(SCHEMA_EDITOR)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    for (const forbidden of [
      /from\s+['"]vue['"]/,
      /from\s+['"]element-plus['"]/,
      /from\s+['"][^'"]*(?:flow|biz-process|work-flow)[^'"]*['"]/i,
      /from\s+['"](?:node:)?(?:fs|path|http|https|net|tls|stream)['"]/,
      /\bdocument\.|\bwindow\.|\blocalStorage\b|\bindexedDB\b/,
      /\bfetch\s*\(/,
      /\b(?:create|open)(?:Database|Vfs|VFS)\b/,
      /\b(?:apply|write|persist)(?:Xnl|XNL)\b/,
    ]) {
      expect(source, forbidden.source).not.toMatch(forbidden);
    }
  });
});
