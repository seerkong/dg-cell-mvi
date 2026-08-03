// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import * as adapterPackageRoot from 'dg-cell-mvi-halfcode-tiptap-vue';

const TABLE_COMMAND_NAMES = [
  'addColumnAfter', 'addColumnBefore', 'addRowAfter', 'addRowBefore',
  'deleteColumn', 'deleteRow', 'deleteTable', 'fixTables',
  'goToNextCell', 'goToPreviousCell', 'insertTable', 'mergeCells',
  'setCellAttribute', 'setCellSelection', 'splitCell', 'toggleHeaderCell',
  'toggleHeaderColumn', 'toggleHeaderRow',
] as const;
const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const CONFIG = {
  schemaId: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: adapterPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  planNodeId: 'xnlp:node:document.browser-authoring-contract',
} as const;

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
});

function createPackageRootEditor(): Editor {
  const editor = new Editor({
    extensions: adapterPackageRoot.createXnlRichDocumentTiptapExtensions(),
    content: {
      type: 'doc',
      attrs: { nodeId: 'document.browser-authoring-contract' },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: 'paragraph.browser-authoring-contract' },
      }],
    },
  });
  editors.push(editor);
  return editor;
}

describe('T1.2 browser authoring public contract red baseline', () => {
  it('provides all 18 official table commands in a real Editor', () => {
    const editor = createPackageRootEditor();
    const missing = TABLE_COMMAND_NAMES.filter((name) => (
      typeof (editor.commands as unknown as Record<string, unknown>)[name] !== 'function'
    ));
    expect(missing).toEqual([]);
  });

  it('provides the table NodeView in a real Editor', () => {
    const editor = createPackageRootEditor();
    expect(editor.extensionManager.nodeViews.table).toBeTypeOf('function');
  });

  it('exports the Mermaid runtime-bound NodeView host factory from the package root', () => {
    expect(
      (adapterPackageRoot as Record<string, unknown>)
        .createXnlRichDocumentMermaidNodeViewHost,
    ).toBeTypeOf('function');
  });

  it('normalizes a Mermaid source attribute transaction as a semantic Interaction', () => {
    const schemaResult = adapterPackageRoot.createXnlRichDocumentTiptapSchema();
    expect(schemaResult.status).toBe('ready');
    if (schemaResult.status !== 'ready') throw new Error(schemaResult.diagnostics[0].message);
    const state = EditorState.create({
      schema: schemaResult.schema,
      doc: schemaResult.schema.nodeFromJSON({
        type: 'doc',
        attrs: { nodeId: 'document.browser-authoring-contract' },
        content: [{
          type: 'mermaid',
          attrs: {
            nodeId: 'mermaid.browser-authoring-contract',
            source: 'graph TD; A-->B',
          },
        }],
      }),
    });
    const transaction = state.tr.setNodeMarkup(0, undefined, {
      ...state.doc.firstChild?.attrs,
      source: 'graph LR; A-->B',
    });
    const result = adapterPackageRoot.normalizeTiptapTransaction(
      EMPTY,
      { transaction },
      CONFIG,
    );
    expect(result).toMatchObject({
      status: 'normalized',
      intent: {
        kind: 'interaction',
        proposal: {
          type: 'xnl.rich-document.edit',
          payload: {
            edits: [{
              kind: 'mermaid-source',
              nodeId: 'mermaid.browser-authoring-contract',
              before: 'graph TD; A-->B',
              after: 'graph LR; A-->B',
            }],
          },
        },
      },
    });
  });
});
