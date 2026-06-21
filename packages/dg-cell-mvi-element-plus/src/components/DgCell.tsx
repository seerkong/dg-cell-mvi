/**
 * dg-cell-mvi-element-plus · DgCell — table cell renderer (read-only label + inline-edit control).
 *
 * Read mode: if the column carries a dict, resolve the cell value to its label(s) via
 * `getNodesFromDataMap` (array cells join their labels); else a formatter, else the plain value.
 *
 * Edit mode: when `editable.rowStates[rowId].editing[col.key]` is set, render the column's form
 * control (from `editable.columns[col.key]`) via DgComponentRender, bound to the row's `draft` value
 * (`editableSetCellValue`). In `cell` mode a non-editing editable cell is click-to-edit, and the
 * control saves on blur / Enter (`editableSaveCell`). Per-cell validation errors render beneath.
 */
import { computed, defineComponent, h, type PropType } from 'vue';
import {
  type DictSlice,
  type ResolvedTableColumn,
  type TableEditableBinding,
} from 'dg-cell-mvi-crud';

import type { CrudCommands } from 'dg-cell-mvi-vue';
import { resolveCellProps, resolveCellText } from 'dg-cell-mvi-vue';
import DgComponentRender from './DgComponentRender';

export default defineComponent({
  name: 'DgCell',
  props: {
    /** The resolved table column (carries key + raw column config incl. optional `dict`). */
    col: { type: Object as PropType<ResolvedTableColumn>, required: true },
    /** The row record. */
    row: { type: Object as PropType<Record<string, any>>, required: true },
    /** The row index in the current page. */
    index: { type: Number, default: 0 },
    /** The runtime dict slice (value→label maps), keyed by dictId/column key. */
    dict: { type: Object as PropType<DictSlice>, default: () => ({}) },
    /** The table's inline-editing binding (enables edit-control rendering). */
    editable: { type: Object as PropType<TableEditableBinding | undefined>, default: undefined },
    /** The row primary-key field name (to resolve a row's id from the record). */
    rowKey: { type: String, default: 'id' },
    /** Commands (edit-cell value/save). */
    commands: { type: Object as PropType<CrudCommands | undefined>, default: undefined },
  },
  setup(props) {
    const rowId = computed(() => props.row?.[props.rowKey]);
    /**
     * Per-row sync compute resolution (scope = {row,index,value}). The projector passes column compute
     * markers (e.g. `column.show = compute(({row}) => …)`) through untouched — they can only be
     * evaluated here, where the row is known. `resolveCompute` is the pure deep-walk that substitutes
     * every ComputeValue with its result; we read the cell value/formatter/`show` off the resolved copy.
     */
    const resolvedProps = computed<Record<string, any>>(() =>
      resolveCellProps(props.col, props.row, props.index),
    );
    /** a column whose resolved `show` is false hides this cell's content for this row. */
    const cellHidden = computed(() => resolvedProps.value?.show === false);
    const rowState = computed(() => props.editable?.rowStates?.[String(rowId.value)]);
    const editItem = computed(() => props.editable?.columns?.[props.col.key]);
    const errMsg = computed(() => rowState.value?.errors?.[props.col.key]);
    /**
     * A read-only column never becomes editable (port of the reference crud `column.editable` readonly/
     * disabled, or whole-table `editable.readonly`). The projector already excludes its edit control
     * + marks it in `readonlyColumns`; we also guard here so it renders the static display even while
     * sibling cells edit. (Whole-table readonly drops every column's edit control too.)
     */
    const isReadonlyCol = computed(
      () => !!props.editable?.readonly || !!props.editable?.readonlyColumns?.[props.col.key],
    );
    /** is this an editable column at all (cell-mode click-to-edit affordance / free-mode always-on)? */
    const isEditableCol = computed(
      () => !!props.editable?.enabled && !isReadonlyCol.value && !!editItem.value,
    );
    const isFree = computed(() => props.editable?.mode === 'free');
    /** free mode: every editable cell is always in edit; else driven by the row's editing map. */
    const isEditing = computed(
      () =>
        !isReadonlyCol.value &&
        ((isFree.value && isEditableCol.value) || !!rowState.value?.editing?.[props.col.key]),
    );
    /** the bound value: the draft when this cell has one, else the row's stored value (free mode). */
    const draftValue = computed(() => {
      const d = rowState.value?.draft;
      if (d && props.col.key in d) return d[props.col.key];
      return props.row?.[props.col.key];
    });

    // read-mode display text (formatter → dict label(s) → plain value). Delegated to the shared
    // resolver (support/cellResolve) so the alternative list renderers (virtual/card) resolve cells
    // identically. `resolvedProps` is the already-compute-resolved props (passed to avoid re-resolving).
    const text = computed<string>(() =>
      resolveCellText(props.col, props.row, props.index, props.dict, resolvedProps.value),
    );

    function save() {
      props.commands?.editableSaveCell({ rowId: rowId.value, index: props.index, key: props.col.key });
    }

    return () => {
      // ---- compute: cell hidden for this row (column.show resolved to false) ----
      if (cellHidden.value) {
        return h('span');
      }

      // ---- cell render hook (column.cellRender) ----
      // a custom cell renderer replaces the default cell content. It is the opaque fn ref the
      // projector passed through; CALL it here (the Vue layer) with the per-row scope. Honored only
      // when this cell is not being inline-edited — the edit control below still wins in edit mode.
      const cellRender = (props.col as any).cellRender as ((scope: any) => any) | undefined;
      if (typeof cellRender === 'function' && !(isEditing.value && editItem.value)) {
        return cellRender({
          row: props.row,
          index: props.index,
          value: props.row?.[props.col.key],
          key: props.col.key,
        });
      }

      // ---- edit control ----
      if (isEditing.value && editItem.value) {
        const comp = (editItem.value.component || {}) as Record<string, any>;
        const { name, options, ...rest } = comp;
        const cellMode = props.editable?.mode === 'cell';
        const listeners: Record<string, any> = {};
        if (cellMode) {
          listeners.onBlur = save;
          listeners.onKeyup = (e: KeyboardEvent) => {
            if (e.key === 'Enter') save();
          };
        }
        return h('div', { class: 'fs-cell-edit' }, [
          h(DgComponentRender, {
            name,
            options,
            props: { size: 'small', ...(cellMode ? { autofocus: true } : {}), ...rest },
            modelValue: draftValue.value,
            'onUpdate:modelValue': (v: any) =>
              props.commands?.editableSetCellValue({ rowId: rowId.value, key: props.col.key, value: v }),
            ...listeners,
          }),
          errMsg.value
            ? h(
                'div',
                {
                  class: 'fs-cell-edit-err',
                  style: 'color:var(--el-color-danger,#f56c6c);font-size:12px;line-height:1.4',
                },
                errMsg.value,
              )
            : null,
        ]);
      }

      // ---- cell mode: trigger-to-edit affordance on editable columns ----
      // the activation gesture is configurable:
      // 'click' (default) or 'dblclick'. We bind the matching DOM handler.
      if (isEditableCol.value && props.editable?.mode === 'cell') {
        const startEdit = () =>
          props.commands?.editableStartCellEdit({
            rowId: rowId.value,
            index: props.index,
            key: props.col.key,
          });
        const dbl = props.editable?.activeTrigger === 'dblclick';
        return h(
          'span',
          {
            class: 'fs-cell-editable',
            style:
              'cursor:pointer;border-bottom:1px dashed var(--el-border-color,#dcdfe6);padding-bottom:1px',
            title: dbl ? '双击编辑' : '点击编辑',
            ...(dbl ? { onDblclick: startEdit } : { onClick: startEdit }),
          },
          text.value || '—',
        );
      }

      // ---- plain read-only ----
      return h('span', text.value);
    };
  },
});
