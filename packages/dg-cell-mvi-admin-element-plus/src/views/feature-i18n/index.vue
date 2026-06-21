<template>
  <div>
    <div :class="$style.bar">
      <span :class="$style.tip">
        注入 translator 本地化框架内置 chrome（新增/查看/编辑/删除/刷新/列设置/取消/保存）。
      </span>
      <el-radio-group v-model="locale" size="small">
        <el-radio-button label="zh">中文</el-radio-button>
        <el-radio-button label="en">EN</el-radio-button>
      </el-radio-group>
    </div>
    <!-- :key remounts useCrud with the new translator captured when the locale flips. -->
    <I18nCrud :key="locale" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import I18nCrud from './I18nCrud.vue';

// the active locale; 'en' localizes the framework chrome, 'zh' keeps the default Chinese.
const locale = ref<'zh' | 'en'>('en');
</script>

<style module>
.bar { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.tip { color: var(--el-text-color-secondary, #909399); font-size: 13px; }
</style>
