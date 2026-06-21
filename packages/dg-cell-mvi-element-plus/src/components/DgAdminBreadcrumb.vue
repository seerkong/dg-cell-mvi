<!--
  dg-cell-mvi-element-plus · DgAdminBreadcrumb — the admin breadcrumb (PURE UI).

  Renders the root→current chain of an admin page (add-admin-chassis P4·T4.2 / behavior admin.layout
  requirement `header-breadcrumb`). It is a thin `el-breadcrumb` over a list of segments — the LAST
  segment is the current page (plain text, not navigable); the earlier segments are clickable and emit
  `navigate(path)` so a host can route to an ancestor.

  It is PURE UI — NO store, NO contract, NO router (decisions §8). All data flows through props/events:
    in  : `items` — the breadcrumb segments (the consumer feeds `projectBreadcrumb(path, menu)`, §9: a
                    PROJECTION of currentPath × menu, not a store).
    out : `navigate(path)` — an ancestor segment was clicked.
  Iconify icons render per segment when `icon` is present. The local `AdminBreadcrumbItem` shape mirrors
  admin-contract's `BreadcrumbItem` WITHOUT importing it (zero-contract discipline, decisions §8).
-->
<template>
  <el-breadcrumb :class="$style.breadcrumb" separator="/">
    <el-breadcrumb-item v-for="(item, i) in items" :key="item.path">
      <!-- last segment = current page: plain, non-navigable. earlier ones: a clickable link. -->
      <span v-if="i === items.length - 1" :class="$style.current">
        <Icon v-if="item.icon" :icon="item.icon" :class="$style.icon" />
        {{ item.title }}
      </span>
      <a v-else :class="$style.link" @click.prevent="onClick(item.path)">
        <Icon v-if="item.icon" :icon="item.icon" :class="$style.icon" />
        {{ item.title }}
      </a>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { AdminBreadcrumbItem } from './DgAdminSidebar.types';

defineProps<{
  /** the breadcrumb segments (consumer feeds `projectBreadcrumb(currentPath, menu)` — a projection, §9). */
  items: AdminBreadcrumbItem[];
}>();

const emit = defineEmits<{
  /** an ancestor segment was clicked — payload is its path; the consumer navigates. */
  (e: 'navigate', path: string): void;
}>();

function onClick(path: string): void {
  emit('navigate', path);
}
</script>

<style module>
.breadcrumb {
  display: flex;
  align-items: center;
}
.current {
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-secondary, #909399);
}
.link {
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-regular, #606266);
  cursor: pointer;
}
.link:hover {
  color: var(--el-color-primary, #409eff);
}
.icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
  font-size: 14px;
}
</style>
