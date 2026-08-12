import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import {
  formatDocumentInstanceRef,
  type DocumentDisplayModeProjection,
  type DocumentDisplayModeSession,
  type DocumentInstanceRef,
  type XnlRichDocument,
  type XnlRichDocumentNode,
  type XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import { deriveXnlRichDocumentOccurrenceXId } from 'dg-cell-mvi-halfcode-logic';
import {
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue';
import { DefaultModeAwareHalfcodeNodeViewShell } from './modeAwareNodeViewShell';
import type { XnlRichDocumentModeRegistrationCoordinator } from './modeRegistrationCoordinator';
import type {
  XnlRichDocumentEmbeddedModeTransitionGrant,
  XnlRichDocumentEmbeddedModeView,
} from './types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

export type XnlRichDocumentStructuredNodeViewModeRuntime = Readonly<{
  unitInstanceId: string;
  session: DocumentDisplayModeSession;
  registrations: XnlRichDocumentModeRegistrationCoordinator;
}>;

export type XnlRichDocumentStructuredNodeViewModeAdapterRuntime =
  XnlRichDocumentStructuredNodeViewModeRuntime & Readonly<{
    innerRenderer: NodeViewRenderer;
    projection: Readonly<{
      title: (node: ProseMirrorNode) => string;
      applyMode: (nodeView: NodeView, mode: XnlRichDocumentEmbeddedModeView) => void;
    }>;
  }>;

export type XnlRichDocumentStructuredNodeViewModeConfig = Readonly<{
  projectionRole: string;
  kindLabel: string;
}>;

export function createModeAwareStructuredNodeViewRenderer(
  runtime: XnlRichDocumentStructuredNodeViewModeAdapterRuntime,
  config: XnlRichDocumentStructuredNodeViewModeConfig,
): NodeViewRenderer {
  return (props: NodeViewRendererProps): NodeView => {
    const inner = runtime.innerRenderer(props);
    const instanceRef = structuredInstanceRef(runtime.unitInstanceId, config.projectionRole, props.node);
    if (instanceRef === undefined) return provisionalStructuredNodeView(inner, runtime, config);
    const instanceKey = formatDocumentInstanceRef(instanceRef);

    const controller = createStructuredModeController(runtime, instanceRef);
    const ownerDocument = props.view.dom.ownerDocument;
    const host = ownerDocument.createElement('div');
    host.setAttribute('data-structured-nodeview', config.projectionRole);
    host.setAttribute('data-x-id', instanceRef.xId);
    const mode = shallowRef(controller.view());
    const selected = ref(false);
    const title = ref(runtime.projection.title(props.node));

    const Bridge = defineComponent({
      name: 'ModeAwareStructuredNodeViewBridge',
      setup() {
        const content = ref<HTMLElement>();
        let unsubscribe: (() => void) | undefined;
        onMounted(() => {
          content.value?.appendChild(inner.dom);
          host.setAttribute('data-display-mode', mode.value.mode);
          runtime.projection.applyMode(inner, mode.value);
          unsubscribe = controller.subscribe((next) => {
            mode.value = next;
            host.setAttribute('data-display-mode', next.mode);
            runtime.projection.applyMode(inner, next);
          });
        });
        onBeforeUnmount(() => unsubscribe?.());
        return () => h(DefaultModeAwareHalfcodeNodeViewShell, {
          kind: config.projectionRole,
          kindLabel: config.kindLabel,
          title: title.value,
          mode: mode.value,
          selected: selected.value,
          view: EMPTY,
          requestModeTransition: controller.request,
        }, {
          default: () => h('div', {
            ref: content,
            class: 'xnl-mode-shell__structured-content',
          }),
        });
      },
    });
    const app = createApp(Bridge);
    app.mount(host);

    let destroyed = false;
    const nodeView: NodeView = {
      dom: host,
      ...(inner.contentDOM === undefined ? {} : { contentDOM: inner.contentDOM }),
      update(node, decorations, innerDecorations) {
        if (destroyed) return false;
        const nextRef = structuredInstanceRef(runtime.unitInstanceId, config.projectionRole, node);
        if (nextRef === undefined || formatDocumentInstanceRef(nextRef) !== instanceKey) return false;
        const accepted = inner.update?.(node, decorations, innerDecorations) ?? false;
        if (!accepted) return false;
        title.value = runtime.projection.title(node);
        host.setAttribute('data-display-mode', mode.value.mode);
        runtime.projection.applyMode(inner, mode.value);
        return true;
      },
      selectNode() {
        selected.value = true;
        inner.selectNode?.();
      },
      deselectNode() {
        selected.value = false;
        inner.deselectNode?.();
      },
      setSelection(anchor, head, root) {
        inner.setSelection?.(anchor, head, root);
      },
      stopEvent(event) {
        const NodeConstructor = ownerDocument.defaultView?.Node;
        const target = event.target;
        if (NodeConstructor !== undefined && target instanceof NodeConstructor && inner.dom.contains(target)) {
          return inner.stopEvent?.(event) ?? false;
        }
        return true;
      },
      ignoreMutation(mutation) {
        const NodeConstructor = ownerDocument.defaultView?.Node;
        if (NodeConstructor !== undefined && mutation.target instanceof NodeConstructor && inner.dom.contains(mutation.target)) {
          return inner.ignoreMutation?.(mutation) ?? false;
        }
        return true;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        controller.dispose();
        app.unmount();
        inner.destroy?.();
      },
    };
    return nodeView;
  };
}

export function structuredNodeViewIdentitySignature(document: XnlRichDocument): string {
  const identities: string[] = [];
  const visit = (node: XnlRichDocumentNode): void => {
    if (node.kind === 'mermaid' || node.kind === 'code-block') {
      identities.push(`${node.kind}:${node.nodeId}`);
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(document);
  return identities.join('\u0000');
}

function provisionalStructuredNodeView(
  inner: NodeView,
  runtime: XnlRichDocumentStructuredNodeViewModeRuntime,
  config: XnlRichDocumentStructuredNodeViewModeConfig,
): NodeView {
  let destroyed = false;
  return {
    dom: inner.dom,
    ...(inner.contentDOM === undefined ? {} : { contentDOM: inner.contentDOM }),
    update(node, decorations, innerDecorations) {
      if (destroyed) return false;
      if (structuredInstanceRef(runtime.unitInstanceId, config.projectionRole, node) !== undefined) {
        return false;
      }
      return inner.update?.(node, decorations, innerDecorations) ?? false;
    },
    selectNode: () => inner.selectNode?.(),
    deselectNode: () => inner.deselectNode?.(),
    setSelection: (anchor, head, root) => inner.setSelection?.(anchor, head, root),
    stopEvent: (event) => inner.stopEvent?.(event) ?? false,
    ignoreMutation: (mutation) => inner.ignoreMutation?.(mutation) ?? false,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      inner.destroy?.();
    },
  };
}

function createStructuredModeController(
  runtime: XnlRichDocumentStructuredNodeViewModeRuntime,
  ref: DocumentInstanceRef,
) {
  const registration = runtime.registrations.acquire(ref);
  const listeners = new Set<(mode: XnlRichDocumentEmbeddedModeView) => void>();
  let current = pendingMode();
  let disposed = false;
  let sequence = 0;
  const key = formatDocumentInstanceRef(ref);
  const update = (projection: DocumentDisplayModeProjection) => {
    current = embeddedModeView(projection);
    listeners.forEach((listener) => listener(current));
  };
  const unsubscribe = runtime.session.subscribe((snapshot) => {
    const projection = snapshot.projections.find((item) => (
      item.target.kind === 'occurrence'
      && formatDocumentInstanceRef(item.target.ref) === key
    ));
    if (!disposed && projection !== undefined) update(projection);
  });
  const request: XnlRichDocumentEmbeddedModeTransitionGrant<object> = async (
    _grantRuntime,
    input,
  ) => {
    const lease = registration.lease();
    if (disposed || lease === undefined) {
      return Object.freeze({ status: 'rejected' as const, reason: 'Display mode occurrence is not available.' });
    }
    sequence += 1;
    const correlationId = `${key}:mode:${sequence}`;
    const result = await runtime.session.dispatch(input.mode === 'inherit'
      ? { type: 'clear-overlay', correlationId, ref, lease }
      : { type: 'set-overlay', correlationId, ref, lease, mode: input.mode });
    if (!result.ok) {
      return Object.freeze({
        status: 'rejected' as const,
        reason: result.diagnostics.map(({ message }) => message).join('; ')
          || 'Display mode transition was rejected.',
      });
    }
    return Object.freeze({ status: 'accepted' as const });
  };
  return Object.freeze({
    view: () => current,
    request,
    subscribe(listener: (mode: XnlRichDocumentEmbeddedModeView) => void) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      registration.release();
      listeners.clear();
    },
  });
}

function structuredInstanceRef(
  unitInstanceId: string,
  projectionRole: string,
  node: ProseMirrorNode,
): DocumentInstanceRef | undefined {
  const nodeId = typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : undefined;
  if (nodeId === undefined) return undefined;
  const identity = deriveXnlRichDocumentOccurrenceXId(EMPTY, {
    nodeId: nodeId as XnlRichDocumentDomainNodeId,
    role: projectionRole,
    roleCardinality: 'single',
  }, EMPTY);
  if (identity.status !== 'derived') return undefined;
  return Object.freeze({ unitInstanceId, projectionRole, xId: identity.xId });
}

function embeddedModeView(projection: DocumentDisplayModeProjection): XnlRichDocumentEmbeddedModeView {
  const requested = projection.overlay === 'inherit' ? projection.inheritedMode : projection.overlay;
  const source = projection.effectiveMode !== requested || projection.diagnostics.length > 0
    ? 'policy' as const
    : projection.overlay === 'inherit' ? 'base' as const : 'overlay' as const;
  return Object.freeze({
    mode: projection.effectiveMode,
    overlay: projection.overlay,
    inheritedMode: projection.inheritedMode,
    source,
    allowedModes: Object.freeze([...projection.allowedModes]),
    canSwitch: projection.canSwitch,
    ...(projection.reason === undefined ? {} : { reason: projection.reason }),
  });
}

function pendingMode(): XnlRichDocumentEmbeddedModeView {
  return Object.freeze({
    mode: 'view',
    overlay: 'inherit',
    inheritedMode: 'view',
    source: 'policy',
    allowedModes: Object.freeze([]),
    canSwitch: false,
    reason: 'Display mode registration is pending.',
  });
}
