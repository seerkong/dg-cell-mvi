import { createApp, defineComponent, h, ref } from 'vue';
import {
  createDefaultDocumentEditorPresentationCompilerRuntime,
  DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
  DEFAULT_DOCUMENT_EDITOR_PRESENTERS,
  DEFAULT_DOCUMENT_EDITOR_TOOLS,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XnlDocumentEditor,
  type XnlDocumentEditorSession,
} from '../../src';

const id = (value: string) => value as XnlRichDocumentDomainNodeId;
const documentModel: XnlRichDocument = {
  kind: 'document',
  nodeId: id('browser.document'),
  children: [
    {
      kind: 'code-block',
      nodeId: id('browser.code'),
      language: 'typescript',
      text: 'const authority = "xnl";\nconst presenter = "tiptap";',
    },
    {
      kind: 'heading',
      nodeId: id('browser.heading'),
      level: 1,
      content: [{ kind: 'text', text: 'Programmable document' }],
    },
    {
      kind: 'paragraph',
      nodeId: id('browser.paragraph'),
      content: [{
        kind: 'text',
        text: 'Select this text to exercise the traditional document toolbar.',
      }],
    },
    {
      kind: 'task-list',
      nodeId: id('browser.tasks'),
      children: [{
        kind: 'task-item',
        nodeId: id('browser.task.first'),
        checked: false,
        children: [{
          kind: 'paragraph',
          nodeId: id('browser.task.paragraph'),
          content: [{ kind: 'text', text: 'Verify the editor in a real browser' }],
        }],
      }],
    },
    { kind: 'horizontal-rule', nodeId: id('browser.rule') },
  ],
};

const capabilities = {
  tools: DEFAULT_DOCUMENT_EDITOR_TOOLS.map((entry) => entry.id),
  presenters: DEFAULT_DOCUMENT_EDITOR_PRESENTERS.map((entry) => entry.id),
  conditions: [
    'editor.editable', 'editor.table-active', 'editor.code-active',
    'editor.link-active', 'editor.selection-active',
  ],
  grants: ['editor.table.write'],
};

const probe: {
  session?: XnlDocumentEditorSession;
  interactions: number;
  snapshots: number;
} = { interactions: 0, snapshots: 0 };

Object.assign(window, { __xnlDocumentEditorProbe: probe });

const runtime = {
  authoring: {
    emitInteraction: () => {
      probe.interactions += 1;
      return { status: 'emitted' as const };
    },
  },
  presentation: createDefaultDocumentEditorPresentationCompilerRuntime(),
  clipboard: {
    runtime: Object.freeze({}),
    effect: async (_runtime: object, input: { text: string }) => {
      await navigator.clipboard?.writeText(input.text);
      return { status: 'written' as const };
    },
  },
  highlighter: {
    runtime: Object.freeze({}),
    effect: (_runtime: object, input: { source: string }) => ({
      status: 'highlighted' as const,
      tokens: [...input.source.matchAll(/\bconst\b/g)].map((match) => ({
        from: match.index,
        to: match.index + 5,
        className: 'syntax-keyword',
      })),
    }),
  },
};

const App = defineComponent({
  setup() {
    const compact = ref(false);
    return () => h('main', { class: 'browser-demo' }, [
      h('header', { class: 'browser-demo__header' }, [
        h('strong', {}, 'XNL Document Editor'),
        h('div', { class: 'browser-demo__modes', role: 'group', 'aria-label': 'Editor width' }, [
          h('button', {
            type: 'button',
            class: compact.value ? '' : 'is-active',
            onClick: () => { compact.value = false; },
          }, 'Wide'),
          h('button', {
            type: 'button',
            class: compact.value ? 'is-active' : '',
            onClick: () => { compact.value = true; },
          }, 'Narrow'),
        ]),
      ]),
      h('div', {
        class: ['browser-demo__editor', compact.value ? 'is-compact' : ''],
        'data-mode': compact.value ? 'narrow' : 'wide',
      }, [h(XnlDocumentEditor, {
        runtime,
        input: {
          document: documentModel,
          acceptedObservation: 'browser:1',
          presentation: DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
          capabilities,
        },
        config: {
          planNodeId: 'xnlp:browser-document-editor',
          staleDraftPolicy: 'conflict',
          unknownToolPolicy: 'reject',
          codeTheme: 'paper',
        },
        onReady: (session: XnlDocumentEditorSession) => { probe.session = session; },
        onSnapshot: () => { probe.snapshots += 1; },
      })]),
    ]);
  },
});

createApp(App).mount('#app');

const style = document.createElement('style');
style.textContent = `
*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#182230}.browser-demo{min-height:100vh;padding:20px;font-family:system-ui,sans-serif}.browser-demo__header{display:flex;align-items:center;justify-content:space-between;max-width:1180px;margin:0 auto 12px}.browser-demo__modes{display:flex}.browser-demo__modes button{height:34px;padding:0 14px;border:1px solid #98a2b3;background:#fff}.browser-demo__modes button+button{border-left:0}.browser-demo__modes button.is-active{background:#1677ff;color:#fff}.browser-demo__editor{width:min(1180px,100%);height:calc(100vh - 90px);margin:0 auto;transition:width .15s ease}.browser-demo__editor.is-compact{width:min(360px,100%)}.browser-demo__editor>.xnl-document-editor{height:100%}
`;
document.head.appendChild(style);
