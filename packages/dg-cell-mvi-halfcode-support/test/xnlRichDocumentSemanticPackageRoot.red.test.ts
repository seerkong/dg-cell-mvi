import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as logicRoot from 'dg-cell-mvi-halfcode-logic';
import * as supportRoot from 'dg-cell-mvi-halfcode-support';

const PACKAGE_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '../..');
const PACKAGE_NAMES = [
  'dg-cell-mvi-halfcode-contract',
  'dg-cell-mvi-halfcode-logic',
  'dg-cell-mvi-halfcode-support',
  'dg-cell-mvi-halfcode-tiptap-vue',
] as const;
const NEUTRAL_PACKAGE_NAMES = PACKAGE_NAMES.slice(0, 3);
const PRODUCTION_VALUES = [
  'createXnlRichDocumentSemanticDialect',
  'translateXnlRichDocumentEditInteraction',
  'materializeXnlRichDocumentSemanticCandidate',
] as const;

function files(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function packageSource(packageName: string): string {
  const packageRoot = resolve(PROJECT_ROOT, 'packages', packageName);
  return files(resolve(packageRoot, 'src'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `// ${relative(packageRoot, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

describe('RichDocument semantic production package roots', () => {
  it.each(PRODUCTION_VALUES)('re-exports logic-owned %s from the support package root', (name) => {
    const logicValue = Reflect.get(logicRoot, name) as unknown;
    const supportValue = Reflect.get(supportRoot, name) as unknown;

    expect(
      supportValue,
      `dg-cell-mvi-halfcode-support package root must export production value ${name}`,
    ).toBeTypeOf('function');
    expect(
      logicValue,
      `dg-cell-mvi-halfcode-logic package root must export production value ${name}`,
    ).toBeTypeOf('function');
    expect(supportValue).toBe(logicValue);
  });

  it('keeps runtime and typecheck consumers on package roots', () => {
    const files = [
      resolve(
        __dirname,
        '../../dg-cell-mvi-halfcode-logic/test/xnlRichDocumentSemanticMaterializer.red.test.ts',
      ),
      resolve(
        __dirname,
        '../typecheck/xnl-rich-document-semantic-red/public-surface.typecheck.ts',
      ),
      resolve(
        __dirname,
        '../../dg-cell-mvi-halfcode-tiptap-vue/test/trustedHostProductionChain.integration.test.ts',
      ),
      resolve(__dirname, 'fixtures/xnl-rich-document-import-smoke.mjs'),
      resolve(__dirname, 'fixtures/xnl-rich-document-import-smoke.cjs'),
    ];
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(source).not.toMatch(
      /(?:from\s+|import\s*\(|require\s*\()['"]dg-cell-mvi-halfcode-[^'"]+\/src(?:\/|['"])/,
    );
    for (const packageName of PACKAGE_NAMES) {
      expect(source, `${packageName} package-root consumer coverage`).toContain(`'${packageName}'`);
    }
  });

  it.each(['mjs', 'cjs'] as const)('loads the semantic chain through the public %s roots', (mode) => {
    const fixture = resolve(__dirname, `fixtures/xnl-rich-document-import-smoke.${mode}`);
    const result = spawnSync('bun', [fixture], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('document.canonical');
  });

  it('keeps canonical declarations in contract and production implementations in logic', () => {
    const sourceFiles = PACKAGE_NAMES.flatMap((packageName) => {
      const packageRoot = resolve(PROJECT_ROOT, 'packages', packageName);
      return files(resolve(packageRoot, 'src'))
        .filter((file) => file.endsWith('.ts'))
        .map((file) => ({ file, source: readFileSync(file, 'utf8') }));
    });
    const contractDeclarations = sourceFiles.flatMap(({ file, source }) => [
      ...source.matchAll(/^(?:export\s+)?(?:type|interface)\s+(XnlRichDocumentSemanticNode|XnlRichDocumentSemanticEdit|XnlRichDocumentEditCommand|XnlRichDocumentCandidateMaterializationResult|XnlRichDocumentCandidateMaterializer)\b/gm),
    ].map((match) => `${relative(PROJECT_ROOT, file)}:${match[1]}`)).sort();
    const productionImplementations = sourceFiles.flatMap(({ file, source }) => [
      ...source.matchAll(/^export (?:const|function) (createXnlRichDocumentSemanticDialect|translateXnlRichDocumentEditInteraction|materializeXnlRichDocumentSemanticCandidate)\b/gm),
    ].map((match) => `${relative(PROJECT_ROOT, file)}:${match[1]}`)).sort();
    const deepImports = sourceFiles.flatMap(({ file, source }) => [
      ...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()['"](dg-cell-mvi-halfcode-[^'"]+\/src(?:\/[^'"]*)?)['"]/g),
    ].map((match) => `${relative(PROJECT_ROOT, file)}:${match[1]}`));

    expect(contractDeclarations).toEqual([
      'packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentCandidateMaterializer',
      'packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentCandidateMaterializationResult',
      'packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentEditCommand',
      'packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentSemanticEdit',
      'packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentSemanticNode',
    ].sort());
    expect(productionImplementations).toEqual([
      'packages/dg-cell-mvi-halfcode-logic/src/xnl-rich-document/semanticTranslator.ts:createXnlRichDocumentSemanticDialect',
      'packages/dg-cell-mvi-halfcode-logic/src/xnl-rich-document/semanticMaterializer.ts:materializeXnlRichDocumentSemanticCandidate',
      'packages/dg-cell-mvi-halfcode-logic/src/xnl-rich-document/semanticTranslator.ts:translateXnlRichDocumentEditInteraction',
    ].sort());
    expect(deepImports).toEqual([]);

    const supportCapsuleRoot = readFileSync(
      resolve(PACKAGE_ROOT, 'src/xnl-rich-document/index.ts'),
      'utf8',
    );
    expect(supportCapsuleRoot).toMatch(/from 'dg-cell-mvi-halfcode-logic'/);
    expect(supportCapsuleRoot).not.toMatch(/\b(?:function|class)\s+XnlRichDocument/);

    const adapterTypes = readFileSync(
      resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-tiptap-vue/src/types.ts'),
      'utf8',
    );
    expect(adapterTypes).toMatch(
      /XnlRichDocumentTiptapSemanticNode\s*=\s*XnlRichDocumentSemanticNode/,
    );
    expect(adapterTypes).toMatch(
      /XnlRichDocumentTiptapSemanticEdit\s*=\s*XnlRichDocumentSemanticEdit/,
    );
    expect(adapterTypes).toMatch(
      /XnlRichDocumentTiptapInteractionPayload\s*=\s*XnlRichDocumentEditInteractionPayload/,
    );
  });

  it('keeps neutral package dependencies renderer-free', () => {
    for (const packageName of NEUTRAL_PACKAGE_NAMES) {
      const packageRoot = resolve(PROJECT_ROOT, 'packages', packageName);
      const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
        dependencies?: Readonly<Record<string, string>>;
        peerDependencies?: Readonly<Record<string, string>>;
        optionalDependencies?: Readonly<Record<string, string>>;
      };
      const dependencies = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
      ];
      expect(
        dependencies.filter((dependency) => (
          dependency === 'vue'
          || dependency.startsWith('@tiptap/')
          || dependency.startsWith('prosemirror-')
        )),
        `${packageName} renderer dependency leak`,
      ).toEqual([]);
      expect(packageSource(packageName), `${packageName} renderer import leak`).not.toMatch(
        /(?:from\s+|import\s*\()['"](?:vue|@tiptap\/[^'"]+|prosemirror-[^'"]+)['"]/,
      );
    }
  });
});
