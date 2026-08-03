// @vitest-environment jsdom

import { Editor, type JSONContent } from '@tiptap/core';
import type {
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlRichDocumentTiptapExtensions,
  createXnlRichDocumentTiptapSchema,
  parseTiptapDocument,
  projectTiptapDocument,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from 'dg-cell-mvi-halfcode-tiptap-vue';
import { describe, expect, it } from 'vitest';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const PROJECTION_CONFIG = Object.freeze({
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
});
const nodeId = (value: string): XnlRichDocumentDomainNodeId => (
  value as XnlRichDocumentDomainNodeId
);
const BULLET_LIST_SEMANTIC_DOCUMENT: XnlRichDocument = {
  kind: 'document',
  nodeId: nodeId('document.list-browser.bullet'),
  children: [{
    kind: 'bullet-list',
    nodeId: nodeId('list.bullet'),
    children: [
      {
        kind: 'list-item',
        nodeId: nodeId('listitem.bullet.first'),
        children: [{
          kind: 'paragraph',
          nodeId: nodeId('paragraph.bullet.first'),
          content: [{ kind: 'text', text: 'Canonical bullet item one' }],
        }],
      },
      {
        kind: 'list-item',
        nodeId: nodeId('listitem.bullet.second'),
        children: [{
          kind: 'paragraph',
          nodeId: nodeId('paragraph.bullet.second'),
          content: [{ kind: 'text', text: 'Canonical bullet item two' }],
        }],
      },
    ],
  }],
};

function project(document: XnlRichDocument): JSONContent {
  const result = projectTiptapDocument(EMPTY, { document }, PROJECTION_CONFIG);
  if (result.status !== 'projected') throw new Error(result.diagnostics[0].message);
  return result.document;
}

const BULLET_LIST_DOCUMENT = project(BULLET_LIST_SEMANTIC_DOCUMENT);

const BLOCKQUOTE_FIRST_ORDERED_LIST_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.list-browser.ordered' },
  content: [{
    type: 'orderedList',
    attrs: { nodeId: 'list.ordered', start: 3 },
    content: [{
      type: 'listItem',
      attrs: { nodeId: 'listitem.ordered.third' },
      content: [{
        type: 'blockquote',
        attrs: { nodeId: 'blockquote.ordered.third' },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.ordered.third' },
          content: [{ type: 'text', text: 'Canonical blockquote-first item' }],
        }],
      }],
    }],
  }],
};

const REAL_EDITOR_CASES = [
  {
    name: 'canonical bullet list',
    document: BULLET_LIST_DOCUMENT,
    listSelector: 'ul',
    items: [
      { nodeId: 'listitem.bullet.first', text: 'Canonical bullet item one' },
      { nodeId: 'listitem.bullet.second', text: 'Canonical bullet item two' },
    ],
    firstChildSelector: 'p',
    semanticDocument: BULLET_LIST_SEMANTIC_DOCUMENT,
  },
  {
    name: 'canonical ordered list with a blockquote-first item',
    document: BLOCKQUOTE_FIRST_ORDERED_LIST_DOCUMENT,
    listSelector: 'ol[start="3"]',
    items: [{
      nodeId: 'listitem.ordered.third',
      text: 'Canonical blockquote-first item',
    }],
    firstChildSelector: 'blockquote',
    semanticDocument: undefined,
  },
] as const;

function nodeTypeNames(root: JSONContent): readonly string[] {
  const names = new Set<string>();
  const visit = (node: JSONContent) => {
    if (node.type !== undefined && node.type !== 'doc' && node.type !== 'text') names.add(node.type);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return [...names];
}

describe('T1.1 canonical list DOM serialization red baseline', () => {
  it('round-trips two-item list order and identity through the canonical semantic oracle', () => {
    const projected = project(BULLET_LIST_SEMANTIC_DOCUMENT);
    const projectedItems = projected.content?.[0]?.content ?? [];
    expect(projectedItems.map((item) => ({
      nodeId: item.attrs?.nodeId,
      text: item.content?.[0]?.content?.[0]?.text,
    }))).toEqual([
      { nodeId: 'listitem.bullet.first', text: 'Canonical bullet item one' },
      { nodeId: 'listitem.bullet.second', text: 'Canonical bullet item two' },
    ]);

    const parsed = parseTiptapDocument(EMPTY, { document: projected }, PROJECTION_CONFIG);
    expect(parsed).toEqual({
      status: 'parsed',
      document: BULLET_LIST_SEMANTIC_DOCUMENT,
    });
  });

  it('characterizes listItem as block+ and accepts paragraph-first and blockquote-first content', () => {
    const result = createXnlRichDocumentTiptapSchema();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(result.diagnostics[0].message);

    expect(result.schema.nodes.listItem.spec.content).toBe('block+');
    for (const fixture of REAL_EDITOR_CASES) {
      const documentNode = result.schema.nodeFromJSON(fixture.document);
      expect(() => documentNode.check(), fixture.name).not.toThrow();

      const listItem = documentNode.firstChild?.firstChild;
      expect(listItem?.type.name).toBe('listItem');
      expect(listItem?.firstChild?.type.name).toBe(
        fixture.firstChildSelector === 'p' ? 'paragraph' : 'blockquote',
      );
    }
  });

  it.each(REAL_EDITOR_CASES)('renders $name through package-root extensions', (fixture) => {
    const target = document.body.appendChild(document.createElement('div'));
    let editor: Editor | undefined;

    try {
      const schemaResult = createXnlRichDocumentTiptapSchema();
      expect(schemaResult.status).toBe('ready');
      if (schemaResult.status !== 'ready') throw new Error(schemaResult.diagnostics[0].message);
      const missingSerializers = nodeTypeNames(fixture.document).filter((name) => (
        typeof schemaResult.schema.nodes[name]?.spec.toDOM !== 'function'
      ));
      if (missingSerializers.length > 0) expect(missingSerializers).toEqual(['listItem']);

      editor = new Editor({
        element: target,
        extensions: createXnlRichDocumentTiptapExtensions(),
        content: fixture.document,
      });

      const list = target.querySelector(fixture.listSelector);
      const stateList = editor.state.doc.firstChild;
      const stateItems = stateList === null
        ? []
        : Array.from({ length: stateList.childCount }, (_, index) => {
            const item = stateList.child(index);
            return { nodeId: item.attrs.nodeId, text: item.textContent };
          });
      const renderedItems = Array.from(list?.children ?? [])
        .filter((element) => element.matches('li'))
        .map((element) => ({
          nodeId: element.getAttribute('nodeid'),
          text: element.textContent,
        }));
      expect(list).not.toBeNull();
      expect(stateItems).toEqual(fixture.items);
      expect(renderedItems).toEqual(fixture.items);
      expect(list?.firstElementChild?.firstElementChild?.matches(fixture.firstChildSelector))
        .toBe(true);

      if (fixture.semanticDocument !== undefined) {
        const parsed = parseTiptapDocument(
          EMPTY,
          { document: editor.getJSON() },
          PROJECTION_CONFIG,
        );
        expect(parsed).toEqual({
          status: 'parsed',
          document: fixture.semanticDocument,
        });
      }
    } finally {
      editor?.destroy();
      target.remove();
    }
  });
});
