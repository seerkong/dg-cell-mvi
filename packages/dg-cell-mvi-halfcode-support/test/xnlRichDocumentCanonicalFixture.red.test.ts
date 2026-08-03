import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseXnl,
  stringifyLineBlock,
  type DataElementNode,
  type XnlNode,
} from 'xnl-core';
import type * as CanonicalFixtureModule from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  adaptXnlNodeToRichDocument,
  materializeXnlRichDocument,
} from '../src/xnl-rich-document';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const CONTRACT_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-contract');
const LOGIC_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-logic');
const SUPPORT_ROOT = resolve(PROJECT_ROOT, 'packages/dg-cell-mvi-halfcode-support');
const supportRequire = createRequire(import.meta.url);
const { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } = supportRequire(
  'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document',
) as typeof CanonicalFixtureModule;

function files(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function source(root: string): string {
  return files(root)
    .filter((file) => ['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extname(file)))
    .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

function dependencies(root: string): Readonly<Record<string, string>> {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    dependencies?: Readonly<Record<string, string>>;
  };
  return manifest.dependencies ?? {};
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}

function dataElement(value: XnlNode | undefined, label: string): DataElementNode {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (value as { kind?: unknown }).kind !== 'DataElement') {
    throw new TypeError(`Expected ${label} to be a concrete XNL DataElement.`);
  }
  return value as DataElementNode;
}

function childByTag(parent: DataElementNode, tag: string): DataElementNode {
  const child = parent.body?.find((candidate) => (
    candidate !== null
    && typeof candidate === 'object'
    && !Array.isArray(candidate)
    && (candidate as { kind?: unknown }).kind === 'DataElement'
    && (candidate as DataElementNode).tag === tag
  ));
  return dataElement(child, `${tag} child`);
}

describe('canonical RichDocument support regression', () => {
  it('materializes the shared fixture to concrete xnl-core and adapts it back canonically', () => {
    const before = JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    const materialized = materializeXnlRichDocument(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(materialized.status).toBe('materialized');
    if (materialized.status !== 'materialized') throw new Error('expected materialized fixture');

    const adapted = adaptXnlNodeToRichDocument(materialized.document);
    expect(adapted).toEqual({
      status: 'normalized',
      document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
    });
    expect(JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE)).toBe(before);
    expectDeepFrozen(materialized);
    expectDeepFrozen(adapted);
  });

  it('keeps marks and nested embed input structured through concrete and textual XNL', () => {
    const materialized = materializeXnlRichDocument(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(materialized.status).toBe('materialized');
    if (materialized.status !== 'materialized') throw new Error('expected materialized fixture');

    const root = dataElement(materialized.document, 'materialized document');
    const heading = childByTag(root, 'Heading');
    const text = childByTag(heading, 'Text');
    expect(text.attributes?.marks).toEqual([
      { kind: 'bold' },
      { kind: 'italic' },
      { kind: 'strike' },
      { kind: 'code' },
      {
        kind: 'link',
        href: 'https://example.test/rich-document',
        title: 'RichDocument contract',
      },
    ]);
    expect(Array.isArray(text.attributes?.marks)).toBe(true);
    expect(typeof text.attributes?.marks).not.toBe('string');

    const component = childByTag(root, 'ComponentEmbed');
    const capsule = childByTag(root, 'CapsuleEmbed');
    expect(component.attributes?.input).toEqual({
      service: {
        id: 'payments',
        enabled: true,
        thresholds: [1, 5, 10],
        metadata: { owner: 'checkout', note: null },
      },
    });
    expect(capsule.attributes?.input).toEqual({
      regions: [
        { name: 'eu', active: true },
        { name: 'us', active: false },
      ],
      viewport: { zoom: 2, center: [41.01, 28.97] },
    });

    const textualXnl = stringifyLineBlock(materialized.document);
    expect(textualXnl).toContain('marks = [{ kind = "bold" }');
    expect(textualXnl).not.toContain('marks = "[');
    const reparsedRoot = parseXnl(textualXnl).nodes[0];
    if (reparsedRoot === undefined) throw new Error('expected textual XNL root');
    const reparsedDocument = dataElement(reparsedRoot, 'reparsed document');
    expect(Array.isArray(childByTag(childByTag(reparsedDocument, 'Heading'), 'Text').attributes?.marks))
      .toBe(true);
    expect(childByTag(reparsedDocument, 'ComponentEmbed').attributes?.input)
      .toEqual(component.attributes?.input);
    expect(childByTag(reparsedDocument, 'CapsuleEmbed').attributes?.input)
      .toEqual(capsule.attributes?.input);
    expect(adaptXnlNodeToRichDocument(reparsedRoot)).toEqual({
      status: 'normalized',
      document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
    });
  });

  it('leaves malformed structured marks to neutral logic and rejects unsafe values fail closed', () => {
    const malformed = parseXnl(`
      <Document #document.malformed [
        <Paragraph #paragraph.malformed [
          <Text { text = "unsafe" marks = [{ kind = "rainbow" }] }>
        ]>
      ]>
    `).nodes[0];
    if (malformed === undefined) throw new Error('expected malformed fixture root');
    const malformedResult = adaptXnlNodeToRichDocument(malformed);
    expect(malformedResult).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({
        code: 'UNSUPPORTED_CONSTRUCT',
        message: 'Text mark is unsupported.',
      })],
    });

    let getterCalls = 0;
    const accessorMark = {};
    Object.defineProperty(accessorMark, 'kind', {
      get() {
        getterCalls += 1;
        return 'bold';
      },
      enumerable: true,
    });
    class RuntimeMark {
      readonly kind = 'bold';
    }

    for (const unsafeMarks of [[accessorMark], [new RuntimeMark()]]) {
      const unsafe = structuredClone(malformed) as DataElementNode;
      const unsafeText = childByTag(childByTag(unsafe, 'Paragraph'), 'Text');
      unsafeText.attributes = { ...unsafeText.attributes, marks: unsafeMarks as unknown as XnlNode };
      expect(adaptXnlNodeToRichDocument(unsafe)).toMatchObject({
        status: 'rejected',
        diagnostics: [expect.objectContaining({ code: 'LOSSY_CONSTRUCT' })],
      });
    }
    expect(getterCalls).toBe(0);

    const domainRecord = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(domainRecord, 'kind', {
      value: 'domain-value',
      enumerable: true,
    });
    Object.defineProperty(domainRecord, '__proto__', {
      value: { retained: true },
      enumerable: true,
    });
    const descriptorSafe = materializeXnlRichDocument({
      kind: 'document',
      nodeId: 'document.descriptor-safe',
      children: [{
        kind: 'component-embed',
        nodeId: 'component.descriptor-safe',
        component: { ref: 'component://example.DescriptorSafe' },
        input: { value: domainRecord },
      }],
    } as never);
    expect(descriptorSafe.status).toBe('materialized');
    if (descriptorSafe.status !== 'materialized') throw new Error('expected descriptor-safe materialization');
    const descriptorInput = childByTag(
      dataElement(descriptorSafe.document, 'descriptor-safe document'),
      'ComponentEmbed',
    ).attributes?.input as Record<string, unknown>;
    const descriptorValue = descriptorInput.value as Record<string, unknown>;
    expect(Object.getPrototypeOf(descriptorValue)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(descriptorValue, '__proto__')?.value)
      .toEqual({ retained: true });
  });

  it('keeps concrete XNL ownership in support and all three packages renderer-neutral', () => {
    const contractLogicSource = [
      source(resolve(CONTRACT_ROOT, 'src/xnl-rich-document')),
      source(resolve(LOGIC_ROOT, 'src/xnl-rich-document')),
    ].join('\n');
    const supportSource = source(resolve(SUPPORT_ROOT, 'src/xnl-rich-document'));
    const forbiddenConcreteOrRendererImport =
      /(?:from|import\s*\()\s*['"](?:xnl-core|xnl-vfs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom)(?:\/[^'"]*)?['"]/;
    const forbiddenRendererImport =
      /(?:from|import\s*\()\s*['"](?:vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom|jsdom|happy-dom)(?:\/[^'"]*)?['"]/;
    const forbiddenBrowserApi =
      /\b(?:window\.|globalThis\.document|querySelector|HTMLElement|HTML[A-Z][A-Za-z]*Element|NodeView)\b/;

    expect(contractLogicSource).not.toMatch(forbiddenConcreteOrRendererImport);
    expect(supportSource).toMatch(/from ['"]xnl-core['"]/);
    expect(supportSource).not.toMatch(forbiddenRendererImport);
    expect(supportSource).not.toMatch(forbiddenBrowserApi);
    expect(dependencies(CONTRACT_ROOT)).not.toHaveProperty('xnl-core');
    expect(dependencies(CONTRACT_ROOT)).not.toHaveProperty('xnl-vfs');
    expect(dependencies(LOGIC_ROOT)).not.toHaveProperty('xnl-core');
    expect(dependencies(LOGIC_ROOT)).not.toHaveProperty('xnl-vfs');
    expect(dependencies(SUPPORT_ROOT)).toMatchObject({
      'xnl-core': 'workspace:*',
      'xnl-vfs': 'workspace:*',
    });
  });
});
