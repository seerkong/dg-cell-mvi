import type { EditorPresenterRef } from './presentation';
import type { SchemaEditorCommandTemplate } from './commands';
import type { CollectionIdentityHint, StructureScalarKind } from './schema';
import type { SchemaEditorContractRecord, SchemaEditorContractValue } from './serializable';

export type ValuePathSegment = string | number | '*';
export type ValuePath = ValuePathSegment[];
export type EditorPlanNodeKind = 'group' | 'field' | 'collection' | 'map' | 'union' | 'custom';

export interface EditorPlanDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: ValuePath;
  details?: SchemaEditorContractRecord;
}

export interface EditorValueBinding {
  source: string;
  path?: ValuePath;
}

export interface EditorValidationBinding {
  source: string;
  path?: ValuePath;
  ruleId?: string;
  severity?: EditorPlanDiagnostic['severity'];
}

export interface EditorCommandBinding {
  event: string;
  commandTemplate: SchemaEditorCommandTemplate;
}

export interface EditorPlanDisplayMetadata {
  label: string;
  description?: string;
  visible: boolean;
  readOnly: boolean;
  group?: string;
}

export interface EditorPlanFieldMetadata {
  key: string;
  required: boolean;
}

export interface EditorScalarPlanFacts {
  kind: StructureScalarKind;
  enum?: SchemaEditorContractValue[];
  const?: SchemaEditorContractValue;
  default?: SchemaEditorContractValue;
}

export interface EditorMapKeyPlanFacts {
  scalar: 'string';
  constraints?: SchemaEditorContractRecord;
}

export interface EditorUnionAlternativeDescriptor {
  id: string;
  label?: string;
  description?: string;
  initialValue?: SchemaEditorContractValue;
}

export interface EditorCommonPlanMetadata {
  display: EditorPlanDisplayMetadata;
  field?: EditorPlanFieldMetadata;
  constraints?: SchemaEditorContractRecord;
}

export type EditorGroupPlanMetadata = EditorCommonPlanMetadata;

export type EditorFieldPlanMetadata = EditorCommonPlanMetadata &
  (
    | { scalar: EditorScalarPlanFacts; ref?: never }
    | { ref: string; scalar?: never }
  );

export interface EditorCollectionPlanMetadata extends EditorCommonPlanMetadata {
  itemDefault?: SchemaEditorContractValue;
  identity: CollectionIdentityHint;
}

export interface EditorMapPlanMetadata extends EditorCommonPlanMetadata {
  key: EditorMapKeyPlanFacts;
  valueDefault?: SchemaEditorContractValue;
}

export interface EditorUnionPlanMetadata extends EditorCommonPlanMetadata {
  discriminator?: string;
  alternativeDescriptors: EditorUnionAlternativeDescriptor[];
}

export interface EditorCustomPlanMetadata extends EditorCommonPlanMetadata {
  config?: SchemaEditorContractRecord;
}

export interface EditorPlanNodeBase<TKind extends EditorPlanNodeKind, TMetadata> {
  kind: TKind;
  id: string;
  path: ValuePath;
  metadata: TMetadata;
  presenter?: EditorPresenterRef;
  value?: EditorValueBinding;
  validation?: EditorValidationBinding;
  validationBindings?: EditorValidationBinding[];
  commandBindings?: EditorCommandBinding[];
  diagnostics?: EditorPlanDiagnostic[];
  provenance?: SchemaEditorContractRecord;
}

export interface EditorGroupPlanNode extends EditorPlanNodeBase<'group', EditorGroupPlanMetadata> {
  kind: 'group';
  children: EditorPlanNode[];
}

export interface EditorFieldPlanNode extends EditorPlanNodeBase<'field', EditorFieldPlanMetadata> {
  kind: 'field';
}

export interface EditorCollectionPlanNode extends EditorPlanNodeBase<'collection', EditorCollectionPlanMetadata> {
  kind: 'collection';
  itemTemplate: EditorPlanNode;
  children?: EditorPlanNode[];
}

export interface EditorMapPlanNode extends EditorPlanNodeBase<'map', EditorMapPlanMetadata> {
  kind: 'map';
  valueTemplate: EditorPlanNode;
  entries?: EditorPlanNode[];
}

export interface EditorUnionPlanNode extends EditorPlanNodeBase<'union', EditorUnionPlanMetadata> {
  kind: 'union';
  alternatives: Record<string, EditorPlanNode>;
}

export interface EditorCustomPlanNode extends EditorPlanNodeBase<'custom', EditorCustomPlanMetadata> {
  kind: 'custom';
  config?: SchemaEditorContractRecord;
}

export type EditorPlanNode =
  | EditorGroupPlanNode
  | EditorFieldPlanNode
  | EditorCollectionPlanNode
  | EditorMapPlanNode
  | EditorUnionPlanNode
  | EditorCustomPlanNode;

export interface EditorPlan {
  kind: 'editor-plan';
  id: string;
  root: EditorPlanNode;
  diagnostics?: EditorPlanDiagnostic[];
  provenance?: SchemaEditorContractRecord;
}
