// @vitest-environment jsdom

import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import {
  ElColorPicker,
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElTimePicker,
} from 'element-plus';
import {
  type Component,
  type VNode,
} from 'vue';
import { describe, expect, it } from 'vitest';

import {
  COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS,
  resolveCommonScalarFormatPresenter,
  type CommonScalarFormatPresenterId,
} from '../src/schema-editor/scalar/formatPresenters';

type EditorPlanNode = SchemaEditorPresenterProps['node'];

const EXPECTED_FORMAT_IDS = Object.freeze([
  'scalar.email',
  'scalar.password',
  'scalar.textarea',
  'scalar.multiline',
  'scalar.url',
  'scalar.uri',
  'scalar.tel',
  'scalar.phone',
  'scalar.date',
  'scalar.time',
  'scalar.datetime',
  'scalar.date-time',
  'scalar.color',
  'scalar.currency',
] as const satisfies readonly CommonScalarFormatPresenterId[]);

const EXPECTED_CONTROL_TABLE = Object.freeze({
  'scalar.email': ElInput,
  'scalar.password': ElInput,
  'scalar.textarea': ElInput,
  'scalar.multiline': ElInput,
  'scalar.url': ElInput,
  'scalar.uri': ElInput,
  'scalar.tel': ElInput,
  'scalar.phone': ElInput,
  'scalar.date': ElDatePicker,
  'scalar.time': ElTimePicker,
  'scalar.datetime': ElDatePicker,
  'scalar.date-time': ElDatePicker,
  'scalar.color': ElColorPicker,
  'scalar.currency': ElInputNumber,
} as const satisfies Readonly<Record<CommonScalarFormatPresenterId, Component>>);

function fieldNode(
  presenterId: CommonScalarFormatPresenterId,
): EditorPlanNode {
  return {
    kind: 'field',
    id: presenterId,
    path: [presenterId],
    metadata: {
      display: {
        label: presenterId,
        visible: true,
        readOnly: false,
      },
      field: { key: presenterId, required: false },
      scalar: {
        kind: presenterId === 'scalar.currency' ? 'number' : 'string',
      },
    },
    presenter: { id: presenterId },
  } as EditorPlanNode;
}

function presenterProps(
  presenterId: CommonScalarFormatPresenterId,
  value: SchemaEditorPresenterProps['value'],
  events: SchemaEditorPresenterEvent[],
  overrides: Partial<SchemaEditorPresenterProps> = {},
): SchemaEditorPresenterProps {
  return {
    node: fieldNode(presenterId),
    value,
    path: [presenterId],
    presenterOptions: undefined,
    pending: false,
    diagnostics: [],
    eventContext: Object.freeze({ wildcardBindings: Object.freeze([]) }),
    onSchemaEditorEvent(event) {
      events.push(structuredClone(event));
    },
    ...overrides,
  };
}

function renderPresenterControl(
  presenterId: CommonScalarFormatPresenterId,
  value: SchemaEditorPresenterProps['value'],
  events: SchemaEditorPresenterEvent[],
  overrides: Partial<SchemaEditorPresenterProps> = {},
): VNode {
  const presenter = resolveCommonScalarFormatPresenter(presenterId);
  expect(presenter).toBeDefined();
  const setup = (presenter as {
    setup?: (
      props: SchemaEditorPresenterProps,
      context: Readonly<Record<string, unknown>>,
    ) => () => VNode;
  }).setup;
  expect(setup).toBeTypeOf('function');
  const render = setup!(
    presenterProps(presenterId, value, events, overrides),
    Object.freeze({}),
  );
  const field = render();
  const formItem = (field.children as VNode[])[0]!;
  const slots = formItem.children as { default: () => VNode[] };
  const shellChildren = slots.default();
  const content = shellChildren.find((child) =>
    child && typeof child === 'object'
      && (child as VNode).props?.class
        ?.includes('__content')) as VNode;
  expect(content).toBeDefined();
  return (content.children as VNode[])[0]!;
}

describe('Element Plus Schema Editor common scalar formats T2.3', () => {
  it('maps every stable format id through an explicit package-internal component table', () => {
    expect(Object.keys(COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS))
      .toEqual(EXPECTED_FORMAT_IDS);

    for (const presenterId of EXPECTED_FORMAT_IDS) {
      const control = renderPresenterControl(presenterId, undefined, []);
      expect(control.type).toBe(EXPECTED_CONTROL_TABLE[presenterId]);
    }

    expect(resolveCommonScalarFormatPresenter('scalar.postal-code'))
      .toBeUndefined();
    expect(resolveCommonScalarFormatPresenter('__proto__')).toBeUndefined();
  });

  it('uses semantic ElInput types, autocomplete values, and textarea rows', () => {
    const expected = {
      'scalar.email': { type: 'email', autocomplete: 'email' },
      'scalar.password': {
        type: 'password',
        autocomplete: 'current-password',
      },
      'scalar.textarea': { type: 'textarea', autocomplete: 'off', rows: 4 },
      'scalar.multiline': { type: 'textarea', autocomplete: 'off', rows: 4 },
      'scalar.url': { type: 'url', autocomplete: 'url' },
      'scalar.uri': { type: 'url', autocomplete: 'url' },
      'scalar.tel': { type: 'tel', autocomplete: 'tel' },
      'scalar.phone': { type: 'tel', autocomplete: 'tel' },
    } as const;

    for (const [presenterId, expectedProps] of Object.entries(expected)) {
      const control = renderPresenterControl(
        presenterId as CommonScalarFormatPresenterId,
        'accepted',
        [],
        {
          presenterOptions: Object.freeze({
            type: 'number',
            autocomplete: 'malicious',
            rows: 0,
            modelValue: 'overridden',
            disabled: false,
            readOnly: false,
            'onUpdate:modelValue': 'overridden',
          }),
        },
      );
      expect(control.props).toMatchObject({
        ...expectedProps,
        modelValue: 'accepted',
      });
      expect(control.props?.disabled).toBe(false);
    }
  });

  it('pins temporal controls to string value formats and accepts only string callbacks', () => {
    const expected = {
      'scalar.date': {
        control: ElDatePicker,
        type: 'date',
        valueFormat: 'YYYY-MM-DD',
      },
      'scalar.time': {
        control: ElTimePicker,
        valueFormat: 'HH:mm:ss',
      },
      'scalar.datetime': {
        control: ElDatePicker,
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ss',
      },
      'scalar.date-time': {
        control: ElDatePicker,
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ss',
      },
    } as const;

    for (const [presenterId, contract] of Object.entries(expected)) {
      const events: SchemaEditorPresenterEvent[] = [];
      const control = renderPresenterControl(
        presenterId as CommonScalarFormatPresenterId,
        '2026-07-17',
        events,
        {
          presenterOptions: Object.freeze({
            valueFormat: 'x',
            modelValue: new Date() as never,
            disabled: false,
            'onUpdate:modelValue': 'overridden',
          }),
        },
      );
      expect(control.type).toBe(contract.control);
      expect(control.props).toMatchObject({
        ...('type' in contract ? { type: contract.type } : {}),
        valueFormat: contract.valueFormat,
        modelValue: '2026-07-17',
      });

      const update = control.props?.['onUpdate:modelValue'] as
        | ((value: unknown) => void)
        | undefined;
      expect(update).toBeTypeOf('function');
      update!(new Date());
      update!(Object.freeze({
        format: () => '2026-07-17',
        toDate: () => new Date(),
      }));
      update!({ toString: () => '2026-07-17' });
      expect(events).toEqual([]);

      update!('2026-07-17');
      expect(events).toEqual([{
        event: 'value.change',
        payload: { value: '2026-07-17' },
      }]);
    }
  });

  it('normalizes color to string and currency to a finite number', () => {
    const colorEvents: SchemaEditorPresenterEvent[] = [];
    const color = renderPresenterControl(
      'scalar.color',
      '#336699',
      colorEvents,
      {
        presenterOptions: Object.freeze({
          modelValue: '#000000',
          disabled: false,
          'onUpdate:modelValue': 'overridden',
        }),
      },
    );
    expect(color.type).toBe(ElColorPicker);
    expect(color.props).toMatchObject({
      modelValue: '#336699',
      disabled: false,
    });
    const updateColor = color.props?.['onUpdate:modelValue'] as
      (value: unknown) => void;
    updateColor({ color: '#ffffff' });
    updateColor('#ffffff');
    expect(colorEvents).toEqual([{
      event: 'value.change',
      payload: { value: '#ffffff' },
    }]);

    const currencyEvents: SchemaEditorPresenterEvent[] = [];
    const currency = renderPresenterControl(
      'scalar.currency',
      12.5,
      currencyEvents,
      {
        presenterOptions: Object.freeze({
          modelValue: 99,
          disabled: false,
          'onUpdate:modelValue': 'overridden',
        }),
      },
    );
    expect(currency.type).toBe(ElInputNumber);
    expect(currency.props).toMatchObject({
      modelValue: 12.5,
      disabled: false,
    });
    const updateCurrency = currency.props?.['onUpdate:modelValue'] as
      (value: unknown) => void;
    updateCurrency(Number.NaN);
    updateCurrency(Number.POSITIVE_INFINITY);
    updateCurrency('13.5');
    updateCurrency(13.5);
    expect(currencyEvents).toEqual([{
      event: 'value.change',
      payload: { value: 13.5 },
    }]);
  });

  it('disables all format writes while readOnly or pending', () => {
    for (const presenterId of EXPECTED_FORMAT_IDS) {
      const events: SchemaEditorPresenterEvent[] = [];
      const readOnlyNode = fieldNode(presenterId);
      const control = renderPresenterControl(
        presenterId,
        presenterId === 'scalar.currency' ? 1 : 'accepted',
        events,
        {
          node: {
            ...readOnlyNode,
            metadata: {
              ...readOnlyNode.metadata,
              display: {
                label: presenterId,
                visible: true,
                readOnly: true,
              },
            },
          } as EditorPlanNode,
          pending: true,
        },
      );
      expect(control.props?.disabled).toBe(true);
      const update = control.props?.['onUpdate:modelValue'] as
        (value: unknown) => void;
      update(presenterId === 'scalar.currency' ? 2 : 'changed');
      expect(events).toEqual([]);
    }
  });
});
