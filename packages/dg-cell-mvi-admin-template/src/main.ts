/**
 * dg-cell-mvi-admin-template · main — the app bootstrap (the DEPA 消费方/装配根 entry).
 *
 * Installs, in order: the global error sink, Element-Plus, the chassis provide, the v-permission directive,
 * vue-i18n, and the router. Each is a thin assembly step — the chassis logic lives in the dg-cell-mvi-*
 * packages; this file only WIRES the concrete render engines (EP / vue-i18n) and the shared actors.
 */
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';

import { createPermissionDirective } from 'dg-cell-mvi-element-plus';
import { hasPermission } from 'dg-cell-mvi-admin-logic';
import App from './App.vue';
import router from './router';
import { CHASSIS_KEY, chassis } from './chassis/stores';
import { installGlobalErrorHandler } from './chassis/errorHandler';
import { i18n } from './i18n';
import './styles/global.css';

const app = createApp(App);
// global error sink: app.config.errorHandler + window unhandledrejection/error → console.error + a
// throttled ElMessage "页面出错" (no silent white screen). Installed BEFORE mount so errors thrown during
// the initial render are caught too. 401 is NOT handled here (the HttpPort's onUnauthorized→logout owns it).
installGlobalErrorHandler(app);
// provide the SHARED chassis actors (session/tabs/permission/settings) so components resolve the same
// instances the router guards import directly (single source of auth/tabs/permission/settings truth).
app.provide(CHASSIS_KEY, chassis);
// v-permission directive: the NEUTRAL directive bound to a predicate composed HERE (the 装配点) from the
// permission actor's LIVE codes. A directive cannot inject() the chassis, so the predicate is closed over
// at install time; it reads `chassis.permission.state().codes` on EACH mount/update, so
// `v-permission="'product:add'"` reflects the current codes (after login they are loaded). The directive
// package stays domain-free — it only calls this injected predicate.
app.directive(
  'permission',
  createPermissionDirective((code) => hasPermission(chassis.permission.state().codes, code)),
);
// i18n: install the single vue-i18n instance so `useI18n()`/`$t` work app-wide. The ACTIVE locale is
// driven by the settings actor via App.vue's `<el-config-provider>` + i18nPort.setLocale (one fact →
// vue-i18n + EP + crud chrome). The static EP `locale: zhCn` here is just the bootstrap default.
app.use(i18n).use(ElementPlus, { locale: zhCn }).use(router).mount('#app');
