import { EditorContent } from '@tiptap/vue-3';
import type {
  DocumentEditorToolbarGroupPlan,
  DocumentEditorToolbarToolPlan,
} from 'dg-cell-mvi-halfcode-contract';
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
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
          h('span', { 'aria-hidden': 'true' }, compactLabel(tool)),
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
      }, overflow ? tool.label : compactLabel(tool));
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
      h('div', {
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
              }, '...'),
              overflowOpen.value
                ? h('div', {
                    class: 'xnl-document-editor__overflow-menu',
                    role: 'menu',
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

function compactLabel(tool: DocumentEditorToolbarToolPlan): string {
  const labels: Record<string, string> = {
    'undo-2': 'Undo', 'redo-2': 'Redo',
    bold: 'B', italic: 'I', underline: 'U', strikethrough: 'S', code: '</>', link: 'Link',
    palette: 'A', highlighter: 'HL',
    'align-left': 'Left', 'align-center': 'Center', 'align-right': 'Right',
    'align-justify': 'Justify', 'corner-down-left': 'Break',
  };
  return (tool.icon === undefined ? undefined : labels[tool.icon])
    ?? tool.label.split(' ').map((part) => part[0]).join('').slice(0, 4);
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
.xnl-document-editor{position:relative;display:grid;grid-template-rows:auto auto minmax(12rem,1fr);min-width:0;border:1px solid #d8dde6;background:#fff;color:#182230;font:14px/1.5 system-ui,sans-serif}
.xnl-document-editor__toolbar{position:relative;z-index:10;display:flex;align-items:center;gap:8px;min-width:0;min-height:46px;padding:4px 6px;border-bottom:1px solid #d8dde6;background:#f7f8fa;overflow:visible}
.xnl-document-editor__group{display:flex;align-items:center;gap:3px;flex:0 0 auto;padding-right:7px;border-right:1px solid #d8dde6}
.xnl-document-editor__tool,.xnl-document-editor__more{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:36px;height:36px;padding:0 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:#344054;cursor:pointer;white-space:nowrap}
.xnl-document-editor__tool:hover,.xnl-document-editor__more:hover,.xnl-document-editor__tool.is-active{border-color:#98a2b3;background:#fff;color:#0057b8}
.xnl-document-editor__tool:focus-visible,.xnl-document-editor__more:focus-visible{outline:2px solid #1677ff;outline-offset:1px}
.xnl-document-editor__tool:disabled{opacity:.45;cursor:not-allowed}
.xnl-document-editor__tool input[type=color]{position:absolute;width:1px;height:1px;opacity:0}
.xnl-document-editor__tool select{max-width:8rem;height:30px;border:0;background:transparent;color:inherit}
.xnl-document-editor__overflow{position:relative;margin-left:auto;flex:0 0 auto}
.xnl-document-editor__overflow-menu{position:absolute;z-index:20;top:42px;right:0;display:grid;min-width:210px;max-height:60vh;padding:6px;border:1px solid #d0d5dd;border-radius:6px;background:#fff;box-shadow:0 10px 24px rgba(16,24,40,.16);overflow:auto}
.xnl-document-editor__overflow-label{padding:8px 8px 3px;color:#667085;font-size:12px;font-weight:600}
.xnl-document-editor__tool--overflow{justify-content:flex-start;width:100%}
.xnl-document-editor__diagnostics{margin:0;padding:6px 12px 6px 30px;background:#fff4f2;color:#b42318;border-bottom:1px solid #fecdca}
.xnl-document-editor__surface{min-width:0;overflow:auto}
.xnl-document-editor__content{box-sizing:border-box;min-height:12rem;padding:24px;outline:0}
.xnl-document-editor__content>*:first-child{margin-top:0}.xnl-document-editor__content>*:last-child{margin-bottom:0}
.xnl-document-editor__content ul[data-type=taskList]{padding-left:0;list-style:none}.xnl-document-editor__content li[data-type=taskItem]{display:flex;gap:8px}.xnl-document-editor__content li[data-type=taskItem]>div{flex:1}
.xnl-document-editor__content pre{position:relative;padding:16px;border-left:3px solid #1677ff;background:#111827;color:#e5e7eb;overflow:auto}.xnl-document-editor__content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.xnl-document-editor__surface.has-folded-code .xnl-document-editor__content pre code{display:block;max-height:1.5em;overflow:hidden}
.xnl-enhanced-code{margin:1em 0;border:1px solid #d0d5dd;border-radius:6px;background:#111827;color:#e5e7eb;overflow:hidden}.xnl-enhanced-code__header{display:flex;align-items:center;justify-content:space-between;min-height:34px;padding:0 10px;border-bottom:1px solid #344054;background:#1f2937;color:#d0d5dd;font-size:12px}.xnl-enhanced-code__actions{display:flex;gap:4px}.xnl-enhanced-code__actions button{height:26px;padding:0 8px;border:1px solid #475467;border-radius:4px;background:#101828;color:#f2f4f7;cursor:pointer}.xnl-enhanced-code__body{display:grid;grid-template-columns:auto minmax(0,1fr);max-height:32rem;overflow:auto}.xnl-enhanced-code__gutter{display:grid;align-content:start;min-width:3ch;padding:16px 8px;text-align:right;color:#667085;background:#0b1220;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none}.xnl-enhanced-code__gutter span{display:block}.xnl-enhanced-code pre{margin:0;border:0;border-radius:0;background:transparent}.xnl-enhanced-code.is-folded .xnl-enhanced-code__body{max-height:3.2rem;overflow:hidden}.xnl-code-token.syntax-keyword{color:#7dd3fc}.xnl-code-token.syntax-string{color:#86efac}.xnl-code-token.syntax-number{color:#f9a8d4}
.xnl-document-editor__loading{padding:24px;color:#667085}
.xnl-document-editor__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
