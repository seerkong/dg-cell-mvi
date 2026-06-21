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
  type Component,
} from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BooleanPresenter,
  ConstPresenter,
  EnumPresenter,
  NullPresenter,
  NumberPresenter,
  ReferencePresenter,
  TextPresenter,
  UnsupportedPresenter,
} from '../src/schema-editor/scalar/scalarPresenters';

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

function fieldNode(
  id: string,
  presenterId: string,
  scalar: Readonly<Record<string, unknown>>,
  overrides: Partial<EditorPlanNode> = {},
): EditorPlanNode {
  return {
    kind: 'field',
    id,
    path: [id],
    metadata: {
      display: {
        label: id,
        visible: true,
        readOnly: false,
      },
      field: { key: id, required: false },
      scalar,
    },
    presenter: { id: presenterId },
    ...overrides,
  } as EditorPlanNode;
}

function props(
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

function mountPresenter(
  component: Component,
  presenterProps: SchemaEditorPresenterProps,
) {
  const events: SchemaEditorPresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(component, {
        ...presenterProps,
        onSchemaEditorEvent(event: SchemaEditorPresenterEvent) {
          events.push(structuredClone(event));
        },
      });
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return { target, events };
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

async function chooseOption(label: string): Promise<void> {
  const trigger = document.body.querySelector<HTMLElement>(
    '.el-select__wrapper, .el-select',
  );
  expect(trigger).not.toBeNull();
  trigger!.click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const option = [...document.body.querySelectorAll<HTMLElement>(
    '.el-select-dropdown__item',
  )].find((candidate) => candidate.textContent?.trim() === label);
  expect(option).not.toBeUndefined();
  option!.click();
  await nextTick();
}

function emittedValues(
  events: readonly SchemaEditorPresenterEvent[],
): readonly unknown[] {
  return events.map((event) => (
    event.payload as Readonly<{ value?: unknown }>
  ).value);
}

describe('Element Plus Schema Editor scalar/ref presenters T2.2', () => {
  it('emits serializable text and schema.ref values without mutating accepted values', async () => {
    for (const [component, node] of [
      [TextPresenter, fieldNode('name', 'scalar.text', { kind: 'string' })],
      [
        ReferencePresenter,
        {
          kind: 'field',
          id: 'owner',
          path: ['owner'],
          metadata: {
            display: { label: 'owner', visible: true, readOnly: false },
            field: { key: 'owner', required: false },
            ref: 'schema://business/user',
          },
          presenter: { id: 'schema.ref' },
        } as EditorPlanNode,
      ],
    ] as const) {
      const accepted = Object.freeze({ untouched: true });
      const rendered = mountPresenter(
        component,
        props(node, 'before', {
          presenterOptions: Object.freeze({ placeholder: 'Choose a value' }),
        }),
      );
      await nextTick();
      const input = rendered.target.querySelector<HTMLInputElement>(
        '.el-input input',
      );
      expect(input).not.toBeNull();
      expect(input!.value).toBe('before');
      expect(input!.placeholder).toBe('Choose a value');
      await setInput(input!, 'after');
      expect(rendered.events).toEqual([
        { event: 'value.change', payload: { value: 'after' } },
      ]);
      expect(accepted).toEqual({ untouched: true });
    }
  });

  it('enforces number constraints and integer payloads through ElInputNumber', async () => {
    const node = fieldNode(
      'retries',
      'scalar.number',
      { kind: 'integer' },
      {
        metadata: {
          display: {
            label: 'Retries',
            visible: true,
            readOnly: false,
          },
          field: { key: 'retries', required: true },
          scalar: { kind: 'integer' },
          constraints: {
            minimum: 1,
            maximum: 9,
            multipleOf: 1,
          },
        },
      },
    );
    const rendered = mountPresenter(
      NumberPresenter,
      props(node, 3, {
        presenterOptions: Object.freeze({
          min: -100,
          max: 100,
          step: 0.5,
          precision: 4,
        }),
      }),
    );
    await nextTick();
    const input = rendered.target.querySelector<HTMLInputElement>(
      '.el-input-number input',
    );
    expect(input).not.toBeNull();
    expect(input!.getAttribute('aria-valuemin')).toBe('1');
    expect(input!.getAttribute('aria-valuemax')).toBe('9');

    await setInput(input!, '7');
    expect(rendered.events.at(-1)).toEqual({
      event: 'value.change',
      payload: { value: 7 },
    });

    await setInput(input!, '7.5');
    expect(rendered.events.every((event) => {
      const value = (event.payload as { value?: unknown }).value;
      return typeof value === 'number'
        && Number.isFinite(value)
        && Number.isInteger(value);
    })).toBe(true);
  });

  it('rejects values that violate integer and decimal multipleOf constraints', async () => {
    const integerNode = fieldNode(
      'even',
      'scalar.number',
      { kind: 'integer' },
      {
        metadata: {
          display: {
            label: 'Even',
            visible: true,
            readOnly: false,
          },
          field: { key: 'even', required: true },
          scalar: { kind: 'integer' },
          constraints: {
            minimum: 2,
            maximum: 8,
            multipleOf: 2,
          },
        },
      },
    );
    const integerRendered = mountPresenter(
      NumberPresenter,
      props(integerNode, 2),
    );
    await nextTick();
    const integerInput = integerRendered.target.querySelector<HTMLInputElement>(
      '.el-input-number input',
    );
    expect(integerInput).not.toBeNull();

    await setInput(integerInput!, '3');
    expect(integerRendered.events).toEqual([]);
    await setInput(integerInput!, '4');
    expect(emittedValues(integerRendered.events).length).toBeGreaterThan(0);
    expect(emittedValues(integerRendered.events).every((value) => value === 4))
      .toBe(true);

    const decimalNode = fieldNode(
      'ratio',
      'scalar.number',
      { kind: 'number' },
      {
        metadata: {
          display: {
            label: 'Ratio',
            visible: true,
            readOnly: false,
          },
          field: { key: 'ratio', required: false },
          scalar: { kind: 'number' },
          constraints: { multipleOf: 0.1 },
        },
      },
    );
    const decimalRendered = mountPresenter(
      NumberPresenter,
      props(decimalNode, 0.2),
    );
    await nextTick();
    const decimalInput = decimalRendered.target.querySelector<HTMLInputElement>(
      '.el-input-number input',
    );
    expect(decimalInput).not.toBeNull();

    await setInput(decimalInput!, '0.3');
    expect(emittedValues(decimalRendered.events).length).toBeGreaterThan(0);
    expect(emittedValues(decimalRendered.events).every(
      (value) => value === 0.3,
    )).toBe(true);
    const decimalEventCount = decimalRendered.events.length;
    await setInput(decimalInput!, '0.35');
    expect(decimalRendered.events).toHaveLength(decimalEventCount);
  });

  it('ignores hostile or invalid multipleOf without bypassing other numeric constraints', async () => {
    let getterCalls = 0;
    const hostileConstraints = {
      minimum: 1,
      maximum: 9,
    } as Record<string, unknown>;
    Object.defineProperty(hostileConstraints, 'multipleOf', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('multipleOf accessor must not execute');
      },
    });
    const hostileNode = fieldNode(
      'hostile',
      'scalar.number',
      { kind: 'integer' },
      {
        metadata: {
          display: {
            label: 'Hostile',
            visible: true,
            readOnly: false,
          },
          field: { key: 'hostile', required: false },
          scalar: { kind: 'integer' },
          constraints: hostileConstraints as never,
        },
      },
    );
    const hostileRendered = mountPresenter(
      NumberPresenter,
      props(hostileNode, 2),
    );
    await nextTick();
    const hostileInput = hostileRendered.target.querySelector<HTMLInputElement>(
      '.el-input-number input',
    );
    expect(hostileInput).not.toBeNull();
    expect(getterCalls).toBe(0);

    await setInput(hostileInput!, '0');
    await setInput(hostileInput!, '3.5');
    await setInput(hostileInput!, '4');
    expect(emittedValues(hostileRendered.events).length).toBeGreaterThan(0);
    expect(emittedValues(hostileRendered.events).every(
      (value) => typeof value === 'number'
        && Number.isFinite(value)
        && Number.isInteger(value)
        && value >= 1
        && value <= 9,
    )).toBe(true);
    expect(getterCalls).toBe(0);

    const invalidNode = fieldNode(
      'invalid-multiple',
      'scalar.number',
      { kind: 'number' },
      {
        metadata: {
          display: {
            label: 'Invalid multiple',
            visible: true,
            readOnly: false,
          },
          field: { key: 'invalid-multiple', required: false },
          scalar: { kind: 'number' },
          constraints: {
            minimum: 1,
            maximum: 2,
            multipleOf: 0,
          },
        },
      },
    );
    const invalidRendered = mountPresenter(
      NumberPresenter,
      props(invalidNode, 1),
    );
    await nextTick();
    const invalidInput = invalidRendered.target.querySelector<HTMLInputElement>(
      '.el-input-number input',
    );
    expect(invalidInput).not.toBeNull();

    await setInput(invalidInput!, '3');
    await setInput(invalidInput!, '1.5');
    expect(emittedValues(invalidRendered.events).length).toBeGreaterThan(0);
    expect(emittedValues(invalidRendered.events).every(
      (value) => typeof value === 'number'
        && Number.isFinite(value)
        && value >= 1
        && value <= 2,
    )).toBe(true);
  });

  it('emits boolean and preserves enum scalar value types', async () => {
    const booleanNode = fieldNode(
      'enabled',
      'scalar.boolean',
      { kind: 'boolean' },
    );
    const booleanRendered = mountPresenter(
      BooleanPresenter,
      props(booleanNode, false),
    );
    await nextTick();
    const toggle = booleanRendered.target.querySelector<HTMLElement>(
      '.el-switch',
    );
    expect(toggle).not.toBeNull();
    toggle!.click();
    await nextTick();
    expect(booleanRendered.events).toEqual([
      { event: 'value.change', payload: { value: true } },
    ]);

    const enumNode = fieldNode(
      'priority',
      'scalar.enum',
      { kind: 'number', enum: [1, 2, 3] },
    );
    const enumRendered = mountPresenter(
      EnumPresenter,
      props(enumNode, 1),
    );
    await nextTick();
    await chooseOption('2');
    expect(enumRendered.events).toEqual([
      { event: 'value.change', payload: { value: 2 } },
    ]);
    expect(typeof (enumRendered.events[0]!.payload as { value: unknown }).value)
      .toBe('number');
  });

  it('normalizes a null enum option back to the contract scalar', async () => {
    const enumNode = fieldNode(
      'empty-choice',
      'scalar.enum',
      { kind: 'null', enum: [null] },
    );
    const rendered = mountPresenter(
      EnumPresenter,
      props(enumNode, undefined),
    );
    await nextTick();
    await chooseOption('null');

    expect(rendered.events).toEqual([
      { event: 'value.change', payload: { value: null } },
    ]);
  });

  it('disables writable presenters for readOnly or pending state', async () => {
    const readOnlyNode = fieldNode(
      'locked',
      'scalar.text',
      { kind: 'string' },
      {
        metadata: {
          display: {
            label: 'Locked',
            visible: true,
            readOnly: true,
          },
          field: { key: 'locked', required: false },
          scalar: { kind: 'string' },
        },
      },
    );
    const rendered = mountPresenter(
      TextPresenter,
      props(readOnlyNode, 'accepted', { pending: true }),
    );
    await nextTick();
    const input = rendered.target.querySelector<HTMLInputElement>(
      '.el-input input',
    );
    expect(input).not.toBeNull();
    expect(input!.disabled || input!.readOnly).toBe(true);
    await setInput(input!, 'forbidden');
    expect(rendered.events).toEqual([]);
  });

  it('renders null and const as explicit read-only states without write events', async () => {
    const cases = [
      [
        NullPresenter,
        fieldNode('empty', 'scalar.null', { kind: 'null' }),
        null,
        'null',
      ],
      [
        ConstPresenter,
        fieldNode(
          'tenant',
          'scalar.const',
          { kind: 'string', const: 'tenant-a' },
        ),
        'tenant-a',
        'tenant-a',
      ],
    ] as const;

    for (const [component, node, value, expected] of cases) {
      const rendered = mountPresenter(component, props(node, value));
      await nextTick();
      expect(rendered.target.textContent).toContain(expected);
      expect(rendered.target.querySelector('input, textarea, select')).toBeNull();
      expect(rendered.events).toEqual([]);
    }
  });

  it('renders unsupported diagnostics without exposing raw accepted data', async () => {
    const node = {
      kind: 'custom',
      id: 'opaque',
      path: ['opaque'],
      metadata: {
        display: { label: 'Opaque', visible: true, readOnly: false },
      },
      presenter: { id: 'unsupported' },
      diagnostics: [{
        severity: 'error',
        code: 'UNSUPPORTED_SCHEMA_EDITOR',
        message: 'No presenter supports this schema',
      }],
    } as EditorPlanNode;
    const accepted = Object.freeze({ privateValue: 'must-not-render' });
    const rendered = mountPresenter(
      UnsupportedPresenter,
      props(node, accepted, { diagnostics: node.diagnostics ?? [] }),
    );
    await nextTick();

    expect(rendered.target.textContent).toContain(
      'No presenter supports this schema',
    );
    expect(rendered.target.textContent).not.toContain('must-not-render');
    expect(rendered.target.querySelector('.el-alert')).not.toBeNull();
    expect(rendered.target.querySelector(
      'input, textarea, code, [contenteditable="true"]',
    )).toBeNull();
    expect(rendered.events).toEqual([]);
  });
});
