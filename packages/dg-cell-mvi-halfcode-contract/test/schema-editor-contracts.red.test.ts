import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contract from '../src';
import type {
  ArrayStructureSchema,
  EditorCommandBinding,
  EditorCollectionPlanNode,
  EditorCustomPlanNode,
  EditorFieldPlanNode,
  EditorGroupPlanNode,
  EditorMapPlanNode,
  EditorPlan,
  EditorPlanDiagnostic,
  EditorPlanNode,
  EditorPlanNodeKind,
  EditorPresentation,
  EditorPresentationOverlay,
  EditorPresenterRef,
  EditorUnionPlanNode,
  EditorValidationBinding,
  EditorValueBinding,
  MapStructureSchema,
  ObjectStructureField,
  ObjectStructureSchema,
  SCHEMA_EDITOR_RESOLUTION_PRECEDENCE,
  SchemaEditorCommandArgument,
  SchemaEditorCommand,
  SchemaEditorCommandKind,
  SchemaEditorCommandTarget,
  SchemaEditorCommandTemplate,
  SchemaEditorClassify,
  SchemaEditorClassification,
  SchemaEditorCompileRuntime,
  SchemaEditorDialect,
  SchemaEditorProcessor,
  SchemaEditorProcessorInput,
  SchemaEditorResolutionStage,
  SchemaEditorTransformer,
  SchemaEditorTransformers,
  SchemaEditorValidationIssue,
  SchemaEditorValidationResult,
  ScalarStructureSchema,
  StructureScalarKind,
  StructureSchema,
  StructureSemanticAnnotations,
  UnionStructureAlternative,
  UnionStructureSchema,
  ValuePath,
  ValuePathSegment,
} from '../src';

type ValidationIssue = { path: string; code?: string; message: string };
type ValidationResult = { ok: boolean; issues: ValidationIssue[] };

type SchemaEditorSurface = typeof contract & {
  validateStructureSchema(value: unknown): ValidationResult;
  validateEditorPresentation(value: unknown): ValidationResult;
  validateEditorPlan(value: unknown): ValidationResult;
  validateSchemaEditorDialect(value: unknown): ValidationResult;
  validateSchemaEditorCommand(value: unknown): ValidationResult;
};

const schemaEditor = contract as SchemaEditorSurface;
const SCHEMA_EDITOR_SRC = path.resolve(__dirname, '../src/schema-editor');
const PACKAGE_JSON = path.resolve(__dirname, '../package.json');
const FORBIDDEN_DEPENDENCY_PATTERNS = [
  /from ['"][^'"]*(vue|@vue|element-plus)[^'"]*['"]/,
  /from ['"][^'"]*(dg-cell-mvi-core|dg-cell-mvi-halfcode-support)[^'"]*['"]/,
  /from ['"][^'"]*(runtime|support|vfs|xnl|mutation|persistence|flow)[^'"]*['"]/i,
  /from ['"][^'"]*(renderer|renderers|presenter|presenters)[^'"]*['"]/i,
  /\b(window|document)\./,
  /\b(fetch|localStorage|indexedDB)\b/,
];
const EXPECTED_SCHEMA_EDITOR_RUNTIME_EXPORTS = [
  'SCHEMA_EDITOR_COMMAND_KINDS',
  'SCHEMA_EDITOR_RESOLUTION_PRECEDENCE',
  'validateEditorPlan',
  'validateEditorPresentation',
  'validateSchemaEditorCommand',
  'validateSchemaEditorDialect',
  'validateStructureSchemaCandidate',
  'validateStructureSchema',
] as const;
const PHANTOM_SCHEMA_EDITOR_RUNTIME_EXPORTS = [
  'STRUCTURE_SCHEMA_VALUE',
  'addDuplicateIssue',
  'appendPath',
  'collectSerializableIssues',
  'isPlainRecord',
  'isStableId',
  'validateStableId',
  'validationResult',
] as const;

function expectOk(result: ValidationResult): void {
  expect(result).toEqual({ ok: true, issues: [] });
}

function expectRejected(result: ValidationResult, pathPattern: RegExp): void {
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.path).join('\n')).toMatch(pathPattern);
}

function serializableRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('schema-editor public contract surface', () => {
  it('exports the intended schema-editor runtime surface from the package root', () => {
    expect(contract.SCHEMA_EDITOR_COMMAND_KINDS).toEqual([
      'value.set',
      'collection.insert',
      'collection.remove',
      'collection.move',
      'map.set',
      'map.remove',
      'map.rename-key',
      'union.select',
    ]);
    expect(contract.SCHEMA_EDITOR_RESOLUTION_PRECEDENCE).toEqual([
      'presentation',
      'semantic',
      'format',
      'structural',
      'unsupported',
    ]);

    for (const exportName of EXPECTED_SCHEMA_EDITOR_RUNTIME_EXPORTS) {
      expect(exportName in contract, exportName).toBe(true);
    }

    expect(schemaEditor.validateStructureSchema).toBeTypeOf('function');
    expect(schemaEditor.validateEditorPresentation).toBeTypeOf('function');
    expect(schemaEditor.validateEditorPlan).toBeTypeOf('function');
    expect(schemaEditor.validateSchemaEditorDialect).toBeTypeOf('function');
    expect(schemaEditor.validateSchemaEditorCommand).toBeTypeOf('function');
  });

  it('exposes the intended schema-editor type surface from the package root', () => {
    type PublicSchemaEditorTypes = {
      schema: StructureSchema;
      scalarSchema: ScalarStructureSchema;
      objectSchema: ObjectStructureSchema;
      objectField: ObjectStructureField;
      arraySchema: ArrayStructureSchema;
      mapSchema: MapStructureSchema;
      unionSchema: UnionStructureSchema;
      unionAlternative: UnionStructureAlternative;
      scalarKind: StructureScalarKind;
      semanticAnnotations: StructureSemanticAnnotations;
      presentation: EditorPresentation;
      presentationOverlay: EditorPresentationOverlay;
      presenterRef: EditorPresenterRef;
      plan: EditorPlan;
      planNode: EditorPlanNode;
      planNodeKind: EditorPlanNodeKind;
      groupNode: EditorGroupPlanNode;
      fieldNode: EditorFieldPlanNode;
      collectionNode: EditorCollectionPlanNode;
      mapNode: EditorMapPlanNode;
      unionNode: EditorUnionPlanNode;
      customNode: EditorCustomPlanNode;
      diagnostic: EditorPlanDiagnostic;
      valuePath: ValuePath;
      valuePathSegment: ValuePathSegment;
      valueBinding: EditorValueBinding;
      validationBinding: EditorValidationBinding;
      commandBinding: EditorCommandBinding;
      commandArgument: SchemaEditorCommandArgument;
      commandTarget: SchemaEditorCommandTarget;
      commandTemplate: SchemaEditorCommandTemplate;
      command: SchemaEditorCommand;
      commandKind: SchemaEditorCommandKind;
      runtime: SchemaEditorCompileRuntime;
      processorInput: SchemaEditorProcessorInput;
      classification: SchemaEditorClassification;
      processor: SchemaEditorProcessor;
      classify: SchemaEditorClassify;
      transformer: SchemaEditorTransformer;
      transformers: SchemaEditorTransformers;
      dialect: SchemaEditorDialect;
      resolutionStage: SchemaEditorResolutionStage;
      validationIssue: SchemaEditorValidationIssue;
      validationResult: SchemaEditorValidationResult;
    };

    const compileGuard: PublicSchemaEditorTypes = {
      schema: { kind: 'scalar', scalar: 'string' },
      scalarSchema: { kind: 'scalar', scalar: 'string' },
      objectSchema: { kind: 'object', fields: [] },
      objectField: { key: 'title', schema: { kind: 'scalar', scalar: 'string' } },
      arraySchema: { kind: 'array', item: { kind: 'scalar', scalar: 'string' } },
      mapSchema: {
        kind: 'map',
        key: { kind: 'scalar', scalar: 'string' },
        value: { kind: 'scalar', scalar: 'string' },
      },
      unionSchema: {
        kind: 'union',
        alternatives: [{ id: 'text', schema: { kind: 'scalar', scalar: 'string' } }],
      },
      unionAlternative: { id: 'text', schema: { kind: 'scalar', scalar: 'string' } },
      scalarKind: 'string',
      semanticAnnotations: { semanticType: 'demo' },
      presentation: { kind: 'presentation', presenter: { id: 'text.input' } },
      presentationOverlay: { presenter: { id: 'text.input' } },
      presenterRef: { id: 'text.input' },
      plan: {
        kind: 'editor-plan',
        id: 'plan',
        root: {
          kind: 'field',
          id: 'title',
          path: ['title'],
          metadata: {
            display: { label: 'Title', visible: true, readOnly: false },
            scalar: { kind: 'string' },
          },
        },
      },
      planNode: {
        kind: 'field',
        id: 'title',
        path: ['title'],
        metadata: {
          display: { label: 'Title', visible: true, readOnly: false },
          scalar: { kind: 'string' },
        },
      },
      planNodeKind: 'field',
      groupNode: {
        kind: 'group',
        id: 'root',
        path: [],
        metadata: { display: { label: 'Root', visible: true, readOnly: false } },
        children: [],
      },
      fieldNode: {
        kind: 'field',
        id: 'title',
        path: ['title'],
        metadata: {
          display: { label: 'Title', visible: true, readOnly: false },
          scalar: { kind: 'string' },
        },
      },
      collectionNode: {
        kind: 'collection',
        id: 'items',
        path: ['items'],
        metadata: {
          display: { label: 'Items', visible: true, readOnly: false },
          identity: { strategy: 'ephemeral' },
        },
        itemTemplate: {
          kind: 'field',
          id: 'items.$item',
          path: ['items', '*'],
          metadata: {
            display: { label: 'Item', visible: true, readOnly: false },
            scalar: { kind: 'string' },
          },
        },
      },
      mapNode: {
        kind: 'map',
        id: 'metadata',
        path: ['metadata'],
        metadata: {
          display: { label: 'Metadata', visible: true, readOnly: false },
          key: { scalar: 'string' },
        },
        valueTemplate: {
          kind: 'field',
          id: 'metadata.$value',
          path: ['metadata', '*'],
          metadata: {
            display: { label: 'Value', visible: true, readOnly: false },
            scalar: { kind: 'string' },
          },
        },
      },
      unionNode: {
        kind: 'union',
        id: 'status',
        path: ['status'],
        metadata: {
          display: { label: 'Status', visible: true, readOnly: false },
          alternativeDescriptors: [{ id: 'draft' }],
        },
        alternatives: {
          draft: {
            kind: 'field',
            id: 'status.draft',
            path: ['status'],
            metadata: {
              display: { label: 'Draft', visible: true, readOnly: false },
              scalar: { kind: 'string', const: 'draft' },
            },
          },
        },
      },
      customNode: {
        kind: 'custom',
        id: 'custom',
        path: [],
        metadata: { display: { label: 'Custom', visible: true, readOnly: false } },
      },
      diagnostic: { severity: 'info', code: 'INFO', message: 'ok' },
      valuePath: ['items', '*', 'label'],
      valuePathSegment: '*',
      valueBinding: { source: 'value', path: ['title'] },
      validationBinding: { source: 'schema', path: ['title'] },
      commandBinding: {
        event: 'change',
        commandTemplate: {
          kind: 'value.set',
          target: { source: 'literal', value: ['title'] },
          arguments: { value: { source: 'event', path: ['value'] } },
        },
      },
      commandArgument: { source: 'event', path: ['value'] },
      commandTarget: { source: 'literal', value: ['title'] },
      commandTemplate: {
        kind: 'collection.remove',
        target: { source: 'literal', value: ['items'] },
        arguments: { index: { source: 'event', path: ['index'] } },
      },
      command: { kind: 'value.set', target: ['title'], value: 'ok' },
      commandKind: 'value.set',
      runtime: { compile: (input: unknown) => input },
      processorInput: { schema: { kind: 'scalar', scalar: 'string' } },
      classification: { structuralKind: 'scalar' },
      processor: (runtime, input, config) => ({ runtime, input, config }),
      classify: (_runtime, _input, _config) => ({ structuralKind: 'scalar' }),
      transformer: (_runtime, _input, _config) => ({
        kind: 'field',
        id: 'title',
        path: ['title'],
        metadata: {
          display: { label: 'Title', visible: true, readOnly: false },
          scalar: { kind: 'string' },
        },
      }),
      transformers: {},
      dialect: { id: 'demo' },
      resolutionStage: 'structural',
      validationIssue: { path: '$', message: 'ok' },
      validationResult: { ok: true, issues: [] },
    };

    expect(compileGuard.plan.root.kind).toBe('field');
  });

  it('does not expose phantom or helper-only schema-editor runtime exports', () => {
    const schemaSource = fs.readFileSync(path.join(SCHEMA_EDITOR_SRC, 'schema.ts'), 'utf8');

    for (const exportName of PHANTOM_SCHEMA_EDITOR_RUNTIME_EXPORTS) {
      expect(exportName in contract, exportName).toBe(false);
    }
    expect(schemaSource).not.toMatch(/export\s+declare\s+const\s+STRUCTURE_SCHEMA_VALUE/);
  });

  it('does not publish a parallel schema-editor deep subpath or internals route', () => {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as {
      exports?: Record<string, unknown>;
    };
    const exportKeys = Object.keys(packageJson.exports ?? {});

    expect(exportKeys).toEqual(['.', './test-fixtures/xnl-rich-document']);
    expect(exportKeys).not.toContain('./schema-editor');
    expect(exportKeys.filter((key) => key !== './test-fixtures/xnl-rich-document')
      .some((key) => /internal|schema-editor|test-fixtures/.test(key))).toBe(false);
  });

  it('keeps schema-editor as a pure contract capsule with one public index and no renderer, VFS, XNL, or mutation dependency', () => {
    expect(fs.existsSync(SCHEMA_EDITOR_SRC), 'src/schema-editor capsule must exist').toBe(true);

    const sourceFiles = fs.readdirSync(SCHEMA_EDITOR_SRC).filter((file) => file.endsWith('.ts'));
    expect(sourceFiles.filter((file) => file === 'index.ts')).toEqual(['index.ts']);
    expect(sourceFiles.some((file) => /render|vue|element|dom|support|vfs|xnl|mutation|persistence|flow/i.test(file))).toBe(false);

    const source = sourceFiles.map((file) => fs.readFileSync(path.join(SCHEMA_EDITOR_SRC, file), 'utf8')).join('\n');

    for (const pattern of FORBIDDEN_DEPENDENCY_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});

describe('StructureSchema and EditorPresentation data boundary', () => {
  it('uses StructureSchema<TValue> as a type-only contract without serialized phantom fields', () => {
    type ConditionNodeValue = {
      branches: Array<{ label: string; when: boolean }>;
      metadata: Record<string, string>;
    };

    const typedSchema = {
      kind: 'object',
      fields: [
        {
          key: 'branches',
          schema: {
            kind: 'array',
            item: {
              kind: 'object',
              fields: [
                { key: 'label', schema: { kind: 'scalar', scalar: 'string' } },
                { key: 'when', schema: { kind: 'scalar', scalar: 'boolean' } },
              ],
            },
          },
        },
        {
          key: 'metadata',
          schema: {
            kind: 'map',
            key: { kind: 'scalar', scalar: 'string' },
            value: { kind: 'scalar', scalar: 'string' },
          },
        },
      ],
    } satisfies StructureSchema<ConditionNodeValue>;

    expectOk(schemaEditor.validateStructureSchema(typedSchema));
    expect(Object.getOwnPropertySymbols(typedSchema)).toEqual([]);
    expect(serializableRoundTrip(typedSchema)).toEqual(typedSchema);
  });

  it('accepts recursive object, array, map, union, scalar, and ref schema data with semantic annotations', () => {
    const conditionSchema = {
      kind: 'object',
      id: 'flow.condition-node',
      label: 'Condition node',
      annotations: {
        semanticType: 'biz-flow.condition',
        tags: ['flow', 'branching'],
      },
      required: ['branches'],
      fields: [
        {
          key: 'branches',
          schema: {
            kind: 'array',
            id: 'flow.condition-node.branches',
            item: {
              kind: 'object',
              id: 'flow.condition-branch',
              required: ['label', 'when'],
              fields: [
                { key: 'label', schema: { kind: 'scalar', scalar: 'string' } },
                {
                  key: 'when',
                  schema: {
                    kind: 'union',
                    id: 'flow.condition-expression',
                    discriminator: 'kind',
                    alternatives: [
                      { id: 'literal', schema: { kind: 'scalar', scalar: 'boolean' } },
                      {
                        id: 'nested',
                        schema: { kind: 'ref', ref: 'schema://flow.condition-node' },
                      },
                    ],
                  },
                },
              ],
            },
            constraints: { minItems: 1 },
          },
        },
        {
          key: 'metadata',
          schema: {
            kind: 'map',
            key: { kind: 'scalar', scalar: 'string' },
            value: {
              kind: 'union',
              alternatives: [
                { id: 'text', schema: { kind: 'scalar', scalar: 'string' } },
                { id: 'target', schema: { kind: 'ref', ref: 'schema://flow.target' } },
              ],
            },
          },
        },
      ],
    } satisfies StructureSchema;

    expectOk(schemaEditor.validateStructureSchema(conditionSchema));
    expect(serializableRoundTrip(conditionSchema)).toEqual(conditionSchema);
  });

  it('accepts pure presentation overlays and rejects functions, components, and runtime instances', () => {
    const presentation = {
      kind: 'presentation',
      schemaId: 'flow.condition-node',
      presenter: { id: 'form.section', options: { density: 'compact' } },
      children: {
        branches: {
          presenter: { id: 'collection.table', options: { addLabel: 'Add branch' } },
          item: {
            presenter: { id: 'object.card' },
            children: {
              when: { presenter: { id: 'business.condition-builder' } },
            },
          },
        },
      },
    } satisfies EditorPresentation;

    expectOk(schemaEditor.validateEditorPresentation(presentation));
    expect(serializableRoundTrip(presentation)).toEqual(presentation);

    for (const invalid of [
      { ...presentation, presenter: { id: 'form.section', options: { onClick: () => undefined } } },
      { ...presentation, componentConstructor: class InlineConditionEditor {} },
      { ...presentation, runtime: { dispatch: () => undefined } },
    ]) {
      expectRejected(
        schemaEditor.validateEditorPresentation(invalid),
        /\$\.presenter\.options\.onClick|\$\.componentConstructor|\$\.runtime/,
      );
    }
  });
});

describe('EditorPlan renderer-neutral IR', () => {
  it('models recursive collection and map templates without expanding from the current value snapshot', () => {
    const plan = {
      kind: 'editor-plan',
      id: 'flow.condition-node.plan',
      root: {
        kind: 'group',
        id: 'root',
        path: [],
        metadata: { display: { label: 'Condition', visible: true, readOnly: false } },
        presenter: { id: 'form.section' },
        children: [
          {
            kind: 'collection',
            id: 'branches',
            path: ['branches'],
            metadata: {
              display: { label: 'Branches', visible: true, readOnly: false },
              identity: { strategy: 'ephemeral' },
            },
            presenter: { id: 'collection.table' },
            value: { source: 'value', path: ['branches'] },
            commandBindings: [
              {
                event: 'insert',
                commandTemplate: {
                  kind: 'collection.insert',
                  target: { source: 'literal', value: ['branches'] },
                  arguments: { value: { source: 'event', path: ['value'] } },
                },
              },
            ],
            itemTemplate: {
              kind: 'field',
              id: 'branches.$item.label',
              path: ['branches', '*', 'label'],
              metadata: {
                display: { label: 'Label', visible: true, readOnly: false },
                scalar: { kind: 'string' },
              },
              presenter: { id: 'text.input' },
              value: { source: 'value', path: ['branches', '*', 'label'] },
            },
          },
          {
            kind: 'map',
            id: 'metadata',
            path: ['metadata'],
            metadata: {
              display: { label: 'Metadata', visible: true, readOnly: false },
              key: { scalar: 'string' },
            },
            presenter: { id: 'key-value.map' },
            valueTemplate: {
              kind: 'field',
              id: 'metadata.$value',
              path: ['metadata', '*'],
              metadata: {
                display: { label: 'Value', visible: true, readOnly: false },
                scalar: { kind: 'string' },
              },
              presenter: { id: 'text.input' },
            },
          },
          {
            kind: 'union',
            id: 'when',
            path: ['when'],
            metadata: {
              display: { label: 'When', visible: true, readOnly: false },
              alternativeDescriptors: [{ id: 'literal' }, { id: 'nested' }],
            },
            presenter: { id: 'union.tabs' },
            validation: { source: 'schema', path: ['when'] },
            alternatives: {
              literal: {
                kind: 'field',
                id: 'when.literal',
                path: ['when'],
                metadata: {
                  display: { label: 'Literal', visible: true, readOnly: false },
                  scalar: { kind: 'boolean' },
                },
                presenter: { id: 'boolean.switch' },
              },
              nested: {
                kind: 'custom',
                id: 'when.nested',
                path: ['when'],
                metadata: { display: { label: 'Nested', visible: true, readOnly: false } },
                presenter: { id: 'business.condition-builder', explicit: true, reason: 'semantic' },
                provenance: { semanticType: 'biz-flow.condition' },
              },
            },
          },
        ],
      },
      diagnostics: [],
      provenance: { schemaId: 'flow.condition-node', presentationId: 'flow.condition-node.presentation' },
    } satisfies EditorPlan;

    expectOk(schemaEditor.validateEditorPlan(plan));
    expect(serializableRoundTrip(plan)).toEqual(plan);

    expectRejected(
      schemaEditor.validateEditorPlan({
        ...plan,
        root: { ...plan.root, children: [{ kind: 'json-fallback', id: 'bad', path: [] }] },
      }),
      /\$\.root\.children\[0\]\.kind/,
    );
  });
});

describe('SchemaEditorDialect processor protocol', () => {
  it('uses output = fn(runtime, input, config) and requests child recursion through runtime.compile', async () => {
    type CustomRuntime = {
      compile(input: { kind: 'scalar'; scalar: string }): EditorPlan['root'];
    };
    type CustomInput = { child: { kind: 'scalar'; scalar: string } };
    type CustomConfig = { presenter: string };
    type CustomOutput = Extract<EditorPlan['root'], { kind: 'collection' }>;

    const calls: unknown[] = [];
    const runtime: CustomRuntime = {
      compile(input) {
        calls.push(input);
        return {
          kind: 'field',
          id: 'compiled-child',
          path: ['branches', '*', 'label'],
          metadata: {
            display: { label: 'Label', visible: true, readOnly: false },
            scalar: { kind: 'string' },
          },
        };
      },
    };
    const transformer = async (
      compileRuntime: CustomRuntime,
      input: CustomInput,
      config: CustomConfig,
    ): Promise<CustomOutput> => ({
      kind: 'collection',
      id: 'branches',
      path: ['branches'],
      metadata: {
        display: { label: 'Branches', visible: true, readOnly: false },
        identity: { strategy: 'ephemeral' },
      },
      presenter: { id: config.presenter },
      itemTemplate: compileRuntime.compile(input.child),
    });
    const dialect = {
      id: 'flow-condition-dialect',
      classify: (_runtime: CustomRuntime, input: CustomInput, _config: CustomConfig) => ({
        semanticType: `schema.kind.${input.child.kind}`,
      }),
      transformers: {
        'schema.kind.array': transformer,
      },
    } satisfies SchemaEditorDialect<CustomRuntime, CustomInput, CustomConfig, CustomOutput>;

    expect(transformer).toHaveLength(3);
    expectOk(schemaEditor.validateSchemaEditorDialect(dialect));
    await transformer(runtime, { child: { kind: 'scalar', scalar: 'string' } }, { presenter: 'collection.table' });
    expect(calls).toEqual([{ kind: 'scalar', scalar: 'string' }]);

    expect(contract.SCHEMA_EDITOR_RESOLUTION_PRECEDENCE).toEqual([
      'presentation',
      'semantic',
      'format',
      'structural',
      'unsupported',
    ] satisfies typeof SCHEMA_EDITOR_RESOLUTION_PRECEDENCE);

    expectRejected(
      schemaEditor.validateSchemaEditorDialect({
        ...dialect,
        metadata: { resolve: () => 'not static data' },
      }),
      /\$\.metadata\.resolve/,
    );
  });

  it('rejects ad-hoc apply or recursive callbacks as a fourth transformer argument', () => {
    const dialect = {
      id: 'callback-owned-recursion',
      transformers: {
        object: (
          _runtime: unknown,
          _input: unknown,
          _config: unknown,
          compileChild: (input: unknown) => unknown,
        ) => compileChild({ kind: 'scalar', scalar: 'string' }),
      },
    };

    expectRejected(schemaEditor.validateSchemaEditorDialect(dialect), /\$\.transformers\.object/);
  });

  it('rejects alias dialect vocabularies and caller-supplied precedence repetition', () => {
    const processor = (_runtime: unknown, _input: unknown, _config: unknown) => ({});

    for (const invalid of [
      { id: 'alias-classifier', classifier: processor, transformers: {} },
      { id: 'alias-resolver', resolver: processor, transformers: {} },
      { id: 'alias-registry', classify: processor, registry: {} },
      {
        id: 'repeated-precedence',
        classify: processor,
        transformers: {},
        resolutionPrecedence: ['presentation', 'semantic', 'format', 'structural', 'unsupported'],
      },
    ]) {
      expectRejected(
        schemaEditor.validateSchemaEditorDialect(invalid),
        /\$\.classifier|\$\.resolver|\$\.registry|\$\.resolutionPrecedence/,
      );
    }
  });
});

describe('SchemaEditorCommand host-owned edit intent', () => {
  it('accepts the closed structured command family without apply or persistence effects', () => {
    const commands = [
      { kind: 'value.set', target: ['title'], value: 'Approved' },
      { kind: 'collection.insert', target: ['branches'], index: 0, value: { label: 'yes' } },
      { kind: 'collection.remove', target: ['branches'], index: 1 },
      { kind: 'collection.move', target: ['branches'], from: 2, to: 0 },
      { kind: 'map.set', target: ['metadata'], key: 'owner', value: 'finance' },
      { kind: 'map.remove', target: ['metadata'], key: 'owner' },
      { kind: 'map.rename-key', target: ['metadata'], from: 'owner', to: 'reviewer' },
      { kind: 'union.select', target: ['when'], alternativeId: 'nested', initialValue: {} },
    ] satisfies SchemaEditorCommand[];

    for (const command of commands) {
      expectOk(schemaEditor.validateSchemaEditorCommand(command));
      expect(serializableRoundTrip(command)).toEqual(command);
    }
  });

  it('rejects apply callbacks, persistence clients, and mutation writers on commands', () => {
    const baseCommand = { kind: 'value.set', target: ['title'], value: 'Approved' };

    for (const invalid of [
      { ...baseCommand, reason: 'innocent but not part of the closed command contract' },
      { ...baseCommand, apply: () => ({ ok: true }) },
      { ...baseCommand, persistenceClient: { save: () => undefined } },
      { ...baseCommand, xnlMutationWriter: { write: () => undefined } },
    ]) {
      expectRejected(
        schemaEditor.validateSchemaEditorCommand(invalid),
        /\$\.reason|\$\.apply|\$\.persistenceClient|\$\.xnlMutationWriter/,
      );
    }
  });
});

describe('unsupported structure fallback policy', () => {
  it('represents unsupported structures as diagnostics instead of implicit JSON fallback', () => {
    const unsupportedPlan = {
      kind: 'editor-plan',
      id: 'unsupported.plan',
      root: {
        kind: 'custom',
        id: 'opaque',
        path: ['opaque'],
        metadata: { display: { label: 'Opaque', visible: true, readOnly: false } },
        presenter: { id: 'unsupported' },
        diagnostics: [
          {
            severity: 'error',
            code: 'SCHEMA_EDITOR_UNSUPPORTED_STRUCTURE',
            message: 'No presenter or transformer matched schema kind "opaque".',
          },
        ],
      },
      diagnostics: [],
      provenance: { schemaId: 'opaque' },
    } satisfies EditorPlan;
    const implicitJsonFallback = {
      ...unsupportedPlan,
      root: {
        ...unsupportedPlan.root,
        presenter: { id: 'raw.json.textarea' },
        diagnostics: [],
      },
    };
    const explicitRawPresenter = {
      ...unsupportedPlan,
      root: {
        ...unsupportedPlan.root,
        presenter: { id: 'raw.json.textarea', explicit: true, reason: 'presentation' },
        diagnostics: [],
      },
    } satisfies EditorPlan;

    expectOk(schemaEditor.validateEditorPlan(unsupportedPlan));
    expectRejected(schemaEditor.validateEditorPlan(implicitJsonFallback), /\$\.root\.presenter/);
    expectOk(schemaEditor.validateEditorPlan(explicitRawPresenter));
  });
});
