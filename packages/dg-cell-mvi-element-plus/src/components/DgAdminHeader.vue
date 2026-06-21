<!--
  dg-cell-mvi-element-plus · DgAdminHeader — the admin top bar (PURE UI).

  The reusable Element-Plus header of the admin chassis (add-admin-chassis P4·T4.2 / behavior
  admin.layout requirement `header-breadcrumb`). Left→right it carries: a fold toggle (collapses the
  sidebar), a breadcrumb region (a slot; the host drops <DgAdminBreadcrumb> in), a placeholder controls
  region for the theme/locale switches (P6 — exposed now as a `controls` slot so the layout is stable),
  and a right-side user dropdown (avatar/name + 退出登录).

  It is PURE UI — NO store, NO contract, NO router (decisions §8). All data flows through props/events:
    in  : `user`      — the signed-in user (`{ username?, nickname?, avatar? }`, fed from a SessionBinding);
          `collapsed` — current fold state (drives the toggle's fold/unfold icon).
    slots: `breadcrumb` (the breadcrumb area), `controls` (P6 theme/locale entry — placeholder for now).
    out : `toggle-collapse` — the fold button was clicked (host flips the shared collapsed state);
          `logout`          — the dropdown 退出登录 was chosen (host dispatches the logout command);
          `command(name)`   — any OTHER dropdown command (forward-compat for future user-menu items).
  Iconify supplies the fold/unfold + caret glyphs (`@iconify/vue`), matching the menu's icon strings.
-->
<template>
  <div :class="$style.header">
    <!-- LEFT: fold toggle + breadcrumb slot. -->
    <div :class="$style.left">
      <button
        type="button"
        :class="$style.fold"
        :title="collapsed ? '展开菜单' : '收起菜单'"
        @click="onToggle"
      >
        <Icon
          :icon="collapsed ? 'ant-design:menu-unfold-outlined' : 'ant-design:menu-fold-outlined'"
          :class="$style.foldIcon"
        />
      </button>
      <!-- breadcrumb region: the host drops <DgAdminBreadcrumb :items> here. -->
      <div :class="$style.breadcrumb">
        <slot name="breadcrumb" />
      </div>
    </div>

    <!-- RIGHT: P6 controls placeholder (theme/locale) + user dropdown. -->
    <div :class="$style.right">
      <!-- controls slot: reserved for the P6 theme/locale switches. Empty until then (layout stays put). -->
      <div :class="$style.controls">
        <slot name="controls" />
      </div>

      <el-dropdown trigger="click" @command="onCommand">
        <span :class="$style.user">
          <el-avatar v-if="user?.avatar" :size="28" :src="user.avatar" :class="$style.avatar" />
          <el-avatar v-else :size="28" :class="$style.avatar">{{ avatarText }}</el-avatar>
          <span :class="$style.name">{{ displayName }}</span>
          <Icon icon="ant-design:down-outlined" :class="$style.caret" />
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout" data-test="header-logout">
              <Icon icon="ant-design:logout-outlined" :class="$style.itemIcon" />
              {{ logoutText || '退出登录' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

/** the minimal user surface the header renders (a structural subset of admin-contract's UserInfo). */
export interface AdminHeaderUser {
  username?: string;
  nickname?: string;
  avatar?: string;
}

const props = defineProps<{
  /** the signed-in user (consumer feeds it from SessionBinding.userInfo); undefined = no user yet. */
  user?: AdminHeaderUser;
  /** current sidebar fold state — drives the fold/unfold icon on the toggle. */
  collapsed: boolean;
  /**
   * label for the user-dropdown logout item (default '退出登录'). Optional override so the consumer can
   * localize it (P6·T6.1) while this component stays PURE UI (no i18n dependency — props in only).
   */
  logoutText?: string;
}>();

const emit = defineEmits<{
  /** the fold toggle was clicked — host flips the shared collapsed state. */
  (e: 'toggle-collapse'): void;
  /** the dropdown 退出登录 item — host dispatches the logout command. */
  (e: 'logout'): void;
  /** any OTHER dropdown command (future user-menu items) — forwarded by name. */
  (e: 'command', name: string): void;
}>();

/** the label next to the avatar — nickname, else username, else a generic fallback. */
const displayName = computed(() => props.user?.nickname || props.user?.username || '未登录');

/** the avatar fallback glyph (first char of the display name) when no avatar image is provided. */
const avatarText = computed(() => {
  const n = props.user?.nickname || props.user?.username || '';
  return n ? n.slice(0, 1).toUpperCase() : 'U';
});

function onToggle(): void {
  emit('toggle-collapse');
}

// the dropdown emits a typed `logout` for the known item; everything else forwards via `command`.
function onCommand(command: string): void {
  if (command === 'logout') emit('logout');
  else emit('command', command);
}
</script>

<style module>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.fold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular, #606266);
  cursor: pointer;
}
.fold:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-color-primary, #409eff);
}
.foldIcon {
  width: 18px;
  height: 18px;
  font-size: 18px;
}
.breadcrumb {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}
.user:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
.avatar {
  flex: none;
  background: var(--el-color-primary, #409eff);
  color: #fff;
}
.name {
  font-size: 14px;
  color: var(--el-text-color-primary, #303133);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caret {
  width: 12px;
  height: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.itemIcon {
  width: 14px;
  height: 14px;
  margin-right: 6px;
  font-size: 14px;
}
</style>
