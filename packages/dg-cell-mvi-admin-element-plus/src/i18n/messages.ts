/**
 * dg-cell-mvi-admin-element-plus · i18n/messages — the app's zh-CN + en message catalogs (P6·T6.1).
 *
 * Two locales, namespaced for clarity:
 *   - common.*  : generic chrome buttons (新增/编辑/删除/查询/重置/确定/取消/列设置 …) + status words.
 *   - menu.*    : sidebar category + leaf titles (keyed by a stable id, looked up by the menu projection
 *                 input — see router/resources.ts `i18nKey`). Falls back to the resource's literal title.
 *   - login.*   : the login page chrome.
 *   - header.*  : the top-bar chrome (user dropdown / language switch labels).
 *   - fs.*      : the dg-cell-mvi-crud BUILT-IN chrome keys (I18N_KEY). Authored here so the global
 *                 i18n port (handed to useCrud) localizes crud chrome (Add/Edit/Delete/…) per locale.
 *
 * Authoring style: each locale is a FLAT map of dotted keys (so the `fs.*` half stays byte-in-lock-step
 * with crud's `I18N_KEY` constants — no hand-maintained nesting that could drift). `nest()` converts the
 * flat map into the nested object vue-i18n resolves against (`t('fs.actionbar.add')` walks fs→actionbar→
 * add). zh-CN values intentionally equal the crud projector's default Chinese, so a zh session is
 * behavior-equivalent to "no translator".
 */
// the crud BUILT-IN chrome key constants. Imported from `dg-cell-mvi-crud` (their source of truth) —
// `dg-cell-mvi-element-plus` only re-exports them (via its `export *` chain), and going to crud directly
// keeps this plain-data catalog free of the element-plus SFC barrel (so it stays trivially importable in
// unit tests / non-DOM contexts). The VALUES are identical (pure re-export, no local redefinition).
import { I18N_KEY } from 'dg-cell-mvi-crud';

/** a recursive message tree: a leaf is a string, a branch is a nested map (what vue-i18n resolves against). */
export interface MessageTree {
  [key: string]: string | MessageTree;
}

/** turn a flat `{ 'a.b.c': v }` map into the nested `{ a: { b: { c: v } } }` vue-i18n resolves against. */
function nest(flat: Record<string, string>): MessageTree {
  const out: MessageTree = {};
  for (const key of Object.keys(flat)) {
    const parts = key.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const child = node[seg];
      if (typeof child !== 'object' || child === null) node[seg] = {};
      node = node[seg] as MessageTree;
    }
    node[parts[parts.length - 1]] = flat[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// menu titles — keyed by a stable id assigned in router/resources.ts (node.i18nKey). Categories +
// the main leaf pages are translated; any leaf without an entry falls back to its literal `title`.
// ---------------------------------------------------------------------------
const ZH_MENU: Record<string, string> = {
  'menu.cat.chassis': '底盘',
  'menu.cat.crud': 'CRUD 数据',
  'menu.cat.form': '表单',
  'menu.cat.table': '表格特性',
  'menu.cat.comp': '组件',
  'menu.cat.rich': '富组件',
  'menu.cat.dict': '字典与插槽',
  'menu.user': '用户管理',
  'menu.role': '角色管理',
  'menu.system': '系统设置',
  'menu.demo': '演示',
  'menu.i18n': '国际化(i18n)',
  'menu.permission': '按钮权限(permission)',
};
const EN_MENU: Record<string, string> = {
  'menu.cat.chassis': 'Chassis',
  'menu.cat.crud': 'CRUD Data',
  'menu.cat.form': 'Forms',
  'menu.cat.table': 'Table Features',
  'menu.cat.comp': 'Components',
  'menu.cat.rich': 'Rich Widgets',
  'menu.cat.dict': 'Dict & Slots',
  'menu.user': 'Users',
  'menu.role': 'Roles',
  'menu.system': 'System Settings',
  'menu.demo': 'Demo',
  'menu.i18n': 'i18n',
  'menu.permission': 'Button Permission',
};

// ---------------------------------------------------------------------------
// zh-CN — values equal the crud projector defaults (so zh == "no translator", behavior-equivalent).
// ---------------------------------------------------------------------------
const ZH_FLAT: Record<string, string> = {
  // common chrome buttons + words
  'common.add': '新增',
  'common.edit': '编辑',
  'common.remove': '删除',
  'common.view': '查看',
  'common.search': '查询',
  'common.reset': '重置',
  'common.confirm': '确定',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.columnSettings': '列设置',
  'common.refresh': '刷新',
  'common.actions': '操作',
  // login page
  'login.title': '登录',
  'login.username': '用户名',
  'login.password': '密码',
  'login.submit': '登 录',
  'login.usernamePlaceholder': '请输入用户名',
  'login.passwordPlaceholder': '请输入密码',
  // header / top bar
  'header.logout': '退出登录',
  'header.language': '语言',
  'header.settings': '设置',
  'header.foldMenu': '收起菜单',
  'header.unfoldMenu': '展开菜单',
  // multi-tab bar batch-controls dropdown (DgAdminTabs shell chrome — passed in as label props).
  'tabs.actions': '标签操作',
  'tabs.refresh': '刷新当前页',
  'tabs.close': '关闭当前页',
  'tabs.closeOthers': '关闭其他',
  'tabs.closeAll': '关闭全部',
  // settings drawer (P6·T6.2)
  'settings.dark': '暗黑模式',
  'settings.primaryColor': '主题色',
  // crud BUILT-IN chrome (I18N_KEY) — same literals the crud projector emits by default.
  [I18N_KEY.actionbarAdd]: '新增',
  [I18N_KEY.rowHandleTitle]: '操作',
  [I18N_KEY.rowHandleView]: '查看',
  [I18N_KEY.rowHandleEdit]: '编辑',
  [I18N_KEY.rowHandleRemove]: '删除',
  [I18N_KEY.toolbarRefresh]: '刷新',
  [I18N_KEY.toolbarCompact]: '紧凑',
  [I18N_KEY.toolbarExport]: '导出',
  [I18N_KEY.toolbarColumnsFilter]: '列设置',
  [I18N_KEY.removeConfirmTitle]: '提示',
  [I18N_KEY.removeConfirmMessage]: '确定要删除此记录吗?',
  [I18N_KEY.formAdd]: '新增',
  [I18N_KEY.formEdit]: '编辑',
  [I18N_KEY.formView]: '查看',
  [I18N_KEY.formCancel]: '取消',
  [I18N_KEY.formOk]: '保存',
  // form dirty-close confirm (was hardcoded in DgFormWrapper's saveRemind guard).
  [I18N_KEY.formCloseConfirmTitle]: '提示',
  [I18N_KEY.formCloseConfirmMessage]: '有未保存的修改，确定关闭？',
  // editable inline-row action column (was hardcoded in DgTable).
  [I18N_KEY.editableOperations]: '操作',
  [I18N_KEY.editableSave]: '保存',
  [I18N_KEY.editableCancel]: '取消',
  [I18N_KEY.editableEdit]: '编辑',
  [I18N_KEY.editableRemove]: '删除',
  // sub-table virtual-model editor (was hardcoded in DgSubTable).
  [I18N_KEY.subTableOperations]: '操作',
  [I18N_KEY.subTableRemove]: '删除',
  [I18N_KEY.subTableAddRow]: '+ 添加一行',
  // search bar (the previously-missing keys: 查询/重置 were hardcoded in DgSearch; placeholder is a prefix).
  [I18N_KEY.searchSearch]: '查询',
  [I18N_KEY.searchReset]: '重置',
  [I18N_KEY.searchPlaceholder]: '请输入',
  // column-settings dialog (its title + footer buttons were hardcoded in DgColumnsFilter).
  [I18N_KEY.columnsFilterTitle]: '列设置',
  [I18N_KEY.columnsFilterReset]: '重置',
  [I18N_KEY.columnsFilterCancel]: '取消',
  [I18N_KEY.columnsFilterConfirm]: '确定',
  ...ZH_MENU,
};

// ---------------------------------------------------------------------------
// en — English equivalents for every key above.
// ---------------------------------------------------------------------------
const EN_FLAT: Record<string, string> = {
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.remove': 'Delete',
  'common.view': 'View',
  'common.search': 'Search',
  'common.reset': 'Reset',
  'common.confirm': 'OK',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.columnSettings': 'Columns',
  'common.refresh': 'Refresh',
  'common.actions': 'Actions',
  'login.title': 'Sign in',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.usernamePlaceholder': 'Enter username',
  'login.passwordPlaceholder': 'Enter password',
  'header.logout': 'Sign out',
  'header.language': 'Language',
  'header.settings': 'Settings',
  'header.foldMenu': 'Collapse menu',
  'header.unfoldMenu': 'Expand menu',
  'tabs.actions': 'Tab actions',
  'tabs.refresh': 'Refresh current',
  'tabs.close': 'Close current',
  'tabs.closeOthers': 'Close others',
  'tabs.closeAll': 'Close all',
  'settings.dark': 'Dark mode',
  'settings.primaryColor': 'Theme color',
  [I18N_KEY.actionbarAdd]: 'Add',
  [I18N_KEY.rowHandleTitle]: 'Actions',
  [I18N_KEY.rowHandleView]: 'View',
  [I18N_KEY.rowHandleEdit]: 'Edit',
  [I18N_KEY.rowHandleRemove]: 'Delete',
  [I18N_KEY.toolbarRefresh]: 'Refresh',
  [I18N_KEY.toolbarCompact]: 'Compact',
  [I18N_KEY.toolbarExport]: 'Export',
  [I18N_KEY.toolbarColumnsFilter]: 'Columns',
  [I18N_KEY.removeConfirmTitle]: 'Confirm',
  [I18N_KEY.removeConfirmMessage]: 'Delete this record?',
  [I18N_KEY.formAdd]: 'Create',
  [I18N_KEY.formEdit]: 'Edit',
  [I18N_KEY.formView]: 'View',
  [I18N_KEY.formCancel]: 'Cancel',
  [I18N_KEY.formOk]: 'Save',
  // form dirty-close confirm.
  [I18N_KEY.formCloseConfirmTitle]: 'Confirm',
  [I18N_KEY.formCloseConfirmMessage]: 'You have unsaved changes. Close anyway?',
  // editable inline-row action column.
  [I18N_KEY.editableOperations]: 'Actions',
  [I18N_KEY.editableSave]: 'Save',
  [I18N_KEY.editableCancel]: 'Cancel',
  [I18N_KEY.editableEdit]: 'Edit',
  [I18N_KEY.editableRemove]: 'Delete',
  // sub-table virtual-model editor.
  [I18N_KEY.subTableOperations]: 'Actions',
  [I18N_KEY.subTableRemove]: 'Delete',
  [I18N_KEY.subTableAddRow]: '+ Add row',
  // search bar — the placeholder PREFIX (trailing space) concatenates with the field title: "Enter Name".
  [I18N_KEY.searchSearch]: 'Search',
  [I18N_KEY.searchReset]: 'Reset',
  [I18N_KEY.searchPlaceholder]: 'Enter ',
  // column-settings dialog
  [I18N_KEY.columnsFilterTitle]: 'Columns',
  [I18N_KEY.columnsFilterReset]: 'Reset',
  [I18N_KEY.columnsFilterCancel]: 'Cancel',
  [I18N_KEY.columnsFilterConfirm]: 'OK',
  ...EN_MENU,
};

/** the nested message catalogs vue-i18n consumes. `label` is the human name shown in the switcher. */
export const messages: Record<string, MessageTree> = {
  'zh-CN': { label: '简体中文', ...nest(ZH_FLAT) },
  en: { label: 'English', ...nest(EN_FLAT) },
};

/** the locales the app offers (drives the language switcher). */
export const SUPPORTED_LOCALES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]['value'];
