import { createApp, defineComponent, getCurrentInstance, h, isVNode, type VNode } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type EditorPlanDiagnostic,
  type EditorPlanNode,
  type SchemaEditorContractValue,
  type ValuePath,
} from 'dg-cell-mvi-halfcode-contract';
import { createSchemaEditorSession } from 'dg-cell-mvi-halfcode-support';
import {
  createSchemaEditorRendererIdentityProjection,
  createSchemaEditorPresenterRegistry,
  renderSchemaEditorNode,
  type SchemaEditorPresenterEventContext,
  type SchemaEditorPresenterProps,
  type SchemaEditorPresenterRegistry,
  type SchemaEditorRendererIdentityProjection,
} from '../src';

interface ProbeCall {
  readonly presenterId: string;
  readonly node: EditorPlanNode;
  readonly value: SchemaEditorContractValue | undefined;
  readonly path: ValuePath;
  readonly presenterOptions: SchemaEditorPresenterProps['presenterOptions'];
  readonly pending: boolean;
  readonly diagnostics: readonly EditorPlanDiagnostic[];
  readonly eventContext: SchemaEditorPresenterEventContext;
  readonly vueKey: PropertyKey | null;
}

type RendererRuntime = Readonly<{
  presenterRegistry: SchemaEditorPresenterRegistry;
  identityProjection: SchemaEditorRendererIdentityProjection;
}>;

type RenderInput = Readonly<{
  node: EditorPlanNode;
  snapshot: Readonly<{
    value: SchemaEditorContractValue;
    revision: string | number;
  }>;
  wildcardBindings?: readonly (string | number)[];
}>;

type RenderConfig = Readonly<{
  keyPrefix: string;
}>;

type RenderResult =
  | Readonly<{
      ok: true;
      vnode: VNode;
      diagnostics: readonly EditorPlanDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly EditorPlanDiagnostic[];
    }>;

type RenderProcessor = (
  runtime: RendererRuntime,
  input: RenderInput,
  config: RenderConfig,
) => RenderResult;

const renderNode = renderSchemaEditorNode as unknown as RenderProcessor;
const mountedApps: Array<{ unmount(): void }> = [];
let publishedSessionId = 0;

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
});

function display(label: string, extra: Record<string, unknown> = {}) {
  return {
    label,
    visible: true,
    readOnly: false,
    ...extra,
  };
}

function probeComponent(presenterId: string, calls: ProbeCall[]) {
  return defineComponent({
    name: `SchemaEditorProbe_${presenterId.replaceAll('.', '_')}`,
    inheritAttrs: false,
    props: {
      node: { type: Object, required: true },
      value: { required: false },
      path: { type: Array, required: true },
      presenterOptions: { type: Object, required: false },
      pending: { type: Boolean, required: true },
      diagnostics: { type: Array, required: true },
      eventContext: { type: Object, required: true },
      onSchemaEditorEvent: { type: Function, required: true },
    },
    setup(props, { slots }) {
      return () => {
        const node = props.node as EditorPlanNode;
        const path = props.path as ValuePath;
        calls.push({
          presenterId,
          node,
          value: props.value as SchemaEditorContractValue | undefined,
          path: [...path],
          presenterOptions: props.presenterOptions as SchemaEditorPresenterProps['presenterOptions'],
          pending: props.pending,
          diagnostics: props.diagnostics as readonly EditorPlanDiagnostic[],
          eventContext: props.eventContext as SchemaEditorPresenterEventContext,
          vueKey: getCurrentInstance()?.vnode.key ?? null,
        });
        return h(
          'section',
          {
            'data-presenter': presenterId,
            'data-node': node.id,
            'data-path': JSON.stringify(path),
          },
          slots.default?.(),
        );
      };
    },
  });
}

function createProbeRuntime(calls: ProbeCall[]): RendererRuntime {
  const presenterIds = [
    'probe.group',
    'probe.field',
    'probe.collection',
    'probe.map',
    'probe.union',
    'probe.custom',
  ] as const;
  const result = createSchemaEditorPresenterRegistry(
    Object.freeze({}),
    {
      entries: presenterIds.map((id) => ({
        id,
        adapter: Object.freeze({ component: probeComponent(id, calls) }),
      })),
    },
    { duplicate: 'reject' },
  );
  if (!result.ok) throw new Error(`Probe registry failed: ${JSON.stringify(result.diagnostics)}`);
  return Object.freeze({
    presenterRegistry: result.registry,
    identityProjection: createSchemaEditorRendererIdentityProjection(
      Object.freeze({}),
      Object.freeze({}),
      Object.freeze({}),
    ),
  });
}

function mountSuccessful(result: RenderResult): HTMLElement {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Renderer failed: ${JSON.stringify(result.diagnostics)}`);
  expect(isVNode(result.vnode)).toBe(true);
  const target = document.createElement('div');
  const app = createApp({ render: () => result.vnode });
  app.mount(target);
  mountedApps.push(app);
  return target;
}

function render(
  runtime: RendererRuntime,
  node: EditorPlanNode,
  value: SchemaEditorContractValue,
  keyPrefix = 'probe',
): RenderResult {
  return renderNode(
    runtime,
    {
      node,
      snapshot: Object.freeze({ value, revision: 'r1' }),
    },
    { keyPrefix },
  );
}

function publishThroughSession(
  value: SchemaEditorContractValue,
  revision: string,
): SchemaEditorContractValue {
  publishedSessionId += 1;
  const session = createSchemaEditorSession(
    Object.freeze({}),
    {
      initialSnapshot: Object.freeze({ value, revision }),
      valueHost: async (_runtime, input) => ({
        status: 'conflict' as const,
        baseRevision: input.expectedRevision,
      }),
    },
    {
      sessionId: `renderer-test-${publishedSessionId}`,
      valueHostId: 'renderer-test-host',
    },
  );
  const published = session.getState().snapshot.value;
  session.dispose();
  return published;
}

function allNodeKindsPlan(): EditorPlanNode {
  return {
    kind: 'group',
    id: 'profile',
    path: ['profile'],
    metadata: {
      display: display('Profile', {
        description: 'Editable public profile',
        group: 'identity',
      }),
      constraints: { columns: 2 },
    },
    presenter: {
      id: 'probe.group',
      explicit: true,
      options: { layout: 'grid', columns: 2 },
    },
    diagnostics: [{
      severity: 'info',
      code: 'PROFILE_HINT',
      message: 'Profile is renderer-complete.',
      path: ['profile'],
    }],
    children: [
      {
        kind: 'field',
        id: 'profile.name',
        path: ['profile', 'name'],
        metadata: {
          display: display('Name', { description: 'Public name' }),
          field: { key: 'name', required: true },
          constraints: { minLength: 2 },
          scalar: {
            kind: 'string',
            enum: ['Ada', 'Grace'],
            default: 'Ada',
          },
        },
        presenter: {
          id: 'probe.field',
          options: { autocomplete: 'name' },
        },
      },
      {
        kind: 'collection',
        id: 'profile.tags',
        path: ['profile', 'tags'],
        metadata: {
          display: display('Tags'),
          itemDefault: { id: '', label: '' },
          identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        },
        presenter: {
          id: 'probe.collection',
          options: { reorderable: true },
        },
        itemTemplate: {
          kind: 'field',
          id: 'profile.tags.item',
          path: ['profile', 'tags', '*', 'label'],
          metadata: {
            display: display('Tag label'),
            scalar: { kind: 'string' },
          },
          presenter: { id: 'probe.field' },
        },
      },
      {
        kind: 'map',
        id: 'profile.attributes',
        path: ['profile', 'attributes'],
        metadata: {
          display: display('Attributes'),
          key: { scalar: 'string', constraints: { minLength: 1 } },
          valueDefault: '',
        },
        presenter: {
          id: 'probe.map',
          options: { keyLabel: 'Attribute' },
        },
        valueTemplate: {
          kind: 'field',
          id: 'profile.attributes.value',
          path: ['profile', 'attributes', '*'],
          metadata: {
            display: display('Attribute value'),
            scalar: { kind: 'string' },
          },
          presenter: { id: 'probe.field' },
        },
      },
      {
        kind: 'union',
        id: 'profile.status',
        path: ['profile', 'status'],
        metadata: {
          display: display('Status'),
          discriminator: 'kind',
          alternativeDescriptors: [
            { id: 'draft', label: 'Draft', initialValue: { kind: 'draft', note: '' } },
            { id: 'published', label: 'Published', description: 'Visible to everyone' },
          ],
        },
        presenter: {
          id: 'probe.union',
          options: { mode: 'segmented' },
        },
        alternatives: {
          draft: {
            kind: 'field',
            id: 'profile.status.draft',
            path: ['profile', 'status', 'note'],
            metadata: {
              display: display('Draft note'),
              scalar: { kind: 'string' },
            },
            presenter: { id: 'probe.field' },
          },
          published: {
            kind: 'field',
            id: 'profile.status.published',
            path: ['profile', 'status', 'publishedAt'],
            metadata: {
              display: display('Published at'),
              scalar: { kind: 'string' },
            },
            presenter: { id: 'probe.field' },
          },
        },
      },
      {
        kind: 'custom',
        id: 'profile.avatar',
        path: ['profile', 'avatar'],
        metadata: {
          display: display('Avatar'),
          config: { crop: 'square' },
        },
        config: { accept: ['image/png'], maxBytes: 4096 },
        presenter: {
          id: 'probe.custom',
          options: { density: 'compact' },
        },
      },
    ],
  };
}

describe('Schema Editor Vue T2.1 recursive renderer RED', () => {
  it('renders all six node kinds with typed metadata, options, diagnostics, values, and recursive slots', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan = allNodeKindsPlan();
    const value = {
      profile: {
        name: 'Ada',
        tags: [{ id: 'compiler', label: 'Compiler' }],
        attributes: { language: 'TypeScript' },
        status: { kind: 'draft', note: 'Review types' },
        avatar: { assetId: 'avatar-1' },
      },
    };

    const target = mountSuccessful(render(runtime, plan, value));

    expect(target.querySelectorAll('[data-presenter="probe.group"]')).toHaveLength(1);
    expect(target.querySelectorAll('[data-presenter="probe.collection"]')).toHaveLength(1);
    expect(target.querySelectorAll('[data-presenter="probe.map"]')).toHaveLength(1);
    expect(target.querySelectorAll('[data-presenter="probe.union"]')).toHaveLength(1);
    expect(target.querySelectorAll('[data-presenter="probe.custom"]')).toHaveLength(1);
    expect(calls.map((call) => call.node.kind)).toEqual(expect.arrayContaining([
      'group',
      'field',
      'collection',
      'map',
      'union',
      'custom',
    ]));

    const name = calls.find((call) => call.node.id === 'profile.name');
    expect(name).toMatchObject({
      value: 'Ada',
      path: ['profile', 'name'],
      presenterOptions: { autocomplete: 'name' },
      pending: false,
      node: {
        metadata: {
          field: { key: 'name', required: true },
          constraints: { minLength: 2 },
          scalar: { kind: 'string', enum: ['Ada', 'Grace'], default: 'Ada' },
        },
      },
    });
    const root = calls.find((call) => call.node.id === 'profile');
    expect(root).toMatchObject({
      presenterOptions: { layout: 'grid', columns: 2 },
      diagnostics: [expect.objectContaining({ code: 'PROFILE_HINT' })],
    });
    const custom = calls.find((call) => call.node.id === 'profile.avatar');
    expect(custom).toMatchObject({
      value: { assetId: 'avatar-1' },
      presenterOptions: { density: 'compact' },
      node: {
        metadata: { config: { crop: 'square' } },
        config: { accept: ['image/png'], maxBytes: 4096 },
      },
    });
  });

  it('renders the uniquely shape-matched non-discriminated union alternative', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan: EditorPlanNode = {
      kind: 'union',
      id: 'config-value',
      path: ['config', 'enabled'],
      metadata: {
        display: display('Config value'),
        alternativeDescriptors: [
          { id: 'string', label: 'String', initialValue: '' },
          { id: 'boolean', label: 'Boolean', initialValue: false },
          { id: 'array', label: 'Array', initialValue: [] },
          { id: 'map', label: 'Map', initialValue: {} },
        ],
      },
      presenter: { id: 'probe.union' },
      alternatives: {
        string: {
          kind: 'field',
          id: 'config-value.string',
          path: ['config', 'enabled'],
          metadata: {
            display: display('String value'),
            scalar: { kind: 'string' },
          },
          presenter: { id: 'probe.field' },
        },
        boolean: {
          kind: 'field',
          id: 'config-value.boolean',
          path: ['config', 'enabled'],
          metadata: {
            display: display('Boolean value'),
            scalar: { kind: 'boolean' },
          },
          presenter: { id: 'probe.field' },
        },
        array: {
          kind: 'collection',
          id: 'config-value.array',
          path: ['config', 'enabled'],
          metadata: {
            display: display('Array value'),
            identity: { strategy: 'ephemeral' },
          },
          presenter: { id: 'probe.collection' },
          itemTemplate: {
            kind: 'field',
            id: 'config-value.array.item',
            path: ['config', 'enabled', '*'],
            metadata: {
              display: display('Array item'),
              scalar: { kind: 'string' },
            },
            presenter: { id: 'probe.field' },
          },
        },
        map: {
          kind: 'map',
          id: 'config-value.map',
          path: ['config', 'enabled'],
          metadata: {
            display: display('Map value'),
            key: { scalar: 'string' },
          },
          presenter: { id: 'probe.map' },
          valueTemplate: {
            kind: 'field',
            id: 'config-value.map.value',
            path: ['config', 'enabled', '*'],
            metadata: {
              display: display('Map entry'),
              scalar: { kind: 'string' },
            },
            presenter: { id: 'probe.field' },
          },
        },
      },
    };

    mountSuccessful(render(runtime, plan, {
      config: { enabled: true },
    }));

    expect(calls.filter(({ node }) => node.id === 'config-value.boolean'))
      .toHaveLength(1);
    expect(calls.some(({ node }) => node.id === 'config-value.string')).toBe(false);
    expect(calls.some(({ node }) => node.id === 'config-value.array')).toBe(false);
    expect(calls.some(({ node }) => node.id === 'config-value.map')).toBe(false);
  });

  it('looks up own accepted values and binds nested collection/map wildcards outer-to-inner', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    let inheritedGetterReads = 0;
    const inherited = Object.create({
      inheritedOnly: 'must-not-render',
      get inheritedGetter() {
        inheritedGetterReads += 1;
        return 'must-not-read';
      },
    }) as Record<string, SchemaEditorContractValue>;
    Object.defineProperty(inherited, 'rows', {
      enumerable: true,
      configurable: false,
      writable: false,
      value: [{
        id: 'row-a',
        cells: {
          alpha: { label: 'A' },
          beta: { label: 'B' },
        },
      }],
    });

    const plan: EditorPlanNode = {
      kind: 'collection',
      id: 'rows',
      path: ['rows'],
      metadata: {
        display: display('Rows'),
        identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
      },
      presenter: { id: 'probe.collection' },
      itemTemplate: {
        kind: 'map',
        id: 'rows.cells',
        path: ['rows', '*', 'cells'],
        metadata: {
          display: display('Cells'),
          key: { scalar: 'string' },
        },
        presenter: { id: 'probe.map' },
        valueTemplate: {
          kind: 'field',
          id: 'rows.cells.label',
          path: ['rows', '*', 'cells', '*', 'label'],
          metadata: {
            display: display('Cell label'),
            scalar: { kind: 'string' },
          },
          presenter: { id: 'probe.field' },
        },
      },
    };

    mountSuccessful(render(runtime, plan, inherited));

    expect(calls.filter((call) => call.node.id === 'rows.cells.label')).toMatchObject([
      {
        path: ['rows', 0, 'cells', 'alpha', 'label'],
        value: 'A',
        eventContext: { wildcardBindings: [0, 'alpha'] },
      },
      {
        path: ['rows', 0, 'cells', 'beta', 'label'],
        value: 'B',
        eventContext: { wildcardBindings: [0, 'beta'] },
      },
    ]);
    expect(calls.find((call) => call.node.id === 'rows.cells')?.eventContext)
      .toEqual({ wildcardBindings: [0], renderScopeKey: 'probe' });
    expect(inheritedGetterReads).toBe(0);
    expect(calls.some((call) => call.value === 'must-not-render')).toBe(false);
    expect(plan.itemTemplate.kind === 'map' ? plan.itemTemplate.entries : undefined).toBeUndefined();
    expect(plan.children).toBeUndefined();
  });

  it('uses property and map identities directly while ephemeral identities remain stable and renderer-only', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const propertyPlan: EditorPlanNode = {
      kind: 'collection',
      id: 'property-items',
      path: ['propertyItems'],
      metadata: {
        display: display('Property items'),
        identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
      },
      presenter: { id: 'probe.collection' },
      itemTemplate: {
        kind: 'field',
        id: 'property-item',
        path: ['propertyItems', '*', 'label'],
        metadata: { display: display('Label'), scalar: { kind: 'string' } },
        presenter: { id: 'probe.field' },
      },
    };
    const ephemeralPlan: EditorPlanNode = {
      ...propertyPlan,
      id: 'ephemeral-items',
      path: ['ephemeralItems'],
      metadata: {
        display: display('Ephemeral items'),
        identity: { strategy: 'ephemeral' },
      },
      itemTemplate: {
        ...propertyPlan.itemTemplate,
        id: 'ephemeral-item',
        path: ['ephemeralItems', '*', 'label'],
      },
    };
    const mapPlan: EditorPlanNode = {
      kind: 'map',
      id: 'map-items',
      path: ['mapItems'],
      metadata: { display: display('Map items'), key: { scalar: 'string' } },
      presenter: { id: 'probe.map' },
      valueTemplate: {
        kind: 'field',
        id: 'map-item',
        path: ['mapItems', '*'],
        metadata: { display: display('Map value'), scalar: { kind: 'string' } },
        presenter: { id: 'probe.field' },
      },
    };
    const value = {
      propertyItems: [
        { id: 'stable-a', label: 'A' },
        { id: 'stable-b', label: 'B' },
      ],
      ephemeralItems: [{ label: 'E1' }, { label: 'E2' }],
      mapItems: { alpha: 'A', beta: 'B' },
    };

    mountSuccessful(render(runtime, propertyPlan, value, 'property'));
    mountSuccessful(render(runtime, ephemeralPlan, value, 'ephemeral'));
    const firstEphemeralKeys = calls
      .filter((call) => call.node.id === 'ephemeral-item')
      .map((call) => call.vueKey);
    mountSuccessful(render(runtime, ephemeralPlan, value, 'ephemeral'));
    mountSuccessful(render(runtime, mapPlan, value, 'map'));

    expect(calls.filter((call) => call.node.id === 'property-item').map((call) => call.vueKey))
      .toEqual(['stable-a', 'stable-b']);
    expect(calls.filter((call) => call.node.id === 'map-item').map((call) => call.vueKey))
      .toEqual(['alpha', 'beta']);
    expect(firstEphemeralKeys).toHaveLength(2);
    expect(new Set(firstEphemeralKeys).size).toBe(2);
    expect(firstEphemeralKeys.every((key) => key !== null)).toBe(true);
    expect(calls.filter((call) => call.node.id === 'ephemeral-item').slice(2).map((call) => call.vueKey))
      .toEqual(firstEphemeralKeys);
    expect(value.ephemeralItems.every((item) => Object.keys(item).length === 1)).toBe(true);
  });

  it('reconciles duplicate and missing property identities across accepted insert, remove, move, and reorder transitions', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan: EditorPlanNode = {
      kind: 'collection',
      id: 'tasks',
      path: ['tasks'],
      metadata: {
        display: display('Tasks'),
        identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
      },
      presenter: { id: 'probe.collection' },
      itemTemplate: {
        kind: 'field',
        id: 'task',
        path: ['tasks', '*', 'label'],
        metadata: { display: display('Task'), scalar: { kind: 'string' } },
        presenter: { id: 'probe.field' },
      },
    };
    const stable = { id: 'stable', label: 'Stable' };
    const duplicateA = { id: 'duplicate', label: 'Duplicate A' };
    const duplicateB = { id: 'duplicate', label: 'Duplicate B' };
    const missing = { label: 'Missing' };
    const inserted = { label: 'Inserted' };
    const firstAccepted = {
      tasks: [stable, duplicateA, duplicateB, missing],
    };
    const originalOwnKeys = new Map(
      firstAccepted.tasks.map((item) => [item, Reflect.ownKeys(item)]),
    );

    mountSuccessful(render(
      runtime,
      plan,
      publishThroughSession(firstAccepted, 'r1'),
      'transition',
    ));
    const first = new Map(
      calls.splice(0).filter((call) => call.node.id === 'task')
        .map((call) => [call.value, call.vueKey]),
    );

    mountSuccessful(render(
      runtime,
      plan,
      publishThroughSession(
        { tasks: [missing, duplicateB, stable, inserted, duplicateA] },
        'r2',
      ),
      'transition',
    ));
    const second = new Map(
      calls.splice(0).filter((call) => call.node.id === 'task')
        .map((call) => [call.value, call.vueKey]),
    );

    mountSuccessful(render(
      runtime,
      plan,
      publishThroughSession(
        { tasks: [duplicateA, inserted, missing, stable] },
        'r3',
      ),
      'transition',
    ));
    const third = new Map(
      calls.splice(0).filter((call) => call.node.id === 'task')
        .map((call) => [call.value, call.vueKey]),
    );

    expect(first.get('Stable')).toBe('stable');
    expect(second.get('Stable')).toBe('stable');
    expect(third.get('Stable')).toBe('stable');
    expect(second.get('Missing')).toBe(first.get('Missing'));
    expect(second.get('Duplicate A')).toBe(first.get('Duplicate A'));
    expect(second.get('Duplicate B')).toBe(first.get('Duplicate B'));
    expect(third.get('Missing')).toBe(first.get('Missing'));
    expect(third.get('Duplicate A')).toBe('duplicate');
    expect(third.get('Inserted')).toBe(second.get('Inserted'));
    expect(new Set([
      first.get('Duplicate A'),
      first.get('Duplicate B'),
      first.get('Missing'),
      second.get('Inserted'),
    ]).size).toBe(4);

    for (const item of [stable, duplicateA, duplicateB, missing, inserted]) {
      expect(Reflect.ownKeys(item)).toEqual(originalOwnKeys.get(item) ?? ['label']);
      expect(item).not.toHaveProperty('schemaEditorKey');
    }
    expect(runtime).not.toHaveProperty('session');
    expect(runtime).not.toHaveProperty('valueHost');
    expect(plan.kind === 'collection' ? plan.children : undefined).toBeUndefined();
  });

  it('reconciles primitive and structurally equal occurrences across session-cloned revisions', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan: EditorPlanNode = {
      kind: 'collection',
      id: 'values',
      path: ['values'],
      metadata: {
        display: display('Values'),
        identity: { strategy: 'ephemeral' },
      },
      presenter: { id: 'probe.collection' },
      itemTemplate: {
        kind: 'field',
        id: 'value',
        path: ['values', '*'],
        metadata: { display: display('Value'), scalar: { kind: 'string' } },
        presenter: { id: 'probe.field' },
      },
    };
    const renderKeys = (values: SchemaEditorContractValue[], revision: string) => {
      mountSuccessful(render(
        runtime,
        plan,
        publishThroughSession({ values }, revision),
        'occurrences',
      ));
      return calls.splice(0)
        .filter((call) => call.node.id === 'value')
        .map((call) => ({ value: call.value, key: call.vueKey }));
    };

    const first = renderKeys(
      ['alpha', 'same', 'same', 1, true, { label: 'equal' }, { label: 'equal' }],
      'r1',
    );
    const second = renderKeys(
      [true, { label: 'equal' }, 'same', 'alpha', 1, { label: 'equal' }, 'same'],
      'r2',
    );

    const keyFor = (
      entries: readonly Readonly<{ value: SchemaEditorContractValue | undefined; key: PropertyKey | null }>[],
      value: SchemaEditorContractValue,
    ) => entries.find((entry) => Object.is(entry.value, value))?.key;
    const keysForFingerprint = (
      entries: readonly Readonly<{ value: SchemaEditorContractValue | undefined; key: PropertyKey | null }>[],
      predicate: (value: SchemaEditorContractValue | undefined) => boolean,
    ) => entries.filter((entry) => predicate(entry.value)).map((entry) => entry.key);

    expect(keyFor(second, 'alpha')).toBe(keyFor(first, 'alpha'));
    expect(keyFor(second, 1)).toBe(keyFor(first, 1));
    expect(keyFor(second, true)).toBe(keyFor(first, true));
    expect(keysForFingerprint(second, (value) => value === 'same'))
      .toEqual(keysForFingerprint(first, (value) => value === 'same'));
    expect(keysForFingerprint(
      second,
      (value) => typeof value === 'object'
        && value !== null
        && Object.getOwnPropertyDescriptor(value, 'label')?.value === 'equal',
    )).toEqual(keysForFingerprint(
      first,
      (value) => typeof value === 'object'
        && value !== null
        && Object.getOwnPropertyDescriptor(value, 'label')?.value === 'equal',
    ));
  });

  it('keeps typed identity scopes independent when delimiters and path segments would collide', () => {
    const projection = createSchemaEditorRendererIdentityProjection(
      Object.freeze({}),
      Object.freeze({}),
      Object.freeze({}),
    );
    const reconcileKey = (
      keyPrefix: string,
      collectionId: string,
      collectionPath: ValuePath,
      label: string,
    ) => {
      const result = projection.reconcile(
        projection,
        {
          collectionId,
          collectionPath,
          items: [{ label }],
          propertyIdentities: [undefined],
        },
        { keyPrefix },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.keys[0];
    };

    const numericFirst = reconcileKey(
      'scope:with/delimiter',
      'collection',
      [1],
      'numeric',
    );
    const stringFirst = reconcileKey(
      'scope',
      'with/delimiter:collection',
      ['1'],
      'string',
    );
    const numericSecond = reconcileKey(
      'scope:with/delimiter',
      'collection',
      [1],
      'numeric',
    );
    const stringSecond = reconcileKey(
      'scope',
      'with/delimiter:collection',
      ['1'],
      'string',
    );

    expect(numericSecond).toBe(numericFirst);
    expect(stringSecond).toBe(stringFirst);
    expect(stringFirst).not.toBe(numericFirst);
  });

  it('keeps nested collection identity scoped by projected outer keys after outer reorder', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan: EditorPlanNode = {
      kind: 'collection',
      id: 'rows',
      path: ['rows'],
      metadata: {
        display: display('Rows'),
        identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
      },
      presenter: { id: 'probe.collection' },
      itemTemplate: {
        kind: 'collection',
        id: 'row.tags',
        path: ['rows', '*', 'tags'],
        metadata: {
          display: display('Tags'),
          identity: { strategy: 'ephemeral' },
        },
        presenter: { id: 'probe.collection' },
        itemTemplate: {
          kind: 'field',
          id: 'row.tag',
          path: ['rows', '*', 'tags', '*', 'label'],
          metadata: { display: display('Tag'), scalar: { kind: 'string' } },
          presenter: { id: 'probe.field' },
        },
      },
    };
    const renderTags = (rows: SchemaEditorContractValue[], revision: string) => {
      mountSuccessful(render(
        runtime,
        plan,
        publishThroughSession({ rows }, revision),
        'nested',
      ));
      return new Map(
        calls.splice(0)
          .filter((call) => call.node.id === 'row.tag')
          .map((call) => [
            call.value,
            {
              key: call.vueKey,
              eventContext: call.eventContext,
            },
          ]),
      );
    };

    const first = renderTags([
      { id: 'row-a', tags: [{ label: 'A' }, { label: 'B' }] },
      { id: 'row-b', tags: [{ label: 'C' }] },
    ], 'r1');
    const second = renderTags([
      { id: 'row-b', tags: [{ label: 'C' }] },
      { id: 'row-a', tags: [{ label: 'A' }, { label: 'B' }] },
    ], 'r2');

    expect(second.get('A')?.key).toBe(first.get('A')?.key);
    expect(second.get('B')?.key).toBe(first.get('B')?.key);
    expect(second.get('C')?.key).toBe(first.get('C')?.key);
    expect(second.get('A')?.eventContext).toEqual({
      wildcardBindings: [1, 0],
      renderScopeKey: 'nested',
    });
    expect(second.get('C')?.eventContext).toEqual({
      wildcardBindings: [0, 0],
      renderScopeKey: 'nested',
    });
    expect(second.get('A')?.eventContext).not.toHaveProperty('identityBindings');
  });

  it('fails closed on non-contract identity items without invoking hooks or accessors', () => {
    const runtime = createProbeRuntime([]);
    let identityGetterReads = 0;
    const item = Object.defineProperties({}, {
      id: {
        enumerable: true,
        get() {
          identityGetterReads += 1;
          return 'must-not-read';
        },
      },
      label: {
        enumerable: true,
        value: 'Accessor identity',
      },
    }) as SchemaEditorContractValue;
    let coercionReads = 0;
    const hostilePrototype = Object.defineProperties({}, {
      toJSON: {
        get() {
          coercionReads += 1;
          return () => 'must-not-call';
        },
      },
      valueOf: {
        get() {
          coercionReads += 1;
          return () => 'must-not-call';
        },
      },
    });
    class RuntimeItem {
      readonly id = 'runtime-item';
    }
    const invalidItems = [
      item,
      new Date(0),
      new Map([['id', 'map-item']]),
      new Set(['set-item']),
      new RuntimeItem(),
      Object.assign(Object.create(hostilePrototype), { id: 'hostile-prototype' }),
    ];

    for (const invalidItem of invalidItems) {
      expect(() => runtime.identityProjection.reconcile(
        runtime.identityProjection,
        {
          collectionId: 'invalid-runtime-items',
          collectionPath: ['items'],
          items: [invalidItem as SchemaEditorContractValue],
          propertyIdentities: [undefined],
        },
        { keyPrefix: 'hostile' },
      )).not.toThrow();
      expect(runtime.identityProjection.reconcile(
        runtime.identityProjection,
        {
          collectionId: 'invalid-runtime-items',
          collectionPath: ['items'],
          items: [invalidItem as SchemaEditorContractValue],
          propertyIdentities: [undefined],
        },
        { keyPrefix: 'hostile' },
      )).toEqual(expect.objectContaining({
        ok: false,
        code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT',
      }));
    }
    expect(identityGetterReads).toBe(0);
    expect(coercionReads).toBe(0);

    const nullPrototypeRecord = Object.assign(Object.create(null), {
      id: 'null-prototype',
      nested: ['plain', 1, true, null],
    }) as SchemaEditorContractValue;
    expect(runtime.identityProjection.reconcile(
      runtime.identityProjection,
      {
        collectionId: 'valid-contract-items',
        collectionPath: ['items'],
        items: [
          nullPrototypeRecord,
          { id: 'plain-record' },
          ['array-item'],
          'scalar-item',
          1,
          true,
          null,
        ],
        propertyIdentities: ['null', 'plain', 'array', 'string', 'number', 'boolean', 'null-value'],
      },
      { keyPrefix: 'contract' },
    )).toEqual(expect.objectContaining({
      ok: true,
      keys: ['null', 'plain', 'array', 'string', 'number', 'boolean', 'null-value'],
    }));

    const revokedItems = Proxy.revocable([], {});
    revokedItems.revoke();
    expect(() => runtime.identityProjection.reconcile(
      runtime.identityProjection,
      {
        collectionId: 'revoked-items',
        collectionPath: ['items'],
        items: revokedItems.proxy as readonly SchemaEditorContractValue[],
        propertyIdentities: [],
      },
      { keyPrefix: 'hostile' },
    )).not.toThrow();
    expect(runtime.identityProjection.reconcile(
      runtime.identityProjection,
      {
        collectionId: 'revoked-items',
        collectionPath: ['items'],
        items: revokedItems.proxy as readonly SchemaEditorContractValue[],
        propertyIdentities: [],
      },
      { keyPrefix: 'hostile' },
    )).toEqual(expect.objectContaining({
      ok: false,
      code: 'INVALID_SCHEMA_EDITOR_IDENTITY_INPUT',
    }));
  });

  it('does not mutate frozen plan nodes, wildcard templates, or accepted snapshots', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const plan = deepFreeze(allNodeKindsPlan());
    const snapshotValue = deepFreeze({
      profile: {
        name: 'Grace',
        tags: [{ id: 'runtime', label: 'Runtime' }],
        attributes: { language: 'TypeScript' },
        status: { kind: 'draft', note: 'No mutation' },
        avatar: { assetId: 'avatar-2' },
      },
    });
    const planBefore = JSON.stringify(plan);
    const snapshotBefore = JSON.stringify(snapshotValue);
    const tagsTemplate = plan.kind === 'group'
      ? plan.children.find((node) => node.id === 'profile.tags')
      : undefined;

    mountSuccessful(render(runtime, plan, snapshotValue));

    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(snapshotValue)).toBe(snapshotBefore);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(snapshotValue)).toBe(true);
    expect(tagsTemplate?.kind === 'collection' ? tagsTemplate.children : undefined).toBeUndefined();
    expect(tagsTemplate?.kind === 'collection' ? tagsTemplate.itemTemplate.path : undefined)
      .toEqual(['profile', 'tags', '*', 'label']);
  });

  it('fails closed with an observable unknown-presenter diagnostic and no raw or JSON fallback', () => {
    const calls: ProbeCall[] = [];
    const runtime = createProbeRuntime(calls);
    const node: EditorPlanNode = {
      kind: 'field',
      id: 'secret',
      path: ['secret'],
      metadata: {
        display: display('Secret'),
        scalar: { kind: 'string' },
      },
      presenter: { id: 'missing.presenter', explicit: true },
    };

    const result = render(runtime, node, { secret: 'do-not-fallback' });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'UNKNOWN_SCHEMA_EDITOR_PRESENTER',
        path: ['secret'],
      }),
    ]);
    expect(result).not.toHaveProperty('vnode');
    expect(calls).toEqual([]);
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.body.textContent).not.toContain('do-not-fallback');
  });
});

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  return value;
}
