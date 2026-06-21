import { describe, expect, it } from 'vitest';
import {
  validateEditorPlan,
  validateStructureSchema,
  type EditorPlan,
  type EditorPlanNode,
  type StructureSchema,
} from '../src';

const completePlan = {
  kind: 'editor-plan',
  id: 'profile.plan',
  root: {
    kind: 'group',
    id: 'profile',
    path: [],
    metadata: {
      display: {
        label: 'Profile',
        description: 'Editable profile data',
        visible: true,
        readOnly: false,
        group: 'primary',
      },
      constraints: { minProperties: 1 },
    },
    children: [
      {
        kind: 'field',
        id: 'profile.status',
        path: ['status'],
        metadata: {
          display: { label: 'Status', description: 'Publication state', visible: true, readOnly: false },
          field: { key: 'status', required: true },
          constraints: { minLength: 1 },
          scalar: { kind: 'string', enum: ['draft', 'published'], default: 'draft' },
        },
      },
      {
        kind: 'field',
        id: 'profile.tenant',
        path: ['tenant'],
        metadata: {
          display: { label: 'Tenant', visible: true, readOnly: true },
          field: { key: 'tenant', required: true },
          scalar: { kind: 'string', const: 'tenant-a', default: 'tenant-a' },
        },
      },
      {
        kind: 'collection',
        id: 'profile.contacts',
        path: ['contacts'],
        metadata: {
          display: { label: 'Contacts', visible: true, readOnly: false },
          field: { key: 'contacts', required: true },
          constraints: { minItems: 1 },
          itemDefault: { id: 'new-contact', label: '' },
          identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        },
        itemTemplate: {
          kind: 'field',
          id: 'profile.contacts.item',
          path: ['contacts', '*'],
          metadata: {
            display: { label: 'Contact', visible: true, readOnly: false },
            scalar: { kind: 'string', default: '' },
          },
        },
      },
      {
        kind: 'map',
        id: 'profile.attributes',
        path: ['attributes'],
        metadata: {
          display: { label: 'Attributes', visible: true, readOnly: false },
          field: { key: 'attributes', required: false },
          key: { scalar: 'string', constraints: { pattern: '^[a-z][a-z0-9-]*$' } },
          valueDefault: '',
        },
        valueTemplate: {
          kind: 'field',
          id: 'profile.attributes.value',
          path: ['attributes', '*'],
          metadata: {
            display: { label: 'Value', visible: true, readOnly: false },
            scalar: { kind: 'string', default: '' },
          },
        },
      },
      {
        kind: 'union',
        id: 'profile.destination',
        path: ['destination'],
        metadata: {
          display: { label: 'Destination', visible: true, readOnly: false },
          field: { key: 'destination', required: true },
          discriminator: 'kind',
          alternativeDescriptors: [
            {
              id: 'email',
              label: 'Email',
              description: 'Send by email',
              initialValue: { kind: 'email', address: '' },
            },
            {
              id: 'saved',
              label: 'Saved address',
              description: 'Use an existing address',
            },
          ],
        },
        alternatives: {
          email: {
            kind: 'field',
            id: 'profile.destination.email',
            path: ['destination'],
            metadata: {
              display: { label: 'Email', visible: true, readOnly: false },
              scalar: { kind: 'string', default: '' },
            },
          },
          saved: {
            kind: 'field',
            id: 'profile.destination.saved',
            path: ['destination'],
            metadata: {
              display: { label: 'Saved address', visible: true, readOnly: false },
              ref: 'schema://address.saved',
            },
          },
        },
      },
      {
        kind: 'field',
        id: 'profile.manager',
        path: ['manager'],
        metadata: {
          display: { label: 'Manager', visible: true, readOnly: false },
          field: { key: 'manager', required: false },
          ref: 'schema://person.summary',
        },
      },
    ],
  },
} satisfies EditorPlan;

function planWithRoot(root: EditorPlanNode): EditorPlan {
  return { kind: 'editor-plan', id: `missing.${root.kind}`, root };
}

describe('schema-editor plan metadata contract feedback', () => {
  it('accepts complete typed facts as serializable contract data', () => {
    expect(validateEditorPlan(completePlan)).toEqual({ ok: true, issues: [] });
    expect(JSON.parse(JSON.stringify(completePlan))).toEqual(completePlan);
  });

  it.each([
    ['group', { kind: 'group', id: 'group', path: [], children: [] }],
    ['field', { kind: 'field', id: 'field', path: ['field'] }],
    [
      'collection',
      {
        kind: 'collection',
        id: 'collection',
        path: ['collection'],
        itemTemplate: { kind: 'field', id: 'collection.item', path: ['collection', '*'] },
      },
    ],
    [
      'map',
      {
        kind: 'map',
        id: 'map',
        path: ['map'],
        valueTemplate: { kind: 'field', id: 'map.value', path: ['map', '*'] },
      },
    ],
    [
      'union',
      {
        kind: 'union',
        id: 'union',
        path: ['union'],
        alternatives: { one: { kind: 'field', id: 'union.one', path: ['union'] } },
      },
    ],
    ['custom', { kind: 'custom', id: 'custom', path: [] }],
  ] satisfies Array<[string, unknown]>)('rejects a %s node that omits its typed facts', (_kind, root) => {
    expect(validateEditorPlan({ kind: 'editor-plan', id: `missing.${_kind}`, root }).ok).toBe(false);
  });

  it.each([
    [
      'field facts on a collection',
      {
        kind: 'collection',
        id: 'wrong.collection',
        path: ['items'],
        metadata: { scalar: { kind: 'string' } },
        itemTemplate: completePlan.root.children[0],
      },
    ],
    [
      'empty identity path',
      {
        kind: 'collection',
        id: 'wrong.identity',
        path: ['items'],
        metadata: {
          display: { label: 'Items', visible: true, readOnly: false },
          identity: { strategy: 'property', path: [], fallback: 'ephemeral' },
        },
        itemTemplate: completePlan.root.children[0],
      },
    ],
    [
      'missing map key facts',
      {
        kind: 'map',
        id: 'wrong.map',
        path: ['attributes'],
        metadata: { display: { label: 'Attributes', visible: true, readOnly: false } },
        valueTemplate: completePlan.root.children[0],
      },
    ],
    [
      'duplicate union descriptors',
      {
        kind: 'union',
        id: 'wrong.union',
        path: ['destination'],
        metadata: {
          display: { label: 'Destination', visible: true, readOnly: false },
          alternativeDescriptors: [{ id: 'same' }, { id: 'same' }],
        },
        alternatives: { same: completePlan.root.children[0] },
      },
    ],
    [
      'empty ref identity',
      {
        kind: 'field',
        id: 'wrong.ref',
        path: ['manager'],
        metadata: {
          display: { label: 'Manager', visible: true, readOnly: false },
          ref: '',
        },
      },
    ],
  ] as const)('rejects %s', (_case, root) => {
    expect(validateEditorPlan(planWithRoot(root as unknown as EditorPlanNode)).ok).toBe(false);
  });

  it.each([
    ['factory', { factory: () => ({}) }],
    ['component', { component: { name: 'FieldEditor' } }],
    ['runtime', { runtime: { id: 'session' } }],
    ['writer', { writer: { id: 'mutation' } }],
  ])('rejects %s ownership in plan facts', (_case, invalidFacts) => {
    const invalidPlan = structuredClone(completePlan) as unknown as EditorPlan & {
      root: EditorPlan['root'] & { metadata: Record<string, unknown> };
    };
    Object.assign(invalidPlan.root.metadata, invalidFacts);

    expect(validateEditorPlan(invalidPlan).ok).toBe(false);
  });

  it.each(['callback', 'hostEffect', 'hostWriter', 'valueHost'] as const)(
    'rejects the exact %s ownership field even when its value is serializable',
    (field) => {
      const plan = {
        kind: 'editor-plan',
        id: `ownership.${field}`,
        root: {
          kind: 'custom',
          id: `ownership.${field}.root`,
          path: [],
          metadata: {
            display: { label: 'Ownership boundary', visible: true, readOnly: false },
            config: { [field]: field === 'callback' ? 'host-callback' : { id: field } },
          },
        },
      };

      const result = validateEditorPlan(plan);

      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: `$.root.metadata.config.${field}`,
          code: 'OWNERSHIP_FIELD',
        }),
      );
    },
  );

  it('allows ordinary business host fields without treating the name as ownership', () => {
    const schema = {
      kind: 'object',
      default: { host: 'api.internal.example', nested: { host: 'worker-01' } },
      annotations: { host: 'schema-catalog' },
      fields: [
        { key: 'host', schema: { kind: 'scalar', scalar: 'string', default: 'api.internal.example' } },
      ],
    } satisfies StructureSchema;
    const plan = {
      kind: 'editor-plan',
      id: 'business.host',
      root: {
        kind: 'custom',
        id: 'business.host.root',
        path: [],
        metadata: {
          display: { label: 'Host settings', visible: true, readOnly: false },
          config: { host: 'api.internal.example', nested: { host: 'worker-01' } },
        },
      },
    } satisfies EditorPlan;

    expect(validateStructureSchema(schema)).toEqual({ ok: true, issues: [] });
    expect(validateEditorPlan(plan)).toEqual({ ok: true, issues: [] });
  });

  it('accepts stable unresolved refs and keeps a logical ref cycle finite and opaque', () => {
    const unresolved = {
      kind: 'ref',
      ref: 'schema://catalog/missing-address#summary',
    } satisfies StructureSchema;
    const logicalCycle = {
      kind: 'object',
      id: 'schema://tree/node',
      fields: [
        {
          key: 'parent',
          schema: { kind: 'ref', ref: 'schema://tree/node' },
        },
      ],
    } satisfies StructureSchema;

    expect(validateStructureSchema(unresolved)).toEqual({ ok: true, issues: [] });
    expect(validateStructureSchema(logicalCycle)).toEqual({ ok: true, issues: [] });
    expect(JSON.parse(JSON.stringify(logicalCycle))).toEqual(logicalCycle);
  });

  it.each(['', 'schema ref with spaces', ' schema://leading-space', 'schema://trailing-space '])(
    'rejects malformed ref identity %j',
    (ref) => {
      const result = validateStructureSchema({ kind: 'ref', ref });

      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: '$.ref', code: 'INVALID_STABLE_ID' }),
      );
    },
  );

  it('accepts serializable schema defaults and collection identity hints', () => {
    const schema = {
      kind: 'array',
      default: [],
      itemDefault: { id: 'new-contact', label: '' },
      identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
      item: {
        kind: 'object',
        fields: [
          { key: 'id', schema: { kind: 'scalar', scalar: 'string' } },
          { key: 'label', schema: { kind: 'scalar', scalar: 'string', default: '' } },
        ],
        required: ['id'],
      },
    } satisfies StructureSchema;

    expect(validateStructureSchema(schema)).toEqual({ ok: true, issues: [] });
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it.each([
    [
      'factory default',
      { kind: 'scalar', scalar: 'string', default: () => 'generated' },
    ],
    [
      'empty schema identity path',
      {
        kind: 'array',
        identity: { strategy: 'property', path: [], fallback: 'ephemeral' },
        item: { kind: 'scalar', scalar: 'string' },
      },
    ],
  ])('rejects %s', (_case, schema) => {
    expect(validateStructureSchema(schema).ok).toBe(false);
  });
});
