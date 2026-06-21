import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Delete,
  Plus,
  Rank,
} from '@element-plus/icons-vue';
import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElIcon,
  ElTooltip,
} from 'element-plus';
import {
  defineComponent,
  h,
  onBeforeUnmount,
  ref,
  watch,
  type Component,
  type VNode,
} from 'vue';
import Sortable, { type SortableEvent } from 'sortablejs';

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

type CollectionMove = Readonly<{
  readonly fromIndex: number;
  readonly toIndex: number;
}>;

type CollectionDropItemRect = Readonly<{
  readonly index: number;
  readonly top: number;
  readonly bottom: number;
}>;

interface CollectionFacts {
  readonly valueOk: boolean;
  readonly length: number;
  readonly items: readonly ContractValue[];
  readonly itemDefault?: ContractValue;
  readonly identity?: Readonly<{
    readonly path: readonly (string | number)[];
  }>;
  readonly diagnostic?: Readonly<{
    code: 'INVALID_COLLECTION_VALUE' | 'INVALID_COLLECTION_ITEM_DEFAULT';
    message: string;
  }>;
}

interface CollectionActionConfig {
  readonly action:
    | 'item.insert'
    | 'item.remove'
    | 'item.move'
    | 'item.toggle'
    | 'collection.expand-all'
    | 'collection.collapse-all';
  readonly label: string;
  readonly icon: Component;
  readonly disabled: boolean;
  readonly attrs?: Readonly<Record<string, string | number>>;
  readonly onClick: () => void;
}

const ACTION_SIZE = '32px';
const MAX_PRESENTATION_SCOPES = 200;
const DRAG_TRACKING_EVENTS = [
  'dragstart',
  'dragend',
  'dragover',
  'drop',
  'mousemove',
  'mouseup',
  'pointermove',
  'pointerup',
  'touchcancel',
  'touchend',
  'touchmove',
] as const;
const collapsedItemsByScope = new Map<string, ReadonlySet<string>>();

export const CollectionListPresenter = defineComponent({
  name: 'HalfcodeElementPlusSchemaEditorCollectionList',
  inheritAttrs: false,
  props: schemaEditorPresenterProps,
  setup(props, { slots }) {
    let activePresentationScope = collectionPresentationScope(props);
    const collapsedItems = ref<ReadonlySet<string>>(
      readCollapsedItems(activePresentationScope),
    );
    const itemsElement = ref<HTMLElement>();
    const dragDisabled = ref(true);
    let sortable: Sortable | undefined;
    let intendedMove: CollectionMove | undefined;
    let lastDropClientY: number | undefined;
    let activeDragDocument: Document | undefined;
    let activeDragFromIndex: number | undefined;
    let activeDragItem: HTMLElement | undefined;
    let nativeDragActive = false;
    let fallbackCommitScheduled = false;

    const recordDragPointer = (event: Event) => {
      if (event.type !== 'dragend') {
        const clientY = readPointerClientY(event);
        if (clientY !== undefined) lastDropClientY = clientY;
      }
      const pointerMove = resolveActiveDragPointerMove();
      if (pointerMove.observed) intendedMove = pointerMove.move;
    };
    const resolveActiveDragPointerMove = () => {
      if (
        activeDragFromIndex === undefined
        || activeDragItem === undefined
        || itemsElement.value === undefined
      ) {
        return { observed: false } as const;
      }
      return resolveCollectionPointerMove({
        fromIndex: activeDragFromIndex,
        dropClientY: lastDropClientY,
        itemRects: readCollectionDropItemRects(
          itemsElement.value,
          activeDragItem,
        ),
      });
    };
    const clearActiveDrag = () => {
      stopDragPointerTracking();
      intendedMove = undefined;
      lastDropClientY = undefined;
      activeDragFromIndex = undefined;
      activeDragItem = undefined;
      nativeDragActive = false;
    };
    const commitActiveDrag = (input: Readonly<{
      reportedFromIndex?: number;
      reportedToIndex?: number;
      dropClientY?: number;
    }>) => {
      fallbackCommitScheduled = false;
      if (
        activeDragFromIndex === undefined
        || activeDragItem === undefined
        || itemsElement.value === undefined
      ) {
        return;
      }
      const container = itemsElement.value;
      const draggedItem = activeDragItem;
      const fromIndex = activeDragFromIndex;
      const pointerMove = resolveActiveDragPointerMove();
      const move = resolveCollectionDragMove({
        reportedFromIndex: input.reportedFromIndex ?? fromIndex,
        reportedToIndex: input.reportedToIndex ?? fromIndex,
        intendedMove: pointerMove.move ?? intendedMove,
        dropClientY: input.dropClientY ?? lastDropClientY,
        itemRects: readCollectionDropItemRects(container, draggedItem),
      });
      restoreCollectionDomOrderAt(container, draggedItem, fromIndex);
      clearActiveDrag();
      if (dragDisabled.value || move === undefined) return;
      emitCollectionEvent(props, 'item.move', move);
    };
    const commitUnendedDrag = () => {
      commitActiveDrag({
        reportedFromIndex: activeDragFromIndex,
        reportedToIndex: activeDragFromIndex,
      });
    };
    const scheduleUnendedDragCommit = () => {
      if (fallbackCommitScheduled) return;
      fallbackCommitScheduled = true;
      queueMicrotask(commitUnendedDrag);
    };
    const trackDragEvent = (event: Event) => {
      if (
        event.type === 'dragstart'
        && activeDragItem !== undefined
        && isCollectionDragEventFromItem(event, activeDragItem)
      ) {
        nativeDragActive = true;
      }
      recordDragPointer(event);
      if (nativeDragActive) {
        if (event.type === 'dragend') commitUnendedDrag();
        return;
      }
      if (isCollectionDragTerminalEvent(event.type)) {
        scheduleUnendedDragCommit();
      }
    };
    const stopDragPointerTracking = () => {
      if (!activeDragDocument) return;
      for (const eventName of DRAG_TRACKING_EVENTS) {
        activeDragDocument.removeEventListener(
          eventName,
          trackDragEvent,
          true,
        );
      }
      activeDragDocument = undefined;
    };
    const startDragPointerTracking = (ownerDocument: Document) => {
      stopDragPointerTracking();
      activeDragDocument = ownerDocument;
      for (const eventName of DRAG_TRACKING_EVENTS) {
        ownerDocument.addEventListener(eventName, trackDragEvent, true);
      }
    };

    const stopItemsWatch = watch(
      itemsElement,
      (element) => {
        sortable?.destroy();
        sortable = undefined;
        if (!element) return;
        sortable = Sortable.create(element, {
          handle: '.dg-schema-editor-collection-list__drag-handle',
          draggable: '[data-schema-editor-role="collection-item"]',
          direction: 'vertical',
          disabled: dragDisabled.value,
          animation: 150,
          ghostClass: 'dg-schema-editor-collection-list__item--ghost',
          chosenClass: 'dg-schema-editor-collection-list__item--chosen',
          dragClass: 'dg-schema-editor-collection-list__item--dragging',
          scroll: true,
          scrollSensitivity: 80,
          scrollSpeed: 12,
          // Native HTML5 dragging loses pointer completion under repeated browser drags.
          // Sortable's pointer fallback keeps the existing one-shot commit path deterministic.
          fallbackTolerance: 3,
          onChoose(event) {
            intendedMove = undefined;
            lastDropClientY = undefined;
            nativeDragActive = false;
            activeDragFromIndex = collectionIndex(event.item);
            activeDragItem = event.item;
            const originalEvent = readSortableOriginalEvent(event);
            if (originalEvent) recordDragPointer(originalEvent);
            startDragPointerTracking(event.from.ownerDocument);
          },
          onStart(event) {
            activeDragFromIndex ??= collectionIndex(event.item);
            activeDragItem ??= event.item;
            if (!activeDragDocument) {
              startDragPointerTracking(event.from.ownerDocument);
            }
          },
          onMove(event, originalEvent) {
            recordDragPointer(originalEvent);
            const fromIndex = collectionIndex(event.dragged);
            const relatedIndex = collectionIndex(event.related);
            if (fromIndex !== undefined && relatedIndex !== undefined) {
              const toIndex = event.willInsertAfter
                ? (relatedIndex < fromIndex ? relatedIndex + 1 : relatedIndex)
                : (relatedIndex > fromIndex ? relatedIndex - 1 : relatedIndex);
              if (toIndex !== fromIndex) {
                intendedMove = { fromIndex, toIndex };
              }
            }
            return event.willInsertAfter ? 1 : -1;
          },
          onEnd(event) {
            const reportedFromIndex = event.oldDraggableIndex ?? event.oldIndex;
            const reportedToIndex = event.newDraggableIndex ?? event.newIndex;
            const endPointerEvent = readSortableOriginalEvent(event);
            if (endPointerEvent) recordDragPointer(endPointerEvent);
            else recordDragPointer(event as unknown as Event);
            // Native Sortable can call onEnd for pointerup before dragend.
            // Keep that session intact so dragend is its sole commit gate.
            if (nativeDragActive) return;
            commitActiveDrag({
              reportedFromIndex,
              reportedToIndex,
              dropClientY:
                readPointerClientY(endPointerEvent)
                ?? readPointerClientY(event as unknown as Event)
                ?? lastDropClientY,
            });
          },
        });
      },
      { flush: 'post' },
    );
    const stopDisabledWatch = watch(
      dragDisabled,
      (disabled) => sortable?.option('disabled', disabled),
    );
    onBeforeUnmount(() => {
      stopItemsWatch();
      stopDisabledWatch();
      stopDragPointerTracking();
      sortable?.destroy();
      sortable = undefined;
    });

    return () => {
      const presentationScope = collectionPresentationScope(props);
      if (presentationScope !== activePresentationScope) {
        activePresentationScope = presentationScope;
        collapsedItems.value = readCollapsedItems(presentationScope);
      }
      const state = readSchemaEditorPresentationState(props);
      if (!state.visible) return null;

      const facts = readCollectionFacts(props);
      const children = readDefaultSlot(slots.default);
      const slotMatches = facts.valueOk && children.length === facts.length;
      const locallyDisabled = state.disabled || !facts.valueOk || !slotMatches;
      dragDisabled.value = locallyDisabled;
      const itemKeys = children.map((child, index) =>
        collectionItemKey(facts, child, index));
      const diagnostics = [
        ...(facts.diagnostic === undefined ? [] : [facts.diagnostic]),
        ...(facts.valueOk && !slotMatches
          ? [{
              code: 'COLLECTION_SLOT_MISMATCH' as const,
              message:
                'Collection item slots do not match the accepted item count.',
            }]
          : []),
      ];

      return h(
        'section',
        {
          class: [
            'dg-schema-editor-collection-list',
            state.readOnly && 'is-readonly',
            state.pending && 'is-pending',
            diagnostics.length > 0 && 'has-local-diagnostic',
          ],
          'data-schema-editor-presenter': 'collection.list',
          'aria-busy': String(state.pending),
          'aria-readonly': String(state.readOnly),
        },
        [
          renderSchemaEditorFieldShell(state, {
            className: 'dg-schema-editor-collection-list__field',
            labelPosition: 'top',
            content: h(
              'div',
              {
                class: 'dg-schema-editor-collection-list__content',
                style: { minWidth: '0', width: '100%' },
              },
              [
                renderCollectionToolbar(
                  props,
                  facts,
                  locallyDisabled,
                  !facts.valueOk || !slotMatches,
                  itemKeys,
                  collapsedItems.value,
                  () => {
                    updateCollapsedItems(
                      collapsedItems,
                      activePresentationScope,
                      new Set(),
                    );
                  },
                  () => {
                    updateCollapsedItems(
                      collapsedItems,
                      activePresentationScope,
                      new Set(itemKeys),
                    );
                  },
                ),
                ...diagnostics.map((diagnostic) => h(ElAlert, {
                  key: diagnostic.code,
                  title: diagnostic.message,
                  type: 'error',
                  closable: false,
                  showIcon: true,
                  class: 'dg-schema-editor-collection-list__diagnostic',
                  'data-schema-editor-diagnostic-code': diagnostic.code,
                })),
                facts.valueOk && slotMatches && facts.length === 0
                  ? h(ElEmpty, {
                      description: 'No items yet.',
                      imageSize: 48,
                      class: 'dg-schema-editor-collection-list__empty',
                    })
                  : null,
                facts.valueOk && slotMatches
                  ? h(
                      'ol',
                      {
                        ref: itemsElement,
                        class: 'dg-schema-editor-collection-list__items',
                        'data-schema-editor-role': 'collection-items',
                        'data-schema-editor-drag-engine': 'sortablejs',
                        style: {
                          display: 'grid',
                          gap: '8px',
                          margin: '8px 0 0',
                          padding: '0',
                        },
                      },
                      children.map((child, index) => {
                        const itemKey = itemKeys[index]!;
                        return renderCollectionItem(
                          props,
                          state,
                          facts,
                          index,
                          child,
                          collapsedItems.value.has(itemKey),
                          () => {
                            const next = new Set(collapsedItems.value);
                            if (next.has(itemKey)) next.delete(itemKey);
                            else next.add(itemKey);
                            updateCollapsedItems(
                              collapsedItems,
                              activePresentationScope,
                              next,
                            );
                          },
                          locallyDisabled,
                        );
                      }),
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

function renderCollectionToolbar(
  props: SchemaEditorPresenterComponentProps,
  facts: CollectionFacts,
  disabled: boolean,
  viewDisabled: boolean,
  itemKeys: readonly string[],
  collapsedItems: ReadonlySet<string>,
  expandAll: () => void,
  collapseAll: () => void,
): VNode {
  const allCollapsed = itemKeys.length > 0
    && itemKeys.every((key) => collapsedItems.has(key));
  const allExpanded = itemKeys.every((key) => !collapsedItems.has(key));
  return h(
    'div',
    {
      class: 'dg-schema-editor-collection-list__toolbar',
      'data-schema-editor-role': 'collection-toolbar',
      style: {
        alignItems: 'center',
        display: 'flex',
        gap: '8px',
        marginBottom: facts.length > 0 ? '8px' : '0',
        minHeight: ACTION_SIZE,
      },
    },
    [
      renderAction({
        action: 'item.insert',
        label: 'Add item',
        icon: Plus,
        disabled: disabled || facts.itemDefault === undefined,
        onClick: () => {
          if (disabled || facts.itemDefault === undefined) return;
          const itemDefault = createUniqueCollectionItemDefault(facts);
          if (itemDefault === undefined) return;
          emitCollectionEvent(props, 'item.insert', {
            index: facts.length,
            value: itemDefault,
          });
        },
      }),
      h(
        'div',
        {
          class: 'dg-schema-editor-collection-list__view-actions',
          style: {
            display: 'flex',
            gap: '4px',
            marginLeft: 'auto',
          },
        },
        [
          renderAction({
            action: 'collection.expand-all',
            label: 'Expand all items',
            icon: ArrowDown,
            disabled: viewDisabled || facts.length === 0 || allExpanded,
            onClick: expandAll,
          }),
          renderAction({
            action: 'collection.collapse-all',
            label: 'Collapse all items',
            icon: ArrowRight,
            disabled: viewDisabled || facts.length === 0 || allCollapsed,
            onClick: collapseAll,
          }),
        ],
      ),
    ],
  );
}

function renderCollectionItem(
  props: SchemaEditorPresenterComponentProps,
  state: SchemaEditorPresentationState,
  facts: CollectionFacts,
  index: number,
  child: VNode,
  collapsed: boolean,
  toggleCollapsed: () => void,
  disabled: boolean,
): VNode {
  const itemLabel = collectionItemLabel(facts, index);
  return h(
    'li',
    {
      key: collectionItemKey(facts, child, index),
      class: 'dg-schema-editor-collection-list__item',
      'data-schema-editor-role': 'collection-item',
      'data-schema-editor-index': index,
      'data-id': collectionItemKey(facts, child, index),
      'data-schema-editor-expanded': String(!collapsed),
      style: {
        background: '#fff',
        border: '1px solid #dcdfe6',
        borderRadius: '4px',
        listStyle: 'none',
        overflow: 'hidden',
      },
    },
    [
      h(
        'div',
        {
          class: 'dg-schema-editor-collection-list__item-header',
          'data-schema-editor-role': 'collection-item-header',
          style: {
            alignItems: 'center',
            background: '#f7f8fa',
            borderBottom: collapsed ? '0' : '1px solid #e4e7ed',
            display: 'flex',
            gap: '4px',
            minHeight: ACTION_SIZE,
            minWidth: '0',
            padding: '6px 8px',
          },
        },
        [
          renderDragHandle({
            index,
            disabled,
          }),
          renderAction({
            action: 'item.toggle',
            label: collapsed
              ? `Expand item ${index + 1}`
              : `Collapse item ${index + 1}`,
            icon: collapsed ? ArrowRight : ArrowDown,
            disabled: false,
            attrs: {
              'aria-expanded': String(!collapsed),
              'data-schema-editor-index': index,
            },
            onClick: toggleCollapsed,
          }),
          h(
            'span',
            {
              class: 'dg-schema-editor-collection-list__item-title',
              style: {
                flex: '1',
                fontSize: '13px',
                fontWeight: '600',
                minWidth: '0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
              title: itemLabel,
            },
            itemLabel,
          ),
          renderAction({
            action: 'item.move',
            label: `Move item ${index + 1} up`,
            icon: ArrowUp,
            disabled: disabled || index === 0,
            attrs: {
              'data-schema-editor-from-index': index,
              'data-schema-editor-to-index': index - 1,
            },
            onClick: () => {
              if (disabled || state.disabled || index === 0) return;
              emitCollectionEvent(props, 'item.move', {
                fromIndex: index,
                toIndex: index - 1,
              });
            },
          }),
          renderAction({
            action: 'item.move',
            label: `Move item ${index + 1} down`,
            icon: ArrowDown,
            disabled: disabled || index === facts.length - 1,
            attrs: {
              'data-schema-editor-from-index': index,
              'data-schema-editor-to-index': index + 1,
            },
            onClick: () => {
              if (
                disabled
                || state.disabled
                || index === facts.length - 1
              ) {
                return;
              }
              emitCollectionEvent(props, 'item.move', {
                fromIndex: index,
                toIndex: index + 1,
              });
            },
          }),
          renderAction({
            action: 'item.remove',
            label: `Remove item ${index + 1}`,
            icon: Delete,
            disabled,
            attrs: { 'data-schema-editor-index': index },
            onClick: () => {
              if (disabled || state.disabled) return;
              emitCollectionEvent(props, 'item.remove', { index });
            },
          }),
        ],
      ),
      collapsed
        ? null
        : h(
            'div',
            {
              class: 'dg-schema-editor-collection-list__item-content',
              'data-schema-editor-role': 'collection-item-content',
              style: { padding: '12px' },
            },
            [child],
          ),
    ],
  );
}

function collectionItemKey(
  facts: CollectionFacts,
  child: VNode,
  index: number,
): string {
  if (typeof child.key === 'string' || typeof child.key === 'number') {
    return `collection-item:vnode:${child.key}`;
  }
  if (facts.identity) {
    const identity = readContractPath(
      facts.items[index]!,
      facts.identity.path,
    );
    return `collection-item:${contractIdentityToken(identity)}`;
  }
  return `collection-item:index:${index}`;
}

function collectionItemLabel(
  facts: CollectionFacts,
  index: number,
): string {
  if (facts.identity) {
    const identity = readContractPath(
      facts.items[index]!,
      facts.identity.path,
    );
    if (typeof identity === 'string' || typeof identity === 'number') {
      return `${index + 1}. ${identity}`;
    }
  }
  return `Item ${index + 1}`;
}

function renderDragHandle(config: Readonly<{
  index: number;
  disabled: boolean;
}>): VNode {
  const label = `Drag item ${config.index + 1} to reorder`;
  return h(
    ElTooltip,
    {
      content: label,
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
          'aria-label': label,
          'data-schema-editor-action': 'item.drag',
          'data-schema-editor-index': config.index,
          class: 'dg-schema-editor-collection-list__drag-handle',
          style: {
            cursor: config.disabled ? 'not-allowed' : 'grab',
            flex: '0 0 auto',
            height: ACTION_SIZE,
            marginLeft: '0',
            minHeight: ACTION_SIZE,
            minWidth: ACTION_SIZE,
            width: ACTION_SIZE,
          },
        },
        {
          default: () => h(ElIcon, null, {
            default: () => h(Rank),
          }),
        },
      ),
    },
  );
}

function restoreCollectionDomOrderAt(
  container: HTMLElement,
  item: HTMLElement,
  oldIndex: number,
): void {
  const siblings = [...container.children].filter((child) => child !== item);
  container.insertBefore(item, siblings[oldIndex] ?? null);
}

function isCollectionDragTerminalEvent(type: string): boolean {
  return type === 'dragend'
    || type === 'drop'
    || type === 'mouseup'
    || type === 'pointerup'
    || type === 'touchcancel'
    || type === 'touchend';
}

function isCollectionDragEventFromItem(event: Event, item: HTMLElement): boolean {
  const target = event.target;
  return target === item || (target instanceof Node && item.contains(target));
}

export function resolveCollectionDragMove(
  input: Readonly<{
    reportedFromIndex?: number;
    reportedToIndex?: number;
    intendedMove?: CollectionMove;
    dropClientY?: number;
    itemRects?: readonly CollectionDropItemRect[];
  }>,
): CollectionMove | undefined {
  const reportedFromIndex = normalizeCollectionIndex(input.reportedFromIndex);
  const reportedToIndex = normalizeCollectionIndex(input.reportedToIndex);
  if (
    reportedFromIndex !== undefined
    && reportedToIndex !== undefined
    && reportedFromIndex !== reportedToIndex
  ) {
    return { fromIndex: reportedFromIndex, toIndex: reportedToIndex };
  }

  const fromIndex = reportedFromIndex
    ?? normalizeCollectionIndex(input.intendedMove?.fromIndex);
  if (fromIndex === undefined) return undefined;

  const intendedFromIndex = normalizeCollectionIndex(
    input.intendedMove?.fromIndex,
  );
  const intendedToIndex = normalizeCollectionIndex(
    input.intendedMove?.toIndex,
  );
  if (
    intendedFromIndex !== undefined
    && intendedToIndex !== undefined
    && intendedFromIndex !== intendedToIndex
  ) {
    return { fromIndex: intendedFromIndex, toIndex: intendedToIndex };
  }

  const pointerMove = resolveCollectionPointerMove({
    fromIndex,
    dropClientY: input.dropClientY,
    itemRects: input.itemRects,
  });
  if (pointerMove.observed) return pointerMove.move;
  return undefined;
}

function resolveCollectionPointerMove(
  input: Readonly<{
    fromIndex: number;
    dropClientY?: number;
    itemRects?: readonly CollectionDropItemRect[];
  }>,
): Readonly<{ observed: boolean; move?: CollectionMove }> {
  if (
    input.dropClientY === undefined
    || input.itemRects === undefined
    || input.itemRects.length === 0
  ) {
    return { observed: false };
  }
  const itemRects = [...input.itemRects]
    .filter((rect) => rect.index !== input.fromIndex)
    .sort((left, right) => left.top - right.top || left.index - right.index);
  if (itemRects.length === 0) return { observed: false };

  let toIndex = itemRects.length;
  for (let index = 0; index < itemRects.length; index += 1) {
    const rect = itemRects[index]!;
    const midpoint = rect.top + ((rect.bottom - rect.top) / 2);
    if (input.dropClientY < midpoint) {
      toIndex = index;
      break;
    }
  }
  return {
    observed: true,
    move: toIndex === input.fromIndex
      ? undefined
      : { fromIndex: input.fromIndex, toIndex },
  };
}

function readCollectionDropItemRects(
  container: HTMLElement,
  draggedItem: HTMLElement,
): CollectionDropItemRect[] {
  return [...container.children]
    .filter((child): child is HTMLElement =>
      child instanceof HTMLElement
      && child !== draggedItem
      && !child.classList.contains('sortable-fallback')
      && child.dataset.schemaEditorRole === 'collection-item')
    .map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        index: collectionIndex(child) ?? -1,
        top: rect.top,
        bottom: rect.bottom,
      };
    })
    .filter((rect) => rect.index >= 0);
}

function readPointerClientY(event: Event | undefined): number | undefined {
  if (!event) return undefined;
  const touchEvent = event as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  const clientY = touch?.clientY ?? (
    'clientY' in event ? (event as MouseEvent).clientY : undefined
  );
  return Number.isFinite(clientY) ? clientY : undefined;
}

function readSortableOriginalEvent(event: SortableEvent): Event | undefined {
  const originalEvent = (event as SortableEvent & {
    readonly originalEvent?: Event;
  }).originalEvent;
  return originalEvent instanceof Event ? originalEvent : undefined;
}

function collectionIndex(element: HTMLElement): number | undefined {
  return normalizeCollectionIndex(Number(element.dataset.schemaEditorIndex));
}

function normalizeCollectionIndex(index: unknown): number | undefined {
  return Number.isInteger(index) && Number(index) >= 0
    ? Number(index)
    : undefined;
}

function collectionPresentationScope(
  props: SchemaEditorPresenterComponentProps,
): string | undefined {
  const renderScopeKey = props.eventContext.renderScopeKey;
  if (typeof renderScopeKey !== 'string' || renderScopeKey.length === 0) {
    return undefined;
  }
  const pathKey = props.path
    .map((segment) =>
      `${typeof segment === 'number' ? 'n' : 's'}:${encodeURIComponent(String(segment))}`)
    .join('/');
  return `${renderScopeKey}:${String(props.node.id)}:${pathKey}`;
}

function readCollapsedItems(
  scope: string | undefined,
): ReadonlySet<string> {
  if (!scope) return new Set();
  const cached = collapsedItemsByScope.get(scope);
  if (!cached) return new Set();
  collapsedItemsByScope.delete(scope);
  collapsedItemsByScope.set(scope, cached);
  return cached;
}

function updateCollapsedItems(
  state: { value: ReadonlySet<string> },
  scope: string | undefined,
  next: ReadonlySet<string>,
): void {
  state.value = next;
  if (!scope) return;
  collapsedItemsByScope.delete(scope);
  collapsedItemsByScope.set(scope, next);
  while (collapsedItemsByScope.size > MAX_PRESENTATION_SCOPES) {
    const oldest = collapsedItemsByScope.keys().next().value;
    if (typeof oldest !== 'string') break;
    collapsedItemsByScope.delete(oldest);
  }
}

function renderAction(config: CollectionActionConfig): VNode {
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
            flex: '0 0 auto',
            height: ACTION_SIZE,
            marginLeft: '0',
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

function readCollectionFacts(
  props: SchemaEditorPresenterComponentProps,
): CollectionFacts {
  const items = readOwnArrayLength(props.value);
  if (items === undefined) {
    return Object.freeze({
      valueOk: false,
      length: 0,
      items: Object.freeze([]),
      diagnostic: Object.freeze({
        code: 'INVALID_COLLECTION_VALUE' as const,
        message: 'Collection value is not a readable accepted array.',
      }),
    });
  }

  const node = asOwnRecord(props.node);
  const metadata = asOwnRecord(readOwnData(node, 'metadata'));
  const acceptedItems = readOwnArrayItems(props.value);
  if (acceptedItems === undefined) {
    return Object.freeze({
      valueOk: false,
      length: 0,
      items: Object.freeze([]),
      diagnostic: Object.freeze({
        code: 'INVALID_COLLECTION_VALUE' as const,
        message: 'Collection value is not a readable accepted array.',
      }),
    });
  }
  const identity = readCollectionIdentity(metadata);
  const defaultDescriptor = readOwnDescriptor(metadata, 'itemDefault');
  if (!defaultDescriptor) {
    return Object.freeze({
      valueOk: true,
      length: acceptedItems.length,
      items: Object.freeze(acceptedItems),
      ...(identity ? { identity } : {}),
    });
  }
  const itemDefault = 'value' in defaultDescriptor
    ? cloneContractValue(defaultDescriptor.value)
    : undefined;
  if (itemDefault === undefined) {
    return Object.freeze({
      valueOk: true,
      length: acceptedItems.length,
      items: Object.freeze(acceptedItems),
      ...(identity ? { identity } : {}),
      diagnostic: Object.freeze({
        code: 'INVALID_COLLECTION_ITEM_DEFAULT' as const,
        message: 'Collection item default is not contract-serializable.',
      }),
    });
  }

  return Object.freeze({
    valueOk: true,
    length: acceptedItems.length,
    items: Object.freeze(acceptedItems),
    itemDefault,
    ...(identity ? { identity } : {}),
  });
}

function createUniqueCollectionItemDefault(
  facts: CollectionFacts,
): ContractValue | undefined {
  const base = cloneContractValue(facts.itemDefault);
  if (base === undefined || facts.identity === undefined) return base;

  const current = readContractPath(base, facts.identity.path);
  if (typeof current !== 'string' && typeof current !== 'number') return base;

  const used = new Set(
    facts.items.map((item) => contractIdentityToken(
      readContractPath(item, facts.identity!.path),
    )),
  );
  if (!used.has(contractIdentityToken(current))) return base;

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidateIdentity = typeof current === 'string'
      ? `${current}-${suffix}`
      : current + suffix - 1;
    const candidate = replaceContractPath(base, facts.identity.path, candidateIdentity);
    if (
      candidate !== undefined
      && !used.has(contractIdentityToken(readContractPath(candidate, facts.identity.path)))
    ) {
      return candidate;
    }
  }
  return base;
}

function readCollectionIdentity(
  metadata: Readonly<Record<PropertyKey, unknown>> | undefined,
): Readonly<{ path: readonly (string | number)[] }> | undefined {
  const identity = asOwnRecord(readOwnData(metadata, 'identity'));
  if (readOwnData(identity, 'strategy') !== 'property') return undefined;
  const path = readOwnData(identity, 'path');
  if (!Array.isArray(path) || path.length === 0) return undefined;
  const segments: Array<string | number> = [];
  for (const segment of path) {
    if (typeof segment !== 'string' && !Number.isSafeInteger(segment)) return undefined;
    segments.push(segment);
  }
  return Object.freeze({ path: Object.freeze(segments) });
}

function readContractPath(
  value: ContractValue,
  path: readonly (string | number)[],
): ContractValue | undefined {
  let current: ContractValue | undefined = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      const descriptor = readOwnDescriptor(current, String(segment));
      current = descriptor && 'value' in descriptor ? descriptor.value as ContractValue : undefined;
    } else {
      current = readOwnData(asOwnRecord(current), segment) as ContractValue | undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function replaceContractPath(
  value: ContractValue,
  path: readonly (string | number)[],
  replacement: ContractValue,
): ContractValue | undefined {
  if (path.length === 0) return replacement;
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    if (!Array.isArray(value)) return undefined;
    const length = readOwnArrayLength(value);
    if (length === undefined || segment < 0 || segment >= length) return undefined;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = readOwnDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return undefined;
      result.push(index === segment
        ? replaceContractPath(descriptor.value as ContractValue, rest, replacement)
        : descriptor.value);
    }
    return result.some((item) => item === undefined) ? undefined : cloneContractValue(result);
  }
  const record = asOwnRecord(value);
  if (!record || !Object.hasOwn(record, segment)) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const item = readOwnData(record, key);
    result[key] = key === segment
      ? replaceContractPath(item as ContractValue, rest, replacement)
      : item;
  }
  if (result[segment] === undefined) return undefined;
  return cloneContractValue(result);
}

function contractIdentityToken(
  value: ContractValue | undefined,
  ancestors: ReadonlySet<object> = new Set(),
): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'boolean') return `boolean:${value ? '1' : '0'}`;
  if (typeof value === 'number') return `number:${value}`;
  if (ancestors.has(value)) return 'cycle';

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    const length = readOwnArrayLength(value);
    if (length === undefined) return 'array:invalid';
    const parts: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = readOwnDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return 'array:invalid';
      parts.push(contractIdentityToken(descriptor.value as ContractValue, nextAncestors));
    }
    return `array:[${parts.join('|')}]`;
  }

  const record = asOwnRecord(value);
  if (!record) return 'object:invalid';
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    parts.push(`${key}=${contractIdentityToken(readOwnData(record, key) as ContractValue, nextAncestors)}`);
  }
  return `object:{${parts.join('|')}}`;
}

function readOwnArrayItems(value: unknown): ContractValue[] | undefined {
  const length = readOwnArrayLength(value);
  if (length === undefined) return undefined;
  const items: ContractValue[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = readOwnDescriptor(value as object, String(index));
    if (!descriptor || !('value' in descriptor)) return undefined;
    items.push(descriptor.value as ContractValue);
  }
  return items;
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
      const descriptor = Object.getOwnPropertyDescriptor(
        children,
        String(index),
      );
      if (!descriptor || !('value' in descriptor)) return Object.freeze([]);
      result.push(descriptor.value);
    }
    return Object.freeze(result);
  } catch {
    return Object.freeze([]);
  }
}

function emitCollectionEvent(
  props: SchemaEditorPresenterComponentProps,
  event: 'item.insert' | 'item.remove' | 'item.move',
  payload: ContractValue,
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
  Object.freeze(result);
  return result as ContractValue;
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

function asOwnRecord(
  value: unknown,
): Readonly<Record<PropertyKey, unknown>> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    return value as Readonly<Record<PropertyKey, unknown>>;
  } catch {
    return undefined;
  }
}

function readOwnData(
  record: Readonly<Record<PropertyKey, unknown>> | undefined,
  key: PropertyKey,
): unknown {
  if (!record) return undefined;
  const descriptor = readOwnDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
