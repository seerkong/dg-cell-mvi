// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  nextTick,
  type App,
} from 'vue';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  EditorPlanNode,
  SchemaEditorCommand,
} from 'dg-cell-mvi-halfcode-contract';

import {
  KITCHEN_SINK_PRESENTER_IDS,
  SCHEMA_EDITOR_KITCHEN_SINK_INITIAL_VALUE,
  SCHEMA_EDITOR_KITCHEN_SINK_PRESENTATION,
  SCHEMA_EDITOR_KITCHEN_SINK_SCHEMA,
  createSchemaEditorKitchenSinkCompilerRuntime,
  createSchemaEditorKitchenSinkPlan,
  mountSchemaEditorKitchenSinkDemo,
  type MountedSchemaEditorKitchenSinkDemo,
} from '../demo/schemaEditorKitchenSinkFixture';

const mountedDemos: MountedSchemaEditorKitchenSinkDemo[] = [];

afterEach(() => {
  for (const demo of mountedDemos.splice(0)) demo.dispose();
  document.body.replaceChildren();
});

async function mountKitchenSink():
Promise<MountedSchemaEditorKitchenSinkDemo> {
  const target = document.createElement('div');
  target.dataset.schemaEditorDemo = 'kitchen-sink';
  document.body.appendChild(target);
  const mounted = await mountSchemaEditorKitchenSinkDemo(target);
  mountedDemos.push(mounted);
  return mounted;
}

function presenter(
  target: Element,
  id: string,
  text?: string,
): HTMLElement {
  const candidates = [
    ...target.querySelectorAll<HTMLElement>(
      `[data-schema-editor-presenter="${id}"]`,
    ),
  ];
  const match = text === undefined
    ? candidates[0]
    : candidates.find((candidate) => candidate.textContent?.includes(text));
  expect(match, `Missing ${id}${text ? ` for ${text}` : ''}.`).toBeDefined();
  return match!;
}

function textInput(
  target: Element,
  id: string,
  label: string,
): HTMLInputElement {
  const section = presenter(target, id, label);
  const input = section.querySelector<HTMLInputElement>(
    '.el-input input, input',
  );
  expect(input, `Missing input for ${id}:${label}.`).not.toBeNull();
  return input!;
}

async function setInput(input: HTMLInputElement, value: string):
Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

function action(
  target: Element,
  event: string,
  qualifier = '',
): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>(
    `[data-schema-editor-action="${event}"]${qualifier}`,
  );
  expect(button, `Missing ${event}${qualifier} action.`).not.toBeNull();
  return button!;
}

async function chooseOption(
  section: HTMLElement,
  label: string,
): Promise<void> {
  const trigger = section.querySelector<HTMLElement>(
    '.el-select__wrapper, .el-select',
  );
  expect(trigger, 'Expected a real Element Plus select.').not.toBeNull();
  trigger!.click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const option = [
    ...document.body.querySelectorAll<HTMLElement>(
      '.el-select-dropdown__item',
    ),
  ].find((candidate) => candidate.textContent?.includes(label));
  expect(option, `Missing Element Plus option ${label}.`).toBeDefined();
  option!.click();
  await nextTick();
}

function collectPresenterIds(node: EditorPlanNode): string[] {
  const own = node.presenter?.id ? [node.presenter.id] : [];
  switch (node.kind) {
    case 'group':
      return [...own, ...node.children.flatMap(collectPresenterIds)];
    case 'collection':
      return [...own, ...collectPresenterIds(node.itemTemplate)];
    case 'map':
      return [...own, ...collectPresenterIds(node.valueTemplate)];
    case 'union':
      return [
        ...own,
        ...Object.values(node.alternatives).flatMap(collectPresenterIds),
      ];
    default:
      return own;
  }
}

function latestCommand(
  mounted: MountedSchemaEditorKitchenSinkDemo,
): SchemaEditorCommand {
  const request = mounted.host.requests.at(-1);
  expect(request).toBeDefined();
  return request!.command;
}

async function waitForCommand(
  mounted: MountedSchemaEditorKitchenSinkDemo,
  expected: SchemaEditorCommand,
): Promise<void> {
  await vi.waitFor(() => {
    expect(latestCommand(mounted)).toEqual(expected);
    expect(mounted.session.getState().pending).toEqual([]);
  });
}

async function waitForTitle(
  mounted: MountedSchemaEditorKitchenSinkDemo,
  expected: string,
): Promise<void> {
  await vi.waitFor(() => {
    expect(textInput(
      mounted.target,
      'scalar.text',
      'Title',
    ).value).toBe(expected);
  });
}

describe('Element Plus Schema Editor kitchen-sink canonical integration', () => {
  it('compiles and mounts the one demo fixture through the real canonical lifecycle', async () => {
    const plan = createSchemaEditorKitchenSinkPlan();
    const planPresenterIds = new Set(collectPresenterIds(plan.root));

    expect(createSchemaEditorKitchenSinkCompilerRuntime().dialect.id)
      .toContain('schema-editor.composed');
    expect(SCHEMA_EDITOR_KITCHEN_SINK_SCHEMA).toMatchObject({
      kind: 'object',
      id: 'kitchen',
    });
    expect(SCHEMA_EDITOR_KITCHEN_SINK_PRESENTATION).toMatchObject({
      kind: 'presentation',
      id: 'kitchen.presentation',
    });
    expect(SCHEMA_EDITOR_KITCHEN_SINK_INITIAL_VALUE.title).toBe('Before');
    for (const id of KITCHEN_SINK_PRESENTER_IDS) {
      expect(planPresenterIds, `Compiler plan is missing ${id}.`).toContain(id);
    }

    const mounted = await mountKitchenSink();
    expect(mounted.diagnostics).toEqual([]);
    expect(Object.keys(mounted.sourceBundle.sourceMap)).toHaveLength(5);
    expect(mounted.sourceBundle.manifestUri).toMatch(
      /^vfs:\/\/@\/schema-editor-runtime\//,
    );
    expect(mounted.appRuntime.bundle.diagnostics.filter(
      ({ severity }) => severity === 'error',
    )).toEqual([]);
    expect(mounted.appRuntime.plans.diagnostics.filter(
      ({ severity }) => severity === 'error',
    )).toEqual([]);
    expect(Object.values(mounted.appRuntime.assemblies).flatMap(
      ({ diagnostics }) => diagnostics,
    )).toEqual([]);

    const renderedIds = new Set([
      ...mounted.target.querySelectorAll<HTMLElement>(
        '[data-schema-editor-presenter]',
      ),
    ].map((element) => element.dataset.schemaEditorPresenter));
    for (const id of KITCHEN_SINK_PRESENTER_IDS) {
      expect(renderedIds, `Mounted DOM is missing ${id}.`).toContain(id);
    }

    const title = presenter(mounted.target, 'scalar.text', 'Title');
    expect(title.textContent).toContain(
      'Accepted-only title used by the host outcome harness.',
    );
    expect(title.querySelector('.is-required')).not.toBeNull();
    expect(textInput(mounted.target, 'scalar.text', 'Title').placeholder)
      .toBe('Kitchen title');

    const readOnly = textInput(
      mounted.target,
      'scalar.text',
      'Read only field',
    );
    expect(readOnly.readOnly || readOnly.disabled).toBe(true);
    expect(mounted.target.textContent).not.toContain('Hidden field');
    expect(
      mounted.target.querySelector(
        '[data-schema-editor-diagnostic-code="KITCHEN_SINK_WARNING"]',
      ),
    ).not.toBeNull();
    expect(
      mounted.target.querySelector(
        '[data-schema-editor-diagnostic-code="UNSUPPORTED_SCHEMA_EDITOR"]',
      ),
    ).not.toBeNull();
    expect(mounted.target.querySelector('code, [contenteditable="true"]'))
      .toBeNull();

    for (const structuralId of [
      'collection.list',
      'map.entries',
      'union.select',
    ]) {
      expect(
        presenter(mounted.target, structuralId).querySelector(
          '[data-schema-editor-presenter="object.group"]',
        ),
        `${structuralId} must receive nested content from the renderer slot.`,
      ).not.toBeNull();
    }
  });

  it('routes real value, item, entry, and alternative controls through normalized Session commands', async () => {
    const mounted = await mountKitchenSink();

    await setInput(
      textInput(mounted.target, 'scalar.text', 'Title'),
      'Accepted title',
    );
    await waitForTitle(mounted, 'Accepted title');
    expect(latestCommand(mounted)).toEqual({
      kind: 'value.set',
      target: ['title'],
      value: 'Accepted title',
    });

    let members = presenter(mounted.target, 'collection.list', 'Members');
    action(members, 'item.insert').click();
    await vi.waitFor(() => {
      expect(mounted.session.getState().snapshot.value).toMatchObject({
        members: [
          { id: 'ada', name: 'Ada' },
          { id: 'grace', name: 'Grace' },
          { id: 'new-member', name: 'New member' },
        ],
      });
    });
    expect(latestCommand(mounted)).toEqual({
      kind: 'collection.insert',
      target: ['members'],
      index: 2,
      value: { id: 'new-member', name: 'New member' },
    });

    members = presenter(mounted.target, 'collection.list', 'Members');
    action(
      members,
      'item.move',
      '[data-schema-editor-from-index="1"][data-schema-editor-to-index="0"]',
    ).click();
    await waitForCommand(mounted, {
      kind: 'collection.move',
      target: ['members'],
      from: 1,
      to: 0,
    });

    members = presenter(mounted.target, 'collection.list', 'Members');
    action(
      members,
      'item.remove',
      '[data-schema-editor-index="2"]',
    ).click();
    await waitForCommand(mounted, {
      kind: 'collection.remove',
      target: ['members'],
      index: 2,
    });

    let labels = presenter(mounted.target, 'map.entries', 'Labels');
    const newKey = labels.querySelector<HTMLInputElement>(
      '[data-schema-editor-role="entry-key-draft"] input,'
      + ' input[data-schema-editor-role="entry-key-draft"]',
    );
    expect(newKey).not.toBeNull();
    await setInput(newKey!, 'beta');
    action(labels, 'entry.set').click();
    await waitForCommand(mounted, {
      kind: 'map.set',
      target: ['labels'],
      key: 'beta',
      value: { label: 'New label', active: true },
    });

    labels = presenter(mounted.target, 'map.entries', 'Labels');
    const rename = labels.querySelector<HTMLInputElement>(
      '[data-schema-editor-role="entry-key"][data-schema-editor-key="alpha"]'
      + ' input, input[data-schema-editor-role="entry-key"]'
      + '[data-schema-editor-key="alpha"]',
    );
    expect(rename).not.toBeNull();
    await setInput(rename!, 'gamma');
    action(
      labels,
      'entry.rename',
      '[data-schema-editor-key="alpha"]',
    ).click();
    await waitForCommand(mounted, {
      kind: 'map.rename-key',
      target: ['labels'],
      from: 'alpha',
      to: 'gamma',
    });

    labels = presenter(mounted.target, 'map.entries', 'Labels');
    action(
      labels,
      'entry.remove',
      '[data-schema-editor-key="beta"]',
    ).click();
    await waitForCommand(mounted, {
      kind: 'map.remove',
      target: ['labels'],
      key: 'beta',
    });

    const union = presenter(mounted.target, 'union.select', 'Channel');
    await chooseOption(union, 'Advanced');
    await vi.waitFor(() => {
      expect(latestCommand(mounted)).toEqual({
        kind: 'union.select',
        target: ['channel'],
        alternativeId: 'advanced',
        initialValue: { kind: 'advanced', retries: 3 },
      });
      expect(mounted.session.getState().snapshot.value).toMatchObject({
        channel: { kind: 'advanced', retries: 3 },
      });
    });

    expect(mounted.host.requests.map(({ command }) => command.kind)).toEqual([
      'value.set',
      'collection.insert',
      'collection.move',
      'collection.remove',
      'map.set',
      'map.rename-key',
      'map.remove',
      'union.select',
    ]);
  }, 15_000);

  it('keeps pending, rejected, conflict, and stale outcomes off the DOM until an accepted snapshot arrives', async () => {
    const mounted = await mountKitchenSink();
    const acceptedTitle = () => (
      mounted.session.getState().snapshot.value as Readonly<
        Record<string, unknown>
      >
    ).title;

    mounted.host.setNextOutcome('pending');
    await setInput(
      textInput(mounted.target, 'scalar.text', 'Title'),
      'Pending title',
    );
    await vi.waitFor(() => {
      expect(mounted.session.getState().pending).toHaveLength(1);
      expect(presenter(
        mounted.target,
        'scalar.text',
        'Title',
      ).getAttribute('aria-busy')).toBe('true');
    });
    expect(acceptedTitle()).toBe('Before');
    expect(textInput(mounted.target, 'scalar.text', 'Title').value)
      .toBe('Before');

    mounted.host.resolvePending();
    await waitForTitle(mounted, 'Pending title');
    expect(acceptedTitle()).toBe('Pending title');
    expect(mounted.session.getState().pending).toEqual([]);

    for (const [outcome, attempted, diagnostic] of [
      ['rejected', 'Rejected title', 'SCHEMA_EDITOR_HOST_REJECTED'],
      ['conflict', 'Conflict title', 'SCHEMA_EDITOR_HOST_CONFLICT'],
      ['stale', 'Stale title', 'SCHEMA_EDITOR_STALE_ACCEPTANCE'],
    ] as const) {
      mounted.host.setNextOutcome(outcome);
      await setInput(
        textInput(mounted.target, 'scalar.text', 'Title'),
        attempted,
      );
      await vi.waitFor(() => {
        expect(mounted.session.getState().pending).toEqual([]);
        expect(mounted.session.getState().diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: diagnostic }),
          ]),
        );
      });
      expect(acceptedTitle()).toBe('Pending title');
      expect(textInput(mounted.target, 'scalar.text', 'Title').value)
        .toBe('Pending title');
    }

    mounted.host.setNextOutcome('accepted');
    await setInput(
      textInput(mounted.target, 'scalar.text', 'Title'),
      'Final accepted title',
    );
    await waitForTitle(mounted, 'Final accepted title');
    expect(acceptedTitle()).toBe('Final accepted title');
  });

  it('exposes one idempotent demo disposer without owning the scoped Session lifecycle in Vue', async () => {
    const mounted = await mountKitchenSink();
    const app: App = mounted.app;
    expect(mounted.session.getState().disposed).toBe(false);

    mounted.dispose();
    mounted.dispose();
    mountedDemos.splice(mountedDemos.indexOf(mounted), 1);

    expect(mounted.session.getState().disposed).toBe(true);
    expect(app).toBeDefined();
  });

  it('keeps one fixture, lowering, loader, runtime, renderer, and Scope Session path', () => {
    const fixtureSource = readFileSync(
      join(
        process.cwd(),
        'demo',
        'schemaEditorKitchenSinkFixture.ts',
      ),
      'utf8',
    );
    const testSource = readFileSync(
      join(
        process.cwd(),
        'test',
        'schemaEditorKitchenSink.integration.test.ts',
      ),
      'utf8',
    );

    for (const expression of [
      /\blowerEditorPlan\s*\(/g,
      /\bloadHalfcodeAppRuntime\s*\(/g,
      /\bcreateSchemaEditorSession\s*\(/g,
      /\bcreateApp\s*\(\s*CanonicalHalfcodeRenderer/g,
      /\bcreateElementPlusSchemaEditorCanonicalRegistry\s*\(/g,
    ]) {
      expect(fixtureSource.match(expression)).toHaveLength(1);
    }
    expect(fixtureSource).not.toMatch(
      /\bSchemaEditorSessionRenderer\b|\brenderSchemaEditorNode\s*\(/,
    );
    expect(testSource).toContain(
      "from '../demo/schemaEditorKitchenSinkFixture'",
    );
    expect(testSource).not.toMatch(
      /const\s+SCHEMA_EDITOR_KITCHEN_SINK_(?:SCHEMA|PRESENTATION|INITIAL_VALUE)\s*=/,
    );
  });
});
