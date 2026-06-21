import { describe, expect, it } from 'vitest';
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
  type EditorPlanDisplayMetadata,
  type EditorPlanNode,
  type EditorPresentation,
  type EditorPresentationOverlay,
  type StructureSchema,
} from '../src';

function createRawDefaultRuntime(): EditorCompilerRuntime {
  const dialect = createDefaultSchemaEditorDialect();
  let runtime: EditorCompilerRuntime;

  runtime = {
    dialect,
    compile(input, config = {}) {
      const selector = `structural:${input.schema.kind}`;
      const transformer = dialect.transformers?.[selector] ?? dialect.transformers?.unsupported;
      if (!transformer) throw new Error(`Missing default transformer for ${selector}`);

      const node = transformer(runtime, input, config);
      if (node instanceof Promise) throw new Error('Raw test runtime requires synchronous transformers.');
      return node;
    },
  };

  return runtime;
}

function compileRawDefault(input: EditorCompilerInput): EditorPlanNode {
  return createRawDefaultRuntime().compile(input);
}

function expectGroup(node: EditorPlanNode): asserts node is Extract<EditorPlanNode, { kind: 'group' }> {
  expect(node.kind).toBe('group');
  if (node.kind !== 'group') throw new Error(`Expected group node, received ${node.kind}.`);
}

function expectCollection(node: EditorPlanNode): asserts node is Extract<EditorPlanNode, { kind: 'collection' }> {
  expect(node.kind).toBe('collection');
  if (node.kind !== 'collection') throw new Error(`Expected collection node, received ${node.kind}.`);
}

function expectMap(node: EditorPlanNode): asserts node is Extract<EditorPlanNode, { kind: 'map' }> {
  expect(node.kind).toBe('map');
  if (node.kind !== 'map') throw new Error(`Expected map node, received ${node.kind}.`);
}

function expectUnion(node: EditorPlanNode): asserts node is Extract<EditorPlanNode, { kind: 'union' }> {
  expect(node.kind).toBe('union');
  if (node.kind !== 'union') throw new Error(`Expected union node, received ${node.kind}.`);
}

describe('schema-editor compiler renderer-complete metadata propagation', () => {
  it('propagates object display facts and field label, description, required, and constraints', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'object',
        id: 'profile',
        label: 'Profile',
        description: 'Editable profile',
        constraints: { minProperties: 1 },
        required: ['name'],
        fields: [{
          key: 'name',
          label: 'Display name',
          description: 'Shown in the header',
          schema: {
            kind: 'scalar',
            id: 'profile.name',
            label: 'Schema name',
            description: 'Schema-level description',
            scalar: 'string',
            constraints: { minLength: 2 },
          },
        }],
      },
      presentation: {
        readOnly: true,
        group: 'profile-section',
        children: {
          name: { visible: false, readOnly: true, group: 'identity' },
        },
      },
    });

    expectGroup(root);
    expect(root.metadata).toMatchObject({
      display: {
        label: 'Profile',
        description: 'Editable profile',
        visible: true,
        readOnly: true,
        group: 'profile-section',
      },
      constraints: { minProperties: 1 },
    });
    expect(root.children[0].metadata).toMatchObject({
      display: {
        label: 'Display name',
        description: 'Shown in the header',
        visible: false,
        readOnly: true,
        group: 'identity',
      },
      field: { key: 'name', required: true },
      constraints: { minLength: 2 },
    });
  });

  it('preserves field context when an object field compiles to a group', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'object',
        id: 'profile',
        required: ['address'],
        fields: [{
          key: 'address',
          label: 'Postal address',
          description: 'Primary delivery address',
          schema: {
            kind: 'object',
            constraints: { minProperties: 1 },
            fields: [{ key: 'city', schema: { kind: 'scalar', scalar: 'string' } }],
            required: ['city'],
          },
        }],
      },
    });

    expectGroup(root);
    expectGroup(root.children[0]);
    expect(root.children[0].metadata).toMatchObject({
      display: {
        label: 'Postal address',
        description: 'Primary delivery address',
      },
      field: { key: 'address', required: true },
      constraints: { minProperties: 1 },
    });
  });

  it('propagates scalar enum, const, default, and constraints facts', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'object',
        id: 'release',
        required: ['status'],
        fields: [
          {
            key: 'status',
            schema: {
              kind: 'scalar',
              scalar: 'string',
              enum: ['draft', 'published'],
              default: 'draft',
              constraints: { minLength: 5 },
            },
          },
          {
            key: 'tenant',
            schema: {
              kind: 'scalar',
              scalar: 'string',
              const: 'tenant-a',
              default: 'tenant-a',
            },
          },
        ],
      },
    });

    expectGroup(root);
    expect(root.children[0].metadata).toMatchObject({
      field: { key: 'status', required: true },
      constraints: { minLength: 5 },
      scalar: { kind: 'string', enum: ['draft', 'published'], default: 'draft' },
    });
    expect(root.children[1].metadata).toMatchObject({
      field: { key: 'tenant', required: false },
      scalar: { kind: 'string', const: 'tenant-a', default: 'tenant-a' },
    });
  });

  it('propagates collection item defaults and stable identity hints', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'array',
        id: 'contacts',
        label: 'Contacts',
        itemDefault: { id: 'new-contact', label: '' },
        identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        item: { kind: 'scalar', scalar: 'string' },
      },
    });

    expectCollection(root);
    expect(root.metadata).toMatchObject({
      display: { label: 'Contacts', visible: true, readOnly: false },
      itemDefault: { id: 'new-contact', label: '' },
      identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
    });
  });

  it('propagates map key facts and value defaults', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'map',
        id: 'labels',
        label: 'Labels',
        key: {
          kind: 'scalar',
          scalar: 'string',
          constraints: { pattern: '^[a-z][a-z0-9-]*$' },
        },
        value: { kind: 'scalar', scalar: 'string' },
        valueDefault: '',
      },
    });

    expectMap(root);
    expect(root.metadata).toMatchObject({
      display: { label: 'Labels', visible: true, readOnly: false },
      key: { scalar: 'string', constraints: { pattern: '^[a-z][a-z0-9-]*$' } },
      valueDefault: '',
    });
  });

  it('propagates ordered union descriptors and discriminator facts', () => {
    const root = compileRawDefault({
      schema: {
        kind: 'union',
        id: 'condition',
        label: 'Condition',
        discriminator: 'kind',
        alternatives: [
          {
            id: 'literal',
            label: 'Literal',
            description: 'Compare against a literal value',
            initialValue: { kind: 'literal', value: '' },
            schema: { kind: 'scalar', scalar: 'string' },
          },
          {
            id: 'reference',
            label: 'Reference',
            schema: { kind: 'ref', ref: 'schema://condition-reference' },
          },
        ],
      },
    });

    expectUnion(root);
    expect(root.metadata).toMatchObject({
      display: { label: 'Condition', visible: true, readOnly: false },
      discriminator: 'kind',
      alternativeDescriptors: [
        {
          id: 'literal',
          label: 'Literal',
          description: 'Compare against a literal value',
          initialValue: { kind: 'literal', value: '' },
        },
        { id: 'reference', label: 'Reference' },
      ],
    });
  });

  it('keeps unresolved and cyclic-looking refs as finite opaque metadata', () => {
    const unresolved = compileRawDefault({
      schema: { kind: 'ref', id: 'owner', label: 'Owner', ref: 'schema://missing-owner' },
    });
    const cyclic = compileRawDefault({
      schema: { kind: 'ref', id: 'self', label: 'Self', ref: 'schema://self' },
    });

    expect(unresolved.metadata).toMatchObject({
      display: { label: 'Owner', visible: true, readOnly: false },
      ref: 'schema://missing-owner',
    });
    expect(cyclic.metadata).toMatchObject({
      display: { label: 'Self', visible: true, readOnly: false },
      ref: 'schema://self',
    });
    expect(JSON.stringify(cyclic)).toContain('schema://self');
  });

  it('selects discoverable default presenters for enum and const scalars', () => {
    const enumNode = compileRawDefault({
      schema: { kind: 'scalar', scalar: 'string', enum: ['draft', 'published'] },
    });
    const constNode = compileRawDefault({
      schema: { kind: 'scalar', scalar: 'string', const: 'tenant-a' },
    });

    expect(enumNode.presenter?.id).toBe('scalar.enum');
    expect(constNode.presenter?.id).toBe('scalar.const');
  });

  it('retains one dynamic wildcard template without snapshot expansion', () => {
    const collection = compileRawDefault({
      schema: { kind: 'array', item: { kind: 'scalar', scalar: 'string' } },
    });
    const map = compileRawDefault({
      schema: {
        kind: 'map',
        key: { kind: 'scalar', scalar: 'string' },
        value: { kind: 'scalar', scalar: 'number' },
      },
    });

    expectCollection(collection);
    expectMap(map);
    expect(collection.itemTemplate.path).toEqual(['*']);
    expect(collection.children).toBeUndefined();
    expect(map.valueTemplate.path).toEqual(['*']);
    expect(map.entries).toBeUndefined();
  });
});

interface CapturedTransformerInput {
  path: EditorCompilerInput['path'];
  presentation: EditorPresentationOverlay | undefined;
}

function displayMetadata(input: EditorCompilerInput): EditorPlanDisplayMetadata {
  return {
    label: input.schema.label ?? input.schema.id ?? input.schema.kind,
    visible: typeof input.presentation?.visible === 'boolean' ? input.presentation.visible : true,
    readOnly: typeof input.presentation?.readOnly === 'boolean' ? input.presentation.readOnly : false,
    ...(input.schema.description !== undefined ? { description: input.schema.description } : {}),
    ...(input.presentation?.group !== undefined ? { group: input.presentation.group } : {}),
  };
}

function childOverlay(
  presentation: EditorPresentationOverlay | undefined,
  key: string,
): EditorPresentationOverlay | undefined {
  return presentation?.children?.[key] ?? presentation?.children?.['*'];
}

function createCapturingRuntime(calls: CapturedTransformerInput[]): EditorCompilerRuntime {
  const dialect: EditorCompilerDialect = {
    id: 'test.normalized-presentation-observer',
    transformers: {
      'structural:object': (runtime, input, config) => {
        const schema = input.schema as Extract<StructureSchema, { kind: 'object' }>;
        const path = input.path ?? [];
        return {
          kind: 'group',
          id: schema.id ?? `group.${path.join('.') || 'root'}`,
          path,
          metadata: {
            display: displayMetadata(input),
            ...(schema.constraints !== undefined ? { constraints: schema.constraints } : {}),
          },
          children: schema.fields.map((field) => runtime.compile({
            schema: field.schema,
            presentation: childOverlay(input.presentation, field.key),
            path: [...path, field.key],
          }, config)),
        };
      },
      'structural:array': (runtime, input, config) => {
        const schema = input.schema as Extract<StructureSchema, { kind: 'array' }>;
        const path = input.path ?? [];
        return {
          kind: 'collection',
          id: schema.id ?? `collection.${path.join('.') || 'root'}`,
          path,
          metadata: {
            display: displayMetadata(input),
            identity: schema.identity ?? { strategy: 'ephemeral' },
            ...(schema.itemDefault !== undefined ? { itemDefault: schema.itemDefault } : {}),
          },
          itemTemplate: runtime.compile({
            schema: schema.item,
            presentation: input.presentation?.item ?? input.presentation?.children?.['*'],
            path: [...path, '*'],
          }, config),
        };
      },
      'structural:scalar': (_runtime, input, _config) => {
        const schema = input.schema as Extract<StructureSchema, { kind: 'scalar' }>;
        calls.push({
          path: input.path === undefined ? undefined : [...input.path],
          presentation: input.presentation === undefined
            ? undefined
            : structuredClone(input.presentation),
        });
        return {
          kind: 'field',
          id: schema.id ?? `field.${(input.path ?? []).join('.') || 'root'}`,
          path: input.path ?? [],
          metadata: {
            display: displayMetadata(input),
            scalar: {
              kind: schema.scalar,
              ...(schema.enum !== undefined ? { enum: schema.enum } : {}),
              ...(schema.const !== undefined ? { const: schema.const } : {}),
              ...(schema.default !== undefined ? { default: schema.default } : {}),
            },
          },
          ...(input.presentation?.presenter !== undefined
            ? { presenter: input.presentation.presenter }
            : {}),
        };
      },
    },
  };

  return createSchemaEditorCompilerRuntime({ dialects: [dialect] });
}

function overlayFixture(): EditorPresentation {
  return {
    kind: 'presentation',
    children: {
      rows: {
        item: {
          children: {
            name: {
              group: 'recursive-group',
              visible: true,
              options: {
                recursive: true,
                nested: { keep: 'recursive', winner: 'recursive' },
              },
              presenter: { id: 'recursive.name', options: { source: 'recursive' } },
            },
          },
        },
      },
    },
    overlays: [
      {
        path: ['rows', '*', 'name'],
        overlay: {
          readOnly: true,
          options: {
            pathOne: true,
            nested: { first: true, winner: 'first' },
          },
          presenter: { id: 'path.name.first', options: { source: 'first', keep: 1 } },
        },
      },
      {
        path: ['rows', '*', 'name'],
        overlay: {
          visible: false,
          options: {
            pathTwo: true,
            nested: { second: true, winner: 'later' },
          },
          presenter: { id: 'path.name.later', options: { source: 'later' } },
        },
      },
    ],
  };
}

const overlaySchema: StructureSchema = {
  kind: 'object',
  id: 'root',
  fields: [{
    key: 'rows',
    schema: {
      kind: 'array',
      id: 'rows',
      item: {
        kind: 'object',
        id: 'row',
        fields: [{
          key: 'name',
          schema: { kind: 'scalar', id: 'row.name', scalar: 'string' },
        }],
      },
    },
  }],
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('schema-editor path overlay normalization', () => {
  it('merges recursive and wildcard path overlays before custom transformers with structural later-wins semantics', () => {
    const calls: CapturedTransformerInput[] = [];
    const runtime = createCapturingRuntime(calls);

    compileEditorPlan(runtime, { schema: overlaySchema, presentation: overlayFixture() });

    const nameCall = calls.find((call) => call.path?.join('/') === 'rows/*/name');
    expect(nameCall?.presentation).toEqual({
      group: 'recursive-group',
      visible: false,
      readOnly: true,
      options: {
        recursive: true,
        pathOne: true,
        pathTwo: true,
        nested: {
          keep: 'recursive',
          first: true,
          second: true,
          winner: 'later',
        },
      },
      presenter: { id: 'path.name.later', options: { source: 'later' } },
    });
  });

  it('does not mutate caller presentation and produces deterministic normalized plans', () => {
    const presentation = deepFreeze<EditorPresentation>({
      options: { base: true, nested: { keep: true } },
      presenter: { id: 'base.presenter', options: { stale: true } },
      overlays: [
        {
          path: ['rows', 0, 'name'],
          overlay: {
            readOnly: true,
            options: { exact: true, nested: { exact: true } },
            presenter: { id: 'exact.presenter', options: { exact: true } },
          },
        },
        {
          path: ['rows', '*', 'name'],
          overlay: {
            visible: false,
            options: { wildcard: true, nested: { winner: 'wildcard' } },
            presenter: { id: 'wildcard.presenter' },
          },
        },
      ],
    });
    const before = structuredClone(presentation);
    const firstCalls: CapturedTransformerInput[] = [];
    const secondCalls: CapturedTransformerInput[] = [];
    const input: EditorCompilerInput = {
      schema: { kind: 'scalar', scalar: 'string' },
      presentation,
      path: ['rows', 0, 'name'],
    };

    const first = compileEditorPlan(
      createCapturingRuntime(firstCalls),
      input,
      { planId: 'overlay.editor' } satisfies EditorCompilerConfig,
    );
    const second = compileEditorPlan(
      createCapturingRuntime(secondCalls),
      input,
      { planId: 'overlay.editor' } satisfies EditorCompilerConfig,
    );

    expect(presentation).toEqual(before);
    expect(first).toEqual(second);
    expect(firstCalls).toEqual(secondCalls);
    expect(firstCalls).toEqual([{
      path: ['rows', 0, 'name'],
      presentation: {
        readOnly: true,
        visible: false,
        options: {
          base: true,
          exact: true,
          wildcard: true,
          nested: { keep: true, exact: true, winner: 'wildcard' },
        },
        presenter: { id: 'wildcard.presenter' },
      },
    }]);
  });

});
