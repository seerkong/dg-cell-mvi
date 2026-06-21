// @vitest-environment jsdom

import {
  compileEditorPlan,
  createSchemaEditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  EditorPlanNode,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';
import * as elementPlusPackage from 'dg-cell-mvi-halfcode-element-plus';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type Component,
} from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

const PRESENTER_ID = 'structured-value.modal';

type PresenterEvent = Readonly<{
  event: string;
  payload: SchemaEditorContractValue;
}>;
type EngineInput = Readonly<{
  target: HTMLElement;
  value: unknown;
  onChange(value: unknown): void;
}>;
type EngineInstance = Readonly<{
  update(value: unknown): void;
  dispose(): void;
}>;
type EngineFactory = Readonly<{
  create(input: EngineInput): EngineInstance;
}>;
type RegistryResult = Readonly<{
  ok: boolean;
  registry?: Readonly<{
    resolve(id: string): Readonly<{
      ok: boolean;
      adapter?: Readonly<{ component: Component }>;
    }>;
  }>;
  diagnostics: readonly unknown[];
}>;
type RegistryFactory = (
  runtime: unknown,
  input: unknown,
  config: unknown,
) => RegistryResult;

interface EngineDriver {
  readonly factory: EngineFactory;
  readonly creates: EngineInput[];
  readonly updates: unknown[];
  readonly disposals: number;
  readonly currentValue: unknown;
  emit(value: unknown): void;
}

const packageValues = elementPlusPackage as unknown as Record<string, unknown>;
const createRegistry =
  packageValues.createElementPlusSchemaEditorPresenterRegistry as
    | RegistryFactory
    | undefined;
const mountedApps: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function createEngineDriver(): EngineDriver {
  const creates: EngineInput[] = [];
  const updates: unknown[] = [];
  let disposals = 0;
  let current: EngineInput | undefined;
  let currentValue: unknown;
  const driver: EngineDriver = {
    factory: Object.freeze({
      create(input: EngineInput): EngineInstance {
        creates.push(input);
        current = input;
        currentValue = structuredClone(input.value);
        return Object.freeze({
          update(value: unknown) {
            updates.push(structuredClone(value));
            currentValue = structuredClone(value);
          },
          dispose() {
            disposals += 1;
          },
        });
      },
    }),
    creates,
    updates,
    get disposals() {
      return disposals;
    },
    get currentValue() {
      return currentValue;
    },
    emit(value: unknown) {
      expect(current, 'Expected the editor engine to be mounted.').toBeDefined();
      currentValue = structuredClone(value);
      current!.onChange(value);
    },
  };
  return driver;
}

function createEngineRuntime(
  visual: EngineDriver,
  json: EngineDriver,
  overrides: Partial<{
    loadVisual(): Promise<EngineFactory>;
    loadJson(): Promise<EngineFactory>;
  }> = {},
) {
  const calls = { visual: 0, json: 0 };
  const engines = Object.freeze({
    async loadVisual(): Promise<EngineFactory> {
      calls.visual += 1;
      return visual.factory;
    },
    async loadJson(): Promise<EngineFactory> {
      calls.json += 1;
      return json.factory;
    },
    ...overrides,
  });
  return {
    runtime: Object.freeze({ engines }),
    calls,
  };
}

function structuredNode(): EditorPlanNode {
  return {
    kind: 'map',
    id: 'settings',
    path: ['settings'],
    metadata: {
      display: {
        label: 'Settings',
        visible: true,
        readOnly: false,
      },
      key: { scalar: 'string' },
    },
    presenter: {
      id: PRESENTER_ID,
      explicit: true,
    },
    valueTemplate: {
      kind: 'field',
      id: 'settings.value',
      path: ['settings', '*'],
      metadata: {
        display: {
          label: 'Value',
          visible: true,
          readOnly: false,
        },
        scalar: { kind: 'string' },
      },
      presenter: { id: 'scalar.text' },
    },
  };
}

function resolvePresenter(runtime: unknown): Component {
  expect(createRegistry).toBeTypeOf('function');
  const result = createRegistry!(runtime, {}, {});
  expect(result).toMatchObject({ ok: true, diagnostics: [] });
  if (!result.ok || !result.registry) {
    throw new Error('Structured-value registry runtime was rejected.');
  }
  const resolution = result.registry.resolve(PRESENTER_ID);
  expect(resolution).toMatchObject({ ok: true });
  if (!resolution.ok || !resolution.adapter) {
    throw new Error('structured-value.modal did not resolve.');
  }
  return resolution.adapter.component;
}

function mountPresenter(
  runtime: unknown,
  value: SchemaEditorContractValue,
  presenterOptions: Readonly<Record<string, SchemaEditorContractValue>>,
) {
  const emitted: PresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = resolvePresenter(runtime);
  const node = structuredNode();
  const app = createApp(defineComponent({
    setup() {
      return () => h(component, {
        node,
        value,
        path: node.path,
        presenterOptions,
        pending: false,
        diagnostics: [],
        eventContext: { wildcardBindings: [] },
        onSchemaEditorEvent(event: PresenterEvent) {
          emitted.push(structuredClone(event));
        },
      });
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return { target, emitted, app };
}

function control(action: string): HTMLButtonElement {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>(
    `[data-structured-value-action="${action}"]`,
  );
  const button = buttons.item(buttons.length - 1);
  expect(button, `Missing structured-value action "${action}".`).not.toBeNull();
  return button!;
}

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

async function openModal(): Promise<void> {
  control('open').click();
  await settle();
  expect(document.body.querySelector('[data-structured-value-modal]')).not.toBeNull();
}

describe('structured-value.modal T1.1 RED registry and selection contracts', () => {
  it('places frozen loader Effects in runtime while input and config stay empty', () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime, calls } = createEngineRuntime(visual, json);

    const accepted = createRegistry!(runtime, {}, {});
    expect(accepted).toMatchObject({ ok: true, diagnostics: [] });
    expect(Object.isFrozen(runtime.engines)).toBe(true);
    expect(calls).toEqual({ visual: 0, json: 0 });

    expect(createRegistry!({}, { engines: runtime.engines }, {})).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
      })],
    });
    expect(createRegistry!({}, {}, { engines: runtime.engines })).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
      })],
    });
  });

  it('keeps map.entries as the implicit structural choice and honors only explicit modal selection', () => {
    const runtime = createSchemaEditorCompilerRuntime();
    const schema = {
      kind: 'map',
      id: 'settings',
      key: { kind: 'scalar', scalar: 'string' },
      value: { kind: 'scalar', scalar: 'string' },
    } as const;
    const implicit = compileEditorPlan(runtime, { schema }, {});
    const explicit = compileEditorPlan(runtime, {
      schema,
      presentation: {
        presenter: {
          id: PRESENTER_ID,
          explicit: true,
          options: {
            defaultMode: 'visual',
            allowedModes: 'visual,json',
            rootKind: 'object',
          },
        },
      },
    }, {});

    expect(implicit.root.presenter).toMatchObject({ id: 'map.entries' });
    expect(implicit.root.presenter?.explicit).not.toBe(true);
    expect(explicit.root.presenter).toEqual({
      id: PRESENTER_ID,
      explicit: true,
      options: {
        defaultMode: 'visual',
        allowedModes: 'visual,json',
        rootKind: 'object',
      },
    });
  });
});

describe('structured-value.modal T1.1 RED interaction contracts', () => {
  it.each([
    ['defaultMode', {
      defaultMode: 'source',
      allowedModes: 'visual,json',
      rootKind: 'object',
    }],
    ['allowedModes', {
      defaultMode: 'visual',
      allowedModes: 'visual,source',
      rootKind: 'object',
    }],
    ['rootKind', {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'array',
    }],
  ])('fails closed for an invalid %s option', async (_field, presenterOptions) => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime, calls } = createEngineRuntime(visual, json);
    const rendered = mountPresenter(runtime, { count: 1 }, presenterOptions);

    await openModal();
    expect(document.body.querySelector(
      '[data-structured-value-diagnostic="invalid-options"]',
    )?.textContent).not.toBe('');
    expect(control('apply').disabled).toBe(true);
    expect(document.body.querySelector('textarea')).toBeNull();
    expect(calls).toEqual({ visual: 0, json: 0 });
    expect(rendered.emitted).toEqual([]);
  });

  it('loads engines lazily and synchronizes both tabs through a modal-local draft', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime, calls } = createEngineRuntime(visual, json);
    const accepted = Object.freeze({ count: 1 });
    const rendered = mountPresenter(runtime, accepted, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    expect(calls).toEqual({ visual: 0, json: 0 });
    await openModal();
    expect(calls).toEqual({ visual: 1, json: 0 });

    visual.emit({ count: 2 });
    await settle();
    expect(rendered.emitted).toEqual([]);
    control('mode.json').click();
    await settle();
    expect(calls).toEqual({ visual: 1, json: 1 });
    expect(JSON.parse(String(json.currentValue))).toEqual({ count: 2 });

    json.emit('{"count":3}');
    await settle();
    control('mode.visual').click();
    await settle();
    expect(visual.currentValue).toEqual({ count: 3 });
    expect(rendered.emitted).toEqual([]);
    expect(accepted).toEqual({ count: 1 });
  });

  it('preserves invalid JSON, remains on JSON, diagnoses it, and emits nothing', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime } = createEngineRuntime(visual, json);
    const rendered = mountPresenter(runtime, { count: 1 }, {
      defaultMode: 'json',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    json.emit('{"count":');
    await settle();
    control('mode.visual').click();
    control('apply').click();
    await settle();

    expect(json.currentValue).toBe('{"count":');
    expect(document.body.querySelector(
      '[data-structured-value-mode="json"][aria-selected="true"]',
    )).not.toBeNull();
    expect(document.body.querySelector(
      '[data-structured-value-diagnostic="invalid-json"]',
    )?.textContent).not.toBe('');
    expect(rendered.emitted).toEqual([]);
  });

  it('enforces rootKind and emits one normalized value.change only on Apply', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const objectRuntime = createEngineRuntime(visual, json).runtime;
    const objectRendered = mountPresenter(objectRuntime, { count: 1 }, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    visual.emit([1, 2]);
    await settle();
    expect(control('apply').disabled).toBe(true);
    expect(document.body.querySelector(
      '[data-structured-value-diagnostic="root-kind"]',
    )).not.toBeNull();
    expect(objectRendered.emitted).toEqual([]);
    control('cancel').click();
    await settle();
    expect(visual.disposals).toBeGreaterThan(0);
    const mountedIndex = mountedApps.indexOf(objectRendered.app);
    if (mountedIndex >= 0) mountedApps.splice(mountedIndex, 1);
    objectRendered.app.unmount();
    await settle();

    const anyVisual = createEngineDriver();
    const anyJson = createEngineDriver();
    const anyRuntime = createEngineRuntime(anyVisual, anyJson).runtime;
    const anyRendered = mountPresenter(anyRuntime, { count: 1 }, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'any',
    });
    await openModal();
    anyVisual.emit([1, 2]);
    await settle();
    const applyButton = control('apply');
    applyButton.click();
    applyButton.click();
    await settle();

    expect(anyRendered.emitted).toEqual([
      { event: 'value.change', payload: { value: [1, 2] } },
    ]);
  });

  it('discards a cancelled draft and reopens from the accepted input value', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime } = createEngineRuntime(visual, json);
    const accepted = Object.freeze({ count: 1 });
    const rendered = mountPresenter(runtime, accepted, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    visual.emit({ count: 9 });
    await settle();
    control('cancel').click();
    await settle();
    expect(rendered.emitted).toEqual([]);

    await openModal();
    expect(visual.creates.at(-1)?.value).toEqual({ count: 1 });
    expect(rendered.emitted).toEqual([]);
  });

  it('disposes every mounted engine when the presenter unmounts', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime } = createEngineRuntime(visual, json);
    const rendered = mountPresenter(runtime, { count: 1 }, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    control('mode.json').click();
    await settle();
    expect(visual.creates).toHaveLength(1);
    expect(json.creates).toHaveLength(1);

    const mountedIndex = mountedApps.indexOf(rendered.app);
    if (mountedIndex >= 0) mountedApps.splice(mountedIndex, 1);
    rendered.app.unmount();
    await settle();

    expect(visual.disposals).toBe(1);
    expect(json.disposals).toBe(1);
    expect(rendered.emitted).toEqual([]);
  });

  it('keeps a reopened modal loading until its own engine generation settles', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    let resolveFirst!: (factory: EngineFactory) => void;
    let resolveSecond!: (factory: EngineFactory) => void;
    const firstLoad = new Promise<EngineFactory>((resolve) => {
      resolveFirst = resolve;
    });
    const secondLoad = new Promise<EngineFactory>((resolve) => {
      resolveSecond = resolve;
    });
    let loadIndex = 0;
    const { runtime } = createEngineRuntime(visual, json, {
      loadVisual() {
        const load = loadIndex === 0 ? firstLoad : secondLoad;
        loadIndex += 1;
        return load;
      },
    });
    const rendered = mountPresenter(runtime, { count: 1 }, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    expect(control('apply').disabled).toBe(true);
    control('cancel').click();
    await settle();
    await openModal();
    expect(loadIndex).toBe(2);
    expect(control('apply').disabled).toBe(true);

    resolveFirst(visual.factory);
    await settle();
    expect(control('apply').disabled).toBe(true);
    expect(rendered.emitted).toEqual([]);

    resolveSecond(visual.factory);
    await settle();
    expect(control('apply').disabled).toBe(false);
    expect(visual.creates).toHaveLength(1);
    expect(rendered.emitted).toEqual([]);
  });

  it('fails closed when an engine cannot load and never renders a textarea fallback', async () => {
    const visual = createEngineDriver();
    const json = createEngineDriver();
    const { runtime } = createEngineRuntime(visual, json, {
      async loadVisual(): Promise<EngineFactory> {
        throw new Error('visual engine unavailable');
      },
    });
    const rendered = mountPresenter(runtime, { count: 1 }, {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object',
    });

    await openModal();
    expect(document.body.querySelector(
      '[data-structured-value-diagnostic="engine-load"]',
    )?.textContent).toContain('visual engine unavailable');
    expect(control('apply').disabled).toBe(true);
    expect(document.body.querySelector('textarea')).toBeNull();
    expect(rendered.emitted).toEqual([]);
  });
});
