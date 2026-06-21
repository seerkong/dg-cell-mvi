<!--
  dg-cell-mvi-element-plus · DgAdminTabs — the admin multi-tab bar (PURE UI).

  The reusable Element-Plus tab strip that renders the open page tabs of the admin chassis
  (add-admin-chassis P4·T4.1 / behavior admin.layout requirement `multi-tab`). It shows one closable
  `el-tab-pane` per opened tab (keyed by `fullPath`, identity), highlights the current tab, and exposes a
  dropdown "关闭其他 / 关闭全部" control. Affix-pinned tabs (`meta.affix === true`) render without a close
  cross and survive close-others / close-all (the reducer enforces that too).

  It is PURE UI — it owns NO store, NO contract, NO router (decisions §8 — the element-plus render layer
  must not depend on admin-logic / admin-contract). All data flows through props/events:
    in  : `tabs`    — the opened tab list (the consumer feeds it from TabsBinding.opened);
          `current` — the active tab's fullPath (TabsBinding.current).
    out : `switch(fullPath)`      — a tab was clicked (consumer navigates + sets current);
          `close(fullPath)`       — a tab's close cross / the dropdown 关闭(当前) was clicked;
          `closeOthers(fullPath)` — dropdown 关闭其他 (keep this tab + affix);
          `closeAll`              — dropdown 关闭全部 (keep affix only);
          `refresh(fullPath)`     — dropdown 刷新当前页 (optional; the consumer may re-mount the view).
  The local `AdminTabItem` shape mirrors admin-contract's `TabItem` UI surface WITHOUT importing it, so
  this package keeps its zero-dependency-on-admin contract (same discipline as DgLogin / DgAdminOutside).
-->
<template>
  <div :class="$style.bar">
    <!-- the tab strip: card tabs, closable, no "+" add button. Element's tab model is the active
         pane `name` — we use each tab's `fullPath` as that name (stable identity), so switching/closing
         round-trips the fullPath straight back to the consumer with no index mapping. -->
    <el-tabs
      :model-value="current"
      type="card"
      :class="$style.tabs"
      @tab-change="onTabChange"
      @tab-remove="onTabRemove"
    >
      <el-tab-pane
        v-for="item in tabs"
        :key="item.fullPath"
        :name="item.fullPath"
        :closable="isClosable(item)"
      >
        <!-- custom label so we can render a per-tab right-click affordance (native contextmenu →
             close-others on that tab) without a heavyweight contextmenu component. -->
        <template #label>
          <span
            :class="$style.label"
            @contextmenu.prevent="onContextmenu(item)"
          >
            {{ tabTitle(item) }}
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- batch controls: split-button (primary action = 关闭全部) + dropdown of the rest. Mirrors the
         reference admin's tabs control. `command` carries the action; current tab is `current`. -->
    <el-dropdown
      :class="$style.controls"
      trigger="click"
      @command="onCommand"
    >
      <el-button size="small" text :class="$style.controlBtn">
        {{ tabActionsLabel }}
        <el-icon :class="$style.caret"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="refresh" :disabled="!current">{{ refreshLabel }}</el-dropdown-item>
          <el-dropdown-item command="close" :disabled="!closableCurrent">{{ closeLabel }}</el-dropdown-item>
          <el-dropdown-item command="others" divided :disabled="!current">{{ closeOthersLabel }}</el-dropdown-item>
          <el-dropdown-item command="all">{{ closeAllLabel }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import type { TabPaneName } from 'element-plus';

// the UI-facing tab shape (structural mirror of admin-contract's TabItem) lives in a sibling .ts module
// so it is importable by consumers — a type declared in <script setup> is invisible through the `*.vue`
// ambient shim (default-export only). meta.affix === true pins a tab (no close cross, survives close-all).
import type { AdminTabItem } from './DgAdminTabs.types';

const props = withDefaults(
  defineProps<{
    /** the opened tabs, in order (consumer feeds TabsBinding.opened). */
    tabs: AdminTabItem[];
    /** the active tab's fullPath (TabsBinding.current); '' = none. */
    current: string;
    /**
     * Optional localized chrome labels for the batch-controls dropdown (PURE UI — the consumer passes
     * `t('...')`; defaults keep the original Chinese so an un-localized / standalone use is byte-equivalent).
     * `tabActionsLabel` = the trigger (标签操作); the four below are the dropdown items.
     */
    tabActionsLabel?: string;
    refreshLabel?: string;
    closeLabel?: string;
    closeOthersLabel?: string;
    closeAllLabel?: string;
  }>(),
  {
    tabActionsLabel: '标签操作',
    refreshLabel: '刷新当前页',
    closeLabel: '关闭当前页',
    closeOthersLabel: '关闭其他',
    closeAllLabel: '关闭全部',
  },
);

const emit = defineEmits<{
  (e: 'switch', fullPath: string): void;
  (e: 'close', fullPath: string): void;
  (e: 'closeOthers', fullPath: string): void;
  (e: 'closeAll'): void;
  (e: 'refresh', fullPath: string): void;
}>();

/** an affix tab is pinned — no close cross, immune to close-others/all. */
function isAffix(item: AdminTabItem): boolean {
  return Boolean(item.meta && (item.meta as Record<string, unknown>).affix);
}

/** closable = not affix AND not the only tab left (always keep at least one). */
function isClosable(item: AdminTabItem): boolean {
  if (isAffix(item)) return false;
  return props.tabs.length > 1;
}

function tabTitle(item: AdminTabItem): string {
  return item.title || item.fullPath;
}

/** is the CURRENT tab closable (drives the dropdown 关闭当前页 enabled state). */
const closableCurrent = computed(() => {
  const cur = props.tabs.find((t) => t.fullPath === props.current);
  return cur ? isClosable(cur) : false;
});

// --- el-tabs events: name === fullPath, so emit it straight through. ---
function onTabChange(name: TabPaneName): void {
  const fullPath = String(name);
  if (fullPath !== props.current) emit('switch', fullPath);
}

function onTabRemove(name: TabPaneName): void {
  emit('close', String(name));
}

// --- per-tab right-click → close-others on that tab (lightweight contextmenu affordance). ---
function onContextmenu(item: AdminTabItem): void {
  emit('closeOthers', item.fullPath);
}

// --- dropdown batch controls. ---
function onCommand(command: string): void {
  switch (command) {
    case 'refresh':
      if (props.current) emit('refresh', props.current);
      break;
    case 'close':
      if (closableCurrent.value) emit('close', props.current);
      break;
    case 'others':
      if (props.current) emit('closeOthers', props.current);
      break;
    case 'all':
      emit('closeAll');
      break;
  }
}
</script>

<style module>
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px;
  background: var(--el-bg-color, #ffffff);
  border-bottom: 1px solid var(--el-border-color-light, #e4e7ed);
  box-sizing: border-box;
}
.tabs {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
/* card tabs sit flush in the bar (kill el-tabs' own bottom border/gap). */
.tabs :global(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
}
.tabs :global(.el-tabs__nav) {
  border: none;
}
.tabs :global(.el-tabs__item) {
  height: 30px;
  line-height: 30px;
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 4px;
  margin-right: 6px;
  padding: 0 14px !important;
}
.tabs :global(.el-tabs__item.is-active) {
  background: var(--el-color-primary-light-9, #ecf5ff);
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
}
.label {
  display: inline-block;
}
.controls {
  flex: none;
}
.controlBtn {
  display: inline-flex;
  align-items: center;
}
.caret {
  margin-left: 2px;
}
</style>
