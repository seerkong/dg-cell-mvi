<template>
  <el-row :gutter="12" :class="$style.wrap">
    <el-col :span="13">
      <div :class="$style.title">订单（父）— 点击行查看明细</div>
      <DgCrud :crud-binding="orderBinding" :commands="orderCommands" :on-row-click="onSelectOrder" />
    </el-col>
    <el-col :span="11">
      <div :class="$style.title">
        明细（子 · 独立 api）<span v-if="currentOrder">— {{ currentOrder.orderNo }}</span>
      </div>
      <el-empty v-if="currentOrderId == null" description="← 点击左侧订单查看 / 管理其明细" :image-size="70" />
      <DgCrud v-else :crud-binding="itemBinding" :commands="itemCommands" />
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createOrderCrud from './order';
import createItemCrud from './item';
import commonOptions from '../../common/commonCrudOptions';

const currentOrderId = ref<number | null>(null);
const currentOrder = ref<any>(null);

// destructure so the refs are top-level in setup (auto-unwrapped in the template).
const { crudBinding: orderBinding, commands: orderCommands } = useCrud({
  createCrudOptions: createOrderCrud,
  commonOptions,
});
const { crudBinding: itemBinding, commands: itemCommands } = useCrud({
  createCrudOptions: createItemCrud(() => currentOrderId.value),
  commonOptions,
  immediate: false,
});

function onSelectOrder(row: any) {
  currentOrder.value = row;
  currentOrderId.value = row.id;
  itemCommands.doRefresh({ goFirstPage: true });
}
</script>

<style module>
.wrap {
  height: 100%;
}
.title {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 8px;
}
</style>
