import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  join,
  relative,
} from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SCHEMA_EDITOR_COMMAND_KINDS } from 'dg-cell-mvi-halfcode-contract';
import * as elementPlusPackage from 'dg-cell-mvi-halfcode-element-plus';
import * as kitchenSinkFixture from '../demo/schemaEditorKitchenSinkFixture';

const PACKAGE_ROOT = process.cwd();
const SCHEMA_EDITOR_SOURCE_ROOT = join(PACKAGE_ROOT, 'src', 'schema-editor');
const SCHEMA_EDITOR_DOC_ROOT = join(
  PACKAGE_ROOT,
  '..',
  '..',
  'docs',
  'halfcode',
  'dsl-bundle',
  'spec',
  'frontend',
  'schema-editor',
);
const ELEMENT_PLUS_DOC = join(SCHEMA_EDITOR_DOC_ROOT, 'element-plus.md');
const SCHEMA_EDITOR_COMPILER = join(
  PACKAGE_ROOT,
  '..',
  'dg-cell-mvi-halfcode-logic',
  'src',
  'schema-editor',
  'compiler.ts',
);
const SCHEMA_EDITOR_FACTORY_NAME =
  /^(?:compose|create)ElementPlusSchemaEditor.*Registr(?:y|ies)$/;
const KITCHEN_SINK_LIFECYCLE_NAME =
  /^(?:create|mount)SchemaEditorKitchenSink/;
const elementPlusPackageValues =
  elementPlusPackage as unknown as Readonly<Record<string, unknown>>;
const ALLOWED_SOURCE_PACKAGES = new Set([
  '@element-plus/icons-vue',
  'dg-cell-mvi-halfcode-vue',
  'element-plus',
  'monaco-editor',
  'sortablejs',
  'vanilla-jsoneditor',
  'vue',
]);
const STRUCTURED_VALUE_INTERNAL =
  /^src\/schema-editor\/structured-value\/.+\.ts$/;
const STRUCTURED_VALUE_ENGINE_PACKAGES = new Set([
  'monaco-editor',
  'vanilla-jsoneditor',
]);
const PUBLIC_CONSUMER_FILES = [
  'demo/schemaEditorKitchenSinkFixture.ts',
  'test/schemaEditorCanonicalComposition.red.test.ts',
  'test/schemaEditorCanonicalComposition.typecheck.ts',
  'test/schemaEditorPresenterInteractions.red.test.ts',
  'test/schemaEditorPresenterRegistry.red.test.ts',
  'test/schemaEditorPresenterRegistry.typecheck.ts',
  'test/schemaEditorStructuredValueModal.red.test.ts',
] as const;
const FORBIDDEN_CAPABILITY_IDENTIFIERS = new Set([
  'CanonicalHalfcodeRenderer',
  'SchemaEditorSession',
  'SchemaEditorSessionRenderer',
  'SchemaEditorValueHost',
  'compileEditorPlan',
  'createDefaultHalfcodeRuntime',
  'createSchemaEditorCompilerRuntime',
  'createSchemaEditorSession',
  'loadHalfcodeAppRuntime',
  'lowerEditorPlan',
  'renderSchemaEditorNode',
  'resolveSchemaEditorScopeBridge',
]);
const FORBIDDEN_CAPABILITY_NAME =
  /ValueHost|Session|Writer|Flow|XNL|Xnl|VFS|Vfs|Database|Persistence/;
const MUTATING_METHODS = new Set([
  'clear',
  'delete',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

describe('Element Plus Schema Editor T5.1 public boundary', () => {
  it('publishes only the package root and exposes exact three-parameter factories', () => {
    const packageJson = JSON.parse(readFileSync(
      join(PACKAGE_ROOT, 'package.json'),
      'utf8',
    )) as Readonly<{
      dependencies?: Readonly<Record<string, unknown>>;
      exports?: Readonly<Record<string, unknown>>;
    }>;

    expect(packageJson.exports).toEqual({ '.': './src/index.ts' });
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      '@element-plus/icons-vue',
      'dg-cell-mvi-halfcode-vue',
      'monaco-editor',
      'sortablejs',
      'vanilla-jsoneditor',
    ]);
    expect(schemaEditorFactoryNames()).toEqual([
      'composeElementPlusSchemaEditorPresenterRegistries',
      'createElementPlusSchemaEditorCanonicalRegistry',
      'createElementPlusSchemaEditorPresenterRegistry',
    ]);
    expect(schemaEditorFactoryNames().map((name) =>
      (elementPlusPackageValues[name] as Function).length)).toEqual([3, 3, 3]);
  });

  it('keeps consumer contracts on the package root and all package imports root-only', () => {
    for (const file of PUBLIC_CONSUMER_FILES) {
      const imports = importedModules(
        readFileSync(join(PACKAGE_ROOT, file), 'utf8'),
        file,
      );
      expect(imports, `${file} must consume the Element Plus package root.`)
        .toContain('dg-cell-mvi-halfcode-element-plus');
      expect(
        imports.filter((specifier) =>
          specifier === '../src' || specifier.startsWith('../src/')),
        `${file} must not consume source paths.`,
      ).toEqual([]);
    }

    for (const file of packageTypeScriptFiles()) {
      const imports = importedModules(
        readFileSync(file, 'utf8'),
        relative(PACKAGE_ROOT, file),
      );
      expect(
        imports.filter((specifier) =>
          /^dg-cell-mvi-[^/]+\/.+/.test(specifier)),
        `${relative(PACKAGE_ROOT, file)} must not deep-import a sibling package.`,
      ).toEqual([]);
    }
  });

  it('limits production source imports to capsule internals and allowed toolkit roots', () => {
    const violations: string[] = [];
    for (const file of sourceFiles()) {
      const fileName = relative(PACKAGE_ROOT, file);
      for (const specifier of importedModuleReferences(
        readFileSync(file, 'utf8'),
        fileName,
      )) {
        if (specifier.startsWith('.')) continue;
        if (!ALLOWED_SOURCE_PACKAGES.has(specifier)) {
          violations.push(`${fileName} -> ${specifier}`);
        }
        if (
          STRUCTURED_VALUE_ENGINE_PACKAGES.has(specifier)
          && !STRUCTURED_VALUE_INTERNAL.test(fileName)
        ) {
          violations.push(
            `${fileName} -> ${specifier} outside structured-value internals`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps editor engines out of sibling Halfcode packages and Workbench wrappers', () => {
    const siblingPackages = [
      'dg-cell-mvi-halfcode-contract',
      'dg-cell-mvi-halfcode-logic',
      'dg-cell-mvi-halfcode-support',
      'dg-cell-mvi-halfcode-vue',
    ];
    const violations: string[] = [];
    for (const packageName of siblingPackages) {
      const packageRoot = join(PACKAGE_ROOT, '..', packageName);
      const packageJson = readFileSync(join(packageRoot, 'package.json'), 'utf8');
      if (/monaco-editor|vanilla-jsoneditor|workbench/i.test(packageJson)) {
        violations.push(`${packageName}/package.json`);
      }
      for (const file of collectTypeScriptFiles(join(packageRoot, 'src'))) {
        for (const specifier of importedModuleReferences(
          readFileSync(file, 'utf8'),
          file,
        )) {
          if (
            STRUCTURED_VALUE_ENGINE_PACKAGES.has(specifier)
            || /workbench/i.test(specifier)
          ) {
            violations.push(`${relative(packageRoot, file)} -> ${specifier}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('owns no host capability, parallel runtime, accepted mutation, mutable registry, or JSON fallback', () => {
    const issues = sourceFiles().flatMap((file) => scanOwnership(
      readFileSync(file, 'utf8'),
      relative(PACKAGE_ROOT, file),
    ));
    expect(issues).toEqual([]);
  });

  it('uses ownership semantics instead of banning the runtime parameter name', () => {
    expect(scanOwnership(`
      export function createRegistry(runtime: {}, input: {}, config: {}) {
        void runtime;
        void input;
        void config;
        return Object.freeze({});
      }
    `, 'allowed-factory.ts')).toEqual([]);

    for (const source of [
      `import type { SchemaEditorValueHost } from 'host-package';`,
      `const globalRegistry = new Map<string, unknown>();`,
      `function createParallelRuntime() { return {}; }`,
      `props.value.name = 'optimistic';`,
      `JSON.stringify(props.value);`,
    ]) {
      expect(scanOwnership(source, 'forbidden.ts')).not.toEqual([]);
    }
  });
});

describe('Element Plus Schema Editor T5.2 documentation boundary', () => {
  it('binds documented public factories and kitchen-sink lifecycle helpers to actual module exports', () => {
    for (const file of collectMarkdownFiles(SCHEMA_EDITOR_DOC_ROOT)) {
      const documentation = readFileSync(file, 'utf8');
      const packageSymbols = [
        ...new Set([
          ...documentedImports(
            documentation,
            'dg-cell-mvi-halfcode-element-plus',
          ),
          ...documentedInlineIdentifiers(
            documentation,
            /^(?:compose|create)ElementPlus/,
          ),
        ]),
      ].sort();
      expect(
        packageSymbols.filter((name) => !(name in elementPlusPackage)),
        `${relative(SCHEMA_EDITOR_DOC_ROOT, file)} references missing `
          + 'Element Plus package-root exports.',
      ).toEqual([]);

      const lifecycleSymbols = documentedInlineIdentifiers(
        documentation,
        KITCHEN_SINK_LIFECYCLE_NAME,
      );
      expect(
        lifecycleSymbols.filter((name) => !(name in kitchenSinkFixture)),
        `${relative(SCHEMA_EDITOR_DOC_ROOT, file)} references missing `
          + 'kitchen-sink exports.',
      ).toEqual([]);
    }

    const documentation = readFileSync(ELEMENT_PLUS_DOC, 'utf8');
    const documentedPackageImports = documentedImports(
      documentation,
      'dg-cell-mvi-halfcode-element-plus',
    );
    const missingPackageExports = documentedPackageImports.filter(
      (name) => !(name in elementPlusPackage),
    );
    expect(
      missingPackageExports,
      'element-plus.md references missing package-root exports.',
    ).toEqual([]);
    expect(
      documentedPackageImports.filter((name) =>
        SCHEMA_EDITOR_FACTORY_NAME.test(name)),
    ).toEqual(schemaEditorFactoryNames());

    const actualLifecycleExports = Object.keys(kitchenSinkFixture)
      .filter((name) =>
        KITCHEN_SINK_LIFECYCLE_NAME.test(name)
        && typeof kitchenSinkFixture[name as keyof typeof kitchenSinkFixture]
          === 'function')
      .sort();
    const documentedLifecycleSymbols = documentedInlineIdentifiers(
      documentation,
      KITCHEN_SINK_LIFECYCLE_NAME,
    );
    expect(documentedLifecycleSymbols).toEqual(actualLifecycleExports);
  });

  it('keeps the documented 27 ids on the real registry and kitchen-sink fixture', () => {
    const documentation = readFileSync(ELEMENT_PLUS_DOC, 'utf8');
    const documentedIds = markdownTableColumn(
      documentation,
      '## Default Presenter Matrix',
      '## Normalized Events And Commands',
      0,
    );
    const registry = elementPlusPackage
      .createElementPlusSchemaEditorPresenterRegistry({}, {}, {});
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const actualIds = registry.registry.entries.map(({ id }) => id);
    expect(documentedIds).toHaveLength(27);
    expect(documentedIds).toEqual(actualIds);
    expect(documentedIds).toEqual([
      ...kitchenSinkFixture.KITCHEN_SINK_PRESENTER_IDS,
    ]);
  });

  it('keeps all 8 documented event-command rows on compiler and contract truth', () => {
    const documentation = readFileSync(ELEMENT_PLUS_DOC, 'utf8');
    const documentedBindings = markdownTableRows(
      documentation,
      '## Normalized Events And Commands',
      '## Business Later-Wins Composition',
    ).map(([event, command]) => ({
      event: leadingSymbol(event),
      command: leadingSymbol(command),
    }));
    const compilerBindings = compilerEventCommandBindings(
      readFileSync(SCHEMA_EDITOR_COMPILER, 'utf8'),
    );

    expect(documentedBindings).toHaveLength(8);
    expect(documentedBindings).toEqual(compilerBindings);
    expect(documentedBindings.map(({ command }) => command)).toEqual([
      ...SCHEMA_EDITOR_COMMAND_KINDS,
    ]);
  });
});

function schemaEditorFactoryNames(): string[] {
  return Object.keys(elementPlusPackage)
    .filter((name) =>
      SCHEMA_EDITOR_FACTORY_NAME.test(name)
      && typeof elementPlusPackageValues[name] === 'function')
    .sort();
}

function documentedImports(
  markdown: string,
  moduleName: string,
): string[] {
  const names = new Set<string>();
  for (const source of typeScriptCodeBlocks(markdown)) {
    const sourceFile = ts.createSourceFile(
      ELEMENT_PLUS_DOC,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    sourceFile.forEachChild((node) => {
      if (
        !ts.isImportDeclaration(node)
        || !ts.isStringLiteral(node.moduleSpecifier)
        || node.moduleSpecifier.text !== moduleName
        || !node.importClause?.namedBindings
        || !ts.isNamedImports(node.importClause.namedBindings)
      ) {
        return;
      }
      for (const element of node.importClause.namedBindings.elements) {
        names.add(element.propertyName?.text ?? element.name.text);
      }
    });
  }
  return [...names].sort();
}

function typeScriptCodeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)]
    .map((match) => match[1] ?? '');
}

function documentedInlineIdentifiers(
  markdown: string,
  pattern: RegExp,
): string[] {
  return [...new Set(
    [...markdown.matchAll(/`([A-Za-z_$][\w$]*)`/g)]
      .map((match) => match[1] ?? '')
      .filter((name) => pattern.test(name)),
  )].sort();
}

function markdownTableColumn(
  markdown: string,
  startHeading: string,
  endHeading: string,
  column: number,
): string[] {
  return markdownTableRows(markdown, startHeading, endHeading)
    .map((row) => leadingSymbol(row[column] ?? ''));
}

function markdownTableRows(
  markdown: string,
  startHeading: string,
  endHeading: string,
): string[][] {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) return [];
  return markdown.slice(start, end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
}

function leadingSymbol(markdownCell: string): string {
  return markdownCell.match(/^`([^` ]+)/)?.[1] ?? '';
}

function compilerEventCommandBindings(source: string):
readonly Readonly<{ event: string; command: string }>[] {
  const sourceFile = ts.createSourceFile(
    SCHEMA_EDITOR_COMPILER,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings: Array<{ event: string; command: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const event = stringProperty(node, 'event');
      const template = objectProperty(node, 'commandTemplate');
      const command = template && stringProperty(template, 'kind');
      if (event && command) bindings.push({ event, command });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function stringProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  const property = object.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate)
    && propertyName(candidate.name) === name);
  return property
    && ts.isPropertyAssignment(property)
    && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralExpression | undefined {
  const property = object.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate)
    && propertyName(candidate.name) === name);
  return property
    && ts.isPropertyAssignment(property)
    && ts.isObjectLiteralExpression(property.initializer)
    ? property.initializer
    : undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
}

function sourceFiles(): readonly string[] {
  return collectTypeScriptFiles(SCHEMA_EDITOR_SOURCE_ROOT);
}

function packageTypeScriptFiles(): readonly string[] {
  return [
    ...collectTypeScriptFiles(join(PACKAGE_ROOT, 'src')),
    ...collectTypeScriptFiles(join(PACKAGE_ROOT, 'test')),
    ...collectTypeScriptFiles(join(PACKAGE_ROOT, 'demo')),
  ];
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function collectMarkdownFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(path);
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    })
    .sort();
}

function importedModules(source: string, fileName: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const modules: string[] = [];
  sourceFile.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    }
  });
  return modules;
}

function importedModuleReferences(
  source: string,
  fileName: string,
): readonly string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const modules: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      modules.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return modules;
}

function scanOwnership(source: string, fileName: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const issues: string[] = [];

  const report = (node: ts.Node, rule: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    issues.push(`${fileName}:${position.line + 1} ${rule}`);
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node)
      && (
        FORBIDDEN_CAPABILITY_IDENTIFIERS.has(node.text)
        || FORBIDDEN_CAPABILITY_NAME.test(node.text)
        || (
          /Runtime/.test(node.text)
          && !/Registr(?:y|ies)Runtime$/.test(node.text)
          && !(
            STRUCTURED_VALUE_INTERNAL.test(fileName)
            && /^StructuredValue(?:Presenter|Engine)Runtime$/.test(node.text)
          )
        )
      )
    ) {
      report(node, `forbidden capability ${node.text}`);
    }

    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      && node.name
      && /(?:Runtime|Renderer|Lowering|Loader|Session|ValueHost|Writer)$/
        .test(node.name.text)
    ) {
      report(node.name, `parallel capability declaration ${node.name.text}`);
    }

    if (
      ts.isVariableStatement(node)
      && node.parent === sourceFile
      && node.declarationList.declarations.some((declaration) =>
        isMutableGlobalCapability(declaration, node.declarationList))
    ) {
      report(node, 'module-global mutable capability');
    }

    if (isAcceptedValueMutation(node)) {
      report(node, 'direct accepted-value mutation');
    }

    if (
      isJsonSerialization(node)
      && !STRUCTURED_VALUE_INTERNAL.test(fileName)
    ) {
      report(node, 'implicit JSON serialization fallback');
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues;
}

function isMutableGlobalCapability(
  declaration: ts.VariableDeclaration,
  declarationList: ts.VariableDeclarationList,
): boolean {
  if (!ts.isIdentifier(declaration.name)) return false;
  const capabilityName =
    /registr(?:y|ies)|runtime|renderer|lowering|writer|valuehost|cache/i
      .test(declaration.name.text);
  if (!capabilityName) return false;

  const isConst = (declarationList.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) return true;
  if (!declaration.initializer) return false;
  const initializer = unwrapExpression(declaration.initializer);
  return !(
    ts.isCallExpression(initializer)
    && ts.isPropertyAccessExpression(initializer.expression)
    && ts.isIdentifier(initializer.expression.expression)
    && initializer.expression.expression.text === 'Object'
    && initializer.expression.name.text === 'freeze'
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isAcceptedValueMutation(node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node)
    && isAssignmentOperator(node.operatorToken.kind)
    && isAcceptedValueExpression(node.left)
  ) {
    return true;
  }
  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && (node.operator === ts.SyntaxKind.PlusPlusToken
      || node.operator === ts.SyntaxKind.MinusMinusToken)
    && isAcceptedValueExpression(node.operand)
  ) {
    return true;
  }
  if (
    ts.isDeleteExpression(node)
    && isAcceptedValueExpression(node.expression)
  ) {
    return true;
  }
  if (!ts.isCallExpression(node)) return false;

  if (
    ts.isPropertyAccessExpression(node.expression)
    && MUTATING_METHODS.has(node.expression.name.text)
    && isAcceptedValueExpression(node.expression.expression)
  ) {
    return true;
  }
  return ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'Object'
    && node.expression.name.text === 'assign'
    && node.arguments[0] !== undefined
    && isAcceptedValueExpression(node.arguments[0]);
}

function isAcceptedValueExpression(node: ts.Expression): boolean {
  let current: ts.Expression = node;
  while (
    ts.isPropertyAccessExpression(current)
    || ts.isElementAccessExpression(current)
  ) {
    if (
      ts.isPropertyAccessExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === 'props'
      && current.name.text === 'value'
    ) {
      return true;
    }
    current = current.expression;
  }
  return false;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment
    && kind <= ts.SyntaxKind.LastAssignment;
}

function isJsonSerialization(node: ts.Node): boolean {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'JSON'
    && (node.expression.name.text === 'parse'
      || node.expression.name.text === 'stringify');
}
