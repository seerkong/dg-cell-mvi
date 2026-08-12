import { Extension } from '@tiptap/core';
import { Editor } from '@tiptap/vue-3';
import { history, redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history';
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import {
  compileDocumentEditorPresentation,
} from 'dg-cell-mvi-halfcode-logic';
import type { DocumentEditorToolbarDiagnostic } from 'dg-cell-mvi-halfcode-contract';
import {
  adoptXnlRichDocumentTiptapEditorState,
  bindXnlRichDocumentTiptapDraftToEditorState,
  reprojectXnlRichDocumentTiptapAccepted,
  settleXnlRichDocumentTiptapComposition,
} from './localDraftLifecycle';
import { projectTiptapDocument } from './projection';
import { createXnlRichDocumentTiptapExtensions } from './registry';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapDraftConfig,
  type XnlRichDocumentTiptapConfig,
  type XnlRichDocumentTiptapDraftState,
} from './types';
import type {
  XnlDocumentEditorCommandInput,
  XnlDocumentEditorCommandOutcome,
  XnlDocumentEditorConfig,
  XnlDocumentEditorCreateResult,
  XnlDocumentEditorInput,
  XnlDocumentEditorRuntime,
  XnlDocumentEditorSession,
  XnlDocumentEditorSnapshot,
} from './documentEditorTypes';
import {
  createEnhancedCodeBlockPresenter,
  type EnhancedCodeBlockPresenterCapability,
} from './enhancedCodeBlockPresenter';
import { createXnlRichDocumentTiptapHostExtensions } from './internalTiptapExtensionRegistry';
import {
  readCanonicalDocumentEditorCommand,
  readSelectedCodeNodeId,
} from './documentEditorCommandRegistry';

const SESSION_EDITORS = new WeakMap<XnlDocumentEditorSession, Editor>();
const SESSION_STATES = new WeakMap<XnlDocumentEditorSession, () => EditorState>();

export function createXnlDocumentEditor(
  runtime: XnlDocumentEditorRuntime,
  input: XnlDocumentEditorInput,
  config: XnlDocumentEditorConfig,
): XnlDocumentEditorCreateResult {
  let currentInput = input;
  const configuration = draftConfig(config);
  const projected = projectTiptapDocument({}, { document: input.document }, projectionConfig());
  if (projected.status !== 'projected') {
    return rejected(projected.diagnostics.map((entry) => ({
      severity: 'error' as const,
      code: entry.code,
      message: entry.message,
      path: '$.document',
    })));
  }
  if (typeof document === 'undefined') {
    return rejected([diagnostic('DOCUMENT_EDITOR_DOM_UNAVAILABLE', 'A browser DOM is required.')]);
  }

  let draft: XnlRichDocumentTiptapDraftState | undefined;
  let destroyed = false;
  let synchronizingAcceptedProjection = false;
  let editor!: Editor;
  let snapshot!: XnlDocumentEditorSnapshot;
  let transientDiagnostics: XnlDocumentEditorSnapshot['diagnostics'] = [];
  let codeDiagnostics: XnlDocumentEditorSnapshot['diagnostics'] = [];
  const listeners = new Set<(value: XnlDocumentEditorSnapshot) => void>();
  const codePresenter = createEnhancedCodeBlockPresenter(
    {
      clipboard: runtime.clipboard,
      highlighter: runtime.highlighter,
      displayMode: runtime.structuredNodeViews,
      diagnostics: {
        runtime: Object.freeze({}),
        effect: (_runtime, input) => {
          codeDiagnostics = input.diagnostics;
          if (draft !== undefined) queueMicrotask(refresh);
        },
      },
    },
    Object.freeze({}),
    { theme: config.codeTheme ?? 'light' },
  );

  const settleComposition = () => {
    if (draft === undefined || !draft.compositionActive) return;
    const result = settleXnlRichDocumentTiptapComposition(
      runtime.authoring,
      { state: draft },
      configuration,
    );
    if (result.state !== undefined) draft = result.state;
    if ('diagnostics' in result.outcome) transientDiagnostics = toolbarDiagnostics(result.outcome.diagnostics);
  };

  const adopt = (transaction: Transaction, nextState: EditorState) => {
    if (draft === undefined) return;
    const composing = editor.view.composing;
    if (draft.compositionActive && !composing) settleComposition();
    const result = adoptXnlRichDocumentTiptapEditorState(
      runtime.authoring,
      {
        state: draft,
        transaction,
        editorState: nextState,
        ...(composing ? { composition: 'intermediate' as const } : {}),
      },
      configuration,
    );
    if (result.state !== undefined) draft = result.state;
    transientDiagnostics = 'diagnostics' in result.outcome
      ? toolbarDiagnostics(result.outcome.diagnostics)
      : [];
  };

  try {
    const hostExtensions = runtime.rendererHost?.extensions
      ?? createXnlRichDocumentTiptapHostExtensions({ codeBlock: codePresenter.nodeView });
    editor = new Editor({
      extensions: [
        ...withCodeBlockPresenter(hostExtensions, codePresenter.nodeView),
        createDocumentEditorHistoryExtension(),
        codePresenter.highlighting,
      ],
      content: projected.document,
      enableContentCheck: true,
      editable: input.displayMode?.effectiveMode !== 'view',
      editorProps: {
        attributes: {
          class: 'xnl-document-editor__content',
          'data-testid': 'xnl-document-editor-content',
        },
      },
      onTransaction: () => refresh(),
      onSelectionUpdate: () => refresh(),
      onBlur: () => {
        settleComposition();
        refresh();
      },
    });
  } catch (error) {
    return rejected([diagnostic(
      'DOCUMENT_EDITOR_CREATION_FAILED',
      error instanceof Error
        ? `The canonical Tiptap editor could not be created: ${error.message}`
        : 'The canonical Tiptap editor could not be created.',
    )]);
  }

  editor.on('beforeTransaction', ({ transaction, nextState }) => {
    if (!synchronizingAcceptedProjection) adopt(transaction, nextState);
  });

  const bound = bindXnlRichDocumentTiptapDraftToEditorState(
    runtime.authoring,
    {
      editorState: editor.state,
      ...(input.acceptedObservation === undefined
        ? {}
        : { acceptedObservation: input.acceptedObservation }),
    },
    configuration,
  );
  if (bound.state === undefined) {
    editor.destroy();
    return rejected(toolbarDiagnostics(
      'diagnostics' in bound.outcome ? bound.outcome.diagnostics : [],
    ));
  }
  draft = bound.state;

  const historyCommands = Object.freeze({
    canUndo: () => undoDepth(editor.state) > 0,
    canRedo: () => redoDepth(editor.state) > 0,
    undo: () => runHistoryCommand('undo'),
    redo: () => runHistoryCommand('redo'),
  });

  const session: XnlDocumentEditorSession = Object.freeze({
    commands: Object.freeze({
      execute: async (commandInput: XnlDocumentEditorCommandInput) => {
        if (destroyed) return unavailable('The editor session has been destroyed.');
        if (!toolbarAllows(snapshot, commandInput.commandId)
          || !canExecuteCommand(editor, runtime, commandInput, codePresenter, historyCommands)) {
          return unavailable('The command is not granted by the compiled toolbar plan.');
        }
        const outcome = await executeCommand(
          editor,
          runtime,
          commandInput,
          codePresenter,
          historyCommands,
        );
        refresh();
        return outcome;
      },
      canExecute: (commandInput: XnlDocumentEditorCommandInput) => (
        !destroyed
        && toolbarAllows(snapshot, commandInput.commandId)
        && canExecuteCommand(editor, runtime, commandInput, codePresenter, historyCommands)
      ),
      focus: () => {
        if (!destroyed) editor.commands.focus();
      },
    }),
    read: () => snapshot,
    subscribe: (listener: (value: XnlDocumentEditorSnapshot) => void) => {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    update: (nextInput: XnlDocumentEditorInput) => {
      const observationKeyed = currentInput.acceptedObservation !== undefined
        || nextInput.acceptedObservation !== undefined;
      const acceptedFactChanged = observationKeyed
        ? nextInput.acceptedObservation !== currentInput.acceptedObservation
        : nextInput.document !== currentInput.document;
      currentInput = nextInput;
      const nextEditable = nextInput.displayMode?.effectiveMode !== 'view';
      const enteredViewMode = editor.isEditable && !nextEditable;
      if (editor.isEditable !== nextEditable) editor.setEditable(nextEditable);
      if (acceptedFactChanged || enteredViewMode) reprojectDocument(nextInput, enteredViewMode);
      else refresh();
    },
    reproject: (nextInput: Pick<XnlDocumentEditorInput, 'document' | 'acceptedObservation'>) => {
      reprojectDocument(nextInput);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      SESSION_EDITORS.delete(session);
      SESSION_STATES.delete(session);
      codePresenter.dispose();
      editor.destroy();
    },
  });

  function runHistoryCommand(direction: 'undo' | 'redo'): XnlDocumentEditorCommandOutcome {
    if (draft === undefined) return unavailable('The editor draft is unavailable.');
    const available = (direction === 'undo' ? undo : redo)(
      editor.state,
      (transaction) => editor.view.dispatch(transaction),
    );
    refresh();
    if (!available) return unavailable(`There is no ${direction} history available.`);
    return transientDiagnostics.length > 0
      ? { status: 'rejected', reason: transientDiagnostics[0]!.message }
      : { status: 'executed' };
  }

  function reprojectDocument(
    nextInput: Pick<XnlDocumentEditorInput, 'document' | 'acceptedObservation'>,
    forceAccepted = false,
  ): void {
      if (destroyed || draft === undefined) return;
      const nextProjection = projectTiptapDocument(
        {},
        { document: nextInput.document },
        projectionConfig(),
      );
      if (nextProjection.status !== 'projected') {
        transientDiagnostics = toolbarDiagnostics(nextProjection.diagnostics);
        refresh();
        return;
      }
      const result = reprojectXnlRichDocumentTiptapAccepted(
        runtime.authoring,
        {
          state: draft,
          document: nextProjection.document,
          ...(nextInput.acceptedObservation === undefined
            ? {}
            : { acceptedObservation: nextInput.acceptedObservation }),
        },
        { ...configuration, staleDraftPolicy: forceAccepted ? 'replace' : config.staleDraftPolicy },
      );
      if (result.state !== undefined && result.outcome.status === 'reprojected') {
        const targetState = result.state.editorState;
        if (!editor.state.doc.eq(targetState.doc)) {
          const transaction = editor.state.tr
            .replaceWith(0, editor.state.doc.content.size, targetState.doc.content)
            .setMeta('addToHistory', false)
            .setMeta('xnlAcceptedProjection', true);
          try {
            transaction.setSelection(Selection.fromJSON(
              transaction.doc,
              targetState.selection.toJSON(),
            ));
          } catch {
            // The lifecycle already selected a safe fallback; an incompatible
            // custom selection should not prevent accepted content projection.
          }
          synchronizingAcceptedProjection = true;
          try {
            editor.view.dispatch(transaction);
          } finally {
            synchronizingAcceptedProjection = false;
          }
        }
        const rebound = bindXnlRichDocumentTiptapDraftToEditorState(
          runtime.authoring,
          {
            editorState: editor.state,
            ...(nextInput.acceptedObservation === undefined
              ? {}
              : { acceptedObservation: nextInput.acceptedObservation }),
          },
          configuration,
        );
        if (rebound.state !== undefined) draft = rebound.state;
        else draft = result.state;
        if ('diagnostics' in rebound.outcome) {
          transientDiagnostics = toolbarDiagnostics(rebound.outcome.diagnostics);
        }
      } else if (result.state !== undefined) {
        draft = result.state;
      }
      if ('diagnostics' in result.outcome) {
        transientDiagnostics = toolbarDiagnostics(result.outcome.diagnostics);
      } else if (result.outcome.status !== 'reprojected') {
        transientDiagnostics = [];
      }
      refresh();
  }

  function refresh(): void {
    if (destroyed || draft === undefined) return;
    const context = editorContext(editor);
    const compiled = compileDocumentEditorPresentation(
      runtime.presentation,
      {
        presentation: currentInput.presentation,
        capabilities: currentInput.capabilities,
        editorContext: context,
      },
      { unknownToolPolicy: config.unknownToolPolicy },
    );
    if (compiled.status === 'rejected') {
      const empty = Object.freeze({
        kind: 'document-editor-toolbar-plan' as const,
        id: currentInput.presentation.id,
        groups: Object.freeze([]),
        diagnostics: compiled.diagnostics,
      });
      snapshot = Object.freeze({
        context,
        toolbar: empty,
        diagnostics: Object.freeze([
          ...compiled.diagnostics, ...transientDiagnostics, ...codeDiagnostics,
        ]),
        pendingAcceptance: draft.pendingAcceptance,
        compositionActive: draft.compositionActive,
        codeFolded: readSelectedCodeNodeId(editor) !== undefined
          && codePresenter.isFolded(readSelectedCodeNodeId(editor)!),
        displayMode: currentInput.displayMode,
      });
    } else {
      snapshot = Object.freeze({
        context,
        toolbar: compiled.plan,
        diagnostics: Object.freeze([
          ...compiled.plan.diagnostics, ...transientDiagnostics, ...codeDiagnostics,
        ]),
        pendingAcceptance: draft.pendingAcceptance,
        compositionActive: draft.compositionActive,
        codeFolded: readSelectedCodeNodeId(editor) !== undefined
          && codePresenter.isFolded(readSelectedCodeNodeId(editor)!),
        displayMode: currentInput.displayMode,
      });
    }
    listeners.forEach((listener) => listener(snapshot));
  }

  refresh();
  SESSION_EDITORS.set(session, editor);
  SESSION_STATES.set(session, () => draft?.editorState ?? editor.state);
  return Object.freeze({ status: 'ready' as const, session });
}

function withCodeBlockPresenter(
  extensions: ReturnType<typeof createXnlRichDocumentTiptapHostExtensions>,
  nodeView: Parameters<typeof createXnlRichDocumentTiptapHostExtensions>[0]['codeBlock'],
) {
  return extensions.map((extension) => extension.name === 'codeBlock'
    ? extension.extend({ addNodeView: () => nodeView })
    : extension);
}

export function readXnlDocumentEditorInternalEditor(session: XnlDocumentEditorSession): Editor | undefined {
  return SESSION_EDITORS.get(session);
}

export function readXnlDocumentEditorInternalState(session: XnlDocumentEditorSession): EditorState | undefined {
  return SESSION_STATES.get(session)?.();
}

function editorContext(editor: Editor) {
  const selection = editor.state.selection;
  const activeNodeKinds: string[] = [];
  for (let depth = 0; depth <= selection.$from.depth; depth += 1) {
    const name = selection.$from.node(depth).type.name;
    const kind = canonicalNodeKind(name);
    if (!activeNodeKinds.includes(kind)) activeNodeKinds.push(kind);
  }
  const activeMarks = [
    'bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle', 'highlight',
  ].filter((name) => editor.isActive(name)).map((name) => (
    name === 'textStyle' ? 'text-color' : name
  ));
  return Object.freeze({
    editable: editor.isEditable,
    selection: selection.empty ? 'caret' as const : 'range' as const,
    activeNodeKinds: Object.freeze(activeNodeKinds),
    activeMarks: Object.freeze(activeMarks),
  });
}

function canonicalNodeKind(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

async function executeCommand(
  editor: Editor,
  runtime: XnlDocumentEditorRuntime,
  input: XnlDocumentEditorCommandInput,
  codePresenter: EnhancedCodeBlockPresenterCapability,
  history: Readonly<{
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): XnlDocumentEditorCommandOutcome;
    redo(): XnlDocumentEditorCommandOutcome;
  }>,
): Promise<XnlDocumentEditorCommandOutcome> {
  const context = Object.freeze({ editor, runtime, input, codePresenter, history });
  const canonical = readCanonicalDocumentEditorCommand(input.commandId);
  if (canonical !== undefined) return canonical.execute(context);
  if (input.commandId.startsWith('rich-text.command.')) {
    return unavailable(`Unknown canonical command "${input.commandId}".`);
  }
  const binding = runtime.commands?.get(input.commandId);
  if (binding === undefined) return unavailable(`Unknown command "${input.commandId}".`);
  return binding.processor(
    binding.runtime,
    input.options === undefined ? {} : { options: input.options },
    { commandId: input.commandId },
  );
}

function canExecuteCommand(
  editor: Editor,
  runtime: XnlDocumentEditorRuntime,
  input: XnlDocumentEditorCommandInput,
  codePresenter: EnhancedCodeBlockPresenterCapability,
  history: Readonly<{
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): XnlDocumentEditorCommandOutcome;
    redo(): XnlDocumentEditorCommandOutcome;
  }>,
): boolean {
  const canonical = readCanonicalDocumentEditorCommand(input.commandId);
  if (canonical !== undefined) {
    return canonical.canExecute(Object.freeze({ editor, runtime, input, codePresenter, history }));
  }
  if (input.commandId.startsWith('rich-text.command.')) return false;
  const binding = runtime.commands?.get(input.commandId);
  return binding !== undefined && (binding.requiresEditable === false || editor.isEditable);
}

function draftConfig(config: XnlDocumentEditorConfig): XnlRichDocumentTiptapDraftConfig {
  return Object.freeze({
    schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
    extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
    planNodeId: config.planNodeId,
  });
}

function projectionConfig(): XnlRichDocumentTiptapConfig {
  return Object.freeze({
    schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
    extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  });
}

function createDocumentEditorHistoryExtension(): Extension {
  return Extension.create({
    name: 'xnlDocumentEditorHistory',
    addProseMirrorPlugins() {
      return [history()];
    },
  });
}

function toolbarDiagnostics(values: readonly { code: string; message: string }[]) {
  return Object.freeze(values.map((entry) => diagnostic(entry.code, entry.message)));
}

function diagnostic(code: string, message: string, path = '$'): DocumentEditorToolbarDiagnostic {
  return Object.freeze({ severity: 'error' as const, code, message, path });
}

function rejected(values: readonly DocumentEditorToolbarDiagnostic[]): XnlDocumentEditorCreateResult {
  const diagnostics = Object.freeze([...values]);
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: diagnostics as readonly [
      DocumentEditorToolbarDiagnostic,
      ...DocumentEditorToolbarDiagnostic[],
    ],
  });
}

function unavailable(reason: string): XnlDocumentEditorCommandOutcome {
  return Object.freeze({ status: 'unavailable' as const, reason });
}

function toolbarAllows(snapshot: XnlDocumentEditorSnapshot | undefined, commandId: string): boolean {
  return snapshot?.toolbar.groups.some((group) => group.tools.some((tool) => (
    tool.commandId === commandId && tool.visible && tool.enabled
  ))) === true;
}
