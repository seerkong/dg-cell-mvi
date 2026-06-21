<template>
  <div>
    <div :class="$style.bar">
      <el-button type="primary" @click="bumpFirstAge">第 1 行 +1 岁（程序化 update-cell）</el-button>
      <el-button @click="setSecondLeave">第 2 行 设为「离职」（按 index）</el-button>
      <span :class="$style.hint">
        双击「姓名 / 年龄 / 状态」就地编辑（activeTrigger: dblclick）；「员工编号」「部门」为只读列，可见但不可编辑；
        上方按钮通过 editableUpdateCell 程序化写入草稿
      </span>
    </div>
    <DgCrud :crud-binding="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { i18nPort } from '../../i18n';

// localize the crud built-in chrome (incl. the editable inline-row action column) through the GLOBAL
// chassis I18nPort. LayoutFramework re-keys the view on locale so useCrud re-projects in the new language.
const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions, i18n: i18nPort });

/** Programmatically bump the first row's age via the update-cell command (identified by rowId). */
function bumpFirstAge() {
  const row = crudBinding.value.table.rows[0];
  if (!row) return;
  commands.editableUpdateCell({ rowId: row.id, colKey: 'age', value: (row.age ?? 0) + 1 });
}

/** Programmatically set the SECOND row's status via the update-cell command (identified by index). */
function setSecondLeave() {
  commands.editableUpdateCell({ index: 1, colKey: 'status', value: 'leave' });
}
</script>

<style module>
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.hint {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
</style>
