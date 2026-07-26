/**
 * dg-cell-mvi-crud · logic/projectors/form — pure projectForm(state, config) -> CrudBinding['form'].
 *
 * Resolves the active dialog's per-mode form items + footer buttons into plain immutable data. Per
 * the fixed CrudBinding contract: each column becomes a ResolvedFormItem (component derived from
 * column.form.component or a default per column.type), and the footer is cancel + ok. Compute markers
 * are out of scope for this cut — values/show are read straight from the normalized config (the merge
 * of the column's `form` config with its mode-specific `addForm`/`editForm`/`viewForm` override).
 *
 * `pickFormColumns(config, mode)` is exported so the reducer reuses the exact same per-mode column
 * resolution (for initialForm defaults, valueBuilder, and validation rules) — one source of truth.
 */
import { cloneDeep, isEqual, merge } from 'lodash-es';

import type { FormButton, FormItemProps } from '../../contract/crudOptions';
import type { CrudState, FormMode } from '../../contract/state';
import type { NormalizedColumn, NormalizedCrudOptions } from '../../support/optionsBuild';
import { isAsyncCompute, resolveCompute, type AsyncComputeValue } from '../../support/compute';
import { I18N_KEY, resolveT } from '../../support/i18n';
import type { ResolvedButton } from './buttons';
import { projectColumnDictControl, type DictControlBinding } from './dict';

/**
 * ResolvedFormItem — the form-item render shape from the fixed CrudBinding contract. Owned here (the
 * button slices own ResolvedButton in ./buttons, which this file imports). The orchestrator re-exports
 * it from logic/projectors.ts.
 */
export interface ResolvedFormItem {
  key: string;
  title: string;
  component: { name?: string; [prop: string]: any };
  rules: any[];
  show: boolean;
  value?: any;
  helper?: string;
  /** grid layout span (form.col.span) — consumed by DgForm to wrap items in el-col. */
  col?: Record<string, any>;
  /** optional group key (form.group) — items with the same group render together. */
  group?: string;
  /**
   * Form-item render hooks. All are opaque fn refs passed
   * straight through — NEVER called here (the projector is agnostic and must not produce VNodes);
   * DgFormItem calls them in the Vue layer with the live `{ form, mode, key, value }` scope.
   * `render` replaces the input component; prefix/suffix render inline; top/bottom render blocks.
   * `conditionalRender.match` is likewise NOT evaluated here — it is checked live in the view.
   */
  render?: (scope: any) => any;
  prefixRender?: (scope: any) => any;
  suffixRender?: (scope: any) => any;
  topRender?: (scope: any) => any;
  bottomRender?: (scope: any) => any;
  conditionalRender?: { match: (scope: any) => boolean; render: (scope: any) => any };
  /** Standard dict-select projection consumed by UI command bridges. */
  dict?: DictControlBinding;
}

export type { ResolvedButton };

/** A per-mode form column: the column's base `form` config deep-merged with its mode override. */
export interface FormColumn {
  key: string;
  type?: string;
  order: number;
  /** the merged FormItemProps (form ⊕ addForm/editForm/viewForm), with `show` defaulted to true */
  item: FormItemProps & { show: boolean };
  /** kept for the reducer (initialForm valueBuilder) */
  column: NormalizedColumn;
}

const MODE_OVERRIDE_KEY: Record<FormMode, 'addForm' | 'editForm' | 'viewForm'> = {
  add: 'addForm',
  edit: 'editForm',
  view: 'viewForm',
};

/** default component name per column.type (the demo's common set). */
function defaultComponentName(type?: string): string {
  switch (type) {
    case 'textarea':
      return 'el-input';
    case 'number':
      return 'el-input-number';
    case 'select':
      return 'el-select';
    case 'switch':
      return 'el-switch';
    case 'datetime':
    case 'date':
      return 'el-date-picker';
    case 'radio':
    case 'dict-radio':
      return 'el-radio-group';
    case 'checkbox':
    case 'dict-checkbox':
      return 'el-checkbox-group';
    case 'cascader':
      return 'el-cascader';
    case 'tree':
    case 'tree-select':
      return 'el-tree-select';
    case 'text':
    default:
      return 'el-input';
  }
}

/** extra default props per type (so e.g. textarea/datetime render correctly out of the box). */
function defaultComponentProps(type?: string): Record<string, any> {
  switch (type) {
    case 'textarea':
      return { type: 'textarea' };
    case 'datetime':
      return { type: 'datetime' };
    case 'date':
      return { type: 'date' };
    default:
      return {};
  }
}

/**
 * The per-mode form columns: for each normalized column, deep-merge its base `form` config with the
 * mode-specific override (`addForm`/`editForm`/`viewForm`), keeping only those whose `show !== false`.
 * Pure — never mutates config (operates on clones).
 */
export function pickFormColumns(config: NormalizedCrudOptions, mode: FormMode): FormColumn[] {
  const overrideKey = MODE_OVERRIDE_KEY[mode];
  const out: FormColumn[] = [];
  for (const col of config.columns) {
    const base = cloneDeep(col.form || {});
    const override = cloneDeep((col[overrideKey] as FormItemProps | undefined) || {});
    const item = merge({ show: true }, base, override) as FormItemProps & { show: boolean };
    if (item.show === false) continue;
    out.push({ key: col.key, type: col.type, order: col.order, item, column: col });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** Resolve a FormColumn into the ResolvedFormItem render shape. */
function toResolvedFormItem(fc: FormColumn, mode: FormMode): ResolvedFormItem {
  const col = fc.column;
  const userComp = fc.item.component || {};
  const name = userComp.name || defaultComponentName(fc.type);
  const component: ResolvedFormItem['component'] = {
    ...defaultComponentProps(fc.type),
    ...userComp,
    name,
  };
  // view mode: components are read-only (port of buildColumns' viewForm disable pass)
  if (mode === 'view') {
    component.disabled = true;
  }
  const item = fc.item as FormItemProps;
  return {
    key: fc.key,
    title: fc.item.title ?? col.title,
    component,
    rules: fc.item.rules || [],
    show: true,
    value: fc.item.value,
    helper: fc.item.helper,
    col: (fc.item as any).col,
    group: (fc.item as any).group,
    // opaque render-hook refs (passed through, called in the Vue layer — never here).
    render: item.render,
    prefixRender: item.prefixRender,
    suffixRender: item.suffixRender,
    topRender: item.topRender,
    bottomRender: item.bottomRender,
    conditionalRender: item.conditionalRender,
  };
}

const MODE_LABEL: Record<FormMode, string> = { add: '新增', edit: '编辑', view: '查看' };
/** the i18n key per dialog mode (parallels MODE_LABEL — used to localize the dialog title). */
const MODE_LABEL_KEY: Record<FormMode, string> = {
  add: I18N_KEY.formAdd,
  edit: I18N_KEY.formEdit,
  view: I18N_KEY.formView,
};

/**
 * Resolve the per-mode form items into render shapes, injecting dict-backed select options from the
 * loaded dict slice (normalized to {value,label}). Shared by `projectForm` (the dialog) and the table
 * projector's editable-cell components — one source of truth for "which control + options per field".
 */
export function projectFormColumns(
  state: CrudState,
  config: NormalizedCrudOptions,
  mode: FormMode,
): ResolvedFormItem[] {
  // the live scope sync compute (compute(({form}) => …)) on form items evaluates against — the
  // active dialog's current form/row/index/mode. `resolveCompute` is a pure deep clone-walk, so the
  // item re-evaluates whenever the projector re-runs (same observable behavior as the reference crud doComputed).
  const scope = {
    form: state.form.form,
    mode,
    row: state.form.row,
    index: state.form.index ?? undefined,
  };
  const out: ResolvedFormItem[] = [];
  for (const fc of pickFormColumns(config, mode)) {
    const item = toResolvedFormItem(fc, mode);

    // (C) async-compute options: a field whose `component.options` is an AsyncComputeValue reads its
    // resolved value from the computeAsync slice (fetched at the effect boundary), else the marker's
    // defaultValue until the first result lands. Replace the marker so the view never sees it.
    const optMarker = (item.component as Record<string, any>).options;
    if (isAsyncCompute(optMarker)) {
      const resolved = state.computeAsync[fc.key]?.value;
      item.component = {
        ...item.component,
        options: resolved ?? (optMarker as AsyncComputeValue).defaultValue,
      };
    }

    // (A) sync compute on the item's component + show — evaluate every ComputeValue against the live
    // form (resolveCompute leaves any AsyncComputeValue untouched; we already replaced options above).
    item.component = resolveCompute(item.component, scope);
    const resolvedShow = resolveCompute(fc.item.show as any, scope);
    if (resolvedShow === false) continue; // a compute that resolved to false hides the item

    // inject select options for dict-backed columns (loaded dict data, else static fallback),
    // normalized to {value,label} regardless of the dict's value/label key names. A dict
    // `labelBuilder` (port of Dict.getLabel) overrides the option label so the form select shows the
    // same custom label as the cell; absent → the plain `d[label]`.
    const dictCfg = fc.column.dict as
      | { value?: string; label?: string; data?: any[]; labelBuilder?: (item: any) => string }
      | undefined;
    if (dictCfg && item.component.options == null) {
      const loaded = state.dict[fc.column.dictId ?? fc.key]?.data;
      const data = loaded && loaded.length ? loaded : dictCfg.data ?? [];
      const vk = dictCfg.value ?? 'value';
      const lk = dictCfg.label ?? 'label';
      const lb = dictCfg.labelBuilder;
      item.component = {
        ...item.component,
        options: data.map((d: any) => ({
          ...d,
          value: d[vk],
          label: typeof lb === 'function' ? lb(d) : d[lk],
        })),
      };
    }
    if (dictCfg && fc.column.dictId) {
      item.dict = projectColumnDictControl(
        state,
        fc.column.dictId,
        fc.column.dict,
        item.component.disabled === true,
        state.form.form[fc.key],
      );
      // Keep the established component.options surface while sourcing it from the richer projection.
      if (item.component.options == null) {
        item.component = { ...item.component, options: item.dict.options };
      }
    }
    out.push(item);
  }
  return out;
}

export function projectForm(
  state: CrudState,
  config: NormalizedCrudOptions,
): {
  open: boolean;
  mode: FormMode;
  title: string;
  columns: ResolvedFormItem[];
  form: Record<string, any>;
  valid: boolean;
  errors: Record<string, string>;
  loading: boolean;
  buttons: ResolvedButton[];
  /**
   * Custom footer buttons (form.buttons) — opaque `onClick` fn refs passed straight through (called in
   * the Vue layer with the action ctx, NEVER here). Rendered in ADDITION to the default buttons.
   */
  customButtons: FormButton[];
  wrapper: Record<string, any>;
  /** dirty flag: the live form differs from the open-time snapshot (drives saveRemind). */
  dirty: boolean;
  layout: 'default' | 'flex' | 'group' | 'group-tabs';
  /**
   * The saveRemind dirty-close confirm chrome, localized through the injected translator (defaults =
   * the Chinese literals DgFormWrapper used to hardcode — zh / no-translator is byte-equivalent).
   * `closeConfirmTitle` is the dialog title (default 提示); `closeConfirmMessage` is the body
   * (default 有未保存的修改，确定关闭？). The view binds these instead of literals so they follow the locale.
   */
  closeConfirmTitle: string;
  closeConfirmMessage: string;
} {
  const f = state.form;
  const columns = projectFormColumns(state, config, f.mode);

  const modeForm = (config as any)[`${f.mode}Form`];
  const wrapper = { ...(config.form?.wrapper || {}), ...((modeForm && modeForm.wrapper) || {}) };

  // wrapper.title overrides the derived "新增/编辑/查看[ - form.title]" title when set. The mode label
  // localizes through the injected translator (default = the Chinese 新增/编辑/查看).
  const baseTitle = config.form?.title ? ` - ${config.form.title}` : '';
  const modeLabel = resolveT(config.t, MODE_LABEL_KEY[f.mode], MODE_LABEL[f.mode]);
  const title = (wrapper.title as string | undefined) || `${modeLabel}${baseTitle}`;

  const submitting = f.submitStatus === 'submitting';
  const buttons: ResolvedButton[] = [
    { key: 'cancel', text: resolveT(config.t, I18N_KEY.formCancel, '取消'), action: 'cancel', show: true, order: 1 },
  ];
  if (f.mode !== 'view') {
    buttons.push({
      key: 'ok',
      text: resolveT(config.t, I18N_KEY.formOk, '保存'),
      type: 'primary',
      action: 'submit',
      show: true,
      loading: submitting,
      disabled: submitting,
      order: 2,
    });
  }

  // custom footer buttons (form.buttons ⊕ the per-mode override's buttons). Passed through verbatim —
  // the onClick fn refs are opaque (called in the Vue layer); we only ensure each has a stable key.
  // Permission filter: a custom button carrying a `permission` code is DROPPED when an injected
  // predicate denies it (additive — no code / no predicate keeps it).
  const can = config.permission;
  const rawButtons = (modeForm?.buttons ?? config.form?.buttons ?? []) as FormButton[];
  const customButtons: FormButton[] = rawButtons
    .filter((b) => !(b.permission && can && can(b.permission) === false))
    .map((b, i) => ({ ...b, key: b.key ?? `custom-${i}` }));

  const layout = (modeForm?.layout ?? config.form?.layout ?? 'default') as
    | 'default'
    | 'flex'
    | 'group'
    | 'group-tabs';

  // dirty = the live form differs from the open-time snapshot (lodash deep equality).
  const dirty = !isEqual(f.form, f.initial);

  return {
    open: f.open,
    mode: f.mode,
    title,
    columns,
    form: f.form,
    valid: f.valid,
    errors: f.errors,
    loading: submitting,
    buttons,
    customButtons,
    wrapper,
    dirty,
    layout,
    // dirty-close confirm chrome localized (default = the Chinese literals DgFormWrapper hardcoded).
    closeConfirmTitle: resolveT(config.t, I18N_KEY.formCloseConfirmTitle, '提示'),
    closeConfirmMessage: resolveT(config.t, I18N_KEY.formCloseConfirmMessage, '有未保存的修改，确定关闭？'),
  };
}
