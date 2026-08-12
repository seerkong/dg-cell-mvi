// @vitest-environment jsdom

import { createApp, nextTick } from 'vue';
import {
  createDefaultDocumentEditorPresentationCompilerRuntime,
  DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
  DEFAULT_DOCUMENT_EDITOR_PRESENTERS,
  DEFAULT_DOCUMENT_EDITOR_TOOLS,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  DocumentDisplayModeProjection,
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XnlDocumentEditor,
  createXnlDocumentEditor,
  createXnlRichDocumentTiptapExtensions,
  type XnlDocumentEditorInput,
  type XnlDocumentEditorRuntime,
  type XnlRichDocumentTiptapInteractionIntent,
} from '../src';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readXnlDocumentEditorInternalEditor,
  readXnlDocumentEditorInternalState,
} from '../src/documentEditorSession';

const nodeId = (value: string) => value as XnlRichDocumentDomainNodeId;
const documentModel = (text = 'Hello document'): XnlRichDocument => ({
  kind: 'document',
  nodeId: nodeId('document.editor'),
  children: [
    {
      kind: 'paragraph',
      nodeId: nodeId('paragraph.editor'),
      content: [{ kind: 'text', text }],
    },
    {
      kind: 'code-block',
      nodeId: nodeId('code.editor'),
      language: 'typescript',
      text: 'const answer = 42;',
    },
  ],
});

const capabilities = {
  tools: DEFAULT_DOCUMENT_EDITOR_TOOLS.map((entry) => entry.id),
  presenters: DEFAULT_DOCUMENT_EDITOR_PRESENTERS.map((entry) => entry.id),
  conditions: [
    'editor.editable', 'editor.table-active', 'editor.code-active',
    'editor.link-active', 'editor.selection-active',
  ],
  grants: ['editor.table.write'],
};

const input = (text?: string): XnlDocumentEditorInput => ({
  document: documentModel(text),
  acceptedObservation: text === undefined ? 'revision:1' : `revision:${text}`,
  presentation: DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
  capabilities,
});

const displayMode = (effectiveMode: 'view' | 'edit'): DocumentDisplayModeProjection => ({
  valid: true,
  target: { kind: 'document', unitInstanceId: 'document-editor-test' },
  inheritedMode: effectiveMode,
  overlay: 'inherit',
  effectiveMode,
  allowedModes: ['view', 'edit'],
  canSwitch: true,
  diagnostics: [],
});

const codeInput = (): XnlDocumentEditorInput => ({
  ...input(),
  document: {
    kind: 'document',
    nodeId: nodeId('document.code'),
    children: [{
      kind: 'code-block',
      nodeId: nodeId('code.multiline'),
      language: 'typescript',
      text: 'const first = 1;\nconst second = 2;',
    }],
  },
});

const sessions: Array<{ destroy(): void }> = [];
const apps: Array<{ unmount(): void }> = [];

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  sessions.splice(0).forEach((session) => session.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function runtime(
  intents: XnlRichDocumentTiptapInteractionIntent[] = [],
  rendererHost?: XnlDocumentEditorRuntime['rendererHost'],
): XnlDocumentEditorRuntime {
  return {
    authoring: {
      emitInteraction: (_runtime, value) => {
        intents.push(value.intent);
        return { status: 'emitted' };
      },
    },
    presentation: createDefaultDocumentEditorPresentationCompilerRuntime(),
    clipboard: {
      runtime: Object.freeze({}),
      effect: () => ({ status: 'written' }),
    },
    ...(rendererHost === undefined ? {} : { rendererHost }),
  };
}

const config = {
  planNodeId: 'xnlp:document-editor',
  staleDraftPolicy: 'conflict' as const,
  unknownToolPolicy: 'reject' as const,
};

describe('XnlDocumentEditor reusable capsule', () => {
  it('switches display mode in place without rebuilding or publishing authoring interactions', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const editableInput = { ...input(), displayMode: displayMode('edit') };
    const result = createXnlDocumentEditor(runtime(intents), editableInput, config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);
    const editor = readXnlDocumentEditorInternalEditor(result.session)!;
    const state = readXnlDocumentEditorInternalState(result.session);

    editor.view.dispatch(editor.state.tr.insertText('Unaccepted draft ', 1));
    expect(editor.state.doc.textContent).toContain('Unaccepted draft');
    intents.length = 0;

    result.session.update({ ...editableInput, displayMode: displayMode('view') });
    expect(readXnlDocumentEditorInternalEditor(result.session)).toBe(editor);
    expect(editor.isEditable).toBe(false);
    expect(readXnlDocumentEditorInternalState(result.session)?.doc.toJSON()).toEqual(state!.doc.toJSON());
    expect(editor.state.doc.textContent).not.toContain('Unaccepted draft');
    expect(intents).toEqual([]);
    expect(await result.session.commands.execute({ commandId: 'rich-text.command.inline.bold' })).toMatchObject({ status: 'unavailable' });

    result.session.update(editableInput);
    expect(readXnlDocumentEditorInternalEditor(result.session)).toBe(editor);
    expect(editor.isEditable).toBe(true);
    expect(intents).toEqual([]);
  });

  it('owns one hidden Tiptap EditorState lineage and exposes only a restricted command facade', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const result = createXnlDocumentEditor(runtime(intents), input(), config);
    expect(result.status, result.status === 'rejected' ? JSON.stringify(result.diagnostics) : '').toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    const internalEditor = readXnlDocumentEditorInternalEditor(result.session);
    const firstState = readXnlDocumentEditorInternalState(result.session);
    expect('editor' in result.session).toBe(false);
    expect('readEditorState' in result.session).toBe(false);
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.align.center',
    })).toBe(true);

    const outcome = await result.session.commands.execute({
      commandId: 'rich-text.command.align.center',
    });

    expect(outcome, JSON.stringify(result.session.read().diagnostics)).toMatchObject({ status: 'executed' });
    expect(readXnlDocumentEditorInternalState(result.session)).not.toBe(firstState);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.proposal.type).toBe('xnl.rich-document.edit');
  });

  it('reprojects matching host acceptance without replacing the session or exposing revision authority', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const result = createXnlDocumentEditor(runtime(intents), input(), config);
    expect(result.status, result.status === 'rejected' ? JSON.stringify(result.diagnostics) : '').toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);
    const commandFacade = result.session.commands;

    result.session.update(input('Accepted host text'));

    expect(result.session.commands).toBe(commandFacade);
    expect(result.session.read().pendingAcceptance).toBe(false);
    expect(
      readXnlDocumentEditorInternalState(result.session)?.doc.textContent,
      JSON.stringify(result.session.read().diagnostics),
    ).toContain('Accepted host text');
    const internal = readXnlDocumentEditorInternalEditor(result.session);
    expect(internal?.state.doc.textContent).toContain('Accepted host text');

    internal?.view.dispatch(internal.state.tr.insertText('Next ', 1));

    expect(result.session.read().diagnostics).toEqual([]);
    expect(intents).toHaveLength(1);
  });

  it('does not reproject an equivalent accepted fact during host pending-state rerenders', async () => {
    const accepted = input();
    const result = createXnlDocumentEditor(runtime(), accepted, config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);
    const internal = readXnlDocumentEditorInternalEditor(result.session);
    internal?.view.dispatch(internal.state.tr.insertText('Local ', 1));
    const localText = readXnlDocumentEditorInternalState(result.session)?.doc.textContent;

    result.session.update({ ...accepted, document: documentModel() });

    expect(readXnlDocumentEditorInternalState(result.session)?.doc.textContent).toBe(localText);
  });

  it('publishes structural insert commands with provisional identity for host allocation', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const result = createXnlDocumentEditor(runtime(intents), input(), config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    const outcome = await result.session.commands.execute({
      commandId: 'rich-text.command.insert.image',
      options: { src: '/new-image.png' },
    });

    expect(outcome).toEqual({ status: 'executed' });
    expect(result.session.read().diagnostics).toEqual([]);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.proposal.payload.edits).toEqual([
      expect.objectContaining({
        kind: 'insert',
        node: expect.objectContaining({ kind: 'image', src: '/new-image.png' }),
      }),
    ]);

    result.session.update({
      ...input(),
      acceptedObservation: 'revision:2',
      document: {
        ...documentModel(),
        children: [
          {
            kind: 'image',
            nodeId: nodeId('image.allocated'),
            src: '/new-image.png',
          },
          ...documentModel().children,
        ],
      },
    });

    expect(result.session.read().diagnostics).toEqual([]);
    expect(readXnlDocumentEditorInternalEditor(result.session)?.state.doc.firstChild?.attrs.nodeId)
      .toBe('image.allocated');
  });

  it('keeps undo and redo on the same Tiptap transaction lineage', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const result = createXnlDocumentEditor(runtime(intents), input(), config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.undo',
    })).toBe(false);
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.redo',
    })).toBe(false);

    const internal = readXnlDocumentEditorInternalEditor(result.session)!;
    internal.view.dispatch(internal.state.tr.insertText('Changed ', 1));
    expect(internal.state.doc.textContent).toContain('Changed');
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.undo',
    })).toBe(true);
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.redo',
    })).toBe(false);

    expect(await result.session.commands.execute({
      commandId: 'rich-text.command.history.undo',
    })).toEqual({ status: 'executed' });
    expect(internal.state.doc.textContent).not.toContain('Changed');
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.redo',
    })).toBe(true);

    expect(await result.session.commands.execute({
      commandId: 'rich-text.command.history.redo',
    })).toEqual({ status: 'executed' });
    expect(internal.state.doc.textContent).toContain('Changed');
    expect(result.session.commands.canExecute({
      commandId: 'rich-text.command.history.redo',
    })).toBe(false);
    expect(intents).toHaveLength(3);
  });

  it('inserts a self-contained task-list subtree for authority identity allocation', async () => {
    const intents: XnlRichDocumentTiptapInteractionIntent[] = [];
    const result = createXnlDocumentEditor(runtime(intents), input(), config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    expect(await result.session.commands.execute({
      commandId: 'rich-text.command.block.task-list',
    })).toEqual({ status: 'executed' });

    expect(result.session.read().diagnostics).toEqual([]);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.proposal.payload.edits).toEqual([
      expect.objectContaining({
        kind: 'insert',
        node: expect.objectContaining({
          kind: 'task-list',
          children: [expect.objectContaining({ kind: 'task-item', checked: false })],
        }),
      }),
    ]);
  });

  it('mounts, updates and unmounts the Vue surface with Presentation-driven overflow tools', async () => {
    class ResizeObserverStub {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 240 } } as ResizeObserverEntry], this as never);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const host = document.body.appendChild(document.createElement('div'));
    const ready = vi.fn();
    const app = createApp(XnlDocumentEditor, {
      runtime: runtime(),
      input: input(),
      config,
      onReady: ready,
    });
    apps.push(app);
    app.mount(host);
    await nextTick();
    await nextTick();

    expect(ready).toHaveBeenCalledOnce();
    expect(
      host.querySelector('[data-testid="xnl-document-editor-content"]'),
      host.innerHTML,
    ).not.toBeNull();
    const more = host.querySelector<HTMLButtonElement>('[aria-label="More tools"]');
    expect(more).not.toBeNull();
    more?.click();
    await nextTick();
    expect(host.querySelector('[role="group"][aria-label="More document tools"]')).not.toBeNull();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth || host.scrollWidth);
  });

  it('keeps enhanced-code highlighting, line numbers, fold and copy feedback in presenter state', async () => {
    class ResizeObserverStub {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as never);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const clipboard = vi.fn(() => ({ status: 'written' as const }));
    const highlighter = vi.fn((_runtime, value: { source: string }) => ({
      status: 'highlighted' as const,
      tokens: [{ from: 0, to: Math.min(5, value.source.length), className: 'syntax-keyword' }],
    }));
    const editorRuntime: XnlDocumentEditorRuntime = {
      ...runtime(),
      clipboard: { runtime: Object.freeze({}), effect: clipboard },
      highlighter: { runtime: Object.freeze({}), effect: highlighter },
    };
    const host = document.body.appendChild(document.createElement('div'));
    const app = createApp(XnlDocumentEditor, {
      runtime: editorRuntime,
      input: codeInput(),
      config: { ...config, codeTheme: 'paper' },
    });
    apps.push(app);
    app.mount(host);
    await nextTick();
    await nextTick();

    const code = host.querySelector<HTMLElement>('.xnl-enhanced-code');
    expect(code?.dataset.theme).toBe('paper');
    expect(code?.querySelectorAll('.xnl-enhanced-code__gutter span')).toHaveLength(2);
    expect(code?.querySelector('.syntax-keyword')).not.toBeNull();
    expect(highlighter).toHaveBeenCalled();

    const fold = code?.querySelector<HTMLButtonElement>('[aria-label="Fold code"]');
    fold?.click();
    expect(code?.classList.contains('is-folded')).toBe(true);
    const copy = code?.querySelector<HTMLButtonElement>('[aria-label="Copy code"]');
    copy?.click();
    await nextTick();
    expect(clipboard).toHaveBeenCalledWith(
      expect.anything(),
      { text: 'const first = 1;\nconst second = 2;' },
      {},
    );
    expect(copy?.textContent).toBe('Copied');
  });

  it('projects contextual code tools when the canonical selection is inside code', () => {
    const result = createXnlDocumentEditor(runtime(), codeInput(), config);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    expect(result.session.read().context.activeNodeKinds).toContain('code-block');
    expect(result.session.read().toolbar.groups.find((group) => group.id === 'contextual')?.tools)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'code.language', visible: true }),
        expect.objectContaining({ id: 'code.fold', visible: true }),
        expect.objectContaining({ id: 'code.copy', visible: true }),
      ]));
  });

  it('accepts code-owned renderer extensions through runtime without duplicating canonical schema', () => {
    const result = createXnlDocumentEditor(runtime([], {
      extensions: createXnlRichDocumentTiptapExtensions(),
    }), codeInput(), config);
    expect(result.status, result.status === 'rejected' ? JSON.stringify(result.diagnostics) : '').toBe('ready');
    if (result.status !== 'ready') return;
    sessions.push(result.session);

    const internal = readXnlDocumentEditorInternalEditor(result.session);
    expect(internal?.extensionManager.extensions.filter(({ name }) => name === 'codeBlock')).toHaveLength(1);
    expect(internal?.view.dom.querySelector('.xnl-enhanced-code')).not.toBeNull();
  });
});
