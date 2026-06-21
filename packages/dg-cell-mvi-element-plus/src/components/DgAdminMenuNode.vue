<!--
  dg-cell-mvi-element-plus · DgAdminMenuNode — ONE recursive menu node (internal to DgAdminSidebar).

  Renders a single `AdminMenuItem`: a leaf becomes an `el-menu-item` (index = its path), a branch
  becomes an `el-sub-menu` whose `#title` carries the icon+label and whose default slot recurses into
  this SAME component for each child (multi-level). This is the recursion carrier so DgAdminSidebar can
  stay a flat `el-menu` wrapper. PURE UI: data in via the `node` prop, nothing emitted/owned here — the
  enclosing `el-menu`'s `@select` (handled by DgAdminSidebar) carries the chosen path out, so this node
  needs no events of its own. Icons render via iconify (`@iconify/vue`) by the node's `icon` string.
-->
<template>
  <!-- branch: has children → expandable sub-menu (icon + label in the title slot). -->
  <el-sub-menu v-if="node.children && node.children.length" :index="node.path">
    <template #title>
      <Icon v-if="node.icon" :icon="node.icon" :class="$style.icon" />
      <span>{{ node.title }}</span>
    </template>
    <!-- recurse: each child is another DgAdminMenuNode (multi-level). -->
    <DgAdminMenuNode v-for="child in node.children" :key="child.path" :node="child" />
  </el-sub-menu>

  <!-- leaf: navigable item (its `index` === path; el-menu's @select emits this path upward). -->
  <el-menu-item v-else :index="node.path">
    <Icon v-if="node.icon" :icon="node.icon" :class="$style.icon" />
    <!-- when collapsed, el-menu renders only the FIRST top-level item's icon; the `#title` slot keeps
         the label available for the (uncollapsed / popper) states. -->
    <template #title>{{ node.title }}</template>
  </el-menu-item>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { AdminMenuItem } from './DgAdminSidebar.types';

// `name` is set via the filename for SFCs, but a recursive component must resolve itself by name —
// @vitejs/plugin-vue infers `DgAdminMenuNode` from this file name, which is exactly the tag used above.
defineProps<{
  /** the menu node to render (its `children` drive the leaf-vs-branch + recursion). */
  node: AdminMenuItem;
}>();
</script>

<style module>
.icon {
  /* match el-menu's icon slot metrics so iconify glyphs align with native el-icon items. */
  width: 18px;
  height: 18px;
  margin-right: 8px;
  font-size: 18px;
  flex: none;
}
</style>
