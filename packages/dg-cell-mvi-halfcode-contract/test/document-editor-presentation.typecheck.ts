import type {
  DocumentEditorCapabilities,
  DocumentEditorContext,
  DocumentEditorPresentation,
  DocumentEditorToolbarPlan,
} from '../src';

const presentation = {
  kind: 'document-editor-presentation',
  id: 'document.standard',
  groups: [{ id: 'history', tools: [{ id: 'history.undo' }, { id: 'history.redo' }] }],
} satisfies DocumentEditorPresentation;

const capabilities = {
  tools: ['history.undo', 'history.redo'],
  presenters: ['toolbar.icon-button'],
  conditions: ['document.editable'],
} satisfies DocumentEditorCapabilities;

const context = {
  editable: true,
  selection: 'caret',
  activeNodeKinds: ['paragraph'],
  activeMarks: [],
} satisfies DocumentEditorContext;

const plan = {
  kind: 'document-editor-toolbar-plan',
  id: presentation.id,
  groups: [],
  diagnostics: [],
} satisfies DocumentEditorToolbarPlan;

export { capabilities, context, plan, presentation };

