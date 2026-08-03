import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '../..');
const FACTORY_NAME = 'createXnlProjectionPresenterRuntimeFacet';

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) return [];
    const file = resolve(directory, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

function typescriptSnippets(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  if (!file.endsWith('.md')) return [source];
  return Array.from(source.matchAll(/```(?:ts|typescript)\s*\n([\s\S]*?)```/g), (match) => match[1] ?? '');
}

function factoryCallArities(source: string, file: string): readonly number[] {
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

describe('XNL Projection Presenter package-root migration boundary', () => {
  it.each(['esm', 'cjs'] as const)('loads and constructs a facet through the %s package root', (mode) => {
    const fixture = resolve(
      PACKAGE_ROOT,
      `test/fixtures/xnl-projection-presenter-import-smoke.${mode === 'esm' ? 'mjs' : 'cjs'}`,
    );
    const result = spawnSync('bun', [fixture], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`${mode}:ok`);
  });

  it('keeps every direct successful facet construction on the three-parameter factory', () => {
    const roots = [
      resolve(PROJECT_ROOT, 'packages'),
      resolve(PROJECT_ROOT, 'docs/halfcode/dsl-bundle/spec/frontend/xnl-projection'),
    ];
    const findings = roots.flatMap((root) => files(root))
      .filter((file) => ['.ts', '.md', '.mjs', '.cjs'].some((extension) => file.endsWith(extension)))
      .flatMap((file) => typescriptSnippets(file).flatMap((source) =>
        factoryCallArities(source, file).map((arity) => ({ file, arity })),
      ));

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.filter(({ arity }) => arity !== 3)).toEqual([]);
  });
});
