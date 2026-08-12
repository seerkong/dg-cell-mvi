import { EditorContent } from '@tiptap/vue-3';
import type {
  DocumentEditorToolbarGroupPlan,
  DocumentEditorToolbarToolPlan,
} from 'dg-cell-mvi-halfcode-contract';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code,
  Columns3,
  Copy,
  CornerDownLeft,
  Ellipsis,
  FoldVertical,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Palette,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  History,
  Rows3,
  SquareCode,
  Sparkles,
  Strikethrough,
  Table2,
  TableProperties,
  Underline,
  Undo2,
  Workflow,
} from 'lucide-vue-next';
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Component,
  type PropType,
  type VNode,
} from 'vue';
import {
  createXnlDocumentEditor,
  readXnlDocumentEditorInternalEditor,
} from './documentEditorSession';
import type {
  XnlDocumentEditorCommandInput,
  XnlDocumentEditorConfig,
  XnlDocumentEditorInput,
  XnlDocumentEditorRuntime,
  XnlDocumentEditorSession,
  XnlDocumentEditorSnapshot,
} from './documentEditorTypes';

const TOOL_WIDTH = 42;
const GROUP_GAP = 8;
const OVERFLOW_WIDTH = 48;

export const XnlDocumentEditor = defineComponent({
  name: 'XnlDocumentEditor',
  props: {
    runtime: {
      type: Object as PropType<XnlDocumentEditorRuntime>,
      required: true,
    },
    input: {
      type: Object as PropType<XnlDocumentEditorInput>,
      required: true,
    },
    config: {
      type: Object as PropType<XnlDocumentEditorConfig>,
      required: true,
    },
  },
  emits: ['ready', 'rejected', 'snapshot'],
  setup(props, { emit }) {
    const root = ref<HTMLElement>();
    const width = ref(0);
    const overflowOpen = ref(false);
    const session = shallowRef<XnlDocumentEditorSession>();
    const snapshot = shallowRef<XnlDocumentEditorSnapshot>();
    const diagnostics = shallowRef<XnlDocumentEditorSnapshot['diagnostics']>([]);
    let resizeObserver: ResizeObserver | undefined;
    let unsubscribe: (() => void) | undefined;

    const visibleGroups = computed(() => (snapshot.value?.toolbar.groups ?? [])
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => tool.visible),
      }))
      .filter((group) => group.tools.length > 0)
      .sort((left, right) => left.priority - right.priority));

    const groupSplit = computed(() => splitGroups(visibleGroups.value, width.value));

    onMounted(() => {
      const result = createXnlDocumentEditor(props.runtime, props.input, props.config);
      if (result.status === 'rejected') {
        diagnostics.value = result.diagnostics;
        emit('rejected', result.diagnostics);
        return;
      }
      session.value = result.session;
      unsubscribe = result.session.subscribe((nextSnapshot) => {
        snapshot.value = nextSnapshot;
        diagnostics.value = nextSnapshot.diagnostics;
        emit('snapshot', nextSnapshot);
      });
      emit('ready', result.session);
      if (root.value !== undefined && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
          width.value = entries[0]?.contentRect.width ?? root.value?.clientWidth ?? 0;
        });
        width.value = root.value.clientWidth;
        resizeObserver.observe(root.value);
      }
    });

    watch(() => props.input, (nextInput) => session.value?.update(nextInput));

    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      unsubscribe?.();
      session.value?.destroy();
    });

    const renderTool = (tool: DocumentEditorToolbarToolPlan, overflow = false): VNode => {
      const commandInput = defaultCommandInput(tool);
      const enabled = tool.enabled && (presenterCollectsInput(tool)
        || session.value?.commands.canExecute(commandInput) === true);
      const active = isActive(tool, snapshot.value);
      const classes = [
        'xnl-document-editor__tool',
        overflow ? 'xnl-document-editor__tool--overflow' : '',
        active ? 'is-active' : '',
      ];
      if (tool.presenter.id === 'toolbar.color') {
        return h('label', {
          class: classes,
          title: tool.label,
          'aria-label': tool.label,
          'data-tool-id': tool.id,
          'data-command-id': tool.commandId,
        }, [
          renderToolIcon(tool),
          h('input', {
            type: 'color',
            disabled: !tool.enabled,
            value: tool.id === 'inline.highlight' ? '#fff59d' : '#1f2937',
            onInput: (event: Event) => execute(tool, {
              color: (event.target as HTMLInputElement).value,
            }),
          }),
        ]);
      }
      if (tool.presenter.id === 'toolbar.select') {
        const choices = selectChoices(tool);
        return h('label', {
          class: classes,
          title: tool.label,
          'data-tool-id': tool.id,
          'data-command-id': tool.commandId,
        }, [
          h('span', { class: 'xnl-document-editor__sr-only' }, tool.label),
          h(Braces, { size: 16, 'aria-hidden': 'true' }),
          h('select', {
            disabled: !tool.enabled,
            'aria-label': tool.label,
            onChange: (event: Event) => execute(tool, {
              language: (event.target as HTMLSelectElement).value,
            }),
          }, choices.map((choice) => h('option', { value: choice }, choice))),
        ]);
      }
      return h('button', {
        type: 'button',
        class: classes,
        title: tool.label,
        'aria-label': tool.label,
        'aria-pressed': active ? 'true' : undefined,
        'data-tool-id': tool.id,
        'data-command-id': tool.commandId,
        disabled: !enabled,
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: () => executeWithCollectedInput(tool),
      }, overflow
        ? [renderToolIcon(tool), h('span', { class: 'xnl-document-editor__tool-label' }, tool.label)]
        : renderToolIcon(tool));
    };

    const execute = async (
      tool: DocumentEditorToolbarToolPlan,
      options?: Record<string, string>,
    ) => {
      const outcome = await session.value?.commands.execute({
        commandId: tool.commandId,
        ...(options === undefined ? {} : { options }),
      });
      if (outcome?.status === 'rejected') {
        diagnostics.value = [{
          severity: 'error',
          code: 'DOCUMENT_EDITOR_COMMAND_REJECTED',
          message: outcome.reason,
          path: `$.toolbar.${tool.id}`,
        }];
      }
      overflowOpen.value = false;
    };

    const executeWithCollectedInput = async (tool: DocumentEditorToolbarToolPlan) => {
      if (tool.id === 'inline.link' && !isActive(tool, snapshot.value)) {
        const href = window.prompt('Link URL');
        if (href === null || href.trim().length === 0) return;
        await execute(tool, { href: href.trim() });
        return;
      }
      if (tool.id === 'insert.image') {
        const src = window.prompt('Image URL');
        if (src === null || src.trim().length === 0) return;
        await execute(tool, { src: src.trim() });
        return;
      }
      await execute(tool);
    };

    return () => h('section', {
      ref: root,
      class: 'xnl-document-editor',
      'data-testid': 'xnl-document-editor',
    }, [
      h('style', {}, DOCUMENT_EDITOR_STYLE),
      visibleGroups.value.length === 0 ? null : h('div', {
        class: 'xnl-document-editor__toolbar',
        role: 'toolbar',
        'aria-label': 'Document tools',
      }, [
        ...groupSplit.value.direct.map((group) => h('div', {
          class: 'xnl-document-editor__group',
          role: 'group',
          'aria-label': group.label ?? group.id,
          key: group.id,
        }, group.tools.map((tool) => renderTool(tool)))),
        groupSplit.value.overflow.length > 0
          ? h('div', { class: 'xnl-document-editor__overflow' }, [
              h('button', {
                type: 'button',
                class: 'xnl-document-editor__more',
                title: 'More tools',
                'aria-label': 'More tools',
                'aria-expanded': String(overflowOpen.value),
                onClick: () => { overflowOpen.value = !overflowOpen.value; },
              }, [h(Ellipsis, { size: 18, 'aria-hidden': 'true' })]),
              overflowOpen.value
                ? h('div', {
                    class: 'xnl-document-editor__overflow-menu',
                    role: 'group',
                    'aria-label': 'More document tools',
                  }, groupSplit.value.overflow.flatMap((group) => [
                    h('div', {
                      class: 'xnl-document-editor__overflow-label',
                      key: `${group.id}.label`,
                    }, group.label ?? group.id),
                    ...group.tools.map((tool) => renderTool(tool, true)),
                  ]))
                : null,
            ])
          : null,
      ]),
      diagnostics.value.length > 0
        ? h('ul', {
            class: 'xnl-document-editor__diagnostics',
            'aria-live': 'polite',
          }, diagnostics.value.map((entry) => h('li', { key: `${entry.code}:${entry.path}` }, entry.message)))
        : null,
      session.value === undefined
        ? h('div', { class: 'xnl-document-editor__loading' }, 'Preparing editor')
        : h(EditorContent, {
            editor: readXnlDocumentEditorInternalEditor(session.value)!,
            class: [
              'xnl-document-editor__surface',
              snapshot.value?.codeFolded ? 'has-folded-code' : '',
            ],
          }),
    ]);
  },
});

function splitGroups(
  groups: readonly DocumentEditorToolbarGroupPlan[],
  width: number,
): { direct: readonly DocumentEditorToolbarGroupPlan[]; overflow: readonly DocumentEditorToolbarGroupPlan[] } {
  if (width <= 0) return { direct: groups, overflow: [] };
  const available = Math.max(TOOL_WIDTH, width - OVERFLOW_WIDTH);
  let used = 0;
  let split = groups.length;
  for (let index = 0; index < groups.length; index += 1) {
    const groupWidth = groups[index]!.tools.length * TOOL_WIDTH + GROUP_GAP;
    if (used + groupWidth > available) {
      split = index;
      break;
    }
    used += groupWidth;
  }
  if (split === groups.length) return { direct: groups, overflow: [] };
  return {
    direct: groups.slice(0, Math.max(1, split)),
    overflow: groups.slice(Math.max(1, split)),
  };
}

function defaultCommandInput(tool: DocumentEditorToolbarToolPlan): XnlDocumentEditorCommandInput {
  const options = tool.presenter.id === 'toolbar.color'
    ? { color: tool.id === 'inline.highlight' ? '#fff59d' : '#1f2937' }
    : tool.presenter.id === 'toolbar.select'
      ? { language: selectChoices(tool)[0] ?? 'plaintext' }
      : undefined;
  return {
    commandId: tool.commandId,
    ...(options === undefined ? {} : { options }),
  };
}

function presenterCollectsInput(tool: DocumentEditorToolbarToolPlan): boolean {
  return tool.presenter.id === 'toolbar.color'
    || tool.presenter.id === 'toolbar.select'
    || tool.id === 'inline.link'
    || tool.id === 'insert.image';
}

function selectChoices(tool: DocumentEditorToolbarToolPlan): readonly string[] {
  const configured = tool.options?.items;
  return Array.isArray(configured) && configured.every((entry) => typeof entry === 'string')
    ? configured
    : ['plaintext', 'typescript', 'javascript', 'json', 'css', 'html', 'shell'];
}

const TOOL_ICONS: Readonly<Record<string, Component>> = Object.freeze({
  'undo-2': Undo2,
  'redo-2': Redo2,
  pilcrow: Pilcrow,
  'heading-1': Heading1,
  'heading-2': Heading2,
  'heading-3': Heading3,
  quote: Quote,
  list: List,
  'list-ordered': ListOrdered,
  'list-checks': ListChecks,
  minus: Minus,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strikethrough: Strikethrough,
  code: Code,
  link: Link,
  palette: Palette,
  highlighter: Highlighter,
  'align-left': AlignLeft,
  'align-center': AlignCenter,
  'align-right': AlignRight,
  'align-justify': AlignJustify,
  'image-plus': ImagePlus,
  'table-2': Table2,
  'corner-down-left': CornerDownLeft,
  'square-code': SquareCode,
  workflow: Workflow,
  'rows-3': Rows3,
  'columns-3': Columns3,
  'table-properties': TableProperties,
  braces: Braces,
  'fold-vertical': FoldVertical,
  copy: Copy,
  plus: Plus,
  history: History,
  sparkles: Sparkles,
});

function renderToolIcon(tool: DocumentEditorToolbarToolPlan): VNode {
  const Icon = tool.icon === undefined ? SquareCode : TOOL_ICONS[tool.icon] ?? SquareCode;
  return h(Icon, { size: 17, strokeWidth: 1.8, 'aria-hidden': 'true' });
}

function isActive(
  tool: DocumentEditorToolbarToolPlan,
  snapshot: XnlDocumentEditorSnapshot | undefined,
): boolean {
  if (snapshot === undefined) return false;
  if (tool.id === 'code.fold') return snapshot.codeFolded;
  if (tool.id.startsWith('inline.')) {
    return snapshot.context.activeMarks.includes(tool.id.replace('inline.', '').replace('text-color', 'text-color'));
  }
  if (tool.id.startsWith('block.')) {
    return snapshot.context.activeNodeKinds.includes(tool.id.replace('block.', ''));
  }
  return false;
}

const DOCUMENT_EDITOR_STYLE = `
.xnl-document-editor{position:relative;display:grid;grid-template-rows:auto auto minmax(12rem,1fr);min-width:0;border:1px solid #d9dedb;border-radius:6px;background:#fff;color:#202522;font:14px/1.55 Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 1px 2px rgba(25,35,29,.04);container-type:inline-size}
.xnl-document-editor__toolbar{position:relative;z-index:10;display:flex;align-items:center;gap:6px;min-width:0;min-height:44px;padding:5px 8px;border-bottom:1px solid #e3e7e4;border-radius:6px 6px 0 0;background:rgba(250,251,250,.96);overflow:visible;backdrop-filter:blur(8px)}
.xnl-document-editor__group{display:flex;align-items:center;gap:2px;flex:0 0 auto;padding-right:6px;border-right:1px solid #e1e5e2}.xnl-document-editor__group:last-of-type{border-right:0}
.xnl-document-editor__tool,.xnl-document-editor__more{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:32px;height:32px;padding:0 7px;border:1px solid transparent;border-radius:5px;background:transparent;color:#525d56;cursor:pointer;white-space:nowrap;transition:background 120ms ease,color 120ms ease,border-color 120ms ease}
.xnl-document-editor__tool:hover:not(:disabled),.xnl-document-editor__more:hover,.xnl-document-editor__tool.is-active{border-color:#d7ddd9;background:#fff;color:#176847;box-shadow:0 1px 2px rgba(30,44,35,.06)}
.xnl-document-editor__tool.is-active{border-color:#b8d6c7;background:#eaf5ef;color:#155c40}
.xnl-document-editor__tool:focus-visible,.xnl-document-editor__more:focus-visible{outline:2px solid #26745a;outline-offset:1px}
.xnl-document-editor__tool:disabled{opacity:.34;cursor:not-allowed}
.xnl-document-editor__tool input[type=color]{position:absolute;width:1px;height:1px;opacity:0}
.xnl-document-editor__tool select{max-width:7.5rem;height:28px;border:0;background:transparent;color:inherit;font-size:12px;outline:0}.xnl-document-editor__tool:has(select){gap:4px;padding-right:3px}
.xnl-document-editor__overflow{position:relative;margin-left:auto;flex:0 0 auto}
.xnl-document-editor__overflow-menu{position:absolute;z-index:20;top:38px;right:0;display:grid;min-width:224px;max-height:60vh;padding:6px;border:1px solid #d8dedb;border-radius:6px;background:#fff;box-shadow:0 14px 34px rgba(24,36,29,.16);overflow:auto}
.xnl-document-editor__overflow-label{padding:9px 9px 4px;color:#7b857f;font-size:10px;font-weight:700;text-transform:uppercase}
.xnl-document-editor__tool--overflow{justify-content:flex-start;gap:10px;width:100%;padding:0 10px}.xnl-document-editor__tool-label{overflow:hidden;text-overflow:ellipsis}
.xnl-document-editor__diagnostics{margin:0;padding:8px 14px 8px 34px;border-bottom:1px solid #f0c9c3;background:#fff6f4;color:#a43a2e;font-size:12px}
.xnl-document-editor__surface{min-width:0;overflow:visible}
.xnl-document-editor__content{box-sizing:border-box;min-height:12rem;padding:42px 52px 56px;outline:0;color:#292e2b;font-size:15px;line-height:1.75}
.xnl-document-editor__content>*:first-child{margin-top:0}.xnl-document-editor__content>*:last-child{margin-bottom:0}
.xnl-document-editor__content h1{margin:0 0 .7em;color:#1f2421;font-size:2rem;line-height:1.22}.xnl-document-editor__content h2{margin:1.7em 0 .55em;font-size:1.45rem;line-height:1.3}.xnl-document-editor__content h3{margin:1.5em 0 .45em;font-size:1.15rem;line-height:1.35}.xnl-document-editor__content p{margin:.8em 0}.xnl-document-editor__content blockquote{margin:1.2em 0;padding:.1em 0 .1em 1em;border-left:3px solid #9db8aa;color:#56615b}.xnl-document-editor__content hr{margin:2em 0;border:0;border-top:1px solid #dfe4e1}
.xnl-document-editor__content ul[data-type=taskList]{padding-left:0;list-style:none}.xnl-document-editor__content li[data-type=taskItem]{display:flex;gap:8px}.xnl-document-editor__content li[data-type=taskItem]>div{flex:1}
.xnl-document-editor__content pre{position:relative;padding:16px;border-left:3px solid #1677ff;background:#111827;color:#e5e7eb;overflow:auto}.xnl-document-editor__content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.xnl-document-editor__surface.has-folded-code .xnl-document-editor__content pre code{display:block;max-height:1.5em;overflow:hidden}
.xnl-enhanced-code{margin:1em 0;border:1px solid #d0d5dd;border-radius:6px;background:#111827;color:#e5e7eb;overflow:hidden}.xnl-enhanced-code__header{display:flex;align-items:center;justify-content:space-between;min-height:34px;padding:0 10px;border-bottom:1px solid #344054;background:#1f2937;color:#d0d5dd;font-size:12px}.xnl-enhanced-code__actions{display:flex;gap:4px}.xnl-enhanced-code__actions button{height:26px;padding:0 8px;border:1px solid #475467;border-radius:4px;background:#101828;color:#f2f4f7;cursor:pointer}.xnl-enhanced-code__body{display:grid;grid-template-columns:auto minmax(0,1fr);max-height:32rem;overflow:auto}.xnl-enhanced-code__gutter{display:grid;align-content:start;min-width:3ch;padding:16px 8px;text-align:right;color:#667085;background:#0b1220;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none}.xnl-enhanced-code__gutter span{display:block}.xnl-enhanced-code pre{margin:0;border:0;border-radius:0;background:transparent}.xnl-enhanced-code.is-folded .xnl-enhanced-code__body{max-height:3.2rem;overflow:hidden}.xnl-code-token.syntax-keyword{color:#7dd3fc}.xnl-code-token.syntax-string{color:#86efac}.xnl-code-token.syntax-number{color:#f9a8d4}
.xnl-document-editor__loading{padding:24px;color:#667085}
.xnl-document-editor__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@container(max-width:560px){.xnl-document-editor__content{padding:30px 26px 42px}.xnl-document-editor__toolbar{gap:3px;padding-inline:5px}}
@media(prefers-reduced-motion:reduce){.xnl-document-editor__tool,.xnl-document-editor__more{transition:none}}
`;
