import {
  ElColorPicker,
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElTimePicker,
} from 'element-plus';
import {
  defineComponent,
  h,
  type Component,
  type VNodeChild,
} from 'vue';

import {
  isContractScalar,
  readNumberPresenterConstraints,
} from '../shared/presenterFacts';
import {
  readAllowedPresenterOptions,
  readSchemaEditorPresentationState,
  renderSchemaEditorFieldShell,
  schemaEditorPresenterProps,
  type SchemaEditorPresenterComponentProps,
  type SchemaEditorPresentationState,
} from '../shared/presentationShell';

const TEXT_OPTIONS = Object.freeze([
  'placeholder',
  'clearable',
  'maxlength',
  'minlength',
  'showWordLimit',
] as const);
const TEMPORAL_OPTIONS = Object.freeze([
  'placeholder',
  'clearable',
  'editable',
  'format',
] as const);
const COLOR_OPTIONS = Object.freeze([
  'showAlpha',
  'colorFormat',
] as const);
const CURRENCY_OPTIONS = Object.freeze([
  'min',
  'max',
  'step',
  'precision',
  'controls',
  'controlsPosition',
  'placeholder',
] as const);

export type CommonScalarFormatPresenterId =
  | 'scalar.email'
  | 'scalar.password'
  | 'scalar.textarea'
  | 'scalar.multiline'
  | 'scalar.url'
  | 'scalar.uri'
  | 'scalar.tel'
  | 'scalar.phone'
  | 'scalar.date'
  | 'scalar.time'
  | 'scalar.datetime'
  | 'scalar.date-time'
  | 'scalar.color'
  | 'scalar.currency';

interface TextFormatConfig {
  readonly type: 'email' | 'password' | 'textarea' | 'url' | 'tel';
  readonly autocomplete: string;
  readonly rows?: number;
}

interface TemporalFormatConfig {
  readonly component: Component;
  readonly type?: 'date' | 'datetime';
  readonly valueFormat: string;
}

function emitValueChange(
  props: SchemaEditorPresenterComponentProps,
  state: SchemaEditorPresentationState,
  value: unknown,
  accepts: (candidate: unknown) => boolean,
): void {
  if (state.disabled || !accepts(value) || !isContractScalar(value)) return;
  props.onSchemaEditorEvent(Object.freeze({
    event: 'value.change',
    payload: Object.freeze({ value }),
  }));
}

function renderFormatField(
  id: CommonScalarFormatPresenterId,
  state: SchemaEditorPresentationState,
  content: VNodeChild,
): VNodeChild {
  return h(
    'section',
    {
      class: [
        'dg-schema-editor-scalar-format',
        `dg-schema-editor-${id.replace('.', '-')}`,
        state.readOnly && 'is-readonly',
        state.pending && 'is-pending',
      ],
      'data-schema-editor-presenter': id,
      'aria-busy': String(state.pending),
      'aria-readonly': String(state.readOnly),
    },
    [
      renderSchemaEditorFieldShell(state, {
        content,
        className: `dg-schema-editor-${id.replace('.', '-')}__field`,
      }),
    ],
  );
}

function defineFormatPresenter(
  name: string,
  id: CommonScalarFormatPresenterId,
  renderContent: (
    props: SchemaEditorPresenterComponentProps,
    state: SchemaEditorPresentationState,
  ) => VNodeChild,
): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: schemaEditorPresenterProps,
    setup(props) {
      return () => {
        const state = readSchemaEditorPresentationState(props);
        if (!state.visible) return null;
        return renderFormatField(id, state, renderContent(props, state));
      };
    },
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function defineTextFormatPresenter(
  id: CommonScalarFormatPresenterId,
  config: TextFormatConfig,
): Component {
  return defineFormatPresenter(
    `HalfcodeElementPlusSchemaEditor${componentName(id)}`,
    id,
    (props, state) => {
      const options = readAllowedPresenterOptions(
        props.presenterOptions,
        TEXT_OPTIONS,
      );
      return h(ElInput, {
        ...options,
        type: config.type,
        autocomplete: config.autocomplete,
        ...(config.rows === undefined ? {} : { rows: config.rows }),
        modelValue: stringValue(props.value),
        disabled: state.disabled,
        readonly: state.readOnly,
        'onUpdate:modelValue': (value: unknown) => emitValueChange(
          props,
          state,
          value,
          (candidate) => typeof candidate === 'string',
        ),
      });
    },
  );
}

function defineTemporalFormatPresenter(
  id: CommonScalarFormatPresenterId,
  config: TemporalFormatConfig,
): Component {
  return defineFormatPresenter(
    `HalfcodeElementPlusSchemaEditor${componentName(id)}`,
    id,
    (props, state) => {
      const options = readAllowedPresenterOptions(
        props.presenterOptions,
        TEMPORAL_OPTIONS,
      );
      return h(config.component, {
        ...options,
        ...(config.type === undefined ? {} : { type: config.type }),
        valueFormat: config.valueFormat,
        modelValue: stringValue(props.value),
        disabled: state.disabled,
        readonly: state.readOnly,
        'onUpdate:modelValue': (value: unknown) => emitValueChange(
          props,
          state,
          value,
          (candidate) => typeof candidate === 'string',
        ),
      });
    },
  );
}

const EmailPresenter = defineTextFormatPresenter('scalar.email', {
  type: 'email',
  autocomplete: 'email',
});
const PasswordPresenter = defineTextFormatPresenter('scalar.password', {
  type: 'password',
  autocomplete: 'current-password',
});
const TextareaPresenter = defineTextFormatPresenter('scalar.textarea', {
  type: 'textarea',
  autocomplete: 'off',
  rows: 4,
});
const MultilinePresenter = defineTextFormatPresenter('scalar.multiline', {
  type: 'textarea',
  autocomplete: 'off',
  rows: 4,
});
const UrlPresenter = defineTextFormatPresenter('scalar.url', {
  type: 'url',
  autocomplete: 'url',
});
const UriPresenter = defineTextFormatPresenter('scalar.uri', {
  type: 'url',
  autocomplete: 'url',
});
const TelPresenter = defineTextFormatPresenter('scalar.tel', {
  type: 'tel',
  autocomplete: 'tel',
});
const PhonePresenter = defineTextFormatPresenter('scalar.phone', {
  type: 'tel',
  autocomplete: 'tel',
});
const DatePresenter = defineTemporalFormatPresenter('scalar.date', {
  component: ElDatePicker,
  type: 'date',
  valueFormat: 'YYYY-MM-DD',
});
const TimePresenter = defineTemporalFormatPresenter('scalar.time', {
  component: ElTimePicker,
  valueFormat: 'HH:mm:ss',
});
const DatetimePresenter = defineTemporalFormatPresenter('scalar.datetime', {
  component: ElDatePicker,
  type: 'datetime',
  valueFormat: 'YYYY-MM-DDTHH:mm:ss',
});
const DateTimePresenter = defineTemporalFormatPresenter('scalar.date-time', {
  component: ElDatePicker,
  type: 'datetime',
  valueFormat: 'YYYY-MM-DDTHH:mm:ss',
});
const ColorPresenter = defineFormatPresenter(
  'HalfcodeElementPlusSchemaEditorColor',
  'scalar.color',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      COLOR_OPTIONS,
    );
    return h(ElColorPicker, {
      ...options,
      modelValue: stringValue(props.value),
      disabled: state.disabled,
      'onUpdate:modelValue': (value: unknown) => emitValueChange(
        props,
        state,
        value,
        (candidate) => typeof candidate === 'string',
      ),
    });
  },
);
const CurrencyPresenter = defineFormatPresenter(
  'HalfcodeElementPlusSchemaEditorCurrency',
  'scalar.currency',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      CURRENCY_OPTIONS,
    );
    const constraints = readNumberPresenterConstraints(props);
    const min = constraints.min
      ?? (typeof options.min === 'number' ? options.min : undefined);
    const max = constraints.max
      ?? (typeof options.max === 'number' ? options.max : undefined);
    const step = constraints.step
      ?? (
        typeof options.step === 'number' && options.step > 0
          ? options.step
          : undefined
      );
    const acceptedValue = props.value;
    return h(ElInputNumber, {
      ...options,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(step === undefined ? {} : { step }),
      modelValue:
        typeof acceptedValue === 'number' && Number.isFinite(acceptedValue)
          ? acceptedValue
          : undefined,
      disabled: state.disabled,
      'onUpdate:modelValue': (value: unknown) => emitValueChange(
        props,
        state,
        value,
        (candidate) => typeof candidate === 'number'
          && Number.isFinite(candidate)
          && (min === undefined || candidate >= min)
          && (max === undefined || candidate <= max),
      ),
    });
  },
);

export const COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS = Object.freeze({
  'scalar.email': EmailPresenter,
  'scalar.password': PasswordPresenter,
  'scalar.textarea': TextareaPresenter,
  'scalar.multiline': MultilinePresenter,
  'scalar.url': UrlPresenter,
  'scalar.uri': UriPresenter,
  'scalar.tel': TelPresenter,
  'scalar.phone': PhonePresenter,
  'scalar.date': DatePresenter,
  'scalar.time': TimePresenter,
  'scalar.datetime': DatetimePresenter,
  'scalar.date-time': DateTimePresenter,
  'scalar.color': ColorPresenter,
  'scalar.currency': CurrencyPresenter,
} satisfies Readonly<Record<CommonScalarFormatPresenterId, Component>>);

export function resolveCommonScalarFormatPresenter(
  id: string,
): Component | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(
      COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS,
      id,
    );
    return descriptor && 'value' in descriptor
      ? descriptor.value as Component
      : undefined;
  } catch {
    return undefined;
  }
}

function componentName(id: CommonScalarFormatPresenterId): string {
  return id
    .slice('scalar.'.length)
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}
