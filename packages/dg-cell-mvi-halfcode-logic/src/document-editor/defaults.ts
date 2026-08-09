import type {
  DocumentEditorPresentation,
  DocumentEditorPresenterDefinition,
  DocumentEditorToolDefinition,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  DocumentEditorConditionBinding,
  DocumentEditorPresentationCompilerRuntime,
} from './compiler';

const editable = { id: 'editor.editable' } as const;
const tableActive = { id: 'editor.table-active' } as const;
const codeActive = { id: 'editor.code-active' } as const;

const tool = (
  id: string,
  label: string,
  icon: string,
  options: Partial<Omit<DocumentEditorToolDefinition, 'id' | 'commandId' | 'label' | 'icon'>> = {},
): DocumentEditorToolDefinition => Object.freeze({
  id,
  commandId: `rich-text.command.${id}`,
  label,
  icon,
  defaultPresenterId: 'toolbar.icon-button',
  defaultVisibleWhen: editable,
  ...options,
});

export const DEFAULT_DOCUMENT_EDITOR_TOOLS = Object.freeze([
  tool('history.undo', 'Undo', 'undo-2'),
  tool('history.redo', 'Redo', 'redo-2'),
  tool('block.paragraph', 'Paragraph', 'pilcrow'),
  tool('block.heading-1', 'Heading 1', 'heading-1'),
  tool('block.heading-2', 'Heading 2', 'heading-2'),
  tool('block.heading-3', 'Heading 3', 'heading-3'),
  tool('block.blockquote', 'Blockquote', 'quote'),
  tool('block.bullet-list', 'Bullet list', 'list'),
  tool('block.ordered-list', 'Ordered list', 'list-ordered'),
  tool('block.task-list', 'Task list', 'list-checks'),
  tool('block.horizontal-rule', 'Horizontal rule', 'minus'),
  tool('inline.bold', 'Bold', 'bold'),
  tool('inline.italic', 'Italic', 'italic'),
  tool('inline.underline', 'Underline', 'underline'),
  tool('inline.strike', 'Strike', 'strikethrough'),
  tool('inline.code', 'Inline code', 'code'),
  tool('inline.link', 'Link', 'link'),
  tool('inline.text-color', 'Text color', 'palette', { defaultPresenterId: 'toolbar.color' }),
  tool('inline.highlight', 'Highlight', 'highlighter', { defaultPresenterId: 'toolbar.color' }),
  tool('align.start', 'Align start', 'align-left'),
  tool('align.center', 'Align center', 'align-center'),
  tool('align.end', 'Align end', 'align-right'),
  tool('align.justify', 'Justify', 'align-justify'),
  tool('insert.image', 'Insert image', 'image-plus'),
  tool('insert.table', 'Insert table', 'table-2'),
  tool('insert.hard-break', 'Hard break', 'corner-down-left'),
  tool('insert.code-block', 'Code block', 'square-code'),
  tool('insert.mermaid', 'Mermaid diagram', 'workflow'),
  tool('table.row-add-after', 'Add row', 'rows-3', {
    defaultVisibleWhen: tableActive,
    requiredGrant: 'editor.table.write',
  }),
  tool('table.column-add-after', 'Add column', 'columns-3', {
    defaultVisibleWhen: tableActive,
    requiredGrant: 'editor.table.write',
  }),
  tool('table.delete', 'Delete table', 'table-properties', {
    defaultVisibleWhen: tableActive,
    requiredGrant: 'editor.table.write',
  }),
  tool('code.language', 'Code language', 'braces', {
    defaultPresenterId: 'toolbar.select',
    defaultVisibleWhen: codeActive,
  }),
  tool('code.fold', 'Fold code', 'fold-vertical', { defaultVisibleWhen: codeActive }),
  tool('code.copy', 'Copy code', 'copy', { defaultVisibleWhen: codeActive }),
] satisfies readonly DocumentEditorToolDefinition[]);

export const DEFAULT_DOCUMENT_EDITOR_PRESENTERS = Object.freeze([
  Object.freeze({ id: 'toolbar.icon-button', kind: 'button' }),
  Object.freeze({ id: 'toolbar.menu-item', kind: 'menu' }),
  Object.freeze({ id: 'toolbar.select', kind: 'select' }),
  Object.freeze({ id: 'toolbar.color', kind: 'color' }),
] satisfies readonly DocumentEditorPresenterDefinition[]);

export const DEFAULT_DOCUMENT_EDITOR_PRESENTATION = Object.freeze({
  kind: 'document-editor-presentation',
  id: 'rich-text.standard',
  groups: Object.freeze([
    group('history', 0, ['history.undo', 'history.redo']),
    group('block', 10, [
      'block.paragraph', 'block.heading-1', 'block.heading-2', 'block.heading-3',
      'block.blockquote', 'block.bullet-list', 'block.ordered-list', 'block.task-list',
      'block.horizontal-rule',
    ]),
    group('inline', 20, [
      'inline.bold', 'inline.italic', 'inline.underline', 'inline.strike', 'inline.code',
      'inline.link', 'inline.text-color', 'inline.highlight',
    ]),
    group('alignment', 30, ['align.start', 'align.center', 'align.end', 'align.justify']),
    group('insert', 40, [
      'insert.image', 'insert.table', 'insert.hard-break', 'insert.code-block', 'insert.mermaid',
    ]),
    group('contextual', 50, [
      'table.row-add-after', 'table.column-add-after', 'table.delete',
      'code.language', 'code.fold', 'code.copy',
    ]),
  ]),
} satisfies DocumentEditorPresentation);

export function createDefaultDocumentEditorPresentationCompilerRuntime(): DocumentEditorPresentationCompilerRuntime {
  return Object.freeze({
    tools: new Map(DEFAULT_DOCUMENT_EDITOR_TOOLS.map((entry) => [entry.id, entry])),
    presenters: new Map(DEFAULT_DOCUMENT_EDITOR_PRESENTERS.map((entry) => [entry.id, entry])),
    conditions: new Map<string, DocumentEditorConditionBinding>([
      condition('editor.editable', (context) => context.editable),
      condition('editor.table-active', (context) => context.activeNodeKinds.includes('table')),
      condition('editor.code-active', (context) => context.activeNodeKinds.includes('code-block')),
      condition('editor.link-active', (context) => context.activeMarks.includes('link')),
      condition('editor.selection-active', (context) => context.selection !== 'none'),
    ]),
  });
}

function group(id: string, priority: number, tools: readonly string[]) {
  return Object.freeze({
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    priority,
    tools: Object.freeze(tools.map((toolId) => Object.freeze({ id: toolId }))),
  });
}

function condition(
  id: string,
  evaluate: (context: Parameters<DocumentEditorConditionBinding['processor']>[1]['context']) => boolean,
): readonly [string, DocumentEditorConditionBinding] {
  return [id, Object.freeze({
    runtime: Object.freeze({}),
    processor: (_runtime, input) => evaluate(input.context),
  })];
}
