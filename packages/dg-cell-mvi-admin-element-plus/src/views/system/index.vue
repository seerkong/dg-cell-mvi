<!--
  dg-cell-mvi-admin-element-plus · views/system/index.vue — 系统设置 (the GATED demo page, T5.3).

  This page exists ONLY to demonstrate the RBAC route/menu GATE end-to-end in the browser. Its resource
  node (router/resources.ts) carries `meta.permission = 'system:admin'`, and the dev mock's permission
  codes (chassis/mockHttpPort MOCK_PERMISSION_CODES) DELIBERATELY OMIT `system:admin`. So after login:
    • the sidebar menu FILTERS this item out      — projectMenu drops a node whose code the user lacks
      (delta admin.rbac case `menu-filter`);
    • a DIRECT visit / deep link to `/system` is  — the permission nav guard (resolveRoutePermission)
      BLOCKED and redirected to /403                returns '/403' for a gated route the user can't reach
      (delta admin.rbac route-guard).

  Granting `system:admin` (extend MOCK_PERMISSION_CODES, or assign it to a role on the 角色管理 page) makes
  the item reappear in the menu AND makes `/system` reachable — the same code drives both gates. The page
  body is an intentionally minimal placeholder (no store / no IO); the RBAC gate is the whole point.
-->
<template>
  <div :class="$style.wrap">
    <el-alert
      type="warning"
      :closable="false"
      title="系统设置（受权限保护页 · system:admin）"
      description="本页用 meta.permission='system:admin' 演示 RBAC 拦截：demo 权限码不含 system:admin，所以菜单里看不到本项、直接访问 /system 会被守卫重定向到 /403。授予 system:admin（扩展 mock 码或在「角色管理」给角色勾选该权限）后，菜单项出现且 /system 可访问。"
      show-icon
    />
    <el-card :class="$style.card" shadow="never">
      <template #header>系统设置</template>
      <el-result icon="success" title="你持有 system:admin" sub-title="能看到本页 = 已通过菜单过滤 + 路由守卫两道权限闸。">
        <template #extra>
          <el-tag type="success" disable-transitions>system:admin ✔</el-tag>
        </template>
      </el-result>
    </el-card>
  </div>
</template>

<script setup lang="ts">
// Pure placeholder: no store, no IO. The RBAC gate (meta.permission='system:admin') is what this page demos.
</script>

<style module>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}
.card {
  width: 100%;
}
</style>
