/**
 * dg-cell-mvi-admin-template · theme — the app's chassis ThemePort + EP dark CSS variables.
 *
 * The app is the DEPA 消费方/装配根: it OWNS the concrete ThemePort and injects it. The EP-native
 * implementation lives in `dg-cell-mvi-element-plus` (`createElementThemePort`); here we instantiate it +
 * annotate the contract type.
 *
 * EP-native dark: we import `element-plus/theme-chalk/dark/css-vars.css` ONCE here — that stylesheet
 * defines EP's dark CSS variables under the `html.dark` selector. `themePort.applyTheme('dark')` toggles
 * that class, so the whole EP component surface goes dark. The custom primary color is applied as the
 * `--el-color-primary` CSS-variable family (themePort.applyPrimaryColor).
 *
 * theme ownership: `settings.theme`/`settings.primaryColor` are 1-级 facts (settings actor). The settings
 * drawer dispatches `settings.setTheme`/`settings.setPrimaryColor`; App.vue (装配根) WATCHES the actor's
 * projected theme/primaryColor → calls `themePort.applyTheme()` / `themePort.applyPrimaryColor()`. The
 * persist+hydrate of those facts is a settings-actor StoragePort effect (chassis/stores.ts) — so a chosen
 * theme/color survives reload, applied on boot by the same watch's `immediate` run.
 */
import 'element-plus/theme-chalk/dark/css-vars.css';

import { createElementThemePort } from 'dg-cell-mvi-element-plus';
import type { ThemePort } from 'dg-cell-mvi-admin-contract';

/**
 * The chassis ThemePort wrapping the EP-native dark/primary-color apply. `applyTheme`/`applyPrimaryColor`
 * are THE apply seams App.vue drives from the settings actor.
 */
export const themePort: ThemePort = createElementThemePort();
