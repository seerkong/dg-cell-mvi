import type {
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import {
  ElAlert,
  ElFormItem,
  ElTag,
  ElText,
} from 'element-plus';
import {
  h,
  type ExtractPropTypes,
  type PropType,
  type VNode,
  type VNodeChild,
} from 'vue';

type OwnRecord = Readonly<Record<PropertyKey, unknown>>;
type PresenterDiagnostic = SchemaEditorPresenterProps['diagnostics'][number];

export type AllowedPresenterOption =
  | null
  | boolean
  | number
  | string;

export interface SchemaEditorPresentationState {
  readonly label: string;
  readonly description?: string;
  readonly visible: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly diagnostics: readonly PresenterDiagnostic[];
}

export interface SchemaEditorFieldShellConfig {
  readonly content: VNodeChild;
  readonly className?: string;
  readonly labelPosition?: 'left' | 'right' | 'top';
}

export const schemaEditorPresenterProps = {
  node: {
    type: Object as PropType<SchemaEditorPresenterProps['node']>,
    required: true,
  },
  value: {
    type: [Object, Array, String, Number, Boolean] as PropType<
      SchemaEditorPresenterProps['value']
    >,
    required: false,
  },
  path: {
    type: Array as PropType<SchemaEditorPresenterProps['path']>,
    required: true,
  },
  presenterOptions: {
    type: Object as PropType<SchemaEditorPresenterProps['presenterOptions']>,
    required: false,
  },
  pending: {
    type: Boolean,
    required: true,
  },
  diagnostics: {
    type: Array as PropType<SchemaEditorPresenterProps['diagnostics']>,
    required: true,
  },
  eventContext: {
    type: Object as PropType<SchemaEditorPresenterProps['eventContext']>,
    required: true,
  },
  onSchemaEditorEvent: {
    type: Function as PropType<
      SchemaEditorPresenterProps['onSchemaEditorEvent']
    >,
    required: true,
  },
} as const;

export type SchemaEditorPresenterComponentProps = Readonly<
  ExtractPropTypes<typeof schemaEditorPresenterProps>
>;

export function readSchemaEditorPresentationState(
  props: SchemaEditorPresenterComponentProps,
): SchemaEditorPresentationState {
  const node = asOwnRecord(props.node);
  const metadata = asOwnRecord(readOwnData(node, 'metadata'));
  const display = asOwnRecord(readOwnData(metadata, 'display'));
  const field = asOwnRecord(readOwnData(metadata, 'field'));
  const label = readOwnData(display, 'label');
  const description = readOwnData(display, 'description');
  const visible = readOwnData(display, 'visible');
  const readOnly = readOwnData(display, 'readOnly');
  const required = readOwnData(field, 'required');
  const diagnostics = readDiagnostics(props.diagnostics);
  const pending = props.pending === true;

  return Object.freeze({
    label: typeof label === 'string' ? label : '',
    ...(typeof description === 'string' ? { description } : {}),
    visible: visible === true,
    readOnly: readOnly === true,
    required: required === true,
    pending,
    disabled: pending || readOnly === true,
    diagnostics,
  });
}

export function readAllowedPresenterOptions(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, AllowedPresenterOption>> {
  const record = asOwnRecord(value);
  if (!record) return Object.freeze({});

  const options: Record<string, AllowedPresenterOption> = {};
  for (const key of allowedKeys) {
    const option = readOwnData(record, key);
    if (isAllowedPresenterOption(option)) {
      options[key] = option;
    }
  }
  return Object.freeze(options);
}

export function renderSchemaEditorFieldShell(
  state: SchemaEditorPresentationState,
  config: SchemaEditorFieldShellConfig,
): VNode {
  const className = config.className ?? 'dg-schema-editor-field-shell';
  return h(
    ElFormItem,
    {
      label: state.label,
      labelPosition: config.labelPosition,
      required: state.required,
      validateStatus: diagnosticValidationStatus(state.diagnostics),
      class: [className, state.disabled && 'is-disabled'],
    },
    {
      default: () => [
        state.description
          ? h(
              ElText,
              {
                type: 'info',
                class: `${className}__description`,
              },
              { default: () => state.description },
            )
          : null,
        state.pending
          ? h(
              ElTag,
              {
                type: 'info',
                effect: 'plain',
                class: `${className}__pending`,
              },
              { default: () => 'Pending' },
            )
          : null,
        h(
          'div',
          { class: `${className}__content` },
          config.content ?? [],
        ),
        ...state.diagnostics.map((diagnostic) =>
          renderDiagnostic(diagnostic, className)),
      ],
    },
  );
}

function readDiagnostics(
  value: unknown,
): readonly PresenterDiagnostic[] {
  const candidates = readOwnArrayData(value);
  if (!candidates) return Object.freeze([]);

  const diagnostics: PresenterDiagnostic[] = [];
  for (const candidate of candidates) {
    const diagnostic = asOwnRecord(candidate);
    const severity = readOwnData(diagnostic, 'severity');
    const code = readOwnData(diagnostic, 'code');
    const message = readOwnData(diagnostic, 'message');
    if (
      (severity === 'info' || severity === 'warning' || severity === 'error')
      && typeof code === 'string'
      && typeof message === 'string'
    ) {
      diagnostics.push(Object.freeze({ severity, code, message }));
    }
  }
  return Object.freeze(diagnostics);
}

function readOwnArrayData(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor)) return undefined;
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0) return undefined;

    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return undefined;
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return undefined;
  }
}

function diagnosticValidationStatus(
  diagnostics: readonly PresenterDiagnostic[],
): 'error' | '' {
  return diagnostics.some(({ severity }) => severity === 'error')
    ? 'error'
    : '';
}

function renderDiagnostic(
  diagnostic: PresenterDiagnostic,
  className: string,
): VNode {
  return h(ElAlert, {
    key: `${diagnostic.code}:${diagnostic.message}`,
    title: diagnostic.message,
    type: diagnostic.severity,
    closable: false,
    showIcon: true,
    class: `${className}__diagnostic`,
    'data-schema-editor-diagnostic-code': diagnostic.code,
  });
}

function isAllowedPresenterOption(
  value: unknown,
): value is AllowedPresenterOption {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function asOwnRecord(value: unknown): OwnRecord | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    return value as OwnRecord;
  } catch {
    return undefined;
  }
}

function readOwnData(
  record: OwnRecord | undefined,
  key: PropertyKey,
): unknown {
  if (!record) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
