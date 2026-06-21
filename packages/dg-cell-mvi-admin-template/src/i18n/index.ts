/**
 * dg-cell-mvi-admin-template · i18n — the app's vue-i18n instance + the chassis I18nPort.
 *
 * The app is the DEPA 消费方/装配根: it OWNS the single vue-i18n instance and wraps it into the chassis
 * `I18nPort` via `dg-cell-mvi-vue`'s `createVueI18nPort`. One port, two consumers:
 *   - the chassis chrome (menu/header/login) reads it (directly or via vue-i18n's `useI18n`/`$t`);
 *   - the CRUD pages hand it to `useCrud({ i18n: i18nPort })` so the crud built-in chrome (新增/编辑/删除
 *     /查询/重置 …) localizes through the SAME source (the port's `t` is `CrudTranslator`-compatible).
 *
 * locale ownership: `settings.locale` is the 1-级 fact (settings actor). The switcher dispatches
 * `settings.setLocale`, and App.vue (装配根) WATCHES the settings actor's projected `locale` → calls
 * `i18nPort.setLocale()` (this engine) AND feeds the EP `<el-config-provider :locale>` — so a single fact
 * fans out to vue-i18n + EP + crud. The settings actor's StoragePort effect persists + boot-hydrates it.
 */
import { createI18n } from 'vue-i18n';
import elZhCn from 'element-plus/es/locale/lang/zh-cn';
import elEn from 'element-plus/es/locale/lang/en';
import type { Language } from 'element-plus/es/locale';

import { createVueI18nPort } from 'dg-cell-mvi-vue';
import type { I18nPort } from 'dg-cell-mvi-admin-contract';

import { messages, type AppLocale } from './messages';

/** the default locale — matches `createInitialSettingsState().locale` (the settings actor's seed). */
export const DEFAULT_LOCALE: AppLocale = 'zh-CN';

/** the single vue-i18n instance (Composition API). The app installs it via `app.use(i18n)`. */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  missingWarn: false,
  fallbackWarn: false,
  messages,
});

/**
 * The chassis I18nPort wrapping the vue-i18n instance (structurally assignable — `createVueI18nPort`
 * stays admin-schema-free; we annotate the contract type HERE at the consumer). Handed to
 * `useCrud({ i18n })` and used for any imperative chassis lookup; `setLocale` is THE apply seam App.vue
 * drives from the settings actor.
 */
export const i18nPort: I18nPort = createVueI18nPort(i18n);

/**
 * Map an app locale tag → the matching Element-Plus locale pack (drives `<el-config-provider :locale>`
 * so EP's own component chrome — pagination, date pickers, empty text … — switches with the app language).
 * Unknown tags fall back to zh-cn.
 */
const EP_LOCALES: Record<string, Language> = {
  'zh-CN': elZhCn,
  en: elEn,
};
export function elementLocaleFor(locale: string): Language {
  return EP_LOCALES[locale] ?? elZhCn;
}
