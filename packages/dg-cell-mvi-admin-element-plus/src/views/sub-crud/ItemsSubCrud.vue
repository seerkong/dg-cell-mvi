<template>
  <div :class="$style.sub">
    <div :class="$style.bar">
      <span :class="$style.title">订单 #{{ orderId }} 明细</span>
      <el-button size="small" type="primary" @click="commands.editableAddRow({ row: { orderId } })">
        + 新增明细
      </el-button>
    </div>
    <DgCrud :crud-binding="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import commonOptions from '../../common/commonCrudOptions';
import * as api from './api';

const props = defineProps<{ orderId: number }>();

/**
 * A child editable sub-CRUD bound to one parent order. It has its OWN store + api (items filtered by
 * orderId) and inline row-editing — created when the parent row expands, disposed when it collapses.
 */
const { crudBinding, commands } = useCrud({
  commonOptions,
  createCrudOptions: () => ({
    crudOptions: {
      request: {
        pageRequest: async (q: any) =>
          api.GetItems({ page: q.page, query: { ...(q.query || {}), orderId: props.orderId }, sort: q.sort }),
        delRequest: async ({ row }: { row: any }) => api.DelItem(row.id),
      },
      pagination: { show: false, pageSize: 100 },
      search: { show: false },
      rowHandle: { show: false },
      table: {
        editable: {
          enabled: true,
          mode: 'row',
          exclusive: true,
          updateRow: async ({ row, isAdd }: { row: any; isAdd: boolean }) =>
            isAdd ? api.AddItem({ ...row, orderId: props.orderId }) : api.UpdateItem(row),
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        product: {
          title: '商品',
          column: { width: 200 },
          form: { rules: [{ required: true, message: '请输入商品' }] },
        },
        qty: { title: '数量', type: 'number', column: { width: 130 } },
        price: { title: '单价', type: 'number', column: { width: 130 } },
      },
    },
  }),
});
</script>

<style module>
.sub {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--el-bg-color, #fff);
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.title {
  font-weight: 600;
  font-size: 13px;
}
</style>
