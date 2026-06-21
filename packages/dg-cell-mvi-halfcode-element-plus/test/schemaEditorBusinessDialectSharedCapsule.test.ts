// @vitest-environment jsdom

import {
  readFileSync,
} from 'node:fs';
import {
  join,
} from 'node:path';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
  type Component,
} from 'vue';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerDialect,
  type EditorPlanNode,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';

import {
  SHARED_BUSINESS_PROPERTY_IDS,
  createSharedBusinessPropertyCapsule,
  createSharedBusinessPropertyDialect,
  createSharedBusinessPropertyPresenterRegistry,
  type SharedBusinessPropertyCapsule,
  type SharedBusinessPropertyKind,
} from '../demo/schema-editor-business-dialect/sharedCapsule';

const EMPTY = Object.freeze({});
const mountedApps: App[] = [];

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

describe('Schema Editor shared business property capsule T2.1', () => {
  it('creates isolated frozen dialects and registries from three-parameter factories', () => {
    const first = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);
    const second = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);

    expect(createSharedBusinessPropertyCapsule).toHaveLength(3);
    expect(createSharedBusinessPropertyDialect).toHaveLength(3);
    expect(createSharedBusinessPropertyPresenterRegistry).toHaveLength(3);
    expect(first).not.toBe(second);
    expect(first.dialect).not.toBe(second.dialect);
    expect(first.dialect.transformers).not.toBe(second.dialect.transformers);
    expect(first.presenterRegistry).not.toBe(second.presenterRegistry);
    expect(first.presenterRegistry.entries).not.toBe(
      second.presenterRegistry.entries,
    );

    for (const value of [
      first,
      first.dialect,
      first.dialect.transformers,
      first.presenterRegistry,
      first.presenterRegistry.entries,
      first.factories,
      first.capabilities,
      SHARED_BUSINESS_PROPERTY_IDS,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(first.dialect.classify).toHaveLength(3);
    for (const transformer of Object.values(first.dialect.transformers ?? {})) {
      expect(transformer).toHaveLength(3);
    }
  });

  it('reuses shared capability implementations across multiple editor instances', () => {
    const first = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);
    const second = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);
    const firstEditor = createEditor(first.dialect);
    const secondEditor = createEditor(second.dialect);

    expect(first.capabilities).toBe(second.capabilities);
    expect(first.factories).toBe(second.factories);
    expect(first.factories.capsule).toBe(createSharedBusinessPropertyCapsule);
    expect(first.factories.dialect).toBe(createSharedBusinessPropertyDialect);
    expect(first.factories.presenterRegistry).toBe(
      createSharedBusinessPropertyPresenterRegistry,
    );

    for (const kind of [
      'phone',
      'address',
      'entityRef',
      'enum',
    ] as const satisfies readonly SharedBusinessPropertyKind[]) {
      const firstCapability = first.capabilities[kind];
      const secondCapability = second.capabilities[kind];
      const firstResolution = first.presenterRegistry.resolve(
        firstCapability.presenterId,
      );
      const secondResolution = second.presenterRegistry.resolve(
        secondCapability.presenterId,
      );

      expect(firstCapability.transformer).toBe(secondCapability.transformer);
      expect(firstCapability.presenter).toBe(secondCapability.presenter);
      expect(firstEditor.dialect.transformers?.[
        `semantic:${firstCapability.semanticId}`
      ]).toBe(firstCapability.transformer);
      expect(secondEditor.dialect.transformers?.[
        `semantic:${secondCapability.semanticId}`
      ]).toBe(secondCapability.transformer);
      expect(firstResolution.ok && secondResolution.ok).toBe(true);
      if (!firstResolution.ok || !secondResolution.ok) continue;
      expect(firstResolution.adapter).not.toBe(secondResolution.adapter);
      expect(firstResolution.adapter.component).toBe(
        secondResolution.adapter.component,
      );
      expect(firstResolution.adapter.component).toBe(firstCapability.presenter);
    }

    expect(compilePlans(firstEditor)).toEqual(compilePlans(secondEditor));
  });

  it('selects shared transformers and stable presenter ids without bounded-context policy', () => {
    const capsule = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);
    const editor = createEditor(capsule.dialect);
    const plans = compilePlans(editor);

    expect(plans).toEqual({
      phone: {
        presenterId: SHARED_BUSINESS_PROPERTY_IDS.phone.presenter,
        selector: `semantic:${SHARED_BUSINESS_PROPERTY_IDS.phone.semantic}`,
      },
      address: {
        presenterId: SHARED_BUSINESS_PROPERTY_IDS.address.presenter,
        selector: `semantic:${SHARED_BUSINESS_PROPERTY_IDS.address.semantic}`,
      },
      entityRef: {
        presenterId: SHARED_BUSINESS_PROPERTY_IDS.entityRef.presenter,
        selector:
          `semantic:${SHARED_BUSINESS_PROPERTY_IDS.entityRef.semantic}`,
      },
      enum: {
        presenterId: SHARED_BUSINESS_PROPERTY_IDS.enum.presenter,
        selector: `semantic:${SHARED_BUSINESS_PROPERTY_IDS.enum.semantic}`,
      },
    });
  });

  it('emits only normalized value events from toolkit-neutral presenter props', async () => {
    const capsule = createSharedBusinessPropertyCapsule(EMPTY, EMPTY, EMPTY);
    const cases = [
      {
        kind: 'phone' as const,
        initial: '+90 555 000 0000',
        next: '+90 555 000 0001',
        selector: 'input',
        event: 'input',
      },
      {
        kind: 'entityRef' as const,
        initial: 'customer.current',
        next: 'customer.next',
        selector: 'input',
        event: 'input',
      },
      {
        kind: 'enum' as const,
        initial: 'draft',
        next: 'active',
        selector: 'select',
        event: 'change',
      },
    ];

    for (const testCase of cases) {
      const events: SchemaEditorPresenterEvent[] = [];
      const component = resolvePresenter(capsule, testCase.kind);
      const target = mountPresenter(component, presenterProps(
        testCase.kind,
        testCase.initial,
        (event) => events.push(event),
      ));
      const control = target.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(testCase.selector);
      expect(control).not.toBeNull();
      control!.value = testCase.next;
      control!.dispatchEvent(new Event(testCase.event, { bubbles: true }));
      await nextTick();

      expect(events).toEqual([{
        event: 'value.change',
        payload: { value: testCase.next },
      }]);
      expect(Object.isFrozen(events[0])).toBe(true);
      expect(Object.isFrozen(events[0]!.payload)).toBe(true);
    }
  });

  it('keeps the demo capsule package-root composed and free of A/B or host capabilities', () => {
    const root = join(
      process.cwd(),
      'demo',
      'schema-editor-business-dialect',
    );
    const capsuleSource = readFileSync(join(root, 'sharedCapsule.ts'), 'utf8');
    const presenterSource = readFileSync(join(root, 'presenters.ts'), 'utf8');
    const source = `${capsuleSource}\n${presenterSource}`;

    expect(source).not.toMatch(
      /\b(?:BusinessA|BusinessB|businessA|businessB|business-a|business-b)\b/,
    );
    expect(source).not.toMatch(
      /from ['"]dg-cell-mvi-halfcode-[^'"]+\/(?:src|dist)\//,
    );
    expect(capsuleSource).toMatch(
      /from ['"]dg-cell-mvi-halfcode-(?:logic|vue)['"]/,
    );
    expect(presenterSource).toMatch(/\bonSchemaEditorEvent\b/);
    expect(presenterSource).not.toMatch(
      /\b(?:Session|ValueHost|runtime|XNL|VFS|writer)\b/,
    );
  });
});

function createEditor(sharedDialect: EditorCompilerDialect) {
  return createSchemaEditorCompilerRuntime({
    dialects: [
      createDefaultSchemaEditorDialect(),
      sharedDialect,
    ],
  });
}

function compilePlans(
  editor: ReturnType<typeof createEditor>,
): Readonly<Record<SharedBusinessPropertyKind, Readonly<{
  presenterId: string | undefined;
  selector: unknown;
}>>> {
  const definitions: Record<SharedBusinessPropertyKind, StructureSchema> = {
    phone: {
      kind: 'scalar',
      id: 'user.phone',
      scalar: 'string',
      annotations: {
        semanticType: SHARED_BUSINESS_PROPERTY_IDS.phone.semantic,
      },
    },
    address: {
      kind: 'object',
      id: 'user.address',
      annotations: {
        semanticType: SHARED_BUSINESS_PROPERTY_IDS.address.semantic,
      },
      fields: [{
        key: 'street',
        schema: {
          kind: 'scalar',
          id: 'user.address.street',
          scalar: 'string',
        },
      }],
    },
    entityRef: {
      kind: 'ref',
      id: 'user.manager',
      ref: 'entity.user',
      annotations: {
        semanticType: SHARED_BUSINESS_PROPERTY_IDS.entityRef.semantic,
      },
    },
    enum: {
      kind: 'scalar',
      id: 'user.status',
      scalar: 'string',
      enum: ['draft', 'active'],
      annotations: {
        semanticType: SHARED_BUSINESS_PROPERTY_IDS.enum.semantic,
      },
    },
  };

  return Object.freeze(Object.fromEntries(
    (Object.keys(definitions) as SharedBusinessPropertyKind[]).map((kind) => {
      const plan = compileEditorPlan(editor, {
        schema: definitions[kind],
      });
      return [kind, Object.freeze({
        presenterId: plan.root.presenter?.id,
        selector: plan.root.provenance?.selector,
      })];
    }),
  )) as ReturnType<typeof compilePlans>;
}

function resolvePresenter(
  capsule: SharedBusinessPropertyCapsule,
  kind: SharedBusinessPropertyKind,
): Component {
  const resolution = capsule.presenterRegistry.resolve(
    capsule.capabilities[kind].presenterId,
  );
  expect(resolution.ok).toBe(true);
  if (!resolution.ok) throw new Error(resolution.diagnostic.message);
  return resolution.adapter.component;
}

function presenterProps(
  kind: 'phone' | 'entityRef' | 'enum',
  value: string,
  onSchemaEditorEvent:
    (event: SchemaEditorPresenterEvent) => void,
): SchemaEditorPresenterProps {
  const presenterId = SHARED_BUSINESS_PROPERTY_IDS[kind].presenter;
  const metadata: EditorPlanNode['metadata'] = {
    display: {
      label: kind,
      visible: true,
      readOnly: false,
    },
    scalar: {
      kind: 'string',
      ...(kind === 'enum' ? { enum: ['draft', 'active'] } : {}),
    },
  };
  return {
    node: {
      kind: 'field',
      id: `shared.${kind}`,
      path: [kind],
      metadata,
      presenter: { id: presenterId },
    },
    value,
    path: [kind],
    presenterOptions: undefined,
    pending: false,
    diagnostics: Object.freeze([]),
    eventContext: Object.freeze({ wildcardBindings: Object.freeze([]) }),
    onSchemaEditorEvent,
  };
}

function mountPresenter(
  component: Component,
  props: SchemaEditorPresenterProps,
): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup: () => () => h(component, props),
  }));
  app.mount(target);
  mountedApps.push(app);
  return target;
}
