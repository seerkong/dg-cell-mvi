<!--
  dg-cell-mvi-admin-template · views/404/index.vue — the NotFound page (catch-all target).

  behavior admin.auth route-guards: "catch-all SHALL render 404 page". Rendered OUTSIDE the framework
  chrome (on DgAdminOutside, same blank centered shell as the login page) by the `/:pathMatch(.*)*`
  catch-all route. PURE UI: owns no store / no contract — it only offers links back to home and login.
-->
<template>
  <DgAdminOutside title="404" subtitle="页面不存在 / Page not found">
    <div :class="'nf-actions'">
      <el-button type="primary" @click="goHome">返回首页</el-button>
      <el-button @click="goLogin">去登录</el-button>
    </div>
  </DgAdminOutside>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DgAdminOutside } from 'dg-cell-mvi-element-plus';

const router = useRouter();
const goHome = () => router.push('/');
const goLogin = () => router.push('/login');
</script>

<style scoped>
.nf-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
