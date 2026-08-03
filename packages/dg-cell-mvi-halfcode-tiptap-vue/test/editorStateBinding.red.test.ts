// @vitest-environment jsdom

import { Editor, Extension, type Extensions, type JSONContent } from '@tiptap/core';
import { history } from '@tiptap/pm/history';
import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { createDocumentInstanceRegistry, type HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import * as tiptapPackageRoot from 'dg-cell-mvi-halfcode-tiptap-vue';
import type {
  XnlRichDocumentTiptapDraftEditorStateBindingProcessor,
  XnlRichDocumentTiptapDraftResult,
  XnlRichDocumentTiptapInteractionIntent,
  XnlRichDocumentMermaidNodeViewRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BINDING_NAME = 'bindXnlRichDocumentTiptapDraftToEditorState';
const bindingValue: unknown = Reflect.get(tiptapPackageRoot, BINDING_NAME);
const bindDraftToEditorState = bindingValue as XnlRichDocumentTiptapDraftEditorStateBindingProcessor;
const describeWithBinding = typeof bindingValue === 'function' ? describe : describe.skip;
const EMPTY_INPUT = Object.freeze({ targets: [], occurrences: [] });
const BROWSER_CONFIG = Object.freeze({ theme: 'default' as const });
const CONFIG = {
  schemaId: tiptapPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: tiptapPackageRoot.XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  planNodeId: 'xnlp:node:document.editor-state-binding',
} as const;
const DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.editor-state-binding' },
  content: [{
    type: 'paragraph',
    attrs: { nodeId: 'paragraph.editor-state-binding' },
    content: [{ type: 'text', text: 'Before' }],
  }],
};
const COMBINED_DOCUMENT: JSONContent = {
  type: 'doc',
  attrs: { nodeId: 'document.combined-binding' },
  content: [
    {
      type: 'table',
      attrs: { nodeId: 'table.combined-binding' },
      content: [{
        type: 'tableRow',
        attrs: { nodeId: 'table-row.combined-binding' },
        content: [{
          type: 'tableCell',
          attrs: {
            nodeId: 'table-cell.combined-binding',
            colspan: 1,
            rowspan: 1,
            colwidth: null,
            align: null,
          },
          content: [{
            type: 'paragraph',
            attrs: { nodeId: 'paragraph.combined-binding' },
            content: [{ type: 'text', text: 'cell' }],
          }],
        }],
      }],
    },
    {
      type: 'mermaid',
      attrs: { nodeId: 'mermaid.combined-binding', source: 'graph TD; A-->B' },
    },
    {
      type: 'componentEmbed',
      attrs: { nodeId: 'component.combined-binding', ref: 'component://missing', version: null, input: {} },
    },
    {
      type: 'capsuleEmbed',
      attrs: { nodeId: 'capsule.combined-binding', ref: 'capsule://missing', version: null, input: {} },
    },
  ],
};

const editors: Editor[] = [];
const browserHostDisposers: Array<() => void> = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  for (const dispose of browserHostDisposers.splice(0)) dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createEditor(
  extensions = tiptapPackageRoot.createXnlRichDocumentTiptapExtensions(),
  content: JSONContent = DOCUMENT,
): Editor {
  const editor = new Editor({
    element: document.body.appendChild(document.createElement('div')),
    extensions,
    content: structuredClone(content),
  });
  editors.push(editor);
  return editor;
}

interface LifecycleProbeState {
  readonly generation: number;
  readonly transactionCount: number;
}

let lifecycleProbeSequence = 0;

function createHistoryProbeEditor(
  extensions: Extensions = tiptapPackageRoot.createXnlRichDocumentTiptapExtensions(),
) {
  const key = new PluginKey<LifecycleProbeState>(`boundDraftLifecycleProbe${++lifecycleProbeSequence}`);
  let generation = 0;
  const probe = Extension.create({
    name: `boundDraftLifecycleProbe${lifecycleProbeSequence}`,
    addProseMirrorPlugins() {
      return [
        history(),
        new Plugin<LifecycleProbeState>({
          key,
          state: {
            init: () => ({ generation: ++generation, transactionCount: 0 }),
            apply: (_transaction, value) => ({
              generation: value.generation,
              transactionCount: value.transactionCount + 1,
            }),
          },
        }),
      ];
    },
  });
  return { editor: createEditor([...extensions, probe]), key };
}

function textPosition(state: EditorState, text: string): number {
  let found = -1;
  state.doc.descendants((node, position) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = position;
  });
  if (found < 0) throw new Error(`Missing text node ${text}.`);
  return found;
}

function stateOf(result: XnlRichDocumentTiptapDraftResult) {
  if (result.state === undefined) throw new Error(`Expected draft state for ${result.outcome.status}.`);
  return result.state;
}

function emittedRuntime(intents: XnlRichDocumentTiptapInteractionIntent[]) {
  return {
    emitInteraction: (
      _runtime: unknown,
      input: Readonly<{ intent: XnlRichDocumentTiptapInteractionIntent }>,
      _config: Readonly<Record<string, never>>,
    ) => {
      intents.push(input.intent);
      return { status: 'emitted' as const };
    },
  };
}

function halfcodeRuntime() {
  const appRuntime: HalfcodeAppRuntime = {
    bundle: {} as never,
    plans: {
      renderPlans: [],
      scopeRuntimePlans: [],
      messageDispatchPlan: [],
      routePlan: { routes: [] },
      documentPlans: [],
      flowPlans: [],
      diagnostics: [],
    } as never,
    assemblies: {},
    flows: {} as never,
    resolveScope: () => undefined,
    resolveFlow: () => undefined,
    resolveConfig: () => ({}),
    dispatchCommand: async () => ({ diagnostics: [] }),
    dispose: vi.fn(),
  };
  return {
    presenterFacet: {} as never,
    editIntentPort: () => ({ status: 'emitted' as const }),
    documentInstances: createDocumentInstanceRegistry(),
    halfcodeRuntime: appRuntime,
  };
}

function mermaidRuntime(): XnlRichDocumentMermaidNodeViewRuntime<object, object> {
  return {
    renderer: {
      runtime: Object.freeze({}),
      effect: async (_runtime, input) => ({
        status: 'rendered',
        requestId: input.requestId,
        svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      }),
    },
    diagnostics: {
      runtime: Object.freeze({}),
      effect: () => undefined,
    },
  };
}

describe('T1.2 package-root real Editor binding red baseline', () => {
  it('characterizes the detached schema identity failure without publishing an Interaction', () => {
    const editor = createEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const detached = tiptapPackageRoot.createXnlRichDocumentTiptapDraft(
      emittedRuntime(intents),
      { document: structuredClone(DOCUMENT), acceptedObservation: 'live:1' },
      CONFIG,
    );
    const detachedState = stateOf(detached);
    const transaction = editor.state.tr.insertText('Edited ', 1);

    expect(transaction.before.toJSON()).toEqual(detachedState.editorState.doc.toJSON());
    expect(transaction.before.type).not.toBe(detachedState.editorState.doc.type);
    expect(transaction.before.eq(detachedState.editorState.doc)).toBe(false);

    const applied = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      emittedRuntime(intents),
      { state: detachedState, transaction },
      CONFIG,
    );
    expect(applied.outcome).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({
        code: 'INVALID_TIPTAP_DRAFT',
        message: 'Transaction does not apply to the current local state.',
      })],
    });
    expect(intents).toEqual([]);
  });

  it('requires the EditorState binding runtime value from the package root', () => {
    expect(
      bindingValue,
      `Missing package-root runtime value: ${BINDING_NAME}`,
    ).toBeTypeOf('function');
  });
});

describeWithBinding('T2.2 bound real Editor lifecycle contract', () => {
  it('reports preserved ready selection for a real EditorState with a non-start selection', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(3);
    expect(editor.state.selection.from).toBe(3);

    const bound = bindDraftToEditorState(
      {},
      { editorState: editor.state, acceptedObservation: 'live:1' },
      CONFIG,
    );

    expect(bound.outcome).toMatchObject({
      status: 'ready',
      localDraft: false,
      pendingAcceptance: false,
      selection: 'preserved',
    });
    const boundState = stateOf(bound);
    expect(boundState.editorState).toBe(editor.state);
    expect(boundState.editorState.selection.from).toBe(3);
  });

  it('publishes exactly one revision-free Interaction for a real document transaction', () => {
    const editor = createEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const bound = bindDraftToEditorState(
      runtime,
      { editorState: editor.state, acceptedObservation: 'live:1' },
      CONFIG,
    );
    const initial = stateOf(bound);
    expect(initial.editorState).toBe(editor.state);
    expect(initial.acceptedDocument).toBe(editor.state.doc);

    const applied = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      { state: initial, transaction: editor.state.tr.insertText('Edited ', 1) },
      CONFIG,
    );
    expect(applied.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      pendingAcceptance: true,
    });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ kind: 'interaction' });
    expect(JSON.stringify(intents[0])).not.toMatch(
      /acceptedObservation|revision|submit|writer|translator|session|allocator|valueHost|vfs|vcs/i,
    );
  });

  it('applies a real selection-only transaction silently', () => {
    const editor = createEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const initial = stateOf(bindDraftToEditorState(runtime, { editorState: editor.state }, CONFIG));
    const transaction = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2));

    const applied = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      { state: initial, transaction },
      CONFIG,
    );
    expect(applied.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'selection-only',
    });
    expect(stateOf(applied).editorState.selection.from).toBe(2);
    expect(intents).toEqual([]);
  });

  it('buffers real composition transactions and publishes once at settlement', () => {
    const editor = createEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const initial = stateOf(bindDraftToEditorState(runtime, { editorState: editor.state }, CONFIG));
    const first = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      { state: initial, transaction: initial.editorState.tr.insertText('\u4f60', 1), composition: 'intermediate' },
      CONFIG,
    );
    const firstState = stateOf(first);
    const second = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      {
        state: firstState,
        transaction: firstState.editorState.tr.insertText('\u597d', 2),
        composition: 'intermediate',
      },
      CONFIG,
    );

    expect(first.outcome.status).toBe('composition-buffered');
    expect(second.outcome.status).toBe('composition-buffered');
    expect(intents).toEqual([]);

    const settled = tiptapPackageRoot.settleXnlRichDocumentTiptapComposition(
      runtime,
      { state: stateOf(second) },
      CONFIG,
    );
    expect(settled.outcome).toMatchObject({
      status: 'composition-settled',
      publication: 'published',
      pendingAcceptance: true,
    });
    expect(intents).toHaveLength(1);

    const settledAgain = tiptapPackageRoot.settleXnlRichDocumentTiptapComposition(
      runtime,
      { state: stateOf(settled) },
      CONFIG,
    );
    expect(settledAgain.outcome).toMatchObject({
      status: 'composition-settled',
      publication: 'silent',
      reason: 'no-document-change',
    });
    expect(stateOf(settledAgain)).toBe(stateOf(settled));
    expect(intents).toHaveLength(1);
  });

  it('preserves matching state, selection, plugins, and history lineage while clearing pending', () => {
    const { editor, key } = createHistoryProbeEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const initial = stateOf(bindDraftToEditorState(
      runtime,
      { editorState: editor.state, acceptedObservation: 'live:1' },
      CONFIG,
    ));
    const selected = stateOf(tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      { state: initial, transaction: initial.editorState.tr.setSelection(TextSelection.create(initial.editorState.doc, 3)) },
      CONFIG,
    ));
    const edited = stateOf(tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      { state: selected, transaction: selected.editorState.tr.insertText('!') },
      CONFIG,
    ));
    const selection = edited.editorState.selection;
    const pluginState = key.getState(edited.editorState);

    const accepted = tiptapPackageRoot.reprojectXnlRichDocumentTiptapAccepted(
      {},
      {
        state: edited,
        document: edited.editorState.doc.toJSON(),
        acceptedObservation: 'live:2',
      },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(accepted.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'accepted-local-draft',
      selection: 'preserved',
      localDraft: false,
      pendingAcceptance: false,
    });
    const acceptedState = stateOf(accepted);
    expect(acceptedState.editorState).toBe(edited.editorState);
    expect(acceptedState.editorState.selection).toBe(selection);
    expect(acceptedState.editorState.plugins).toBe(edited.editorState.plugins);
    expect(key.getState(acceptedState.editorState)).toBe(pluginState);

    const undone = tiptapPackageRoot.undoXnlRichDocumentTiptapDraft(
      runtime,
      { state: acceptedState },
      CONFIG,
    );
    expect(undone.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      pendingAcceptance: true,
    });
    expect(intents).toHaveLength(2);
  });

  it('obeys conflict or replace while reusing bound schema/plugins and resetting stale history', () => {
    const { editor, key } = createHistoryProbeEditor();
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const initial = stateOf(bindDraftToEditorState(runtime, { editorState: editor.state }, CONFIG));
    const edited = stateOf(tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial.editorState, 'Before') + 6),
      },
      CONFIG,
    ));
    const external = structuredClone(DOCUMENT);
    external.content![0]!.content![0]!.text = 'External';

    const conflicted = tiptapPackageRoot.reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: edited, document: external, acceptedObservation: 'live:2' },
      { ...CONFIG, staleDraftPolicy: 'conflict' },
    );
    expect(conflicted.outcome).toMatchObject({
      status: 'conflict',
      policy: 'conflict',
      localDraftPreserved: true,
    });
    expect(stateOf(conflicted)).toBe(edited);

    const replaced = tiptapPackageRoot.reprojectXnlRichDocumentTiptapAccepted(
      {},
      { state: edited, document: external, acceptedObservation: 'live:2' },
      { ...CONFIG, staleDraftPolicy: 'replace' },
    );
    expect(replaced.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'replaced-stale-draft',
      localDraft: false,
      pendingAcceptance: false,
    });
    const replacedState = stateOf(replaced);
    expect(replacedState.editorState.schema).toBe(edited.editorState.schema);
    expect(replacedState.editorState.plugins).toHaveLength(edited.editorState.plugins.length);
    expect(replacedState.editorState.plugins.every(
      (plugin, index) => plugin === edited.editorState.plugins[index],
    )).toBe(true);
    expect(key.getState(replacedState.editorState)).toMatchObject({
      generation: expect.any(Number),
      transactionCount: 0,
    });
    expect(key.getState(replacedState.editorState)).not.toBe(key.getState(edited.editorState));

    const undoAfterReplace = tiptapPackageRoot.undoXnlRichDocumentTiptapDraft(
      runtime,
      { state: replacedState },
      CONFIG,
    );
    expect(undoAfterReplace.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'history-empty',
    });
    expect(stateOf(undoAfterReplace).editorState.doc.textContent).toBe('External');
    expect(intents).toHaveLength(1);
  });

  it('keeps real undo and redo local and proposal-producing without mutating the bound Editor', () => {
    const { editor } = createHistoryProbeEditor();
    const editorState = editor.state;
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const initial = stateOf(bindDraftToEditorState(runtime, { editorState }, CONFIG));
    const edited = stateOf(tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      {
        state: initial,
        transaction: initial.editorState.tr.insertText('!', textPosition(initial.editorState, 'Before') + 6),
      },
      CONFIG,
    ));
    const undone = tiptapPackageRoot.undoXnlRichDocumentTiptapDraft(runtime, { state: edited }, CONFIG);
    const redone = tiptapPackageRoot.redoXnlRichDocumentTiptapDraft(
      runtime,
      { state: stateOf(undone) },
      CONFIG,
    );

    expect(undone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    expect(redone.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    expect(intents).toHaveLength(3);
    expect(intents.map((intent) => intent.proposal.payload.edits)).toEqual([
      [expect.objectContaining({ kind: 'text', before: 'Before', after: 'Before!' })],
      [expect.objectContaining({ kind: 'text', before: 'Before!', after: 'Before' })],
      [expect.objectContaining({ kind: 'text', before: 'Before', after: 'Before!' })],
    ]);
    expect(JSON.stringify(intents)).not.toMatch(/revision|domain|writer|submit|persistence/i);
    expect(editor.state).toBe(editorState);
    expect(editor.state.doc.textContent).toBe('Before');
  });

  it('fails malformed, accessor-backed, noncanonical, and authority-bearing inputs closed', () => {
    const editor = createEditor();
    const emitInteraction = vi.fn(() => ({ status: 'emitted' as const }));
    const accessor = vi.fn(() => editor.state);
    const accessorInput = Object.defineProperty({}, 'editorState', {
      enumerable: true,
      get: accessor,
    });
    const noncanonicalSchema = new Schema({
      nodes: {
        doc: { content: 'text*' },
        text: {},
      },
    });
    const noncanonicalState = EditorState.create({ schema: noncanonicalSchema });
    const invalidInputs: unknown[] = [
      null,
      { editorState: Object.freeze({ doc: editor.state.doc }) },
      accessorInput,
      { editorState: noncanonicalState },
      { editorState: editor.state, writer: Object.freeze({}) },
    ];

    for (const input of invalidInputs) {
      const result = bindDraftToEditorState({ emitInteraction }, input as never, CONFIG);
      expect(result.outcome).toMatchObject({
        status: 'rejected',
        diagnostics: [expect.objectContaining({ code: 'INVALID_TIPTAP_DRAFT' })],
      });
    }
    expect(accessor).not.toHaveBeenCalled();
    expect(emitInteraction).not.toHaveBeenCalled();
  });

  it('coexists with binding and transactions in the combined table, Mermaid, Component, and Capsule host', () => {
    const browserHost = tiptapPackageRoot.createXnlRichDocumentTiptapBrowserHost(
      { halfcode: halfcodeRuntime(), mermaid: mermaidRuntime() },
      EMPTY_INPUT,
      BROWSER_CONFIG,
    );
    expect(browserHost.status).toBe('ready');
    if (browserHost.status !== 'ready') throw new Error(browserHost.diagnostics[0].message);
    browserHostDisposers.push(browserHost.dispose);

    const editor = createEditor(browserHost.extensions, COMBINED_DOCUMENT);
    const extensionNames = editor.extensionManager.extensions.map(({ name }) => name);
    expect(extensionNames).toEqual(expect.arrayContaining([
      'table',
      'mermaid',
      'componentEmbed',
      'capsuleEmbed',
    ]));
    expect(editor.extensionManager.nodeViews).toEqual(expect.objectContaining({
      table: expect.any(Function),
      mermaid: expect.any(Function),
      componentEmbed: expect.any(Function),
      capsuleEmbed: expect.any(Function),
    }));

    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const runtime = emittedRuntime(intents);
    const bound = bindDraftToEditorState(runtime, { editorState: editor.state }, CONFIG);
    expect(bound.outcome.status).toBe('ready');
    const boundState = stateOf(bound);
    expect(boundState.editorState.schema).toBe(editor.schema);
    expect(boundState.editorState.plugins).toBe(editor.state.plugins);

    const applied = tiptapPackageRoot.applyXnlRichDocumentTiptapDraftTransaction(
      runtime,
      {
        state: boundState,
        transaction: boundState.editorState.tr.insertText(
          '!',
          textPosition(boundState.editorState, 'cell') + 4,
        ),
      },
      CONFIG,
    );
    expect(applied.outcome).toMatchObject({ status: 'applied', publication: 'published' });
    expect(intents).toHaveLength(1);
    const nodeNames = new Set<string>();
    stateOf(applied).editorState.doc.descendants((node) => { nodeNames.add(node.type.name); });
    expect([...nodeNames]).toEqual(expect.arrayContaining([
      'table',
      'mermaid',
      'componentEmbed',
      'capsuleEmbed',
    ]));
  });
});
