// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { defineComponent, h, nextTick, onUnmounted, ref, type Component } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentInstanceRegistry,
  createDocumentDisplayModeSession,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type HalfcodeAppRuntime,
} from 'dg-cell-mvi-halfcode-support';
import type {
  CanonicalComponentRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import type {
  CapsuleNodePlan,
  DocumentInstanceRef,
  DocumentDisplayModeSession,
  HalfcodeRef,
  UnitFqn,
  UnitRenderPlan,
  XnlProjectionPresenterRuntimeFacet,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlRichDocumentModeRegistrationCoordinator,
  createXnlRichDocumentHalfcodeNodeViewHost,
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
  type XnlRichDocumentHalfcodeNodeViewHostRuntime,
} from '../src';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const COMPONENT_REF = 'component://dg.docs.CounterCard';
const CAPSULE_REF = 'capsule://dg.docs.CounterCapsule';
const INSTANCE_REF: DocumentInstanceRef = Object.freeze({
  unitInstanceId: 'document-1',
  projectionRole: 'main',
  xId: 'component.counter-card',
});
const DESCRIPTOR = Object.freeze({
  projectionRole: 'main',
  xId: 'component.counter-card',
  documentNodeId: 'component.counter-card',
  scopeId: 'document-root',
});

interface PresenterHost {
  readonly title: string;
}

interface PresenterView {
  readonly title: string;
}

interface HostRuntime extends XnlRichDocumentHalfcodeNodeViewHostRuntime<PresenterView, HostRuntime> {
  readonly title: string;
}

const mountedEditors: Editor[] = [];

afterEach(() => {
  for (const editor of mountedEditors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.replaceChildren();
});

function presenterFacet(host: PresenterHost): XnlProjectionPresenterRuntimeFacet<PresenterView> {
  const grant = createXnlProjectionPresenterSnapshotGrant<
    PresenterHost,
    PresenterView,
    'title',
    'title'
  >(EMPTY, { id: 'document.title', sourceKey: 'title', facadeKey: 'title' }, EMPTY);
  const protocol = createXnlProjectionPresenterCapabilityProtocol<PresenterHost, PresenterView>(
    EMPTY,
    { id: 'document.presenter', grants: [grant] },
    EMPTY,
  );
  return createXnlProjectionPresenterRuntimeFacet({ source: host, protocol }, EMPTY, EMPTY);
}

const FORGED_INLINE_HOST_PROPS = {
  view: { title: 'inline-forged' },
  snapshot: { input: { count: -1 } },
  instanceRef: { unitInstanceId: 'inline-forged', projectionRole: 'main', xId: 'inline-forged' },
  emitEditIntent: 'inline-forged',
};

const FORGED_CONFIG_HOST_PROPS = {
  view: { title: 'config-forged' },
  snapshot: { input: { count: -2 } },
  instanceRef: { unitInstanceId: 'config-forged', projectionRole: 'main', xId: 'config-forged' },
  emitEditIntent: 'config-forged',
};

function probeNode(id: string, componentIdentity: string) {
  return {
    id,
    kind: 'atom' as const,
    tag: componentIdentity,
    propsBinding: 'config://#forged-host-input' as HalfcodeRef,
    inlineProps: FORGED_INLINE_HOST_PROPS,
  };
}

function componentPlan(id: string, componentIdentity: string): UnitRenderPlan {
  return {
    id,
    unitFqn: `dg.docs.${id}` as UnitFqn,
    unitKind: 'component',
    root: [probeNode(`${id}.root`, componentIdentity)],
  };
}

function capsulePlan(id: string, componentIdentity: string): UnitRenderPlan {
  const capsule: CapsuleNodePlan = {
    id: `${id}.capsule`,
    kind: 'capsule',
    children: [probeNode(`${id}.probe`, componentIdentity)],
  };
  return {
    id: `${id}.owner`,
    unitFqn: `dg.docs.${id}Owner` as UnitFqn,
    unitKind: 'document',
    root: [capsule],
  };
}

function appRuntime(plans: readonly UnitRenderPlan[]): HalfcodeAppRuntime {
  return {
    bundle: {} as never,
    plans: {
      renderPlans: [...plans],
      scopeRuntimePlans: [],
      messageDispatchPlan: [],
      routePlan: { routes: [] },
      documentPlans: [],
      flowPlans: [],
      diagnostics: [],
    } as never,
    assemblies: {},
    flows: {} as never,
    resolveScope: () => undefined,
    resolveFlow: () => undefined,
    resolveConfig: () => FORGED_CONFIG_HOST_PROPS,
    dispatchCommand: async () => ({ diagnostics: [] }),
    dispose: vi.fn(),
  };
}

function node(
  kind: 'componentEmbed' | 'capsuleEmbed',
  ref: string,
  input: Record<string, unknown>,
  nodeId = 'component.counter-card',
) {
  return {
    type: kind,
    attrs: { nodeId, ref, version: null, input },
  };
}

function createRuntime(
  components: Readonly<Record<string, Component>>,
  targets = [
    {
      kind: 'component-embed' as const,
      ref: COMPONENT_REF,
      presenterIdentity: 'CounterCardProbe',
      plan: componentPlan('CounterCard', 'CounterCardProbe'),
    },
    {
      kind: 'capsule-embed' as const,
      ref: CAPSULE_REF,
      presenterIdentity: 'CounterCapsuleProbe',
      plan: capsulePlan('CounterCapsule', 'CounterCapsuleProbe'),
    },
  ],
  displayModeSession?: DocumentDisplayModeSession,
) {
  const host: PresenterHost = { title: 'Trusted title' };
  const documentInstances = createDocumentInstanceRegistry();
  const canonicalRegistry: CanonicalComponentRegistry = {
    resolve(identity) {
      return typeof identity === 'string' ? components[identity] : undefined;
    },
  };
  const runtime: HostRuntime = {
    title: host.title,
    presenterFacet: presenterFacet(host),
    editIntentPort: () => ({ status: 'emitted' }),
    documentInstances,
    halfcodeRuntime: appRuntime(targets.map((target) => target.plan)),
    canonicalRegistry,
    ...(displayModeSession === undefined ? {} : { displayMode: { session: displayModeSession } }),
  };
  const occurrence = (
    nodeId: string,
    role = 'main',
    roleCardinality: 'single' | 'multiple' = 'single',
  ) => {
    const result = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
      nodeId: nodeId as XnlRichDocumentDomainNodeId,
      unitInstanceId: 'document-1',
      role,
      roleCardinality,
      descriptor: { scopeId: 'document-root' },
    }, EMPTY);
    if (result.status !== 'assembled') throw new Error(result.diagnostics[0].message);
    return result.occurrence;
  };
  const hostInput = Object.freeze({
    targets,
    occurrences: [
      occurrence('component.counter-card'),
      occurrence('component.counter-card-duplicate'),
    ],
  });
  const result = createXnlRichDocumentHalfcodeNodeViewHost(
    runtime,
    hostInput,
    EMPTY,
  );
  return { result, runtime, documentInstances, hostInput };
}

async function mountEditor(
  extensions: ReturnType<typeof createXnlRichDocumentHalfcodeNodeViewHost> extends infer TResult
    ? TResult extends { status: 'ready'; extensions: infer TExtensions } ? TExtensions : never
    : never,
  content: Record<string, unknown>,
  ownerDocument: Document = document,
) {
  const target = ownerDocument.body.appendChild(ownerDocument.createElement('div'));
  const editor = new Editor({ element: target, extensions: extensions as never, content });
  mountedEditors.push(editor);
  await nextTick();
  return { editor, target };
}

async function openModeMenu(target: HTMLElement) {
  const trigger = target.querySelector<HTMLButtonElement>('[data-testid="xnl-mode-shell-trigger"]');
  expect(trigger).not.toBeNull();
  trigger!.click();
  await nextTick();
  expect(target.querySelector('[data-testid="xnl-mode-shell-menu"]')).not.toBeNull();
  return trigger!;
}

async function chooseMode(target: HTMLElement, mode: 'inherit' | 'view' | 'edit') {
  await openModeMenu(target);
  const option = target.querySelector<HTMLButtonElement>(`[data-mode-option="${mode}"]`);
  expect(option).not.toBeNull();
  option!.click();
}

describe('T3.2 Halfcode Component/Capsule NodeView host', () => {
  it('preserves one mode lease and overlay across browser-host replacement when a presentation shares its coordinator', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: (props) => () => h('output', { 'data-testid': 'replacement-mode' }, `${props.mode.mode}:${props.mode.overlay}`),
    });
    const owner = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await owner.refreshPolicy();
    const register = vi.fn((instanceRef: DocumentInstanceRef) => owner.register(instanceRef));
    const unregister = vi.fn((instanceRef: DocumentInstanceRef, lease: string) => owner.unregister(instanceRef, lease));
    const session: DocumentDisplayModeSession = Object.freeze({ ...owner, register, unregister });
    const registrations = createXnlRichDocumentModeRegistrationCoordinator(session);
    const seed = createRuntime({ CounterCardProbe: Probe });
    const runtime = Object.assign(Object.create(seed.runtime) as object, {
      displayMode: { session, registrations },
    }) as HostRuntime;
    const firstHost = createXnlRichDocumentHalfcodeNodeViewHost(runtime, seed.hostInput, EMPTY);
    const secondHost = createXnlRichDocumentHalfcodeNodeViewHost(runtime, seed.hostInput, EMPTY);
    expect(firstHost.status).toBe('ready');
    expect(secondHost.status).toBe('ready');
    if (firstHost.status !== 'ready' || secondHost.status !== 'ready') return;
    const content = {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [node('componentEmbed', COMPONENT_REF, {})],
    };
    const { editor: firstEditor } = await mountEditor(firstHost.extensions, content);
    await vi.waitFor(() => expect(
      owner.snapshot().state.occurrences,
      `${JSON.stringify(firstHost.readDiagnostics())}\n${document.body.innerHTML}`,
    ).toHaveLength(1));
    const occurrence = owner.snapshot().state.occurrences[0]!;
    await owner.dispatch({
      type: 'set-overlay',
      correlationId: 'replacement:view',
      ref: occurrence.ref,
      lease: occurrence.lease,
      mode: 'view',
    });

    firstEditor.destroy();
    firstHost.dispose();
    const target = document.body.appendChild(document.createElement('div'));
    const replacementEditor = new Editor({ element: target, extensions: secondHost.extensions, content });
    mountedEditors.push(replacementEditor);
    await nextTick();
    await vi.waitFor(() => expect(target.querySelector('[data-testid="replacement-mode"]')?.textContent).toBe('view:view'));
    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();

    replacementEditor.destroy();
    secondHost.dispose();
    registrations.dispose();
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledTimes(1));
    expect(owner.snapshot().state.occurrences).toHaveLength(0);
    owner.destroy();
  });

  it('disables Inherit when policy does not allow the inherited document mode', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: (props) => () => h('output', { 'data-testid': 'inherit-mode' }, `${props.mode.inheritedMode}:${props.mode.overlay}`),
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: {
        runtime: {},
        config: {},
        processor: (_runtime, input) => input.requestedMode === 'edit'
          ? ({ allowed: false, allowedModes: ['view'], reason: 'Edit denied.' })
          : ({ allowed: true, allowedModes: ['view'], reason: 'Edit denied.' }),
      },
    });
    await session.refreshPolicy();
    const { result } = createRuntime({ CounterCardProbe: Probe }, undefined, session);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, {}),
        { type: 'paragraph', attrs: { nodeId: 'paragraph.after' }, content: [{ type: 'text', text: 'After' }] },
      ],
    });
    await vi.waitFor(() => expect(
      session.snapshot().state.occurrences,
      `${JSON.stringify(result.readDiagnostics())}\n${document.body.innerHTML}`,
    ).toHaveLength(1));
    const occurrence = session.snapshot().state.occurrences[0]!;
    await session.dispatch({
      type: 'set-overlay',
      correlationId: 'policy:view',
      ref: occurrence.ref,
      lease: occurrence.lease,
      mode: 'view',
    });
    await vi.waitFor(() => expect(target.querySelector('[data-testid="inherit-mode"]')?.textContent).toBe('edit:view'));
    expect(target.querySelector('.xnl-mode-shell__header')).toBeNull();
    expect(target.querySelector('.xnl-mode-shell__reason')).toBeNull();
    await openModeMenu(target);
    const inherit = target.querySelector<HTMLButtonElement>('[data-mode-option="inherit"]');
    expect(inherit?.disabled).toBe(true);
    expect(target.querySelector('.xnl-mode-shell__reason')?.textContent).toContain('Edit denied.');
    editor.destroy();
    result.dispose();
    session.destroy();
  });

  it('keeps contextual mode chrome out of document flow and closes it accessibly', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: () => () => h('output', { 'data-testid': 'contextual-content' }, 'Document content'),
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await session.refreshPolicy();
    const { result } = createRuntime({ CounterCardProbe: Probe }, undefined, session);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, {}),
        { type: 'paragraph', attrs: { nodeId: 'paragraph.after' }, content: [{ type: 'text', text: 'After' }] },
      ],
    });
    await vi.waitFor(() => expect(target.querySelector('[data-testid="contextual-content"]')).not.toBeNull());

    const shell = target.querySelector<HTMLElement>('[data-testid="xnl-mode-shell"]')!;
    expect(shell.querySelector('.xnl-mode-shell__header')).toBeNull();
    expect(shell.querySelector('[data-testid="xnl-mode-shell-menu"]')).toBeNull();
    editor.commands.setNodeSelection(0);
    await nextTick();
    expect(shell.classList.contains('is-selected')).toBe(true);
    editor.commands.setTextSelection(2);
    await nextTick();
    expect(shell.classList.contains('is-selected')).toBe(false);
    const trigger = await openModeMenu(target);
    expect(shell.querySelectorAll('[data-mode-option]')).toHaveLength(3);
    expect(shell.querySelector('[role="menu"]')).toBeNull();
    expect(shell.querySelector('[role="group"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(shell.querySelector('[data-testid="xnl-mode-shell-menu"]')).toBeNull();
    await openModeMenu(target);
    shell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(shell.querySelector('[data-testid="xnl-mode-shell-menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    editor.destroy();
    result.dispose();
    session.destroy();
  });

  it('binds contextual dismissal and cleanup to the editor owner document', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: () => () => h('output', { 'data-testid': 'foreign-content' }, 'Foreign document content'),
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await session.refreshPolicy();
    const { result } = createRuntime({ CounterCardProbe: Probe }, undefined, session);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const iframe = document.body.appendChild(document.createElement('iframe'));
    const ownerDocument = iframe.contentDocument!;
    const addListener = vi.spyOn(ownerDocument, 'addEventListener');
    const removeListener = vi.spyOn(ownerDocument, 'removeEventListener');
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    }, ownerDocument);
    await vi.waitFor(() => expect(target.querySelector('[data-testid="foreign-content"]')).not.toBeNull());

    await openModeMenu(target);
    ownerDocument.body.dispatchEvent(new ownerDocument.defaultView!.MouseEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(target.querySelector('[data-testid="xnl-mode-shell-menu"]')).toBeNull();
    expect(addListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);

    editor.destroy();
    result.dispose();
    session.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  });

  it('shares one mode lease when a stable occurrence is synchronously remounted', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: (props) => () => h('output', { 'data-testid': 'remount-mode' }, props.mode.mode),
    });
    const owner = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await owner.refreshPolicy();
    const register = vi.fn((instanceRef: DocumentInstanceRef) => owner.register(instanceRef));
    const unregister = vi.fn((instanceRef: DocumentInstanceRef, lease: string) => owner.unregister(instanceRef, lease));
    const observedSession: DocumentDisplayModeSession = Object.freeze({
      ...owner,
      register,
      unregister,
    });
    const { result } = createRuntime({ CounterCardProbe: Probe }, undefined, observedSession);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const content = {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [node('componentEmbed', COMPONENT_REF, {})],
    };
    const { editor: firstEditor } = await mountEditor(result.extensions, content);
    await vi.waitFor(() => expect(
      owner.snapshot().state.occurrences,
      `${JSON.stringify(result.readDiagnostics())}\n${document.body.innerHTML}`,
    ).toHaveLength(1));
    expect(register).toHaveBeenCalledTimes(1);
    firstEditor.destroy();
    const target = document.body.appendChild(document.createElement('div'));
    const replacementEditor = new Editor({ element: target, extensions: result.extensions, content });
    mountedEditors.push(replacementEditor);
    await nextTick();
    await vi.waitFor(() => expect(target.querySelector('[data-testid="remount-mode"]')).not.toBeNull());
    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();

    expect(result.readDiagnostics()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_NODEVIEW_MODE_REGISTRATION_REJECTED' }),
    ]));
    await owner.dispatch({ type: 'set-base', correlationId: 'remount:view', mode: 'view' });
    await vi.waitFor(() => expect(target.querySelector('[data-testid="remount-mode"]')?.textContent).toBe('view'));

    replacementEditor.destroy();
    await vi.waitFor(() => expect(owner.snapshot().state.occurrences).toHaveLength(0));
    expect(unregister).toHaveBeenCalledTimes(1);
    result.dispose();
    owner.destroy();
  });

  it('creates a fresh mode registration generation when reacquired during async unregister', async () => {
    const owner = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await owner.refreshPolicy();
    let finishUnregister!: () => void;
    const unregisterGate = new Promise<void>((resolve) => { finishUnregister = resolve; });
    const register = vi.fn((instanceRef: DocumentInstanceRef) => owner.register(instanceRef));
    const unregister = vi.fn(async (instanceRef: DocumentInstanceRef, lease: string) => {
      await unregisterGate;
      return owner.unregister(instanceRef, lease);
    });
    const coordinator = createXnlRichDocumentModeRegistrationCoordinator(Object.freeze({
      ...owner,
      register,
      unregister,
    }));

    const first = coordinator.acquire(INSTANCE_REF);
    await vi.waitFor(() => expect(first.lease()).toEqual(expect.any(String)));
    first.release();
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledTimes(1));
    const second = coordinator.acquire(INSTANCE_REF);
    expect(second.lease()).toBeUndefined();
    finishUnregister();
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(second.lease()).toEqual(expect.any(String)));
    expect(owner.snapshot().state.occurrences).toHaveLength(1);

    second.release();
    coordinator.dispose();
    await vi.waitFor(() => expect(owner.snapshot().state.occurrences).toHaveLength(0));
    owner.destroy();
  });

  it('projects occurrence mode through one shell while guarding authoring and preserving business interaction', async () => {
    const businessCount = ref(0);
    const editOutcome = ref('none');
    const emitted = vi.fn(() => ({ status: 'emitted' as const }));
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup(props) {
        return () => h('div', {}, [
          h('output', { 'data-testid': 'mode-probe' }, `${props.mode.mode}:${props.mode.overlay}`),
          h('button', { 'data-testid': 'business-action', onClick: () => { businessCount.value += 1; } }, 'Business action'),
          h('button', {
            'data-testid': 'authoring-action',
            onClick: async () => {
              const outcome = await props.emitEditIntent(props.view, {
                intent: {
                  kind: 'interaction',
                  proposal: {
                    type: 'xnl.rich-document.edit',
                    target: { planNodeId: 'xnlp:node:document' },
                    payload: { action: 'configure' },
                  },
                },
              }, {});
              editOutcome.value = outcome.status;
            },
          }, 'Authoring action'),
        ]);
      },
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await session.refreshPolicy();
    const { runtime, hostInput } = createRuntime({ CounterCardProbe: Probe }, undefined, session);
    const result = createXnlRichDocumentHalfcodeNodeViewHost(
      { ...runtime, editIntentPort: emitted } as never,
      hostInput,
      EMPTY,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    await vi.waitFor(() => expect(session.snapshot().state.occurrences).toHaveLength(1));
    await vi.waitFor(() => expect(target.querySelector('[data-testid="xnl-mode-shell"]')?.getAttribute('data-display-mode')).toBe('edit'));
    const documentBeforeModeChanges = editor.getJSON();

    await chooseMode(target, 'view');
    await vi.waitFor(() => expect(target.querySelector('[data-testid="mode-probe"]')?.textContent).toBe('view:view'));
    target.querySelector<HTMLButtonElement>('[data-testid="business-action"]')!.click();
    target.querySelector<HTMLButtonElement>('[data-testid="authoring-action"]')!.click();
    await vi.waitFor(() => expect(editOutcome.value).toBe('rejected'));
    expect(businessCount.value).toBe(1);
    expect(emitted).not.toHaveBeenCalled();

    await chooseMode(target, 'edit');
    await vi.waitFor(() => expect(target.querySelector('[data-testid="mode-probe"]')?.textContent).toBe('edit:edit'));
    target.querySelector<HTMLButtonElement>('[data-testid="authoring-action"]')!.click();
    await vi.waitFor(() => expect(editOutcome.value).toBe('emitted'));
    expect(emitted).toHaveBeenCalledTimes(1);
    await chooseMode(target, 'inherit');
    await vi.waitFor(() => expect(target.querySelector('[data-testid="mode-probe"]')?.textContent).toBe('edit:inherit'));
    expect(editor.getJSON()).toEqual(documentBeforeModeChanges);

    editor.destroy();
    await vi.waitFor(() => expect(session.snapshot().state.occurrences).toHaveLength(0));
    session.destroy();
  });

  it('resolves a stable shell presenter without handing it transition authority', async () => {
    const shellPropKeys: string[][] = [];
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: (props) => () => h('output', { 'data-testid': 'shell-child' }, props.mode.mode),
    });
    const CustomShell = defineComponent({
      props: ['kind', 'title', 'mode', 'view', 'requestModeTransition'],
      setup: (props, { slots }) => {
        shellPropKeys.push(Object.keys(props).sort());
        return () => h('section', {
        'data-testid': 'custom-mode-shell',
        }, [
          h('button', {
            'data-testid': 'custom-shell-view',
            onClick: () => props.requestModeTransition(props.view, { mode: 'view' }, {}),
          }, 'View'),
          slots.default?.(),
        ]);
      },
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await session.refreshPolicy();
    const targets = [{
      kind: 'component-embed' as const,
      ref: COMPONENT_REF,
      presenterIdentity: 'CounterCardProbe',
      modeShellPresenterId: 'document.shell.compact',
      plan: componentPlan('CounterCard', 'CounterCardProbe'),
    }];
    const { runtime, hostInput } = createRuntime({ CounterCardProbe: Probe }, targets, session);
    const result = createXnlRichDocumentHalfcodeNodeViewHost({
      ...runtime,
      modeShellPresenters: { resolve: (id: string) => id === 'document.shell.compact' ? CustomShell : undefined },
    } as never, hostInput, EMPTY);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    await vi.waitFor(() => expect(target.querySelector('[data-testid="custom-mode-shell"]'), JSON.stringify(result.readDiagnostics())).not.toBeNull());
    await vi.waitFor(() => expect(target.querySelector('[data-testid="shell-child"]')?.textContent).toBe('edit'));
    expect(shellPropKeys[0]).toEqual(['kind', 'mode', 'requestModeTransition', 'title', 'view']);
    for (const forbidden of ['session', 'lease', 'registry', 'ownerToken', 'writer', 'unregister']) {
      expect(shellPropKeys.flat()).not.toContain(forbidden);
    }
    target.querySelector<HTMLButtonElement>('[data-testid="custom-shell-view"]')!.click();
    await vi.waitFor(() => expect(target.querySelector('[data-testid="shell-child"]')?.textContent).toBe('view'));
    expect(session.snapshot().state.occurrences[0]?.overlay).toBe('view');
    editor.destroy();
    await vi.waitFor(() => expect(session.snapshot().state.occurrences).toHaveLength(0));
    session.destroy();
  });

  it('uses the same mode shell protocol for Capsule occurrences', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: (props) => () => h('output', { 'data-testid': 'capsule-mode-probe' }, `${props.mode.mode}:${props.mode.overlay}`),
    });
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await session.refreshPolicy();
    const { result } = createRuntime({ CounterCapsuleProbe: Probe }, undefined, session);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('capsuleEmbed', CAPSULE_REF, {})],
    });
    await vi.waitFor(() => expect(target.querySelector('[data-testid="capsule-mode-probe"]')?.textContent).toBe('edit:inherit'));
    await chooseMode(target, 'view');
    await vi.waitFor(() => expect(target.querySelector('[data-testid="capsule-mode-probe"]')?.textContent).toBe('view:view'));
    editor.destroy();
    await vi.waitFor(() => expect(session.snapshot().state.occurrences).toHaveLength(0));
    session.destroy();
  });

  it('releases a mode lease exactly once when async registration settles after NodeView destruction', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent', 'mode', 'requestModeTransition'],
      setup: () => () => h('output', {}, 'Pending'),
    });
    const owner = createDocumentDisplayModeSession({
      unitInstanceId: 'document-1',
      initialBaseMode: 'edit',
      policy: { runtime: {}, config: {}, processor: () => ({ allowed: true, allowedModes: ['view', 'edit'] }) },
    });
    await owner.refreshPolicy();
    let releaseRegistration!: () => void;
    const registrationGate = new Promise<void>((resolve) => { releaseRegistration = resolve; });
    const register = vi.fn(async (instanceRef: DocumentInstanceRef) => {
      await registrationGate;
      return owner.register(instanceRef);
    });
    const unregister = vi.fn((instanceRef: DocumentInstanceRef, lease: string) => owner.unregister(instanceRef, lease));
    const deferredSession: DocumentDisplayModeSession = Object.freeze({
      ...owner,
      register,
      unregister,
    });
    const { result } = createRuntime({ CounterCardProbe: Probe }, undefined, deferredSession);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    editor.destroy();
    releaseRegistration();
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledTimes(1));
    expect(owner.snapshot().state.occurrences).toHaveLength(0);
    owner.destroy();
  });

  it.each([
    ['componentEmbed' as const, COMPONENT_REF, 'CounterCardProbe', 'component'],
    ['capsuleEmbed' as const, CAPSULE_REF, 'CounterCapsuleProbe', 'capsule'],
  ])('mounts, updates and unmounts a real %s Vue NodeView', async (kind, ref, identity, label) => {
    const unmounted = vi.fn();
    const visibleInputs: string[][] = [];
    const visibleValues: Record<string, unknown>[] = [];
    const Probe = defineComponent({
      name: identity,
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup(props) {
        visibleInputs.push(Object.keys(props).sort());
        visibleValues.push({
          view: props.view,
          snapshot: props.snapshot,
          instanceRef: props.instanceRef,
          emitEditIntent: props.emitEditIntent,
        });
        onUnmounted(unmounted);
        return () => h('output', {
          'data-testid': `${label}-probe`,
          'data-instance': (props.instanceRef as DocumentInstanceRef).xId,
        }, `${(props.view as PresenterView).title}:${String((props.snapshot as any).input.count)}`);
      },
    });
    const { result, documentInstances } = createRuntime({ [identity]: Probe });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [node(kind, ref, { count: 1 })],
    });
    expect(target.querySelector(`[data-testid="${label}-probe"]`)?.textContent)
      .toBe('Trusted title:1');
    expect(target.querySelector('[data-halfcode-nodeview]')?.getAttribute('data-x-id'))
      .toBe('component.counter-card');
    expect(documentInstances.resolve(INSTANCE_REF).ok).toBe(true);
    expect(visibleInputs).toEqual([['emitEditIntent', 'instanceRef', 'snapshot', 'view']]);
    expect((visibleValues[0]?.view as PresenterView).title).toBe('Trusted title');
    expect((visibleValues[0]?.snapshot as any).input.count).toBe(1);
    expect(visibleValues[0]?.instanceRef).toEqual(INSTANCE_REF);
    expect(typeof visibleValues[0]?.emitEditIntent).toBe('function');
    const registered = documentInstances.resolve<Record<string, unknown>>(INSTANCE_REF);
    expect(registered.ok && registered.value?.target).not.toHaveProperty('ownerToken');
    expect(registered.ok && registered.value?.target).not.toHaveProperty('unregister');

    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, {
      ...editor.state.doc.firstChild?.attrs,
      input: { count: 2 },
    }));
    await nextTick();
    expect(target.querySelector(`[data-testid="${label}-probe"]`)?.textContent)
      .toBe('Trusted title:2');
    expect(documentInstances.list()).toHaveLength(1);

    editor.destroy();
    await nextTick();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(documentInstances.list()).toEqual([]);
  });

  it('disposes every live Vue NodeView and registry lease exactly once', async () => {
    const unmounted = vi.fn();
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup() {
        onUnmounted(unmounted);
        return () => h('output', { 'data-testid': 'dispose-probe' });
      },
    });
    const { result, documentInstances } = createRuntime({ CounterCardProbe: Probe });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, { slot: 1 }),
        node('componentEmbed', COMPONENT_REF, { slot: 2 }, 'component.counter-card-duplicate'),
      ],
    });
    expect(documentInstances.list()).toHaveLength(2);

    result.dispose();
    await nextTick();
    expect(unmounted).toHaveBeenCalledTimes(2);
    expect(documentInstances.list()).toEqual([]);

    result.dispose();
    expect(unmounted).toHaveBeenCalledTimes(2);
    expect(documentInstances.list()).toEqual([]);
  });

  it('rejects a target whose code-owned Presenter identity does not match the host-input path', async () => {
    const mounted = vi.fn();
    const Probe = defineComponent({
      setup() {
        mounted();
        return () => h('output', { 'data-testid': 'mismatched-presenter' });
      },
    });
    const target = {
      kind: 'component-embed' as const,
      ref: COMPONENT_REF,
      presenterIdentity: 'DifferentPresenter',
      plan: componentPlan('CounterCard', 'CounterCardProbe'),
    };
    const { result, documentInstances } = createRuntime(
      { CounterCardProbe: Probe },
      [target],
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { target: editorTarget } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNKNOWN_HALFCODE_COMPONENT' }),
    ]));
    expect(mounted).not.toHaveBeenCalled();
    expect(editorTarget.querySelector('[data-testid="mismatched-presenter"]')).toBeNull();
    expect(documentInstances.list()).toEqual([]);
  });

  it('rejects duplicate occurrence registration without mounting the second embedded implementation', async () => {
    const mounted = vi.fn();
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup: () => {
        mounted();
        return () => h('output', { 'data-testid': 'duplicate-probe' });
      },
    });
    const { result, documentInstances } = createRuntime({ CounterCardProbe: Probe });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, { slot: 1 }),
        node(
          'componentEmbed',
          COMPONENT_REF,
          { slot: 2 },
          'component.counter-card',
        ),
      ],
    });
    expect(mounted).toHaveBeenCalled();
    expect(target.querySelectorAll('[data-testid="duplicate-probe"]')).toHaveLength(1);
    expect(documentInstances.list()).toHaveLength(1);
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE' }),
    ]));
    expect(target.querySelectorAll('[data-halfcode-nodeview-diagnostic]')).toHaveLength(1);
  });

  it('does not hand off an active duplicate address even when both nodes claim the same nodeId', async () => {
    const mounted = vi.fn();
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup: () => {
        mounted();
        return () => h('output', { 'data-testid': 'same-node-id-probe' });
      },
    });
    const { result, documentInstances } = createRuntime({ CounterCardProbe: Probe });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, { slot: 1 }),
        node('componentEmbed', COMPONENT_REF, { slot: 2 }),
      ],
    });

    expect(mounted).toHaveBeenCalledTimes(1);
    expect(target.querySelectorAll('[data-testid="same-node-id-probe"]')).toHaveLength(1);
    expect(documentInstances.list()).toHaveLength(1);
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE' }),
    ]));
  });

  it('mounts the same persistent node in distinct multi-role hosts without address collision', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup(props) {
        return () => h('output', { 'data-testid': `role-${props.instanceRef.projectionRole}` }, props.instanceRef.xId);
      },
    });
    const base = createRuntime({ CounterCardProbe: Probe });
    const documentInstances = createDocumentInstanceRegistry();
    const createRoleHost = (role: 'main' | 'summary') => {
      const assembled = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
        nodeId: 'component.counter-card' as XnlRichDocumentDomainNodeId,
        unitInstanceId: 'document-1',
        role,
        roleCardinality: 'multiple',
        descriptor: { scopeId: 'document-root' },
      }, EMPTY);
      if (assembled.status !== 'assembled') throw new Error(assembled.diagnostics[0].message);
      return createXnlRichDocumentHalfcodeNodeViewHost(
        { ...base.runtime, documentInstances },
        { targets: base.hostInput.targets, occurrences: [assembled.occurrence] },
        EMPTY,
      );
    };
    const main = createRoleHost('main');
    const summary = createRoleHost('summary');
    expect(main.status).toBe('ready');
    expect(summary.status).toBe('ready');
    if (main.status !== 'ready' || summary.status !== 'ready') return;
    const mainMount = await mountEditor(main.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture.main' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    const summaryMount = await mountEditor(summary.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture.summary' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    const mainXId = mainMount.target.querySelector('[data-halfcode-nodeview]')?.getAttribute('data-x-id');
    const summaryXId = summaryMount.target.querySelector('[data-halfcode-nodeview]')?.getAttribute('data-x-id');
    expect(mainXId).toMatch(/^xrd-o-/);
    expect(summaryXId).toMatch(/^xrd-o-/);
    expect(summaryXId).not.toBe(mainXId);
    expect(main.readDiagnostics()).toEqual([]);
    expect(summary.readDiagnostics()).toEqual([]);
    expect(documentInstances.list()).toHaveLength(2);
    mainMount.editor.destroy();
    await nextTick();
    expect(documentInstances.list()).toHaveLength(1);
    summaryMount.editor.destroy();
    await nextTick();
    expect(documentInstances.list()).toEqual([]);
  });

  it('keeps one canonical registry address when a persistent embed node moves', async () => {
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup: (props) => () => h('output', { 'data-testid': 'move-probe' }, props.instanceRef.xId),
    });
    const { result, documentInstances } = createRuntime({ CounterCardProbe: Probe });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc',
      attrs: { nodeId: 'document.fixture' },
      content: [
        node('componentEmbed', COMPONENT_REF, {}),
        { type: 'paragraph', attrs: { nodeId: 'paragraph.after' }, content: [{ type: 'text', text: 'After' }] },
      ],
    });
    const before = documentInstances.list()[0]?.ref;
    const moving = editor.state.doc.child(0);
    const transaction = editor.state.tr.delete(0, moving.nodeSize);
    transaction.insert(transaction.doc.content.size, moving);
    editor.view.dispatch(transaction);
    await nextTick();
    expect(result.readDiagnostics()).toEqual([]);
    expect(documentInstances.list()).toHaveLength(1);
    expect(documentInstances.list()[0]?.ref).toEqual(before);
    expect(target.querySelector('[data-halfcode-nodeview]')?.getAttribute('data-x-id'))
      .toBe(before?.xId);
    expect(result.readDiagnostics()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_HALFCODE_NODEVIEW_OCCURRENCE' }),
    ]));
  });

  it('keeps one role per nodeId in a host and rejects ambiguous same-host multi-role input', () => {
    const base = createRuntime({});
    const occurrenceForRole = (role: 'main' | 'summary') => {
      const assembled = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
        nodeId: 'component.counter-card' as XnlRichDocumentDomainNodeId,
        unitInstanceId: 'document-1',
        role,
        roleCardinality: 'multiple',
        descriptor: { scopeId: 'document-root' },
      }, EMPTY);
      if (assembled.status !== 'assembled') throw new Error(assembled.diagnostics[0].message);
      return assembled.occurrence;
    };
    const result = createXnlRichDocumentHalfcodeNodeViewHost(
      base.runtime,
      {
        targets: base.hostInput.targets,
        occurrences: [occurrenceForRole('main'), occurrenceForRole('summary')],
      },
      EMPTY,
    );
    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'INVALID_HALFCODE_NODEVIEW_INPUT' }],
    });
    expect(base.documentInstances.list()).toEqual([]);
  });

  it('rejects missing and mismatched occurrence identity without registry authority', async () => {
    const base = createRuntime({});
    const missing = createXnlRichDocumentHalfcodeNodeViewHost(
      base.runtime,
      { targets: base.hostInput.targets, occurrences: [] },
      EMPTY,
    );
    expect(missing.status).toBe('ready');
    if (missing.status === 'ready') {
      const { target } = await mountEditor(missing.extensions, {
        type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
      });
      expect(missing.readDiagnostics()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_HALFCODE_NODEVIEW_INPUT' }),
      ]));
      expect(target.querySelector('[data-halfcode-nodeview-diagnostic]')).not.toBeNull();
    }

    const canonical = base.hostInput.occurrences[0]!;
    const mismatched = createXnlRichDocumentHalfcodeNodeViewHost(
      base.runtime,
      {
        targets: base.hostInput.targets,
        occurrences: [{
          ...canonical,
          instanceRef: { ...canonical.instanceRef, xId: 'forged-x-id' as never },
        }],
      },
      EMPTY,
    );
    expect(mismatched).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'INVALID_HALFCODE_NODEVIEW_INPUT' }],
    });
    expect(base.documentInstances.list()).toEqual([]);
  });

  it.each([
    ['componentEmbed' as const, 'component://dg.docs.Missing', 'UNKNOWN_HALFCODE_COMPONENT'],
    ['capsuleEmbed' as const, 'capsule://dg.docs.Missing', 'UNKNOWN_HALFCODE_CAPSULE'],
  ])('reports an unknown %s without raw component or JSON fallback', async (kind, ref, code) => {
    const { result, documentInstances } = createRuntime({});
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node(kind, ref, { secret: 'no-fallback' })],
    });
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
    expect(target.textContent).not.toContain('no-fallback');
    expect(target.innerHTML).not.toContain(ref);
    expect(documentInstances.list()).toEqual([]);
  });

  it.each([
    ['missing registry', undefined],
    ['unresolved presenter', { resolve: () => undefined }],
    ['raw custom-element result', { resolve: () => 'UnresolvedPresenter' }],
  ])('fails explicitly when a known target has a %s', async (_label, canonicalRegistry) => {
    const { runtime, documentInstances, hostInput } = createRuntime({});
    const { canonicalRegistry: _ignored, ...runtimeWithoutRegistry } = runtime;
    const result = createXnlRichDocumentHalfcodeNodeViewHost(
      (canonicalRegistry === undefined
        ? runtimeWithoutRegistry
        : { ...runtime, canonicalRegistry }) as never,
      hostInput,
      EMPTY,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const { target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNKNOWN_HALFCODE_COMPONENT' }),
    ]));
    expect(target.querySelector('countercardprobe')).toBeNull();
    expect(target.querySelector('unresolvedpresenter')).toBeNull();
    expect(documentInstances.list()).toEqual([]);
  });

  it('keeps embedded control events inside the Presenter while the wrapper remains node-selectable', async () => {
    const emitted = vi.fn(() => ({ status: 'emitted' as const }));
    const unmounted = vi.fn();
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup(props) {
        onUnmounted(unmounted);
        return () => h('button', {
          'data-testid': 'interactive-probe',
          onClick: () => props.emitEditIntent(props.view, {
            intent: {
              kind: 'interaction',
              proposal: {
                type: 'xnl.rich-document.edit',
                target: { planNodeId: 'xnlp:node:document' },
                payload: { action: 'activate' },
              },
            },
          }, {}),
        }, 'Activate');
      },
    });
    const { runtime, hostInput, documentInstances } = createRuntime({ CounterCardProbe: Probe });
    const result = createXnlRichDocumentHalfcodeNodeViewHost(
      { ...runtime, editIntentPort: emitted } as never,
      hostInput,
      EMPTY,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { editor, target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    editor.commands.setNodeSelection(0);
    const before = editor.state.selection.toJSON();
    const button = target.querySelector<HTMLButtonElement>('[data-testid="interactive-probe"]')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    }));
    button.click();
    await nextTick();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(editor.state.selection.toJSON()).toEqual(before);

    expect(editor.isActive('componentEmbed')).toBe(true);
    editor.commands.deleteSelection();
    await nextTick();
    expect(editor.state.doc.firstChild?.type.name).not.toBe('componentEmbed');
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(documentInstances.list()).toEqual([]);
  });

  it('reports an invalid Presenter facet and never mounts the embedded implementation', async () => {
    const mounted = vi.fn();
    const Probe = defineComponent({ setup: () => { mounted(); return () => h('output'); } });
    const { runtime, documentInstances, hostInput } = createRuntime({ CounterCardProbe: Probe });
    const invalidRuntime = { ...runtime, presenterFacet: Object.freeze({ view: { title: 'forged' } }) };
    const invalid = createXnlRichDocumentHalfcodeNodeViewHost(
      invalidRuntime as never,
      hostInput,
      EMPTY,
    );
    expect(invalid.status).toBe('ready');
    if (invalid.status !== 'ready') return;
    await mountEditor(invalid.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    expect(mounted).not.toHaveBeenCalled();
    expect(documentInstances.list()).toEqual([]);
    expect(invalid.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_HALFCODE_NODEVIEW_FACET' }),
    ]));
  });

  it('cleans registration and reports a Vue mount failure without raw fallback', async () => {
    const Throwing = defineComponent({
      name: 'ThrowingNodeViewProbe',
      setup() {
        throw new Error('mount exploded');
      },
      render: () => null,
    });
    const { result, documentInstances } = createRuntime({ CounterCardProbe: Throwing });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    await nextTick();
    expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_NODEVIEW_VUE_MOUNT_FAILED', message: expect.stringContaining('mount exploded') }),
    ]));
    expect(documentInstances.list()).toEqual([]);
  });

  it('resolves a class/inheritance/mixin host runtime without widening embedded input', async () => {
    const visibleKeys: string[][] = [];
    const Probe = defineComponent({
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup(props) {
        visibleKeys.push(Object.keys(props).sort());
        return () => h('output', { 'data-testid': 'prototype-runtime-probe' },
          String((props.view as PresenterView).title));
      },
    });
    const seed = createRuntime({ CounterCardProbe: Probe });
    const registryMixin = Object.create(Object.prototype, {
      canonicalRegistry: {
        value: seed.runtime.canonicalRegistry,
        enumerable: true,
        configurable: true,
        writable: true,
      },
    });
    class RuntimeBase {
      readonly documentInstances = seed.runtime.documentInstances;
      readonly halfcodeRuntime = seed.runtime.halfcodeRuntime;
      readonly presenterFacet = seed.runtime.presenterFacet;
    }
    Object.setPrototypeOf(RuntimeBase.prototype, registryMixin);
    class MixedRuntime extends RuntimeBase {
      editIntentPort() {
        return { status: 'emitted' as const };
      }
    }
    const result = createXnlRichDocumentHalfcodeNodeViewHost(
      new MixedRuntime() as never,
      seed.hostInput,
      EMPTY,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { target } = await mountEditor(result.extensions, {
      type: 'doc', attrs: { nodeId: 'document.fixture' }, content: [node('componentEmbed', COMPONENT_REF, {})],
    });
    expect(target.querySelector('[data-testid="prototype-runtime-probe"]')?.textContent)
      .toBe('Trusted title');
    expect(visibleKeys).toEqual([['emitEditIntent', 'instanceRef', 'snapshot', 'view']]);
  });

  it('rejects cyclic and over-depth runtime prototype chains', () => {
    let first: object;
    let second: object;
    first = new Proxy({}, { getPrototypeOf: () => second });
    second = new Proxy({}, { getPrototypeOf: () => first });
    expect(createXnlRichDocumentHalfcodeNodeViewHost(first as never, {
      targets: [], occurrences: [],
    }, EMPTY).status).toBe('rejected');

    let deep: object = Object.create(null);
    Object.defineProperty(deep, 'documentInstances', {
      value: createDocumentInstanceRegistry(),
      enumerable: true,
    });
    for (let index = 0; index < 34; index += 1) deep = Object.create(deep);
    expect(createXnlRichDocumentHalfcodeNodeViewHost(deep as never, {
      targets: [], occurrences: [],
    }, EMPTY).status).toBe('rejected');
  });

  it('rejects deep accessor, symbol, function and cyclic target-plan data without executing code', () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('target plan getter must not run');
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cases: unknown[] = [
      accessor,
      { [Symbol('secret')]: 'hidden' },
      { handler: () => undefined },
      cyclic,
    ];
    const seed = createRuntime({});
    for (const invalid of cases) {
      const plan = componentPlan('InvalidPlan', 'CounterCardProbe');
      const root = plan.root[0]!;
      const result = createXnlRichDocumentHalfcodeNodeViewHost(
        seed.runtime,
        {
          targets: [{
            kind: 'component-embed',
            ref: COMPONENT_REF,
            presenterIdentity: 'CounterCardProbe',
            plan: {
              ...plan,
              root: [{ ...root, inlineProps: { invalid } }],
            },
          }],
          occurrences: seed.hostInput.occurrences,
        } as never,
        EMPTY,
      );
      expect(result.status).toBe('rejected');
    }
    expect(reads).toBe(0);
  });

  it('rejects unsafe occurrence metadata before registry code can inspect it', () => {
    let reads = 0;
    const metadata = Object.defineProperty({}, 'nested', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('descriptor getter must not run');
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const seed = createRuntime({});
    for (const invalid of [
      metadata,
      { [Symbol('secret')]: 'hidden' },
      { handler: () => undefined },
      cyclic,
    ]) {
      const result = createXnlRichDocumentHalfcodeNodeViewHost(
        seed.runtime,
        {
          targets: seed.hostInput.targets,
          occurrences: [{
            nodeId: 'component.counter-card',
            instanceRef: INSTANCE_REF,
            descriptor: { ...DESCRIPTOR, metadata: invalid },
          }],
        } as never,
        EMPTY,
      );
      expect(result.status).toBe('rejected');
    }
    expect(reads).toBe(0);
    expect(seed.documentInstances.list()).toEqual([]);
  });

  it('rejects unsafe embed snapshots before the embedded Presenter mounts or runs', async () => {
    const mounted = vi.fn();
    const Probe = defineComponent({
      setup() {
        mounted();
        return () => h('output');
      },
    });
    let reads = 0;
    const accessor = Object.defineProperty({}, 'nested', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('snapshot getter must not run');
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const invalid of [
      accessor,
      { [Symbol('secret')]: 'hidden' },
      { handler: () => undefined },
      cyclic,
    ]) {
      const { result, documentInstances } = createRuntime({ CounterCardProbe: Probe });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') continue;
      await mountEditor(result.extensions, {
        type: 'doc',
        attrs: { nodeId: 'document.fixture' },
        content: [node('componentEmbed', COMPONENT_REF, { invalid } as never)],
      });
      expect(result.readDiagnostics()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_HALFCODE_NODEVIEW_INPUT' }),
      ]));
      expect(documentInstances.list()).toEqual([]);
    }
    expect(mounted).not.toHaveBeenCalled();
    expect(reads).toBe(0);
  });

  it('fails closed for accessor and revoked host capabilities without invoking getters', () => {
    let reads = 0;
    const accessorRuntime = Object.defineProperty({}, 'documentInstances', {
      get() { reads += 1; return createDocumentInstanceRegistry(); },
    });
    expect(createXnlRichDocumentHalfcodeNodeViewHost(accessorRuntime as never, {
      targets: [], occurrences: [],
    }, EMPTY).status).toBe('rejected');
    expect(reads).toBe(0);

    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => createXnlRichDocumentHalfcodeNodeViewHost(
      revoked.proxy as never,
      { targets: [], occurrences: [] },
      EMPTY,
    )).not.toThrow();
    expect(createXnlRichDocumentHalfcodeNodeViewHost(
      revoked.proxy as never,
      { targets: [], occurrences: [] },
      EMPTY,
    ).status).toBe('rejected');
  });
});
