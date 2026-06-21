import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as vuePackage from '../src';

const PACKAGE_ROOT = resolve(__dirname, '..');
const SCHEMA_EDITOR_SOURCE = join(PACKAGE_ROOT, 'src', 'schema-editor');
const PUBLIC_PROCESSORS = [
  'createSchemaEditorPresenterRegistry',
  'composeSchemaEditorPresenterRegistries',
  'createSchemaEditorRendererIdentityProjection',
  'renderSchemaEditorNode',
  'dispatchSchemaEditorPresenterEvent',
  'createSchemaEditorCanonicalRegistry',
] as const;
const packageValues = vuePackage as unknown as Record<string, unknown>;
const publicApiAvailable = PUBLIC_PROCESSORS.every(
  (name) => typeof packageValues[name] === 'function',
);

type PresenterAdapter = Readonly<{ component: unknown }>;
type PresenterEntry = Readonly<{ id: string; adapter: PresenterAdapter }>;
type RegistryDiagnostic = Readonly<{
  code: string;
  id: string;
  message: string;
}>;
type PresenterResolution =
  | Readonly<{ ok: true; id: string; adapter: PresenterAdapter }>
  | Readonly<{ ok: false; id: string; diagnostic: RegistryDiagnostic }>;
type PresenterRegistry = Readonly<{
  entries?: readonly PresenterEntry[];
  resolve(id: string): PresenterResolution;
}>;
type RegistryResult =
  | Readonly<{ ok: true; registry: PresenterRegistry; diagnostics: readonly [] }>
  | Readonly<{ ok: false; diagnostics: readonly RegistryDiagnostic[] }>;
type CreateRegistry = (
  runtime: unknown,
  input: Readonly<{ entries: readonly PresenterEntry[] }>,
  config: Readonly<{ duplicate: 'reject' }>,
) => RegistryResult;
type ComposeRegistries = (
  runtime: unknown,
  input: Readonly<{ registries: readonly PresenterRegistry[] }>,
  config: Readonly<{ conflict: 'reject' | 'last-wins' }>,
) => RegistryResult;
type PublicProcessor = (runtime: unknown, input: unknown, config: unknown) => unknown;

const createRegistry = packageValues.createSchemaEditorPresenterRegistry as
  | CreateRegistry
  | undefined;
const composeRegistries = packageValues.composeSchemaEditorPresenterRegistries as
  | ComposeRegistries
  | undefined;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function exportedShape(name: string): {
  readonly keys: readonly string[];
  readonly source: string;
} | undefined {
  for (const file of sourceFiles(SCHEMA_EDITOR_SOURCE).filter((path) => path.endsWith('.ts'))) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!ts.canHaveModifiers(statement)) continue;
      const isExported = ts.getModifiers(statement)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!isExported) continue;
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
        return {
          keys: statement.members.flatMap((member) =>
            member.name && ts.isIdentifier(member.name) ? [member.name.text] : []),
          source: statement.getText(sourceFile),
        };
      }
      if (
        ts.isTypeAliasDeclaration(statement)
        && statement.name.text === name
        && ts.isTypeLiteralNode(statement.type)
      ) {
        return {
          keys: statement.type.members.flatMap((member) =>
            member.name && ts.isIdentifier(member.name) ? [member.name.text] : []),
          source: statement.getText(sourceFile),
        };
      }
    }
  }
  return undefined;
}

describe('Schema Editor Vue T1.1 public surface RED', () => {
  it('exports every public factory/Processor from the package root with arity three', () => {
    expect(Object.fromEntries(PUBLIC_PROCESSORS.map((name) => [
      name,
      {
        type: typeof packageValues[name],
        arity: typeof packageValues[name] === 'function'
          ? (packageValues[name] as PublicProcessor).length
          : undefined,
      },
    ]))).toEqual(Object.fromEntries(PUBLIC_PROCESSORS.map((name) => [
      name,
      { type: 'function', arity: 3 },
    ])));
  });
});

describe.runIf(publicApiAvailable)('Schema Editor Vue T1.1 public contracts', () => {
  it('resolves stable ids with opaque toolkit-neutral adapter identity', () => {
    const TextProbe = Object.freeze({ name: 'TextProbe' });
    const BooleanProbe = Object.freeze({ name: 'BooleanProbe' });
    const textAdapter = Object.freeze({ component: TextProbe });
    const booleanAdapter = Object.freeze({ component: BooleanProbe });

    const result = createRegistry!(
      Object.freeze({}),
      {
        entries: [
          { id: 'scalar.text', adapter: textAdapter },
          { id: 'scalar.boolean', adapter: booleanAdapter },
        ],
      },
      { duplicate: 'reject' },
    );

    expect(result).toMatchObject({ ok: true, diagnostics: [] });
    if (!result.ok) return;
    expect(result.registry.resolve('scalar.text')).toEqual({
      ok: true,
      id: 'scalar.text',
      adapter: textAdapter,
    });
    expect(result.registry.resolve('scalar.boolean')).toEqual({
      ok: true,
      id: 'scalar.boolean',
      adapter: booleanAdapter,
    });
    expect(result.registry.resolve('scalar.text')).toEqual(
      result.registry.resolve('scalar.text'),
    );
    expect(result.registry).not.toHaveProperty('elementPlus');
    expect(result.registry).not.toHaveProperty('global');
  });

  it('fails closed with structured diagnostics for unknown and duplicate presenter ids', () => {
    const adapter = Object.freeze({ component: Object.freeze({ name: 'Probe' }) });
    const ready = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.text', adapter }] },
      { duplicate: 'reject' },
    );
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;

    expect(ready.registry.resolve('missing.presenter')).toEqual({
      ok: false,
      id: 'missing.presenter',
      diagnostic: expect.objectContaining({
        code: 'UNKNOWN_SCHEMA_EDITOR_PRESENTER',
        id: 'missing.presenter',
      }),
    });

    const duplicate = createRegistry!(
      Object.freeze({}),
      {
        entries: [
          { id: 'scalar.text', adapter },
          {
            id: 'scalar.text',
            adapter: Object.freeze({ component: Object.freeze({ name: 'OtherProbe' }) }),
          },
        ],
      },
      { duplicate: 'reject' },
    );
    expect(duplicate).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'DUPLICATE_SCHEMA_EDITOR_PRESENTER',
          id: 'scalar.text',
        }),
      ],
    });
  });

  it('requires an explicit composition conflict policy and never mutates source registries', () => {
    const baseAdapter = Object.freeze({ component: Object.freeze({ name: 'BaseProbe' }) });
    const hostAdapter = Object.freeze({ component: Object.freeze({ name: 'HostProbe' }) });
    const baseResult = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.text', adapter: baseAdapter }] },
      { duplicate: 'reject' },
    );
    const hostResult = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.text', adapter: hostAdapter }] },
      { duplicate: 'reject' },
    );
    expect(baseResult.ok && hostResult.ok).toBe(true);
    if (!baseResult.ok || !hostResult.ok) return;

    const rejected = composeRegistries!(
      Object.freeze({}),
      { registries: [baseResult.registry, hostResult.registry] },
      { conflict: 'reject' },
    );
    expect(rejected).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'DUPLICATE_SCHEMA_EDITOR_PRESENTER',
          id: 'scalar.text',
        }),
      ],
    });

    const composed = composeRegistries!(
      Object.freeze({}),
      { registries: [baseResult.registry, hostResult.registry] },
      { conflict: 'last-wins' },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.registry.resolve('scalar.text')).toMatchObject({
      ok: true,
      adapter: hostAdapter,
    });
    expect(baseResult.registry.resolve('scalar.text')).toMatchObject({
      ok: true,
      adapter: baseAdapter,
    });
  });

  it('returns structured invalid-input diagnostics for revoked proxy inputs without throwing', () => {
    const revokedCreate = Proxy.revocable({ entries: [] }, {});
    revokedCreate.revoke();
    const createResult = createRegistry!(
      Object.freeze({}),
      revokedCreate.proxy as { entries: readonly PresenterEntry[] },
      { duplicate: 'reject' },
    );
    expect(createResult).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        }),
      ],
    });

    const revokedCompose = Proxy.revocable({ registries: [] }, {});
    revokedCompose.revoke();
    const composeResult = composeRegistries!(
      Object.freeze({}),
      revokedCompose.proxy as { registries: readonly PresenterRegistry[] },
      { conflict: 'reject' },
    );
    expect(composeResult).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        }),
      ],
    });
  });

  it('fails closed for revoked nested array and registry snapshot proxies without throwing', () => {
    const revokedEntries = Proxy.revocable([], {});
    revokedEntries.revoke();
    const createResult = createRegistry!(
      Object.freeze({}),
      { entries: revokedEntries.proxy as readonly PresenterEntry[] },
      { duplicate: 'reject' },
    );
    expect(createResult).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        }),
      ],
    });

    const revokedRegistries = Proxy.revocable([], {});
    revokedRegistries.revoke();
    const composeResult = composeRegistries!(
      Object.freeze({}),
      { registries: revokedRegistries.proxy as readonly PresenterRegistry[] },
      { conflict: 'reject' },
    );
    expect(composeResult).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        }),
      ],
    });

    const revokedSnapshot = Proxy.revocable([], {});
    revokedSnapshot.revoke();
    const forgedRegistry: PresenterRegistry = Object.freeze({
      entries: revokedSnapshot.proxy as readonly PresenterEntry[],
      resolve() {
        throw new Error('compose must reject a revoked snapshot without invoking resolve');
      },
    });
    const forgedResult = composeRegistries!(
      Object.freeze({}),
      { registries: [forgedRegistry] },
      { conflict: 'reject' },
    );
    expect(forgedResult).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEMA_EDITOR_PRESENTER_REGISTRY',
        }),
      ],
    });
  });

  it('rejects presenter adapters whose component is absent or a scalar value', () => {
    const invalidAdapters: readonly PresenterAdapter[] = [
      Object.freeze({ component: undefined }),
      Object.freeze({ component: null }),
      Object.freeze({ component: 'scalar-component' }),
      Object.freeze({ component: 1 }),
      Object.freeze({ component: true }),
    ];

    for (const [index, adapter] of invalidAdapters.entries()) {
      const result = createRegistry!(
        Object.freeze({}),
        { entries: [{ id: `invalid.adapter.${index}`, adapter }] },
        { duplicate: 'reject' },
      );
      expect(result).toEqual({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: 'INVALID_SCHEMA_EDITOR_PRESENTER_ADAPTER',
            id: `invalid.adapter.${index}`,
          }),
        ],
      });
    }
  });

  it('composes cross-instance registries through an explicit frozen own entries snapshot', () => {
    const baseAdapter = Object.freeze({ component: Object.freeze({ name: 'BaseProbe' }) });
    const hostAdapter = Object.freeze({ component: Object.freeze({ name: 'HostProbe' }) });
    const baseResult = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.text', adapter: baseAdapter }] },
      { duplicate: 'reject' },
    );
    const hostResult = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.number', adapter: hostAdapter }] },
      { duplicate: 'reject' },
    );
    expect(baseResult.ok && hostResult.ok).toBe(true);
    if (!baseResult.ok || !hostResult.ok) return;

    const entriesDescriptor = Object.getOwnPropertyDescriptor(
      baseResult.registry,
      'entries',
    );
    expect(entriesDescriptor).toMatchObject({
      enumerable: true,
      configurable: false,
      writable: false,
    });
    const entriesSnapshot = entriesDescriptor?.value as readonly PresenterEntry[];
    expect(Object.isFrozen(entriesSnapshot)).toBe(true);
    expect(Object.isFrozen(entriesSnapshot[0])).toBe(true);
    expect(entriesSnapshot[0]?.adapter).toBe(baseAdapter);

    const crossInstanceRegistry: PresenterRegistry = Object.freeze({
      entries: entriesSnapshot,
      resolve() {
        throw new Error('compose must validate the snapshot without invoking resolve');
      },
    });

    const composed = composeRegistries!(
      Object.freeze({}),
      { registries: [crossInstanceRegistry, hostResult.registry] },
      { conflict: 'reject' },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.registry.resolve('scalar.text')).toEqual({
      ok: true,
      id: 'scalar.text',
      adapter: baseAdapter,
    });
    expect(composed.registry.resolve('scalar.number')).toEqual({
      ok: true,
      id: 'scalar.number',
      adapter: hostAdapter,
    });
    expect(baseResult.registry.resolve('scalar.text')).toEqual({
      ok: true,
      id: 'scalar.text',
      adapter: baseAdapter,
    });
  });

  it('reads only own data descriptors and freezes registry result shells', () => {
    let getterCalls = 0;
    const accessorInput = Object.defineProperty({}, 'entries', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return [];
      },
    });
    const invalid = createRegistry!(
      Object.freeze({}),
      accessorInput as { entries: readonly PresenterEntry[] },
      { duplicate: 'reject' },
    );
    expect(invalid).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT' }),
      ],
    });
    expect(getterCalls).toBe(0);
    expect(Object.isFrozen(invalid)).toBe(true);
    expect(Object.isFrozen(invalid.diagnostics)).toBe(true);

    const adapter = { component: Object.freeze({ name: 'IdentityProbe' }) };
    const ready = createRegistry!(
      Object.freeze({}),
      { entries: [{ id: 'scalar.identity', adapter }] },
      { duplicate: 'reject' },
    );
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    const resolution = ready.registry.resolve('scalar.identity');
    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready.registry)).toBe(true);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(resolution.ok && resolution.adapter).toBe(adapter);
    expect(Object.isFrozen(adapter)).toBe(false);
  });

  it('publishes pure-data normalized events and capability-free presenter props', () => {
    const event = exportedShape('SchemaEditorPresenterEvent');
    const props = exportedShape('SchemaEditorPresenterProps');

    expect(event?.keys).toEqual(['event', 'payload']);
    expect(event?.source).toMatch(/\bpayload\b[^;]*\bSchemaEditorContractValue\b/);
    expect(event?.source).not.toMatch(/=>|\bFunction\b|\bcallback\b/i);
    expect(props?.keys).toEqual([
      'node',
      'value',
      'path',
      'presenterOptions',
      'pending',
      'diagnostics',
      'eventContext',
      'onSchemaEditorEvent',
    ]);
    expect(`${event?.source ?? ''}\n${props?.source ?? ''}`).not.toMatch(
      /\b(?:ValueHost|SchemaEditorSession|HalfcodeAppRuntime|ScopeRuntime|writer|persistence|database|vfs)\b/i,
    );
  });
});

describe('Schema Editor Vue T1.1 ownership boundaries', () => {
  it('keeps one package-root export and no public deep-import surface', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      readonly exports: Readonly<Record<string, string>>;
    };
    expect(manifest.exports).toEqual({ '.': './src/index.ts' });
  });

  it('keeps the schema-editor capsule free of excluded toolkit, domain, persistence, and global ownership', () => {
    const files = sourceFiles(SCHEMA_EDITOR_SOURCE).filter((path) => path.endsWith('.ts'));
    const sources = files.map((file) => readFileSync(file, 'utf8'));

    for (const [index, source] of sources.entries()) {
      const file = files[index];
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const imports: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          && node.moduleSpecifier
          && ts.isStringLiteral(node.moduleSpecifier)
        ) {
          imports.push(node.moduleSpecifier.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);

      for (const specifier of imports) {
        expect(
          specifier,
          `${relative(SCHEMA_EDITOR_SOURCE, file)} deep-imports ${specifier}`,
        ).not.toMatch(/^dg-cell-mvi-[^/]+\/|^@[^/]+\/[^/]+\//);
        expect(
          specifier,
          `${relative(SCHEMA_EDITOR_SOURCE, file)} imports excluded ownership`,
        ).not.toMatch(/element-plus|(?:^|[-/])flow(?:[-/]|$)|xnl|vfs|database/i);
      }
    }

    expect(sources.join('\n')).not.toMatch(
      /\b(?:globalThis|window|document|indexedDB|localStorage|applyXnl|writeXnl|createVfs|openDatabase)\b/,
    );
  });
});
