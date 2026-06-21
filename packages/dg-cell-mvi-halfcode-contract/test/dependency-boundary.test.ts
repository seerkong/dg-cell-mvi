import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path, { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../src');
const SCHEMA_EDITOR = path.join(SRC, 'schema-editor');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? files(p) : [p];
  });
}

describe('halfcode-contract dependency boundary', () => {
  it('does not import UI, browser, or effect implementation dependencies', () => {
    const source = files(SRC)
      .filter((p) => /\.(ts|tsx)$/.test(p))
      .map((p) => fs.readFileSync(p, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from ['"]vue['"]/);
    expect(source).not.toMatch(/from ['"]element-plus['"]/);
    expect(source).not.toMatch(/\bdocument\./);
    expect(source).not.toMatch(/\bwindow\./);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bnew Function\b/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it('keeps canonical document and material contracts free of runtime and framework imports', () => {
    const canonicalSource = ['common.ts', 'document.ts', 'material.ts', 'validation.ts']
      .map((file) => fs.readFileSync(path.join(SRC, file), 'utf8'))
      .join('\n');

    expect(canonicalSource).not.toMatch(/from ['"]dg-cell-mvi-core['"]/);
    expect(canonicalSource).not.toMatch(/from ['"]vue['"]/);
    expect(canonicalSource).not.toMatch(/from ['"]element-plus['"]/);
  });

  it('keeps schema-editor contract imports capsule-local', () => {
    const imports: Array<{ file: string; specifier: string }> = [];
    const dynamicImports: string[] = [];

    for (const file of files(SCHEMA_EDITOR).filter((candidate) => candidate.endsWith('.ts'))) {
      const source = fs.readFileSync(file, 'utf8');
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
      expect(isCapsuleLocal, `${relative(SCHEMA_EDITOR, file)} imports ${specifier}`).toBe(true);
    }
    expect(dynamicImports).toEqual([]);
  });
});
