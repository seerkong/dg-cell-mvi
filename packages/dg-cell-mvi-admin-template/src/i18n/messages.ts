/**
 * dg-cell-mvi-admin-template · i18n/messages — the app's zh-CN + en message catalogs.
 *
 * Two locales, namespaced for clarity:
 *   - common.*  : generic chrome buttons + status words.
 *   - menu.*    : sidebar titles (keyed by a stable id, looked up by the menu projection — see
 *                 router/resources.ts `i18nKey`). Falls back to the resource's literal title.
 *   - login.* / header.* / tabs.* / settings.* : the shell chrome.
 *   - fs.*      : the dg-cell-mvi-crud BUILT-IN chrome keys (I18N_KEY). Authored here so the global i18n
 *                 port (handed to useCrud) localizes crud chrome (Add/Edit/Delete/…) per locale.
 *
 * Authoring style: each locale is a FLAT map of dotted keys (so the `fs.*` half stays in lock-step with
 * crud's `I18N_KEY` constants). `nest()` converts the flat map into the nested object vue-i18n resolves
 * against. zh-CN values intentionally equal the crud projector's default Chinese, so a zh session is
 * behavior-equivalent to "no translator".
 *
 * Add your own keys here as you build pages; reference them with `$t('your.key')` / `t('your.key')`.
 */
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

// menu titles — keyed by a stable id assigned in router/resources.ts (node.i18nKey).
const ZH_MENU: Record<string, string> = {
  'menu.cat.main': '主导航',
  'menu.product': '商品管理',
};
const EN_MENU: Record<string, string> = {
  'menu.cat.main': 'Main',
  'menu.product': 'Products',
};

// zh-CN — values equal the crud projector defaults (so zh == "no translator", behavior-equivalent).
const ZH_FLAT: Record<string, string> = {
  // common chrome buttons + words
  'common.add': '新增',
  'common.edit': '编辑',
  'common.remove': '删除',
  'common.search': '查询',
  'common.reset': '重置',
  'common.confirm': '确定',
  'common.cancel': '取消',
  // login page
  'login.submit': '登 录',
  'login.usernamePlaceholder': '请输入用户名',
  'login.passwordPlaceholder': '请输入密码',
  // header / top bar
  'header.logout': '退出登录',
  'header.language': '语言',
  'header.settings': '设置',
  // multi-tab bar batch-controls dropdown (DgAdminTabs shell chrome — passed in as label props).
  'tabs.actions': '标签操作',
  'tabs.refresh': '刷新当前页',
  'tabs.close': '关闭当前页',
  'tabs.closeOthers': '关闭其他',
  'tabs.closeAll': '关闭全部',
  // settings drawer
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
  [I18N_KEY.formCloseConfirmTitle]: '提示',
  [I18N_KEY.formCloseConfirmMessage]: '有未保存的修改，确定关闭？',
  [I18N_KEY.searchSearch]: '查询',
  [I18N_KEY.searchReset]: '重置',
  [I18N_KEY.searchPlaceholder]: '请输入',
  [I18N_KEY.columnsFilterTitle]: '列设置',
  [I18N_KEY.columnsFilterReset]: '重置',
  [I18N_KEY.columnsFilterCancel]: '取消',
  [I18N_KEY.columnsFilterConfirm]: '确定',
  ...ZH_MENU,
};

// en — English equivalents for every key above.
const EN_FLAT: Record<string, string> = {
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.remove': 'Delete',
  'common.search': 'Search',
  'common.reset': 'Reset',
  'common.confirm': 'OK',
  'common.cancel': 'Cancel',
  'login.submit': 'Sign in',
  'login.usernamePlaceholder': 'Enter username',
  'login.passwordPlaceholder': 'Enter password',
  'header.logout': 'Sign out',
  'header.language': 'Language',
  'header.settings': 'Settings',
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
  [I18N_KEY.formCloseConfirmTitle]: 'Confirm',
  [I18N_KEY.formCloseConfirmMessage]: 'You have unsaved changes. Close anyway?',
  [I18N_KEY.searchSearch]: 'Search',
  [I18N_KEY.searchReset]: 'Reset',
  [I18N_KEY.searchPlaceholder]: 'Enter ',
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
