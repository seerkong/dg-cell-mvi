import {
  ElAlert,
  ElButton,
  ElDialog,
} from 'element-plus';
import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
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
import type {
  StructuredValueEngineFactory,
  StructuredValueEngineInstance,
  StructuredValuePresenterEngines,
} from './engines';

type StructuredValueMode = 'visual' | 'json';
type StructuredValueRootKind = 'object' | 'any';
type StructuredValueContractValue =
  NonNullable<SchemaEditorPresenterComponentProps['value']>;

interface StructuredValueOptions {
  readonly ok: true;
  readonly defaultMode: StructuredValueMode;
  readonly allowedModes: readonly StructuredValueMode[];
  readonly rootKind: StructuredValueRootKind;
}

interface InvalidStructuredValueOptions {
  readonly ok: false;
  readonly message: string;
}

type StructuredValueOptionsResult =
  | StructuredValueOptions
  | InvalidStructuredValueOptions;

interface NormalizedJson {
  readonly ok: true;
  readonly value: StructuredValueContractValue;
}

interface InvalidJson {
  readonly ok: false;
  readonly message: string;
}

type JsonResult = NormalizedJson | InvalidJson;

const OPTION_KEYS = Object.freeze([
  'defaultMode',
  'allowedModes',
  'rootKind',
] as const);

export function createStructuredValueModalPresenter(
  engines: StructuredValuePresenterEngines,
): Component {
  return defineComponent({
    name: 'HalfcodeElementPlusSchemaEditorStructuredValueModal',
    inheritAttrs: false,
    props: schemaEditorPresenterProps,
    setup(props) {
      const open = ref(false);
      const applying = ref(false);
      const activeMode = ref<StructuredValueMode>('visual');
      const draft = shallowRef<unknown>(null);
      const jsonText = ref('');
      const jsonDiagnostic = ref('');
      const valueDiagnostic = ref('');
      const engineDiagnostic = ref('');
      const loadingMode = ref<StructuredValueMode | undefined>();
      const options = ref<StructuredValueOptionsResult>(
        invalidOptions('The structured-value modal is not open.'),
      );
      const visual = createEngineSlot();
      const json = createEngineSlot();
      let generation = 0;

      const disposeEngines = (): void => {
        generation += 1;
        disposeSlot(visual);
        disposeSlot(json);
        loadingMode.value = undefined;
      };

      const closeModal = (): void => {
        if (!open.value) return;
        open.value = false;
        disposeEngines();
      };

      const ensureEngine = async (mode: StructuredValueMode): Promise<void> => {
        if (!open.value || !options.value.ok) return;
        const slot = mode === 'visual' ? visual : json;
        if (slot.instance || slot.loading || !slot.target) {
          if (slot.instance) {
            slot.instance.update(mode === 'visual' ? draft.value : jsonText.value);
          }
          return;
        }
        if (!slot.factory && slot.loadAttempted) return;

        const currentGeneration = generation;
        slot.loading = true;
        slot.loadingGeneration = currentGeneration;
        loadingMode.value = mode;
        engineDiagnostic.value = '';
        try {
          let factory = slot.factory;
          if (!factory) {
            slot.loadAttempted = true;
            const loadedFactory = mode === 'visual'
              ? await engines.loadVisual()
              : await engines.loadJson();
            if (!open.value || currentGeneration !== generation) return;
            slot.factory = loadedFactory;
            factory = loadedFactory;
          }
          if (!isEngineFactory(factory)) {
            throw new Error(`${mode} engine loader returned an invalid factory.`);
          }
          if (!open.value || currentGeneration !== generation || !slot.target) {
            return;
          }
          const instance = factory.create({
            target: slot.target,
            value: mode === 'visual' ? draft.value : jsonText.value,
            onChange: (value) => {
              if (mode === 'visual') {
                acceptVisualDraft(value, draft, jsonText, jsonDiagnostic, valueDiagnostic);
                if (!valueDiagnostic.value) {
                  json.instance?.update(jsonText.value);
                }
              } else {
                acceptJsonDraft(value, draft, jsonText, jsonDiagnostic, valueDiagnostic);
                if (!jsonDiagnostic.value && !valueDiagnostic.value) {
                  visual.instance?.update(draft.value);
                }
              }
            },
          });
          if (!isEngineInstance(instance)) {
            throw new Error(`${mode} engine factory returned an invalid instance.`);
          }
          if (!open.value || currentGeneration !== generation) {
            instance.dispose();
            return;
          }
          slot.instance = instance;
        } catch (error) {
          if (open.value && currentGeneration === generation) {
            engineDiagnostic.value = errorMessage(error);
          }
        } finally {
          if (slot.loadingGeneration === currentGeneration) {
            slot.loading = false;
            slot.loadingGeneration = undefined;
            if (loadingMode.value === mode) loadingMode.value = undefined;
          }
        }
      };

      const openModal = (): void => {
        if (open.value) return;
        disposeEngines();
        options.value = readStructuredValueOptions(props.presenterOptions);
        applying.value = false;
        jsonDiagnostic.value = '';
        valueDiagnostic.value = '';
        engineDiagnostic.value = '';

        const normalized = normalizeJsonValue(props.value);
        if (normalized.ok) {
          draft.value = normalized.value;
          jsonText.value = formatJson(normalized.value);
        } else {
          draft.value = null;
          jsonText.value = '';
          valueDiagnostic.value = normalized.message;
        }

        activeMode.value = options.value.ok
          ? options.value.defaultMode
          : 'visual';
        open.value = true;
        const currentGeneration = generation;
        void nextTick(() => {
          if (open.value && currentGeneration === generation) {
            void ensureEngine(activeMode.value);
          }
        });
      };

      const selectMode = (mode: StructuredValueMode): void => {
        if (
          !open.value
          || !options.value.ok
          || !options.value.allowedModes.includes(mode)
          || activeMode.value === mode
        ) {
          return;
        }
        if (activeMode.value === 'json') {
          const parsed = parseJson(jsonText.value);
          if (!parsed.ok) {
            jsonDiagnostic.value = parsed.message;
            return;
          }
          draft.value = parsed.value;
          jsonDiagnostic.value = '';
          valueDiagnostic.value = '';
        } else {
          jsonText.value = formatJson(draft.value);
          jsonDiagnostic.value = '';
        }
        const targetSlot = mode === 'visual' ? visual : json;
        targetSlot.instance?.update(
          mode === 'visual' ? draft.value : jsonText.value,
        );
        activeMode.value = mode;
        void nextTick(() => {
          void ensureEngine(mode);
        });
      };

      const apply = (): void => {
        if (applying.value) return;
        const validation = validateDraft(
          options.value,
          draft.value,
          jsonDiagnostic.value,
          valueDiagnostic.value,
          engineDiagnostic.value,
          loadingMode.value,
        );
        if (!validation.ok) return;

        applying.value = true;
        props.onSchemaEditorEvent(Object.freeze({
          event: 'value.change',
          payload: Object.freeze({ value: validation.value }),
        }));
        closeModal();
      };

      const setEngineTarget = (
        mode: StructuredValueMode,
        element: unknown,
      ): void => {
        const slot = mode === 'visual' ? visual : json;
        const target = element instanceof HTMLElement ? element : undefined;
        if (slot.target === target) return;
        slot.instance?.dispose();
        slot.instance = undefined;
        slot.target = target;
        if (target && open.value && activeMode.value === mode) {
          void ensureEngine(mode);
        }
      };
      const setVisualTarget = (element: unknown): void => {
        setEngineTarget('visual', element);
      };
      const setJsonTarget = (element: unknown): void => {
        setEngineTarget('json', element);
      };

      onBeforeUnmount(disposeEngines);

      return () => renderPresenter(
        props,
        engines,
        {
          open,
          activeMode,
          draft,
          jsonText,
          jsonDiagnostic,
          valueDiagnostic,
          engineDiagnostic,
          loadingMode,
          options,
          visual,
          json,
        },
        {
          openModal,
          closeModal,
          selectMode,
          apply,
          ensureEngine,
          setVisualTarget,
          setJsonTarget,
        },
      );
    },
  });
}

interface EngineSlot {
  target?: HTMLElement;
  factory?: StructuredValueEngineFactory;
  instance?: StructuredValueEngineInstance;
  loading: boolean;
  loadingGeneration?: number;
  loadAttempted: boolean;
}

interface PresenterRefs {
  readonly open: Ref<boolean>;
  readonly activeMode: Ref<StructuredValueMode>;
  readonly draft: Ref<unknown>;
  readonly jsonText: Ref<string>;
  readonly jsonDiagnostic: Ref<string>;
  readonly valueDiagnostic: Ref<string>;
  readonly engineDiagnostic: Ref<string>;
  readonly loadingMode: Ref<StructuredValueMode | undefined>;
  readonly options: Ref<StructuredValueOptionsResult>;
  readonly visual: EngineSlot;
  readonly json: EngineSlot;
}

interface PresenterActions {
  readonly openModal: () => void;
  readonly closeModal: () => void;
  readonly selectMode: (mode: StructuredValueMode) => void;
  readonly apply: () => void;
  readonly ensureEngine: (mode: StructuredValueMode) => Promise<void>;
  readonly setVisualTarget: (element: unknown) => void;
  readonly setJsonTarget: (element: unknown) => void;
}

function renderPresenter(
  props: SchemaEditorPresenterComponentProps,
  _engines: StructuredValuePresenterEngines,
  refs: PresenterRefs,
  actions: PresenterActions,
): VNode | null {
  const state = readSchemaEditorPresentationState(props);
  if (!state.visible) return null;

  return h(
    'section',
    {
      class: [
        'dg-schema-editor-structured-value',
        state.readOnly && 'is-readonly',
        state.pending && 'is-pending',
      ],
      'data-schema-editor-presenter': 'structured-value.modal',
      'aria-busy': String(state.pending),
      'aria-readonly': String(state.readOnly),
    },
    [
      renderSchemaEditorFieldShell(state, {
        className: 'dg-schema-editor-structured-value__field',
        content: h(
          ElButton,
          {
            disabled: state.disabled,
            'data-structured-value-action': 'open',
            onClick: actions.openModal,
          },
          { default: () => 'Edit structured value' },
        ),
      }),
      renderModal(props, state, refs, actions),
    ],
  );
}

function renderModal(
  props: SchemaEditorPresenterComponentProps,
  state: SchemaEditorPresentationState,
  refs: PresenterRefs,
  actions: PresenterActions,
): VNode {
  const validation = validateDraft(
    refs.options.value,
    refs.draft.value,
    refs.jsonDiagnostic.value,
    refs.valueDiagnostic.value,
    refs.engineDiagnostic.value,
    refs.loadingMode.value,
  );
  const options = refs.options.value;

  return h(
    ElDialog,
    {
      modelValue: refs.open.value,
      title: state.label || 'Edit structured value',
      width: 'min(920px, calc(100vw - 32px))',
      closeOnClickModal: false,
      destroyOnClose: true,
      appendToBody: true,
      'data-structured-value-modal': '',
      'onUpdate:modelValue': (value: boolean) => {
        if (!value) actions.closeModal();
      },
      onClosed: actions.closeModal,
    },
    {
      default: () => h(
        'div',
        {
          class: 'dg-schema-editor-structured-value__modal',
          'data-structured-value-modal': '',
        },
        [
          options.ok
            ? renderModeTabs(options, refs, actions)
            : renderLocalDiagnostic('invalid-options', options.message),
          refs.valueDiagnostic.value
            ? renderLocalDiagnostic('invalid-value', refs.valueDiagnostic.value)
            : null,
          refs.jsonDiagnostic.value
            ? renderLocalDiagnostic('invalid-json', refs.jsonDiagnostic.value)
            : null,
          refs.engineDiagnostic.value
            ? renderLocalDiagnostic('engine-load', refs.engineDiagnostic.value)
            : null,
          options.ok
            && options.rootKind === 'object'
            && !isObjectRoot(refs.draft.value)
            && !refs.valueDiagnostic.value
            ? renderLocalDiagnostic(
                'root-kind',
                'This editor requires a JSON object at the root.',
              )
            : null,
          renderEngineTargets(refs, actions),
        ],
      ),
      footer: () => h(
        'div',
        {
          class: 'dg-schema-editor-structured-value__actions',
          style: {
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          },
        },
        [
          h(
            ElButton,
            {
              'data-structured-value-action': 'cancel',
              onClick: actions.closeModal,
            },
            { default: () => 'Cancel' },
          ),
          h(
            ElButton,
            {
              type: 'primary',
              disabled: state.disabled || !validation.ok,
              loading: refs.loadingMode.value !== undefined,
              'data-structured-value-action': 'apply',
              onClick: actions.apply,
            },
            { default: () => 'Apply' },
          ),
        ],
      ),
    },
  );
}

function renderModeTabs(
  options: StructuredValueOptions,
  refs: PresenterRefs,
  actions: PresenterActions,
): VNode {
  return h(
    'div',
    {
      class: 'dg-schema-editor-structured-value__tabs',
      role: 'tablist',
      style: {
        display: 'flex',
        gap: '8px',
        marginBottom: '12px',
      },
    },
    options.allowedModes.map((mode) => h(
      ElButton,
      {
        key: mode,
        role: 'tab',
        type: refs.activeMode.value === mode ? 'primary' : 'default',
        'aria-selected': String(refs.activeMode.value === mode),
        'data-structured-value-action': `mode.${mode}`,
        'data-structured-value-mode': mode,
        onClick: () => actions.selectMode(mode),
      },
      { default: () => mode === 'visual' ? 'Visual' : 'JSON' },
    )),
  );
}

function renderEngineTargets(
  refs: PresenterRefs,
  actions: PresenterActions,
): VNode {
  return h(
    'div',
    {
      class: 'dg-schema-editor-structured-value__engines',
      style: { minHeight: '420px' },
    },
    [
      h('div', {
        ref: actions.setVisualTarget,
        hidden: refs.activeMode.value !== 'visual',
        'data-structured-value-engine': 'visual',
        style: { height: '420px' },
      }),
      h('div', {
        ref: actions.setJsonTarget,
        hidden: refs.activeMode.value !== 'json',
        'data-structured-value-engine': 'json',
        style: { height: '420px' },
      }),
    ],
  );
}

function renderLocalDiagnostic(kind: string, message: string): VNode {
  return h(ElAlert, {
    title: message,
    type: 'error',
    closable: false,
    showIcon: true,
    'data-structured-value-diagnostic': kind,
    style: { marginBottom: '12px' },
  });
}

function createEngineSlot(): EngineSlot {
  return { loading: false, loadAttempted: false };
}

function disposeSlot(slot: EngineSlot): void {
  try {
    slot.instance?.dispose();
  } finally {
    slot.instance = undefined;
    slot.factory = undefined;
    slot.loading = false;
    slot.loadingGeneration = undefined;
    slot.loadAttempted = false;
  }
}

function readStructuredValueOptions(value: unknown): StructuredValueOptionsResult {
  const fields = readOwnDataRecord(value);
  if (!fields) {
    return invalidOptions('Presenter options must be a plain data record.');
  }
  if (
    fields.size !== OPTION_KEYS.length
    || OPTION_KEYS.some((key) => !fields.has(key))
  ) {
    return invalidOptions(
      'Presenter options require only defaultMode, allowedModes, and rootKind.',
    );
  }

  const defaultMode = fields.get('defaultMode');
  const allowedModesValue = fields.get('allowedModes');
  const rootKind = fields.get('rootKind');
  if (defaultMode !== 'visual' && defaultMode !== 'json') {
    return invalidOptions('defaultMode must be "visual" or "json".');
  }
  if (rootKind !== 'object' && rootKind !== 'any') {
    return invalidOptions('rootKind must be "object" or "any".');
  }
  if (typeof allowedModesValue !== 'string') {
    return invalidOptions('allowedModes must be a comma-separated string.');
  }

  const allowedModes = allowedModesValue
    .split(',')
    .map((mode) => mode.trim());
  if (
    allowedModes.length === 0
    || allowedModes.some((mode) => mode !== 'visual' && mode !== 'json')
    || new Set(allowedModes).size !== allowedModes.length
    || !allowedModes.includes(defaultMode)
  ) {
    return invalidOptions(
      'allowedModes must contain unique visual/json modes and include defaultMode.',
    );
  }

  return Object.freeze({
    ok: true,
    defaultMode,
    allowedModes: Object.freeze(allowedModes as StructuredValueMode[]),
    rootKind,
  });
}

function invalidOptions(message: string): InvalidStructuredValueOptions {
  return Object.freeze({ ok: false, message });
}

function acceptVisualDraft(
  value: unknown,
  draft: Ref<unknown>,
  jsonText: Ref<string>,
  jsonDiagnostic: Ref<string>,
  valueDiagnostic: Ref<string>,
): void {
  const normalized = normalizeJsonValue(value);
  if (!normalized.ok) {
    valueDiagnostic.value = normalized.message;
    return;
  }
  draft.value = normalized.value;
  jsonText.value = formatJson(normalized.value);
  jsonDiagnostic.value = '';
  valueDiagnostic.value = '';
}

function acceptJsonDraft(
  value: unknown,
  draft: Ref<unknown>,
  jsonText: Ref<string>,
  jsonDiagnostic: Ref<string>,
  valueDiagnostic: Ref<string>,
): void {
  jsonText.value = typeof value === 'string' ? value : String(value ?? '');
  const parsed = parseJson(jsonText.value);
  if (!parsed.ok) {
    jsonDiagnostic.value = parsed.message;
    return;
  }
  draft.value = parsed.value;
  jsonDiagnostic.value = '';
  valueDiagnostic.value = '';
}

function validateDraft(
  options: StructuredValueOptionsResult,
  draft: unknown,
  jsonDiagnostic: string,
  valueDiagnostic: string,
  engineDiagnostic: string,
  loadingMode: StructuredValueMode | undefined,
): JsonResult {
  if (!options.ok) return options;
  if (jsonDiagnostic) return { ok: false, message: jsonDiagnostic };
  if (valueDiagnostic) return { ok: false, message: valueDiagnostic };
  if (engineDiagnostic) return { ok: false, message: engineDiagnostic };
  if (loadingMode) return { ok: false, message: 'Editor engine is loading.' };

  const normalized = normalizeJsonValue(draft);
  if (!normalized.ok) return normalized;
  if (options.rootKind === 'object' && !isObjectRoot(normalized.value)) {
    return {
      ok: false,
      message: 'This editor requires a JSON object at the root.',
    };
  }
  return normalized;
}

function parseJson(text: string): JsonResult {
  try {
    return normalizeJsonValue(JSON.parse(text));
  } catch (error) {
    return {
      ok: false,
      message: `Invalid JSON: ${errorMessage(error)}`,
    };
  }
}

function normalizeJsonValue(value: unknown): JsonResult {
  try {
    return {
      ok: true,
      value: normalizeJsonBranch(
        value,
        new Set<object>(),
      ) as StructuredValueContractValue,
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

function normalizeJsonBranch(value: unknown, ancestors: Set<object>): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON numbers must be finite.');
    return value;
  }
  if (typeof value !== 'object') {
    throw new Error('Value is not JSON serializable.');
  }
  if (ancestors.has(value)) throw new Error('Value contains a cycle.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const normalized: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) {
          throw new Error('JSON arrays cannot contain holes or accessors.');
        }
        normalized.push(normalizeJsonBranch(descriptor.value, ancestors));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('JSON objects must be plain data records.');
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new Error('JSON objects cannot contain accessors.');
      }
      Object.defineProperty(normalized, key, {
        value: normalizeJsonBranch(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function isObjectRoot(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readOwnDataRecord(
  value: unknown,
): ReadonlyMap<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return undefined;
  }
}

function isEngineFactory(value: unknown): value is StructuredValueEngineFactory {
  const fields = readOwnDataRecord(value);
  return fields?.size === 1 && typeof fields.get('create') === 'function';
}

function isEngineInstance(value: unknown): value is StructuredValueEngineInstance {
  const fields = readOwnDataRecord(value);
  return fields?.size === 2
    && typeof fields.get('update') === 'function'
    && typeof fields.get('dispose') === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}
