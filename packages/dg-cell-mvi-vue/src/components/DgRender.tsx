/**
 * dg-cell-mvi-vue · DgRender — the tiny user-render-hook host.
 *
 * Render hooks authored on crudOptions (`column.cellRender`, form-item `render`/`prefixRender`/
 * `suffixRender`/`topRender`/`bottomRender`, `conditionalRender.render`) are opaque fn refs carried
 * verbatim through the agnostic crud package — they may NEVER be created or called there (they would
 * produce framework VNodes). They are CALLED here, in the Vue layer.
 *
 * This functional component simply invokes `props.render(props.scope)` and returns whatever it gives
 * back — a VNode, a string, a number, an array of nodes, or null/undefined. Vue's render function
 * accepts all of these directly, so the hook author can return any of them. A missing `render`
 * renders nothing.
 */
import { defineComponent, type PropType } from 'vue';

export default defineComponent({
  name: 'DgRender',
  props: {
    /** the opaque user render hook — `(scope) => VNode | string | number | array | null`. */
    render: { type: Function as PropType<(scope: any) => any>, default: undefined },
    /** the scope handed to the hook (cell: `{row,index,value,key}`; form item: `{form,mode,key,value}`). */
    scope: { type: null as unknown as PropType<any>, default: undefined },
  },
  setup(props) {
    return () => props.render?.(props.scope) ?? null;
  },
});
