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
  MapEntriesPresenter,
} from '../src/schema-editor/map/mapEntriesPresenter';

const mountedApps: App[] = [];
type EditorPlanNode = SchemaEditorPresenterProps['node'];
type SchemaEditorContractValue = Exclude<
  SchemaEditorPresenterProps['value'],
  undefined
>;

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function mapNode(
  metadata: Readonly<Record<string, unknown>>,
  valueTemplate?: unknown,
): EditorPlanNode {
  return {
    kind: 'map',
    id: 'labels',
    path: ['labels'],
    metadata: {
      display: {
        label: 'Labels',
        description: 'Stable labels by key',
        visible: true,
        readOnly: false,
      },
      key: {
        scalar: 'string',
        constraints: {
          pattern: '^[a-z][a-z0-9-]*$',
          minLength: 2,
          maxLength: 12,
        },
      },
      ...metadata,
    },
    presenter: { id: 'map.entries' },
    ...(valueTemplate === undefined ? {} : { valueTemplate }),
  } as EditorPlanNode;
}

function presenterProps(
  node: EditorPlanNode,
  value: SchemaEditorContractValue | undefined,
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

function mountMap(
  props: SchemaEditorPresenterProps,
  slot?: () => VNodeChild,
) {
  const events: SchemaEditorPresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        MapEntriesPresenter,
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

function action(
  target: HTMLElement,
  actionName: string,
  qualifier = '',
): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>(
    `[data-schema-editor-action="${actionName}"]${qualifier}`,
  );
  expect(button, `Missing ${actionName} control ${qualifier}`).not.toBeNull();
  return button!;
}

function newKeyInput(target: HTMLElement): HTMLInputElement {
  const input = target.querySelector<HTMLInputElement>(
    '[data-schema-editor-role="entry-key-draft"] input, '
      + 'input[data-schema-editor-role="entry-key-draft"]',
  );
  expect(input, 'Missing new entry key input').not.toBeNull();
  return input!;
}

function existingKeyInput(
  target: HTMLElement,
  key: string,
): HTMLInputElement {
  const input = target.querySelector<HTMLInputElement>(
    `[data-schema-editor-role="entry-key"][data-schema-editor-key="${key}"] input, `
      + `input[data-schema-editor-role="entry-key"][data-schema-editor-key="${key}"]`,
  );
  expect(input, `Missing existing key input for ${key}`).not.toBeNull();
  return input!;
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

function freezeContract<T extends SchemaEditorContractValue>(value: T): T {
  Object.freeze(value);
  return value;
}

describe('Element Plus Schema Editor map.entries T3.2', () => {
  it('pairs accepted own-entry order with recursive slots and emits normalized serializable operations', async () => {
    const valueDefault = Object.freeze({
      enabled: true,
      nested: Object.freeze(['initial']),
    });
    const accepted = Object.freeze(Object.defineProperties(
      Object.create(null) as Record<string, SchemaEditorContractValue>,
      {
        beta: {
          value: 'B',
          enumerable: true,
          configurable: false,
          writable: false,
        },
        alpha: {
          value: 'A',
          enumerable: true,
          configurable: false,
          writable: false,
        },
        hidden: {
          value: 'ignored',
          enumerable: false,
          configurable: false,
          writable: false,
        },
      },
    )) as SchemaEditorContractValue;
    let templateReads = 0;
    const node = mapNode({ valueDefault });
    Object.defineProperty(node, 'valueTemplate', {
      enumerable: true,
      get() {
        templateReads += 1;
        throw new Error('Presenter must not read valueTemplate.');
      },
    });
    const rendered = mountMap(
      presenterProps(node, accepted),
      () => [
        h('span', { 'data-slot-entry': 'beta' }, 'Beta recursive value'),
        h('span', { 'data-slot-entry': 'alpha' }, 'Alpha recursive value'),
      ],
    );
    await nextTick();

    const rows = [
      ...rendered.target.querySelectorAll<HTMLElement>(
        '[data-schema-editor-role="map-entry"]',
      ),
    ];
    expect(rows.map((row) => row.dataset.schemaEditorKey)).toEqual([
      'beta',
      'alpha',
    ]);
    expect(rows[0]?.textContent).toContain('Beta recursive value');
    expect(rows[1]?.textContent).toContain('Alpha recursive value');
    expect(rendered.target.textContent).not.toContain('ignored');
    expect(templateReads).toBe(0);

    await setInput(newKeyInput(rendered.target), 'gamma');
    action(rendered.target, 'entry.set').click();
    await setInput(existingKeyInput(rendered.target, 'beta'), 'renamed');
    action(
      rendered.target,
      'entry.rename',
      '[data-schema-editor-key="beta"]',
    ).click();
    action(
      rendered.target,
      'entry.remove',
      '[data-schema-editor-key="alpha"]',
    ).click();
    await nextTick();

    expect(rendered.events).toEqual([
      {
        event: 'entry.set',
        payload: {
          key: 'gamma',
          value: { enabled: true, nested: ['initial'] },
        },
      },
      {
        event: 'entry.rename',
        payload: { fromKey: 'beta', toKey: 'renamed' },
      },
      { event: 'entry.remove', payload: { key: 'alpha' } },
    ]);
    expect(rendered.events[0]?.payload).not.toBe(valueDefault);
    expect(Object.keys(accepted as object)).toEqual(['beta', 'alpha']);
    expect(existingKeyInput(rendered.target, 'beta').value).toBe('renamed');
    expect(rendered.target.querySelectorAll('.el-button .el-icon svg').length)
      .toBeGreaterThanOrEqual(3);
    expect(
      rendered.target.querySelector<HTMLElement>(
        '[data-schema-editor-role="map-entry-toolbar"]',
      )?.style.minHeight,
    ).toBe('32px');
    const add = action(rendered.target, 'entry.set');
    expect(add.getAttribute('aria-label')).toBe('Add entry');
    add.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.body.textContent).toContain('Add entry');
  });

  it('keeps drafts local and disables blank, duplicate, unchanged, and constraint-violating keys with discoverable reasons', async () => {
    const accepted = freezeContract({ alpha: 'A', bravo: 'B' });
    const rendered = mountMap(
      presenterProps(mapNode({ valueDefault: '' }), accepted),
      () => [
        h('span', { 'data-slot-entry': 'alpha' }, 'Alpha'),
        h('span', { 'data-slot-entry': 'bravo' }, 'Bravo'),
      ],
    );
    await nextTick();

    const add = action(rendered.target, 'entry.set');
    expect(add.disabled).toBe(true);
    expect(rendered.target.textContent).not.toContain('Key must not be blank.');

    await setInput(newKeyInput(rendered.target), 'alpha');
    expect(add.disabled).toBe(true);
    expect(rendered.target.textContent).toContain('Key already exists.');

    await setInput(newKeyInput(rendered.target), 'Alpha');
    expect(add.disabled).toBe(true);
    expect(rendered.target.textContent).toContain(
      'Key must match ^[a-z][a-z0-9-]*$.',
    );

    await setInput(newKeyInput(rendered.target), 'abcdefghijklmnop');
    expect(add.disabled).toBe(true);
    expect(rendered.target.textContent).toContain(
      'Key must contain at most 12 characters.',
    );

    await setInput(newKeyInput(rendered.target), '');
    expect(add.disabled).toBe(true);
    expect(rendered.target.textContent).toContain('Key must not be blank.');

    const rename = action(
      rendered.target,
      'entry.rename',
      '[data-schema-editor-key="alpha"]',
    );
    expect(rename.disabled).toBe(true);
    expect(rendered.target.textContent).toContain('Key is unchanged.');

    await setInput(existingKeyInput(rendered.target, 'alpha'), 'bravo');
    expect(rename.disabled).toBe(true);
    expect(rendered.target.textContent).toContain('Key already exists.');
    add.click();
    rename.click();

    expect(rendered.events).toEqual([]);
    expect(accepted).toEqual({ alpha: 'A', bravo: 'B' });
  });

  it('disables every map write while readOnly or pending', async () => {
    const accepted = freezeContract({ alpha: 'A' });
    const readOnlyNode = mapNode({
      valueDefault: '',
      display: {
        label: 'Read only labels',
        visible: true,
        readOnly: true,
      },
    });
    const normalNode = mapNode({ valueDefault: '' });
    const readOnly = mountMap(
      presenterProps(readOnlyNode, accepted),
      () => h('span', 'Alpha'),
    );
    const pending = mountMap(
      presenterProps(normalNode, accepted, { pending: true }),
      () => h('span', 'Alpha'),
    );
    await nextTick();

    for (const rendered of [readOnly, pending]) {
      await setInput(newKeyInput(rendered.target), 'beta');
      await setInput(existingKeyInput(rendered.target, 'alpha'), 'renamed');
      const controls = [
        ...rendered.target.querySelectorAll<
          HTMLButtonElement | HTMLInputElement
        >('button, input'),
      ];
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every((control) => control.disabled)).toBe(true);
      for (const control of controls) control.click();
      expect(rendered.events).toEqual([]);
    }
  });

  it('fails closed for slot mismatch and hostile accepted map, valueDefault, or key constraints', async () => {
    const slotMismatch = mountMap(
      presenterProps(
        mapNode({ valueDefault: '' }),
        freezeContract({ alpha: 'A', beta: 'B' }),
      ),
      () => h('span', { 'data-slot-entry': 'alpha' }, 'Only one slot'),
    );

    const revoked = Proxy.revocable({ alpha: 'A' }, {});
    revoked.revoke();
    const hostileValue = mountMap(
      presenterProps(
        mapNode({ valueDefault: '' }),
        revoked.proxy as unknown as SchemaEditorContractValue,
      ),
    );

    let defaultReads = 0;
    const hostileDefault = {} as Record<string, unknown>;
    Object.defineProperty(hostileDefault, 'secret', {
      enumerable: true,
      get() {
        defaultReads += 1;
        throw new Error('Hostile valueDefault accessor must not execute.');
      },
    });
    const badDefault = mountMap(
      presenterProps(
        mapNode({ valueDefault: hostileDefault }),
        freezeContract({}),
      ),
    );

    let constraintReads = 0;
    const hostileConstraints = {} as Record<string, unknown>;
    Object.defineProperty(hostileConstraints, 'pattern', {
      enumerable: true,
      get() {
        constraintReads += 1;
        throw new Error('Hostile key constraint accessor must not execute.');
      },
    });
    const badConstraints = mountMap(
      presenterProps(
        mapNode({
          valueDefault: '',
          key: { scalar: 'string', constraints: hostileConstraints },
        }),
        freezeContract({}),
      ),
    );
    await nextTick();

    expect(slotMismatch.target.textContent).toContain(
      'Map value slots do not match the accepted entry count.',
    );
    expect(hostileValue.target.textContent).toContain(
      'Map value is not a readable accepted record.',
    );
    expect(badDefault.target.textContent).toContain(
      'Map value default is not contract-serializable.',
    );
    expect(badConstraints.target.textContent).toContain(
      'Map key constraints are not readable.',
    );
    expect(defaultReads).toBe(0);
    expect(constraintReads).toBe(0);

    for (const rendered of [
      slotMismatch,
      hostileValue,
      badDefault,
      badConstraints,
    ]) {
      const buttons = [
        ...rendered.target.querySelectorAll<HTMLButtonElement>(
          '[data-schema-editor-action]',
        ),
      ];
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every((button) => button.disabled)).toBe(true);
      for (const button of buttons) button.click();
      expect(rendered.events).toEqual([]);
    }
  });
});
