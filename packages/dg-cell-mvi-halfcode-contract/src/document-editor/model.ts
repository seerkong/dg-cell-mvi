import type { SchemaEditorContractRecord } from '../schema-editor/serializable';

export type DocumentEditorSerializableRecord = Readonly<SchemaEditorContractRecord>;

export type DocumentEditorPresenterRef = Readonly<{
  id: string;
  options?: DocumentEditorSerializableRecord;
}>;

export type DocumentEditorConditionRef = Readonly<{
  id: string;
  options?: DocumentEditorSerializableRecord;
}>;

export type DocumentEditorToolPresentation = Readonly<{
  id: string;
  presenter?: DocumentEditorPresenterRef;
  visibleWhen?: DocumentEditorConditionRef;
  options?: DocumentEditorSerializableRecord;
}>;

export type DocumentEditorToolGroupPresentation = Readonly<{
  id: string;
  label?: string;
  priority?: number;
  tools: readonly DocumentEditorToolPresentation[];
}>;

export type DocumentEditorPresentation = Readonly<{
  kind: 'document-editor-presentation';
  id: string;
  groups: readonly DocumentEditorToolGroupPresentation[];
  metadata?: DocumentEditorSerializableRecord;
}>;

export type DocumentEditorSelectionKind = 'none' | 'caret' | 'range';

export type DocumentEditorContext = Readonly<{
  editable: boolean;
  selection: DocumentEditorSelectionKind;
  activeNodeKinds: readonly string[];
  activeMarks: readonly string[];
}>;

export type DocumentEditorCapabilities = Readonly<{
  tools: readonly string[];
  presenters: readonly string[];
  conditions: readonly string[];
  grants?: readonly string[];
}>;

export type DocumentEditorToolDefinition = Readonly<{
  id: string;
  commandId: string;
  label: string;
  icon?: string;
  defaultPresenterId: string;
  defaultVisibleWhen?: DocumentEditorConditionRef;
  requiredGrant?: string;
}>;

export type DocumentEditorPresenterDefinition = Readonly<{
  id: string;
  kind: 'button' | 'menu' | 'select' | 'color' | 'custom';
}>;

export type DocumentEditorToolbarToolPlan = Readonly<{
  id: string;
  commandId: string;
  label: string;
  icon?: string;
  presenter: DocumentEditorPresenterRef;
  options?: DocumentEditorSerializableRecord;
  visible: boolean;
  enabled: boolean;
}>;

export type DocumentEditorToolbarGroupPlan = Readonly<{
  id: string;
  label?: string;
  priority: number;
  tools: readonly DocumentEditorToolbarToolPlan[];
}>;

export type DocumentEditorToolbarDiagnostic = Readonly<{
  severity: 'warning' | 'error';
  code: string;
  message: string;
  path: string;
}>;

export type DocumentEditorToolbarPlan = Readonly<{
  kind: 'document-editor-toolbar-plan';
  id: string;
  groups: readonly DocumentEditorToolbarGroupPlan[];
  diagnostics: readonly DocumentEditorToolbarDiagnostic[];
}>;

export type DocumentEditorPresentationValidationResult = Readonly<{
  ok: boolean;
  issues: readonly DocumentEditorToolbarDiagnostic[];
}>;

