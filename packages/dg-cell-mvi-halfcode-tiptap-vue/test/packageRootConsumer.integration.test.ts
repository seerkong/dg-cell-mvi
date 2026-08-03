// @vitest-environment jsdom

import { Editor, type JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import {
  defineComponent,
  h,
  nextTick,
  onUnmounted,
  type Component,
} from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CapsuleNodePlan,
  HalfcodeRef,
  UnitFqn,
  UnitRenderPlan,
  XnlProjectionPresenterRuntimeFacet,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createDocumentInstanceRegistry,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type HalfcodeAppRuntime,
} from 'dg-cell-mvi-halfcode-support';
import type { CanonicalComponentRegistry } from 'dg-cell-mvi-halfcode-vue';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
  createXnlRichDocumentTiptapBrowserHost,
  normalizeTiptapTransaction,
  type XnlRichDocumentHalfcodeNodeViewHostRuntime,
  type XnlRichDocumentMermaidDiagnostic,
  type XnlRichDocumentMermaidNodeViewRuntime,
  type XnlRichDocumentMermaidRenderEffect,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const COMPONENT_REF = 'component://dg.docs.ConsumerComponent';
const CAPSULE_REF = 'capsule://dg.docs.ConsumerCapsule';
const CONFIG = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  planNodeId: 'xnlp:node:document.package-root-consumer',
} as const;

interface PresenterView {
  readonly title: string;
}

interface HostRuntime extends XnlRichDocumentHalfcodeNodeViewHostRuntime<PresenterView, HostRuntime> {
  readonly title: string;
}

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function presenterFacet(host: Readonly<{ title: string }>): XnlProjectionPresenterRuntimeFacet<PresenterView> {
  const grant = createXnlProjectionPresenterSnapshotGrant<
    Readonly<{ title: string }>,
    PresenterView,
    'title',
    'title'
  >(EMPTY, { id: 'consumer.title', sourceKey: 'title', facadeKey: 'title' }, EMPTY);
  const protocol = createXnlProjectionPresenterCapabilityProtocol<
    Readonly<{ title: string }>,
    PresenterView
  >(EMPTY, { id: 'consumer.presenter', grants: [grant] }, EMPTY);
  return createXnlProjectionPresenterRuntimeFacet({ source: host, protocol }, EMPTY, EMPTY);
}

function probeNode(id: string, componentIdentity: string) {
  return {
    id,
    kind: 'atom' as const,
    tag: componentIdentity,
    propsBinding: 'config://#consumer-input' as HalfcodeRef,
  };
}

function componentPlan(componentIdentity: string): UnitRenderPlan {
  return {
    id: 'ConsumerComponent',
    unitFqn: 'dg.docs.ConsumerComponent' as UnitFqn,
    unitKind: 'component',
    root: [probeNode('ConsumerComponent.root', componentIdentity)],
  };
}

function capsulePlan(componentIdentity: string): UnitRenderPlan {
  const capsule: CapsuleNodePlan = {
    id: 'ConsumerCapsule.capsule',
    kind: 'capsule',
    children: [probeNode('ConsumerCapsule.probe', componentIdentity)],
  };
  return {
    id: 'ConsumerCapsule.owner',
    unitFqn: 'dg.docs.ConsumerCapsuleOwner' as UnitFqn,
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
    resolveConfig: () => ({}),
    dispatchCommand: async () => ({ diagnostics: [] }),
    dispose: vi.fn(),
  };
}

function occurrence(nodeId: string) {
  const result = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
    nodeId: nodeId as XnlRichDocumentDomainNodeId,
    unitInstanceId: 'document-consumer',
    role: 'main',
    roleCardinality: 'single',
    descriptor: { scopeId: 'document-root' },
  }, EMPTY);
  if (result.status !== 'assembled') throw new Error(result.diagnostics[0].message);
  return result.occurrence;
}

function embedNode(
  type: 'componentEmbed' | 'capsuleEmbed',
  nodeId: string,
  ref: string,
  count: number,
): JSONContent {
  return { type, attrs: { nodeId, ref, version: null, input: { count } } };
}

function tableNode(): JSONContent {
  return {
    type: 'table',
    attrs: { nodeId: 'table.consumer' },
    content: [{
      type: 'tableRow',
      attrs: { nodeId: 'table-row.consumer' },
      content: [{
        type: 'tableCell',
        attrs: {
          nodeId: 'table-cell.consumer',
          colspan: 1,
          rowspan: 1,
          colwidth: null,
          align: null,
        },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'paragraph.consumer' },
          content: [{ type: 'text', text: 'cell' }],
        }],
      }],
    }],
  };
}

function positionOf(editor: Editor, nodeId: string): number {
  let found = -1;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs.nodeId === nodeId) found = position;
  });
  if (found < 0) throw new Error(`Missing node ${nodeId}.`);
  return found;
}

async function flush() {
  await nextTick();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('T4.3 package-root consumer verification', () => {
  it('composes table, Mermaid, Component and Capsule in one real Editor without a second writer', async () => {
    const componentUnmounted = vi.fn();
    const capsuleUnmounted = vi.fn();
    const componentUpdates: number[] = [];
    const capsuleUpdates: number[] = [];
    const component = probeComponent('component', componentUpdates, componentUnmounted);
    const capsule = probeComponent('capsule', capsuleUpdates, capsuleUnmounted);
    const targets = [
      {
        kind: 'component-embed' as const,
        ref: COMPONENT_REF,
        presenterIdentity: 'ConsumerComponentProbe',
        plan: componentPlan('ConsumerComponentProbe'),
      },
      {
        kind: 'capsule-embed' as const,
        ref: CAPSULE_REF,
        presenterIdentity: 'ConsumerCapsuleProbe',
        plan: capsulePlan('ConsumerCapsuleProbe'),
      },
    ];
    const canonicalRegistry: CanonicalComponentRegistry = {
      resolve(identity) {
        if (identity === 'ConsumerComponentProbe') return component;
        if (identity === 'ConsumerCapsuleProbe') return capsule;
        return undefined;
      },
    };
    const documentInstances = createDocumentInstanceRegistry();
    const editIntentPort = vi.fn(() => ({ status: 'emitted' as const }));
    const halfcodeRuntime: HostRuntime = {
      title: 'Package root consumer',
      presenterFacet: presenterFacet({ title: 'Package root consumer' }),
      editIntentPort,
      documentInstances,
      halfcodeRuntime: appRuntime(targets.map((target) => target.plan)),
      canonicalRegistry,
    };
    const renderCalls: string[] = [];
    const renderedSources: string[] = [];
    const diagnostics: XnlRichDocumentMermaidDiagnostic[] = [];
    const renderEffect: XnlRichDocumentMermaidRenderEffect<object> = async (_runtime, input) => {
      renderCalls.push(input.source);
      if (input.source === 'reject') {
        return {
          status: 'rejected',
          requestId: input.requestId,
          diagnostics: [{
            severity: 'error',
            code: 'MERMAID_RENDER_REJECTED',
            message: 'consumer rejection',
            requestId: input.requestId,
          }],
        };
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-source', input.source);
      renderedSources.push(input.source);
      return { status: 'rendered', requestId: input.requestId, svg };
    };
    const mermaidRuntime: XnlRichDocumentMermaidNodeViewRuntime<object, object> = {
      renderer: { runtime: Object.freeze({}), effect: renderEffect },
      diagnostics: {
        runtime: Object.freeze({}),
        effect: (_runtime, input) => { diagnostics.push(input.diagnostic); },
      },
    };
    const browserRuntime = Object.freeze({ halfcode: halfcodeRuntime, mermaid: mermaidRuntime });
    const browserHost = createXnlRichDocumentTiptapBrowserHost(
      browserRuntime,
      {
        targets,
        occurrences: [occurrence('component.consumer'), occurrence('capsule.consumer')],
      },
      { theme: 'default' },
    );
    expect(browserHost.status).toBe('ready');
    if (browserHost.status !== 'ready') throw new Error(browserHost.diagnostics[0].message);

    const extensions = browserHost.extensions;
    const target = document.body.appendChild(document.createElement('div'));
    const transactions: Transaction[] = [];
    const editor = new Editor({
      element: target,
      extensions,
      content: {
        type: 'doc',
        attrs: { nodeId: 'document.package-root-consumer' },
        content: [
          tableNode(),
          { type: 'mermaid', attrs: { nodeId: 'mermaid.consumer', source: 'graph TD; A-->B' } },
          embedNode('componentEmbed', 'component.consumer', COMPONENT_REF, 1),
          embedNode('capsuleEmbed', 'capsule.consumer', CAPSULE_REF, 1),
        ],
      },
      onTransaction: ({ transaction }) => { transactions.push(transaction); },
    });
    editors.push(editor);
    await flush();

    const duplicateExtensionNames = extensions
      .map((extension) => extension.name)
      .filter((name, index, names) => names.indexOf(name) !== index);
    expect(duplicateExtensionNames).toEqual([]);
    expect(Object.keys(editor.extensionManager.nodeViews)).toEqual(expect.arrayContaining([
      'table',
      'mermaid',
      'componentEmbed',
      'capsuleEmbed',
    ]));
    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })).toBe(true);
    expect(target.querySelector('.tableWrapper table')).toBeInstanceOf(HTMLTableElement);
    expect(target.querySelector('[data-mermaid-render-container] svg')?.getAttribute('data-source'))
      .toBe('graph TD; A-->B');
    expect(target.querySelector('[data-testid="component-consumer"]')?.textContent)
      .toBe('Package root consumer:1');
    expect(target.querySelector('[data-testid="capsule-consumer"]')?.textContent)
      .toBe('Package root consumer:1');

    updateNodeInput(editor, 'component.consumer', 2);
    updateNodeInput(editor, 'capsule.consumer', 2);
    updateMermaidSource(editor, 'graph TD; B-->C');
    await flush();
    expect(componentUpdates).toContain(2);
    expect(capsuleUpdates).toContain(2);
    expect(renderedSources).toContain('graph TD; B-->C');

    updateMermaidSource(editor, 'reject');
    await flush();
    expect(renderCalls).toContain('reject');
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'MERMAID_RENDER_REJECTED' }),
    ]);

    const interactions = transactions
      .filter((transaction) => transaction.docChanged)
      .map((transaction) => normalizeTiptapTransaction(EMPTY, { transaction }, CONFIG))
      .filter((result) => result.status === 'normalized');
    expect(interactions.length).toBeGreaterThan(0);
    for (const interaction of interactions) {
      expect(interaction).not.toHaveProperty('revision');
      expect(interaction).not.toHaveProperty('writer');
      expect(JSON.stringify(interaction)).not.toMatch(/authoring|vfs|writer/i);
    }
    expect(Reflect.ownKeys(mermaidRuntime)).toEqual(['renderer', 'diagnostics']);
    expect(Reflect.ownKeys(browserRuntime)).toEqual(['halfcode', 'mermaid']);
    expect(halfcodeRuntime).not.toHaveProperty('authoring');
    expect(halfcodeRuntime).not.toHaveProperty('vfs');
    expect(halfcodeRuntime).not.toHaveProperty('writer');

    browserHost.dispose();
    browserHost.dispose();
    await nextTick();
    expect(componentUnmounted).toHaveBeenCalledTimes(1);
    expect(capsuleUnmounted).toHaveBeenCalledTimes(1);
    expect(documentInstances.list()).toEqual([]);
    expect(editIntentPort).not.toHaveBeenCalled();
    editor.destroy();
  });
});

function probeComponent(label: string, updates: number[], unmounted: () => void): Component {
  return defineComponent({
    props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
    setup(props) {
      onUnmounted(unmounted);
      return () => {
        const count = Number((props.snapshot as { input: { count: number } }).input.count);
        updates.push(count);
        return h('output', { 'data-testid': `${label}-consumer` }, (
          `${(props.view as PresenterView).title}:${count}`
        ));
      };
    },
  });
}

function updateNodeInput(editor: Editor, nodeId: string, count: number): void {
  const position = positionOf(editor, nodeId);
  const node = editor.state.doc.nodeAt(position);
  if (node === null) throw new Error(`Missing node ${nodeId}.`);
  editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    input: { count },
  }));
}

function updateMermaidSource(editor: Editor, source: string): void {
  const position = positionOf(editor, 'mermaid.consumer');
  const node = editor.state.doc.nodeAt(position);
  if (node === null) throw new Error('Missing Mermaid node.');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    source,
  }));
}
