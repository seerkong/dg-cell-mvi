import type { Editor } from '@tiptap/vue-3';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
  XnlDocumentEditorCommandInput,
  XnlDocumentEditorCommandOutcome,
  XnlDocumentEditorRuntime,
} from './documentEditorTypes';
import type { EnhancedCodeBlockPresenterCapability } from './enhancedCodeBlockPresenter';

type CanonicalCommandContext = Readonly<{
  editor: Editor;
  runtime: XnlDocumentEditorRuntime;
  input: XnlDocumentEditorCommandInput;
  codePresenter: EnhancedCodeBlockPresenterCapability;
  history: Readonly<{
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): XnlDocumentEditorCommandOutcome;
    redo(): XnlDocumentEditorCommandOutcome;
  }>;
}>;

type CanonicalCommandBinding = Readonly<{
  execute(context: CanonicalCommandContext): XnlDocumentEditorCommandOutcome | Promise<XnlDocumentEditorCommandOutcome>;
  canExecute(context: CanonicalCommandContext): boolean;
}>;

const editable = (context: CanonicalCommandContext) => context.editor.isEditable;
const command = (
  execute: CanonicalCommandBinding['execute'],
  canExecute: CanonicalCommandBinding['canExecute'] = editable,
): CanonicalCommandBinding => Object.freeze({ execute, canExecute });
const run = (apply: (context: CanonicalCommandContext) => boolean) => command((context) => (
  apply(context) ? executed() : unavailable('The command is not available here.')
));

export const CANONICAL_DOCUMENT_EDITOR_COMMANDS: ReadonlyMap<string, CanonicalCommandBinding> = new Map([
  ['rich-text.command.history.undo', command(
    ({ history }) => history.undo(),
    ({ history }) => history.canUndo(),
  )],
  ['rich-text.command.history.redo', command(
    ({ history }) => history.redo(),
    ({ history }) => history.canRedo(),
  )],
  ['rich-text.command.block.paragraph', run(({ editor }) => editor.chain().focus().setParagraph().run())],
  ['rich-text.command.block.heading-1', run(({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run())],
  ['rich-text.command.block.heading-2', run(({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run())],
  ['rich-text.command.block.heading-3', run(({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run())],
  ['rich-text.command.block.blockquote', run(({ editor }) => editor.chain().focus().toggleBlockquote().run())],
  ['rich-text.command.block.bullet-list', run(({ editor }) => editor.chain().focus().toggleBulletList().run())],
  ['rich-text.command.block.ordered-list', run(({ editor }) => editor.chain().focus().toggleOrderedList().run())],
  ['rich-text.command.block.task-list', run(({ editor }) => insertTaskList(editor))],
  ['rich-text.command.block.horizontal-rule', run(({ editor }) => editor.chain().focus().setHorizontalRule().run())],
  ['rich-text.command.inline.bold', run(({ editor }) => editor.chain().focus().toggleBold().run())],
  ['rich-text.command.inline.italic', run(({ editor }) => editor.chain().focus().toggleItalic().run())],
  ['rich-text.command.inline.underline', run(({ editor }) => editor.chain().focus().toggleUnderline().run())],
  ['rich-text.command.inline.strike', run(({ editor }) => editor.chain().focus().toggleStrike().run())],
  ['rich-text.command.inline.code', run(({ editor }) => editor.chain().focus().toggleCode().run())],
  ['rich-text.command.inline.link', command(({ editor, input }) => {
    if (editor.isActive('link')) {
      return editor.chain().focus().unsetLink().run() ? executed() : unavailable('The command is not available here.');
    }
    const href = input.options?.href;
    if (typeof href !== 'string' || href.length === 0) return unavailable('A non-empty href is required.');
    return editor.chain().focus().setLink({ href }).run() ? executed() : unavailable('The command is not available here.');
  }, ({ editor, input }) => editor.isActive('link') || typeof input.options?.href === 'string')],
  ['rich-text.command.inline.text-color', optionCommand('color', ({ editor, value }) => editor.chain().focus().setColor(value).run())],
  ['rich-text.command.inline.highlight', optionCommand('color', ({ editor, value }) => editor.chain().focus().toggleHighlight({ color: value }).run())],
  ['rich-text.command.align.start', run(({ editor }) => editor.chain().focus().setTextAlign('start').run())],
  ['rich-text.command.align.center', run(({ editor }) => editor.chain().focus().setTextAlign('center').run())],
  ['rich-text.command.align.end', run(({ editor }) => editor.chain().focus().setTextAlign('end').run())],
  ['rich-text.command.align.justify', run(({ editor }) => editor.chain().focus().setTextAlign('justify').run())],
  ['rich-text.command.insert.image', optionCommand('src', ({ editor, value }) => editor.chain().focus().setImage({ src: value }).run())],
  ['rich-text.command.insert.table', run(({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())],
  ['rich-text.command.insert.hard-break', run(({ editor }) => editor.chain().focus().setHardBreak().run())],
  ['rich-text.command.insert.code-block', run(({ editor }) => editor.chain().focus().toggleCodeBlock().run())],
  ['rich-text.command.insert.mermaid', run(({ editor, input }) => editor.chain().focus().insertContent({
    type: 'mermaid',
    attrs: { nodeId: null, source: typeof input.options?.source === 'string' ? input.options.source : '' },
  }).run())],
  ['rich-text.command.table.row-add-after', run(({ editor }) => editor.chain().focus().addRowAfter().run())],
  ['rich-text.command.table.column-add-after', run(({ editor }) => editor.chain().focus().addColumnAfter().run())],
  ['rich-text.command.table.delete', run(({ editor }) => editor.chain().focus().deleteTable().run())],
  ['rich-text.command.code.language', optionCommand('language', ({ editor, value }) => editor.chain().focus().updateAttributes('codeBlock', { language: value }).run(), codeSelected)],
  ['rich-text.command.code.fold', command(({ editor, codePresenter }) => {
    const nodeId = selectedCodeNodeId(editor);
    if (nodeId === undefined) return unavailable('Select a code block first.');
    codePresenter.toggle(nodeId);
    return executed();
  }, codeSelected)],
  ['rich-text.command.code.copy', command(async ({ editor, runtime }) => {
    const source = selectedCodeNode(editor)?.textContent;
    if (source === undefined) return unavailable('Select a code block first.');
    if (runtime.clipboard === undefined) return unavailable('No clipboard effect is bound.');
    const result = await runtime.clipboard.effect(runtime.clipboard.runtime, { text: source }, Object.freeze({}));
    return result.status === 'written' ? executed() : { status: 'rejected', reason: result.reason };
  }, ({ editor, runtime }) => selectedCodeNode(editor) !== undefined && runtime.clipboard !== undefined)],
]);

function insertTaskList(editor: Editor): boolean {
  const selection = editor.state.selection.$from;
  const position = selection.depth > 0 ? selection.after(1) : editor.state.doc.content.size;
  return editor.chain().focus().insertContentAt(position, {
    type: 'taskList',
    attrs: { nodeId: null },
    content: [{
      type: 'taskItem',
      attrs: { nodeId: null, checked: false },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: null },
      }],
    }],
  }, { updateSelection: true }).run();
}

export function readCanonicalDocumentEditorCommand(commandId: string): CanonicalCommandBinding | undefined {
  return CANONICAL_DOCUMENT_EDITOR_COMMANDS.get(commandId);
}

export function readSelectedCodeNodeId(editor: Editor): string | undefined {
  return selectedCodeNodeId(editor);
}

function optionCommand(
  key: string,
  apply: (input: Readonly<{ editor: Editor; value: string }>) => boolean,
  extraGuard: (context: CanonicalCommandContext) => boolean = editable,
): CanonicalCommandBinding {
  return command((context) => {
    const value = context.input.options?.[key];
    if (typeof value !== 'string' || value.length === 0) return unavailable(`A non-empty ${key} is required.`);
    return apply({ editor: context.editor, value }) ? executed() : unavailable('The command is not available here.');
  }, (context) => typeof context.input.options?.[key] === 'string' && extraGuard(context));
}

function codeSelected(context: Pick<CanonicalCommandContext, 'editor'>): boolean {
  return selectedCodeNode(context.editor) !== undefined;
}

function selectedCodeNode(editor: Editor): ProseMirrorNode | undefined {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'codeBlock') return node;
  }
  return undefined;
}

function selectedCodeNodeId(editor: Editor): string | undefined {
  const value = selectedCodeNode(editor)?.attrs.nodeId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function executed(): XnlDocumentEditorCommandOutcome {
  return Object.freeze({ status: 'executed' as const });
}

function unavailable(reason: string): XnlDocumentEditorCommandOutcome {
  return Object.freeze({ status: 'unavailable' as const, reason });
}
