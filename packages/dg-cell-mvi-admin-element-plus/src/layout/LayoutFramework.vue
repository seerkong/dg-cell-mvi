<!--
  dg-cell-mvi-admin-element-plus · layout/LayoutFramework — the admin framework chrome (P4·T4.2 assembly).

  Assembles the full admin shell from the PURE-UI chassis components (dg-cell-mvi-element-plus) wired to
  the chassis actors + the menu/breadcrumb PROJECTIONS (dg-cell-mvi-admin-logic). Layout:

    ┌ aside ────────────┬ header (fold · breadcrumb ········· user▾) ┐
    │ DgAdminSidebar    │ DgAdminTabs (T4.1 multi-tab)               │
    │ (multi-level menu,│ el-main → <router-view> + keep-alive      │
    │  collapse, icons) │                                            │
    └───────────────────┴────────────────────────────────────────────┘

  DEPA wiring (decisions §9 — menu/breadcrumb are PROJECTIONS, NOT stores):
    • menu       = projectMenu(routesAsDescriptors, permissionCodes)   — computed from the resource TREE ×
                   permission (T5.1: codes come from the permission actor's binding — remote-loaded after
                   login by the chassis coordination; a `meta.permission` item shows/hides with its code).
    • activePath = route.path                                          — drives sidebar highlight + auto-expand.
    • breadcrumb = projectBreadcrumb(route.path, menu)                 — computed from currentPath × menu.
  Nothing is written back into routes/menu — re-running the projections is the only "update". `collapsed`
  is the shared fold ref (chassis/layout). Logout dispatches the `logout` command on the SHARED session
  actor and bounces to /login REACTIVELY when the session clears (mirrors SessionProof, avoids racing the
  async logout effect). The T4.1 tabs bar + keep-alive are retained unchanged.
-->
<template>
  <el-container :class="$style.layout">
    <!-- The aside is a FLEX ITEM of .layout, so its main size is set by flex-basis — plain `width` (even
         el-aside's CSS-var width) is ignored in that flex context. Drive flex-basis (+ width for non-flex
         fallback) so collapsing actually shrinks the aside to a 64px icon rail, not just the inner el-menu. -->
    <el-aside
      :class="$style.aside"
      :style="{ flex: collapsed ? '0 0 64px' : '0 0 220px', width: collapsed ? '64px' : '220px' }"
    >
      <div :class="[$style.brand, collapsed && $style.brandCollapsed]">
        <span :class="$style.brandMark">🧩</span>
        <span v-show="!collapsed" :class="$style.brandText">dg-cell-mvi</span>
      </div>
      <!-- sidebar: consumes the menu PROJECTION (multi-level tree) + active path + shared collapse. -->
      <DgAdminSidebar
        :class="$style.menu"
        :menu="menu"
        :active-path="activePath"
        :collapsed="collapsed"
        @navigate="onNavigate"
      />
    </el-aside>

    <el-container>
      <el-header :class="$style.header">
        <!-- header: fold button + breadcrumb slot + user dropdown (logout). -->
        <DgAdminHeader :user="user" :collapsed="collapsed" :logout-text="t('header.logout', '退出登录')" @toggle-collapse="toggleCollapsed" @logout="onLogout">
          <template #breadcrumb>
            <DgAdminBreadcrumb :items="breadcrumb" @navigate="onNavigate" />
          </template>
          <!-- P6 controls slot: the language switcher (T6.1) + the settings gear (T6.2). -->
          <template #controls>
            <LocaleSwitch />
            <!-- settings entry: a gear that opens the settings drawer (dark / theme-color / language). -->
            <span
              :class="$style.settingsBtn"
              :title="t('header.settings', '设置')"
              data-test="header-settings"
              @click="settingsVisible = true"
            >
              <Icon icon="ant-design:setting-outlined" :class="$style.settingsIcon" />
            </span>
          </template>
        </DgAdminHeader>
      </el-header>

      <!-- P4·T4.1 multi-tab bar: reads the shared `tabs` actor; navigates / dispatches close commands. -->
      <DgAdminTabs
        :tabs="tabsBinding.opened"
        :current="tabsBinding.current"
        :tab-actions-label="t('tabs.actions', '标签操作')"
        :refresh-label="t('tabs.refresh', '刷新当前页')"
        :close-label="t('tabs.close', '关闭当前页')"
        :close-others-label="t('tabs.closeOthers', '关闭其他')"
        :close-all-label="t('tabs.closeAll', '关闭全部')"
        @switch="onSwitch"
        @close="onClose"
        @close-others="onCloseOthers"
        @close-all="onCloseAll"
        @refresh="onRefresh"
      />

      <el-main :class="$style.main">
        <!-- keep-alive :include DRIVEN BY THE TABS ACTOR (closing a tab evicts its cached instance).
             :key includes the locale so a language switch REMOUNTS the active view — useCrud runs in the
             VIEW's setup (not on the DgCrud child), so its chrome labels (新增/查询 …) only re-localize when
             the VIEW rebuilds. App.vue applies vue-i18n locale with flush:'sync' BEFORE this remount, so the
             rebuilt useCrud projects the chrome in the new language. (Same-locale tab switches keep their
             cached instance + state; switching language re-fetches — acceptable for an infrequent action.) -->
        <router-view v-slot="{ Component }">
          <keep-alive :include="tabsBinding.keepAlive">
            <component :is="Component" :key="`${route.fullPath}|${settingsBinding.locale}`" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- P6·T6.2 settings drawer: PURE UI bound to the settings actor. The switch/swatches/select dispatch
         setTheme/setPrimaryColor/setLocale; App.vue's watches APPLY them (html.dark / EP vars / vue-i18n),
         and the settings actor's StoragePort effect persists them (reload keeps the choice). -->
    <DgAdminSettings
      v-model:visible="settingsVisible"
      :theme="settingsBinding.theme"
      :primary-color="settingsBinding.primaryColor"
      :locale="settingsBinding.locale"
      :locales="localeOptions"
      :title="t('header.settings', '设置')"
      :dark-label="t('settings.dark', '暗黑模式')"
      :primary-color-label="t('settings.primaryColor', '主题色')"
      :language-label="t('header.language', '语言')"
      @update:theme="onSetTheme"
      @update:primary-color="onSetPrimaryColor"
      @update:locale="onSetLocale"
    />
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Icon } from '@iconify/vue';

import {
  DgAdminTabs,
  DgAdminSidebar,
  DgAdminHeader,
  DgAdminBreadcrumb,
  DgAdminSettings,
} from 'dg-cell-mvi-element-plus';
import {
  closeTab,
  closeOthers,
  closeAll,
  logout,
  setTheme,
  setLocale,
  setPrimaryColor,
} from 'dg-cell-mvi-admin-contract';
import type { TabItem, RouteDescriptor } from 'dg-cell-mvi-admin-contract';
import { projectMenu, projectBreadcrumb } from 'dg-cell-mvi-admin-logic';
import { useAdminStore, bindCommands } from 'dg-cell-mvi-vue';

import resources, { type ResourceNode } from '../router/resources';
import { useChassis } from '../chassis/stores';
import { collapsed, toggleCollapsed } from '../chassis/layout';
import { SUPPORTED_LOCALES } from '../i18n/messages';
import LocaleSwitch from './LocaleSwitch.vue';

const route = useRoute();
const router = useRouter();
// vue-i18n's reactive translate — used to localize the menu/breadcrumb titles (via each node's i18nKey).
// Reading `t` inside the `routeDescriptors` computed makes the menu re-project on a locale switch (P6·T6.1).
const { t } = useI18n();

// --- chassis: the SHARED session + tabs + permission actors (session → header user + logout; tabs → the
//     bar; permission → the menu's permission codes). All three are the same singletons the rest of the
//     app + the guards share. ---
const { session: sessionStore, tabs: tabsStore, permission: permissionStore, settings: settingsStore } = useChassis();
const { binding: sessionBinding } = useAdminStore(sessionStore);
const { binding: tabsBinding } = useAdminStore(tabsStore);
const { binding: permissionBinding } = useAdminStore(permissionStore);
const { binding: settingsBinding } = useAdminStore(settingsStore);
const tabCommands = bindCommands(tabsStore, { closeTab, closeOthers, closeAll });
const sessionCommands = bindCommands(sessionStore, { logout });
// settings actor commands — the settings drawer's switch/swatches/select dispatch these (single write path
// for theme/locale/primaryColor); App.vue's watches APPLY the resulting facts + the actor persists them.
const settingsCommands = bindCommands(settingsStore, { setTheme, setLocale, setPrimaryColor });

// ───────────────────────────────────────────────────────────────────────────
// P6·T6.2 settings drawer: local open state (a pure UI ref — not a fact) + the actor-bound handlers. The
// language select here is a twin of the header LocaleSwitch (both dispatch settings.setLocale). The
// offered locales come from the app catalog (mapped to the drawer's `{ value, label }` option shape).
// ───────────────────────────────────────────────────────────────────────────
const settingsVisible = ref(false);
const localeOptions = SUPPORTED_LOCALES.map((l) => ({ value: l.value, label: l.label }));
function onSetTheme(theme: string): void {
  settingsCommands.setTheme(theme);
}
function onSetPrimaryColor(color: string): void {
  settingsCommands.setPrimaryColor(color);
}
function onSetLocale(locale: string): void {
  if (locale !== settingsBinding.value.locale) settingsCommands.setLocale(locale);
}

// the header user surface (structural subset of UserInfo — username/nickname/avatar). undefined when none.
const user = computed(() => sessionBinding.value.userInfo ?? undefined);

// ───────────────────────────────────────────────────────────────────────────
// menu / breadcrumb PROJECTIONS (decisions §9): computed from routes × permission, never a store.
// ───────────────────────────────────────────────────────────────────────────

/**
 * map a resource node → the projection's RouteDescriptor (carrying meta.title/icon/permission for the
 * menu). The title is LOCALIZED here: `t(node.i18nKey, node.title)` — a node with an i18n key shows its
 * translated label (falling back to the literal Chinese `title` when the key/translation is absent), so
 * the sidebar + breadcrumb follow the app language (P6·T6.1, behavior admin.i18n-theme `switch`).
 */
function toDescriptor(node: ResourceNode): RouteDescriptor {
  const title = node.i18nKey ? t(node.i18nKey, node.title) : node.title;
  return {
    name: node.component,
    path: node.path,
    // meta.permission gates this node in the menu projection (filtered out when the user lacks the code).
    meta: { title, icon: node.icon, permission: node.permission },
    children: node.children?.map(toDescriptor),
  };
}
/**
 * the resource TREE as projection input — a COMPUTED (was a constant) so it re-evaluates when the active
 * locale changes: `toDescriptor` reads vue-i18n's reactive `t`, so flipping the language recomputes the
 * descriptors → `menu`/`breadcrumb` re-project with the new-language titles. The tree STRUCTURE is still
 * the module constant `resources` (only the titles are localized — menu = projection(routes × perms)).
 */
const routeDescriptors = computed<RouteDescriptor[]>(() => resources.map(toDescriptor));

// T5.1: the REAL permission codes from the permission actor (remote-loaded after login by the chassis
// coordination). `menu = projection(routes × these codes)` filters by `meta.permission` — when codes
// change (login loads them / logout clears them), this binding updates and the menu re-projects
// automatically (a gated item like 角色管理 appears/disappears with the `role:view` code). No codes
// yet (anonymous) ⇒ gated items are hidden; ungated items always show.
const permissionCodes = computed<string[]>(() => permissionBinding.value.codes);

/** menu = projection(routes × permissionCodes) — the multi-level tree the sidebar renders. */
const menu = computed(() => projectMenu(routeDescriptors.value, permissionCodes.value));

/** the active route path — drives sidebar highlight + active-branch auto-expand. */
const activePath = computed(() => route.path);

/** breadcrumb = projection(currentPath × menu) — the root→current chain the header shows. */
const breadcrumb = computed(() => projectBreadcrumb(route.path, menu.value));

// ───────────────────────────────────────────────────────────────────────────
// navigation (sidebar + breadcrumb): a single handler — push the chosen path.
// ───────────────────────────────────────────────────────────────────────────
function onNavigate(path: string): void {
  if (path && path !== route.path) router.push(path);
}

// ───────────────────────────────────────────────────────────────────────────
// logout (header user dropdown): dispatch the command; bounce to /login REACTIVELY when session clears
// (pushing eagerly would race the async logout effect — the /login guard would still see a token). Mirrors
// SessionProof. behavior admin.layout `header-breadcrumb` (用户下拉含登出) + admin.auth case `logout`.
// ───────────────────────────────────────────────────────────────────────────
watch(
  () => sessionBinding.value.authenticated,
  (authed) => {
    if (!authed) router.push('/login');
  },
);
function onLogout(): void {
  sessionCommands.logout();
}

// ───────────────────────────────────────────────────────────────────────────
// T4.1 multi-tab handlers (unchanged): tab clicks navigate; the afterEach guard re-opens/sets current.
// ───────────────────────────────────────────────────────────────────────────
function nextCurrentAfterClosing(closingPaths: string[]): string {
  const opened = tabsStore.state().opened;
  const current = tabsStore.state().current;
  if (!closingPaths.includes(current)) return current;
  const closing = new Set(closingPaths);
  const idx = opened.findIndex((t) => t.fullPath === current);
  for (let i = idx + 1; i < opened.length; i++) {
    if (!closing.has(opened[i].fullPath)) return opened[i].fullPath;
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (!closing.has(opened[i].fullPath)) return opened[i].fullPath;
  }
  return '';
}

function gotoAfterClose(target: string): void {
  if (target && target !== route.fullPath) router.push(target);
  else if (!target) router.push('/');
}

function onSwitch(fullPath: string): void {
  if (fullPath !== route.fullPath) router.push(fullPath);
}

function onClose(fullPath: string): void {
  const target = nextCurrentAfterClosing([fullPath]);
  tabCommands.closeTab(fullPath);
  if (fullPath === route.fullPath) gotoAfterClose(target);
}

function onCloseOthers(keepPath: string): void {
  const closing = tabsStore
    .state()
    .opened.filter((t) => t.fullPath !== keepPath && !isAffix(t))
    .map((t) => t.fullPath);
  tabCommands.closeOthers(keepPath);
  if (closing.includes(route.fullPath)) gotoAfterClose(keepPath);
}

function onCloseAll(): void {
  const survivors = tabsStore.state().opened.filter(isAffix);
  tabCommands.closeAll();
  if (!survivors.some((t) => t.fullPath === route.fullPath)) {
    gotoAfterClose(survivors[0]?.fullPath ?? '');
  }
}

function onRefresh(fullPath: string): void {
  if (fullPath) router.replace(fullPath);
}

function isAffix(t: TabItem): boolean {
  return Boolean(t.meta && (t.meta as Record<string, unknown>).affix);
}
</script>

<style module>
.layout {
  height: 100vh;
}
.aside {
  background: var(--dg-panel);
  border-right: 1px solid var(--dg-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow: hidden;
}
.brand {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--dg-border);
  white-space: nowrap;
  overflow: hidden;
}
.brandCollapsed {
  justify-content: center;
  padding: 0;
}
.brandMark {
  font-size: 20px;
  line-height: 1;
}
.brandText {
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.header {
  display: flex;
  align-items: center;
  height: 60px;
  padding: 0 20px;
  background: var(--dg-panel);
  border-bottom: 1px solid var(--dg-border);
}
.main {
  padding: 20px 24px;
  background: var(--dg-bg);
  overflow: auto;
}
.settingsBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular, #606266);
}
.settingsBtn:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-color-primary, #409eff);
}
.settingsIcon {
  width: 18px;
  height: 18px;
  font-size: 18px;
}
</style>
