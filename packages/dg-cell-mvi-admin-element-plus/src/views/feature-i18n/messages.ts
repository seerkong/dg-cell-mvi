/**
 * dg-cell-mvi-admin-element-plus · views/feature-i18n/messages — EN locale messages for the i18n demo.
 *
 * Keys are the framework's stable built-in keys (I18N_KEY, namespaced `fs.*`) plus this demo's own
 * config keys (`demo.col.*`). The EN translator looks up here; the 中 (zh) "translator" returns the
 * key so every label falls back to the framework's default Chinese (behavior-equivalent to no i18n).
 */
import { I18N_KEY } from 'dg-cell-mvi-element-plus';

export const EN_MESSAGES: Record<string, string> = {
  // framework chrome
  [I18N_KEY.actionbarAdd]: 'Add',
  [I18N_KEY.rowHandleTitle]: 'Actions',
  [I18N_KEY.rowHandleView]: 'View',
  [I18N_KEY.rowHandleEdit]: 'Edit',
  [I18N_KEY.rowHandleRemove]: 'Delete',
  [I18N_KEY.toolbarRefresh]: 'Refresh',
  [I18N_KEY.toolbarCompact]: 'Compact',
  [I18N_KEY.toolbarColumnsFilter]: 'Columns',
  [I18N_KEY.removeConfirmTitle]: 'Confirm',
  [I18N_KEY.removeConfirmMessage]: 'Delete this record?',
  [I18N_KEY.formAdd]: 'Create',
  [I18N_KEY.formEdit]: 'Edit',
  [I18N_KEY.formView]: 'View',
  [I18N_KEY.formCancel]: 'Cancel',
  [I18N_KEY.formOk]: 'Save',
  // demo config keys
  'demo.col.name': 'Name',
  'demo.col.email': 'Email',
};
