<template>
  <div v-if="vm.pagination.show" :class="$style.pagination">
    <el-pagination
      :current-page="vm.pagination.currentPage"
      :page-size="vm.pagination.pageSize"
      :total="vm.pagination.total"
      :page-sizes="vm.pagination.pageSizes"
      layout="total, sizes, prev, pager, next, jumper"
      background
      @current-change="(p: number) => commands.setPage(p)"
      @size-change="(s: number) => commands.setPageSize(s)"
    />
  </div>
</template>

<script setup lang="ts">
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';

defineProps<{ vm: CrudBinding; commands: CrudCommands }>();
</script>

<style module>
.pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
