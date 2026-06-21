<!--
  dg-cell-mvi-admin-template · layout/LayoutFramework — the admin framework chrome (assembly).

  Assembles the full admin shell from the PURE-UI chassis components (dg-cell-mvi-element-plus) wired to
  the chassis actors + the menu/breadcrumb PROJECTIONS (dg-cell-mvi-admin-logic). Layout:

    ┌ aside ────────────┬ header (fold · breadcrumb ········· user▾) ┐
    │ DgAdminSidebar    │ DgAdminTabs (multi-tab)                    │
    │ (multi-level menu,│ el-main → <router-view> + keep-alive      │
    │  collapse, icons) │                                            │
    └───────────────────┴────────────────────────────────────────────┘

  DEPA wiring (menu/breadcrumb are PROJECTIONS, NOT stores):
    • menu       = projectMenu(routesAsDescriptors, permissionCodes)  — routes × permission (a meta.permission
                   item shows/hides with its code, remote-loaded after login by the chassis coordination).
    • activePath = route.path                                         — drives sidebar highlight + auto-expand.
    • breadcrumb = projectBreadcrumb(route.path, menu)                — currentPath × menu.
  Nothing is written back into routes/menu — re-running the projections is the only "update". `collapsed`
  is the shared fold ref (chassis/layout). Logout dispatches the `logout` command on the SHARED session
  actor and bounces to /login REACTIVELY when the session clears (avoids racing the async logout effect).
-->
<template>
  <el-container :class="$style.layout">
    <!-- The aside is a FLEX ITEM of .layout, so its main size is set by flex-basis — plain `width` is
         ignored in that flex context. Drive flex-basis (+ width fallback) so collapsing shrinks the aside
         to a 64px icon rail, not just the inner el-menu. -->
    <el-aside
      :class="$style.aside"
      :style="{ flex: collapsed ? '0 0 64px' : '0 0 220px', width: collapsed ? '64px' : '220px' }"
    >
      <div :class="[$style.brand, collapsed && $style.brandCollapsed]">
        <span :class="$style.brandMark">🧩</span>
        <span v-show="!collapsed" :class="$style.brandText">Admin Template</span>
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
          <!-- controls slot: the language switcher + the settings gear. -->
          <template #controls>
            <LocaleSwitch />
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

      <!-- multi-tab bar: reads the shared `tabs` actor; navigates / dispatches close commands. -->
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
             VIEW's setup, so its chrome labels only re-localize when the VIEW rebuilds. App.vue applies
             vue-i18n locale with flush:'sync' BEFORE this remount, so the rebuilt useCrud projects the
             chrome in the new language. -->
        <router-view v-slot="{ Component }">
          <keep-alive :include="tabsBinding.keepAlive">
            <component :is="Component" :key="`${route.fullPath}|${settingsBinding.locale}`" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- settings drawer: PURE UI bound to the settings actor. The switch/swatches/select dispatch
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
// vue-i18n's reactive translate — localizes the menu/breadcrumb titles (via each node's i18nKey). Reading
// `t` inside the `routeDescriptors` computed makes the menu re-project on a locale switch.
const { t } = useI18n();

// --- chassis: the SHARED session + tabs + permission + settings actors. ---
const { session: sessionStore, tabs: tabsStore, permission: permissionStore, settings: settingsStore } = useChassis();
const { binding: sessionBinding } = useAdminStore(sessionStore);
const { binding: tabsBinding } = useAdminStore(tabsStore);
const { binding: permissionBinding } = useAdminStore(permissionStore);
const { binding: settingsBinding } = useAdminStore(settingsStore);
const tabCommands = bindCommands(tabsStore, { closeTab, closeOthers, closeAll });
const sessionCommands = bindCommands(sessionStore, { logout });
const settingsCommands = bindCommands(settingsStore, { setTheme, setLocale, setPrimaryColor });

// settings drawer: local open state (a pure UI ref) + the actor-bound handlers.
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

// ── menu / breadcrumb PROJECTIONS: computed from routes × permission, never a store. ──

/**
 * map a resource node → the projection's RouteDescriptor. The title is LOCALIZED here:
 * `t(node.i18nKey, node.title)` — a node with an i18n key shows its translated label (falling back to the
 * literal `title`), so the sidebar + breadcrumb follow the app language.
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
/** the resource TREE as projection input — a COMPUTED so it re-evaluates when the active locale changes. */
const routeDescriptors = computed<RouteDescriptor[]>(() => resources.map(toDescriptor));

// the REAL permission codes from the permission actor (remote-loaded after login by the chassis
// coordination). `menu = projection(routes × these codes)` filters by `meta.permission`.
const permissionCodes = computed<string[]>(() => permissionBinding.value.codes);

/** menu = projection(routes × permissionCodes) — the multi-level tree the sidebar renders. */
const menu = computed(() => projectMenu(routeDescriptors.value, permissionCodes.value));

/** the active route path — drives sidebar highlight + active-branch auto-expand. */
const activePath = computed(() => route.path);

/** breadcrumb = projection(currentPath × menu) — the root→current chain the header shows. */
const breadcrumb = computed(() => projectBreadcrumb(route.path, menu.value));

// ── navigation (sidebar + breadcrumb): a single handler — push the chosen path. ──
function onNavigate(path: string): void {
  if (path && path !== route.path) router.push(path);
}

// ── logout: dispatch the command; bounce to /login REACTIVELY when session clears (pushing eagerly would
//    race the async logout effect — the /login guard would still see a token). ──
watch(
  () => sessionBinding.value.authenticated,
  (authed) => {
    if (!authed) router.push('/login');
  },
);
function onLogout(): void {
  sessionCommands.logout();
}

// ── multi-tab handlers: tab clicks navigate; the afterEach guard re-opens/sets current. ──
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
