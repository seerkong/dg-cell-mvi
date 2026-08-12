import {
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import {
  formatDocumentInstanceRef,
  type DocumentDisplayModeProjection,
  type DocumentDisplayModeSession,
  type DocumentInstanceRef,
  type DocumentInstanceRegistry,
  type UnitRenderPlan,
  type XnlProjectionSerializableRecord,
} from 'dg-cell-mvi-halfcode-contract';
import {
  resolveApplicationDataCapability,
} from 'dg-cell-mvi-halfcode-support/xnl-projection-presenter';
import type { HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import {
  CanonicalHalfcodeRenderer,
  type CanonicalComponentRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import {
  createApp,
  defineComponent,
  h,
  shallowReactive,
  type App,
  type Component,
} from 'vue';
import {
  createXnlRichDocumentEmbeddedPresenterCapability,
  snapshotXnlRichDocumentEmbeddedSerializableRecord,
} from './embeddedPresenterCapability';
import { createXnlRichDocumentTiptapHostExtensions } from './internalTiptapExtensionRegistry';
import { verifyXnlRichDocumentHalfcodeNodeViewOccurrence } from './occurrenceAssembly';
import type {
  XnlRichDocumentEmbeddedPresenterInput,
  XnlRichDocumentEmbeddedModeView,
  XnlRichDocumentModeAwareEmbeddedPresenterInput,
  XnlRichDocumentHalfcodeNodeViewDiagnostic,
  XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
  XnlRichDocumentHalfcodeNodeViewHostConfig,
  XnlRichDocumentHalfcodeNodeViewHostInput,
  XnlRichDocumentHalfcodeNodeViewHostResult,
  XnlRichDocumentHalfcodeNodeViewHostRuntime,
  XnlRichDocumentHalfcodeNodeViewOccurrence,
  XnlRichDocumentHalfcodeNodeViewTarget,
  XnlRichDocumentModeShellPresenterRegistry,
} from './types';
import { DefaultModeAwareHalfcodeNodeViewShell } from './modeAwareNodeViewShell';
import {
  createXnlRichDocumentModeRegistrationCoordinator,
  type XnlRichDocumentModeRegistrationCoordinator,
} from './modeRegistrationCoordinator';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
type EmbedKind = XnlRichDocumentHalfcodeNodeViewTarget['kind'];

interface PreparedHostInput {
  readonly targets: ReadonlyMap<string, XnlRichDocumentHalfcodeNodeViewTarget>;
  readonly occurrences: ReadonlyMap<string, XnlRichDocumentHalfcodeNodeViewOccurrence>;
}

interface HostCapabilities<TView extends object, THost extends object> {
  readonly runtime: THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>;
  readonly documentInstances: DocumentInstanceRegistry;
  readonly halfcodeRuntime: HalfcodeAppRuntime;
  readonly canonicalRegistry?: CanonicalComponentRegistry;
  readonly register: DocumentInstanceRegistry['register'];
  readonly unregister: DocumentInstanceRegistry['unregister'];
  readonly displayModeSession?: DocumentDisplayModeSession;
  readonly modeRegistrations?: XnlRichDocumentModeRegistrationCoordinator;
  readonly modeShellPresenters?: XnlRichDocumentModeShellPresenterRegistry;
}

interface MountedNodeView {
  destroy(): void;
}

export type XnlRichDocumentHalfcodeNodeViewCapabilityResult =
  | Readonly<{
      status: 'ready';
      nodeViews: Readonly<{
        componentEmbed: NodeViewRenderer;
        capsuleEmbed: NodeViewRenderer;
      }>;
      readDiagnostics: () => readonly XnlRichDocumentHalfcodeNodeViewDiagnostic[];
      dispose: () => void;
    }>
  | Extract<XnlRichDocumentHalfcodeNodeViewHostResult, { status: 'rejected' }>;

interface EmbedSnapshot extends XnlProjectionSerializableRecord {
  readonly kind: EmbedKind;
  readonly nodeId: string;
  readonly ref: string;
  readonly version?: string;
  readonly input?: XnlProjectionSerializableRecord;
}

interface VueMountState<TView extends object> {
  plan: UnitRenderPlan;
  presenterIdentity: string;
  baseInput: XnlRichDocumentEmbeddedPresenterInput<TView>;
  embeddedInput: XnlRichDocumentModeAwareEmbeddedPresenterInput<TView>;
  mode: XnlRichDocumentEmbeddedModeView;
  selected: boolean;
  modeShellPresenterId?: string;
  revision: number;
}

export function createXnlRichDocumentHalfcodeNodeViewHost<
  TView extends object,
  THost extends object,
>(
  runtime: THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>,
  input: XnlRichDocumentHalfcodeNodeViewHostInput,
  config: XnlRichDocumentHalfcodeNodeViewHostConfig,
): XnlRichDocumentHalfcodeNodeViewHostResult {
  const capability = prepareXnlRichDocumentHalfcodeNodeViewCapability(runtime, input, config);
  if (capability.status !== 'ready') return capability;
  const extensions = createXnlRichDocumentTiptapHostExtensions(capability.nodeViews);

  return Object.freeze({
    status: 'ready' as const,
    extensions,
    readDiagnostics: capability.readDiagnostics,
    dispose: capability.dispose,
  });
}

export function prepareXnlRichDocumentHalfcodeNodeViewCapability<
  TView extends object,
  THost extends object,
>(
  runtime: THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>,
  input: XnlRichDocumentHalfcodeNodeViewHostInput,
  config: XnlRichDocumentHalfcodeNodeViewHostConfig,
): XnlRichDocumentHalfcodeNodeViewCapabilityResult {
  const configCheck = readExactDataRecord(config, [], 'Halfcode NodeView host config');
  if (!configCheck.ok) return rejected('INVALID_HALFCODE_NODEVIEW_INPUT', configCheck.message);
  const capabilities = readHostCapabilities<TView, THost>(runtime);
  if (!capabilities.ok) {
    return rejected('INVALID_HALFCODE_NODEVIEW_RUNTIME', capabilities.message);
  }
  const prepared = prepareHostInput(input);
  if (!prepared.ok) return rejected('INVALID_HALFCODE_NODEVIEW_INPUT', prepared.message);

  const diagnostics: XnlRichDocumentHalfcodeNodeViewDiagnostic[] = [];
  const mounts = new Set<MountedNodeView>();
  let disposed = false;
  const report = (
    code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
    message: string,
  ): XnlRichDocumentHalfcodeNodeViewDiagnostic => {
    const item = diagnostic(code, message);
    diagnostics.push(item);
    return item;
  };
  const ownsModeRegistrations = capabilities.value.displayModeSession !== undefined
    && capabilities.value.modeRegistrations === undefined;
  const modeRegistrations = capabilities.value.modeRegistrations
    ?? (capabilities.value.displayModeSession === undefined
      ? undefined
      : createXnlRichDocumentModeRegistrationCoordinator(
          capabilities.value.displayModeSession,
          report,
        ));

  const componentEmbed = createNodeViewRenderer(
    'component-embed',
    capabilities.value,
    prepared.value,
    mounts,
    modeRegistrations,
    () => disposed,
    report,
  );
  const capsuleEmbed = createNodeViewRenderer(
    'capsule-embed',
    capabilities.value,
    prepared.value,
    mounts,
    modeRegistrations,
    () => disposed,
    report,
  );
  const readDiagnostics = () => Object.freeze(
    diagnostics.map((item) => Object.freeze({ ...item })),
  );
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mount of [...mounts]) mount.destroy();
    if (ownsModeRegistrations) modeRegistrations?.dispose();
  };

  return Object.freeze({
    status: 'ready' as const,
    nodeViews: Object.freeze({ componentEmbed, capsuleEmbed }),
    readDiagnostics,
    dispose,
  });
}

function createNodeViewRenderer<TView extends object, THost extends object>(
  expectedKind: EmbedKind,
  capabilities: HostCapabilities<TView, THost>,
  prepared: PreparedHostInput,
  mounts: Set<MountedNodeView>,
  modeRegistrations: XnlRichDocumentModeRegistrationCoordinator | undefined,
  isDisposed: () => boolean,
  report: (
    code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
    message: string,
  ) => XnlRichDocumentHalfcodeNodeViewDiagnostic,
): NodeViewRenderer {
  return (props: NodeViewRendererProps): NodeView => {
    const ownerDocument = props.view.dom.ownerDocument;
    const diagnosticView = (
      code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
      message: string,
    ): NodeView => {
      const item = report(code, message);
      const dom = ownerDocument.createElement('div');
      dom.setAttribute('contenteditable', 'false');
      dom.setAttribute('data-halfcode-nodeview-diagnostic', item.code);
      return { dom };
    };
    if (isDisposed()) {
      return diagnosticView(
        'HALFCODE_NODEVIEW_UPDATE_REJECTED',
        'Halfcode NodeView host is disposed.',
      );
    }

    const initial = readEmbedSnapshot(props.node, expectedKind);
    if (!initial.ok) {
      return diagnosticView('INVALID_HALFCODE_NODEVIEW_INPUT', initial.message);
    }
    const target = prepared.targets.get(targetKey(expectedKind, initial.value.ref));
    if (target === undefined) {
      return diagnosticView(
        expectedKind === 'component-embed'
          ? 'UNKNOWN_HALFCODE_COMPONENT'
          : 'UNKNOWN_HALFCODE_CAPSULE',
        `No canonical Halfcode ${expectedKind} target is registered for the requested ref.`,
      );
    }
    const occurrence = prepared.occurrences.get(initial.value.nodeId);
    if (occurrence === undefined) {
      return diagnosticView(
        'INVALID_HALFCODE_NODEVIEW_INPUT',
        `No caller-supplied occurrence descriptor exists for node "${initial.value.nodeId}".`,
      );
    }
    const capability = createXnlRichDocumentEmbeddedPresenterCapability(
      capabilities.runtime,
      {
        phase: 'mount',
        instanceRef: occurrence.instanceRef,
        snapshot: initial.value,
      },
      EMPTY,
    );
    if (capability.status !== 'ready') {
      const facetFailure = capability.diagnostics.some((item) => (
        item.code === 'INVALID_EMBEDDED_PRESENTER_FACET'
      ));
      return diagnosticView(
        facetFailure ? 'INVALID_HALFCODE_NODEVIEW_FACET' : 'INVALID_HALFCODE_NODEVIEW_INPUT',
        capability.diagnostics.map((item) => item.message).join('; '),
      );
    }

    const dom = ownerDocument.createElement('div');
    dom.setAttribute('contenteditable', 'false');
    dom.setAttribute('data-halfcode-nodeview', expectedKind);
    dom.setAttribute('data-x-id', occurrence.instanceRef.xId);
    const registeredTarget = Object.freeze({
      kind: expectedKind,
      ref: Object.freeze({ ...occurrence.instanceRef }),
      dom,
    });
    let registerResult: ReturnType<DocumentInstanceRegistry['register']>;
    try {
      registerResult = capabilities.register({
        ref: occurrence.instanceRef,
        descriptor: occurrence.descriptor,
        target: registeredTarget,
      });
    } catch (error) {
      return diagnosticView(
        'DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE',
        `Document occurrence registration threw: ${errorMessage(error)}`,
      );
    }
    if (!registerResult.ok || typeof registerResult.ownerToken !== 'string') {
      const message = registerResult.diagnostics?.map((item) => item.message).join('; ')
        ?? 'Document occurrence registration was rejected.';
      return diagnosticView('DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE', message);
    }

    let state!: VueMountState<TView>;
    let app: App<Element> | undefined;
    let vueMounted = false;
    let destroyed = false;
    let registrationReleased = false;
    const modeRegistration = modeRegistrations?.acquire(occurrence.instanceRef);
    let unsubscribeMode: (() => void) | undefined;
    let modeCommandSequence = 0;
    let vueFailure: unknown;
    const ownerToken = registerResult.ownerToken;
    const requestModeTransition: XnlRichDocumentModeAwareEmbeddedPresenterInput<TView>['requestModeTransition'] = async (
      _runtime,
      modeInput,
    ) => {
      const session = capabilities.displayModeSession;
      const modeLease = modeRegistration?.lease();
      if (session === undefined || modeLease === undefined || destroyed) {
        return Object.freeze({ status: 'rejected' as const, reason: 'Display mode occurrence is not available.' });
      }
      modeCommandSequence += 1;
      const correlationId = `${formatDocumentInstanceRef(occurrence.instanceRef)}:mode:${modeCommandSequence}`;
      const result = await session.dispatch(modeInput.mode === 'inherit'
        ? { type: 'clear-overlay', correlationId, ref: occurrence.instanceRef, lease: modeLease }
        : { type: 'set-overlay', correlationId, ref: occurrence.instanceRef, lease: modeLease, mode: modeInput.mode });
      if (!result.ok) {
        const reason = result.diagnostics.map((item) => item.message).join('; ') || 'Display mode transition was rejected.';
        report('HALFCODE_NODEVIEW_MODE_TRANSITION_REJECTED', reason);
        return Object.freeze({ status: 'rejected' as const, reason });
      }
      return Object.freeze({ status: 'accepted' as const });
    };
    const createModeAwareInput = (
      baseInput: XnlRichDocumentEmbeddedPresenterInput<TView>,
      mode: XnlRichDocumentEmbeddedModeView,
    ): XnlRichDocumentModeAwareEmbeddedPresenterInput<TView> => Object.freeze({
      view: baseInput.view,
      snapshot: baseInput.snapshot,
      instanceRef: baseInput.instanceRef,
      emitEditIntent: async (presenterRuntime, editInput, editConfig) => {
        if (state.mode.mode !== 'edit') {
          return Object.freeze({
            status: 'rejected' as const,
            diagnostics: Object.freeze([{
              severity: 'error' as const,
              code: 'EMBEDDED_PRESENTER_EDIT_MODE_DENIED' as const,
              message: 'Document authoring is unavailable while this occurrence is in view mode.',
            }]) as never,
          });
        }
        return baseInput.emitEditIntent(presenterRuntime, editInput, editConfig);
      },
      mode,
      requestModeTransition,
    });
    const initialMode = capabilities.displayModeSession === undefined
      ? legacyEditModeView()
      : closedOccurrenceModeView();
    state = shallowReactive<VueMountState<TView>>({
      plan: target.plan,
      presenterIdentity: target.presenterIdentity,
      baseInput: capability.embeddedInput,
      embeddedInput: undefined as never,
      mode: initialMode,
      selected: false,
      ...(target.modeShellPresenterId === undefined ? {} : { modeShellPresenterId: target.modeShellPresenterId }),
      revision: 0,
    });
    state.embeddedInput = createModeAwareInput(state.baseInput, state.mode);

    const updateModeProjection = (projection: DocumentDisplayModeProjection) => {
      state.mode = embeddedModeView(projection);
      state.embeddedInput = createModeAwareInput(state.baseInput, state.mode);
      state.revision += 1;
    };
    if (capabilities.displayModeSession !== undefined) {
      const session = capabilities.displayModeSession;
      unsubscribeMode = session.subscribe((snapshot) => {
        const occurrenceKey = formatDocumentInstanceRef(occurrence.instanceRef);
        const projection = snapshot.projections.find((item) => (
          item.target.kind === 'occurrence'
          && formatDocumentInstanceRef(item.target.ref) === occurrenceKey
        ));
        if (!destroyed && projection !== undefined) updateModeProjection(projection);
      });
    }
    const cleanupRegistration = () => {
      if (registrationReleased) return;
      registrationReleased = true;
      let cleanup: ReturnType<DocumentInstanceRegistry['unregister']>;
      try {
        cleanup = capabilities.unregister({ ref: occurrence.instanceRef, ownerToken });
      } catch (error) {
        report(
          'HALFCODE_NODEVIEW_CLEANUP_REJECTED',
          `Halfcode NodeView cleanup threw: ${errorMessage(error)}`,
        );
        return;
      }
      if (!cleanup.ok) {
        report(
          'HALFCODE_NODEVIEW_CLEANUP_REJECTED',
          cleanup.diagnostics?.map((item) => item.message).join('; ')
            ?? 'Halfcode NodeView cleanup was rejected.',
        );
      }
    };
    const mount: MountedNodeView & NodeView = {
      dom,
      update(node: ProseMirrorNode) {
        if (destroyed || isDisposed()) return false;
        const next = readEmbedSnapshot(node, expectedKind);
        if (!next.ok) {
          report('HALFCODE_NODEVIEW_UPDATE_REJECTED', next.message);
          return false;
        }
        if (next.value.nodeId !== initial.value.nodeId) return false;
        const nextTarget = prepared.targets.get(targetKey(expectedKind, next.value.ref));
        if (nextTarget === undefined) {
          report(
            expectedKind === 'component-embed'
              ? 'UNKNOWN_HALFCODE_COMPONENT'
              : 'UNKNOWN_HALFCODE_CAPSULE',
            `No canonical Halfcode ${expectedKind} target is registered for the updated ref.`,
          );
          return false;
        }
        const updateCapability = createXnlRichDocumentEmbeddedPresenterCapability(
          capabilities.runtime,
          {
            phase: 'update',
            instanceRef: occurrence.instanceRef,
            snapshot: next.value,
          },
          EMPTY,
        );
        if (updateCapability.status !== 'ready') {
          report(
            updateCapability.diagnostics.some((item) => item.code === 'INVALID_EMBEDDED_PRESENTER_FACET')
              ? 'INVALID_HALFCODE_NODEVIEW_FACET'
              : 'HALFCODE_NODEVIEW_UPDATE_REJECTED',
            updateCapability.diagnostics.map((item) => item.message).join('; '),
          );
          return false;
        }
        state.plan = nextTarget.plan;
        state.presenterIdentity = nextTarget.presenterIdentity;
        state.baseInput = updateCapability.embeddedInput;
        state.embeddedInput = createModeAwareInput(state.baseInput, state.mode);
        state.modeShellPresenterId = nextTarget.modeShellPresenterId;
        state.revision += 1;
        return true;
      },
      selectNode() {
        if (destroyed || state.selected) return;
        state.selected = true;
        state.revision += 1;
      },
      deselectNode() {
        if (destroyed || !state.selected) return;
        state.selected = false;
        state.revision += 1;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        mounts.delete(mount);
        try {
          if (vueMounted) {
            vueMounted = false;
            app?.unmount();
          }
        } catch (error) {
          report(
            'HALFCODE_NODEVIEW_CLEANUP_REJECTED',
            `Halfcode NodeView Vue cleanup threw: ${errorMessage(error)}`,
          );
        }
        unsubscribeMode?.();
        unsubscribeMode = undefined;
        modeRegistration?.release();
        cleanupRegistration();
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

    const Root = defineComponent({
      name: 'XnlRichDocumentHalfcodeNodeViewRoot',
      setup() {
        const renderHalfcode = () => h(CanonicalHalfcodeRenderer, {
          plan: state.plan,
          runtime: capabilities.halfcodeRuntime,
          registry: capabilities.canonicalRegistry,
          hostProps: state.embeddedInput,
          hostPresenterIdentity: state.presenterIdentity,
          revision: state.revision,
        });
        return () => {
          if (capabilities.displayModeSession === undefined) return renderHalfcode();
          const Shell = resolveModeShellPresenter(
            state.modeShellPresenterId,
            capabilities.modeShellPresenters,
            report,
          );
          return h(Shell, {
            kind: expectedKind,
            title: targetTitle(state.plan, initial.value.ref),
            mode: state.mode,
            selected: state.selected,
            view: state.embeddedInput.view,
            requestModeTransition,
          }, { default: renderHalfcode });
        };
      },
    });
    try {
      app = createApp(Root);
      app.config.errorHandler = (error) => {
        if (!vueMounted) {
          vueFailure = error;
          return;
        }
        reportVueFailure(expectedKind, error, report);
      };
      app.mount(dom);
      vueMounted = true;
    } catch (error) {
      vueFailure = error;
    }
    if (vueFailure !== undefined) {
      const item = reportVueFailure(expectedKind, vueFailure, report);
      mount.destroy();
      dom.replaceChildren();
      dom.setAttribute('data-halfcode-nodeview-diagnostic', item.code);
      return { dom };
    }

    mounts.add(mount);
    return mount;
  };
}

function readHostCapabilities<TView extends object, THost extends object>(
  runtime: THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>,
): ReadResult<HostCapabilities<TView, THost>> {
  const documentInstances = runtimeCapability(runtime, 'documentInstances');
  const halfcodeRuntime = runtimeCapability(runtime, 'halfcodeRuntime');
  const canonicalRegistry = resolveApplicationDataCapability(runtime, 'canonicalRegistry');
  const displayMode = resolveApplicationDataCapability(runtime, 'displayMode');
  const modeShellPresenters = resolveApplicationDataCapability(runtime, 'modeShellPresenters');
  if (!documentInstances.ok) return documentInstances;
  if (!halfcodeRuntime.ok) return halfcodeRuntime;
  if (!isObject(documentInstances.value)) {
    return { ok: false, message: 'Halfcode NodeView documentInstances must be an object.' };
  }
  if (!isObject(halfcodeRuntime.value)) {
    return { ok: false, message: 'Halfcode NodeView halfcodeRuntime must be an object.' };
  }
  const register = runtimeCapability(documentInstances.value, 'register');
  const unregister = runtimeCapability(documentInstances.value, 'unregister');
  if (!register.ok || typeof register.value !== 'function') {
    return { ok: false, message: register.ok ? 'Document registry register must be a function.' : register.message };
  }
  if (!unregister.ok || typeof unregister.value !== 'function') {
    return { ok: false, message: unregister.ok ? 'Document registry unregister must be a function.' : unregister.message };
  }
  if (canonicalRegistry.ok) {
    if (!isObject(canonicalRegistry.value)) {
      return { ok: false, message: 'Halfcode NodeView canonicalRegistry must be an object.' };
    }
    const resolve = runtimeCapability(canonicalRegistry.value, 'resolve');
    if (!resolve.ok || typeof resolve.value !== 'function') {
      return { ok: false, message: resolve.ok ? 'Canonical registry resolve must be a function.' : resolve.message };
    }
  } else if (!isAbsentOptionalCapability(canonicalRegistry.reason)) {
    return { ok: false, message: `Halfcode NodeView canonicalRegistry ${canonicalRegistry.reason}.` };
  }
  let displayModeSession: DocumentDisplayModeSession | undefined;
  let modeRegistrations: XnlRichDocumentModeRegistrationCoordinator | undefined;
  if (displayMode.ok) {
    if (!isObject(displayMode.value)) return { ok: false, message: 'Halfcode NodeView displayMode must be an object.' };
    const session = runtimeCapability(displayMode.value, 'session');
    if (!session.ok || !isObject(session.value)) return { ok: false, message: 'Halfcode NodeView displayMode session is invalid.' };
    for (const method of ['snapshot', 'register', 'unregister', 'dispatch', 'subscribe'] as const) {
      const candidate = runtimeCapability(session.value, method);
      if (!candidate.ok || typeof candidate.value !== 'function') return { ok: false, message: `Halfcode NodeView displayMode session ${method} must be a function.` };
    }
    displayModeSession = session.value as unknown as DocumentDisplayModeSession;
    const registrations = runtimeCapability(displayMode.value, 'registrations');
    if (registrations.ok) {
      if (!isObject(registrations.value)) return { ok: false, message: 'Halfcode NodeView displayMode registrations must be an object.' };
      for (const method of ['acquire', 'dispose'] as const) {
        const candidate = runtimeCapability(registrations.value, method);
        if (!candidate.ok || typeof candidate.value !== 'function') return { ok: false, message: `Halfcode NodeView displayMode registrations ${method} must be a function.` };
      }
      modeRegistrations = registrations.value as unknown as XnlRichDocumentModeRegistrationCoordinator;
    } else if (!isAbsentOptionalCapability(registrations.message)) {
      return { ok: false, message: `Halfcode NodeView displayMode registrations ${registrations.message}.` };
    }
  } else if (!isAbsentOptionalCapability(displayMode.reason)) {
    return { ok: false, message: `Halfcode NodeView displayMode ${displayMode.reason}.` };
  }
  let shellRegistry: XnlRichDocumentModeShellPresenterRegistry | undefined;
  if (modeShellPresenters.ok) {
    if (!isObject(modeShellPresenters.value)) return { ok: false, message: 'Halfcode NodeView modeShellPresenters must be an object.' };
    const resolve = runtimeCapability(modeShellPresenters.value, 'resolve');
    if (!resolve.ok || typeof resolve.value !== 'function') return { ok: false, message: 'Halfcode NodeView mode shell registry resolve must be a function.' };
    shellRegistry = modeShellPresenters.value as unknown as XnlRichDocumentModeShellPresenterRegistry;
  } else if (!isAbsentOptionalCapability(modeShellPresenters.reason)) {
    return { ok: false, message: `Halfcode NodeView modeShellPresenters ${modeShellPresenters.reason}.` };
  }
  return {
    ok: true,
    value: {
      runtime,
      documentInstances: documentInstances.value as DocumentInstanceRegistry,
      halfcodeRuntime: halfcodeRuntime.value as HalfcodeAppRuntime,
      ...(canonicalRegistry.ok
        ? { canonicalRegistry: canonicalRegistry.value as CanonicalComponentRegistry }
        : {}),
      register: register.value.bind(documentInstances.value) as DocumentInstanceRegistry['register'],
      unregister: unregister.value.bind(documentInstances.value) as DocumentInstanceRegistry['unregister'],
      ...(displayModeSession === undefined ? {} : { displayModeSession }),
      ...(modeRegistrations === undefined ? {} : { modeRegistrations }),
      ...(shellRegistry === undefined ? {} : { modeShellPresenters: shellRegistry }),
    },
  };
}

function isAbsentOptionalCapability(reason: string): boolean {
  return reason.includes('missing')
    || reason.includes('global platform prototype boundary')
    || reason.includes('native intrinsic prototype boundary');
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

function closedOccurrenceModeView(): XnlRichDocumentEmbeddedModeView {
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

function legacyEditModeView(): XnlRichDocumentEmbeddedModeView {
  return Object.freeze({
    mode: 'edit',
    overlay: 'inherit',
    inheritedMode: 'edit',
    source: 'base',
    allowedModes: Object.freeze(['edit'] as const),
    canSwitch: false,
  });
}

function resolveModeShellPresenter(
  id: string | undefined,
  registry: XnlRichDocumentModeShellPresenterRegistry | undefined,
  report: (code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode, message: string) => XnlRichDocumentHalfcodeNodeViewDiagnostic,
): Component {
  if (id === undefined) return DefaultModeAwareHalfcodeNodeViewShell;
  const resolved = registry?.resolve(id);
  if (resolved !== undefined) return resolved;
  report('UNKNOWN_HALFCODE_NODEVIEW_SHELL_PRESENTER', `No mode shell presenter is registered for "${id}".`);
  return DefaultModeAwareHalfcodeNodeViewShell;
}

function targetTitle(plan: UnitRenderPlan, fallback: string): string {
  return typeof plan.unitFqn === 'string' && plan.unitFqn.length > 0 ? plan.unitFqn : fallback;
}

function prepareHostInput(input: unknown): ReadResult<PreparedHostInput> {
  const record = readExactDataRecord(input, ['targets', 'occurrences'], 'Halfcode NodeView host input');
  if (!record.ok) return record;
  const targetItems = readDenseArray(record.value.targets, 'Halfcode NodeView targets');
  const occurrenceItems = readDenseArray(record.value.occurrences, 'Halfcode NodeView occurrences');
  if (!targetItems.ok) return targetItems;
  if (!occurrenceItems.ok) return occurrenceItems;
  const targets = new Map<string, XnlRichDocumentHalfcodeNodeViewTarget>();
  for (const value of targetItems.value) {
    const target = readExactDataRecord(
      value,
      hasOwnDataProperty(value, 'modeShellPresenterId')
        ? ['kind', 'ref', 'presenterIdentity', 'modeShellPresenterId', 'plan']
        : ['kind', 'ref', 'presenterIdentity', 'plan'],
      'Halfcode NodeView target',
    );
    if (!target.ok) return target;
    if (target.value.kind !== 'component-embed' && target.value.kind !== 'capsule-embed') {
      return { ok: false, message: 'Halfcode NodeView target kind is not supported.' };
    }
    if (
      !validTargetRef(target.value.kind, target.value.ref)
      || typeof target.value.presenterIdentity !== 'string'
      || target.value.presenterIdentity.trim().length === 0
      || (target.value.modeShellPresenterId !== undefined
        && (typeof target.value.modeShellPresenterId !== 'string'
          || target.value.modeShellPresenterId.trim().length === 0))
    ) {
      return { ok: false, message: 'Halfcode NodeView target ref or canonical render plan is invalid.' };
    }
    const plan = snapshotXnlRichDocumentEmbeddedSerializableRecord(
      target.value.plan,
      'Halfcode NodeView target plan',
    );
    if (!plan.ok || !isUnitRenderPlan(plan.value)) {
      return {
        ok: false,
        message: plan.ok
          ? 'Halfcode NodeView target canonical render plan is invalid.'
          : plan.message,
      };
    }
    const key = targetKey(target.value.kind, target.value.ref);
    if (targets.has(key)) return { ok: false, message: `Duplicate Halfcode NodeView target "${key}".` };
    targets.set(key, Object.freeze({
      kind: target.value.kind,
      ref: target.value.ref,
      presenterIdentity: target.value.presenterIdentity,
      ...(target.value.modeShellPresenterId === undefined
        ? {}
        : { modeShellPresenterId: target.value.modeShellPresenterId as string }),
      plan: plan.value,
    }));
  }
  const occurrences = new Map<string, XnlRichDocumentHalfcodeNodeViewOccurrence>();
  const occurrenceAddresses = new Set<string>();
  for (const value of occurrenceItems.value) {
    const verified = verifyXnlRichDocumentHalfcodeNodeViewOccurrence(value);
    if (verified.status !== 'assembled') {
      return { ok: false, message: verified.diagnostics.map((item) => item.message).join('; ') };
    }
    const occurrence = verified.occurrence;
    if (occurrences.has(occurrence.nodeId)) {
      return { ok: false, message: `Duplicate Halfcode NodeView occurrence nodeId "${occurrence.nodeId}".` };
    }
    const addressKey = `${occurrence.instanceRef.unitInstanceId}\u0000${occurrence.instanceRef.xId}`;
    if (occurrenceAddresses.has(addressKey)) {
      return { ok: false, message: 'Duplicate Halfcode NodeView occurrence address.' };
    }
    occurrenceAddresses.add(addressKey);
    occurrences.set(occurrence.nodeId, occurrence);
  }
  return { ok: true, value: { targets, occurrences } };
}

function readEmbedSnapshot(node: ProseMirrorNode, expectedKind: EmbedKind): ReadResult<EmbedSnapshot> {
  const expectedType = expectedKind === 'component-embed' ? 'componentEmbed' : 'capsuleEmbed';
  if (node.type.name !== expectedType) {
    return { ok: false, message: `Halfcode NodeView cannot update from "${node.type.name}" to "${expectedType}".` };
  }
  const attrs = readExactDataRecord(
    node.attrs,
    ['nodeId', 'ref', 'version', 'input'],
    'Halfcode embed attributes',
  );
  if (!attrs.ok) return attrs;
  if (typeof attrs.value.nodeId !== 'string' || attrs.value.nodeId.length === 0) {
    return { ok: false, message: 'Halfcode embed nodeId must be non-empty.' };
  }
  if (!validTargetRef(expectedKind, attrs.value.ref)) {
    return { ok: false, message: 'Halfcode embed ref does not match its node kind.' };
  }
  if (attrs.value.version !== null && typeof attrs.value.version !== 'string') {
    return { ok: false, message: 'Halfcode embed version must be null or a string.' };
  }
  if (attrs.value.input !== null && !isPlainRecord(attrs.value.input)) {
    return { ok: false, message: 'Halfcode embed input must be null or a serializable record.' };
  }
  const snapshot: EmbedSnapshot = {
    kind: expectedKind,
    nodeId: attrs.value.nodeId,
    ref: attrs.value.ref,
    ...(typeof attrs.value.version === 'string' ? { version: attrs.value.version } : {}),
    ...(attrs.value.input === null
      ? {}
      : { input: attrs.value.input as XnlProjectionSerializableRecord }),
  };
  return { ok: true, value: snapshot };
}

function isUnitRenderPlan(value: unknown): value is UnitRenderPlan {
  if (!isPlainRecord(value)) return false;
  const id = ownData(value, 'id');
  const unitFqn = ownData(value, 'unitFqn');
  const unitKind = ownData(value, 'unitKind');
  const root = ownData(value, 'root');
  return typeof id === 'string' && id.length > 0
    && typeof unitFqn === 'string' && unitFqn.length > 0
    && (unitKind === 'page' || unitKind === 'component' || unitKind === 'document')
    && Array.isArray(root);
}

function validTargetRef(kind: EmbedKind, value: unknown): value is string {
  return typeof value === 'string'
    && value.length > (kind === 'component-embed' ? 'component://'.length : 'capsule://'.length)
    && value.startsWith(kind === 'component-embed' ? 'component://' : 'capsule://');
}

function targetKey(kind: EmbedKind, ref: string): string {
  return `${kind}\u0000${ref}`;
}

function runtimeCapability(value: unknown, key: string): ReadResult<unknown> {
  const result = resolveApplicationDataCapability(value, key);
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, message: `Halfcode NodeView runtime capability "${key}" ${result.reason}.` };
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): ReadResult<Record<string, unknown>> {
  if (!isPlainRecord(value)) return { ok: false, message: `${label} must be a plain object.` };
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return { ok: false, message: `${label} could not be inspected safely.` };
  }
  if (
    ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    return { ok: false, message: `${label} must contain only ${keys.join(', ')}.` };
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false, message: `${label}.${key} could not be inspected safely.` };
    }
    if (descriptor === undefined || !('value' in descriptor)) {
      return { ok: false, message: `${label}.${key} must be an own data property.` };
    }
    result[key] = descriptor.value;
  }
  return { ok: true, value: result };
}

function hasOwnDataProperty(value: unknown, key: string): boolean {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  } catch {
    return false;
  }
}

function readDenseArray(value: unknown, label: string): ReadResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return { ok: false, message: `${label} must be a standard array.` };
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      return { ok: false, message: `${label}.length must be a safe own data property.` };
    }
    const length = lengthDescriptor.value;
    const expected = new Set<PropertyKey>(['length']);
    for (let index = 0; index < length; index += 1) expected.add(String(index));
    if (Reflect.ownKeys(value).some((key) => !expected.has(key))) {
      return { ok: false, message: `${label} must be dense and contain no extra fields.` };
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor)) {
        return { ok: false, message: `${label}[${index}] must be an own data property.` };
      }
      copy.push(descriptor.value);
    }
    return { ok: true, value: copy };
  } catch {
    return { ok: false, message: `${label} could not be inspected safely.` };
  }
}

function ownData(value: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function diagnostic(
  code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
  message: string,
): XnlRichDocumentHalfcodeNodeViewDiagnostic {
  return Object.freeze({ severity: 'error' as const, code, message });
}

function reportVueFailure(
  kind: EmbedKind,
  error: unknown,
  report: (
    code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
    message: string,
  ) => XnlRichDocumentHalfcodeNodeViewDiagnostic,
): XnlRichDocumentHalfcodeNodeViewDiagnostic {
  const resolutionMessage = hostPresenterResolutionFailureMessage(error);
  if (resolutionMessage !== undefined) {
    return report(
      kind === 'component-embed' ? 'UNKNOWN_HALFCODE_COMPONENT' : 'UNKNOWN_HALFCODE_CAPSULE',
      resolutionMessage,
    );
  }
  return report(
    'HALFCODE_NODEVIEW_VUE_MOUNT_FAILED',
    `Halfcode NodeView Vue mount failed: ${errorMessage(error)}`,
  );
}

function hostPresenterResolutionFailureMessage(error: unknown): string | undefined {
  if (!isObject(error)) return undefined;
  try {
    const code = Object.getOwnPropertyDescriptor(error, 'code');
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    return code !== undefined
      && 'value' in code
      && code.value === 'HALFCODE_HOST_PRESENTER_RESOLUTION_FAILED'
      && message !== undefined
      && 'value' in message
      && typeof message.value === 'string'
      ? message.value
      : undefined;
  } catch {
    return undefined;
  }
}

function rejected(
  code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
  message: string,
): Extract<XnlRichDocumentHalfcodeNodeViewHostResult, { status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: Object.freeze([diagnostic(code, message)]) as readonly [
      XnlRichDocumentHalfcodeNodeViewDiagnostic,
    ],
  });
}

function errorMessage(error: unknown): string {
  if (isObject(error)) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
      if (descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'string') {
        return descriptor.value;
      }
    } catch {
      return 'uninspectable error';
    }
    return 'unknown error';
  }
  return String(error);
}

type ReadResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; message: string }>;
