<template>
  <div>
    <p :class="$style.hint">
      点击每行左侧的展开箭头 → 该订单的明细子表（独立 api，按 orderId 加载；行内编辑：编辑 / 保存 / 新增明细 / 删除）
    </p>
    <DgCrud :crud-binding="crudBinding" :commands="commands">
      <template #expand="{ row }">
        <ItemsSubCrud :order-id="row.id" />
      </template>
    </DgCrud>
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import ItemsSubCrud from './ItemsSubCrud.vue';

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>

<style module>
.hint {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
  margin: 0 0 10px;
}
</style>
