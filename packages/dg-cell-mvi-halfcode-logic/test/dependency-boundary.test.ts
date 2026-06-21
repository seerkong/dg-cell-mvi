import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const SRC = new URL('../src', import.meta.url).pathname;
const SCHEMA_EDITOR = join(SRC, 'schema-editor');
const WORKSPACE_ROOT = resolve(SRC, '../../..');
const SCHEMA_EDITOR_DOCS = join(WORKSPACE_ROOT, 'docs/halfcode/dsl-bundle/spec/frontend/schema-editor');
const ALLOWED_CAPSULE_DEPENDENCY = 'dg-cell-mvi-halfcode-contract';
const FORBIDDEN_CAPSULE_SOURCE = [
  /\brenderers?\b/i,
  /\bvue\b/i,
  /element-plus/i,
  /runtime-support|halfcode-support/i,
  /\b(?:io|i\/o)\b/i,
  /\bvfs\b/i,
  /\bxnl\b/i,
  /\bdatabase\b/i,
  /\bpersistence\b|\bpersist(?:ence|ed|ing)?\b/i,
  /\bFlow\b|BizProcess|WorkFlow|instant-flow|eager-data-flow/i,
  /\bDOM\b|\bdocument\.|\bwindow\./,
  /\bfetch\s*\(/,
] as const;
const STALE_PATH_OVERLAY_LIMITATIONS = [
  /尚不消费.*EditorPresentation\.overlays/,
  /不读取 path-targeted .*EditorPresentation\.overlays/,
] as const;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function stalePathOverlayLimitations(): string[] {
  return files(SCHEMA_EDITOR_DOCS)
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => STALE_PATH_OVERLAY_LIMITATIONS.some((pattern) => pattern.test(line))
        ? [`${relative(WORKSPACE_ROOT, file)}:${index + 1}`]
        : []));
}

describe('schema-editor documentation truth', () => {
  it('contains no stale path-overlay limitation vocabulary', () => {
    expect(stalePathOverlayLimitations()).toEqual([]);
  });
});

describe('logic dependency boundary', () => {
  it('does not import UI, browser IO, dynamic import, or expression execution primitives', () => {
    const source = files(SRC)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/\bfrom\s+['"]vue['"]/);
    expect(source).not.toMatch(/element-plus/);
    expect(source).not.toMatch(/\bdocument\.|\bwindow\.|\bfetch\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/new Function/);
  });

  it('keeps schema-editor imports contract-only or capsule-local', () => {
    const imports: Array<{ file: string; specifier: string }> = [];
    const dynamicImports: string[] = [];

    for (const file of files(SCHEMA_EDITOR).filter((candidate) => candidate.endsWith('.ts'))) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

      const visit = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          && node.moduleSpecifier !== undefined
          && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push({ file, specifier: node.moduleSpecifier.text });
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          dynamicImports.push(relative(SCHEMA_EDITOR, file));
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    for (const { file, specifier } of imports) {
      const localTarget = resolve(dirname(file), specifier);
      const isCapsuleLocal = specifier.startsWith('.')
        && (localTarget === SCHEMA_EDITOR || localTarget.startsWith(`${SCHEMA_EDITOR}${sep}`));
      expect(
        specifier === ALLOWED_CAPSULE_DEPENDENCY || isCapsuleLocal,
        `${relative(SCHEMA_EDITOR, file)} imports ${specifier}`,
      ).toBe(true);
    }
    expect(dynamicImports).toEqual([]);
  });

  it('keeps the schema-editor capsule free of renderer, runtime-support, IO, Flow, and host dependencies', () => {
    const source = files(SCHEMA_EDITOR)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    for (const pattern of FORBIDDEN_CAPSULE_SOURCE) {
      expect(source, pattern.source).not.toMatch(pattern);
    }
  });

  it('does not create a barrel cycle or a second compiler entry', () => {
    const rootIndex = readFileSync(join(SRC, 'index.ts'), 'utf8');
    const capsuleIndex = readFileSync(join(SCHEMA_EDITOR, 'index.ts'), 'utf8');
    const compiler = readFileSync(join(SCHEMA_EDITOR, 'compiler.ts'), 'utf8');

    expect(rootIndex).toMatch(/from\s+['"]\.\/schema-editor['"]/);
    expect(capsuleIndex).toMatch(/from\s+['"]\.\/compiler['"]/);
    expect(compiler).not.toMatch(/from\s+['"](?:\.\.\/)*index['"]/);
    expect(compiler).not.toMatch(/from\s+['"]\.\.['"]/);
  });
});
