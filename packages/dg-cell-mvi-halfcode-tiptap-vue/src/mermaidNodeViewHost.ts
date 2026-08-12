import type {
  NodeViewRenderer,
  NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import { createXnlRichDocumentTiptapHostExtensions } from './internalTiptapExtensionRegistry';
import type {
  XnlRichDocumentMermaidDiagnostic,
  XnlRichDocumentMermaidDiagnosticCode,
  XnlRichDocumentMermaidDiagnosticEffect,
  XnlRichDocumentMermaidDiagnosticInput,
  XnlRichDocumentMermaidNodeViewHostConfig,
  XnlRichDocumentMermaidNodeViewHostInput,
  XnlRichDocumentMermaidNodeViewHostResult,
  XnlRichDocumentMermaidNodeViewRuntime,
  XnlRichDocumentMermaidRenderEffect,
  XnlRichDocumentMermaidRenderInput,
  XnlRichDocumentMermaidRenderResult,
} from './types';
import {
  createModeAwareStructuredNodeViewRenderer,
  type XnlRichDocumentStructuredNodeViewModeRuntime,
} from './structuredNodeViewMode';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const HOST_REQUEST_ID = 'mermaid-nodeview-host';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const UNSAFE_ELEMENT_NAMES = new Set(['script', 'foreignobject']);
const MERMAID_DIAGNOSTIC_CODES = new Set<XnlRichDocumentMermaidDiagnosticCode>([
  'INVALID_MERMAID_NODEVIEW_RUNTIME',
  'INVALID_MERMAID_NODEVIEW_INPUT',
  'INVALID_MERMAID_NODEVIEW_CONFIG',
  'MERMAID_RENDER_REJECTED',
  'MERMAID_RENDER_FAILED',
  'INVALID_MERMAID_RENDER_RESULT',
  'MERMAID_RENDER_RESULT_MISMATCH',
  'UNSAFE_MERMAID_RENDER_OUTPUT',
]);

interface MermaidEffects {
  render<TRequestId extends string>(
    input: XnlRichDocumentMermaidRenderInput<TRequestId>,
  ): Promise<XnlRichDocumentMermaidRenderResult<TRequestId>>;
  report(input: XnlRichDocumentMermaidDiagnosticInput): void | Promise<void>;
}

interface MountedMermaidNodeView {
  destroy(): void;
}

interface ModeAwareMermaidNodeView extends NodeView {
  setDisplayMode(mode: 'view' | 'edit'): void;
}

export type XnlRichDocumentMermaidNodeViewCapabilityResult =
  | Readonly<{
      status: 'ready';
      nodeView: NodeViewRenderer;
      dispose: () => void;
    }>
  | Extract<XnlRichDocumentMermaidNodeViewHostResult, { status: 'rejected' }>;

interface MermaidNodeSnapshot {
  readonly nodeId: string | undefined;
  readonly source: string;
}

export function createXnlRichDocumentMermaidNodeViewHost<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
>(
  runtime: XnlRichDocumentMermaidNodeViewRuntime<TRenderRuntime, TDiagnosticRuntime>,
  input: XnlRichDocumentMermaidNodeViewHostInput,
  config: XnlRichDocumentMermaidNodeViewHostConfig,
): XnlRichDocumentMermaidNodeViewHostResult {
  const capability = prepareXnlRichDocumentMermaidNodeViewCapability(runtime, input, config);
  if (capability.status !== 'ready') return capability;
  const extensions = createXnlRichDocumentTiptapHostExtensions({ mermaid: capability.nodeView });

  return Object.freeze({
    status: 'ready' as const,
    extensions,
    dispose: capability.dispose,
  });
}

export function prepareXnlRichDocumentMermaidNodeViewCapability<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
>(
  runtime: XnlRichDocumentMermaidNodeViewRuntime<TRenderRuntime, TDiagnosticRuntime>,
  input: XnlRichDocumentMermaidNodeViewHostInput,
  config: XnlRichDocumentMermaidNodeViewHostConfig,
  displayMode?: XnlRichDocumentStructuredNodeViewModeRuntime,
): XnlRichDocumentMermaidNodeViewCapabilityResult {
  const outer = readExactDataCarrier(runtime, ['renderer', 'diagnostics'], 'Mermaid NodeView runtime');
  if (!outer.ok) return rejected('INVALID_MERMAID_NODEVIEW_RUNTIME', outer.message);

  const renderer = readEffectBinding<TRenderRuntime>(outer.value.renderer, 'Mermaid renderer binding');
  if (!renderer.ok) return rejected('INVALID_MERMAID_NODEVIEW_RUNTIME', renderer.message);
  const diagnostics = readEffectBinding<TDiagnosticRuntime>(
    outer.value.diagnostics,
    'Mermaid diagnostics binding',
  );
  if (!diagnostics.ok) return rejected('INVALID_MERMAID_NODEVIEW_RUNTIME', diagnostics.message);

  const hostInput = readExactDataRecord(input, [], 'Mermaid NodeView host input');
  if (!hostInput.ok) return rejected('INVALID_MERMAID_NODEVIEW_INPUT', hostInput.message);
  const hostConfig = readExactDataRecord(config, ['theme'], 'Mermaid NodeView host config');
  if (!hostConfig.ok) return rejected('INVALID_MERMAID_NODEVIEW_CONFIG', hostConfig.message);
  if (
    hostConfig.value.theme !== 'default'
    && hostConfig.value.theme !== 'dark'
    && hostConfig.value.theme !== 'neutral'
  ) {
    return rejected('INVALID_MERMAID_NODEVIEW_CONFIG', 'Mermaid NodeView theme is not supported.');
  }

  const renderRuntime = renderer.value.runtime;
  const renderEffect = renderer.value.effect as XnlRichDocumentMermaidRenderEffect<TRenderRuntime>;
  const diagnosticRuntime = diagnostics.value.runtime;
  const diagnosticEffect = diagnostics.value.effect as XnlRichDocumentMermaidDiagnosticEffect<
    TDiagnosticRuntime
  >;
  const renderConfig = Object.freeze({ theme: hostConfig.value.theme });
  const effects: MermaidEffects = Object.freeze({
    render: <TRequestId extends string>(request: XnlRichDocumentMermaidRenderInput<TRequestId>) => (
      renderEffect(renderRuntime, request, renderConfig)
    ),
    report: (diagnosticInput: XnlRichDocumentMermaidDiagnosticInput) => (
      diagnosticEffect(diagnosticRuntime, diagnosticInput, EMPTY)
    ),
  });

  const mounts = new Set<MountedMermaidNodeView>();
  let disposed = false;
  const baseMermaid = createMermaidNodeViewRenderer(effects, mounts, () => disposed);
  const mermaid = displayMode === undefined
    ? baseMermaid
    : createModeAwareStructuredNodeViewRenderer({
        ...displayMode,
        innerRenderer: baseMermaid,
        projection: {
          title: (node) => typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : 'Mermaid diagram',
          applyMode: (nodeView, mode) => {
            if (isModeAwareMermaidNodeView(nodeView)) nodeView.setDisplayMode(mode.mode);
          },
        },
      }, {
        projectionRole: 'mermaid',
        kindLabel: 'Mermaid',
      });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mount of [...mounts]) mount.destroy();
  };

  return Object.freeze({
    status: 'ready' as const,
    nodeView: mermaid,
    dispose,
  });
}

function createMermaidNodeViewRenderer(
  effects: MermaidEffects,
  mounts: Set<MountedMermaidNodeView>,
  isDisposed: () => boolean,
): NodeViewRenderer {
  return (props: NodeViewRendererProps): NodeView => {
    const ownerDocument = props.view.dom.ownerDocument;
    const dom = ownerDocument.createElement('div');
    dom.setAttribute('contenteditable', 'false');
    dom.setAttribute('data-xnl-rich-document-mermaid-nodeview', 'runtime-bound');
    const renderContainer = ownerDocument.createElement('div');
    renderContainer.setAttribute('data-mermaid-render-container', '');
    const sourceEditor = ownerDocument.createElement('textarea');
    sourceEditor.setAttribute('data-mermaid-source-editor', '');
    sourceEditor.setAttribute('aria-label', 'Mermaid source');
    dom.appendChild(renderContainer);
    dom.appendChild(sourceEditor);

    let snapshot = readMermaidNodeSnapshot(props.node);
    sourceEditor.value = snapshot.source;
    let destroyed = false;
    let sequence = 0;
    let liveRequestId: string | undefined;

    const isLive = (requestId: string): boolean => (
      !destroyed && !isDisposed() && liveRequestId === requestId
    );
    const report = (
      diagnostic: XnlRichDocumentMermaidDiagnostic,
      requestId: string,
    ): void => {
      void Promise.resolve()
        .then(() => (isLive(requestId) ? effects.report({ diagnostic }) : undefined))
        .catch(() => undefined);
    };
    const reportFailure = (
      code: XnlRichDocumentMermaidDiagnosticCode,
      message: string,
      requestId: string,
    ): void => {
      report(Object.freeze({ severity: 'error', code, message, requestId }), requestId);
    };
    const render = (source: string): void => {
      if (destroyed || isDisposed()) return;
      const requestId = `${snapshot.nodeId ?? 'mermaid'}:${++sequence}`;
      liveRequestId = requestId;
      Promise.resolve()
        .then(() => effects.render(Object.freeze({ source, requestId })))
        .then((untrustedResult) => {
          if (!isLive(requestId)) return;
          const parsed = readMermaidRenderResult(untrustedResult, ownerDocument);
          if (!isLive(requestId)) return;
          if (!parsed.ok) {
            reportFailure('INVALID_MERMAID_RENDER_RESULT', parsed.message, requestId);
            return;
          }
          const result = parsed.value;
          if (result.status === 'rejected') {
            if (result.requestId !== requestId) {
              reportFailure(
                'INVALID_MERMAID_RENDER_RESULT',
                'Rejected Mermaid result.requestId must match the live request.',
                requestId,
              );
              return;
            }
            if (!isLive(requestId)) return;
            for (const diagnostic of result.diagnostics) {
              if (!isLive(requestId)) return;
              report(diagnostic, requestId);
            }
            return;
          }
          if (result.requestId !== requestId) {
            reportFailure(
              'MERMAID_RENDER_RESULT_MISMATCH',
              'Mermaid render result requestId does not match the live request.',
              requestId,
            );
            return;
          }
          const safe = importAndValidateSafeSvg(result.svg, ownerDocument);
          if (!isLive(requestId)) return;
          if (!safe.ok) {
            reportFailure('UNSAFE_MERMAID_RENDER_OUTPUT', safe.message, requestId);
            return;
          }
          try {
            if (!isLive(requestId)) return;
            renderContainer.replaceChildren(safe.value);
          } catch (error) {
            reportFailure(
              'UNSAFE_MERMAID_RENDER_OUTPUT',
              `Mermaid render output could not be committed safely: ${errorMessage(error)}`,
              requestId,
            );
          }
        })
        .catch((error) => {
          if (!isLive(requestId)) return;
          reportFailure(
            'MERMAID_RENDER_FAILED',
            `Mermaid render Effect threw or rejected: ${errorMessage(error)}`,
            requestId,
          );
        });
    };
    const updateSource = (): void => {
      if (destroyed || isDisposed() || sourceEditor.disabled) return;
      const position = typeof props.getPos === 'function' ? props.getPos() : undefined;
      if (typeof position !== 'number') return;
      props.view.dispatch(props.view.state.tr.setNodeMarkup(position, undefined, {
        ...snapshot,
        source: sourceEditor.value,
      }));
    };
    sourceEditor.addEventListener('input', updateSource);

    const mount: MountedMermaidNodeView & ModeAwareMermaidNodeView = {
      dom,
      setDisplayMode(mode: 'view' | 'edit') {
        sourceEditor.disabled = mode === 'view';
      },
      update(node: ProseMirrorNode) {
        if (destroyed || isDisposed() || node.type.name !== props.node.type.name) return false;
        const next = readMermaidNodeSnapshot(node);
        if (next.nodeId !== snapshot.nodeId) return false;
        const sourceChanged = next.source !== snapshot.source;
        snapshot = next;
        if (sourceEditor.value !== next.source) sourceEditor.value = next.source;
        if (sourceChanged) render(next.source);
        return true;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        liveRequestId = undefined;
        sourceEditor.removeEventListener('input', updateSource);
        mounts.delete(mount);
      },
      stopEvent(event) {
        const target = event.target;
        const NodeConstructor = ownerDocument.defaultView?.Node;
        return NodeConstructor !== undefined
          && target instanceof NodeConstructor
          && target !== dom
          && dom.contains(target);
      },
    };

    mounts.add(mount);
    render(snapshot.source);
    return mount;
  };
}

function isModeAwareMermaidNodeView(nodeView: NodeView): nodeView is ModeAwareMermaidNodeView {
  return typeof (nodeView as Partial<ModeAwareMermaidNodeView>).setDisplayMode === 'function';
}

function readMermaidNodeSnapshot(node: ProseMirrorNode): MermaidNodeSnapshot {
  const nodeId = typeof node.attrs.nodeId === 'string' && node.attrs.nodeId.length > 0
    ? node.attrs.nodeId
    : undefined;
  const source = typeof node.attrs.source === 'string' ? node.attrs.source : '';
  return { nodeId, source };
}

function readMermaidRenderResult(
  value: unknown,
  ownerDocument: Document,
): ReadResult<XnlRichDocumentMermaidRenderResult> {
  const result = snapshotOwnDataProperties(value, 'Mermaid render result');
  if (!result.ok) return result;
  const status = result.value.properties.status;

  if (status === 'rendered') {
    const rendered = pickExactSnapshotProperties(
      result.value,
      ['status', 'requestId', 'svg'],
      'Rendered Mermaid result',
    );
    if (!rendered.ok) return rendered;
    if (typeof rendered.value.requestId !== 'string') {
      return { ok: false, message: 'Rendered Mermaid result.requestId must be a string.' };
    }
    const SvgConstructor = ownerDocument.defaultView?.SVGSVGElement;
    if (SvgConstructor === undefined || !(rendered.value.svg instanceof SvgConstructor)) {
      return { ok: false, message: 'Rendered Mermaid result.svg must be an SVGSVGElement.' };
    }
    return {
      ok: true,
      value: {
        status: 'rendered',
        requestId: rendered.value.requestId,
        svg: rendered.value.svg,
      },
    };
  }

  if (status === 'rejected') {
    const rejectedResult = pickExactSnapshotProperties(
      result.value,
      ['status', 'requestId', 'diagnostics'],
      'Rejected Mermaid result',
    );
    if (!rejectedResult.ok) return rejectedResult;
    if (typeof rejectedResult.value.requestId !== 'string') {
      return { ok: false, message: 'Rejected Mermaid result.requestId must be a string.' };
    }
    const diagnostics = readMermaidDiagnostics(
      rejectedResult.value.diagnostics,
      rejectedResult.value.requestId,
    );
    if (!diagnostics.ok) return diagnostics;
    return {
      ok: true,
      value: {
        status: 'rejected',
        requestId: rejectedResult.value.requestId,
        diagnostics: diagnostics.value,
      },
    };
  }

  return {
    ok: false,
    message: 'Mermaid render result.status must be rendered or rejected.',
  };
}

function readMermaidDiagnostics<TRequestId extends string>(
  value: unknown,
  resultRequestId: TRequestId,
): ReadResult<readonly [
  XnlRichDocumentMermaidDiagnostic<TRequestId>,
  ...XnlRichDocumentMermaidDiagnostic<TRequestId>[],
]> {
  const items = snapshotExactDataArray(value, 'Rejected Mermaid result.diagnostics');
  if (!items.ok) return items;
  if (items.value.length === 0) {
    return { ok: false, message: 'Rejected Mermaid result.diagnostics must be a non-empty array.' };
  }
  const diagnostics: XnlRichDocumentMermaidDiagnostic<TRequestId>[] = [];
  for (const item of items.value) {
    const diagnosticSnapshot = snapshotOwnDataProperties(item, 'Mermaid render diagnostic');
    if (!diagnosticSnapshot.ok) return diagnosticSnapshot;
    const diagnostic = pickExactSnapshotProperties(
      diagnosticSnapshot.value,
      ['severity', 'code', 'message', 'requestId'],
      'Mermaid render diagnostic',
    );
    if (!diagnostic.ok) return diagnostic;
    if (diagnostic.value.severity !== 'error') {
      return { ok: false, message: 'Mermaid render diagnostic.severity must be error.' };
    }
    if (
      typeof diagnostic.value.code !== 'string'
      || !MERMAID_DIAGNOSTIC_CODES.has(
        diagnostic.value.code as XnlRichDocumentMermaidDiagnosticCode,
      )
    ) {
      return { ok: false, message: 'Mermaid render diagnostic.code is not supported.' };
    }
    if (typeof diagnostic.value.message !== 'string') {
      return { ok: false, message: 'Mermaid render diagnostic.message must be a string.' };
    }
    if (typeof diagnostic.value.requestId !== 'string') {
      return { ok: false, message: 'Mermaid render diagnostic.requestId must be a string.' };
    }
    if (diagnostic.value.requestId !== resultRequestId) {
      return {
        ok: false,
        message: 'Mermaid render diagnostic.requestId must match its rejected result.requestId.',
      };
    }
    diagnostics.push(Object.freeze({
      severity: 'error',
      code: diagnostic.value.code as XnlRichDocumentMermaidDiagnosticCode,
      message: diagnostic.value.message,
      requestId: resultRequestId,
    }));
  }
  return {
    ok: true,
    value: Object.freeze(diagnostics) as readonly [
      XnlRichDocumentMermaidDiagnostic<TRequestId>,
      ...XnlRichDocumentMermaidDiagnostic<TRequestId>[],
    ],
  };
}

function importAndValidateSafeSvg(
  svg: SVGSVGElement,
  ownerDocument: Document,
): ReadResult<SVGSVGElement> {
  let clone: SVGSVGElement;
  try {
    clone = ownerDocument.importNode(svg, true);
  } catch (error) {
    return {
      ok: false,
      message: `Mermaid render output could not be cloned safely: ${errorMessage(error)}`,
    };
  }
  return validateSafeSvg(clone, ownerDocument);
}

function validateSafeSvg(
  svg: SVGSVGElement,
  ownerDocument: Document,
): ReadResult<SVGSVGElement> {
  const SvgConstructor = ownerDocument.defaultView?.SVGSVGElement;
  if (
    SvgConstructor === undefined
    || !(svg instanceof SvgConstructor)
    || svg.namespaceURI !== SVG_NAMESPACE
    || svg.localName.toLowerCase() !== 'svg'
  ) {
    return { ok: false, message: 'Mermaid render output must be an SVGSVGElement.' };
  }
  return validateSafeElement(svg, ownerDocument);
}

function validateSafeElement<TElement extends Element>(
  element: TElement,
  ownerDocument: Document,
): ReadResult<TElement> {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  if (ElementConstructor === undefined || !(element instanceof ElementConstructor)) {
    return { ok: false, message: 'Mermaid render output contains a non-element node.' };
  }
  const name = element.localName.toLowerCase();
  if (UNSAFE_ELEMENT_NAMES.has(name)) {
    return { ok: false, message: `Mermaid render output cannot contain <${name}>.` };
  }
  for (const attribute of Array.from(element.attributes)) {
    const attributeName = attribute.name.toLowerCase();
    const attributeLocalName = attribute.localName.toLowerCase();
    if (attributeName.startsWith('on') || attributeLocalName.startsWith('on')) {
      return { ok: false, message: `Mermaid render output cannot contain ${attribute.name} attributes.` };
    }
    if (
      isHrefAttribute(attribute)
      && hasJavascriptUrlProtocol(attribute.value, ownerDocument)
    ) {
      return { ok: false, message: 'Mermaid render output cannot contain javascript: hrefs.' };
    }
  }
  for (const child of Array.from(element.children)) {
    const childResult = validateSafeElement(child, ownerDocument);
    if (!childResult.ok) return childResult;
  }
  return { ok: true, value: element };
}

function isHrefAttribute(attribute: Attr): boolean {
  return attribute.localName.toLowerCase() === 'href'
    || attribute.name.toLowerCase() === 'href'
    || attribute.name.toLowerCase() === 'xlink:href';
}

function hasJavascriptUrlProtocol(value: string, ownerDocument: Document): boolean {
  try {
    return new URL(value, ownerDocument.baseURI).protocol.toLowerCase() === 'javascript:';
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readEffectBinding<TRuntime extends object>(
  value: unknown,
  label: string,
): ReadResult<Readonly<{ runtime: TRuntime; effect: Function }>> {
  const binding = readExactDataRecord(value, ['runtime', 'effect'], label);
  if (!binding.ok) return binding;
  if (!isOpaqueRuntime(binding.value.runtime)) {
    return { ok: false, message: `${label}.runtime must be an object.` };
  }
  if (typeof binding.value.effect !== 'function') {
    return { ok: false, message: `${label}.effect must be a function.` };
  }
  return {
    ok: true,
    value: {
      runtime: binding.value.runtime as TRuntime,
      effect: binding.value.effect,
    },
  };
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  if (!isPlainRecord(value)) return { ok: false, message: `${label} must be a plain object.` };
  return readExactOwnDataProperties(value, keys, label);
}

function readExactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return { ok: false, message: `${label} must be an object.` };
  }
  return readExactOwnDataProperties(value, keys, label);
}

function readExactDataArray(
  value: unknown,
  label: string,
): ReadResult<readonly unknown[]> {
  return snapshotExactDataArray(value, label);
}

function readExactDataCarrier(
  value: unknown,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  if (!isOpaqueRuntime(value)) {
    return { ok: false, message: `${label} must be an object or function.` };
  }
  return readExactOwnDataProperties(value, keys, label);
}

function readExactOwnDataProperties(
  value: object,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  const snapshot = snapshotOwnDataProperties(value, label);
  return snapshot.ok ? pickExactSnapshotProperties(snapshot.value, keys, label) : snapshot;
}

interface OwnDataSnapshot {
  readonly keys: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

function snapshotOwnDataProperties(
  value: unknown,
  label: string,
): ReadResult<OwnDataSnapshot> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return { ok: false, message: `${label} must be an object.` };
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) {
      return { ok: false, message: `${label} must not contain symbol keys.` };
    }
    const stringKeys = ownKeys as string[];
    const result: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        return { ok: false, message: `${label}.${key} must be an own data property.` };
      }
      result[key] = descriptor.value;
    }
    return { ok: true, value: { keys: stringKeys, properties: Object.freeze(result) } };
  } catch {
    return { ok: false, message: `${label} could not be inspected safely.` };
  }
}

function pickExactSnapshotProperties(
  snapshot: OwnDataSnapshot,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  if (
    snapshot.keys.length !== keys.length
    || snapshot.keys.some((key) => !keys.includes(key))
  ) {
    return { ok: false, message: `${label} must contain only ${keys.join(', ')}.` };
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(snapshot.properties, key)) {
      return { ok: false, message: `${label}.${key} must be an own data property.` };
    }
    result[key] = snapshot.properties[key];
  }
  return { ok: true, value: result };
}

function snapshotExactDataArray(
  value: unknown,
  label: string,
): ReadResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value)) return { ok: false, message: `${label} must be an array.` };
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      return { ok: false, message: `${label}.length must be an own data property.` };
    }
    const length = lengthDescriptor.value as number;
    const expectedKeys = Array.from({ length }, (_, index) => String(index));
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length + 1
      || ownKeys.some((key) => key !== 'length' && !expectedKeys.includes(String(key)))
    ) {
      return { ok: false, message: `${label} must contain only indexed data items.` };
    }
    const items: unknown[] = [];
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        return { ok: false, message: `${label}[${key}] must be an own data property.` };
      }
      items.push(descriptor.value);
    }
    return { ok: true, value: items };
  } catch {
    return { ok: false, message: `${label} could not be inspected safely.` };
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isOpaqueRuntime(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function rejected(
  code: XnlRichDocumentMermaidDiagnosticCode,
  message: string,
): Extract<XnlRichDocumentMermaidNodeViewHostResult, { status: 'rejected' }> {
  const diagnostic: XnlRichDocumentMermaidDiagnostic = Object.freeze({
    severity: 'error',
    code,
    message,
    requestId: HOST_REQUEST_ID,
  });
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [XnlRichDocumentMermaidDiagnostic],
  });
}

type ReadResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; message: string }>;
