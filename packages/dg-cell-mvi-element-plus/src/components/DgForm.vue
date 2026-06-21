<template>
  <el-form :model="vm.form.form" label-width="auto" :class="$style.form" @submit.prevent>
    <!-- grouped tabs: one el-tab-pane per group -->
    <el-tabs v-if="layout === 'group-tabs'">
      <el-tab-pane v-for="g in groups" :key="g.name" :label="g.name">
        <el-row :gutter="16">
          <el-col v-for="col in g.items" v-show="col.show" :key="col.key" :span="spanOf(col)">
            <DgFormItem :col="col" :vm="vm" :commands="commands">
              <template v-if="$slots['form_' + col.key]" #default="s">
                <slot :name="'form_' + col.key" v-bind="s" />
              </template>
            </DgFormItem>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <!-- grouped sections: a labelled block per group -->
    <template v-else-if="layout === 'group'">
      <div v-for="g in groups" :key="g.name" :class="$style.group">
        <div :class="$style.groupTitle">{{ g.name }}</div>
        <el-row :gutter="16">
          <el-col v-for="col in g.items" v-show="col.show" :key="col.key" :span="spanOf(col)">
            <DgFormItem :col="col" :vm="vm" :commands="commands">
              <template v-if="$slots['form_' + col.key]" #default="s">
                <slot :name="'form_' + col.key" v-bind="s" />
              </template>
            </DgFormItem>
          </el-col>
        </el-row>
      </div>
    </template>

    <!-- flex-wrap: items size by col.width / col.span, flowing horizontally -->
    <div v-else-if="layout === 'flex'" :class="$style.flex">
      <div
        v-for="col in vm.form.columns"
        v-show="col.show"
        :key="col.key"
        :class="$style.flexItem"
        :style="flexStyle(col)"
      >
        <DgFormItem :col="col" :vm="vm" :commands="commands">
          <template v-if="$slots['form_' + col.key]" #default="s">
            <slot :name="'form_' + col.key" v-bind="s" />
          </template>
        </DgFormItem>
      </div>
    </div>

    <!-- default: stacked grid (el-row/el-col span) -->
    <el-row v-else :gutter="16">
      <el-col v-for="col in vm.form.columns" v-show="col.show" :key="col.key" :span="spanOf(col)">
        <DgFormItem :col="col" :vm="vm" :commands="commands">
          <template v-if="$slots['form_' + col.key]" #default="s">
            <slot :name="'form_' + col.key" v-bind="s" />
          </template>
        </DgFormItem>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgFormItem from './DgFormItem.vue';

type FormItem = CrudBinding['form']['columns'][number];

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

const layout = computed(() => props.vm.form.layout || 'default');

/** group the form columns by their `group` name (preserving first-appearance order). */
const groups = computed(() => {
  const map = new Map<string, { name: string; items: FormItem[] }>();
  for (const col of props.vm.form.columns) {
    const name = (col as any).group || '其他';
    if (!map.has(name)) map.set(name, { name, items: [] });
    map.get(name)!.items.push(col);
  }
  return Array.from(map.values());
});

function spanOf(col: FormItem): number {
  return (col.col && col.col.span) || 24;
}

function flexStyle(col: FormItem): Record<string, string> {
  const w = col.col && (col.col.width as number | string | undefined);
  const basis = w != null ? (typeof w === 'number' ? `${w}px` : w) : '260px';
  return { flexBasis: basis };
}
</script>

<style module>
.form {
  padding: 4px 8px 0;
}
.group {
  margin-bottom: 8px;
}
.groupTitle {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary, #303133);
  border-left: 3px solid var(--el-color-primary, #409eff);
  padding-left: 8px;
  margin: 4px 0 12px;
}
.flex {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
}
.flexItem {
  flex: 1 1 auto;
  min-width: 200px;
}
</style>
