import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as logic from '../src';
import {
  validateEditorPlan,
  validateSchemaEditorDialect,
  type EditorPlanNode,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';

type EditorCompilerInput = logic.EditorCompilerInput;
type EditorCompilerRuntime = logic.EditorCompilerRuntime;
type EditorCompilerConfig = logic.EditorCompilerConfig;

const api = logic;

function scalarMetadata(input: EditorCompilerInput) {
  const schema = input.schema as Extract<StructureSchema, { kind: 'scalar' }>;
  return {
    display: {
      label: schema.label ?? schema.id ?? schema.kind,
      visible: true,
      readOnly: false,
    },
    scalar: { kind: schema.scalar },
  } as const;
}

function childById(node: EditorPlanNode, id: string): EditorPlanNode {
  if (node.kind !== 'group') throw new Error(`Expected group node while looking for ${id}`);
  const child = node.children.find((candidate) => candidate.id === id);
  if (!child) throw new Error(`Missing child node ${id}`);
  return child;
}

describe('schema-editor compiler public API and runtime ownership', () => {
  it('exposes the compiler API while keeping dialect functions on runtime and config serializable', () => {
    expect(api.compileEditorPlan).toBeTypeOf('function');
    expect(api.createSchemaEditorCompilerRuntime).toBeTypeOf('function');
    expect(api.createDefaultSchemaEditorDialect).toBeTypeOf('function');

    const defaultDialect = api.createDefaultSchemaEditorDialect();
    const dialectValidation = validateSchemaEditorDialect(defaultDialect);
    expect(dialectValidation).toEqual({ ok: true, issues: [] });
    expect(Object.values(defaultDialect.transformers ?? {}).every((processor) => processor.length === 3)).toBe(true);

    const runtime = api.createSchemaEditorCompilerRuntime({ dialects: [defaultDialect] });
    const config = { planId: 'profile.editor', diagnostics: true };

    expect(runtime.dialect).toBe(defaultDialect);
    expect(config).not.toHaveProperty('dialect');
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);

    const plan = api.compileEditorPlan(
      runtime,
      { schema: { kind: 'scalar', id: 'title', scalar: 'string' } },
      config,
    );

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan).toMatchObject({
      kind: 'editor-plan',
      id: 'profile.editor',
      root: { kind: 'field', id: 'title', path: [] },
    });
  });
});

describe('schema-editor recursive compilation', () => {
  it('recurses through scalar, object, array, map, union, and ref schemas with presentation overlays and wildcard templates', () => {
    expect(api.compileEditorPlan).toBeTypeOf('function');
    expect(api.createSchemaEditorCompilerRuntime).toBeTypeOf('function');

    const runtime = api.createSchemaEditorCompilerRuntime();
    const schema: StructureSchema = {
      kind: 'object',
      id: 'profile',
      fields: [
        {
          key: 'title',
          schema: { kind: 'scalar', id: 'profile.title', scalar: 'string', annotations: { format: 'email' } },
        },
        {
          key: 'tags',
          schema: {
            kind: 'array',
            id: 'profile.tags',
            item: {
              kind: 'object',
              id: 'profile.tag',
              fields: [{ key: 'label', schema: { kind: 'scalar', id: 'profile.tag.label', scalar: 'string' } }],
            },
          },
        },
        {
          key: 'metadata',
          schema: {
            kind: 'map',
            id: 'profile.metadata',
            key: { kind: 'scalar', scalar: 'string' },
            value: { kind: 'scalar', id: 'profile.metadata.value', scalar: 'string' },
          },
        },
        {
          key: 'status',
          schema: {
            kind: 'union',
            id: 'profile.status',
            alternatives: [
              { id: 'draft', schema: { kind: 'scalar', id: 'profile.status.draft', scalar: 'string' } },
              { id: 'published', schema: { kind: 'ref', id: 'profile.status.published', ref: 'PublishedStatus' } },
            ],
          },
        },
      ],
    };

    const plan = api.compileEditorPlan(runtime, {
      schema,
      presentation: {
        presenter: { id: 'form.section', options: { columns: 2 }, explicit: true },
        children: {
          title: { presenter: { id: 'text.email', explicit: true } },
          tags: {
            presenter: { id: 'tag-list', explicit: true },
            item: { children: { label: { presenter: { id: 'tag-label', explicit: true } } } },
          },
          metadata: {
            presenter: { id: 'key-value-list', explicit: true },
            value: { presenter: { id: 'metadata-value', explicit: true } },
          },
          status: {
            presenter: { id: 'status-switcher', explicit: true },
            alternatives: {
              draft: { presenter: { id: 'draft-status', explicit: true } },
              published: { presenter: { id: 'ref-status', explicit: true } },
            },
          },
        },
      },
    }, { planId: 'profile.editor' });

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root).toMatchObject({
      kind: 'group',
      id: 'profile',
      path: [],
      presenter: { id: 'form.section', options: { columns: 2 }, explicit: true },
      provenance: expect.objectContaining({ schemaId: 'profile' }),
    });

    const title = childById(plan.root, 'profile.title');
    expect(title).toMatchObject({ kind: 'field', path: ['title'], presenter: { id: 'text.email' } });

    const tags = childById(plan.root, 'profile.tags');
    expect(tags).toMatchObject({
      kind: 'collection',
      path: ['tags'],
      itemTemplate: expect.objectContaining({
        kind: 'group',
        path: ['tags', '*'],
      }),
      commandBindings: expect.arrayContaining([
        expect.objectContaining({
          event: 'item.remove',
          commandTemplate: expect.objectContaining({
            kind: 'collection.remove',
            target: { source: 'literal', value: ['tags'] },
            arguments: { index: { source: 'event', path: ['index'] } },
          }),
        }),
        expect.objectContaining({
          event: 'item.move',
          commandTemplate: expect.objectContaining({
            kind: 'collection.move',
            target: { source: 'literal', value: ['tags'] },
            arguments: {
              from: { source: 'event', path: ['fromIndex'] },
              to: { source: 'event', path: ['toIndex'] },
            },
          }),
        }),
      ]),
    });

    const metadata = childById(plan.root, 'profile.metadata');
    expect(metadata).toMatchObject({
      kind: 'map',
      path: ['metadata'],
      valueTemplate: expect.objectContaining({
        kind: 'field',
        path: ['metadata', '*'],
        presenter: { id: 'metadata-value', explicit: true },
      }),
    });

    const status = childById(plan.root, 'profile.status');
    expect(status).toMatchObject({
      kind: 'union',
      path: ['status'],
      alternatives: {
        draft: expect.objectContaining({ kind: 'field', presenter: { id: 'draft-status', explicit: true } }),
        published: expect.objectContaining({
          kind: 'field',
          presenter: { id: 'ref-status', explicit: true },
        }),
      },
    });
  });

  it('routes child recursion through runtime.compile and exposes serializable field context to custom transformers', () => {
    expect(api.compileEditorPlan).toBeTypeOf('function');
    expect(api.createSchemaEditorCompilerRuntime).toBeTypeOf('function');

    const calls: Array<{ runtime: EditorCompilerRuntime; input: EditorCompilerInput; config: EditorCompilerConfig }> = [];
    const structuralObject = (
      runtime: EditorCompilerRuntime,
      input: EditorCompilerInput,
      config: EditorCompilerConfig,
    ): EditorPlanNode => {
      calls.push({ runtime, input, config });
      const objectSchema = input.schema as Extract<StructureSchema, { kind: 'object' }>;
      return {
        kind: 'group',
        id: objectSchema.id ?? 'object',
        path: input.path ?? [],
        metadata: {
          display: {
            label: objectSchema.label ?? objectSchema.id ?? objectSchema.kind,
            visible: true,
            readOnly: false,
          },
        },
        children: objectSchema.fields.map((field) =>
          runtime.compile(
            {
              schema: field.schema,
              presentation: input.presentation?.children?.[field.key],
              path: [...(input.path ?? []), field.key],
              fieldContext: {
                key: field.key,
                required: objectSchema.required?.includes(field.key) ?? false,
                ...(field.label !== undefined ? { label: field.label } : {}),
                ...(field.description !== undefined ? { description: field.description } : {}),
                ...(field.annotations !== undefined ? { annotations: field.annotations } : {}),
              },
            },
            config,
          ),
        ),
      };
    };
    const structuralScalar = (
      runtime: EditorCompilerRuntime,
      input: EditorCompilerInput,
      config: EditorCompilerConfig,
    ): EditorPlanNode => {
      calls.push({ runtime, input, config });
      const scalarSchema = input.schema as Extract<StructureSchema, { kind: 'scalar' }>;
      const fieldContext = input.fieldContext;
      return {
        kind: 'field',
        id: scalarSchema.id ?? 'field',
        path: input.path ?? [],
        metadata: {
          display: {
            label: fieldContext?.label ?? scalarSchema.label ?? scalarSchema.id ?? scalarSchema.kind,
            ...(fieldContext?.description !== undefined
              ? { description: fieldContext.description }
              : {}),
            visible: true,
            readOnly: false,
          },
          ...(fieldContext !== undefined
            ? { field: { key: fieldContext.key, required: fieldContext.required } }
            : {}),
          scalar: { kind: scalarSchema.scalar },
        },
      };
    };

    expect(structuralObject.length).toBe(3);
    expect(structuralScalar.length).toBe(3);

    const runtime = api.createSchemaEditorCompilerRuntime({
      dialects: [{
        id: 'test-object-recursion',
        transformers: {
          'structural:object': structuralObject,
          'structural:scalar': structuralScalar,
        },
      }],
    });

    const plan = api.compileEditorPlan(
      runtime,
      {
        schema: {
          kind: 'object',
          id: 'root',
          fields: [{
            key: 'name',
            label: 'Display name',
            description: 'Public profile name',
            annotations: { semanticType: 'PersonName' },
            schema: { kind: 'scalar', id: 'root.name', scalar: 'string' },
          }],
          required: ['name'],
        },
      },
      { planId: 'root.editor' },
    );

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      runtime,
      input: { schema: expect.objectContaining({ kind: 'object', id: 'root' }), path: undefined },
      config: { planId: 'root.editor' },
    });
    expect(calls[1]?.input.fieldContext).toEqual({
      key: 'name',
      required: true,
      label: 'Display name',
      description: 'Public profile name',
      annotations: { semanticType: 'PersonName' },
    });
    expect(JSON.parse(JSON.stringify(calls[1]?.input.fieldContext))).toEqual(calls[1]?.input.fieldContext);
    expect(childById(plan.root, 'root.name').metadata).toMatchObject({
      display: {
        label: 'Display name',
        description: 'Public profile name',
      },
      field: { key: 'name', required: true },
    });
  });

  it('lets custom transformers propagate anonymous union identity without changing value paths', () => {
    const identityScopes: Array<string[] | undefined> = [];
    const structuralObject = (
      runtime: EditorCompilerRuntime,
      input: EditorCompilerInput,
      config: EditorCompilerConfig,
    ): EditorPlanNode => {
      identityScopes.push(input.identityScope);
      const schema = input.schema as Extract<StructureSchema, { kind: 'object' }>;
      const path = input.path ?? [];
      const identityScope = [...(input.identityScope ?? []), 'custom-object'];
      return {
        kind: 'group',
        id: `custom.${[...(input.identityScope ?? []), ...path].join('.') || 'root'}`,
        path,
        metadata: {
          display: { label: schema.label ?? schema.kind, visible: true, readOnly: false },
        },
        children: schema.fields.map((field) => runtime.compile({
          schema: field.schema,
          path: [...path, field.key],
          identityScope,
          fieldContext: {
            key: field.key,
            required: schema.required?.includes(field.key) ?? false,
          },
        }, config)),
      };
    };
    const runtime = api.createSchemaEditorCompilerRuntime({
      dialects: [
        api.createDefaultSchemaEditorDialect(),
        {
          id: 'test-public-identity-scope',
          transformers: { 'structural:object': structuralObject },
        },
      ],
    });
    const plan = api.compileEditorPlan(runtime, {
      schema: {
        kind: 'union',
        id: 'anonymous-choice',
        alternatives: [
          {
            id: 'text',
            schema: {
              kind: 'object',
              fields: [{ key: 'x', schema: { kind: 'scalar', scalar: 'string' } }],
            },
          },
          {
            id: 'count',
            schema: {
              kind: 'object',
              fields: [{ key: 'x', schema: { kind: 'scalar', scalar: 'number' } }],
            },
          },
        ],
      },
    });

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root.kind).toBe('union');
    if (plan.root.kind !== 'union') throw new Error('Expected union plan');
    expect(plan.root.alternatives.text.path).toEqual([]);
    expect(plan.root.alternatives.count.path).toEqual([]);
    expect(plan.root.alternatives.text.kind).toBe('group');
    expect(plan.root.alternatives.count.kind).toBe('group');
    if (plan.root.alternatives.text.kind !== 'group' || plan.root.alternatives.count.kind !== 'group') {
      throw new Error('Expected custom object alternatives');
    }
    const textChild = plan.root.alternatives.text.children[0];
    const countChild = plan.root.alternatives.count.children[0];
    expect(textChild?.path).toEqual(['x']);
    expect(countChild?.path).toEqual(['x']);
    expect(textChild?.id).not.toBe(countChild?.id);
    expect(identityScopes).toEqual([
      ['alternative', 'text'],
      ['alternative', 'count'],
    ]);
    expect(JSON.parse(JSON.stringify(identityScopes))).toEqual(identityScopes);
  });
});

describe('schema-editor selection and unsupported policy', () => {
  it('uses fixed presenter > semantic > format > structural > unsupported selection and never falls back to implicit raw JSON', () => {
    expect(api.compileEditorPlan).toBeTypeOf('function');
    expect(api.createSchemaEditorCompilerRuntime).toBeTypeOf('function');

    const picked: string[] = [];
    const nodeFor = (selector: string) => (
      _runtime: EditorCompilerRuntime,
      input: EditorCompilerInput,
      _config: EditorCompilerConfig,
    ): EditorPlanNode => {
      picked.push(selector);
      return {
        kind: 'field',
        id: `${selector}.${input.schema.id ?? 'node'}`,
        path: input.path ?? [],
        metadata: scalarMetadata(input),
        presenter: { id: selector, explicit: selector.startsWith('presenter:') },
        provenance: { selector },
      };
    };
    const runtime = api.createSchemaEditorCompilerRuntime({
      dialects: [{
        id: 'selection',
        classify: (_runtime, input, _config) => ({
          semanticType: input.schema.annotations?.semanticType,
          format: input.schema.annotations?.format,
          structuralKind: input.schema.kind,
        }),
        transformers: {
          'presenter:money.input': nodeFor('presenter:money.input'),
          'semantic:Money': nodeFor('semantic:Money'),
          'format:email': nodeFor('format:email'),
          'structural:scalar': nodeFor('structural:scalar'),
        },
      }],
    });

    const money = api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'amount', scalar: 'number', annotations: { semanticType: 'Money', format: 'email' } },
      presentation: { presenter: { id: 'money.input', explicit: true } },
    });
    const semantic = api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'amount2', scalar: 'number', annotations: { semanticType: 'Money', format: 'email' } },
    });
    const format = api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'email', scalar: 'string', annotations: { format: 'email' } },
    });
    const structural = api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'title', scalar: 'string' },
    });
    const unsupported = api.compileEditorPlan(runtime, {
      schema: { kind: 'unknown', id: 'future' } as unknown as StructureSchema,
    });

    expect(money.root.provenance).toMatchObject({ selector: 'presenter:money.input' });
    expect(semantic.root.provenance).toMatchObject({ selector: 'semantic:Money' });
    expect(format.root.provenance).toMatchObject({ selector: 'format:email' });
    expect(format.root).toMatchObject({ kind: 'field', presenter: { id: 'format:email', explicit: false } });
    expect(structural.root.provenance).toMatchObject({ selector: 'structural:scalar' });
    expect(unsupported.root).toMatchObject({
      presenter: { id: 'unsupported' },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: expect.stringContaining('UNSUPPORTED') }),
      ]),
    });
    expect(unsupported.root.presenter?.id).not.toMatch(/raw\.json|raw\.code/);
    expect(picked).toEqual([
      'presenter:money.input',
      'semantic:Money',
      'format:email',
      'structural:scalar',
    ]);
  });

  it('rejects asynchronous transformer output explicitly', () => {
    const runtime = api.createSchemaEditorCompilerRuntime({
      dialects: [{
        id: 'async-transformer',
        transformers: {
          'structural:scalar': async (
            _runtime: EditorCompilerRuntime,
            input: EditorCompilerInput,
            _config: EditorCompilerConfig,
          ) => ({
            kind: 'field',
            id: input.schema.id ?? 'field',
            path: input.path ?? [],
            metadata: scalarMetadata(input),
          }),
        },
      }],
    });

    expect(() => api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'title', scalar: 'string' },
    })).toThrow(/returned a Promise; synchronous compilation is required/);
  });

  it('honors explicit unsupported classification before structural selection', () => {
    let structuralCalls = 0;
    const runtime = api.createSchemaEditorCompilerRuntime({
      dialects: [{
        id: 'explicit-unsupported',
        classify: (_runtime, input, _config) => ({
          unsupported: true,
          structuralKind: input.schema.kind,
        }),
        transformers: {
          'structural:scalar': (_runtime, input, _config) => {
            structuralCalls += 1;
            return {
              kind: 'field',
              id: input.schema.id ?? 'field',
              path: input.path ?? [],
              metadata: scalarMetadata(input),
            };
          },
        },
      }],
    });

    const plan = api.compileEditorPlan(runtime, {
      schema: { kind: 'scalar', id: 'blocked-scalar', scalar: 'string' },
    });

    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(structuralCalls).toBe(0);
    expect(plan.root).toMatchObject({
      presenter: { id: 'unsupported' },
      provenance: { selector: 'unsupported' },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'UNSUPPORTED_CLASSIFICATION',
        }),
      ]),
    });
  });
});

describe('schema-editor compiler dependency boundary', () => {
  it('keeps the compiler capsule free of renderer, Flow, and host writer dependencies', () => {
    const capsuleDir = path.resolve(__dirname, '../src/schema-editor');
    expect(fs.existsSync(capsuleDir)).toBe(true);

    const source = fs
      .readdirSync(capsuleDir, { withFileTypes: true })
      .flatMap((entry) => entry.isFile() && /\.ts$/.test(entry.name) ? [path.join(capsuleDir, entry.name)] : [])
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/renderer|renderers|presenter component|element-plus|vue/i);
    expect(source).not.toMatch(/\bFlow\b|BizProcess|WorkFlow|instant-flow|eager-data-flow/i);
    expect(source).not.toMatch(/\bValueHost\b|hostWriter|applyHost|writeValue|persist|mutation|vfs|xnl/i);
    expect(source).not.toMatch(/\bwindow\.|\bdocument\.|\bfetch\s*\(|\bimport\s*\(/);
  });
});
