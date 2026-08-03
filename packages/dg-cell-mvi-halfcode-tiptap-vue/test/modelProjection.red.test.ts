import { describe, expect, it } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import type { XnlRichDocument } from 'dg-cell-mvi-halfcode-contract';
import type { JSONContent } from '@tiptap/core';
import {
  createXnlRichDocumentTiptapSchema,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from '../src';

const CONFIG = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
} as const;

const NODE_TOP_LEVEL_FIELDS = ['attrs', 'content', 'marks', 'text'] as const;
const NODE_ALLOWED_TOP_LEVEL_FIELDS: Readonly<Record<string, readonly (typeof NODE_TOP_LEVEL_FIELDS)[number][]>> = {
  doc: ['attrs', 'content'],
  paragraph: ['attrs', 'content'],
  heading: ['attrs', 'content'],
  blockquote: ['attrs', 'content'],
  bulletList: ['attrs', 'content'],
  orderedList: ['attrs', 'content'],
  listItem: ['attrs', 'content'],
  image: ['attrs'],
  table: ['attrs', 'content'],
  tableRow: ['attrs', 'content'],
  tableCell: ['attrs', 'content'],
  tableHeader: ['attrs', 'content'],
  codeBlock: ['attrs', 'content'],
  mermaid: ['attrs'],
  componentEmbed: ['attrs'],
  capsuleEmbed: ['attrs'],
  text: ['marks', 'text'],
};

const MARK_ALLOWED_TOP_LEVEL_FIELDS: Readonly<Record<string, readonly (typeof NODE_TOP_LEVEL_FIELDS)[number][]>> = {
  bold: [],
  italic: [],
  strike: [],
  code: [],
  link: ['attrs'],
};

const INVALID_FIELD_VALUES: Readonly<Record<(typeof NODE_TOP_LEVEL_FIELDS)[number], readonly unknown[]>> = {
  attrs: [{}, null],
  content: [[], null],
  marks: [[], null],
  text: ['', null],
};

function canonicalSchemaJson(): JSONContent {
  const projected = projectTiptapDocument(
    {},
    { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
    CONFIG,
  );
  if (projected.status !== 'projected') throw new Error('expected projected document');
  const schemaResult = createXnlRichDocumentTiptapSchema();
  if (schemaResult.status !== 'ready') throw new Error('expected schema');
  return schemaResult.schema.nodeFromJSON(projected.document).toJSON();
}

function findNode(root: JSONContent, type: string): JSONContent | undefined {
  if (root.type === type) return root;
  for (const child of root.content ?? []) {
    const found = findNode(child, type);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findMark(root: JSONContent, type: string): NonNullable<JSONContent['marks']>[number] | undefined {
  const mark = root.marks?.find((candidate) => candidate.type === type);
  if (mark !== undefined) return mark;
  for (const child of root.content ?? []) {
    const found = findMark(child, type);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('RichDocument Tiptap model projection', () => {
  it('projects and parses the complete canonical RichDocument without HTML', () => {
    const before = JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    const projected = projectTiptapDocument(
      {},
      { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      CONFIG,
    );

    expect(projected.status).toBe('projected');
    if (projected.status !== 'projected') throw new Error('expected projected document');
    expect(projected.document.type).toBe('doc');
    expect(projected.document.attrs).toEqual({ nodeId: 'document.canonical' });
    expect(projected.document.content?.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'blockquote',
      'bulletList',
      'orderedList',
      'image',
      'table',
      'codeBlock',
      'mermaid',
      'componentEmbed',
      'capsuleEmbed',
    ]);
    expect(projected.document.content?.[0]?.content?.[0]?.marks).toEqual([
      {
        type: 'link',
        attrs: {
          href: 'https://example.test/rich-document',
          title: 'RichDocument contract',
        },
      },
      { type: 'bold' },
      { type: 'code' },
      { type: 'italic' },
      { type: 'strike' },
    ]);

    const parsed = parseTiptapDocument({}, { document: projected.document }, CONFIG);
    expect(parsed).toEqual({
      status: 'parsed',
      document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
    });
    expect(JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE)).toBe(before);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('registers a real headless Tiptap schema for every canonical node and mark', () => {
    const schemaResult = createXnlRichDocumentTiptapSchema();
    expect(schemaResult.status).toBe('ready');
    if (schemaResult.status !== 'ready') throw new Error('expected schema');

    const projected = projectTiptapDocument(
      {},
      { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      CONFIG,
    );
    if (projected.status !== 'projected') throw new Error('expected projected document');
    const node = schemaResult.schema.nodeFromJSON(projected.document);
    expect(() => node.check()).not.toThrow();

    expect(node.type.name).toBe('doc');
    expect(node.childCount).toBe(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children.length);
    expect(Object.keys(schemaResult.schema.nodes)).toEqual(expect.arrayContaining([
      'doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
      'image', 'table', 'tableRow', 'tableCell', 'tableHeader', 'codeBlock', 'mermaid',
      'componentEmbed', 'capsuleEmbed', 'text',
    ]));
    expect(Object.keys(schemaResult.schema.marks)).toEqual(expect.arrayContaining([
      'bold', 'italic', 'strike', 'code', 'link',
    ]));

    const parsedSchemaJson = parseTiptapDocument({}, { document: node.toJSON() }, CONFIG);
    expect(parsedSchemaJson).toEqual({
      status: 'parsed',
      document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
    });
  });

  it('preserves persistent nodeId attrs but does not reinterpret identity as payload', () => {
    const projected = projectTiptapDocument(
      {},
      { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      CONFIG,
    );
    if (projected.status !== 'projected') throw new Error('expected projected document');

    const identities: string[] = [];
    const visit = (node: typeof projected.document): void => {
      if (typeof node.attrs?.nodeId === 'string') identities.push(node.attrs.nodeId);
      node.content?.forEach(visit);
    };
    visit(projected.document);

    expect(identities).toContain('document.canonical');
    expect(identities).toContain('tablecell.capability.value');
    expect(new Set(identities).size).toBe(identities.length);
    expect(projected.identity).toEqual({
      field: 'nodeId',
      source: 'domain-#id',
      ordinaryPayloadUpdate: false,
    });
  });

  it.each([
    {
      name: 'unknown schema',
      run: () => projectTiptapDocument(
        {},
        { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
        { ...CONFIG, schemaId: 'unknown/schema' },
      ),
      code: 'UNSUPPORTED_TIPTAP_SCHEMA',
    },
    {
      name: 'unknown extension',
      run: () => projectTiptapDocument(
        {},
        { document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
        { ...CONFIG, extensionIds: [...CONFIG.extensionIds, 'unknown-extension'] },
      ),
      code: 'UNSUPPORTED_TIPTAP_EXTENSION',
    },
    {
      name: 'unknown node',
      run: () => parseTiptapDocument(
        {},
        { document: { type: 'doc', attrs: { nodeId: 'document.unknown' }, content: [{ type: 'rainbow' }] } },
        CONFIG,
      ),
      code: 'UNSUPPORTED_TIPTAP_NODE',
    },
    {
      name: 'unknown mark',
      run: () => parseTiptapDocument(
        {},
        {
          document: {
            type: 'doc',
            attrs: { nodeId: 'document.unknown-mark' },
            content: [{
              type: 'paragraph',
              attrs: { nodeId: 'paragraph.unknown-mark' },
              content: [{ type: 'text', text: 'x', marks: [{ type: 'rainbow' }] }],
            }],
          },
        },
        CONFIG,
      ),
      code: 'UNSUPPORTED_TIPTAP_MARK',
    },
  ])('fails closed for $name with serializable diagnostics', ({ run, code }) => {
    const result = run();
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') throw new Error('expected rejection');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code });
    expect(() => JSON.stringify(result.diagnostics)).not.toThrow();
  });

  it('rejects unsupported attributes and unsafe records instead of silently losing them', () => {
    const unsupported = parseTiptapDocument(
      {},
      {
        document: {
          type: 'doc',
          attrs: { nodeId: 'document.unsupported', html: '<p>not a fallback</p>' },
          content: [],
        },
      },
      CONFIG,
    );
    expect(unsupported).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'LOSSY_TIPTAP_VALUE' })],
    });

    let getterCalls = 0;
    const unsafe = {};
    Object.defineProperty(unsafe, 'type', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'doc';
      },
    });
    const unsafeResult = parseTiptapDocument({}, { document: unsafe }, CONFIG);
    expect(unsafeResult).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'LOSSY_TIPTAP_VALUE' })],
    });
    expect(getterCalls).toBe(0);
  });

  it.each(Object.entries(NODE_ALLOWED_TOP_LEVEL_FIELDS).flatMap(([type, allowed]) => (
    NODE_TOP_LEVEL_FIELDS.flatMap((field) => (
      allowed.includes(field)
        ? []
        : INVALID_FIELD_VALUES[field].map((value, valueIndex) => ({ type, field, value, valueIndex }))
    ))
  )))('rejects $type $field variant $valueIndex when the node kind cannot represent it', ({
    type,
    field,
    value,
  }) => {
    const document = canonicalSchemaJson();
    const node = findNode(document, type);
    if (node === undefined) throw new Error(`missing canonical ${type} node`);
    Object.defineProperty(node, field, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const result = parseTiptapDocument({}, { document }, CONFIG);
    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'LOSSY_TIPTAP_VALUE' }),
      ]),
    });
  });

  it.each(Object.entries(MARK_ALLOWED_TOP_LEVEL_FIELDS).flatMap(([type, allowed]) => (
    NODE_TOP_LEVEL_FIELDS.flatMap((field) => (
      allowed.includes(field)
        ? []
        : INVALID_FIELD_VALUES[field].map((value, valueIndex) => ({ type, field, value, valueIndex }))
    ))
  )))('rejects $type mark $field variant $valueIndex when the mark kind cannot represent it', ({
    type,
    field,
    value,
  }) => {
    const document = canonicalSchemaJson();
    const mark = findMark(document, type);
    if (mark === undefined) throw new Error(`missing canonical ${type} mark`);
    Object.defineProperty(mark, field, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const result = parseTiptapDocument({}, { document }, CONFIG);
    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'LOSSY_TIPTAP_VALUE' }),
      ]),
    });
  });

  it.each([
    {
      name: 'empty blockquote',
      child: { kind: 'blockquote', nodeId: 'blockquote.empty', children: [] },
    },
    {
      name: 'empty bullet list',
      child: { kind: 'bullet-list', nodeId: 'list.empty', children: [] },
    },
    {
      name: 'empty ordered list',
      child: { kind: 'ordered-list', nodeId: 'ordered-list.empty', children: [] },
    },
    {
      name: 'empty table',
      child: { kind: 'table', nodeId: 'table.empty', children: [] },
    },
    {
      name: 'table cell without block content',
      child: {
        kind: 'table',
        nodeId: 'table.empty-cell',
        children: [{
          kind: 'table-row',
          nodeId: 'table-row.empty-cell',
          children: [{
            kind: 'table-cell',
            nodeId: 'table-cell.empty',
            children: [],
          }],
        }],
      },
    },
  ] as const)('rejects a neutral-model-valid but schema-invalid $name projection', ({ child }) => {
    const document = {
      kind: 'document',
      nodeId: 'document.schema-invalid',
      children: [child],
    } as unknown as XnlRichDocument;

    const result = projectTiptapDocument({}, { document }, CONFIG);
    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_TIPTAP_DOCUMENT' }),
      ]),
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('rejects exact-field raw JSON that the registered schema does not accept', () => {
    const result = parseTiptapDocument(
      {},
      {
        document: {
          type: 'doc',
          attrs: { nodeId: 'document.schema-invalid-input' },
          content: [{
            type: 'blockquote',
            attrs: { nodeId: 'blockquote.empty-input' },
            content: [],
          }],
        },
      },
      CONFIG,
    );

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_TIPTAP_DOCUMENT' }),
      ]),
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
