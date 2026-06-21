<!--
  dg-cell-mvi-admin-template · views/403/index.vue — the Forbidden page (route-permission target).

  behavior admin.rbac route-guard: a DIRECT visit to a route whose `meta.permission` the user does not
  hold is redirected here by the chassis permission guard (router/guards.ts → resolveRoutePermission →
  next('/403')). Rendered OUTSIDE the framework chrome (on DgAdminOutside, the same blank centered shell
  as login / 404). PURE UI: owns no store / no contract — it only offers a link back home.
-->
<template>
  <DgAdminOutside title="403" subtitle="无访问权限 / Forbidden">
    <div :class="'forbidden-actions'">
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </DgAdminOutside>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DgAdminOutside } from 'dg-cell-mvi-element-plus';

const router = useRouter();
const goHome = () => router.push('/');
</script>

<style scoped>
.forbidden-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
