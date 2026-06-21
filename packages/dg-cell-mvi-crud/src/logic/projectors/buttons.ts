/**
 * dg-cell-mvi-crud · logic/projectors/buttons — rowHandle / actionbar / toolbar button projection.
 *
 * Pure: combines closure `config` button overrides with runtime `state` (toolbar compact) into the
 * plain-data rowHandle/actionbar/toolbar shapes the Vue components consume. Mirrors the reference crud
 * fs-row-handle's `merge(defaultButtons, userButtons)` → drop `show:false` → sortBy(order), but every
 * button resolves to plain booleans (no per-row compute in this cut) and carries a string `action`
 * the view maps to an command on click. Composed into projectCrudBinding by the orchestrator.
 */
import { merge } from 'lodash-es';

import type { ButtonOptions } from '../../contract/crudOptions';
import type { CrudState } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';
import { I18N_KEY, resolveT, type CrudTranslator } from '../../support/i18n';

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
  /** button group name (rowHandle grouping) — adjacent same-group buttons cluster in the view. */
  group?: string;
  /** opaque custom click handler (rowHandle author buttons / dropdown items) — called per-row in the view. */
  onClick?: (scope: { row: any; index: number; key: string }) => void;
}

/**
 * A run of buttons that the view renders together: a same-`group` cluster (wrapped in an
 * el-button-group) when `group` is set, else a single standalone button (`group` undefined). The
 * projector orders/clusters the full button list into these runs so DgRowHandle stays a thin renderer.
 */
export interface ButtonGroupRun {
  group?: string;
  buttons: ResolvedButton[];
}

/** The remove confirm config the view (DgRowHandle) pops before dispatching doRemove. */
export interface RemoveBinding {
  showConfirm: boolean;
  confirmTitle: string;
  confirmMessage: string;
}

export interface RowHandleBinding {
  show: boolean;
  width: number;
  fixed?: 'left' | 'right';
  title: string;
  /** the full ordered button list (backward-compat: DgRowHandle's default render path). */
  buttons: ResolvedButton[];
  /**
   * Grouped runs of the full button list (adjacent same-`group` buttons clustered; ungrouped buttons
   * standalone). DgRowHandle wraps a `group`-set run in an el-button-group. Always present (when no
   * button declares a group, every run is a single standalone button — renders identically).
   */
  groups: ButtonGroupRun[];
  /** overflow dropdown enabled (rowHandle.dropdown.show) — when true, use inline/dropdown split. */
  dropdown: boolean;
  /** dropdown trigger label (default 更多), only meaningful when `dropdown` is true. */
  dropdownText: string;
  /** the first `atLeast` buttons (rendered inline) — only meaningful when `dropdown` is true. */
  inlineButtons: ResolvedButton[];
  /** the overflow buttons collapsed into the dropdown menu — only meaningful when `dropdown` is true. */
  dropdownButtons: ResolvedButton[];
  /** remove confirm passthrough (rowHandle.remove) — UI hooks live in the crud effect, this is just the confirm. */
  remove: RemoveBinding;
}
export interface ActionbarBinding {
  show: boolean;
  buttons: ResolvedButton[];
}
export interface ToolbarBinding {
  show: boolean;
  compact: boolean;
  buttons: ResolvedButton[];
}

const ORDER_DEFAULT = 100;

/** A default button descriptor: the resolved fields + optional built-in i18n keys for its labels. */
type ButtonDefault = Omit<ResolvedButton, 'show'> & {
  show?: boolean;
  /** built-in `text` label key (resolved through the injected translator; default = `text`). */
  i18nKey?: string;
  /** built-in `title` (tooltip) label key — defaults to `i18nKey` when omitted. */
  titleKey?: string;
  /** the per-button permission code (only the built-in 'export'/etc. rarely set; usually via override). */
  permission?: string;
};

/**
 * merge default button descriptors with user overrides (config), drop `show:false`, resolve to plain
 * `ResolvedButton`s sorted by `order`. `defaults` carry the `action` + base text/type; user overrides
 * are config-only (ButtonOptions): they can flip `show`, retitle, reorder, recolor — never re-`action`.
 *
 * Two injected capabilities are applied here (both no-ops when not injected):
 *  - i18n: a built-in button's label resolves through `config.t` against its `i18nKey` (default = the
 *    default Chinese text). A user-provided `text`/`title` override still wins over both.
 *  - permission: when a button carries a `permission` code AND `config.permission` is injected, the
 *    button is DROPPED when `config.permission(code) === false`.
 */
function resolveButtons(
  defaults: Record<string, ButtonDefault>,
  overrides: Record<string, ButtonOptions> | undefined,
  config: NormalizedCrudOptions<any>,
): ResolvedButton[] {
  const t: CrudTranslator | undefined = config.t;
  const can = config.permission;
  const merged = merge({}, defaults, overrides || {}) as Record<string, Record<string, any>>;
  const out: ResolvedButton[] = [];
  for (const key of Object.keys(merged)) {
    const b = merged[key];
    if (b.show === false) continue;
    // permission filter: drop a permissioned button the predicate denies (additive — no code / no
    // injected predicate keeps the button).
    const code = b.permission as string | undefined;
    if (code && can && can(code) === false) continue;
    // localize the built-in label: a user override `text` wins; else the default text resolved through
    // the translator (against the default's i18nKey, falling back to the default Chinese text).
    const def = defaults[key];
    const i18nKey = def?.i18nKey;
    const userText = overrides?.[key]?.text;
    const text =
      userText != null
        ? userText
        : i18nKey != null
          ? resolveT(t, i18nKey, def?.text ?? '')
          : b.text;
    // title (tooltip): user override wins; else the default title resolved through the translator
    // against titleKey (defaults to i18nKey), falling back to the default Chinese title (or its text).
    const userTitle = overrides?.[key]?.title;
    const titleKey = def?.titleKey ?? def?.i18nKey;
    const title =
      userTitle != null
        ? userTitle
        : titleKey != null
          ? resolveT(t, titleKey, def?.title ?? def?.text ?? '')
          : b.title ?? text;
    out.push({
      key,
      action: b.action ?? defaults[key]?.action ?? key,
      text,
      title,
      icon: b.icon,
      type: b.type,
      disabled: b.disabled === true ? true : undefined,
      order: b.order ?? ORDER_DEFAULT,
      show: true,
      // rowHandle grouping + custom click handler (carried through; ungrouped/no-handler → undefined).
      group: typeof b.group === 'string' ? b.group : undefined,
      onClick: typeof b.onClick === 'function' ? b.onClick : undefined,
    });
  }
  return out.sort((a, b) => (a.order ?? ORDER_DEFAULT) - (b.order ?? ORDER_DEFAULT));
}

/**
 * Cluster the ordered button list into runs: a maximal run of ADJACENT same-`group` buttons becomes
 * one grouped run (`group` set → the view wraps it in an el-button-group); an ungrouped button (or a
 * group boundary) starts a new standalone run (`group` undefined). Pure; preserves order. When no
 * button declares a group, every run is a single standalone button (renders exactly as before).
 */
function clusterByGroup(buttons: ResolvedButton[]): ButtonGroupRun[] {
  const runs: ButtonGroupRun[] = [];
  for (const btn of buttons) {
    const g = btn.group;
    const last = runs[runs.length - 1];
    if (g != null && last && last.group === g) {
      last.buttons.push(btn);
    } else {
      runs.push({ group: g, buttons: [btn] });
    }
  }
  return runs;
}

/** Per-row operations column: view / edit / remove (merged with config.rowHandle.buttons). */
export function projectRowHandle<R = any>(
  _state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): RowHandleBinding {
  const rh = (config.rowHandle || {}) as Record<string, any>;
  const buttons = resolveButtons(
    {
      view: { key: 'view', action: 'view', text: '查看', title: '查看', order: 1, i18nKey: I18N_KEY.rowHandleView },
      edit: { key: 'edit', action: 'edit', text: '编辑', title: '编辑', order: 2, i18nKey: I18N_KEY.rowHandleEdit },
      remove: { key: 'remove', action: 'remove', type: 'danger', text: '删除', title: '删除', order: 3, i18nKey: I18N_KEY.rowHandleRemove },
    },
    rh.buttons,
    config,
  );
  const rm = (rh.remove || {}) as Record<string, any>;

  // ---- dropdown split (rowHandle.dropdown) ----
  // when enabled, keep the first `atLeast` buttons inline and collapse the rest into the dropdown.
  // `buttons` (the full ordered list) is ALWAYS emitted unchanged for backward-compat; the split is a
  // DERIVED view of it the DgRowHandle uses only when `dropdown` is true.
  const dd = (rh.dropdown || {}) as Record<string, any>;
  const dropdown = dd.show === true;
  const atLeastRaw = typeof dd.atLeast === 'number' ? dd.atLeast : 1;
  const atLeast = atLeastRaw < 0 ? 0 : atLeastRaw;
  const inlineButtons = dropdown ? buttons.slice(0, atLeast) : buttons;
  const dropdownButtons = dropdown ? buttons.slice(atLeast) : [];

  return {
    show: rh.show !== false,
    width: typeof rh.width === 'number' ? rh.width : 200,
    fixed: rh.fixed,
    title: rh.title ?? resolveT(config.t, I18N_KEY.rowHandleTitle, '操作'),
    buttons,
    // grouped runs of the full list (adjacent same-group clusters; ungrouped → standalone runs).
    groups: clusterByGroup(buttons),
    dropdown,
    dropdownText: dd.text ?? '更多',
    inlineButtons,
    dropdownButtons,
    remove: {
      showConfirm: rm.showConfirm !== false,
      confirmTitle: rm.confirmTitle ?? resolveT(config.t, I18N_KEY.removeConfirmTitle, '提示'),
      confirmMessage: rm.confirmMessage ?? resolveT(config.t, I18N_KEY.removeConfirmMessage, '确定要删除此记录吗?'),
    },
  };
}

/** Above-table primary actions: add. */
export function projectActionbar<R = any>(
  _state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): ActionbarBinding {
  const ab = (config.actionbar || {}) as Record<string, any>;
  const buttons = resolveButtons(
    {
      add: { key: 'add', action: 'add', type: 'primary', text: '新增', title: '新增', order: 1, i18nKey: I18N_KEY.actionbarAdd },
    },
    ab.buttons,
    config,
  );
  return { show: ab.show !== false, buttons };
}

/** Table toolbar: refresh / compact / columnsFilter (compact state from ui.toolbarCompact). */
export function projectToolbar<R = any>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): ToolbarBinding {
  const tb = (config.toolbar || {}) as Record<string, any>;
  const compact = state.ui.toolbarCompact === true;
  const buttons = resolveButtons(
    {
      refresh: { key: 'refresh', action: 'refresh', text: '刷新', title: '刷新', order: 1, i18nKey: I18N_KEY.toolbarRefresh },
      compact: { key: 'compact', action: 'compact', text: '紧凑', title: '紧凑', order: 2, i18nKey: I18N_KEY.toolbarCompact },
      // off by default — enable via toolbar.buttons.export.show = true
      export: { key: 'export', action: 'export', text: '导出', title: '导出 CSV', order: 3, show: false, i18nKey: I18N_KEY.toolbarExport },
      // column settings — shown when toolbar.columnsFilter.show is set (normalized to config.columnsFilter.show),
      // or overridable like any button via toolbar.buttons.columnsFilter.show.
      columnsFilter: {
        key: 'columnsFilter',
        action: 'columnsFilter',
        text: '列设置',
        title: '列设置',
        order: 4,
        show: config.columnsFilter.show === true,
        i18nKey: I18N_KEY.toolbarColumnsFilter,
      },
    },
    tb.buttons,
    config,
  );
  return { show: tb.show !== false, compact, buttons };
}
