import {
  h,
  type FunctionalComponent,
  type Slots,
  type VNode,
} from 'vue';
import type {
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';

type SharedPresenter = FunctionalComponent<SchemaEditorPresenterProps>;

const PRESENTER_PROP_NAMES = [
  'node',
  'value',
  'path',
  'presenterOptions',
  'pending',
  'diagnostics',
  'eventContext',
  'onSchemaEditorEvent',
];

export const SharedPhonePresenter = defineSharedPresenter(
  'SharedBusinessPhonePresenter',
  (props) => renderInput(props, {
    id: 'business.shared.phone',
    type: 'tel',
    autocomplete: 'tel',
  }),
);

export const SharedAddressPresenter = defineSharedPresenter(
  'SharedBusinessAddressPresenter',
  (props, { slots }) => {
    const state = readState(props);
    if (!state.visible) return null;
    return h(
      'fieldset',
      {
        disabled: state.disabled,
        'data-schema-editor-presenter': 'business.shared.address',
        'aria-busy': String(props.pending),
        'aria-readonly': String(state.readOnly),
      },
      [
        h('legend', state.label),
        ...readDefaultSlot(slots),
      ],
    );
  },
);

export const SharedEntityRefPresenter = defineSharedPresenter(
  'SharedBusinessEntityRefPresenter',
  (props) => renderInput(props, {
    id: 'business.shared.entity-ref',
    type: 'text',
    autocomplete: 'off',
  }),
);

export const SharedEnumPresenter = defineSharedPresenter(
  'SharedBusinessEnumPresenter',
  (props) => {
    const state = readState(props);
    if (!state.visible) return null;
    const value = isScalar(props.value) ? String(props.value) : '';
    return h(
      'label',
      {
        'data-schema-editor-presenter': 'business.shared.enum',
        'aria-busy': String(props.pending),
      },
      [
        h('span', state.label),
        h(
          'select',
          {
            value,
            disabled: state.disabled,
            'aria-label': state.label,
            onChange: (event: Event) => emitControlValue(props, event),
          },
          readEnumValues(props).map((option) => h(
            'option',
            {
              key: scalarKey(option),
              value: String(option),
            },
            String(option),
          )),
        ),
      ],
    );
  },
);

function defineSharedPresenter(
  displayName: string,
  render: SharedPresenter,
): SharedPresenter {
  render.displayName = displayName;
  render.props = PRESENTER_PROP_NAMES;
  return Object.freeze(render);
}

function renderInput(
  props: SchemaEditorPresenterProps,
  config: Readonly<{
    id: string;
    type: 'tel' | 'text';
    autocomplete: string;
  }>,
): VNode | null {
  const state = readState(props);
  if (!state.visible) return null;
  return h(
    'label',
    {
      'data-schema-editor-presenter': config.id,
      'aria-busy': String(props.pending),
    },
    [
      h('span', state.label),
      h('input', {
        type: config.type,
        autocomplete: config.autocomplete,
        value: typeof props.value === 'string' ? props.value : '',
        disabled: state.disabled,
        readOnly: state.readOnly,
        'aria-label': state.label,
        onInput: (event: Event) => emitControlValue(props, event),
      }),
    ],
  );
}

function emitControlValue(
  props: SchemaEditorPresenterProps,
  event: Event,
): void {
  const target = event.target as Readonly<{ value?: unknown }> | null;
  if (typeof target?.value !== 'string') return;
  const normalized: SchemaEditorPresenterEvent = Object.freeze({
    event: 'value.change',
    payload: Object.freeze({ value: target.value }),
  });
  props.onSchemaEditorEvent(normalized);
}

function readState(
  props: SchemaEditorPresenterProps,
): Readonly<{
  label: string;
  visible: boolean;
  readOnly: boolean;
  disabled: boolean;
}> {
  const display = props.node.metadata.display;
  return Object.freeze({
    label: display.label,
    visible: display.visible,
    readOnly: display.readOnly,
    disabled: display.readOnly || props.pending,
  });
}

function readEnumValues(
  props: SchemaEditorPresenterProps,
): readonly SchemaEditorContractValue[] {
  const metadata = props.node.metadata;
  return 'scalar' in metadata
    && metadata.scalar !== undefined
    && Array.isArray(metadata.scalar.enum)
    ? Object.freeze([...metadata.scalar.enum])
    : Object.freeze([]);
}

function readDefaultSlot(slots: Slots): readonly VNode[] {
  return slots.default?.() ?? Object.freeze([]);
}

function isScalar(
  value: SchemaEditorContractValue | undefined,
): value is null | boolean | number | string {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function scalarKey(value: SchemaEditorContractValue): string {
  return `${typeof value}:${String(value)}`;
}
