import {
  ElAlert,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
  ElText,
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
  readScalarPresenterFacts,
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
const NUMBER_OPTIONS = Object.freeze([
  'min',
  'max',
  'step',
  'precision',
  'controls',
  'controlsPosition',
  'placeholder',
] as const);
const BOOLEAN_OPTIONS = Object.freeze([
  'activeText',
  'inactiveText',
  'inlinePrompt',
] as const);
const ENUM_OPTIONS = Object.freeze([
  'placeholder',
  'clearable',
  'filterable',
  'noDataText',
  'noMatchText',
] as const);
const NULL_ENUM_VALUE = Object.freeze({
  schemaEditorScalar: 'null',
});

type PresenterId =
  | 'scalar.text'
  | 'scalar.number'
  | 'scalar.boolean'
  | 'scalar.null'
  | 'scalar.enum'
  | 'scalar.const'
  | 'schema.ref'
  | 'unsupported';

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

function renderField(
  id: PresenterId,
  state: SchemaEditorPresentationState,
  content: VNodeChild,
): VNodeChild {
  return h(
    'section',
    {
      class: [
        'dg-schema-editor-scalar',
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

function defineFieldPresenter(
  name: string,
  id: PresenterId,
  renderContent: (
    props: SchemaEditorPresenterComponentProps,
    state: SchemaEditorPresentationState,
  ) => VNodeChild,
): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: schemaEditorPresenterProps,
    setup(props, { slots }) {
      return () => {
        const state = readSchemaEditorPresentationState(props);
        if (!state.visible) return null;
        const recursiveContent = slots.default?.() ?? [];
        return renderField(
          id,
          state,
          [renderContent(props, state), ...recursiveContent],
        );
      };
    },
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function scalarLabel(value: unknown): string {
  if (value === null) return 'null';
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return String(value);
  }
  return '';
}

function satisfiesMultipleOf(
  candidate: number,
  multipleOf: number | undefined,
): boolean {
  if (multipleOf === undefined) return true;
  const quotient = candidate / multipleOf;
  if (!Number.isFinite(quotient)) return false;
  const tolerance = Number.EPSILON
    * Math.max(1, Math.abs(quotient))
    * 8;
  return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

export const TextPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorText',
  'scalar.text',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      TEXT_OPTIONS,
    );
    return h(ElInput, {
      ...options,
      modelValue: stringValue(props.value),
      disabled: state.pending,
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

export const NumberPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorNumber',
  'scalar.number',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      NUMBER_OPTIONS,
    );
    const constraints = readNumberPresenterConstraints(props);
    const facts = readScalarPresenterFacts(props);
    const integer = facts.kind === 'integer';
    const min = constraints.min
      ?? (typeof options.min === 'number' ? options.min : undefined);
    const max = constraints.max
      ?? (typeof options.max === 'number' ? options.max : undefined);
    const step = constraints.step
      ?? (integer ? 1 : typeof options.step === 'number' && options.step > 0
        ? options.step
        : undefined);
    const precision = integer
      ? 0
      : typeof options.precision === 'number'
        ? Math.max(0, Math.trunc(options.precision))
        : undefined;
    const acceptedValue = props.value;

    return h(ElInputNumber, {
      ...options,
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(step !== undefined ? { step } : {}),
      ...(precision !== undefined ? { precision } : {}),
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
          && (!integer || Number.isInteger(candidate))
          && (min === undefined || candidate >= min)
          && (max === undefined || candidate <= max)
          && satisfiesMultipleOf(candidate, constraints.multipleOf),
      ),
    });
  },
);

export const BooleanPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorBoolean',
  'scalar.boolean',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      BOOLEAN_OPTIONS,
    );
    const acceptedValue = props.value;
    return h(ElSwitch, {
      ...options,
      modelValue: acceptedValue === true,
      disabled: state.disabled,
      'onUpdate:modelValue': (value: unknown) => emitValueChange(
        props,
        state,
        value,
        (candidate) => typeof candidate === 'boolean',
      ),
    });
  },
);

export const NullPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorNull',
  'scalar.null',
  () => h(
    ElTag,
    { type: 'info', effect: 'plain' },
    { default: () => 'null' },
  ),
);

export const EnumPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorEnum',
  'scalar.enum',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      ENUM_OPTIONS,
    );
    const values = readScalarPresenterFacts(props).values;
    const acceptedValue = props.value;
    const selectedValue = acceptedValue === null
      ? NULL_ENUM_VALUE
      : isContractScalar(acceptedValue)
        ? acceptedValue
        : undefined;
    return h(
      ElSelect,
      {
        ...options,
        modelValue: selectedValue,
        disabled: state.disabled,
        'onUpdate:modelValue': (value: unknown) => {
          const contractValue = value === NULL_ENUM_VALUE ? null : value;
          emitValueChange(
            props,
            state,
            contractValue,
            (candidate) => values.some((entry) => Object.is(entry, candidate)),
          );
        },
      },
      {
        default: () => values.map((value, index) => h(ElOption, {
          key: `${typeof value}:${scalarLabel(value)}:${index}`,
          label: scalarLabel(value),
          value: value === null ? NULL_ENUM_VALUE : value,
        })),
      },
    );
  },
);

export const ConstPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorConst',
  'scalar.const',
  (props) => {
    const facts = readScalarPresenterFacts(props);
    const value = facts.constant !== undefined
      ? facts.constant
      : props.value;
    return h(
      ElText,
      { tag: 'output', class: 'dg-schema-editor-const-value' },
      { default: () => scalarLabel(value) },
    );
  },
);

export const ReferencePresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorReference',
  'schema.ref',
  (props, state) => {
    const options = readAllowedPresenterOptions(
      props.presenterOptions,
      TEXT_OPTIONS,
    );
    return h(ElInput, {
      ...options,
      modelValue: stringValue(props.value),
      disabled: state.pending,
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

export const UnsupportedPresenter = defineFieldPresenter(
  'HalfcodeElementPlusSchemaEditorUnsupported',
  'unsupported',
  (props) => {
    if (props.diagnostics.length > 0) {
      return h('span', {
        class: 'dg-schema-editor-unsupported__diagnostic-anchor',
        'aria-hidden': 'true',
      });
    }
    return h(ElAlert, {
      title: 'No presenter supports this schema.',
      type: 'error',
      closable: false,
      showIcon: true,
    });
  },
);
