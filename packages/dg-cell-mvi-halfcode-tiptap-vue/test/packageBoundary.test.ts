import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import type { Extensions, NodeViewRenderer } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import * as adapterPackageRoot from 'dg-cell-mvi-halfcode-tiptap-vue';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const PACKAGES_ROOT = resolve(PROJECT_ROOT, 'packages');
const ADAPTER_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-tiptap-vue');
const CANONICAL_EXTENSION_REGISTRY = resolve(
  ADAPTER_ROOT,
  'src/internalTiptapExtensionRegistry.ts',
);
const LEGACY_ADMIN_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-admin-element-plus');
const DOCUMENTATION_ROOT = resolve(
  PROJECT_ROOT,
  'docs/halfcode/dsl-bundle/spec/frontend/tiptap-document',
);
const SLICE_ROOTS = [
  'dg-cell-mvi-halfcode-contract',
  'dg-cell-mvi-halfcode-logic',
  'dg-cell-mvi-halfcode-support',
  'dg-cell-mvi-halfcode-vue',
  'dg-cell-mvi-halfcode-tiptap-vue',
].map((name) => resolve(PROJECT_ROOT, 'packages', name));
const NEUTRAL_ROOTS = SLICE_ROOTS.slice(0, 3);
const NON_SUPPORT_ROOTS = [SLICE_ROOTS[0], SLICE_ROOTS[1], SLICE_ROOTS[3], SLICE_ROOTS[4]];

function files(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function source(root: string): string {
  return files(resolve(root, 'src'))
    .filter((file) => ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'].includes(extname(file)))
    .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

function sourceFiles(root: string): readonly { readonly file: string; readonly content: string }[] {
  return files(resolve(root, 'src'))
    .filter((file) => ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'].includes(extname(file)))
    .map((file) => ({ file, content: readFileSync(file, 'utf8') }));
}

function propertyNameText(name: ts.PropertyName | undefined): string | undefined {
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;
}

function parseTypescript(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function identifierCount(root: ts.Node, name: string): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return count;
}

function reverseAuthorityViolations(file: string, content: string): readonly string[] {
  const root = parseTypescript(file, content);
  const violations: string[] = [];
  const forbiddenIdentifiers = new Set([
    'generateHTML',
    'generateJSON',
    'getHTML',
    'DOMParser',
    'querySelector',
    'innerHTML',
    'outerHTML',
    'parseHTML',
  ]);

  const isGlobalDocumentAccess = (node: ts.Expression): boolean => (
    ts.isPropertyAccessExpression(node)
    && node.name.text === 'document'
    && ts.isIdentifier(node.expression)
    && (node.expression.text === 'globalThis' || node.expression.text === 'window')
  );

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) {
      violations.push(`forbidden ${node.text}`);
    }
    if (
      ts.isPropertyAccessExpression(node)
      && node.name.text === 'createElement'
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'document'
    ) {
      violations.push('forbidden global document.createElement');
    }
    if (ts.isPropertyAccessExpression(node) && isGlobalDocumentAccess(node.expression)) {
      violations.push(`forbidden global page read document.${node.name.text}`);
    }
    if (
      ts.isPropertyAccessExpression(node)
      && node.name.text === 'writer'
    ) {
      violations.push('forbidden writer authority');
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'writer'
    ) {
      violations.push('forbidden writer authority');
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return violations;
}

function isCanonicalExtensionRegistryConsumption(identifier: ts.Identifier): boolean {
  const array = identifier.parent;
  if (!ts.isArrayLiteralExpression(array) || !array.elements.includes(identifier)) return false;
  const returnStatement = array.parent;
  if (!ts.isReturnStatement(returnStatement) || returnStatement.expression !== array) return false;
  const body = returnStatement.parent;
  const declaration = body.parent;
  return ts.isBlock(body)
    && ts.isFunctionDeclaration(declaration)
    && declaration.name?.text === 'createXnlRichDocumentTiptapHostExtensions';
}

function richDocumentListItemSerializerViolations(
  file: string,
  content: string,
): readonly string[] {
  const root = parseTypescript(file, content);
  const violations: string[] = [];
  const renderHtmlIdentifiers: ts.Identifier[] = [];
  const listItemIdentifiers: ts.Identifier[] = [];
  const declarations: ts.VariableDeclaration[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'renderHTML') renderHtmlIdentifiers.push(node);
    if (ts.isIdentifier(node) && node.text === 'RichDocumentListItem') {
      listItemIdentifiers.push(node);
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'RichDocumentListItem'
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);

  if (renderHtmlIdentifiers.length !== 1) {
    violations.push(`expected exactly one renderHTML identifier, found ${renderHtmlIdentifiers.length}`);
  }
  if (declarations.length !== 1) {
    violations.push(`expected exactly one RichDocumentListItem declaration, found ${declarations.length}`);
    return violations;
  }

  const declarationName = declarations[0]!.name;
  const references = listItemIdentifiers.filter((identifier) => identifier !== declarationName);
  const canonicalConsumers = references.filter(isCanonicalExtensionRegistryConsumption);
  if (canonicalConsumers.length !== 1 || references.length !== canonicalConsumers.length) {
    violations.push(
      'RichDocumentListItem may only be referenced by its declaration and canonical extensions array',
    );
  }

  const initializer = declarations[0]?.initializer;
  if (
    initializer === undefined
    || !ts.isCallExpression(initializer)
    || !ts.isPropertyAccessExpression(initializer.expression)
    || !ts.isIdentifier(initializer.expression.expression)
    || initializer.expression.expression.text !== 'Node'
    || initializer.expression.name.text !== 'create'
    || initializer.arguments.length !== 1
    || !ts.isObjectLiteralExpression(initializer.arguments[0]!)
  ) {
    violations.push('RichDocumentListItem must be initialized by one Node.create object literal');
    return violations;
  }

  const config = initializer.arguments[0];
  for (const property of config.properties) {
    if (ts.isSpreadAssignment(property)) {
      violations.push('RichDocumentListItem config must not contain spread assignments');
      continue;
    }
    if (ts.isComputedPropertyName(property.name)) {
      violations.push('RichDocumentListItem config must not contain computed property names');
      continue;
    }
    if (
      propertyNameText(property.name) === undefined
      || (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property))
    ) {
      violations.push('RichDocumentListItem config must use only direct property assignments and methods');
    }
  }
  if (violations.length > 0) return violations;

  const serializers = config.properties.filter((property) => (
    propertyNameText(property.name) === 'renderHTML'
  ));
  if (serializers.length !== 1 || !ts.isMethodDeclaration(serializers[0])) {
    violations.push('RichDocumentListItem must own exactly one renderHTML method');
    return violations;
  }

  const serializer = serializers[0];
  const parameter = serializer.parameters[0];
  const binding = parameter?.name;
  const bindsOnlyHtmlAttributes = serializer.parameters.length === 1
    && binding !== undefined
    && ts.isObjectBindingPattern(binding)
    && binding.elements.length === 1
    && binding.elements[0]?.propertyName === undefined
    && binding.elements[0]?.dotDotDotToken === undefined
    && binding.elements[0]?.initializer === undefined
    && ts.isIdentifier(binding.elements[0]!.name)
    && binding.elements[0]!.name.text === 'HTMLAttributes';
  if (!bindsOnlyHtmlAttributes) {
    violations.push('renderHTML must bind only HTMLAttributes');
  }

  const statement = serializer.body?.statements[0];
  const output = statement !== undefined && ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
  const hasControlledLiOutput = serializer.body?.statements.length === 1
    && output !== undefined
    && ts.isArrayLiteralExpression(output)
    && output.elements.length === 3
    && ts.isStringLiteral(output.elements[0]!)
    && output.elements[0]!.text === 'li'
    && ts.isIdentifier(output.elements[1]!)
    && output.elements[1]!.text === 'HTMLAttributes'
    && ts.isNumericLiteral(output.elements[2]!)
    && output.elements[2]!.text === '0';
  if (!hasControlledLiOutput) {
    violations.push("renderHTML must return only ['li', HTMLAttributes, 0]");
  }

  if (renderHtmlIdentifiers[0] !== serializer.name) {
    violations.push('renderHTML may exist only on RichDocumentListItem');
  }
  return violations;
}

function packageAuthorityViolations(file: string, content: string): readonly string[] {
  return [
    ...reverseAuthorityViolations(file, content),
    ...(file === CANONICAL_EXTENSION_REGISTRY
      ? richDocumentListItemSerializerViolations(file, content)
      : []),
  ];
}

function documentation(): Readonly<Record<string, string>> {
  return Object.fromEntries(files(DOCUMENTATION_ROOT)
    .filter((file) => extname(file) === '.md')
    .map((file) => [relative(DOCUMENTATION_ROOT, file), readFileSync(file, 'utf8')]));
}

describe('Tiptap adapter package boundary', () => {
  it('publishes only the package root', () => {
    const manifest = JSON.parse(readFileSync(resolve(ADAPTER_ROOT, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>;
    };
    expect(Object.keys(manifest.exports ?? {})).toEqual(['.']);
  });

  it('publishes the runtime-first EditorState binding only from the adapter package root', () => {
    expect(adapterPackageRoot.bindXnlRichDocumentTiptapDraftToEditorState).toBeTypeOf('function');
    expect(adapterPackageRoot.bindXnlRichDocumentTiptapDraftToEditorState).toHaveLength(3);

    for (const root of NEUTRAL_ROOTS) {
      expect(source(root), `${relative(PROJECT_ROOT, root)} EditorState binding leak`).not.toMatch(
        /bindXnlRichDocumentTiptapDraftToEditorState|XnlRichDocumentTiptapDraftEditorStateBinding/,
      );
    }
  });

  it.each(['editor', 'dom', 'nodeView', 'session', 'revision', 'vfs', 'writer'])(
    'rejects %s authority at the EditorState binding boundary',
    (authority) => {
      const schemaResult = adapterPackageRoot.createXnlRichDocumentTiptapSchema();
      expect(schemaResult.status).toBe('ready');
      if (schemaResult.status !== 'ready') throw new Error(schemaResult.diagnostics[0].message);
      const editorState = EditorState.create({
        schema: schemaResult.schema,
        doc: schemaResult.schema.node('doc', { nodeId: 'document.boundary' }, [
          schemaResult.schema.node('paragraph', { nodeId: 'paragraph.boundary' }),
        ]),
      });
      let effects = 0;
      const bindFromJavaScript = (
        adapterPackageRoot.bindXnlRichDocumentTiptapDraftToEditorState
      ) as unknown as (...args: unknown[]) => {
          readonly outcome: { readonly status: string };
        };
      const result = bindFromJavaScript(
        {
          emitInteraction: () => {
            effects += 1;
            return { status: 'emitted' as const };
          },
        },
        { editorState, [authority]: Object.freeze({}) },
        {
          schemaId: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
          extensionIds: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
          planNodeId: 'xnlp:node:document.boundary',
        },
      );

      expect(result.outcome.status).toBe('rejected');
      expect(effects).toBe(0);
    },
  );

  it('derives EditorState binding schema validation from the canonical registry owner', () => {
    const localDraftSource = readFileSync(resolve(ADAPTER_ROOT, 'src/localDraftLifecycle.ts'), 'utf8');
    const registrySource = readFileSync(resolve(ADAPTER_ROOT, 'src/registry.ts'), 'utf8');

    expect(localDraftSource).not.toMatch(/CANONICAL_(NODE|MARK)_SURFACE/);
    expect(localDraftSource).toContain('isXnlRichDocumentTiptapCanonicalSchema');
    expect(registrySource).toContain('createXnlRichDocumentTiptapSchema()');
    expect(registrySource).toContain('matchesCanonicalSchemaSurface');
  });

  it('accepts canonical schemas constructed as distinct owner instances without schema identity', () => {
    const first = adapterPackageRoot.createXnlRichDocumentTiptapSchema();
    const second = adapterPackageRoot.createXnlRichDocumentTiptapSchema();
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') throw new Error('Expected ready schemas.');
    expect(second.schema).not.toBe(first.schema);

    const editorState = EditorState.create({
      schema: second.schema,
      doc: second.schema.node('doc', { nodeId: 'document.boundary.distinct-schema' }, [
        second.schema.node('paragraph', { nodeId: 'paragraph.boundary.distinct-schema' }),
      ]),
    });
    const bindFromJavaScript = (
      adapterPackageRoot.bindXnlRichDocumentTiptapDraftToEditorState
    ) as unknown as (...args: unknown[]) => {
        readonly state?: { readonly editorState: EditorState };
        readonly outcome: { readonly status: string; readonly selection?: string };
      };

    const result = bindFromJavaScript(
      {},
      { editorState },
      {
        schemaId: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
        extensionIds: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
        planNodeId: 'xnlp:node:document.boundary.distinct-schema',
      },
    );

    expect(result.outcome).toMatchObject({ status: 'ready', selection: 'preserved' });
    expect(result.state?.editorState.schema).toBe(second.schema);
  });

  it('keeps the package-root source contract free of raw NodeView assembly', () => {
    const publicIndexSource = readFileSync(resolve(ADAPTER_ROOT, 'src/index.ts'), 'utf8');
    const publicRegistrySource = readFileSync(resolve(ADAPTER_ROOT, 'src/registry.ts'), 'utf8');

    expect(adapterPackageRoot.createXnlRichDocumentTiptapExtensions).toHaveLength(0);
    expect('createXnlRichDocumentTiptapHostExtensions' in adapterPackageRoot).toBe(false);
    expect(publicIndexSource).not.toContain('createXnlRichDocumentTiptapHostExtensions');
    expect(publicRegistrySource).not.toContain('NodeViewRenderer');
  });

  it('ignores JavaScript arguments passed to the canonical extension factory', () => {
    const rawNodeView = (() => ({ dom: {} as HTMLElement })) as NodeViewRenderer;
    const callFromJavaScript = adapterPackageRoot.createXnlRichDocumentTiptapExtensions as unknown as (
      nodeViews: Record<string, NodeViewRenderer>,
    ) => Extensions;

    const canonicalExtensions = callFromJavaScript({
      mermaid: rawNodeView,
      componentEmbed: rawNodeView,
      capsuleEmbed: rawNodeView,
    });
    for (const name of ['mermaid', 'componentEmbed', 'capsuleEmbed']) {
      const extension = canonicalExtensions.find((candidate) => candidate.name === name);
      expect(extension).toBeDefined();
      const config = extension?.config as { addNodeView?: () => NodeViewRenderer } | undefined;
      expect(config?.addNodeView).toBeUndefined();
    }
  });

  it('keeps renderer dependencies and source references inside the declared slice owners', () => {
    for (const root of SLICE_ROOTS) {
      const name = root.split('/').at(-1);
      const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      const dependencies = Object.keys(manifest.dependencies ?? {});
      const tiptapDependencies = dependencies.filter((dependency) => (
        dependency.startsWith('@tiptap/') || dependency.startsWith('prosemirror-')
      ));
      if (root === ADAPTER_ROOT) {
        expect(tiptapDependencies.length).toBeGreaterThan(0);
      } else {
        expect(tiptapDependencies, `${name} renderer dependency leak`).toEqual([]);
      }
    }

    for (const root of SLICE_ROOTS.filter((candidate) => candidate !== ADAPTER_ROOT)) {
      expect(source(root), `${relative(PROJECT_ROOT, root)} renderer source leak`).not.toMatch(
        /@tiptap\/|prosemirror-|\bNodeView(?:Renderer)?\b|VueNodeViewRenderer/,
      );
    }

    for (const root of NEUTRAL_ROOTS) {
      expect(source(root), `${relative(PROJECT_ROOT, root)} Vue or DOM source leak`).not.toMatch(
        /(?:from\s+['"]vue['"]|\bDOMParser\b|\bHTMLElement\b|\bquerySelector\b|document\.createElement)/,
      );
    }
  });

  it('keeps concrete XNL production imports support-owned', () => {
    for (const root of NON_SUPPORT_ROOTS) {
      expect(source(root), `${relative(PROJECT_ROOT, root)} concrete XNL source leak`).not.toMatch(
        /(?:from\s+|import\s*\()['"](?:xnl-core|xnl-vfs)(?:\/[^'"]*)?['"]/,
      );
    }
  });

  it('allows Tiptap package dependencies only in the adapter and legacy admin baseline', () => {
    const packageRoots = readdirSync(PACKAGES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(PACKAGES_ROOT, entry.name, 'package.json')))
      .map((entry) => join(PACKAGES_ROOT, entry.name));
    const owners = packageRoots.filter((root) => {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
      const dependencyGroups = [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.peerDependencies,
        manifest.optionalDependencies,
      ];
      return dependencyGroups.some((group) => (
        group !== null
        && typeof group === 'object'
        && Object.keys(group).some((dependency) => (
          dependency.startsWith('@tiptap/') || dependency.startsWith('prosemirror-')
        ))
      ));
    });

    expect(new Set(owners)).toEqual(new Set([ADAPTER_ROOT, LEGACY_ADMIN_ROOT]));
    expect(SLICE_ROOTS).not.toContain(LEGACY_ADMIN_ROOT);
  });

  it('allows only the exact canonical listItem serializer without reverse authority', () => {
    const adapterSources = sourceFiles(ADAPTER_ROOT);
    expect(adapterSources.some(({ file }) => file === CANONICAL_EXTENSION_REGISTRY)).toBe(true);

    for (const { file, content } of adapterSources) {
      const sourcePath = relative(PROJECT_ROOT, file);
      expect(
        packageAuthorityViolations(file, content),
        `${sourcePath} HTML or DOM reverse-authoring leak`,
      ).toEqual([]);
    }

    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    expect(
      richDocumentListItemSerializerViolations(
        CANONICAL_EXTENSION_REGISTRY,
        registrySource,
      ),
    ).toEqual([]);

    const renderHtmlOwners = adapterSources.filter(({ file, content }) => (
      identifierCount(parseTypescript(file, content), 'renderHTML') > 0
    )).map(({ file }) => file);
    expect(renderHtmlOwners).toEqual([CANONICAL_EXTENSION_REGISTRY]);
  });

  it.each([
    {
      name: 'element.outerHTML',
      statement: 'const pageMarkup = element.outerHTML;',
    },
    {
      name: 'globalThis.document.body.textContent',
      statement: 'const pageText = globalThis.document.body.textContent;',
    },
    {
      name: "element.getAttribute('nodeid')",
      statement: "const nodeId = element.getAttribute('nodeid');",
    },
  ])('rejects $name inside the approved serializer', ({ statement }) => {
    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    const mutated = registrySource.replace(
      "return ['li', HTMLAttributes, 0];",
      `${statement}\n    return ['li', HTMLAttributes, 0];`,
    );
    expect(mutated).not.toBe(registrySource);
    expect(
      richDocumentListItemSerializerViolations(CANONICAL_EXTENSION_REGISTRY, mutated),
    ).toContain("renderHTML must return only ['li', HTMLAttributes, 0]");
  });

  it('rejects a computed serializer override with an indirect DOM alias', () => {
    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    const override = `
const readAliasedDom = (element: Element) => element.getAttribute('nodeid');
const serializerOverride = {
  ['render' + 'HTML']({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    readAliasedDom(HTMLAttributes.element as Element);
    return ['li', HTMLAttributes, 0] as const;
  },
};

`;
    const mutated = registrySource
      .replace('const RichDocumentListItem = Node.create({', `${override}const RichDocumentListItem = Node.create({`)
      .replace(
        "    return ['li', HTMLAttributes, 0];\n  },\n});",
        "    return ['li', HTMLAttributes, 0];\n  },\n  ...serializerOverride,\n});",
      );

    expect(mutated).not.toBe(registrySource);
    expect(mutated).toContain("['render' + 'HTML']");
    expect(mutated).toContain('...serializerOverride');
    expect(
      richDocumentListItemSerializerViolations(CANONICAL_EXTENSION_REGISTRY, mutated),
    ).toContain('RichDocumentListItem config must not contain spread assignments');
  });

  it('rejects a post-construction computed-key serializer override with an indirect DOM alias', () => {
    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    const override = `
const readAliasedDom = (element: Element) => element.getAttribute('nodeid');
Object.defineProperty(
  RichDocumentListItem.config,
  ['render', 'HTML'].join(''),
  {
    value({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
      readAliasedDom(HTMLAttributes.element as Element);
      return ['li', HTMLAttributes, 0] as const;
    },
  },
);
`;
    const mutated = registrySource.replace(
      'const RichDocumentTable = Table.extend({',
      `${override}\nconst RichDocumentTable = Table.extend({`,
    );
    const expected =
      'RichDocumentListItem may only be referenced by its declaration and canonical extensions array';

    expect(mutated).not.toBe(registrySource);
    expect(mutated).toContain('Object.defineProperty(\n  RichDocumentListItem.config');
    expect(mutated).toContain("['render', 'HTML'].join('')");
    expect(mutated).toContain('readAliasedDom(HTMLAttributes.element as Element)');
    expect(
      richDocumentListItemSerializerViolations(CANONICAL_EXTENSION_REGISTRY, mutated),
    ).toContain(expected);
    expect(packageAuthorityViolations(CANONICAL_EXTENSION_REGISTRY, mutated)).toContain(expected);
  });

  it.each([
    {
      name: 'property/config access',
      statement: 'void RichDocumentListItem.config;',
    },
    {
      name: 'assignment',
      statement: 'RichDocumentListItem.config = {} as typeof RichDocumentListItem.config;',
    },
    {
      name: 'alias escape',
      statement: 'const escapedListItem = RichDocumentListItem;',
    },
    {
      name: 'computed dynamic mutation',
      statement: "RichDocumentListItem.config[['render', 'HTML'].join('')] = () => ['li', {}, 0];",
    },
  ])('rejects post-construction RichDocumentListItem $name', ({ statement }) => {
    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    const mutated = registrySource.replace(
      'const RichDocumentTable = Table.extend({',
      `${statement}\nconst RichDocumentTable = Table.extend({`,
    );

    expect(mutated).not.toBe(registrySource);
    expect(
      richDocumentListItemSerializerViolations(CANONICAL_EXTENSION_REGISTRY, mutated),
    ).toContain(
      'RichDocumentListItem may only be referenced by its declaration and canonical extensions array',
    );
  });

  it.each([
    {
      name: 'computed property name',
      member: "['renderHTML']({ HTMLAttributes }) { return ['li', HTMLAttributes, 0]; },",
      expected: 'RichDocumentListItem config must not contain computed property names',
    },
    {
      name: 'dynamic accessor shape',
      member: "get serializerOverride() { return { renderHTML: () => ['li', {}, 0] }; },",
      expected: 'RichDocumentListItem config must use only direct property assignments and methods',
    },
  ])('rejects $name in the listItem config', ({ member, expected }) => {
    const registrySource = readFileSync(CANONICAL_EXTENSION_REGISTRY, 'utf8');
    const mutated = registrySource.replace(
      'const RichDocumentListItem = Node.create({',
      `const RichDocumentListItem = Node.create({\n  ${member}`,
    );

    expect(mutated).not.toBe(registrySource);
    expect(
      richDocumentListItemSerializerViolations(CANONICAL_EXTENSION_REGISTRY, mutated),
    ).toContain(expected);
  });

  it('keeps ownerDocument-based private NodeView DOM lifecycle legal', () => {
    const privateNodeViewLifecycle = `
      const HostNode = Node.create({
        addNodeView() {
          return ({ editor }) => {
            const ownerDocument = editor.view.dom.ownerDocument;
            const dom = ownerDocument.createElement('div');
            dom.setAttribute('contenteditable', 'false');
            return { dom, destroy() { dom.replaceChildren(); } };
          };
        },
      });
    `;
    expect(reverseAuthorityViolations('privateNodeViewLifecycle.ts', privateNodeViewLifecycle))
      .toEqual([]);
  });

  it('keeps public docs aligned with the production semantic package chain', () => {
    const docs = documentation();
    const allDocs = Object.values(docs).join('\n');
    const publicApi = docs['public-api.md'] ?? '';
    const projection = docs['projection-and-authoring.md'] ?? '';
    const identity = docs['identity.md'] ?? '';
    const tiers = docs['usage-tiers.md'] ?? '';
    const boundaries = docs['boundaries.md'] ?? '';
    const localDraftStart = publicApi.indexOf('## Local Draft：Detached 与 EditorState-bound');
    const localDraftEnd = publicApi.indexOf('## Occurrence 示例', localDraftStart);
    const localDraft = publicApi.slice(localDraftStart, localDraftEnd);

    for (const publicValue of [
      'createXnlRichDocumentSemanticDialect',
      'translateXnlRichDocumentEditInteraction',
      'materializeXnlRichDocumentSemanticCandidate',
      'bindXnlRichDocumentEditTranslator',
      'createXnlRichDocumentTrustedAuthoringHost',
    ]) {
      expect(publicApi, publicValue).toContain(publicValue);
    }
    expect(publicApi).toContain("from 'dg-cell-mvi-halfcode-support'");
    expect(publicApi).toContain('output = fn(runtime, input, config)');
    expect(projection).toContain('accepted-baseline');
    expect(projection).toContain('exact-once');
    expect(identity).toContain('xnl-temporary:*');
    expect(identity).toContain('copyOrigins');
    expect(tiers).toContain('production canonical semantic values');
    expect(tiers).toContain('功能采用模式');
    expect(tiers).toContain('Quick Runtime');
    expect(tiers).toContain('Compact Runtime');
    expect(tiers).toContain('Split / Public Runtime');
    expect(tiers).toContain('同一条 RichDocument capability chain');
    expect(tiers).toContain('正交维度');
    expect(boundaries).toContain('Workbench 页面与真实产品浏览器 E2E');
    expect(localDraftStart).toBeGreaterThanOrEqual(0);
    expect(localDraftEnd).toBeGreaterThan(localDraftStart);
    expect(localDraft).toContain('createXnlRichDocumentTiptapDraft(runtime, input, config)');
    expect(localDraft).toContain('bindXnlRichDocumentTiptapDraftToEditorState(runtime, input, config)');
    expect(localDraft).toContain('result   = fn(runtime, input, config)');
    expect(localDraft).toContain('{ document, acceptedObservation? }');
    expect(localDraft).toContain('{ editorState, acceptedObservation? }');
    expect(localDraft).toContain('{ schemaId, extensionIds, planNodeId }');
    expect(localDraft).toContain('matching');
    expect(localDraft).toContain('stale history');
    expect(localDraft).toContain('composition');
    expect(localDraft).toContain('Domain XNL');
    expect(localDraft).toContain("from 'dg-cell-mvi-halfcode-tiptap-vue'");
    expect(localDraft).not.toContain("from 'dg-cell-mvi-halfcode-tiptap-vue/src/");

    expect(allDocs).not.toContain('必须自己拥有领域 translator');
    expect(allDocs).not.toContain('通用 semantic materializer');
    expect(allDocs).not.toContain('不同领域仍需提供自己的 Interaction translation');

    const typescriptExamples = Array.from(
      allDocs.matchAll(/```(?:ts|typescript)\s*\n([\s\S]*?)```/g),
      (match) => match[1] ?? '',
    ).join('\n');
    expect(typescriptExamples).not.toMatch(/\.(?:getJSON|getHTML)\s*\(/);

    const localDraftExamples = Array.from(
      localDraft.matchAll(/```(?:ts|typescript)\s*\n([\s\S]*?)```/g),
      (match) => match[1] ?? '',
    ).join('\n');
    expect(localDraftExamples).toContain('bindXnlRichDocumentTiptapDraftToEditorState(');
    expect(localDraftExamples).toContain('{ editorState: editor.state, acceptedObservation:');
    expect(localDraftExamples).toContain('acceptedTiptapProjection');
    expect(localDraftExamples).not.toMatch(
      /\.(?:getJSON|getHTML)\s*\(|\bgenerate(?:JSON|HTML)\s*\(|\bDOMParser\b|\b(?:innerHTML|outerHTML|querySelector)\b|\.dispatch\s*\(/,
    );
    expect(localDraftExamples).not.toMatch(
      /\{\s*(?:editor|dom|nodeView|session|revision|vfs|writer)\s*:/,
    );
  });
});
