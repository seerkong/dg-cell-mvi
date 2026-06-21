import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  join,
  relative,
} from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  validateEditorPresentation,
  validateStructureSchema,
} from 'dg-cell-mvi-halfcode-contract';

const WORKSPACE_ROOT = join(process.cwd(), '..', '..');
const GENERIC_PACKAGES = [
  'dg-cell-mvi-halfcode-contract',
  'dg-cell-mvi-halfcode-logic',
  'dg-cell-mvi-halfcode-support',
  'dg-cell-mvi-halfcode-vue',
  'dg-cell-mvi-halfcode-element-plus',
] as const;
const BUSINESS_A_B_MARKER =
  /\b(?:BusinessA|BusinessB|businessA|businessB|business-a|business-b|business\.a|business\.b)\b/;
const GLOBAL_REGISTRY_MARKER =
  /\b(?:globalThis|window)\s*(?:\.|\[)[^\n;]*(?:presenter|schemaEditor)[^\n;]*registr/i;
const PRESENTER_CONTRACT = join(
  WORKSPACE_ROOT,
  'packages',
  'dg-cell-mvi-halfcode-vue',
  'src',
  'schema-editor',
  'contracts.ts',
);
const EXPECTED_PRESENTER_PROPS = [
  'diagnostics',
  'eventContext',
  'node',
  'onSchemaEditorEvent',
  'path',
  'pending',
  'presenterOptions',
  'value',
] as const;

describe('Schema Editor business dialect neutral boundaries', () => {
  it('keeps business A/B policy out of generic package source', () => {
    const violations = genericSourceFiles().filter((file) =>
      BUSINESS_A_B_MARKER.test(readFileSync(file, 'utf8')));

    expect(violations.map(workspaceRelative)).toEqual([]);
  });

  it('keeps presenter registries instance-scoped instead of globally located', () => {
    const violations = genericSourceFiles().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const issues: string[] = [];
      if (GLOBAL_REGISTRY_MARKER.test(source)) {
        issues.push(`${workspaceRelative(file)}: global presenter registry`);
      }
      for (const identifier of topLevelIdentifiers(source, file)) {
        if (/global.*(?:presenter|schemaEditor).*registr/i.test(identifier)) {
          issues.push(`${workspaceRelative(file)}: ${identifier}`);
        }
      }
      return issues;
    });

    expect(violations).toEqual([]);
  });

  it('keeps schema and presentation pure serializable data', () => {
    for (const forbidden of [
      function BusinessPhonePresenter() {},
      () => undefined,
      Object.freeze({ dispatch() {} }),
      new class RuntimeProbe {}(),
      Object.freeze({ write() {} }),
    ]) {
      const schema = validateStructureSchema({
        kind: 'scalar',
        id: 'user.phone',
        scalar: 'string',
        annotations: { semanticType: 'user.phone', forbidden },
      });
      const presentation = validateEditorPresentation({
        kind: 'presentation',
        id: 'user.presentation',
        schemaId: 'user',
        children: {
          phone: {
            presenter: {
              id: 'business.user.phone',
              options: { forbidden },
            },
          },
        },
      });

      expect(schema.ok).toBe(false);
      expect(presentation.ok).toBe(false);
    }
  });

  it('limits presenter props to normalized data and event output', () => {
    const source = readFileSync(PRESENTER_CONTRACT, 'utf8');
    const sourceFile = ts.createSourceFile(
      PRESENTER_CONTRACT,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const props = interfacePropertyNames(
      sourceFile,
      'SchemaEditorPresenterProps',
    );

    expect(props).toEqual([...EXPECTED_PRESENTER_PROPS]);
    expect(props).not.toEqual(expect.arrayContaining([
      'runtime',
      'session',
      'valueHost',
      'writer',
    ]));
    expect(source.slice(
      source.indexOf('export interface SchemaEditorPresenterProps'),
      source.indexOf(
        'export interface SchemaEditorPresenterRegistryDiagnostic',
      ),
    )).not.toMatch(/\b(?:Session|ValueHost|writer|runtime)\b/);
  });
});

function genericSourceFiles(): string[] {
  return GENERIC_PACKAGES.flatMap((packageName) =>
    collectTypeScriptFiles(join(
      WORKSPACE_ROOT,
      'packages',
      packageName,
      'src',
    )));
}

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((name) => {
      const file = join(root, name);
      return statSync(file).isDirectory()
        ? collectTypeScriptFiles(file)
        : file.endsWith('.ts')
          ? [file]
          : [];
    })
    .sort();
}

function workspaceRelative(file: string): string {
  return relative(WORKSPACE_ROOT, file);
}

function topLevelIdentifiers(source: string, file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
  });
}

function interfacePropertyNames(
  sourceFile: ts.SourceFile,
  interfaceName: string,
): string[] {
  for (const statement of sourceFile.statements) {
    if (
      ts.isInterfaceDeclaration(statement)
      && statement.name.text === interfaceName
    ) {
      return statement.members
        .flatMap((member) =>
          ts.isPropertySignature(member)
          && member.name
          && ts.isIdentifier(member.name)
            ? [member.name.text]
            : [])
        .sort();
    }
  }
  return [];
}
