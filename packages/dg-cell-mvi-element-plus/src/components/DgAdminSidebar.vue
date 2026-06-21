<!--
  dg-cell-mvi-element-plus · DgAdminSidebar — the admin side menu (PURE UI).

  The reusable Element-Plus sidebar of the admin chassis (add-admin-chassis P4·T4.2 / behavior
  admin.layout requirement `sider-menu`). It renders a recursive, collapsible, multi-level `el-menu`
  from a menu TREE, highlights the active path, auto-expands the active branch (native el-menu via
  `:default-active`), shows iconify icons, and collapses to a 64px rail.

  It is PURE UI — it owns NO store, NO contract, NO router (decisions §8 — the element-plus render layer
  must not depend on admin-logic / admin-contract). All data flows through props/events:
    in  : `menu`       — the multi-level menu tree (the consumer feeds it from `projectMenu(routes,codes)`,
                         decisions §9: menu is a PROJECTION, not a store);
          `activePath` — the current route's path (drives highlight + active-branch auto-expand);
          `collapsed`  — fold state (true = 64px rail); shared by header's fold button.
    out : `navigate(path)`        — a menu leaf was selected (consumer router.push'es it);
          `update:collapsed(bool)`— v-model passthrough so a host may two-way bind the fold state.
  The recursion lives in the sibling `DgAdminMenuNode` (one node per `AdminMenuItem`). The local
  `AdminMenuItem` shape mirrors admin-contract's `MenuItem` WITHOUT importing it (same zero-contract
  discipline as DgAdminTabs / DgLogin).
-->
<template>
  <el-menu
    :class="$style.menu"
    :default-active="activePath"
    :collapse="collapsed"
    :collapse-transition="false"
    :unique-opened="false"
    @select="onSelect"
  >
    <DgAdminMenuNode v-for="node in menu" :key="node.path" :node="node" />
  </el-menu>
</template>

<script setup lang="ts">
import DgAdminMenuNode from './DgAdminMenuNode.vue';
import type { AdminMenuItem } from './DgAdminSidebar.types';

const props = defineProps<{
  /** the menu tree to render (consumer feeds `projectMenu(routes, permissionCodes)` — a projection, §9). */
  menu: AdminMenuItem[];
  /** the active route path — el-menu highlights the matching item AND auto-opens its ancestor sub-menus. */
  activePath: string;
  /** fold state: true collapses the menu to a 64px icon rail (shared with the header's fold button). */
  collapsed: boolean;
}>();

// `props` is referenced so the (otherwise template-only) binding is not flagged unused under strict TS.
void props;

const emit = defineEmits<{
  /** a leaf menu item was clicked — payload is its path; the consumer navigates (router.push). */
  (e: 'navigate', path: string): void;
  /** v-model:collapsed passthrough (optional two-way bind for hosts that drive fold from the sidebar). */
  (e: 'update:collapsed', collapsed: boolean): void;
}>();

// el-menu's @select gives the chosen item's `index` (= the leaf's path). Branch titles never fire select
// (el-sub-menu toggles open/close), so this only ever carries a navigable leaf path upward.
function onSelect(index: string): void {
  emit('navigate', index);
}
</script>

<style module>
.menu {
  /* fill the aside; kill el-menu's default right divider so it sits flush in the panel. */
  height: 100%;
  border-right: none;
}
/* keep a stable rail width when collapsed (el-menu's own collapsed width is 64px; pin it so the aside
   transition lands on the same number the layout animates to). */
.menu:global(.el-menu--collapse) {
  width: 64px;
}
</style>
