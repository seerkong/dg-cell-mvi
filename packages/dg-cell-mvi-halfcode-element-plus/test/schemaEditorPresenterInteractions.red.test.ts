// @vitest-environment jsdom

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type Component,
  type VNodeChild,
} from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import * as elementPlusPackage from 'dg-cell-mvi-halfcode-element-plus';

type SchemaEditorContractValue =
  | null
  | boolean
  | number
  | string
  | readonly SchemaEditorContractValue[]
  | Readonly<{ [key: string]: SchemaEditorContractValue }>;
type EditorPlanNode = Readonly<{
  kind: 'group' | 'field' | 'collection' | 'map' | 'union' | 'custom';
  id: string;
  path: readonly (string | number | '*')[];
  metadata: Readonly<Record<string, unknown>>;
  presenter?: Readonly<{ id: string }>;
  diagnostics?: readonly Readonly<{
    severity: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }>[];
  children?: readonly EditorPlanNode[];
  itemTemplate?: EditorPlanNode;
  valueTemplate?: EditorPlanNode;
  alternatives?: Readonly<Record<string, EditorPlanNode>>;
}>;
type SchemaEditorPresenterEvent = Readonly<{
  event: string;
  payload: SchemaEditorContractValue;
}>;
type SchemaEditorPresenterProps = Readonly<{
  node: EditorPlanNode;
  value: SchemaEditorContractValue | undefined;
  path: readonly (string | number | '*')[];
  presenterOptions: Readonly<Record<string, SchemaEditorContractValue>> | undefined;
  pending: boolean;
  diagnostics: readonly Readonly<{
    severity: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }>[];
  eventContext: Readonly<{ wildcardBindings: readonly unknown[] }>;
  onSchemaEditorEvent: (event: SchemaEditorPresenterEvent) => void;
}>;
type PresenterAdapter = Readonly<{ component: Component }>;
type PresenterResolution =
  | Readonly<{ ok: true; id: string; adapter: PresenterAdapter }>
  | Readonly<{ ok: false; id: string; diagnostic: unknown }>;
type PresenterRegistry = Readonly<{
  resolve(id: string): PresenterResolution;
}>;
type RegistryResult =
  | Readonly<{ ok: true; registry: PresenterRegistry; diagnostics: readonly [] }>
  | Readonly<{ ok: false; diagnostics: readonly unknown[] }>;
type DefaultRegistryFactory = (
  runtime: unknown,
  input: unknown,
  config: unknown,
) => RegistryResult;

const packageValues = elementPlusPackage as unknown as Record<string, unknown>;
const createDefaultRegistry =
  packageValues.createElementPlusSchemaEditorPresenterRegistry as
    | DefaultRegistryFactory
    | undefined;
const publicApiAvailable = typeof createDefaultRegistry === 'function';
const mountedApps: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function display(
  label: string,
  overrides: Partial<{
    description: string;
    visible: boolean;
    readOnly: boolean;
  }> = {},
) {
  return {
    label,
    description: overrides.description,
    visible: overrides.visible ?? true,
    readOnly: overrides.readOnly ?? false,
  };
}

function fieldNode(
  id: string,
  presenterId: string,
  overrides: Partial<EditorPlanNode> = {},
): EditorPlanNode {
  return {
    kind: 'field',
    id,
    path: [id],
    metadata: {
      display: display(id),
      field: { key: id, required: false },
      scalar: { kind: 'string' },
    },
    presenter: { id: presenterId },
    ...overrides,
  };
}

function resolvePresenter(id: string): Component {
  const result = createDefaultRegistry!({}, {}, {});
  expect(result).toMatchObject({ ok: true, diagnostics: [] });
  if (!result.ok) throw new Error(`Default presenter registry failed for ${id}.`);
  const resolution = result.registry.resolve(id);
  expect(resolution).toMatchObject({ ok: true, id });
  if (!resolution.ok) throw new Error(`Presenter ${id} did not resolve.`);
  return resolution.adapter.component;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function mountPresenter(
  presenterId: string,
  props: Omit<SchemaEditorPresenterProps, 'onSchemaEditorEvent'>,
  slot?: () => VNodeChild,
) {
  const emitted: SchemaEditorPresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = resolvePresenter(presenterId);
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        component,
        {
          ...props,
          onSchemaEditorEvent(event: SchemaEditorPresenterEvent) {
            emitted.push(structuredClone(event));
          },
        },
        slot ? { default: slot } : undefined,
      );
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return { target, emitted };
}

function commonProps(
  node: EditorPlanNode,
  value: SchemaEditorContractValue | undefined,
  overrides: Partial<Omit<SchemaEditorPresenterProps, 'node' | 'value' | 'onSchemaEditorEvent'>> = {},
): Omit<SchemaEditorPresenterProps, 'onSchemaEditorEvent'> {
  return {
    node,
    value,
    path: node.path,
    presenterOptions: undefined,
    pending: false,
    diagnostics: [],
    eventContext: { wildcardBindings: [] },
    ...overrides,
  };
}

function action(
  target: HTMLElement,
  event: SchemaEditorPresenterEvent['event'],
  qualifier = '',
): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>(
    `[data-schema-editor-action="${event}"]${qualifier}`,
  );
  expect(button, `Missing discoverable ${event} control`).not.toBeNull();
  return button!;
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

async function chooseElementPlusOption(label: string): Promise<void> {
  const trigger = document.body.querySelector<HTMLElement>(
    '.el-select__wrapper, .el-select',
  );
  expect(trigger, 'Expected a real Element Plus select control').not.toBeNull();
  trigger!.click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const option = [...document.body.querySelectorAll<HTMLElement>(
    '.el-select-dropdown__item',
  )].find((candidate) => candidate.textContent?.trim() === label);
  expect(option, `Expected Element Plus option "${label}"`).not.toBeUndefined();
  option!.click();
  await nextTick();
}

describe('Element Plus Schema Editor presenter interaction T1.2 RED', () => {
  it('requires the package-root default presenter registry before component interaction', () => {
    expect({
      type: typeof packageValues.createElementPlusSchemaEditorPresenterRegistry,
      arity: typeof createDefaultRegistry === 'function'
        ? createDefaultRegistry.length
        : undefined,
    }).toEqual({ type: 'function', arity: 3 });
  });
});

describe.runIf(publicApiAvailable)(
  'Element Plus Schema Editor real component interactions',
  () => {
    it('renders safe metadata and accepted state while visibility, readOnly, and pending outrank options', async () => {
      const value = deepFreeze('accepted');
      const node = fieldNode('account-name', 'scalar.text', {
        metadata: {
          display: display('Account name', {
            description: 'Public account label',
            readOnly: true,
          }),
          field: { key: 'account-name', required: true },
          scalar: { kind: 'string' },
        },
        diagnostics: [{
          severity: 'error',
          code: 'NAME_REJECTED',
          message: 'Name is already reserved',
        }],
      });
      const rendered = mountPresenter(
        'scalar.text',
        commonProps(node, value, {
          pending: true,
          diagnostics: node.diagnostics!,
          presenterOptions: {
            placeholder: 'Safe placeholder',
            value: 'option hijack',
            modelValue: 'option hijack',
            disabled: false,
            readOnly: false,
          },
        }),
      );
      await nextTick();

      expect(rendered.target.textContent).toContain('Account name');
      expect(rendered.target.textContent).toContain('Public account label');
      expect(rendered.target.textContent).toContain('Name is already reserved');
      expect(rendered.target.querySelector('.is-required')).not.toBeNull();
      const input = rendered.target.querySelector<HTMLInputElement>(
        '.el-input input',
      );
      expect(input).not.toBeNull();
      expect(input!.value).toBe('accepted');
      expect(input!.placeholder).toBe('Safe placeholder');
      expect(input!.disabled || input!.readOnly).toBe(true);

      await setInput(input!, 'optimistic value');
      expect(rendered.emitted).toEqual([]);
      expect(value).toBe('accepted');

      const invisibleNode = fieldNode('secret', 'scalar.text', {
        metadata: {
          display: display('Must stay hidden', { visible: false }),
          field: { key: 'secret', required: false },
          scalar: { kind: 'string' },
        },
      });
      const invisible = mountPresenter(
        'scalar.text',
        commonProps(invisibleNode, 'classified'),
      );
      await nextTick();
      expect(invisible.target.textContent).not.toContain('Must stay hidden');
      expect(invisible.target.querySelector('input')).toBeNull();
    });

    it('emits value.change from a real Element Plus input without modifying accepted props.value', async () => {
      const value = deepFreeze({ accepted: 'before' });
      const node = fieldNode('owner', 'schema.ref', {
        metadata: {
          display: display('Owner'),
          field: { key: 'owner', required: true },
          ref: 'schema://business/user',
        },
      });
      const rendered = mountPresenter(
        'schema.ref',
        commonProps(node, 'before'),
      );
      await nextTick();
      const input = rendered.target.querySelector<HTMLInputElement>(
        '.el-input input',
      );
      expect(input).not.toBeNull();

      await setInput(input!, 'after');

      expect(rendered.emitted).toEqual([
        { event: 'value.change', payload: { value: 'after' } },
      ]);
      expect(value).toEqual({ accepted: 'before' });
    });

    it('renders object.group children only through the default slot', async () => {
      const value = deepFreeze({ profile: { name: 'Accepted name' } });
      const node: EditorPlanNode = {
        kind: 'group',
        id: 'profile',
        path: ['profile'],
        metadata: {
          display: display('Profile'),
        },
        presenter: { id: 'object.group' },
        children: [
          fieldNode(
            'FORBIDDEN_OBJECT_CHILD_PLAN',
            'scalar.text',
            { path: ['profile', 'name'] },
          ),
        ],
      };
      const rendered = mountPresenter(
        'object.group',
        commonProps(node, value),
        () => h(
          'span',
          { 'data-slot-child': 'profile-name' },
          'SLOT_OBJECT_CHILD',
        ),
      );
      await nextTick();

      expect(rendered.target.querySelectorAll('[data-slot-child]')).toHaveLength(1);
      expect(rendered.target.textContent).toContain('SLOT_OBJECT_CHILD');
      expect(rendered.target.textContent).not.toContain(
        'FORBIDDEN_OBJECT_CHILD_PLAN',
      );
      expect(rendered.emitted).toEqual([]);
      expect(value).toEqual({ profile: { name: 'Accepted name' } });
    });

    it('fails closed for hostile presenterOptions without overriding accepted facts or wiring', async () => {
      const node = fieldNode('safe-name', 'scalar.text', {
        metadata: {
          display: display('Safe name', { readOnly: true }),
          field: { key: 'safe-name', required: true },
          scalar: { kind: 'string' },
        },
        diagnostics: [{
          severity: 'error',
          code: 'SAFE_DIAGNOSTIC',
          message: 'Accepted diagnostic',
        }],
      });
      let accessorReads = 0;
      let injectedEventCalls = 0;
      const runtimeCapability = Object.freeze({
        dispatch() {
          throw new Error('FORBIDDEN_RUNTIME_CAPABILITY');
        },
      });
      const hostileOptions = Object.defineProperties(
        {
          placeholder: 'Allowed placeholder',
          runtime: runtimeCapability,
          onSchemaEditorEvent() {
            injectedEventCalls += 1;
          },
          default: () => h('span', 'FORBIDDEN_OPTION_SLOT'),
          key: 'FORBIDDEN_OPTION_KEY',
          diagnostics: [{
            severity: 'info',
            code: 'FORBIDDEN_OPTION_DIAGNOSTIC',
            message: 'Injected diagnostic',
          }],
          modelValue: 'FORBIDDEN_MODEL_VALUE',
          value: 'FORBIDDEN_VALUE',
          disabled: false,
          readOnly: false,
        },
        {
          suffixIcon: {
            enumerable: true,
            get() {
              accessorReads += 1;
              throw new Error('FORBIDDEN_OPTION_ACCESSOR');
            },
          },
        },
      );
      const accepted = deepFreeze('accepted');
      const rendered = mountPresenter(
        'scalar.text',
        commonProps(node, accepted, {
          pending: true,
          diagnostics: node.diagnostics!,
          presenterOptions: hostileOptions as unknown as Readonly<
            Record<string, SchemaEditorContractValue>
          >,
        }),
        () => h(
          'span',
          { 'data-slot-child': 'safe-slot' },
          'SAFE_DEFAULT_SLOT',
        ),
      );
      await nextTick();

      const input = rendered.target.querySelector<HTMLInputElement>(
        '.el-input input',
      );
      expect(input).not.toBeNull();
      expect(input!.value).toBe('accepted');
      expect(input!.placeholder).toBe('Allowed placeholder');
      expect(input!.disabled || input!.readOnly).toBe(true);
      expect(rendered.target.textContent).toContain('Accepted diagnostic');
      expect(rendered.target.textContent).not.toContain('Injected diagnostic');
      expect(rendered.target.textContent).not.toContain('FORBIDDEN_OPTION_SLOT');
      expect(rendered.target.textContent).toContain('SAFE_DEFAULT_SLOT');
      expect(accessorReads).toBe(0);

      await setInput(input!, 'attempted overwrite');
      expect(rendered.emitted).toEqual([]);
      expect(injectedEventCalls).toBe(0);
      expect(accepted).toBe('accepted');

      const revokedOptions = Proxy.revocable({}, {});
      revokedOptions.revoke();
      let revokedRendered:
        | ReturnType<typeof mountPresenter>
        | undefined;
      expect(() => {
        revokedRendered = mountPresenter(
          'scalar.text',
          commonProps(node, accepted, {
            pending: true,
            diagnostics: node.diagnostics!,
            presenterOptions: revokedOptions.proxy as Readonly<
              Record<string, SchemaEditorContractValue>
            >,
          }),
        );
      }).not.toThrow();
      await nextTick();
      const revokedInput = revokedRendered!.target.querySelector<HTMLInputElement>(
        '.el-input input',
      );
      expect(revokedInput).not.toBeNull();
      expect(revokedInput!.value).toBe('accepted');
      expect(revokedInput!.disabled || revokedInput!.readOnly).toBe(true);
      expect(revokedRendered!.target.textContent).toContain(
        'Accepted diagnostic',
      );
      expect(revokedRendered!.emitted).toEqual([]);
    });

    it('emits item.insert/remove/move from real Element Plus buttons and renders only slot-owned children', async () => {
      const value = deepFreeze(['first', 'second']);
      const node: EditorPlanNode = {
        kind: 'collection',
        id: 'members',
        path: ['members'],
        metadata: {
          display: display('Members'),
          itemDefault: { name: 'New member' },
          identity: { strategy: 'index' },
        },
        presenter: { id: 'collection.list' },
        itemTemplate: fieldNode(
          'FORBIDDEN_COLLECTION_TEMPLATE',
          'scalar.text',
        ),
      };
      const rendered = mountPresenter(
        'collection.list',
        commonProps(node, value),
        () => [
          h('span', { 'data-slot-child': '0' }, 'SLOT_MEMBER_0'),
          h('span', { 'data-slot-child': '1' }, 'SLOT_MEMBER_1'),
        ],
      );
      await nextTick();

      expect(rendered.target.querySelectorAll('[data-slot-child]')).toHaveLength(2);
      expect(rendered.target.textContent).toContain('SLOT_MEMBER_0');
      expect(rendered.target.textContent).not.toContain('FORBIDDEN_COLLECTION_TEMPLATE');

      action(rendered.target, 'item.insert').click();
      action(
        rendered.target,
        'item.remove',
        '[data-schema-editor-index="1"]',
      ).click();
      action(
        rendered.target,
        'item.move',
        '[data-schema-editor-from-index="1"][data-schema-editor-to-index="0"]',
      ).click();
      await nextTick();

      expect(rendered.emitted).toEqual([
        {
          event: 'item.insert',
          payload: { index: 2, value: { name: 'New member' } },
        },
        { event: 'item.remove', payload: { index: 1 } },
        { event: 'item.move', payload: { fromIndex: 1, toIndex: 0 } },
      ]);
      expect(value).toEqual(['first', 'second']);
    });

    it('emits entry.set/remove/rename from real controls and never renders the value template itself', async () => {
      const value = deepFreeze({ alpha: 'A' });
      const node: EditorPlanNode = {
        kind: 'map',
        id: 'labels',
        path: ['labels'],
        metadata: {
          display: display('Labels'),
          key: { scalar: 'string' },
          valueDefault: { enabled: true },
        },
        presenter: { id: 'map.entries' },
        valueTemplate: fieldNode('FORBIDDEN_MAP_TEMPLATE', 'scalar.text'),
      };
      const rendered = mountPresenter(
        'map.entries',
        commonProps(node, value),
        () => h('span', { 'data-slot-child': 'alpha' }, 'SLOT_MAP_VALUE'),
      );
      await nextTick();

      expect(rendered.target.textContent).toContain('SLOT_MAP_VALUE');
      expect(rendered.target.textContent).not.toContain('FORBIDDEN_MAP_TEMPLATE');
      const draft = rendered.target.querySelector<HTMLInputElement>(
        '[data-schema-editor-role="entry-key-draft"] input, input[data-schema-editor-role="entry-key-draft"]',
      );
      expect(draft, 'Expected an Element Plus new-key draft input').not.toBeNull();
      await setInput(draft!, 'beta');
      action(rendered.target, 'entry.set').click();

      const rename = rendered.target.querySelector<HTMLInputElement>(
        '[data-schema-editor-role="entry-key"][data-schema-editor-key="alpha"] input, input[data-schema-editor-role="entry-key"][data-schema-editor-key="alpha"]',
      );
      expect(rename, 'Expected an Element Plus existing-key input').not.toBeNull();
      await setInput(rename!, 'renamed');
      action(
        rendered.target,
        'entry.rename',
        '[data-schema-editor-key="alpha"]',
      ).click();
      action(
        rendered.target,
        'entry.remove',
        '[data-schema-editor-key="alpha"]',
      ).click();
      await nextTick();

      expect(rendered.emitted).toEqual([
        {
          event: 'entry.set',
          payload: { key: 'beta', value: { enabled: true } },
        },
        {
          event: 'entry.rename',
          payload: { fromKey: 'alpha', toKey: 'renamed' },
        },
        { event: 'entry.remove', payload: { key: 'alpha' } },
      ]);
      expect(value).toEqual({ alpha: 'A' });
    });

    it('emits alternative.select from a real Element Plus select and displays only the selected renderer slot', async () => {
      const value = deepFreeze({ kind: 'basic', title: 'Accepted title' });
      const node: EditorPlanNode = {
        kind: 'union',
        id: 'channel',
        path: ['channel'],
        metadata: {
          display: display('Channel'),
          discriminator: 'kind',
          alternativeDescriptors: [
            {
              id: 'basic',
              label: 'Basic',
              initialValue: { kind: 'basic', title: '' },
            },
            {
              id: 'advanced',
              label: 'Advanced',
              initialValue: { kind: 'advanced', retries: 3 },
            },
          ],
        },
        presenter: { id: 'union.select' },
        alternatives: {
          basic: fieldNode('FORBIDDEN_BASIC_TEMPLATE', 'scalar.text'),
          advanced: fieldNode('FORBIDDEN_ADVANCED_TEMPLATE', 'scalar.number'),
        },
      };
      const rendered = mountPresenter(
        'union.select',
        commonProps(node, value),
        () => h('span', { 'data-slot-child': 'selected' }, 'SLOT_SELECTED_ALTERNATIVE'),
      );
      await nextTick();

      expect(rendered.target.textContent).toContain('SLOT_SELECTED_ALTERNATIVE');
      expect(rendered.target.textContent).not.toContain('FORBIDDEN_BASIC_TEMPLATE');
      expect(rendered.target.querySelector('.el-select')).not.toBeNull();
      await chooseElementPlusOption('Advanced');

      expect(rendered.emitted).toEqual([
        {
          event: 'alternative.select',
          payload: {
            alternativeId: 'advanced',
            initialValue: { kind: 'advanced', retries: 3 },
          },
        },
      ]);
      expect(value).toEqual({ kind: 'basic', title: 'Accepted title' });
    });

    it('renders unsupported as diagnostics without JSON, raw, textarea, or code fallback', async () => {
      const node: EditorPlanNode = {
        kind: 'custom',
        id: 'unsupported-opaque',
        path: ['opaque'],
        metadata: { display: display('Opaque value') },
        presenter: { id: 'unsupported' },
        diagnostics: [{
          severity: 'error',
          code: 'UNSUPPORTED_SCHEMA_EDITOR',
          message: 'No presenter supports opaque values',
        }],
      };
      const rendered = mountPresenter(
        'unsupported',
        commonProps(node, { secret: 'accepted' }, {
          diagnostics: node.diagnostics!,
        }),
      );
      await nextTick();

      expect(rendered.target.textContent).toContain(
        'No presenter supports opaque values',
      );
      expect(rendered.target.querySelector('.el-alert')).not.toBeNull();
      expect(rendered.target.querySelector('textarea')).toBeNull();
      expect(rendered.target.querySelector('code, [contenteditable="true"]')).toBeNull();
      expect(rendered.target.textContent).not.toContain('{"secret":"accepted"}');
      expect(rendered.emitted).toEqual([]);
    });

    it('keeps presenter components free of host, persistence, recursion, and direct-mutation ownership', () => {
      const registry = createDefaultRegistry!({}, {}, {});
      expect(registry.ok).toBe(true);
      if (!registry.ok) return;
      const presenterIds = [
        'object.group',
        'scalar.text',
        'collection.list',
        'map.entries',
        'union.select',
        'unsupported',
      ];
      for (const id of presenterIds) {
        const resolution = registry.registry.resolve(id);
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) continue;
        const component = resolution.adapter.component as unknown as {
          props?: Record<string, unknown>;
          setup?: unknown;
        };
        expect(Object.keys(component.props ?? {}).sort()).toEqual([
          'diagnostics',
          'eventContext',
          'node',
          'onSchemaEditorEvent',
          'path',
          'pending',
          'presenterOptions',
          'value',
        ]);
        expect(String(component.setup ?? '')).not.toMatch(
          /\b(?:SchemaEditorSession|ValueHost|hostWriter|writer|Flow|XNL|VFS|database)\b/i,
        );
        expect(String(component.setup ?? '')).not.toMatch(/JSON\.stringify|props\.value\s*=/);
      }

      const sourceDirectory = join(process.cwd(), 'src', 'schema-editor');
      const presenterSources = readdirSync(sourceDirectory, { recursive: true })
        .filter((name): name is string => typeof name === 'string' && /\.ts$/.test(name))
        .filter((name) => !/(?:registry|composition|index)\.ts$/i.test(name))
        .map((name) => ({
          name,
          source: readFileSync(join(sourceDirectory, name), 'utf8'),
        }));
      expect(presenterSources.length).toBeGreaterThan(0);
      const allSources = presenterSources.map(({ source }) => source).join('\n');
      expect(allSources).not.toMatch(
        /from\s+['"][^'"]*(?:flow|xnl|vfs|database)|\b(?:SchemaEditorSession|ValueHost|hostWriter)\b/i,
      );
      for (const { name, source } of presenterSources) {
        expect(source).not.toMatch(
          /props\.value\s*(?:=|\[[^\]]+\]\s*=|\.\w+\s*=)/,
        );
        if (!/^structured-value\//.test(name)) {
          expect(source).not.toMatch(
            /JSON\.(?:parse|stringify)|raw\s*editor|code\s*editor|monaco-editor|vanilla-jsoneditor/i,
          );
        }
      }
    });
  },
);
