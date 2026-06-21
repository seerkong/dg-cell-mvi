import {
  ElAlert,
  ElOption,
  ElSelect,
  ElText,
} from 'element-plus';
import {
  defineComponent,
  h,
  type VNode,
} from 'vue';
import {
  resolveSchemaEditorUnionSelection,
} from 'dg-cell-mvi-halfcode-vue';

import {
  readSchemaEditorPresentationState,
  renderSchemaEditorFieldShell,
  schemaEditorPresenterProps,
  type SchemaEditorPresenterComponentProps,
} from '../shared/presentationShell';

type ContractValue = Exclude<
  SchemaEditorPresenterComponentProps['value'],
  undefined
>;
type OwnRecord = Readonly<Record<PropertyKey, unknown>>;

interface UnionAlternative {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly hasInitialValue: boolean;
  readonly initialValue?: ContractValue;
}

interface UnionDiagnostic {
  readonly code:
    | 'INVALID_UNION_ALTERNATIVE_DESCRIPTORS'
    | 'INVALID_UNION_ACCEPTED_SELECTION';
  readonly message: string;
}

interface UnionFacts {
  readonly alternatives: readonly UnionAlternative[];
  readonly selected?: string;
  readonly valid: boolean;
  readonly diagnostics: readonly UnionDiagnostic[];
}

export const UnionSelectPresenter = defineComponent({
  name: 'HalfcodeElementPlusSchemaEditorUnionSelect',
  inheritAttrs: false,
  props: schemaEditorPresenterProps,
  setup(props, { slots }) {
    return () => {
      const state = readSchemaEditorPresentationState(props);
      if (!state.visible) return null;

      const facts = readUnionFacts(props);
      const disabled = state.disabled || !facts.valid;
      const children = readDefaultSlot(slots.default);

      return h(
        'section',
        {
          class: [
            'dg-schema-editor-union-select',
            state.readOnly && 'is-readonly',
            state.pending && 'is-pending',
            facts.diagnostics.length > 0 && 'has-local-diagnostic',
          ],
          'data-schema-editor-presenter': 'union.select',
          'aria-busy': String(state.pending),
          'aria-readonly': String(state.readOnly),
        },
        [
          renderSchemaEditorFieldShell(state, {
            className: 'dg-schema-editor-union-select__field',
            content: h(
              'div',
              { class: 'dg-schema-editor-union-select__content' },
              [
                h(
                  ElSelect,
                  {
                    modelValue: facts.selected,
                    disabled,
                    placeholder: 'Select an alternative',
                    'aria-label': state.label || 'Union alternative',
                    'data-schema-editor-role': 'union-alternative-selector',
                    'onUpdate:modelValue': (alternativeId: unknown) => {
                      if (disabled || typeof alternativeId !== 'string') return;
                      emitAlternativeSelection(props, facts, alternativeId);
                    },
                  },
                  {
                    default: () => facts.alternatives.map((alternative) =>
                      renderAlternativeOption(alternative)),
                  },
                ),
                ...facts.diagnostics.map((diagnostic) => h(ElAlert, {
                  key: diagnostic.code,
                  title: diagnostic.message,
                  type: 'error',
                  closable: false,
                  showIcon: true,
                  class: 'dg-schema-editor-union-select__diagnostic',
                  'data-schema-editor-diagnostic-code': diagnostic.code,
                })),
                h(
                  'div',
                  {
                    class:
                      'dg-schema-editor-union-select__selected-alternative',
                    'data-schema-editor-role': 'union-selected-alternative',
                  },
                  children,
                ),
              ],
            ),
          }),
        ],
      );
    };
  },
});

function renderAlternativeOption(
  alternative: UnionAlternative,
): VNode {
  return h(
    ElOption,
    {
      key: alternative.id,
      value: alternative.id,
      label: alternative.label,
      'data-schema-editor-alternative-id': alternative.id,
    },
    {
      default: () => h(
        'div',
        { class: 'dg-schema-editor-union-select__option' },
        [
          h(
            'span',
            { class: 'dg-schema-editor-union-select__option-label' },
            alternative.label,
          ),
          alternative.description
            ? h(
                ElText,
                {
                  type: 'info',
                  class: 'dg-schema-editor-union-select__option-description',
                },
                { default: () => alternative.description },
              )
            : null,
        ],
      ),
    },
  );
}

function readUnionFacts(
  props: SchemaEditorPresenterComponentProps,
): UnionFacts {
  const metadata = asOwnRecord(readOwnData(asOwnRecord(props.node), 'metadata'));
  const alternatives = readAlternativeDescriptors(
    readOwnData(metadata, 'alternativeDescriptors'),
  );
  if (!alternatives) {
    return invalidUnionFacts(
      'INVALID_UNION_ALTERNATIVE_DESCRIPTORS',
      'Union alternative descriptors are not readable and contract-serializable.',
    );
  }

  const selected = resolveSchemaEditorUnionSelection(props.node, props.value);
  if (!selected.ok) {
    return Object.freeze({
      alternatives,
      valid: false,
      diagnostics: Object.freeze([Object.freeze({
        code: 'INVALID_UNION_ACCEPTED_SELECTION' as const,
        message: selected.message,
      })]),
    });
  }
  if (
    selected.alternativeId !== undefined
    && !alternatives.some(({ id }) => id === selected.alternativeId)
  ) {
    return Object.freeze({
      alternatives,
      selected: selected.alternativeId,
      valid: false,
      diagnostics: Object.freeze([Object.freeze({
        code: 'INVALID_UNION_ACCEPTED_SELECTION' as const,
        message: 'Accepted union selection does not match an alternative.',
      })]),
    });
  }

  return Object.freeze({
    alternatives,
    ...(selected.alternativeId === undefined
      ? {}
      : { selected: selected.alternativeId }),
    valid: true,
    diagnostics: Object.freeze([]),
  });
}

function readAlternativeDescriptors(
  value: unknown,
): readonly UnionAlternative[] | undefined {
  const length = readOwnArrayLength(value);
  if (length === undefined || length === 0) return undefined;

  const alternatives: UnionAlternative[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const item = readOwnDescriptor(value as object, String(index));
    if (!item || !('value' in item)) return undefined;
    const descriptor = asOwnRecord(item.value);
    if (!descriptor) return undefined;

    const id = readOwnData(descriptor, 'id');
    const label = readOptionalString(descriptor, 'label');
    const description = readOptionalString(descriptor, 'description');
    if (
      typeof id !== 'string'
      || id.length === 0
      || ids.has(id)
      || !label.ok
      || !description.ok
    ) {
      return undefined;
    }

    const initialDescriptor = readOwnDescriptor(descriptor, 'initialValue');
    let initialValue: ContractValue | undefined;
    if (initialDescriptor) {
      if (!('value' in initialDescriptor)) return undefined;
      initialValue = cloneContractValue(initialDescriptor.value);
      if (initialValue === undefined) return undefined;
    }

    ids.add(id);
    alternatives.push(Object.freeze({
      id,
      label: label.value ?? id,
      ...(description.value === undefined
        ? {}
        : { description: description.value }),
      hasInitialValue: initialDescriptor !== undefined,
      ...(initialValue === undefined ? {} : { initialValue }),
    }));
  }
  return Object.freeze(alternatives);
}

function emitAlternativeSelection(
  props: SchemaEditorPresenterComponentProps,
  facts: UnionFacts,
  alternativeId: string,
): void {
  const alternative = facts.alternatives.find(({ id }) => id === alternativeId);
  if (!alternative) return;

  const payload = cloneContractValue({
    alternativeId,
    ...(alternative.hasInitialValue
      ? { initialValue: alternative.initialValue }
      : {}),
  });
  if (payload === undefined) return;
  props.onSchemaEditorEvent(Object.freeze({
    event: 'alternative.select',
    payload,
  }));
}

function invalidUnionFacts(
  code: UnionDiagnostic['code'],
  message: string,
): UnionFacts {
  return Object.freeze({
    alternatives: Object.freeze([]),
    valid: false,
    diagnostics: Object.freeze([Object.freeze({ code, message })]),
  });
}

function readDefaultSlot(
  slot: (() => VNode[]) | undefined,
): VNode[] {
  if (!slot) return [];
  try {
    const children = slot();
    const length = readOwnArrayLength(children);
    if (length === undefined) return [];
    const result: VNode[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = readOwnDescriptor(children, String(index));
      if (!descriptor || !('value' in descriptor)) return [];
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return [];
  }
}

function cloneContractValue(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set(),
): ContractValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value === null || typeof value !== 'object' || ancestors.has(value)) {
    return undefined;
  }

  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return undefined;
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    const length = readOwnArrayLength(value);
    if (length === undefined) return undefined;
    const result: ContractValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = readOwnDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return undefined;
      const item = cloneContractValue(descriptor.value, nextAncestors);
      if (item === undefined) return undefined;
      result.push(item);
    }
    Object.freeze(result);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) return undefined;

  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return undefined;
  }
  const result = Object.create(null) as Record<string, ContractValue>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') return undefined;
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable) continue;
    if (!('value' in descriptor)) return undefined;
    const item = cloneContractValue(descriptor.value, nextAncestors);
    if (item === undefined) return undefined;
    Object.defineProperty(result, key, {
      value: item,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result) as ContractValue;
}

function readOptionalString(
  record: OwnRecord,
  key: PropertyKey,
): Readonly<{ ok: boolean; value?: string }> {
  const descriptor = readOwnDescriptor(record, key);
  if (!descriptor) return Object.freeze({ ok: true });
  return 'value' in descriptor
    && (descriptor.value === undefined || typeof descriptor.value === 'string')
    ? Object.freeze({
        ok: true,
        ...(typeof descriptor.value === 'string'
          ? { value: descriptor.value }
          : {}),
      })
    : Object.freeze({ ok: false });
}

function readOwnArrayLength(value: unknown): number | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !descriptor
      || !('value' in descriptor)
      || !Number.isSafeInteger(descriptor.value)
      || descriptor.value < 0
    ) {
      return undefined;
    }
    for (let index = 0; index < descriptor.value; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !('value' in item)) return undefined;
    }
    return descriptor.value;
  } catch {
    return undefined;
  }
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
  const descriptor = readOwnDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function readOwnDescriptor(
  value: object | undefined,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  if (!value) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
}
