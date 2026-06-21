// @vitest-environment jsdom

import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
  type VNodeChild,
} from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import {
  UnionSelectPresenter,
} from '../src/schema-editor/union/unionSelectPresenter';

const mountedApps: App[] = [];
type EditorPlanNode = SchemaEditorPresenterProps['node'];
type ContractValue = Exclude<
  SchemaEditorPresenterProps['value'],
  undefined
>;

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function unionNode(
  metadata: Readonly<Record<string, unknown>>,
): EditorPlanNode {
  return {
    kind: 'union',
    id: 'channel',
    path: ['channel'],
    metadata: {
      display: {
        label: 'Channel',
        description: 'Delivery channel',
        visible: true,
        readOnly: false,
      },
      ...metadata,
    },
    presenter: { id: 'union.select' },
    alternatives: {},
  } as EditorPlanNode;
}

function presenterProps(
  node: EditorPlanNode,
  value: ContractValue | undefined,
  overrides: Partial<SchemaEditorPresenterProps> = {},
): SchemaEditorPresenterProps {
  return {
    node,
    value,
    path: node.path,
    presenterOptions: undefined,
    pending: false,
    diagnostics: [],
    eventContext: Object.freeze({ wildcardBindings: Object.freeze([]) }),
    onSchemaEditorEvent: () => {},
    ...overrides,
  };
}

function mountUnion(
  props: SchemaEditorPresenterProps,
  slot?: () => VNodeChild,
) {
  const events: SchemaEditorPresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        UnionSelectPresenter,
        {
          ...props,
          onSchemaEditorEvent(event: SchemaEditorPresenterEvent) {
            events.push(structuredClone(event));
          },
        },
        slot ? { default: slot } : undefined,
      );
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return { target, events };
}

async function chooseOption(label: string): Promise<void> {
  const trigger = document.body.querySelector<HTMLElement>(
    '.el-select__wrapper, .el-select',
  );
  expect(trigger, 'Expected a real Element Plus select').not.toBeNull();
  trigger!.click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const option = [...document.body.querySelectorAll<HTMLElement>(
    '.el-select-dropdown__item',
  )].find((candidate) => candidate.textContent?.includes(label));
  expect(option, `Missing union option "${label}"`).not.toBeUndefined();
  option!.click();
  await nextTick();
}

function accepted<T extends ContractValue>(value: T): T {
  return Object.freeze(value);
}

describe('Element Plus Schema Editor union.select T3.3', () => {
  it('preserves ordered descriptors and emits a deep-cloned alternative.select payload', async () => {
    const initialValue = Object.freeze({
      kind: 'advanced',
      retries: 3,
      tags: Object.freeze(['safe']),
    });
    let alternativesReads = 0;
    const node = unionNode({
      discriminator: 'kind',
      alternativeDescriptors: [
        {
          id: 'basic',
          label: 'Basic',
          description: 'Simple delivery',
          initialValue: { kind: 'basic' },
        },
        {
          id: 'advanced',
          label: 'Advanced',
          description: 'Retry-aware delivery',
          initialValue,
        },
      ],
    });
    Object.defineProperty(node, 'alternatives', {
      enumerable: true,
      get() {
        alternativesReads += 1;
        throw new Error('Presenter must not read union alternatives.');
      },
    });
    const value = accepted({ kind: 'basic', title: 'Accepted title' });
    const rendered = mountUnion(
      presenterProps(node, value),
      () => h(
        'span',
        { 'data-slot-alternative': 'basic' },
        'SELECTED_RENDERER_SLOT',
      ),
    );
    await nextTick();

    expect(rendered.target.textContent).toContain('SELECTED_RENDERER_SLOT');
    expect(rendered.target.querySelectorAll('[data-slot-alternative]'))
      .toHaveLength(1);
    expect(rendered.target.querySelector('.el-select')).not.toBeNull();
    expect(alternativesReads).toBe(0);

    const trigger = rendered.target.querySelector<HTMLElement>(
      '.el-select__wrapper, .el-select',
    );
    trigger!.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const options = [...document.body.querySelectorAll<HTMLElement>(
      '.el-select-dropdown__item',
    )];
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'BasicSimple delivery',
      'AdvancedRetry-aware delivery',
    ]);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await chooseOption('Advanced');

    expect(rendered.events).toEqual([{
      event: 'alternative.select',
      payload: {
        alternativeId: 'advanced',
        initialValue: {
          kind: 'advanced',
          retries: 3,
          tags: ['safe'],
        },
      },
    }]);
    expect(rendered.events[0]?.payload).not.toBe(initialValue);
    expect(value).toEqual({ kind: 'basic', title: 'Accepted title' });
    expect(rendered.target.textContent).toContain('SELECTED_RENDERER_SLOT');
  });

  it('uses a string accepted value without a discriminator and omits absent initialValue', async () => {
    const node = unionNode({
      alternativeDescriptors: [
        { id: 'email', label: 'Email' },
        { id: 'sms', label: 'SMS' },
      ],
    });
    const rendered = mountUnion(
      presenterProps(node, 'email'),
      () => h('span', 'EMAIL_SLOT'),
    );
    await nextTick();

    await chooseOption('SMS');

    expect(rendered.events).toEqual([{
      event: 'alternative.select',
      payload: { alternativeId: 'sms' },
    }]);
    expect(rendered.target.textContent).toContain('EMAIL_SLOT');
  });

  it('infers a non-discriminated alternative from the unique initial-value shape', async () => {
    const node = unionNode({
      alternativeDescriptors: [
        { id: 'string', label: 'String', initialValue: '' },
        { id: 'number', label: 'Number', initialValue: 0 },
        { id: 'boolean', label: 'Boolean', initialValue: false },
        { id: 'null', label: 'Null', initialValue: null },
        { id: 'array', label: 'Array', initialValue: [] },
        { id: 'map', label: 'Map', initialValue: {} },
      ],
    });
    const rendered = mountUnion(
      presenterProps(node, accepted({ enabled: true })),
      () => h('span', 'MAP_SLOT'),
    );
    await nextTick();

    expect(rendered.target.textContent).toContain('MAP_SLOT');
    expect(rendered.target.textContent).not.toContain(
      'Accepted union selection is not readable.',
    );

    await chooseOption('Boolean');
    expect(rendered.events).toEqual([{
      event: 'alternative.select',
      payload: {
        alternativeId: 'boolean',
        initialValue: false,
      },
    }]);
  });

  it('fails closed when initial-value shapes cannot identify one alternative', async () => {
    const rendered = mountUnion(presenterProps(unionNode({
      alternativeDescriptors: [
        { id: 'primary', label: 'Primary', initialValue: '' },
        { id: 'secondary', label: 'Secondary', initialValue: 'fallback' },
      ],
    }), 'not-an-alternative-id'));
    await nextTick();

    expect(rendered.target.textContent).toContain(
      'Accepted union selection does not match exactly one alternative.',
    );
    expect(rendered.events).toEqual([]);
  });

  it('fails closed with visible diagnostics for hostile descriptors and unsafe defaults', async () => {
    class RuntimeObject {
      readonly send = () => {};
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get() {
        throw new Error('Accessor must not execute.');
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const initialValue of [
      new Date(),
      new RuntimeObject(),
      accessor,
      revoked.proxy,
      cycle,
    ]) {
      const node = unionNode({
        alternativeDescriptors: [{
          id: 'unsafe',
          label: 'Unsafe',
          initialValue,
        }],
      });
      const rendered = mountUnion(presenterProps(node, 'unsafe'));
      await nextTick();

      expect(rendered.target.textContent).toContain(
        'Union alternative descriptors are not readable and contract-serializable.',
      );
      expect(
        rendered.target.querySelector(
          '[data-schema-editor-diagnostic-code="INVALID_UNION_ALTERNATIVE_DESCRIPTORS"]',
        ),
      ).not.toBeNull();
      expect(rendered.target.querySelector<HTMLButtonElement>(
        '.el-select__wrapper, .el-select',
      )?.getAttribute('aria-disabled')).not.toBe('false');
      expect(rendered.events).toEqual([]);
    }

    const hostileDescriptors = Proxy.revocable([], {});
    hostileDescriptors.revoke();
    const hostile = mountUnion(presenterProps(
      unionNode({ alternativeDescriptors: hostileDescriptors.proxy }),
      'unsafe',
    ));
    await nextTick();
    expect(hostile.target.textContent).toContain(
      'Union alternative descriptors are not readable and contract-serializable.',
    );
  });

  it('reports an unknown accepted selection and disables writes while readOnly or pending', async () => {
    const metadata = {
      discriminator: 'kind',
      alternativeDescriptors: [
        { id: 'basic', label: 'Basic', initialValue: { kind: 'basic' } },
      ],
    };
    const unknown = mountUnion(
      presenterProps(unionNode(metadata), accepted({ kind: 'missing' })),
    );
    await nextTick();
    expect(unknown.target.textContent).toContain(
      'Accepted union selection does not match an alternative.',
    );

    const readOnly = mountUnion(presenterProps(
      unionNode({
        ...metadata,
        display: {
          label: 'Read-only channel',
          visible: true,
          readOnly: true,
        },
      }),
      accepted({ kind: 'basic' }),
    ));
    const pending = mountUnion(presenterProps(
      unionNode(metadata),
      accepted({ kind: 'basic' }),
      { pending: true },
    ));
    await nextTick();

    for (const rendered of [unknown, readOnly, pending]) {
      const select = rendered.target.querySelector<HTMLElement>('.el-select');
      expect(select).not.toBeNull();
      select!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await nextTick();
      expect(rendered.events).toEqual([]);
    }
  });

  it('renders no recursive content when the renderer provides no default slot', async () => {
    const rendered = mountUnion(presenterProps(
      unionNode({
        alternativeDescriptors: [{ id: 'basic', label: 'Basic' }],
      }),
      'basic',
    ));
    await nextTick();

    expect(rendered.target.querySelector(
      '[data-schema-editor-role="union-selected-alternative"]',
    )?.childNodes).toHaveLength(0);
    expect(rendered.events).toEqual([]);
  });
});
