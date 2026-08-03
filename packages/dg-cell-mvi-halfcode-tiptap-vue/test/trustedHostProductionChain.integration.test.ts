// @vitest-environment jsdom

import { Editor, Extension } from '@tiptap/core';
import { EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  XnlAuthoringLiveRevision,
  XnlAuthoringPersistedRevision,
  XnlAuthoringProposal,
  XnlAuthoringRuntime,
  XnlProjectionInteraction,
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditInteractionPayload,
  XnlRichDocumentIdentityAllocationRequest,
  XnlRichDocumentIdentityAllocationResult,
} from 'dg-cell-mvi-halfcode-contract';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import {
  adaptXnlNodeToRichDocument,
  bindXnlRichDocumentEditTranslator,
  createDocumentInstanceRegistry,
  createXnlAuthoringSessionFactory,
  createXnlCoreAuthoringMutationPort,
  createXnlProjectionRootInput,
  createXnlRichDocumentAuthoringDomainPort,
  createXnlRichDocumentProjectionDialect,
  createXnlRichDocumentTrustedAuthoringHost,
  materializeXnlRichDocument,
  materializeXnlRichDocumentSemanticCandidate,
  translateXnlRichDocumentEditInteraction,
  type HalfcodeAppRuntime,
  type XnlCoreAuthoringMutation,
  type XnlRichDocumentInteractionEditIntent,
  type XnlRichDocumentReplaceDocumentCommand,
} from 'dg-cell-mvi-halfcode-support';
import {
  applyXnlRichDocumentTiptapDraftTransaction,
  bindXnlRichDocumentTiptapDraftToEditorState,
  createXnlRichDocumentTiptapBrowserHost,
  createXnlRichDocumentTiptapSchema,
  normalizeTiptapTransaction,
  parseTiptapDocument,
  projectTiptapDocument,
  reprojectXnlRichDocumentTiptapAccepted,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentMermaidNodeViewRuntime,
  type XnlRichDocumentTiptapDraftResult,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const TIPTAP_CONFIG = Object.freeze({
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
});
const EMPTY_BROWSER_INPUT = Object.freeze({ targets: [], occurrences: [] });
const BROWSER_CONFIG = Object.freeze({ theme: 'default' as const });

type ConcreteDocument = Extract<
  ReturnType<typeof materializeXnlRichDocument>,
  { status: 'materialized' }
>['document'];

function createPersistence(initial: ConcreteDocument) {
  let snapshot = structuredClone(initial);
  let sequence = 0;
  let revision: XnlAuthoringPersistedRevision = {
    kind: 'xnl-authoring-persisted-revision',
    authorityId: 'authority:production-chain',
    value: 'vfs:0',
  };
  let failure: Readonly<{ code: string; message: string }> | undefined;
  const persistence: XnlAuthoringRuntime<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >['persistence'] = {
    read: async () => ({
      status: 'loaded',
      document: structuredClone(snapshot),
      persistedRevision: revision,
    }),
    persist: async (_runtime, input) => {
      if (failure !== undefined) {
        const currentFailure = failure;
        failure = undefined;
        return {
          status: 'failed',
          expectedPersistedRevision: input.expectedPersistedRevision,
          diagnostics: [{ severity: 'error', ...currentFailure }],
        };
      }
      const previousRevision = revision;
      revision = {
        kind: 'xnl-authoring-persisted-revision',
        authorityId: 'authority:production-chain',
        value: `vfs:${++sequence}`,
      };
      snapshot = structuredClone(input.document) as ConcreteDocument;
      return {
        status: 'applied',
        persistedRevision: revision,
        receipt: {
          kind: 'xnl-authoring-persistence-receipt',
          previousRevision,
          currentRevision: revision,
          persistedAt: '2026-08-02T00:00:00.000Z',
          durability: 'memory',
        },
      };
    },
  };
  return Object.freeze({
    persistence,
    read: () => Object.freeze({ snapshot: structuredClone(snapshot), revision }),
    failNextFlush: (code: string, message: string) => { failure = Object.freeze({ code, message }); },
  });
}

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function paragraph(id: string, text: string): XnlRichDocument['children'][number] {
  return {
    kind: 'paragraph',
    nodeId: nodeId(id),
    content: [{ kind: 'text', text }],
  };
}

function blockquote(id: string, childId: string, text: string): XnlRichDocument['children'][number] {
  return {
    kind: 'blockquote',
    nodeId: nodeId(id),
    children: [paragraph(childId, text)],
  };
}

function table(colspan = 1): XnlRichDocument['children'][number] {
  const cellSpan = colspan === 1 ? {} : { colspan, rowspan: 1 };
  return {
    kind: 'table',
    nodeId: nodeId('table.main'),
    children: [{
      kind: 'table-row',
      nodeId: nodeId('table-row.main'),
      children: [{
        kind: 'table-cell',
        nodeId: nodeId('table-cell.main'),
        ...cellSpan,
        children: [paragraph('paragraph.table', 'Cell')],
      }],
    }],
  };
}

function codeBlock(text: string): XnlRichDocument['children'][number] {
  return {
    kind: 'code-block',
    nodeId: nodeId('code.main'),
    language: 'ts',
    text,
  };
}

function mermaid(source: string): XnlRichDocument['children'][number] {
  return {
    kind: 'mermaid',
    nodeId: nodeId('mermaid.main'),
    source,
  };
}

function document(children: XnlRichDocument['children'] = [
  paragraph('paragraph.alpha', 'Alpha'),
  paragraph('paragraph.beta', 'Beta'),
]): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: nodeId('document.production-chain'),
    children,
  };
}

function concrete(value: XnlRichDocument): ConcreteDocument {
  const result = materializeXnlRichDocument(value);
  if (result.status !== 'materialized') throw new Error('RichDocument fixture did not materialize.');
  return result.document;
}

function rich(value: Readonly<ConcreteDocument>): XnlRichDocument {
  const result = adaptXnlNodeToRichDocument(value as ConcreteDocument);
  if (result.status !== 'normalized') throw new Error('Concrete XNL did not adapt to RichDocument.');
  return result.document;
}

function project(value: XnlRichDocument) {
  const result = projectTiptapDocument(EMPTY, { document: value }, TIPTAP_CONFIG);
  if (result.status !== 'projected') throw new Error('RichDocument did not project to Tiptap.');
  return result.document;
}

function parse(value: ReturnType<typeof project>): XnlRichDocument {
  const result = parseTiptapDocument(EMPTY, { document: value }, TIPTAP_CONFIG);
  if (result.status !== 'parsed') throw new Error('Tiptap document did not parse to RichDocument.');
  return result.document;
}

const editors: Editor[] = [];
const browserHostDisposers: Array<() => void> = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  for (const dispose of browserHostDisposers.splice(0)) dispose();
  globalThis.document?.body.replaceChildren();
});

function editorState(value: XnlRichDocument): EditorState {
  const schema = createXnlRichDocumentTiptapSchema();
  if (schema.status !== 'ready') throw new Error('Expected the canonical Tiptap schema.');
  return EditorState.create({
    schema: schema.schema,
    doc: schema.schema.nodeFromJSON(project(value)),
  });
}

function positionOf(value: ProseMirrorNode, id: string): number {
  let position = -1;
  value.descendants((node, current) => {
    if (position < 0 && node.attrs.nodeId === id) position = current;
  });
  if (position < 0) throw new Error(`Missing Tiptap node "${id}".`);
  return position;
}

function nodeAt(value: ProseMirrorNode, id: string): ProseMirrorNode {
  const node = value.nodeAt(positionOf(value, id));
  if (node === null) throw new Error(`Missing Tiptap node "${id}".`);
  return node;
}

function inlineText(value: XnlRichDocument, id: string): string {
  const found = value.children.find((node) => node.nodeId === nodeId(id));
  if (found === undefined || !('content' in found) || !Array.isArray(found.content)) {
    throw new Error(`Missing inline RichDocument node "${id}".`);
  }
  return found.content.map((run) => run.text).join('');
}

function normalize(
  transaction: EditorState['tr'],
  planNodeId: string,
): XnlRichDocumentInteractionEditIntent {
  const result = normalizeTiptapTransaction(EMPTY, { transaction }, {
    ...TIPTAP_CONFIG,
    planNodeId,
  });
  if (result.status !== 'normalized') throw new Error(`Transaction normalization returned ${result.status}.`);
  return result.intent;
}

function draftState(result: XnlRichDocumentTiptapDraftResult) {
  if (result.state === undefined) throw new Error(`Expected draft state for ${result.outcome.status}.`);
  return result.state;
}

function halfcodeRuntime() {
  const appRuntime: HalfcodeAppRuntime = {
    bundle: {} as never,
    plans: {
      renderPlans: [],
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
  return {
    presenterFacet: {} as never,
    editIntentPort: () => ({ status: 'emitted' as const }),
    documentInstances: createDocumentInstanceRegistry(),
    halfcodeRuntime: appRuntime,
  };
}

function mermaidRuntime(): XnlRichDocumentMermaidNodeViewRuntime<object, object> {
  return {
    renderer: {
      runtime: Object.freeze({}),
      effect: async (_runtime, input) => ({
        status: 'rendered',
        requestId: input.requestId,
        svg: globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      }),
    },
    diagnostics: {
      runtime: Object.freeze({}),
      effect: () => undefined,
    },
  };
}

interface LineageProbeState {
  readonly generation: number;
  readonly transactionCount: number;
}

let lineageProbeSequence = 0;

function createRealBrowserHostEditor(initial: XnlRichDocument) {
  const browserHost = createXnlRichDocumentTiptapBrowserHost(
    { halfcode: halfcodeRuntime(), mermaid: mermaidRuntime() },
    EMPTY_BROWSER_INPUT,
    BROWSER_CONFIG,
  );
  expect(browserHost.status).toBe('ready');
  if (browserHost.status !== 'ready') throw new Error(browserHost.diagnostics[0].message);
  browserHostDisposers.push(browserHost.dispose);

  const key = new PluginKey<LineageProbeState>(`t22BoundDraftLineage${++lineageProbeSequence}`);
  let generation = 0;
  const probe = Extension.create({
    name: `t22BoundDraftLineage${lineageProbeSequence}`,
    addProseMirrorPlugins() {
      return [
        new Plugin<LineageProbeState>({
          key,
          state: {
            init: () => ({ generation: ++generation, transactionCount: 0 }),
            apply: (_transaction, value) => ({
              generation: value.generation,
              transactionCount: value.transactionCount + 1,
            }),
          },
        }),
      ];
    },
  });
  const editor = new Editor({
    element: globalThis.document.body.appendChild(globalThis.document.createElement('div')),
    extensions: [...browserHost.extensions, probe],
    content: project(initial),
  });
  editors.push(editor);
  return { editor, key };
}

function liveObservation(harness: Harness): string {
  return harness.session.proposal.state().accepted.liveRevision.value;
}

interface HarnessOptions {
  readonly beforeTranslationReturn?: () => void | Promise<void>;
  readonly beforeMaterializationReturn?: () => void | Promise<void>;
  readonly beforeIdentityAllocationReturn?: () => void | Promise<void>;
}

interface Harness {
  readonly session: Awaited<ReturnType<ReturnType<typeof createXnlAuthoringSessionFactory<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >>['open']>>;
  readonly persistence: ReturnType<typeof createPersistence>;
  readonly planNodeId: string;
  readonly bridge: ReturnType<typeof createXnlRichDocumentTrustedAuthoringHost>;
  readonly translator: Mock;
  readonly materializer: Mock;
  readonly allocationRequests: XnlRichDocumentIdentityAllocationRequest[];
  readonly submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[];
}

async function openHarness(
  initial: XnlRichDocument = document(),
  options: HarnessOptions = {},
): Promise<Harness> {
  const initialConcrete = concrete(initial);
  const persistence = createPersistence(initialConcrete);
  const mutationPort = createXnlCoreAuthoringMutationPort<XnlRichDocumentReplaceDocumentCommand>();
  let liveSequence = 0;
  const runtime: XnlAuthoringRuntime<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  > = {
    domain: createXnlRichDocumentAuthoringDomainPort(),
    mutations: mutationPort,
    persistence: persistence.persistence as XnlAuthoringRuntime<
      ConcreteDocument,
      XnlRichDocumentReplaceDocumentCommand,
      XnlCoreAuthoringMutation
    >['persistence'],
    revision: {
      nextLiveRevision: (_owner, input): XnlAuthoringLiveRevision => ({
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session:production-chain',
        value: `live:${++liveSequence}:${input.current?.value ?? 'open'}`,
      }),
    },
    invalidation: { publish: () => undefined },
  };
  const session = await createXnlAuthoringSessionFactory<
    ConcreteDocument,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation
  >().open(runtime, { id: 'session:production-chain' }, {});
  const projectionRuntime = createXnlProjectionCompilerRuntime({
    dialects: [createXnlRichDocumentProjectionDialect()],
  });
  const plan = compileXnlProjection(
    projectionRuntime,
    createXnlProjectionRootInput(initialConcrete),
    { planId: 'production-chain' },
  );
  const translator = vi.fn(async (...args: Parameters<typeof translateXnlRichDocumentEditInteraction>) => {
    const result = translateXnlRichDocumentEditInteraction(...args);
    await options.beforeTranslationReturn?.();
    return result;
  });
  const materializer = vi.fn(async (...args: Parameters<typeof materializeXnlRichDocumentSemanticCandidate>) => {
    const result = await materializeXnlRichDocumentSemanticCandidate(...args);
    await options.beforeMaterializationReturn?.();
    return result;
  });
  const boundTranslator = bindXnlRichDocumentEditTranslator(
    { translateInteraction: translator },
    { planNode: plan.root },
    EMPTY,
  );
  const allocationRequests: XnlRichDocumentIdentityAllocationRequest[] = [];
  let allocationSequence = 0;
  const identityAllocator = async (
    _owner: unknown,
    request: XnlRichDocumentIdentityAllocationRequest,
  ): Promise<XnlRichDocumentIdentityAllocationResult> => {
    allocationRequests.push(request);
    const result = {
      status: 'allocated',
      requestId: request.requestId,
      nodeId: nodeId(`allocated.${request.reason}.id${++allocationSequence}`),
      freshness: 'fresh',
    } as const;
    await options.beforeIdentityAllocationReturn?.();
    return result;
  };
  const submitted: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand>[] = [];
  const bridge = createXnlRichDocumentTrustedAuthoringHost({
    proposal: {
      state: session.proposal.state,
      subscribe: session.proposal.subscribe,
      submit: async (proposal, config) => {
        submitted.push(proposal);
        return session.proposal.submit(proposal, config);
      },
    },
    translateInteraction: boundTranslator,
    materializeInteraction: materializer,
    identityAllocator,
  }, {
    source: { occurrenceId: 'document:production-chain', xId: 'document.production-chain' },
  }, {
    proposalIdPrefix: 'proposal:production-chain',
  });

  return {
    session,
    persistence,
    planNodeId: plan.root.id,
    bridge,
    translator,
    materializer,
    allocationRequests,
    submitted,
  };
}

async function submitConcurrent(
  harness: Harness,
  candidate: XnlRichDocument,
  id: string,
) {
  return harness.session.proposal.submit({
    kind: 'xnl-authoring-proposal',
    id,
    baseLiveRevision: harness.session.proposal.state().accepted.liveRevision,
    command: {
      kind: 'xnl-rich-document-replace-document',
      document: concrete(candidate),
    },
  }, {});
}

describe('trusted-host production public-root chain', () => {
  it('accepts consecutive canonical fixture edits from the latest accepted direct baseline', async () => {
    const initial = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE;
    const harness = await openHarness(initial);
    const firstState = editorState(initial);
    const introductionPosition = positionOf(firstState.doc, 'paragraph.introduction') + 1;
    const firstIntent = normalize(
      firstState.tr.insertText('Accepted ', introductionPosition),
      harness.planNodeId,
    );

    const first = await harness.bridge.emitEditIntent(firstIntent);

    expect(first).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.allocationRequests).toHaveLength(0);
    expect(harness.submitted).toHaveLength(1);
    const acceptedAfterFirst = rich(harness.session.proposal.state().accepted.document);
    expect(inlineText(acceptedAfterFirst, 'paragraph.introduction'))
      .toBe('Accepted Domain XNL remains authoritative.');
    expect(rich(harness.persistence.read().snapshot)).toEqual(acceptedAfterFirst);

    const secondState = editorState(acceptedAfterFirst);
    expect(parse(secondState.doc.toJSON() as ReturnType<typeof project>)).toEqual(acceptedAfterFirst);
    const secondTableCellPosition = positionOf(secondState.doc, 'tablecell.capability.value');
    const secondTableCell = nodeAt(secondState.doc, 'tablecell.capability.value');
    const secondIntent = normalize(
      secondState.tr.setNodeMarkup(
        secondTableCellPosition,
        undefined,
        { ...secondTableCell.attrs, colspan: 2 },
      ),
      harness.planNodeId,
    );
    expect(secondIntent.proposal).toMatchObject({
      type: 'xnl.rich-document.edit',
      payload: {
        edits: [expect.objectContaining({
          kind: 'table',
          nodeId: nodeId('table.capabilities'),
        })],
      },
    });
    expect(JSON.stringify(secondIntent)).not.toMatch(/revision|session|submit|allocator|writer|vfs|vcs|document\.replace/i);

    const second = await harness.bridge.emitEditIntent(secondIntent);

    expect(second, JSON.stringify(second)).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(2);
    expect(harness.materializer).toHaveBeenCalledTimes(2);
    expect(harness.submitted).toHaveLength(2);
    const acceptedAfterSecond = rich(harness.session.proposal.state().accepted.document);
    expect(JSON.stringify(acceptedAfterSecond)).toContain('"colspan":2');
    expect(rich(harness.persistence.read().snapshot)).toEqual(acceptedAfterSecond);
  });

  it.each([
    ['text-text', (state: EditorState) => {
      const alpha = positionOf(state.doc, 'paragraph.alpha');
      return state.tr.insertText('?', alpha + 1 + 'Alpha!'.length);
    }, [], (accepted: XnlRichDocument) => {
      expect(accepted.children[0]).toEqual(paragraph('paragraph.alpha', 'Alpha!?'));
      expect(accepted.children[1]).toEqual(paragraph('paragraph.beta', 'Beta'));
    }],
    ['text-mark', (state: EditorState) => {
      const alpha = positionOf(state.doc, 'paragraph.alpha');
      return state.tr.addMark(
        alpha + 1,
        alpha + 1 + 'Alpha!'.length,
        state.schema.marks.bold.create(),
      );
    }, [], (accepted: XnlRichDocument) => {
      expect(accepted.children[0]).toEqual({
        kind: 'paragraph',
        nodeId: nodeId('paragraph.alpha'),
        content: [{ kind: 'text', text: 'Alpha!', marks: [{ kind: 'bold' }] }],
      });
      expect(accepted.children[1]).toEqual(paragraph('paragraph.beta', 'Beta'));
    }],
    ['text-structural-insert', (state: EditorState) => state.tr.insert(
      positionOf(state.doc, 'paragraph.beta'),
      state.schema.nodes.paragraph.create(null, state.schema.text('Inserted after text')),
    ), ['new'], (accepted: XnlRichDocument) => {
      expect(accepted.children).toEqual([
        paragraph('paragraph.alpha', 'Alpha!'),
        paragraph('allocated.new.id1', 'Inserted after text'),
        paragraph('paragraph.beta', 'Beta'),
      ]);
    }],
  ] as const)('accepts consecutive %s edits from the latest accepted direct baseline', async (
    _label,
    secondTransactionFor,
    expectedAllocationReasons,
    assertAccepted,
  ) => {
    const initial = document();
    const harness = await openHarness(initial);
    const firstState = editorState(initial);
    const alpha = positionOf(firstState.doc, 'paragraph.alpha');
    const first = await harness.bridge.emitEditIntent(
      normalize(firstState.tr.insertText('!', alpha + 1 + 'Alpha'.length), harness.planNodeId),
    );
    expect(first).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });

    const acceptedAfterFirst = rich(harness.session.proposal.state().accepted.document);
    expect(acceptedAfterFirst).toEqual(document([
      paragraph('paragraph.alpha', 'Alpha!'),
      paragraph('paragraph.beta', 'Beta'),
    ]));
    const secondState = editorState(acceptedAfterFirst);
    expect(parse(secondState.doc.toJSON() as ReturnType<typeof project>)).toEqual(acceptedAfterFirst);

    const second = await harness.bridge.emitEditIntent(
      normalize(secondTransactionFor(secondState), harness.planNodeId),
    );

    expect(second).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(2);
    expect(harness.materializer).toHaveBeenCalledTimes(2);
    expect(harness.submitted).toHaveLength(2);
    expect(harness.allocationRequests.map((request) => request.reason))
      .toEqual(expectedAllocationReasons);
    const acceptedAfterSecond = rich(harness.session.proposal.state().accepted.document);
    assertAccepted(acceptedAfterSecond);
    expect(rich(harness.persistence.read().snapshot)).toEqual(acceptedAfterSecond);
    expect(parse(project(acceptedAfterSecond))).toEqual(acceptedAfterSecond);
  });

  it('publishes two real EditorState-bound transactions through accepted feedback and the production trusted host', async () => {
    const initial = document([
      paragraph('paragraph.alpha', 'Alpha'),
      table(),
    ]);
    const harness = await openHarness(initial);
    const { editor, key } = createRealBrowserHostEditor(initial);
    const emitted: XnlRichDocumentInteractionEditIntent[] = [];
    const draftRuntime = Object.freeze({
      emitInteraction: (
        _runtime: unknown,
        input: Readonly<{ intent: XnlRichDocumentInteractionEditIntent }>,
        _config: Readonly<Record<string, never>>,
      ) => {
        emitted.push(input.intent);
        return { status: 'emitted' as const };
      },
    });
    const config = { ...TIPTAP_CONFIG, planNodeId: harness.planNodeId };
    const bound = bindXnlRichDocumentTiptapDraftToEditorState(
      draftRuntime,
      { editorState: editor.state, acceptedObservation: liveObservation(harness) },
      config,
    );
    expect(bound.outcome).toMatchObject({
      status: 'ready',
      selection: 'preserved',
      localDraft: false,
    });
    const initialDraft = draftState(bound);
    expect(initialDraft.editorState).toBe(editor.state);
    expect(initialDraft.editorState.schema).toBe(editor.schema);
    expect(initialDraft.editorState.plugins).toBe(editor.state.plugins);

    const alpha = positionOf(initialDraft.editorState.doc, 'paragraph.alpha');
    const firstApplied = applyXnlRichDocumentTiptapDraftTransaction(
      draftRuntime,
      {
        state: initialDraft,
        transaction: initialDraft.editorState.tr.insertText('!', alpha + 1 + 'Alpha'.length),
      },
      config,
    );

    expect(firstApplied.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
    expect(emitted).toHaveLength(1);
    expect(JSON.stringify(emitted[0])).not.toMatch(
      /acceptedObservation|revision|session|submit|allocator|writer|valueHost|vfs|vcs|document\.replace/i,
    );
    const firstSubmit = await harness.bridge.emitEditIntent(emitted[0]!);

    expect(firstSubmit, JSON.stringify(firstSubmit)).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.submitted).toHaveLength(1);
    expect(harness.allocationRequests).toHaveLength(0);
    const acceptedAfterFirst = rich(harness.session.proposal.state().accepted.document);
    expect(acceptedAfterFirst).toEqual(document([
      paragraph('paragraph.alpha', 'Alpha!'),
      table(),
    ]));

    const firstDraft = draftState(firstApplied);
    const selectionAfterFirst = firstDraft.editorState.selection;
    const lineageAfterFirst = key.getState(firstDraft.editorState);
    const reprojected = reprojectXnlRichDocumentTiptapAccepted(
      {},
      {
        state: firstDraft,
        document: project(acceptedAfterFirst),
        acceptedObservation: liveObservation(harness),
      },
      { ...config, staleDraftPolicy: 'conflict' },
    );
    expect(reprojected.outcome).toMatchObject({
      status: 'reprojected',
      reason: 'accepted-local-draft',
      selection: 'preserved',
      localDraft: false,
      pendingAcceptance: false,
    });
    const acceptedDraft = draftState(reprojected);
    expect(acceptedDraft.editorState).toBe(firstDraft.editorState);
    expect(acceptedDraft.editorState.selection).toBe(selectionAfterFirst);
    expect(acceptedDraft.editorState.schema).toBe(editor.schema);
    expect(acceptedDraft.editorState.plugins).toBe(editor.state.plugins);
    expect(key.getState(acceptedDraft.editorState)).toBe(lineageAfterFirst);

    const selected = applyXnlRichDocumentTiptapDraftTransaction(
      draftRuntime,
      {
        state: acceptedDraft,
        transaction: acceptedDraft.editorState.tr.setSelection(
          TextSelection.create(acceptedDraft.editorState.doc, positionOf(acceptedDraft.editorState.doc, 'table-cell.main') + 2),
        ),
      },
      config,
    );
    expect(selected.outcome).toMatchObject({
      status: 'applied',
      publication: 'silent',
      reason: 'selection-only',
      localDraft: false,
      pendingAcceptance: false,
    });
    expect(emitted).toHaveLength(1);

    const selectedDraft = draftState(selected);
    const cellPosition = positionOf(selectedDraft.editorState.doc, 'table-cell.main');
    const cell = nodeAt(selectedDraft.editorState.doc, 'table-cell.main');
    const secondApplied = applyXnlRichDocumentTiptapDraftTransaction(
      draftRuntime,
      {
        state: selectedDraft,
        transaction: selectedDraft.editorState.tr.setNodeMarkup(
          cellPosition,
          undefined,
          { ...cell.attrs, colspan: 2 },
        ),
      },
      config,
    );

    expect(secondApplied.outcome).toMatchObject({
      status: 'applied',
      publication: 'published',
      localDraft: true,
      pendingAcceptance: true,
    });
    expect(emitted).toHaveLength(2);
    const secondPayload = emitted[1]!.proposal.payload as XnlRichDocumentEditInteractionPayload;
    expect(secondPayload.edits).toEqual([
      expect.objectContaining({ kind: 'table', nodeId: nodeId('table.main') }),
    ]);
    expect(JSON.stringify(emitted[1])).not.toMatch(
      /acceptedObservation|revision|session|submit|allocator|writer|valueHost|vfs|vcs|document\.replace/i,
    );
    const secondSubmit = await harness.bridge.emitEditIntent(emitted[1]!);

    expect(secondSubmit, JSON.stringify(secondSubmit)).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(2);
    expect(harness.materializer).toHaveBeenCalledTimes(2);
    expect(harness.submitted).toHaveLength(2);
    expect(harness.allocationRequests).toHaveLength(0);
    const acceptedAfterSecond = rich(harness.session.proposal.state().accepted.document);
    expect(acceptedAfterSecond).toEqual(document([
      paragraph('paragraph.alpha', 'Alpha!'),
      table(2),
    ]));
    expect(rich(harness.persistence.read().snapshot)).toEqual(acceptedAfterSecond);
    expect(parse(project(acceptedAfterSecond))).toEqual(acceptedAfterSecond);
    expect(editor.state.doc.textContent).toBe('AlphaCell');
  });

  it('captures the latest accepted baseline after translation and submits exactly-once work with that revision', async () => {
    let harness!: Harness;
    let concurrentResult: Awaited<ReturnType<typeof submitConcurrent>> | undefined;
    harness = await openHarness(document(), {
      beforeTranslationReturn: async () => {
        concurrentResult = await submitConcurrent(harness, document([
          paragraph('paragraph.alpha', 'Alpha'),
          paragraph('paragraph.beta', 'Beta concurrently accepted'),
        ]), 'proposal:concurrent-before-materialization');
      },
    });
    const state = editorState(document());
    const alpha = positionOf(state.doc, 'paragraph.alpha');
    const intent = normalize(state.tr.insertText('!', alpha + 1 + 'Alpha'.length), harness.planNodeId);
    const before = harness.session.proposal.state();

    const result = await harness.bridge.emitEditIntent(intent);

    expect(concurrentResult).toMatchObject({ status: 'accepted', persistence: { status: 'applied' } });
    expect(result).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.submitted).toHaveLength(1);
    if (concurrentResult?.status !== 'accepted') throw new Error('Expected concurrent acceptance.');
    expect(harness.submitted[0]?.baseLiveRevision).toEqual(concurrentResult.accepted.liveRevision);
    expect(harness.submitted[0]?.baseLiveRevision).not.toEqual(before.accepted.liveRevision);
    const accepted = rich(harness.session.proposal.state().accepted.document);
    expect(accepted).toEqual(document([
      paragraph('paragraph.alpha', 'Alpha!'),
      paragraph('paragraph.beta', 'Beta concurrently accepted'),
    ]));
    expect(parse(project(accepted))).toEqual(accepted);
    expect(JSON.stringify(intent)).not.toMatch(/revision|session|submit|allocator|writer|vfs|vcs/i);
  });

  it('rejects a revision change during materialization without submitting', async () => {
    let releaseMaterializer!: () => void;
    const gate = new Promise<void>((resolve) => { releaseMaterializer = resolve; });
    const harness = await openHarness(document(), { beforeMaterializationReturn: () => gate });
    const state = editorState(document());
    const alpha = positionOf(state.doc, 'paragraph.alpha');
    const pending = harness.bridge.emitEditIntent(
      normalize(state.tr.insertText('!', alpha + 1 + 'Alpha'.length), harness.planNodeId),
    );
    await vi.waitFor(() => expect(harness.materializer).toHaveBeenCalledTimes(1));

    const concurrent = await submitConcurrent(harness, document([
      paragraph('paragraph.alpha', 'Alpha'),
      paragraph('paragraph.beta', 'Concurrent'),
    ]), 'proposal:concurrent-during-materialization');
    releaseMaterializer();
    const result = await pending;

    expect(concurrent).toMatchObject({ status: 'accepted' });
    expect(result).toMatchObject({ status: 'rejected', stage: 'concurrent-change' });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.submitted).toHaveLength(0);
  });

  it('rejects a revision change during identity allocation without submitting', async () => {
    let releaseAllocator!: () => void;
    const gate = new Promise<void>((resolve) => { releaseAllocator = resolve; });
    const harness = await openHarness(document(), { beforeIdentityAllocationReturn: () => gate });
    const state = editorState(document());
    const pending = harness.bridge.emitEditIntent(normalize(
      state.tr.insert(
        positionOf(state.doc, 'paragraph.beta'),
        state.schema.nodes.paragraph.create(null, state.schema.text('Inserted')),
      ),
      harness.planNodeId,
    ));
    await vi.waitFor(() => expect(harness.allocationRequests).toHaveLength(1));

    const concurrent = await submitConcurrent(harness, document([
      paragraph('paragraph.alpha', 'Alpha'),
      paragraph('paragraph.beta', 'Concurrent'),
    ]), 'proposal:concurrent-during-allocation');
    releaseAllocator();
    const result = await pending;

    expect(concurrent).toMatchObject({ status: 'accepted' });
    expect(result).toMatchObject({ status: 'rejected', stage: 'concurrent-change' });
    expect(harness.translator).toHaveBeenCalledTimes(1);
    expect(harness.materializer).toHaveBeenCalledTimes(1);
    expect(harness.submitted).toHaveLength(0);
  });

  it('satisfies accepted PutGet through the production chain for all eight canonical edit kinds', async () => {
    const cases: readonly Readonly<{
      kind: string;
      initial: XnlRichDocument;
      transactionFor: (state: EditorState) => EditorState['tr'];
      expectedAllocationReasons: readonly string[];
      assertAccepted: (accepted: XnlRichDocument) => void;
    }>[] = [{
      kind: 'insert',
      initial: document(),
      transactionFor: (state) => state.tr.insert(
        positionOf(state.doc, 'paragraph.beta'),
        state.schema.nodes.paragraph.create(null, state.schema.text('Inserted')),
      ),
      expectedAllocationReasons: ['new'],
      assertAccepted: (accepted) => {
        expect(accepted.children[1]).toEqual(paragraph('allocated.new.id1', 'Inserted'));
      },
    }, {
      kind: 'delete',
      initial: document(),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'paragraph.alpha');
        return state.tr.delete(position, position + nodeAt(state.doc, 'paragraph.alpha').nodeSize);
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children.map((child) => child.nodeId)).toEqual([nodeId('paragraph.beta')]);
      },
    }, {
      kind: 'move',
      initial: document(),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'paragraph.alpha');
        const alpha = nodeAt(state.doc, 'paragraph.alpha');
        const transaction = state.tr.delete(position, position + alpha.nodeSize);
        return transaction.insert(transaction.doc.content.size, alpha);
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children.map((child) => child.nodeId)).toEqual([
          nodeId('paragraph.beta'),
          nodeId('paragraph.alpha'),
        ]);
      },
    }, {
      kind: 'text',
      initial: document(),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'paragraph.alpha');
        return state.tr.insertText('!', position + 1 + 'Alpha'.length);
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children[0]).toEqual(paragraph('paragraph.alpha', 'Alpha!'));
      },
    }, {
      kind: 'mark',
      initial: document(),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'paragraph.alpha');
        return state.tr.addMark(
          position + 1,
          position + 1 + 'Alpha'.length,
          state.schema.marks.bold.create(),
        );
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children[0]).toEqual({
          kind: 'paragraph',
          nodeId: nodeId('paragraph.alpha'),
          content: [{ kind: 'text', text: 'Alpha', marks: [{ kind: 'bold' }] }],
        });
      },
    }, {
      kind: 'table',
      initial: document([table()]),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'table-cell.main');
        const cell = nodeAt(state.doc, 'table-cell.main');
        return state.tr.setNodeMarkup(position, undefined, { ...cell.attrs, colspan: 2 });
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children[0]).toEqual(table(2));
      },
    }, {
      kind: 'code',
      initial: document([codeBlock('const value = 1')]),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'code.main');
        return state.tr.insertText('0', position + 1 + 'const value = '.length);
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children[0]).toEqual(codeBlock('const value = 01'));
      },
    }, {
      kind: 'mermaid-source',
      initial: document([mermaid('graph TD; A-->B')]),
      transactionFor: (state) => {
        const position = positionOf(state.doc, 'mermaid.main');
        const diagram = nodeAt(state.doc, 'mermaid.main');
        return state.tr.setNodeMarkup(position, undefined, {
          ...diagram.attrs,
          source: 'graph LR; C-->D',
        });
      },
      expectedAllocationReasons: [],
      assertAccepted: (accepted) => {
        expect(accepted.children[0]).toEqual(mermaid('graph LR; C-->D'));
      },
    }];

    for (const fixture of cases) {
      const harness = await openHarness(fixture.initial);
      const state = editorState(fixture.initial);
      const intent = normalize(fixture.transactionFor(state), harness.planNodeId);

      expect(intent.proposal).toMatchObject({
        type: 'xnl.rich-document.edit',
        payload: { edits: [expect.objectContaining({ kind: fixture.kind })] },
      });
      const result = await harness.bridge.emitEditIntent(intent);

      expect(result, fixture.kind).toMatchObject({
        status: 'submitted',
        result: { status: 'accepted', persistence: { status: 'applied' } },
      });
      expect(harness.translator, fixture.kind).toHaveBeenCalledTimes(1);
      expect(harness.materializer, fixture.kind).toHaveBeenCalledTimes(1);
      expect(harness.submitted, fixture.kind).toHaveLength(1);
      expect(harness.allocationRequests.map((request) => request.reason), fixture.kind)
        .toEqual(fixture.expectedAllocationReasons);

      const accepted = rich(harness.session.proposal.state().accepted.document);
      fixture.assertAccepted(accepted);
      expect(rich(harness.persistence.read().snapshot), fixture.kind).toEqual(accepted);
      expect(parse(project(accepted)), fixture.kind).toEqual(accepted);
    }
  });

  it('hands every copied persistent subtree node to the allocator with exact source provenance', async () => {
    const initial = document([
      blockquote('blockquote.source', 'paragraph.source', 'Copied subtree'),
      paragraph('paragraph.beta', 'Beta'),
    ]);
    const harness = await openHarness(initial);
    const state = editorState(initial);
    const sourcePosition = positionOf(state.doc, 'blockquote.source');
    const intent = normalize(
      state.tr.insert(sourcePosition, nodeAt(state.doc, 'blockquote.source')),
      harness.planNodeId,
    );

    const result = await harness.bridge.emitEditIntent(intent);

    expect(result).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'applied' } },
    });
    expect(harness.allocationRequests).toHaveLength(2);
    expect(harness.allocationRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'copy', sourceNodeId: nodeId('blockquote.source') }),
      expect.objectContaining({ reason: 'copy', sourceNodeId: nodeId('paragraph.source') }),
    ]));
    const allocatedBySource = new Map(harness.allocationRequests.map((request, index) => [
      request.sourceNodeId,
      nodeId(`allocated.copy.id${index + 1}`),
    ]));
    const accepted = rich(harness.session.proposal.state().accepted.document);
    expect(accepted.children[0]).toMatchObject({
      kind: 'blockquote',
      nodeId: allocatedBySource.get(nodeId('blockquote.source')),
      children: [{
        nodeId: allocatedBySource.get(nodeId('paragraph.source')),
        content: [{ text: 'Copied subtree' }],
      }],
    });
    expect(accepted.children[1]).toEqual(initial.children[0]);
    expect(rich(harness.persistence.read().snapshot)).toEqual(accepted);
    expect(parse(project(accepted))).toEqual(accepted);
  });

  it.each([
    ['new', (state: EditorState) => state.tr.insert(
      positionOf(state.doc, 'paragraph.beta'),
      state.schema.nodes.paragraph.create(null, state.schema.text('Inserted')),
    ), [{ reason: 'new' }]],
    ['copy', (state: EditorState) => state.tr.insert(
      positionOf(state.doc, 'paragraph.alpha'),
      nodeAt(state.doc, 'paragraph.alpha'),
    ), [{ reason: 'copy', sourceNodeId: nodeId('paragraph.alpha') }]],
    ['move', (state: EditorState) => {
      const position = positionOf(state.doc, 'paragraph.alpha');
      const alpha = nodeAt(state.doc, 'paragraph.alpha');
      const transaction = state.tr.delete(position, position + alpha.nodeSize);
      return transaction.insert(transaction.doc.content.size, alpha);
    }, []],
    ['replacement', (state: EditorState) => {
      const position = positionOf(state.doc, 'paragraph.alpha');
      return state.tr.replaceWith(
        position,
        position + nodeAt(state.doc, 'paragraph.alpha').nodeSize,
        state.schema.nodes.paragraph.create(null, state.schema.text('Replacement')),
      );
    }, [{ reason: 'new' }]],
  ] as const)('allocates only the %s identities emitted by the real normalizer', async (
    _classification,
    transactionFor,
    expectedRequests,
  ) => {
    const harness = await openHarness();
    const state = editorState(document());
    const result = await harness.bridge.emitEditIntent(
      normalize(transactionFor(state), harness.planNodeId),
    );

    expect(result.status, JSON.stringify(result)).toBe('submitted');
    expect(harness.allocationRequests).toMatchObject(expectedRequests);
    expect(harness.allocationRequests).toHaveLength(expectedRequests.length);
    for (const request of harness.allocationRequests) {
      expect(request.reservedNodeIds).toEqual([...request.reservedNodeIds].sort());
      expect(request.reservedNodeIds).toEqual(expect.arrayContaining([
        nodeId('document.production-chain'),
        nodeId('paragraph.alpha'),
        nodeId('paragraph.beta'),
      ]));
    }
  });

  it('leaves accepted and persisted truth unchanged when canonical materialization rejects stale before facts', async () => {
    const harness = await openHarness();
    const staleState = editorState(document());
    const alpha = positionOf(staleState.doc, 'paragraph.alpha');
    const staleIntent = normalize(
      staleState.tr.insertText('!', alpha + 1 + 'Alpha'.length),
      harness.planNodeId,
    );
    await submitConcurrent(harness, document([
      paragraph('paragraph.alpha', 'Changed before submit'),
      paragraph('paragraph.beta', 'Beta'),
    ]), 'proposal:make-intent-stale');
    const before = harness.session.proposal.state();
    const persistedBefore = harness.persistence.read();

    const result = await harness.bridge.emitEditIntent(staleIntent);

    expect(result).toMatchObject({ status: 'rejected', stage: 'materialization' });
    expect(harness.submitted).toHaveLength(0);
    expect(harness.session.proposal.state().accepted).toEqual(before.accepted);
    expect(harness.persistence.read()).toEqual(persistedBefore);
  });

  it('preserves accepted-first dirty-failed semantics after persistence failure', async () => {
    const harness = await openHarness();
    const state = editorState(document());
    const alpha = positionOf(state.doc, 'paragraph.alpha');
    const intent = normalize(state.tr.insertText('!', alpha + 1 + 'Alpha'.length), harness.planNodeId);
    const before = harness.session.proposal.state();
    const persistedBefore = harness.persistence.read();
    harness.persistence.failNextFlush('TEST_FLUSH_FAILED', 'Expected persistence failure.');

    const result = await harness.bridge.emitEditIntent(intent);

    expect(result).toMatchObject({
      status: 'submitted',
      result: { status: 'accepted', persistence: { status: 'failed' } },
    });
    const dirty = harness.session.proposal.state();
    expect(dirty.status).toBe('dirty-failed');
    expect(dirty.accepted.liveRevision).not.toEqual(before.accepted.liveRevision);
    expect(rich(dirty.accepted.document)).toEqual(document([
      paragraph('paragraph.alpha', 'Alpha!'),
      paragraph('paragraph.beta', 'Beta'),
    ]));
    expect(dirty.persistedRevision).toEqual(before.persistedRevision);
    expect(harness.persistence.read()).toEqual(persistedBefore);

    const dirtyState = editorState(rich(dirty.accepted.document));
    const dirtyAlpha = positionOf(dirtyState.doc, 'paragraph.alpha');
    const blocked = await harness.bridge.emitEditIntent(normalize(
      dirtyState.tr.insertText('?', dirtyAlpha + 1 + 'Alpha!'.length),
      harness.planNodeId,
    ));
    expect(blocked).toMatchObject({
      status: 'submitted',
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'XNL_AUTHORING_SESSION_DIRTY' })],
      },
    });
    expect(harness.persistence.read()).toEqual(persistedBefore);
  });
});
