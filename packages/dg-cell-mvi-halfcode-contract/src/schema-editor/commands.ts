import type { ValuePath } from './plan';
import type { SchemaEditorContractValue } from './serializable';

export const SCHEMA_EDITOR_COMMAND_KINDS = [
  'value.set',
  'collection.insert',
  'collection.remove',
  'collection.move',
  'map.set',
  'map.remove',
  'map.rename-key',
  'union.select',
] as const;

export type SchemaEditorCommandKind = (typeof SCHEMA_EDITOR_COMMAND_KINDS)[number];

export type SchemaEditorCommandArgument<TLiteral extends SchemaEditorContractValue = SchemaEditorContractValue> =
  | { source: 'event'; path: ValuePath }
  | { source: 'value'; path: ValuePath }
  | { source: 'literal'; value: TLiteral };

export type SchemaEditorCommandTarget = SchemaEditorCommandArgument<ValuePath>;

export type SchemaEditorCommandTemplate =
  | {
      kind: 'value.set';
      target: SchemaEditorCommandTarget;
      arguments: { value: SchemaEditorCommandArgument };
    }
  | {
      kind: 'collection.insert';
      target: SchemaEditorCommandTarget;
      arguments?: {
        index?: SchemaEditorCommandArgument<number>;
        value?: SchemaEditorCommandArgument;
      };
    }
  | {
      kind: 'collection.remove';
      target: SchemaEditorCommandTarget;
      arguments: { index: SchemaEditorCommandArgument<number> };
    }
  | {
      kind: 'collection.move';
      target: SchemaEditorCommandTarget;
      arguments: {
        from: SchemaEditorCommandArgument<number>;
        to: SchemaEditorCommandArgument<number>;
      };
    }
  | {
      kind: 'map.set';
      target: SchemaEditorCommandTarget;
      arguments: {
        key: SchemaEditorCommandArgument<string>;
        value: SchemaEditorCommandArgument;
      };
    }
  | {
      kind: 'map.remove';
      target: SchemaEditorCommandTarget;
      arguments: { key: SchemaEditorCommandArgument<string> };
    }
  | {
      kind: 'map.rename-key';
      target: SchemaEditorCommandTarget;
      arguments: {
        from: SchemaEditorCommandArgument<string>;
        to: SchemaEditorCommandArgument<string>;
      };
    }
  | {
      kind: 'union.select';
      target: SchemaEditorCommandTarget;
      arguments: {
        alternativeId: SchemaEditorCommandArgument<string>;
        initialValue?: SchemaEditorCommandArgument;
      };
    };

export type SchemaEditorCommand =
  | { kind: 'value.set'; target: ValuePath; value: SchemaEditorContractValue }
  | { kind: 'collection.insert'; target: ValuePath; index?: number; value?: SchemaEditorContractValue }
  | { kind: 'collection.remove'; target: ValuePath; index: number }
  | { kind: 'collection.move'; target: ValuePath; from: number; to: number }
  | { kind: 'map.set'; target: ValuePath; key: string; value: SchemaEditorContractValue }
  | { kind: 'map.remove'; target: ValuePath; key: string }
  | { kind: 'map.rename-key'; target: ValuePath; from: string; to: string }
  | { kind: 'union.select'; target: ValuePath; alternativeId: string; initialValue?: SchemaEditorContractValue };
