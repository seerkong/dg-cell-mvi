/**
 * dg-cell-mvi-admin-element-plus · theme — the app's chassis ThemePort + the EP dark CSS variables
 * (P6·T6.2, decisions §6 EP-native dark + §8 ThemePort=EP).
 *
 * The app is the DEPA 消费方/装配根 (decisions §8): it OWNS the concrete ThemePort and injects it. The
 * EP-native implementation lives in `dg-cell-mvi-element-plus` (`createElementThemePort` — the EP render
 * layer, the theme sibling of vue's vueI18nPort); here we instantiate it + annotate the contract type
 * (the adapter stays admin-schema-free, decisions §8).
 *
 * EP-native dark (decisions §6): we import `element-plus/theme-chalk/dark/css-vars.css` ONCE here — that
 * stylesheet defines EP's dark CSS variables under the `html.dark` selector. `themePort.applyTheme('dark')`
 * toggles that class, so the whole EP component surface goes dark with NO Ant color engine. The custom
 * primary color is applied as the `--el-color-primary` CSS-variable family (themePort.applyPrimaryColor).
 *
 * theme ownership (T6.1 ↔ T6.2 parity): `settings.theme`/`settings.primaryColor` are 1-级 facts (settings
 * actor, decisions §9). T6.2 drives the APPLY exactly like T6.1's locale: the settings drawer dispatches
 * `settings.setTheme`/`settings.setPrimaryColor`, and App.vue (装配根) WATCHES the settings actor's
 * projected theme/primaryColor → calls `themePort.applyTheme()` / `themePort.applyPrimaryColor()`. The
 * persist+hydrate of those facts is a settings-actor StoragePort effect (chassis/stores.ts) — so a chosen
 * theme/color survives reload, applied on boot by the same watch's `immediate` run.
 */
import 'element-plus/theme-chalk/dark/css-vars.css';

import { createElementThemePort } from 'dg-cell-mvi-element-plus';
import type { ThemePort } from 'dg-cell-mvi-admin-contract';

/**
 * The chassis ThemePort wrapping the EP-native dark/primary-color apply (structurally assignable —
 * `createElementThemePort` stays admin-schema-free; we annotate the contract type HERE at the consumer,
 * decisions §8). `applyTheme`/`applyPrimaryColor` are THE apply seams App.vue drives from the settings actor.
 */
export const themePort: ThemePort = createElementThemePort();
