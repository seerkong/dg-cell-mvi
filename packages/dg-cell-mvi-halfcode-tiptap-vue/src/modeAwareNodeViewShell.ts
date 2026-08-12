import { Check, Ellipsis, Eye, Link2, LockKeyhole, Pencil } from 'lucide-vue-next';
import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
  type PropType,
} from 'vue';
import type {
  XnlRichDocumentEmbeddedModeTransitionGrant,
  XnlRichDocumentEmbeddedModeView,
} from './types';

type RequestedMode = 'inherit' | 'view' | 'edit';

export const DefaultModeAwareHalfcodeNodeViewShell = defineComponent({
  name: 'DefaultModeAwareHalfcodeNodeViewShell',
  props: {
    kind: { type: String, required: true },
    kindLabel: { type: String, default: undefined },
    title: { type: String, required: true },
    mode: { type: Object as PropType<XnlRichDocumentEmbeddedModeView>, required: true },
    selected: { type: Boolean, default: false },
    view: { type: Object as PropType<Readonly<object>>, required: true },
    requestModeTransition: { type: Function as PropType<XnlRichDocumentEmbeddedModeTransitionGrant<object>>, required: true },
  },
  setup(props, { slots }) {
    const menuOpen = ref(false);
    const shell = ref<HTMLElement>();
    const trigger = ref<HTMLButtonElement>();
    let ownerDocument: Document | undefined;
    let outsideListenerBound = false;

    const closeMenu = (restoreFocus = false) => {
      if (!menuOpen.value) return;
      menuOpen.value = false;
      if (restoreFocus) void nextTick(() => trigger.value?.focus());
    };
    const onDocumentPointerDown = (event: PointerEvent) => {
      const NodeConstructor = ownerDocument?.defaultView?.Node;
      if (NodeConstructor !== undefined
        && event.target instanceof NodeConstructor
        && shell.value?.contains(event.target) !== true) closeMenu();
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuOpen.value) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    };
    const bindOutsideListener = () => {
      if (outsideListenerBound || ownerDocument === undefined) return;
      ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);
      outsideListenerBound = true;
    };
    const unbindOutsideListener = () => {
      if (!outsideListenerBound || ownerDocument === undefined) return;
      ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
      outsideListenerBound = false;
    };
    onMounted(() => { ownerDocument = shell.value?.ownerDocument; });
    watch(menuOpen, (open) => { if (open) bindOutsideListener(); else unbindOutsideListener(); });
    onBeforeUnmount(() => {
      unbindOutsideListener();
      ownerDocument = undefined;
    });

    const request = (mode: RequestedMode) => {
      closeMenu();
      void props.requestModeTransition(props.view, { mode }, Object.freeze({}));
    };
    const inheritedAllowed = () => props.mode.allowedModes.includes(props.mode.inheritedMode);
    const triggerIcon = (): Component => props.mode.overlay === 'inherit'
      ? Ellipsis
      : props.mode.mode === 'edit' ? Pencil : Eye;
    const kindLabel = () => props.kindLabel
      ?? (props.kind === 'component-embed' ? 'Component' : props.kind === 'capsule-embed' ? 'Capsule' : props.kind);

    const option = (
      mode: RequestedMode,
      label: string,
      detail: string,
      icon: Component,
      checked: boolean,
      disabled: boolean,
    ) => h('button', {
      type: 'button',
      class: ['xnl-mode-shell__option', checked ? 'is-selected' : ''],
      'aria-pressed': checked,
      'data-mode-option': mode,
      disabled,
      onClick: () => request(mode),
    }, [
      h(icon, { size: 16, 'aria-hidden': 'true' }),
      h('span', { class: 'xnl-mode-shell__option-copy' }, [
        h('strong', {}, label),
        h('small', {}, detail),
      ]),
      checked ? h(Check, { class: 'xnl-mode-shell__check', size: 16, 'aria-hidden': 'true' }) : null,
    ]);

    return () => h('section', {
      ref: shell,
      class: [
        'xnl-mode-shell',
        `is-${props.mode.mode}`,
        props.mode.overlay === 'inherit' ? 'is-inherited' : 'has-overlay',
        props.selected ? 'is-selected' : '',
      ],
      'data-testid': 'xnl-mode-shell',
      'data-display-mode': props.mode.mode,
      'data-mode-overlay': props.mode.overlay,
      'data-mode-menu-open': menuOpen.value ? 'true' : 'false',
      onKeydown,
    }, [
      h('style', {}, MODE_SHELL_STYLE),
      h('div', { class: 'xnl-mode-shell__content' }, slots.default?.()),
      h('div', { class: 'xnl-mode-shell__chrome', 'data-testid': 'xnl-mode-shell-chrome' }, [
        h('button', {
          ref: trigger,
          type: 'button',
          class: 'xnl-mode-shell__trigger',
          title: `${props.title} display mode`,
          'aria-label': `${props.title} display mode`,
          'aria-expanded': menuOpen.value,
          'data-testid': 'xnl-mode-shell-trigger',
          onClick: () => { menuOpen.value = !menuOpen.value; },
        }, [h(triggerIcon(), { size: 16, 'aria-hidden': 'true' })]),
        menuOpen.value ? h('div', {
          class: 'xnl-mode-shell__menu',
          role: 'group',
          'aria-label': `${props.title} display mode options`,
          'data-testid': 'xnl-mode-shell-menu',
        }, [
          h('div', { class: 'xnl-mode-shell__menu-heading' }, [
            h('span', { class: 'xnl-mode-shell__menu-title' }, props.title),
            h('span', { class: 'xnl-mode-shell__kind' }, kindLabel()),
          ]),
          option(
            'inherit',
            'Follow document',
            `Document is ${props.mode.inheritedMode}`,
            Link2,
            props.mode.overlay === 'inherit',
            props.mode.overlay === 'inherit' || !inheritedAllowed(),
          ),
          option(
            'view',
            'View only',
            'Keep this block read-only',
            Eye,
            props.mode.overlay === 'view',
            !props.mode.allowedModes.includes('view'),
          ),
          option(
            'edit',
            'Edit this block',
            'Allow block authoring controls',
            Pencil,
            props.mode.overlay === 'edit',
            !props.mode.allowedModes.includes('edit'),
          ),
          props.mode.reason ? h('div', {
            class: 'xnl-mode-shell__reason',
            role: 'status',
          }, [
            h(LockKeyhole, { size: 15, 'aria-hidden': 'true' }),
            h('span', {}, props.mode.reason),
          ]) : null,
        ]) : null,
      ]),
    ]);
  },
});

const MODE_SHELL_STYLE = `
[data-halfcode-nodeview]{container-type:inline-size}
[data-structured-nodeview]{container-type:inline-size}
[data-structured-nodeview="mermaid"][data-display-mode="view"] [data-mermaid-source-editor]{display:none}
.xnl-mode-shell{position:relative;min-width:0;border-radius:6px;color:#20252b;outline:1px solid transparent;outline-offset:3px;transition:outline-color 140ms ease,box-shadow 140ms ease}
.xnl-mode-shell:hover,.xnl-mode-shell:focus-within,.xnl-mode-shell.is-selected,.xnl-mode-shell[data-mode-menu-open="true"]{outline-color:#b7c4d1;box-shadow:0 0 0 3px rgba(77,111,145,.07)}
.xnl-mode-shell.has-overlay{outline-color:rgba(70,102,134,.2)}
.xnl-mode-shell__content{min-width:0}
.xnl-mode-shell__chrome{position:absolute;z-index:12;top:1px;left:-35px;width:30px;display:flex;justify-content:flex-end;pointer-events:none}
.xnl-mode-shell__trigger{width:28px;height:28px;padding:0;display:grid;place-items:center;border:1px solid #cbd3dc;border-radius:5px;background:#fff;color:#596574;box-shadow:none;cursor:pointer;opacity:.28;transform:translateX(3px);pointer-events:auto;transition:opacity 120ms ease,transform 120ms ease,border-color 120ms ease,background 120ms ease,box-shadow 120ms ease}
.xnl-mode-shell:hover .xnl-mode-shell__trigger,.xnl-mode-shell:focus-within .xnl-mode-shell__trigger,.xnl-mode-shell.is-selected .xnl-mode-shell__trigger,.xnl-mode-shell[data-mode-menu-open="true"] .xnl-mode-shell__trigger,.xnl-mode-shell.has-overlay .xnl-mode-shell__trigger{opacity:1;transform:none;pointer-events:auto}
.xnl-mode-shell.has-overlay:not(:hover):not(:focus-within):not([data-mode-menu-open="true"]) .xnl-mode-shell__trigger{opacity:.62;box-shadow:none}
.xnl-mode-shell__trigger:hover{border-color:#7890a6;background:#f6f8fa;color:#25384a}.xnl-mode-shell__trigger:focus-visible{outline:2px solid #2274a5;outline-offset:2px}
.xnl-mode-shell__menu{position:absolute;top:34px;left:0;width:min(270px,calc(100vw - 32px));padding:6px;border:1px solid #cfd6dd;border-radius:7px;background:#fff;box-shadow:0 12px 32px rgba(28,38,48,.18);pointer-events:auto;color:#222a31}
.xnl-mode-shell__menu-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:7px 8px 8px;border-bottom:1px solid #edf0f2;margin-bottom:4px}
.xnl-mode-shell__menu-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700}.xnl-mode-shell__kind{flex:none;font-size:10px;color:#59646d;text-transform:uppercase}
.xnl-mode-shell__option{width:100%;min-height:44px;padding:6px 8px;display:grid;grid-template-columns:18px minmax(0,1fr) 18px;align-items:center;gap:8px;border:0;border-radius:5px;background:transparent;color:#28323b;text-align:left;cursor:pointer}
.xnl-mode-shell__option:hover:not(:disabled){background:#f0f4f6}.xnl-mode-shell__option:focus-visible{outline:2px solid #2274a5;outline-offset:-2px}.xnl-mode-shell__option:disabled{cursor:default;opacity:.45}
.xnl-mode-shell__option-copy{display:grid;gap:1px;min-width:0}.xnl-mode-shell__option-copy strong{font-size:12px;font-weight:650}.xnl-mode-shell__option-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#59656e;font-size:10px}.xnl-mode-shell__check{color:#1e6a49}
.xnl-mode-shell__reason{display:flex;align-items:flex-start;gap:7px;margin:5px 2px 1px;padding:8px;border-radius:5px;background:#fff7e8;color:#80530c;font-size:11px;line-height:1.35}.xnl-mode-shell__reason svg{flex:none;margin-top:1px}
@media(max-width:700px){.xnl-mode-shell__chrome{top:5px;right:5px;left:auto}.xnl-mode-shell__menu{right:0;left:auto}}
@container(max-width:420px){.xnl-mode-shell__chrome{top:5px;right:5px;left:auto}.xnl-mode-shell__menu{right:0;left:auto;width:min(270px,calc(100cqw - 10px))}}
@media(hover:none),(pointer:coarse){.xnl-mode-shell__trigger{opacity:.72;transform:none;pointer-events:auto}.xnl-mode-shell.is-inherited:not(:focus-within):not([data-mode-menu-open="true"]) .xnl-mode-shell__trigger{box-shadow:none}}
@media(prefers-reduced-motion:reduce){.xnl-mode-shell,.xnl-mode-shell__trigger{transition:none}}
`;
