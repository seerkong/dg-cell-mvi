/**
 * dg-cell-mvi-element-plus · DgButton — render an `el-button` from a ResolvedButton.
 *
 * Slimmed port of the reference crud's `fs-button`: this cut needs only the el-button path (Element is the
 * single, globally-registered UI). The projector resolves a button to a plain ResolvedButton
 * (`{ text, title, icon, type, disabled, loading }`); this component maps those onto el-button props
 * and re-emits the native click. Action→command mapping lives in the parent (DgRowHandle / DgActionbar
 * / DgToolbar) — DgButton is purely presentational and carries no store knowledge.
 *
 * `icon` is treated as an optional CSS class on a leading `<i>` (the Element-icon-font convention).
 * Element icon *components* are not registered in this cut, so a string icon is rendered as a class
 * rather than resolved as a component (absent icon → nothing rendered).
 */
import { computed, defineComponent, h, resolveComponent, type PropType } from 'vue';

export interface ResolvedButton {
  key: string;
  text?: string;
  title?: string;
  icon?: string;
  type?: string;
  action: string;
  show: boolean;
  disabled?: boolean;
  loading?: boolean;
  order?: number;
}

export default defineComponent({
  name: 'DgButton',
  inheritAttrs: false,
  props: {
    /** The resolved button descriptor produced by the crud projector. */
    button: { type: Object as PropType<ResolvedButton>, required: true },
  },
  emits: ['click'],
  setup(props, { emit, slots, attrs }) {
    const btnProps = computed(() => {
      const b = props.button;
      return {
        type: b.type,
        title: b.title,
        disabled: b.disabled === true,
        loading: b.loading === true,
      };
    });

    return () => {
      const b = props.button;
      const ElButton = resolveComponent('el-button');

      const children: any[] = [];
      if (b.icon) {
        children.push(h('i', { class: b.icon }));
      }
      if (slots.default) {
        children.push(slots.default());
      } else if (b.text) {
        children.push(b.text);
      }

      return h(
        ElButton,
        {
          ...btnProps.value,
          ...(attrs as Record<string, any>),
          onClick: (e: MouseEvent) => emit('click', e),
        },
        () => children,
      );
    };
  },
});
