<template>
  <div>
    <div :class="$style.bar">
      <span :class="$style.tip">
        注入 permission 谓词过滤动作按钮：删除(role:delete)/导出(role:export)/新增(role:add)。
      </span>
      <el-radio-group v-model="role" size="small">
        <el-radio-button label="viewer">访客(viewer)</el-radio-button>
        <el-radio-button label="admin">管理员(admin)</el-radio-button>
      </el-radio-group>
    </div>
    <div :class="$style.tip2">
      当前角色 <b>{{ role }}</b>：{{ role === 'admin' ? '全部按钮可见' : '删除/导出/新增按钮被隐藏(仅查看/编辑/刷新)' }}
    </div>
    <!-- :key remounts useCrud with the new predicate captured when the role flips. -->
    <PermissionCrud :key="role" :role="role" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PermissionCrud from './PermissionCrud.vue';

// the injected role; 'admin' grants everything, 'viewer' denies role:delete / role:export / role:add.
const role = ref<'viewer' | 'admin'>('viewer');
</script>

<style module>
.bar { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
.tip { color: var(--el-text-color-secondary, #909399); font-size: 13px; }
.tip2 { margin-bottom: 10px; color: var(--el-text-color-secondary, #909399); font-size: 13px; }
</style>
