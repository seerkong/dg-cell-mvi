import {
  h,
  type FunctionalComponent,
  type VNode,
} from 'vue';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';

import {
  BUSINESS_DIALECT_PRESENTER_IDS,
} from './fixture';

type BusinessPhonePresenter =
  FunctionalComponent<SchemaEditorPresenterProps>;

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

export const BusinessAPhonePresenter = definePhonePresenter(
  'BusinessAPhonePresenter',
  (props) => renderInput(
    props,
    BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    'business-a-phone-input',
    'tel',
  ),
);

export const BusinessBPhonePresenter = definePhonePresenter(
  'BusinessBPhonePresenter',
  (props) => renderTextarea(
    props,
    BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    'business-b-phone-textarea',
  ),
);

export const BusinessAOverridePhonePresenter = definePhonePresenter(
  'BusinessAOverridePhonePresenter',
  (props) => renderInput(
    props,
    BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    'business-a-phone-override',
    'text',
  ),
);

export const BUSINESS_DIALECT_PHONE_PRESENTER_COMPONENTS = Object.freeze({
  businessA: BusinessAPhonePresenter,
  businessB: BusinessBPhonePresenter,
  businessAOverride: BusinessAOverridePhonePresenter,
});

function definePhonePresenter(
  displayName: string,
  render: BusinessPhonePresenter,
): BusinessPhonePresenter {
  render.displayName = displayName;
  render.props = PRESENTER_PROP_NAMES;
  return Object.freeze(render);
}

function renderInput(
  props: SchemaEditorPresenterProps,
  presenterId: string,
  controlId: string,
  type: 'tel' | 'text',
): VNode | null {
  const state = readState(props);
  if (!state.visible) return null;
  return h(
    'label',
    {
      'data-schema-editor-presenter': presenterId,
      'data-schema-editor-business-control': controlId,
      'aria-busy': String(props.pending),
    },
    [
      h('span', state.label),
      h('input', {
        type,
        value: typeof props.value === 'string' ? props.value : '',
        disabled: state.disabled,
        readOnly: state.readOnly,
        autocomplete: type === 'tel' ? 'tel' : 'off',
        'aria-label': state.label,
        onInput: (event: Event) => emitControlValue(props, event),
      }),
    ],
  );
}

function renderTextarea(
  props: SchemaEditorPresenterProps,
  presenterId: string,
  controlId: string,
): VNode | null {
  const state = readState(props);
  if (!state.visible) return null;
  return h(
    'label',
    {
      'data-schema-editor-presenter': presenterId,
      'data-schema-editor-business-control': controlId,
      'aria-busy': String(props.pending),
    },
    [
      h('span', state.label),
      h('textarea', {
        value: typeof props.value === 'string' ? props.value : '',
        disabled: state.disabled,
        readOnly: state.readOnly,
        rows: 2,
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
