<!--
  dg-cell-mvi-element-plus · DgAdminOutside — the admin "outside" shell (no aside / no header).

  A centered, blank, card-style layout for pages that live OUTSIDE the admin framework chrome — the
  login page and the 404 page (add-admin-chassis P2·T2.2 / behavior admin.auth login-flow "outside
  布局"). It is PURE UI: it owns no store, no contract, no router — it only frames whatever its default
  slot renders, plus optional `title`/`subtitle` header and a `footer` slot.

  Styling is Element-Plus native + theme-aware: colors come from EP CSS variables (`--el-*`), so it
  follows EP's native dark mode (`html.dark`) automatically (design §6 — EP 原生暗黑/主题). Scoped via
  `<style module>` (the Fs* house style — see DgForm.vue / DgSearch.vue).
-->
<template>
  <div :class="$style.outside">
    <div :class="$style.card">
      <div v-if="title || subtitle || $slots.brand" :class="$style.header">
        <!-- brand slot: callers may drop a logo/custom mark above the title. -->
        <slot name="brand" />
        <h1 v-if="title" :class="$style.title">{{ title }}</h1>
        <p v-if="subtitle" :class="$style.subtitle">{{ subtitle }}</p>
      </div>

      <!-- the framed content (login form, 404 body, …). -->
      <div :class="$style.body">
        <slot />
      </div>

      <div v-if="$slots.footer" :class="$style.footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Props (all optional — a bare `<DgAdminOutside>` is a valid empty centered card):
 *   - title    : the large heading above the slot content (e.g. the app name on the login page).
 *   - subtitle : a muted line under the title (e.g. a tagline).
 * Slots: default (the framed body), `brand` (above the title), `footer` (below the body).
 */
defineProps<{
  title?: string;
  subtitle?: string;
}>();
</script>

<style module>
.outside {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
  background: var(--el-bg-color-page, #f2f3f5);
}
.card {
  width: 100%;
  max-width: 400px;
  padding: 32px 32px 28px;
  border-radius: 8px;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  box-shadow: var(--el-box-shadow-light, 0 0 12px rgba(0, 0, 0, 0.08));
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 24px;
}
.title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--el-text-color-secondary, #909399);
}
.body {
  width: 100%;
}
.footer {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
