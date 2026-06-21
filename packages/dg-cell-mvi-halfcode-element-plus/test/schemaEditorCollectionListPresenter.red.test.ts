// @vitest-environment jsdom

import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type VNodeChild,
} from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CollectionListPresenter,
  resolveCollectionDragMove,
} from '../src/schema-editor/collection/collectionListPresenter';

interface CapturedSortableCallbacks {
  readonly forceFallback?: boolean;
  readonly fallbackOnBody?: boolean;
  readonly onChoose?: (event: Readonly<{
    item: HTMLElement;
    from: HTMLElement;
    originalEvent?: Event;
  }>) => void;
  readonly onEnd?: (event: Readonly<{
    item: HTMLElement;
    from: HTMLElement;
    oldIndex?: number;
    oldDraggableIndex?: number;
    newIndex?: number;
    newDraggableIndex?: number;
    originalEvent?: Event;
  }>) => void;
}

const capturedSortables = vi.hoisted(() => [] as Array<{
  element: HTMLElement;
  options: CapturedSortableCallbacks;
}>);

vi.mock('sortablejs', () => ({
  default: {
    create(element: HTMLElement, options: CapturedSortableCallbacks) {
      capturedSortables.push({ element, options });
      return {
        destroy() {},
        option() {},
      };
    },
  },
}));

const mountedApps: App[] = [];
type EditorPlanNode = SchemaEditorPresenterProps['node'];
type SchemaEditorContractValue = Exclude<
  SchemaEditorPresenterProps['value'],
  undefined
>;

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  capturedSortables.splice(0);
  document.body.replaceChildren();
});

function collectionNode(
  metadata: Readonly<Record<string, unknown>>,
  itemTemplate?: unknown,
): EditorPlanNode {
  return {
    kind: 'collection',
    id: 'members',
    path: ['members'],
    metadata: {
      display: {
        label: 'Members',
        description: 'Ordered project members',
        visible: true,
        readOnly: false,
      },
      ...metadata,
    },
    presenter: { id: 'collection.list' },
    ...(itemTemplate === undefined ? {} : { itemTemplate }),
  } as EditorPlanNode;
}

function presenterProps(
  node: EditorPlanNode,
  value: SchemaEditorContractValue | undefined,
  overrides: Partial<SchemaEditorPresenterProps> = {},
): SchemaEditorPresenterProps {
  return {
    node,
    value,
    path: node.path,
    presenterOptions: undefined,
    pending: false,
    diagnostics: [],
    eventContext: Object.freeze({ wildcardBindings: Object.freeze([]) }),
    onSchemaEditorEvent: () => {},
    ...overrides,
  };
}

function mountCollection(
  props: SchemaEditorPresenterProps,
  slot?: () => VNodeChild,
) {
  const events: SchemaEditorPresenterEvent[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        CollectionListPresenter,
        {
          ...props,
          onSchemaEditorEvent(event: SchemaEditorPresenterEvent) {
            events.push(structuredClone(event));
          },
        },
        slot ? { default: slot } : undefined,
      );
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return { target, events, app };
}

function action(
  target: HTMLElement,
  actionName: string,
  qualifier = '',
): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>(
    `[data-schema-editor-action="${actionName}"]${qualifier}`,
  );
  expect(button, `Missing ${actionName} control ${qualifier}`).not.toBeNull();
  return button!;
}

function freezeContract<T extends SchemaEditorContractValue>(value: T): T {
  Object.freeze(value);
  return value;
}

function sortableFor(container: HTMLElement): CapturedSortableCallbacks {
  const captured = [...capturedSortables]
    .reverse()
    .find((candidate) => candidate.element === container);
  expect(captured, 'Missing captured Sortable instance').toBeDefined();
  return captured!.options;
}

function setItemRect(item: HTMLElement, top: number, bottom: number): void {
  vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  });
}

describe('Element Plus Schema Editor collection.list T3.1', () => {
  it('emits normalized insert/remove/move events from real icon buttons without mutating accepted items', async () => {
    const itemDefault = Object.freeze({
      id: '',
      profile: Object.freeze({ label: 'New member' }),
    });
    const accepted = freezeContract([
      Object.freeze({ id: 'a' }),
      Object.freeze({ id: 'b' }),
      Object.freeze({ id: 'c' }),
    ]);
    let templateReads = 0;
    const node = collectionNode({ itemDefault });
    Object.defineProperty(node, 'itemTemplate', {
      enumerable: true,
      get() {
        templateReads += 1;
        throw new Error('Presenter must not read itemTemplate.');
      },
    });
    const rendered = mountCollection(
      presenterProps(node, accepted),
      () => [
        h('div', { 'data-slot-item': '0' }, 'Alpha'),
        h('div', { 'data-slot-item': '1' }, 'Beta'),
        h('div', { 'data-slot-item': '2' }, 'Gamma'),
      ],
    );
    await nextTick();

    const add = action(rendered.target, 'item.insert');
    const remove = action(
      rendered.target,
      'item.remove',
      '[data-schema-editor-index="1"]',
    );
    const moveUp = action(
      rendered.target,
      'item.move',
      '[data-schema-editor-from-index="1"][data-schema-editor-to-index="0"]',
    );
    const moveDown = action(
      rendered.target,
      'item.move',
      '[data-schema-editor-from-index="1"][data-schema-editor-to-index="2"]',
    );

    expect(add.getAttribute('aria-label')).toBe('Add item');
    expect(remove.getAttribute('aria-label')).toBe('Remove item 2');
    expect(moveUp.getAttribute('aria-label')).toBe('Move item 2 up');
    expect(moveDown.getAttribute('aria-label')).toBe('Move item 2 down');
    expect(rendered.target.querySelectorAll('.el-button .el-icon svg').length)
      .toBeGreaterThanOrEqual(4);
    expect(
      rendered.target.querySelector<HTMLElement>(
        '[data-schema-editor-role="collection-toolbar"]',
      )?.style.minHeight,
    ).toBe('32px');
    add.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.body.textContent).toContain('Add item');

    add.click();
    remove.click();
    moveUp.click();
    moveDown.click();
    await nextTick();

    expect(rendered.events).toEqual([
      {
        event: 'item.insert',
        payload: {
          index: 3,
          value: { id: '', profile: { label: 'New member' } },
        },
      },
      { event: 'item.remove', payload: { index: 1 } },
      { event: 'item.move', payload: { fromIndex: 1, toIndex: 0 } },
      { event: 'item.move', payload: { fromIndex: 1, toIndex: 2 } },
    ]);
    expect(rendered.events[0]?.payload).not.toBe(itemDefault);
    expect(accepted).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(templateReads).toBe(0);
  });

  it('mounts the mature drag engine on a visible handle without mutating accepted data', async () => {
    const accepted = freezeContract([
      Object.freeze({ id: 'a' }),
      Object.freeze({ id: 'b' }),
      Object.freeze({ id: 'c' }),
    ]);
    const rendered = mountCollection(
      presenterProps(collectionNode({ itemDefault: { id: '' } }), accepted),
      () => [h('div', 'Alpha'), h('div', 'Beta'), h('div', 'Gamma')],
    );
    await nextTick();

    const handle = action(
      rendered.target,
      'item.drag',
      '[data-schema-editor-index="0"]',
    );
    const target = rendered.target.querySelector<HTMLElement>(
      '[data-schema-editor-role="collection-item"][data-schema-editor-index="2"]',
    );
    expect(target).not.toBeNull();
    expect(handle.draggable).toBe(false);
    expect(handle.getAttribute('aria-label')).toBe('Drag item 1 to reorder');
    expect(rendered.target.querySelector(
      '[data-schema-editor-drag-engine="sortablejs"]',
    )).not.toBeNull();
    const container = rendered.target.querySelector<HTMLElement>(
      '[data-schema-editor-role="collection-items"]',
    );
    expect(container).not.toBeNull();
    expect(sortableFor(container!).onEnd).toBeTypeOf('function');
    expect(rendered.events).toEqual([]);
    expect(accepted).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('resolves a visible fallback drag when Sortable reports the original index', () => {
    expect(resolveCollectionDragMove({
      reportedFromIndex: 1,
      reportedToIndex: 1,
      intendedMove: undefined,
      dropClientY: 10,
      itemRects: [
        { index: 0, top: 0, bottom: 40 },
        { index: 2, top: 48, bottom: 88 },
      ],
    })).toEqual({ fromIndex: 1, toIndex: 0 });

    expect(resolveCollectionDragMove({
      reportedFromIndex: 1,
      reportedToIndex: 1,
      intendedMove: { fromIndex: 1, toIndex: 0 },
      dropClientY: 30,
      itemRects: [
        { index: 0, top: 0, bottom: 40 },
        { index: 2, top: 48, bottom: 88 },
      ],
    })).toEqual({ fromIndex: 1, toIndex: 0 });
  });

  it('commits a native drag only from dragend after Sortable reports pointerup, with no duplicate or unchanged move', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: { id: '' } }),
        freezeContract([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      ),
      () => [h('div', 'Alpha'), h('div', 'Beta'), h('div', 'Gamma')],
    );
    await nextTick();

    const container = rendered.target.querySelector<HTMLElement>(
      '[data-schema-editor-role="collection-items"]',
    );
    expect(container).not.toBeNull();
    const sortable = sortableFor(container!);
    expect(sortable.onChoose).toBeDefined();
    expect(sortable.onEnd).toBeDefined();
    const items = [...container!.querySelectorAll<HTMLElement>(
      '[data-schema-editor-role="collection-item"]',
    )];
    const [first, second, third] = items;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    setItemRect(second!, 0, 40);
    setItemRect(third!, 48, 88);

    sortable.onChoose!({ item: first!, from: container! });
    first!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    container!.append(first!);
    const pointerup = new MouseEvent('pointerup', {
      bubbles: true,
      clientY: 80,
    });
    first!.dispatchEvent(pointerup);
    sortable.onEnd!({
      from: container!,
      item: first!,
      oldIndex: 0,
      newIndex: 0,
      originalEvent: pointerup,
    });

    expect(rendered.events).toEqual([]);
    expect([...container!.children].map(
      (item) => (item as HTMLElement).dataset.schemaEditorIndex,
    )).toEqual(['1', '2', '0']);

    first!.dispatchEvent(new MouseEvent('drop', {
      bubbles: true,
      clientY: 80,
    }));
    first!.dispatchEvent(new Event('dragend', { bubbles: true }));

    expect(rendered.events).toEqual([
      { event: 'item.move', payload: { fromIndex: 0, toIndex: 2 } },
    ]);
    expect([...container!.children].map(
      (item) => (item as HTMLElement).dataset.schemaEditorIndex,
    )).toEqual(['0', '1', '2']);

    sortable.onEnd!({
      from: container!,
      item: first!,
      oldIndex: 0,
      newIndex: 2,
    });
    expect(rendered.events).toHaveLength(1);

    sortable.onChoose!({ item: second!, from: container! });
    second!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const unchangedPointerup = new MouseEvent('pointerup', {
      bubbles: true,
      clientY: 30,
    });
    second!.dispatchEvent(unchangedPointerup);
    sortable.onEnd!({
      from: container!,
      item: second!,
      oldIndex: 1,
      newIndex: 1,
      originalEvent: unchangedPointerup,
    });
    second!.dispatchEvent(new Event('dragend', { bubbles: true }));

    expect(rendered.events).toHaveLength(1);
  });

  it('keeps fallback Sortable onEnd as a single immediate commit', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: { id: '' } }),
        freezeContract([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      ),
      () => [h('div', 'Alpha'), h('div', 'Beta'), h('div', 'Gamma')],
    );
    await nextTick();

    const container = rendered.target.querySelector<HTMLElement>(
      '[data-schema-editor-role="collection-items"]',
    );
    expect(container).not.toBeNull();
    const sortable = sortableFor(container!);
    const first = container!.querySelector<HTMLElement>(
      '[data-schema-editor-index="0"]',
    );
    expect(first).not.toBeNull();

    sortable.onChoose!({ item: first!, from: container! });
    container!.append(first!);
    sortable.onEnd!({
      from: container!,
      item: first!,
      oldIndex: 0,
      newIndex: 2,
    });

    expect(rendered.events).toEqual([
      { event: 'item.move', payload: { fromIndex: 0, toIndex: 2 } },
    ]);
    expect([...container!.children].map(
      (item) => (item as HTMLElement).dataset.schemaEditorIndex,
    )).toEqual(['0', '1', '2']);
  });

  it('commits repeated pointer terminals exactly once and restores DOM order', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: { id: '' } }),
        freezeContract([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      ),
      () => [h('div', 'Alpha'), h('div', 'Beta'), h('div', 'Gamma')],
    );
    await nextTick();

    const container = rendered.target.querySelector<HTMLElement>(
      '[data-schema-editor-role="collection-items"]',
    );
    expect(container).not.toBeNull();
    const sortable = sortableFor(container!);
    expect(sortable.onEnd).toBeTypeOf('function');
    const [first, second, third] = [...container!.querySelectorAll<HTMLElement>(
      '[data-schema-editor-role="collection-item"]',
    )];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    setItemRect(second!, 0, 40);
    setItemRect(third!, 48, 88);

    sortable.onChoose!({ item: first!, from: container! });
    container!.append(first!);
    const pointerup = new MouseEvent('pointerup', {
      bubbles: true,
      clientY: 80,
    });
    first!.dispatchEvent(pointerup);
    first!.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientY: 80,
    }));
    sortable.onEnd!({
      from: container!,
      item: first!,
      oldIndex: 0,
      newIndex: 0,
      originalEvent: pointerup,
    });
    await nextTick();

    expect(rendered.events).toEqual([
      { event: 'item.move', payload: { fromIndex: 0, toIndex: 2 } },
    ]);
    expect([...container!.children].map(
      (item) => (item as HTMLElement).dataset.schemaEditorIndex,
    )).toEqual(['0', '1', '2']);
  });

  it('renders every item as an aligned collapsible block with header actions', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({
          itemDefault: { id: '' },
          identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        }),
        freezeContract([{ id: 'first' }, { id: 'second' }]),
      ),
      () => [
        h('div', { 'data-slot-item': 'first' }, 'First content'),
        h('div', { 'data-slot-item': 'second' }, 'Second content'),
      ],
    );
    await nextTick();

    const items = rendered.target.querySelectorAll<HTMLElement>(
      '[data-schema-editor-role="collection-item"]',
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('1. first');
    expect(items[1]?.textContent).toContain('2. second');
    for (const item of items) {
      expect(item.querySelectorAll(
        '[data-schema-editor-action="item.drag"]',
      )).toHaveLength(1);
      expect(item.querySelectorAll(
        '[data-schema-editor-role="collection-item-header"]',
      )).toHaveLength(1);
      expect(item.getAttribute('data-schema-editor-expanded')).toBe('true');
    }

    action(
      items[0]!,
      'item.toggle',
      '[data-schema-editor-index="0"]',
    ).click();
    await nextTick();
    expect(items[0]?.getAttribute('data-schema-editor-expanded')).toBe('false');
    expect(items[0]?.querySelector(
      '[data-schema-editor-role="collection-item-content"]',
    )).toBeNull();
    expect(items[1]?.textContent).toContain('Second content');

    action(
      items[0]!,
      'item.toggle',
      '[data-schema-editor-index="0"]',
    ).click();
    await nextTick();
    expect(items[0]?.getAttribute('data-schema-editor-expanded')).toBe('true');
    expect(items[0]?.textContent).toContain('First content');
    expect(rendered.events).toEqual([]);
  });

  it('expands and collapses the whole collection without emitting data mutations', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({
          itemDefault: { id: '' },
          identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        }),
        freezeContract([{ id: 'first' }, { id: 'second' }]),
      ),
      () => [
        h('div', { key: 'stable-first' }, 'First content'),
        h('div', { key: 'stable-second' }, 'Second content'),
      ],
    );
    await nextTick();

    action(rendered.target, 'collection.collapse-all').click();
    await nextTick();
    expect([
      ...rendered.target.querySelectorAll<HTMLElement>(
        '[data-schema-editor-role="collection-item"]',
      ),
    ].map((item) => item.dataset.schemaEditorExpanded)).toEqual([
      'false',
      'false',
    ]);

    action(rendered.target, 'collection.expand-all').click();
    await nextTick();
    expect([
      ...rendered.target.querySelectorAll<HTMLElement>(
        '[data-schema-editor-role="collection-item"]',
      ),
    ].map((item) => item.dataset.schemaEditorExpanded)).toEqual([
      'true',
      'true',
    ]);
    expect(rendered.events).toEqual([]);
  });

  it('keeps collapse state attached to renderer identity when an item is renamed and reordered', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const items = ref<Array<{ id: string; stableKey: string }>>([
      { id: 'draft', stableKey: 'stable-a' },
      { id: 'second', stableKey: 'stable-b' },
    ]);
    const node = collectionNode({
      itemDefault: { id: '' },
      identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
    });
    const app = createApp(defineComponent({
      setup() {
        return () => h(
          CollectionListPresenter,
          presenterProps(node, items.value as SchemaEditorContractValue, {
            onSchemaEditorEvent(event) {
              if (event.event !== 'item.move') return;
              const payload = event.payload as {
                fromIndex: number;
                toIndex: number;
              };
              const next = [...items.value];
              const [moved] = next.splice(payload.fromIndex, 1);
              next.splice(payload.toIndex, 0, moved!);
              items.value = next;
            },
          }),
          {
            default: () => items.value.map((item) =>
              h('div', { key: item.stableKey }, `${item.id} content`)),
          },
        );
      },
    }));
    app.mount(target);
    mountedApps.push(app);
    await nextTick();

    action(target, 'item.toggle', '[data-schema-editor-index="0"]').click();
    await nextTick();
    items.value = [
      { id: 'renamed', stableKey: 'stable-a' },
      items.value[1]!,
    ];
    await nextTick();
    action(
      target,
      'item.move',
      '[data-schema-editor-from-index="0"][data-schema-editor-to-index="1"]',
    ).click();
    await nextTick();

    const renamed = [...target.querySelectorAll<HTMLElement>(
      '[data-schema-editor-role="collection-item"]',
    )].find((item) => item.textContent?.includes('renamed'));
    expect(renamed?.dataset.schemaEditorExpanded).toBe('false');
    expect(renamed?.querySelector(
      '[data-schema-editor-role="collection-item-content"]',
    )).toBeNull();
  });

  it('restores collapse state when the same render scope is remounted', async () => {
    const node = collectionNode({
      itemDefault: { id: '' },
      identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
    });
    const props = presenterProps(
      node,
      freezeContract([{ id: 'first' }, { id: 'second' }]),
      {
        eventContext: Object.freeze({
          wildcardBindings: Object.freeze([]),
          renderScopeKey: 'collection-remount-test',
        }),
      },
    );
    const slot = () => [
      h('div', { key: 'stable-first' }, 'First content'),
      h('div', { key: 'stable-second' }, 'Second content'),
    ];
    const first = mountCollection(props, slot);
    await nextTick();
    action(first.target, 'item.toggle', '[data-schema-editor-index="0"]').click();
    await nextTick();
    first.app.unmount();
    mountedApps.splice(mountedApps.indexOf(first.app), 1);
    first.target.remove();

    const second = mountCollection(props, slot);
    await nextTick();
    const items = second.target.querySelectorAll<HTMLElement>(
      '[data-schema-editor-role="collection-item"]',
    );
    expect(items[0]?.dataset.schemaEditorExpanded).toBe('false');
    expect(items[1]?.dataset.schemaEditorExpanded).toBe('true');
  });

  it('generates a unique property identity for repeated inserts', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({
          itemDefault: { id: 'branch' },
          identity: { strategy: 'property', path: ['id'], fallback: 'ephemeral' },
        }),
        freezeContract([{ id: 'branch' }, { id: 'branch-2' }]),
      ),
      () => [h('span', 'Branch 1'), h('span', 'Branch 2')],
    );
    await nextTick();

    action(rendered.target, 'item.insert').click();
    expect(rendered.events).toEqual([
      {
        event: 'item.insert',
        payload: { index: 2, value: { id: 'branch-3' } },
      },
    ]);
  });

  it('disables boundary moves and all writes while readOnly or pending', async () => {
    const accepted = freezeContract(['first', 'second']);
    const node = collectionNode({ itemDefault: '' });
    const normal = mountCollection(
      presenterProps(node, accepted),
      () => [
        h('span', { 'data-slot-item': '0' }, 'First'),
        h('span', { 'data-slot-item': '1' }, 'Second'),
      ],
    );
    await nextTick();

    expect(action(
      normal.target,
      'item.move',
      '[data-schema-editor-from-index="0"][data-schema-editor-to-index="-1"]',
    ).disabled).toBe(true);
    expect(action(
      normal.target,
      'item.move',
      '[data-schema-editor-from-index="1"][data-schema-editor-to-index="2"]',
    ).disabled).toBe(true);
    expect(action(
      normal.target,
      'item.move',
      '[data-schema-editor-from-index="0"][data-schema-editor-to-index="1"]',
    ).disabled).toBe(false);

    const readOnlyNode = collectionNode({
      itemDefault: '',
      display: {
        label: 'Read only members',
        visible: true,
        readOnly: true,
      },
    });
    const readOnly = mountCollection(
      presenterProps(readOnlyNode, accepted),
      () => [h('span', 'First'), h('span', 'Second')],
    );
    const pending = mountCollection(
      presenterProps(node, accepted, { pending: true }),
      () => [h('span', 'First'), h('span', 'Second')],
    );
    await nextTick();

    for (const rendered of [readOnly, pending]) {
      const writeButtons = [
        ...rendered.target.querySelectorAll<HTMLButtonElement>(
          '[data-schema-editor-action^="item."]'
            + ':not([data-schema-editor-action="item.toggle"])',
        ),
      ];
      expect(writeButtons.length).toBeGreaterThan(0);
      expect(writeButtons.every((button) => button.disabled)).toBe(true);
      expect(
        [...rendered.target.querySelectorAll<HTMLElement>(
          '[data-schema-editor-action="item.drag"]',
        )].every((handle) => handle.draggable === false),
      ).toBe(true);
      for (const button of writeButtons) button.click();
      const toggle = action(rendered.target, 'item.toggle');
      expect(toggle.disabled).toBe(false);
      toggle.click();
      await nextTick();
      expect(rendered.events).toEqual([]);
    }
  });

  it('renders an addable empty state and preserves nested slot VNodes exactly once', async () => {
    const empty = mountCollection(
      presenterProps(collectionNode({ itemDefault: null }), freezeContract([])),
    );
    await nextTick();

    expect(empty.target.textContent).toContain('No items yet.');
    expect(
      empty.target.querySelectorAll('[data-schema-editor-role="collection-item"]'),
    ).toHaveLength(0);
    action(empty.target, 'item.insert').click();
    expect(empty.events).toEqual([
      { event: 'item.insert', payload: { index: 0, value: null } },
    ]);

    const nested = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: Object.freeze([]) }),
        freezeContract([freezeContract(['nested'])]),
      ),
      () => h(
        'section',
        { 'data-slot-item': 'nested' },
        [
          h('span', { 'data-nested-child': 'first' }, 'Nested first'),
          h('span', { 'data-nested-child': 'second' }, 'Nested second'),
        ],
      ),
    );
    await nextTick();

    expect(nested.target.querySelectorAll('[data-slot-item="nested"]'))
      .toHaveLength(1);
    expect(nested.target.querySelectorAll('[data-nested-child]'))
      .toHaveLength(2);
    expect(nested.target.textContent).toContain('Nested first');
    expect(nested.target.textContent).toContain('Nested second');
  });

  it('fails closed with visible diagnostics for slot-count mismatch', async () => {
    const rendered = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: { id: '' } }),
        freezeContract([{ id: 'a' }, { id: 'b' }]),
      ),
      () => h('span', { 'data-slot-item': '0' }, 'Only one slot'),
    );
    await nextTick();

    expect(rendered.target.textContent).toContain(
      'Collection item slots do not match the accepted item count.',
    );
    expect(
      rendered.target.querySelector(
        '[data-schema-editor-diagnostic-code="COLLECTION_SLOT_MISMATCH"]',
      ),
    ).not.toBeNull();
    expect(
      [...rendered.target.querySelectorAll<HTMLButtonElement>(
        '[data-schema-editor-action]',
      )].every((button) => button.disabled),
    ).toBe(true);
    expect(
      rendered.target.querySelectorAll('[data-slot-item]'),
    ).toHaveLength(0);
    expect(rendered.events).toEqual([]);
  });

  it('fails closed for hostile accepted arrays and item defaults without executing accessors', async () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    const hostileValue = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: '' }),
        revoked.proxy as unknown as SchemaEditorContractValue,
      ),
    );

    let defaultReads = 0;
    const hostileDefault = {} as Record<string, unknown>;
    Object.defineProperty(hostileDefault, 'secret', {
      enumerable: true,
      get() {
        defaultReads += 1;
        throw new Error('Hostile item default accessor must not execute.');
      },
    });
    const badDefault = mountCollection(
      presenterProps(
        collectionNode({ itemDefault: hostileDefault }),
        freezeContract([]),
      ),
    );
    const missingDefault = mountCollection(
      presenterProps(
        collectionNode({}),
        freezeContract(['accepted']),
      ),
      () => h('span', { 'data-slot-item': 'accepted' }, 'Accepted item'),
    );
    await nextTick();

    expect(hostileValue.target.textContent).toContain(
      'Collection value is not a readable accepted array.',
    );
    expect(badDefault.target.textContent).toContain(
      'Collection item default is not contract-serializable.',
    );
    expect(defaultReads).toBe(0);
    expect(
      [...hostileValue.target.querySelectorAll<HTMLButtonElement>(
        '[data-schema-editor-action]',
      )].every((button) => button.disabled),
    ).toBe(true);
    expect(action(badDefault.target, 'item.insert').disabled).toBe(true);
    expect(missingDefault.target.textContent).toContain('Accepted item');
    expect(action(missingDefault.target, 'item.insert').disabled).toBe(true);
    expect(action(
      missingDefault.target,
      'item.remove',
      '[data-schema-editor-index="0"]',
    ).disabled).toBe(false);
    expect(missingDefault.target.textContent).not.toContain(
      'Collection item default is not contract-serializable.',
    );
    expect(hostileValue.events).toEqual([]);
    expect(badDefault.events).toEqual([]);
  });
});
