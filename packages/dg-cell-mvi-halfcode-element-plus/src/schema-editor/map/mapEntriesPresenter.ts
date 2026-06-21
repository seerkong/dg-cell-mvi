import {
  Delete,
  Edit,
  Plus,
} from '@element-plus/icons-vue';
import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElIcon,
  ElInput,
  ElText,
  ElTooltip,
} from 'element-plus';
import {
  defineComponent,
  h,
  ref,
  type Component,
  type Ref,
  type VNode,
} from 'vue';

import {
  readSchemaEditorPresentationState,
  renderSchemaEditorFieldShell,
  schemaEditorPresenterProps,
  type SchemaEditorPresenterComponentProps,
  type SchemaEditorPresentationState,
} from '../shared/presentationShell';

type ContractValue = Exclude<
  SchemaEditorPresenterComponentProps['value'],
  undefined
>;
type OwnRecord = Readonly<Record<PropertyKey, unknown>>;

interface MapKeyConstraints {
  readonly pattern?: string;
  readonly patternExpression?: RegExp;
  readonly minLength?: number;
  readonly maxLength?: number;
}

interface MapDiagnostic {
  readonly code:
    | 'INVALID_MAP_VALUE'
    | 'INVALID_MAP_VALUE_DEFAULT'
    | 'INVALID_MAP_KEY_CONSTRAINTS'
    | 'MAP_SLOT_MISMATCH';
  readonly message: string;
}

interface MapFacts {
  readonly valueOk: boolean;
  readonly keys: readonly string[];
  readonly constraintsOk: boolean;
  readonly constraints: MapKeyConstraints;
  readonly defaultStatus: 'missing' | 'valid' | 'invalid';
  readonly valueDefault?: ContractValue;
  readonly diagnostics: readonly MapDiagnostic[];
}

interface KeyValidation {
  readonly ok: boolean;
  readonly code?:
    | 'BLANK_MAP_KEY'
    | 'DUPLICATE_MAP_KEY'
    | 'UNCHANGED_MAP_KEY'
    | 'MAP_KEY_TOO_SHORT'
    | 'MAP_KEY_TOO_LONG'
    | 'MAP_KEY_PATTERN_MISMATCH';
  readonly message?: string;
}

interface MapActionConfig {
  readonly action: 'entry.set' | 'entry.rename' | 'entry.remove';
  readonly label: string;
  readonly icon: Component;
  readonly disabled: boolean;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly onClick: () => void;
}

const ACTION_SIZE = '32px';

export const MapEntriesPresenter = defineComponent({
  name: 'HalfcodeElementPlusSchemaEditorMapEntries',
  inheritAttrs: false,
  props: schemaEditorPresenterProps,
  setup(props, { slots }) {
    const newKeyDraft = ref('');
    const newKeyDraftTouched = ref(false);
    const renameDrafts = new Map<string, Ref<string>>();

    const renameDraftFor = (key: string): Ref<string> => {
      const existing = renameDrafts.get(key);
      if (existing) return existing;
      const created = ref(key);
      renameDrafts.set(key, created);
      return created;
    };

    return () => {
      const state = readSchemaEditorPresentationState(props);
      if (!state.visible) return null;

      const facts = readMapFacts(props);
      const children = readDefaultSlot(slots.default);
      const slotMatches = facts.valueOk && children.length === facts.keys.length;
      const slotDiagnostic: MapDiagnostic[] = facts.valueOk && !slotMatches
        ? [{
            code: 'MAP_SLOT_MISMATCH',
            message: 'Map value slots do not match the accepted entry count.',
          }]
        : [];
      const diagnostics = [...facts.diagnostics, ...slotDiagnostic];
      const globallyDisabled = state.disabled
        || !facts.valueOk
        || !facts.constraintsOk
        || facts.defaultStatus === 'invalid'
        || !slotMatches;

      return h(
        'section',
        {
          class: [
            'dg-schema-editor-map-entries',
            state.readOnly && 'is-readonly',
            state.pending && 'is-pending',
            diagnostics.length > 0 && 'has-local-diagnostic',
          ],
          'data-schema-editor-presenter': 'map.entries',
          'aria-busy': String(state.pending),
          'aria-readonly': String(state.readOnly),
        },
        [
          renderSchemaEditorFieldShell(state, {
            className: 'dg-schema-editor-map-entries__field',
            content: h(
              'div',
              { class: 'dg-schema-editor-map-entries__content' },
              [
                renderNewEntryToolbar(
                  props,
                  state,
                  facts,
                  newKeyDraft,
                  newKeyDraftTouched,
                  globallyDisabled,
                ),
                ...diagnostics.map((diagnostic) => h(ElAlert, {
                  key: diagnostic.code,
                  title: diagnostic.message,
                  type: 'error',
                  closable: false,
                  showIcon: true,
                  class: 'dg-schema-editor-map-entries__diagnostic',
                  'data-schema-editor-diagnostic-code': diagnostic.code,
                })),
                facts.valueOk && slotMatches && facts.keys.length === 0
                  ? h(ElEmpty, {
                      description: 'No entries yet.',
                      imageSize: 48,
                      class: 'dg-schema-editor-map-entries__empty',
                    })
                  : null,
                facts.valueOk && slotMatches
                  ? h(
                      'ol',
                      {
                        class: 'dg-schema-editor-map-entries__entries',
                        'data-schema-editor-role': 'map-entries',
                      },
                      facts.keys.map((key, index) => renderMapEntry(
                        props,
                        state,
                        facts,
                        key,
                        children[index]!,
                        renameDraftFor(key),
                        globallyDisabled,
                      )),
                    )
                  : null,
              ],
            ),
          }),
        ],
      );
    };
  },
});

function renderNewEntryToolbar(
  props: SchemaEditorPresenterComponentProps,
  state: SchemaEditorPresentationState,
  facts: MapFacts,
  draft: Ref<string>,
  draftTouched: Ref<boolean>,
  globallyDisabled: boolean,
): VNode {
  const validation = validateMapKey(
    draft.value,
    facts.keys,
    facts.constraints,
    undefined,
    draftTouched.value,
  );
  const disabled = globallyDisabled
    || facts.defaultStatus !== 'valid'
    || !validation.ok;

  return h(
    'div',
    {
      class: 'dg-schema-editor-map-entries__new-entry',
      'data-schema-editor-role': 'map-entry-toolbar',
      style: {
        alignItems: 'flex-start',
        display: 'flex',
        gap: '8px',
        minHeight: ACTION_SIZE,
      },
    },
    [
      h(
        'div',
        { class: 'dg-schema-editor-map-entries__key-field' },
        [
          h(ElInput, {
            modelValue: draft.value,
            disabled: globallyDisabled,
            placeholder: 'New key',
            'aria-label': 'New entry key',
            'data-schema-editor-role': 'entry-key-draft',
            style: { minWidth: '160px' },
            'onUpdate:modelValue': (value: unknown) => {
              if (state.disabled || globallyDisabled) return;
              draftTouched.value = true;
              draft.value = typeof value === 'string' ? value : '';
            },
          }),
          renderKeyValidation(validation, 'new'),
        ],
      ),
      renderAction({
        action: 'entry.set',
        label: 'Add entry',
        icon: Plus,
        disabled,
        onClick: () => {
          if (
            disabled
            || state.disabled
            || facts.valueDefault === undefined
          ) {
            return;
          }
          const value = cloneContractValue(facts.valueDefault);
          if (value === undefined) return;
          emitMapEvent(props, 'entry.set', {
            key: draft.value,
            value,
          });
        },
      }),
    ],
  );
}

function renderMapEntry(
  props: SchemaEditorPresenterComponentProps,
  state: SchemaEditorPresentationState,
  facts: MapFacts,
  key: string,
  child: VNode,
  draft: Ref<string>,
  globallyDisabled: boolean,
): VNode {
  const validation = validateMapKey(
    draft.value,
    facts.keys,
    facts.constraints,
    key,
  );
  const renameDisabled = globallyDisabled || !validation.ok;
  const attrs = { 'data-schema-editor-key': key };

  return h(
    'li',
    {
      key,
      class: 'dg-schema-editor-map-entries__entry',
      'data-schema-editor-role': 'map-entry',
      ...attrs,
    },
    [
      h(
        'div',
        {
          class: 'dg-schema-editor-map-entries__entry-header',
          style: {
            alignItems: 'flex-start',
            display: 'flex',
            gap: '8px',
          },
        },
        [
          h(
            'div',
            { class: 'dg-schema-editor-map-entries__key-field' },
            [
              h(ElInput, {
                modelValue: draft.value,
                disabled: globallyDisabled,
                'aria-label': `Entry key ${key}`,
                'data-schema-editor-role': 'entry-key',
                ...attrs,
                style: { minWidth: '160px' },
                'onUpdate:modelValue': (value: unknown) => {
                  if (state.disabled || globallyDisabled) return;
                  draft.value = typeof value === 'string' ? value : '';
                },
              }),
              renderKeyValidation(validation, key),
            ],
          ),
          h(
            'div',
            {
              class: 'dg-schema-editor-map-entries__entry-toolbar',
              'data-schema-editor-role': 'map-entry-actions',
              ...attrs,
              style: {
                alignItems: 'center',
                display: 'flex',
                gap: '4px',
                minHeight: ACTION_SIZE,
              },
            },
            [
              renderAction({
                action: 'entry.rename',
                label: `Rename entry ${key}`,
                icon: Edit,
                disabled: renameDisabled,
                attrs,
                onClick: () => {
                  if (renameDisabled || state.disabled) return;
                  emitMapEvent(props, 'entry.rename', {
                    fromKey: key,
                    toKey: draft.value,
                  });
                },
              }),
              renderAction({
                action: 'entry.remove',
                label: `Remove entry ${key}`,
                icon: Delete,
                disabled: globallyDisabled,
                attrs,
                onClick: () => {
                  if (globallyDisabled || state.disabled) return;
                  emitMapEvent(props, 'entry.remove', { key });
                },
              }),
            ],
          ),
        ],
      ),
      h(
        'div',
        {
          class: 'dg-schema-editor-map-entries__entry-content',
          'data-schema-editor-role': 'map-entry-value',
          ...attrs,
        },
        [child],
      ),
    ],
  );
}

function renderAction(config: MapActionConfig): VNode {
  return h(
    ElTooltip,
    {
      content: config.label,
      placement: 'top',
      showAfter: 0,
      hideAfter: 0,
    },
    {
      default: () => h(
        ElButton,
        {
          circle: true,
          disabled: config.disabled,
          'aria-label': config.label,
          'data-schema-editor-action': config.action,
          ...config.attrs,
          style: {
            height: ACTION_SIZE,
            minHeight: ACTION_SIZE,
            minWidth: ACTION_SIZE,
            width: ACTION_SIZE,
          },
          onClick: config.onClick,
        },
        {
          default: () => h(ElIcon, null, {
            default: () => h(config.icon),
          }),
        },
      ),
    },
  );
}

function renderKeyValidation(
  validation: KeyValidation,
  identity: string,
): VNode | null {
  if (validation.ok || !validation.code || !validation.message) return null;
  return h(
    ElText,
    {
      key: `${identity}:${validation.code}`,
      type: 'danger',
      role: 'alert',
      class: 'dg-schema-editor-map-entries__key-diagnostic',
      'data-schema-editor-key-diagnostic': validation.code,
    },
    { default: () => validation.message },
  );
}

function validateMapKey(
  candidate: string,
  acceptedKeys: readonly string[],
  constraints: MapKeyConstraints,
  currentKey?: string,
  showBlankError = true,
): KeyValidation {
  if (candidate.trim().length === 0) {
    if (!showBlankError) return Object.freeze({ ok: false });
    return invalidKey('BLANK_MAP_KEY', 'Key must not be blank.');
  }
  if (currentKey !== undefined && candidate === currentKey) {
    return invalidKey('UNCHANGED_MAP_KEY', 'Key is unchanged.');
  }
  if (acceptedKeys.some((key) => key !== currentKey && key === candidate)) {
    return invalidKey('DUPLICATE_MAP_KEY', 'Key already exists.');
  }
  if (
    constraints.minLength !== undefined
    && candidate.length < constraints.minLength
  ) {
    return invalidKey(
      'MAP_KEY_TOO_SHORT',
      `Key must contain at least ${constraints.minLength} characters.`,
    );
  }
  if (
    constraints.maxLength !== undefined
    && candidate.length > constraints.maxLength
  ) {
    return invalidKey(
      'MAP_KEY_TOO_LONG',
      `Key must contain at most ${constraints.maxLength} characters.`,
    );
  }
  if (
    constraints.patternExpression
    && !constraints.patternExpression.test(candidate)
  ) {
    return invalidKey(
      'MAP_KEY_PATTERN_MISMATCH',
      `Key must match ${constraints.pattern}.`,
    );
  }
  return Object.freeze({ ok: true });
}

function invalidKey(
  code: Exclude<KeyValidation['code'], undefined>,
  message: string,
): KeyValidation {
  return Object.freeze({ ok: false, code, message });
}

function readMapFacts(
  props: SchemaEditorPresenterComponentProps,
): MapFacts {
  const keys = readAcceptedMapKeys(props.value);
  const diagnostics: MapDiagnostic[] = [];
  if (!keys) {
    diagnostics.push(Object.freeze({
      code: 'INVALID_MAP_VALUE',
      message: 'Map value is not a readable accepted record.',
    }));
  }

  const metadata = asOwnRecord(readOwnData(asOwnRecord(props.node), 'metadata'));
  const constraints = readMapKeyConstraints(metadata);
  if (!constraints.ok) {
    diagnostics.push(Object.freeze({
      code: 'INVALID_MAP_KEY_CONSTRAINTS',
      message: 'Map key constraints are not readable.',
    }));
  }

  const defaultDescriptor = readOwnDescriptor(metadata, 'valueDefault');
  let defaultStatus: MapFacts['defaultStatus'] = 'missing';
  let valueDefault: ContractValue | undefined;
  if (defaultDescriptor) {
    valueDefault = 'value' in defaultDescriptor
      ? cloneContractValue(defaultDescriptor.value)
      : undefined;
    defaultStatus = valueDefault === undefined ? 'invalid' : 'valid';
    if (defaultStatus === 'invalid') {
      diagnostics.push(Object.freeze({
        code: 'INVALID_MAP_VALUE_DEFAULT',
        message: 'Map value default is not contract-serializable.',
      }));
    }
  }

  return Object.freeze({
    valueOk: keys !== undefined,
    keys: Object.freeze(keys ?? []),
    constraintsOk: constraints.ok,
    constraints: constraints.value,
    defaultStatus,
    ...(valueDefault !== undefined ? { valueDefault } : {}),
    diagnostics: Object.freeze(diagnostics),
  });
}

function readMapKeyConstraints(
  metadata: OwnRecord | undefined,
): Readonly<{ ok: boolean; value: MapKeyConstraints }> {
  const keyDescriptor = readOwnDescriptor(metadata, 'key');
  if (!keyDescriptor || !('value' in keyDescriptor)) {
    return invalidConstraints();
  }
  const keyFacts = asOwnRecord(keyDescriptor.value);
  if (readOwnData(keyFacts, 'scalar') !== 'string') {
    return invalidConstraints();
  }

  const constraintsDescriptor = readOwnDescriptor(keyFacts, 'constraints');
  if (!constraintsDescriptor) {
    return Object.freeze({ ok: true, value: Object.freeze({}) });
  }
  if (!('value' in constraintsDescriptor)) return invalidConstraints();
  const constraints = asOwnRecord(constraintsDescriptor.value);
  if (!constraints) return invalidConstraints();

  const pattern = readOptionalData(constraints, 'pattern');
  const minLength = readOptionalData(constraints, 'minLength');
  const maxLength = readOptionalData(constraints, 'maxLength');
  if (!pattern.ok || !minLength.ok || !maxLength.ok) {
    return invalidConstraints();
  }
  if (pattern.value !== undefined && typeof pattern.value !== 'string') {
    return invalidConstraints();
  }
  if (!isOptionalLength(minLength.value) || !isOptionalLength(maxLength.value)) {
    return invalidConstraints();
  }
  if (
    typeof minLength.value === 'number'
    && typeof maxLength.value === 'number'
    && minLength.value > maxLength.value
  ) {
    return invalidConstraints();
  }

  let patternExpression: RegExp | undefined;
  if (typeof pattern.value === 'string') {
    try {
      patternExpression = new RegExp(pattern.value);
    } catch {
      return invalidConstraints();
    }
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...(typeof pattern.value === 'string'
        ? { pattern: pattern.value, patternExpression }
        : {}),
      ...(typeof minLength.value === 'number'
        ? { minLength: minLength.value }
        : {}),
      ...(typeof maxLength.value === 'number'
        ? { maxLength: maxLength.value }
        : {}),
    }),
  });
}

function invalidConstraints(): Readonly<{
  ok: false;
  value: MapKeyConstraints;
}> {
  return Object.freeze({ ok: false, value: Object.freeze({}) });
}

function isOptionalLength(value: unknown): boolean {
  return value === undefined
    || (typeof value === 'number'
      && Number.isSafeInteger(value)
      && value >= 0);
}

function readOptionalData(
  record: OwnRecord,
  key: PropertyKey,
): Readonly<{ ok: boolean; value?: unknown }> {
  const descriptor = readOwnDescriptor(record, key);
  if (!descriptor) return Object.freeze({ ok: true });
  return 'value' in descriptor
    ? Object.freeze({ ok: true, value: descriptor.value })
    : Object.freeze({ ok: false });
}

function readAcceptedMapKeys(value: unknown): string[] | undefined {
  const record = asOwnRecord(value);
  if (!record || Array.isArray(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(record);
    const keys: string[] = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (!descriptor?.enumerable) continue;
      if (typeof key !== 'string' || !('value' in descriptor)) {
        return undefined;
      }
      keys.push(key);
    }
    return keys;
  } catch {
    return undefined;
  }
}

function readDefaultSlot(
  slot: (() => VNode[]) | undefined,
): readonly VNode[] {
  if (!slot) return Object.freeze([]);
  try {
    const children = slot();
    const length = readOwnArrayLength(children);
    if (length === undefined) return Object.freeze([]);
    const result: VNode[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = readOwnDescriptor(children, String(index));
      if (!descriptor || !('value' in descriptor)) return Object.freeze([]);
      result.push(descriptor.value);
    }
    return Object.freeze(result);
  } catch {
    return Object.freeze([]);
  }
}

function emitMapEvent(
  props: SchemaEditorPresenterComponentProps,
  event: 'entry.set' | 'entry.rename' | 'entry.remove',
  payload: unknown,
): void {
  const clonedPayload = cloneContractValue(payload);
  if (clonedPayload === undefined) return;
  props.onSchemaEditorEvent(Object.freeze({
    event,
    payload: clonedPayload,
  }));
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
  for (const key of Object.keys(descriptors)) {
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
