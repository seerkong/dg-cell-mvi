import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';

import { DgSubTable, createPermissionDirective } from 'dg-cell-mvi-element-plus';
import { hasPermission } from 'dg-cell-mvi-admin-logic';
import App from './App.vue';
import router from './router';
import { CHASSIS_KEY, chassis } from './chassis/stores';
import { installGlobalErrorHandler } from './chassis/errorHandler';
import { i18n } from './i18n';
import './styles/global.css';

// rich form-control widgets (referenced from crudOptions by string name → avoids cloneDeep of a
// component object during options normalization, same pattern as DgSubTable).
import TableSelect from './components/rich/TableSelect.vue';
import ImageUploader from './components/rich/ImageUploader.vue';
import JsonEditor from './components/rich/JsonEditor.vue';
import PhoneInput from './components/rich/PhoneInput.vue';
import CodeEditor from './components/rich/CodeEditor.vue';
import IconPicker from './components/rich/IconPicker.vue';
import RichTextEditor from './components/rich/RichTextEditor.vue';

const app = createApp(App);
// global error sink (P4·T4.3): app.config.errorHandler + window unhandledrejection/error → console.error
// + a throttled ElMessage "页面出错" (no silent white screen). Installed BEFORE mount so errors thrown
// during the initial render are caught too. 401 is NOT handled here (the HttpPort's onUnauthorized→logout
// owns it) — the rejection handler skips auth-shaped errors to avoid a double prompt. See errorHandler.ts.
installGlobalErrorHandler(app);
// register virtual-model sub-editor + rich widgets globally so crudOptions can reference by name
app.component('DgSubTable', DgSubTable);
app.component('TableSelect', TableSelect);
app.component('ImageUploader', ImageUploader);
app.component('JsonEditor', JsonEditor);
app.component('PhoneInput', PhoneInput);
app.component('CodeEditor', CodeEditor);
app.component('IconPicker', IconPicker);
app.component('RichTextEditor', RichTextEditor);
// provide the SHARED chassis actors (session/tabs) so components resolve the same instances the router
// guards import directly (single source of auth/tabs truth — T2.3 router-as-effect).
app.provide(CHASSIS_KEY, chassis);
// v-permission directive (T5.2): register the NEUTRAL directive bound to a predicate composed HERE (the
// 装配点) from the permission actor's LIVE codes. A directive cannot inject() the chassis, so the
// predicate is closed over at install time; it reads `chassis.permission.state().codes` on EACH
// mount/update, so `v-permission="'role:add'"` reflects the current codes (after login they are loaded).
// The directive package (dg-cell-mvi-vue) stays domain-free — it only calls this injected predicate.
app.directive(
  'permission',
  createPermissionDirective((code) => hasPermission(chassis.permission.state().codes, code)),
);
// i18n (P6·T6.1): install the single vue-i18n instance so `useI18n()`/`$t` work app-wide. The ACTIVE
// locale is driven by the settings actor via App.vue's `<el-config-provider>` + i18nPort.setLocale (one
// fact → vue-i18n + EP + crud chrome). The static EP `locale: zhCn` here is just the bootstrap default;
// App.vue's el-config-provider reactively overrides EP's locale for the whole tree.
app.use(i18n).use(ElementPlus, { locale: zhCn }).use(router).mount('#app');
