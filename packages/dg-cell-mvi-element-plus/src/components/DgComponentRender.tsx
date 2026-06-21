/**
 * dg-cell-mvi-element-plus · DgComponentRender — dynamic component renderer.
 *
 * Port of the reference crud's `fs-component-render` (slimmed for this cut). Resolves a component from a
 * `name` (string el-* names go through Vue's `resolveComponent`; a passed `component` overrides) and
 * renders it as a controlled input: bridges `modelValue` <-> `onUpdate:modelValue` (re-emitted to the
 * parent) and spreads the remaining props through. For `el-select`, `el-option` children are built
 * from an `options` prop (array of `{ value, label }`). All concrete Element names are mapped here so
 * callers describe inputs declaratively (`{ name: 'select', options }`) — never a concrete component.
 *
 * P3 (crud.ui-registry): the authoring-name -> concrete-component resolution is no longer inlined here;
 * it is owned by the injected UI registry (`resolveComponentSpec` / `resolveComponent`, default
 * `elementUiRegistry`), so the component table is the SINGLE SOURCE shared with the registry. Behavior
 * is byte-equivalent — the default registry reproduces the prior NAME_MAP + COMPONENT_ALIASES + el-*
 * passthrough exactly, and the same terminal fallback (`name || 'el-input'`) lives here.
 */
import {
  computed,
  defineComponent,
  h,
  inject,
  mergeProps,
  resolveComponent,
  type Component,
  type PropType,
} from 'vue';
import {
  UI_ADAPTER_KEY,
  type ResolvedComponentSpec,
  type UiRegistry,
} from 'dg-cell-mvi-vue';
import { elementUiRegistry } from '../support/elementUiRegistry';

/**
 * Back-compat re-export. The UI-neutral logical aliases now live with the Element registry impl (the
 * single source of component resolution, P3) in this package; DgComponentRender re-exports them so
 * `import { COMPONENT_ALIASES }` from this module — and the index re-export — keep working.
 */
export { COMPONENT_ALIASES } from '../support/elementUiRegistry';

/** how a component consumes its options: as el-option/el-radio/el-checkbox children, or a prop. */
const OPTION_KIND: Record<string, 'option' | 'radio' | 'checkbox' | 'optionsProp' | 'dataProp'> = {
  select: 'option',
  'el-select': 'option',
  radio: 'radio',
  'el-radio-group': 'radio',
  checkbox: 'checkbox',
  'el-checkbox-group': 'checkbox',
  cascader: 'optionsProp',
  'el-cascader': 'optionsProp',
  'tree-select': 'dataProp',
  'el-tree-select': 'dataProp',
  // T6.1 UI-neutral logical aliases — same option-rendering as their el-* targets.
  'radio-group': 'radio',
  'checkbox-group': 'checkbox',
};

export interface SelectOption {
  value: any;
  label: string;
  [k: string]: any;
}

export default defineComponent({
  name: 'DgComponentRender',
  inheritAttrs: false,
  props: {
    /** Authoring name ('text'|'select'|... a raw 'el-*' name, OR a Vue component to render directly). */
    name: { type: [String, Object, Function] as PropType<any>, default: undefined },
    /** A concrete component (object) to render, taking precedence over `name`. */
    component: { type: [Object, Function] as PropType<any>, default: undefined },
    /** The bound value (two-way via update:modelValue). */
    modelValue: { type: null as unknown as PropType<any>, default: undefined },
    /** el-select option list. */
    options: { type: Array as PropType<SelectOption[]>, default: undefined },
    /** Extra props forwarded to the resolved component. */
    props: { type: Object as PropType<Record<string, any>>, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    // The active UI registry owns authoring-name -> component resolution (default Element registry).
    // A registry is provided by useCrud (UI_ADAPTER_KEY); standalone usage falls back to the default.
    const registry = inject<UiRegistry>(UI_ADAPTER_KEY, elementUiRegistry);

    // Resolve the target component + any name-derived baked props.
    const resolved = computed<{ comp: any; baked: Record<string, any> }>(() => {
      if (props.component) {
        return { comp: props.component, baked: {} };
      }
      // a non-string `name` is a Vue component (object/function) — render it directly (custom form
      // components: DgSubTable, nested DgCrud, ...). This is the enabler for nested CRUD.
      if (props.name && typeof props.name !== 'string') {
        return { comp: props.name, baked: {} };
      }
      // Resolution via the registry (single source). Order reproduced inside the registry exactly:
      // NAME_MAP -> COMPONENT_ALIASES. Unknown names -> the SAME terminal fallback as before
      // (`{ name: props.name || 'el-input' }`). `resolveComponentSpec` carries the baked props; a
      // minimal custom registry implementing only `resolveComponent` yields no baked props.
      const key = (props.name ?? 'text') as string;
      const spec: ResolvedComponentSpec = resolveSpec(registry, key) ?? { name: props.name || 'el-input' };
      // a string spec name is a concrete el-* name -> resolveComponent; a Component passes through.
      const comp = typeof spec.name === 'string' ? resolveComponent(spec.name) : spec.name;
      return { comp, baked: spec.props ?? {} };
    });

    return () => {
      const { comp, baked } = resolved.value;
      const name = typeof props.name === 'string' ? props.name : '';
      const opts = props.options;
      const kind = props.component == null ? OPTION_KIND[name] : undefined;

      // cascader / tree-select consume options via a prop (options / data).
      const optionProps: Record<string, any> = {};
      if (opts && kind === 'optionsProp') optionProps.options = opts;
      if (opts && kind === 'dataProp') optionProps.data = opts;

      const bound = mergeProps(
        baked,
        {
          modelValue: props.modelValue,
          'onUpdate:modelValue': (v: any) => emit('update:modelValue', v),
        },
        optionProps,
        props.props ?? {},
        // attrs carries passthrough (placeholder, disabled, clearable, style, class, ...).
        attrs as Record<string, any>,
      );

      // select / radio / checkbox render their options as children.
      if (opts && (kind === 'option' || kind === 'radio' || kind === 'checkbox')) {
        const childName = kind === 'option' ? 'el-option' : kind === 'radio' ? 'el-radio' : 'el-checkbox';
        const Child = resolveComponent(childName);
        const children = opts.map((opt) =>
          kind === 'option'
            ? h(Child, { key: opt.value, value: opt.value, label: opt.label })
            : h(Child, { key: opt.value, value: opt.value }, () => opt.label),
        );
        return h(comp, bound, () => children);
      }

      return h(comp, bound);
    };
  },
});

/**
 * Resolve an authoring name to a spec through the registry. Prefers the richer `resolveComponentSpec`
 * (name + baked props); falls back to `resolveComponent` (name only, no baked props) for a minimal
 * custom registry; `undefined` when the name is unknown (caller then applies the el-input fallback).
 */
function resolveSpec(registry: UiRegistry, name: string): ResolvedComponentSpec | undefined {
  if (typeof registry.resolveComponentSpec === 'function') {
    return registry.resolveComponentSpec(name);
  }
  const comp = registry.resolveComponent(name) as Component | string | undefined;
  return comp == null ? undefined : { name: comp };
}
