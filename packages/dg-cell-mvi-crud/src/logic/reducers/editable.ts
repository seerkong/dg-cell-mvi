/**
 * dg-cell-mvi-crud · logic/reducers/editable — pure inline-edit lifecycle.
 *
 * Port of the reference crud's `use-editable` as a pure reducer over an immutable `editable` slice. Handles
 * enable/disable, start/cancel of row + cell edits, per-cell draft updates, save (local merge or an
 * `api` effect), add/remove of (unsaved) rows, and the exclusive single-active-cell discipline.
 * Validation reuses the form columns' rules via `pickFormColumns` + `validateForm` — never does IO.
 *
 * Modes: `row` (whole row editable, save/cancel buttons), `cell` (one active cell, save on blur /
 * on exclusive switch), `free` (multiple cells at once — same primitives, no exclusivity). Persist:
 * `local` mutates the in-memory rows immutably; `api` emits an effect that re-dispatches success/fail.
 */
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import {
  editableUpdateCellEffect,
  editableUpdateRowEffect,
  notifyEffect,
} from '../../contract/effects';
import type { CrudState, EditableRowState } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';
import { pickFormColumns } from '../projectors/form';
import { validateForm, type ValidatableColumn } from '../../support/validate';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

function emptyRowState(): EditableRowState {
  return { isAdd: false, editing: {}, draft: {}, original: {}, errors: {}, loading: false };
}

function withEditable<R>(state: CrudState<R>, patch: Partial<CrudState<R>['editable']>): CrudState<R> {
  return { ...state, editable: { ...state.editable, ...patch } };
}

/** Replace a row's edit-state wholesale (used when (re)entering edit on a row). */
function setRowState<R>(state: CrudState<R>, rowId: any, rs: EditableRowState): CrudState<R> {
  return withEditable(state, {
    rowStates: { ...state.editable.rowStates, [String(rowId)]: rs },
  });
}

/** Merge a partial edit-state into a row (nested maps merge, not replace) — used for per-cell edits. */
function patchRowState<R>(
  state: CrudState<R>,
  rowId: any,
  patch: Partial<EditableRowState>,
): CrudState<R> {
  const key = String(rowId);
  const cur = state.editable.rowStates[key] ?? emptyRowState();
  const merged: EditableRowState = {
    ...cur,
    ...patch,
    editing: { ...cur.editing, ...(patch.editing || {}) },
    draft: { ...cur.draft, ...(patch.draft || {}) },
    original: { ...cur.original, ...(patch.original || {}) },
    errors: patch.errors !== undefined ? patch.errors : cur.errors,
  };
  return setRowState(state, rowId, merged);
}

/** Drop a row's entire edit-state (save/cancel of a whole row). */
function clearRow<R>(state: CrudState<R>, rowId: any): CrudState<R> {
  const rowStates = { ...state.editable.rowStates };
  delete rowStates[String(rowId)];
  let activeKey = state.editable.activeKey;
  if (activeKey && activeKey.startsWith(`${rowId}::`)) activeKey = null;
  return withEditable(state, { rowStates, activeKey });
}

/** Drop one cell from a row's edit-state (deleting the row-state when it becomes empty). */
function clearCell<R>(state: CrudState<R>, rowId: any, cellKey: string): CrudState<R> {
  const key = String(rowId);
  const cur = state.editable.rowStates[key];
  if (!cur) return state;
  const editing = { ...cur.editing };
  delete editing[cellKey];
  const draft = { ...cur.draft };
  delete draft[cellKey];
  const original = { ...cur.original };
  delete original[cellKey];
  const errors = { ...cur.errors };
  delete errors[cellKey];
  const rowStates = { ...state.editable.rowStates };
  if (Object.keys(editing).length === 0) delete rowStates[key];
  else rowStates[key] = { ...cur, editing, draft, original, errors };
  let activeKey = state.editable.activeKey;
  if (activeKey === `${rowId}::${cellKey}`) activeKey = null;
  return withEditable(state, { rowStates, activeKey });
}

function findRowIndexById<R>(state: CrudState<R>, rowId: any, rowKey: string): number {
  return state.list.rows.findIndex((r: any) => String(r?.[rowKey]) === String(rowId));
}

/** Splice a row out of the list + drop its edit-state (used for removing/cancelling unsaved adds). */
function removeRowAt<R>(state: CrudState<R>, rowId: any, index: number): ReduceResult<CrudState<R>> {
  const rows = state.list.rows.slice();
  if (index >= 0 && index < rows.length) rows.splice(index, 1);
  const next = clearRow({ ...state, list: { ...state.list, rows } }, rowId);
  return ok(next);
}

/**
 * May this cell be edited? Gates, in order: (a) whole-table `editable.readonly` blocks every cell;
 * (b) per-column read-only (`column.editable` disabled/readonly, or `editable: false`) blocks that
 * column; (c) the `editable.isEditable` predicate (default allow). A blocked cell is never seeded
 * into an edit buffer — it renders the static display while other cells edit.
 */
function cellAllowed<R>(
  config: NormalizedCrudOptions<R>,
  key: string,
  row: any,
  index: number,
): boolean {
  if (config.editable.readonly) return false;
  if (config.columnsMap[key]?.editableReadonly) return false;
  const fn = config.editable.isEditable;
  return fn ? fn({ key, row, index }) !== false : true;
}

/** Build the ValidatableColumn[] for a set of keys from the per-mode form columns. */
function validatableFor<R>(
  config: NormalizedCrudOptions<R>,
  mode: 'add' | 'edit',
  keys: string[],
): ValidatableColumn[] {
  const set = new Set(keys);
  return pickFormColumns(config, mode)
    .filter((fc) => set.has(fc.key))
    .map((fc) => ({
      key: fc.key,
      title: fc.item.title ?? fc.column.title,
      rules: fc.item.rules,
      show: true,
    }));
}

/** Save a whole row: validate editing cells, then merge locally or emit an api effect. */
function saveRowPure<R>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
  rowId: any,
  index: number,
): ReduceResult<CrudState<R>> {
  const row = state.list.rows[index] as any;
  const rs = state.editable.rowStates[String(rowId)];
  if (!row || !rs) return ok(state);

  const editingKeys = Object.keys(rs.editing).filter((k) => rs.editing[k]);
  const merged = { ...row, ...rs.draft };
  const { valid, errors } = validateForm(
    merged,
    validatableFor(config, rs.isAdd ? 'add' : 'edit', editingKeys),
  );
  if (!valid) return ok(patchRowState(state, rowId, { errors }));

  if (config.editable.persistType === 'api') {
    return {
      state: patchRowState(state, rowId, { loading: true, errors: {} }),
      effects: [editableUpdateRowEffect({ rowId, index, row: merged, isAdd: rs.isAdd })],
    };
  }
  // local persist: merge the draft into the in-memory row, drop edit-state.
  const rows = state.list.rows.slice();
  rows[index] = merged;
  const next = clearRow({ ...state, list: { ...state.list, rows } }, rowId);
  return { state: next, effects: [notifyEffect({ kind: 'success', message: '保存成功' })] };
}

/** Save one cell: validate it, then merge locally or emit an api effect. */
function saveCellPure<R>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
  rowId: any,
  index: number,
  cellKey: string,
): ReduceResult<CrudState<R>> {
  const row = state.list.rows[index] as any;
  const rs = state.editable.rowStates[String(rowId)];
  if (!row || !rs) return ok(state);
  // nothing edited in this cell → just close it.
  if (!(cellKey in rs.draft)) return ok(clearCell(state, rowId, cellKey));

  const value = rs.draft[cellKey];
  const merged = { ...row, [cellKey]: value };
  const { valid, errors } = validateForm(merged, validatableFor(config, 'edit', [cellKey]));
  const nextErrors = { ...rs.errors };
  delete nextErrors[cellKey];
  if (!valid) {
    nextErrors[cellKey] = errors[cellKey];
    return ok(patchRowState(state, rowId, { errors: nextErrors }));
  }

  if (config.editable.persistType === 'api') {
    return {
      state: patchRowState(state, rowId, { loading: true, errors: nextErrors }),
      effects: [editableUpdateCellEffect({ rowId, index, key: cellKey, value, row: merged })],
    };
  }
  const rows = state.list.rows.slice();
  rows[index] = merged;
  const next = clearCell({ ...state, list: { ...state.list, rows } }, rowId, cellKey);
  return ok(next);
}

export function reduceEditable<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;
  const rowKey = config.table.rowKey;

  switch (event.type) {
    // ---- enable / disable ----
    case CRUD_EVENT.editableEnable:
      return ok(
        withEditable(state, {
          enabled: true,
          mode: p.mode ?? state.editable.mode,
          exclusive: p.exclusive ?? state.editable.exclusive,
          exclusiveEffect: p.exclusiveEffect ?? state.editable.exclusiveEffect,
          activeDefault: p.activeDefault ?? state.editable.activeDefault,
          readonly: p.readonly ?? state.editable.readonly,
          activeTrigger: p.activeTrigger ?? state.editable.activeTrigger,
        }),
      );
    case CRUD_EVENT.editableDisable:
      return ok(withEditable(state, { enabled: false, rowStates: {}, activeKey: null }));

    // ---- row edit ----
    case CRUD_EVENT.editableStartRowEdit: {
      const { rowId, index } = p;
      const row = state.list.rows[index] as any;
      if (!row) return ok(state);
      const editing: Record<string, boolean> = {};
      const draft: Record<string, any> = {};
      const original: Record<string, any> = {};
      for (const fc of pickFormColumns(config, 'edit')) {
        if (!cellAllowed(config, fc.key, row, index)) continue;
        editing[fc.key] = true;
        draft[fc.key] = row[fc.key];
        original[fc.key] = row[fc.key];
      }
      const rs: EditableRowState = { isAdd: false, editing, draft, original, errors: {}, loading: false };
      // exclusive: drop other rows' edit-state (cancel), keeping only this row.
      const base = state.editable.exclusive ? {} : { ...state.editable.rowStates };
      return ok(withEditable(state, { rowStates: { ...base, [String(rowId)]: rs }, activeKey: null }));
    }

    case CRUD_EVENT.editableSaveRow:
      return saveRowPure(state, config, p.rowId, Number(p.index));

    case CRUD_EVENT.editableCancelRow: {
      const rs = state.editable.rowStates[String(p.rowId)];
      if (rs?.isAdd) return removeRowAt(state, p.rowId, Number(p.index));
      return ok(clearRow(state, p.rowId));
    }

    case CRUD_EVENT.editableSaveRowSucceeded: {
      const { rowId, index, row } = p;
      const rows = state.list.rows.slice() as any[];
      if (index >= 0 && index < rows.length) rows[index] = { ...rows[index], ...(row || {}) };
      const next = clearRow({ ...state, list: { ...state.list, rows } }, rowId);
      return { state: next, effects: [notifyEffect({ kind: 'success', message: '保存成功' })] };
    }
    case CRUD_EVENT.editableSaveRowFailed: {
      const cur = state.editable.rowStates[String(p.rowId)];
      return {
        state: patchRowState(state, p.rowId, {
          loading: false,
          errors: { ...(cur?.errors || {}), _global: String(p.error ?? '保存失败') },
        }),
        effects: [notifyEffect({ kind: 'error', message: String(p.error ?? '保存失败') })],
      };
    }

    // ---- cell edit ----
    case CRUD_EVENT.editableStartCellEdit: {
      const { rowId, index, key } = p;
      const row = state.list.rows[index] as any;
      if (!row) return ok(state);
      if (!cellAllowed(config, key, row, index)) return ok(state);

      let res: ReduceResult<CrudState<R>> = { state, effects: [] };
      const prev = state.editable.activeKey;
      const newKey = `${rowId}::${key}`;
      if (state.editable.exclusive && prev && prev !== newKey) {
        const sep = prev.lastIndexOf('::');
        const pRowId = prev.slice(0, sep);
        const pKey = prev.slice(sep + 2);
        const pIndex = findRowIndexById(state, pRowId, rowKey);
        res =
          state.editable.exclusiveEffect === 'save' && pIndex >= 0
            ? saveCellPure(state, config, pRowId, pIndex, pKey)
            : { state: clearCell(state, pRowId, pKey), effects: [] };
      }
      let next = patchRowState(res.state, rowId, {
        editing: { [key]: true },
        draft: { [key]: row[key] },
        original: { [key]: row[key] },
      });
      next = withEditable(next, { activeKey: newKey });
      return { state: next, effects: res.effects };
    }

    case CRUD_EVENT.editableSetCellValue:
      // mark the cell editing too, so free-mode batch-save knows which cells to validate.
      return ok(patchRowState(state, p.rowId, { draft: { [p.key]: p.value }, editing: { [p.key]: true } }));

    case CRUD_EVENT.editableUpdateCell: {
      // programmatic update-cell (MVI counterpart of getEditableCell().setValue). Resolve the rowId
      // from the explicit rowId or from the index (via rowKey); skip read-only columns (never an
      // edit buffer field). Otherwise identical to editableSetCellValue — pure into the draft buffer.
      let rowId = p.rowId;
      if (rowId == null && p.index != null) {
        const row = state.list.rows[Number(p.index)] as any;
        rowId = row?.[rowKey];
      }
      if (rowId == null) return ok(state);
      const row = state.list.rows.find((r: any) => String(r?.[rowKey]) === String(rowId)) as any;
      if (row && !cellAllowed(config, p.colKey, row, 0)) return ok(state);
      return ok(
        patchRowState(state, rowId, {
          draft: { [p.colKey]: p.value },
          editing: { [p.colKey]: true },
        }),
      );
    }

    case CRUD_EVENT.editableSaveCell:
      return saveCellPure(state, config, p.rowId, Number(p.index), p.key);

    case CRUD_EVENT.editableSaveAll: {
      // free/batch mode: save every dirty row (one that has edit-state), accumulating effects.
      let cur = state;
      const effects: NonNullable<ReduceResult<CrudState<R>>['effects']> = [];
      for (const ridStr of Object.keys(state.editable.rowStates)) {
        const index = findRowIndexById(cur, ridStr, rowKey);
        if (index < 0) continue;
        const res = saveRowPure(cur, config, ridStr, index);
        cur = res.state;
        if (res.effects) effects.push(...res.effects);
      }
      return { state: cur, effects };
    }

    case CRUD_EVENT.editableCancelCell:
      return ok(clearCell(state, p.rowId, p.key));

    case CRUD_EVENT.editableSaveCellSucceeded: {
      const { rowId, index, key, value, row } = p;
      const rows = state.list.rows.slice() as any[];
      if (index >= 0 && index < rows.length) {
        rows[index] = row ? { ...rows[index], ...row } : { ...rows[index], [key]: value };
      }
      const next = clearCell({ ...state, list: { ...state.list, rows } }, rowId, key);
      return { state: next, effects: [notifyEffect({ kind: 'success', message: '保存成功' })] };
    }
    case CRUD_EVENT.editableSaveCellFailed: {
      const cur = state.editable.rowStates[String(p.rowId)];
      return {
        state: patchRowState(state, p.rowId, {
          loading: false,
          errors: { ...(cur?.errors || {}), [p.key]: String(p.error ?? '保存失败') },
        }),
        effects: [notifyEffect({ kind: 'error', message: String(p.error ?? '保存失败') })],
      };
    }

    // ---- add / remove ----
    case CRUD_EVENT.editableAddRow: {
      const seq = state.editable.newRowSeq;
      const newId = seq;
      const base: Record<string, any> = { [rowKey]: newId, ...(p.row || {}) };
      const editing: Record<string, boolean> = {};
      const draft: Record<string, any> = {};
      const original: Record<string, any> = {};
      for (const fc of pickFormColumns(config, 'add')) {
        const seedVal = base[fc.key] ?? fc.item.value ?? undefined;
        base[fc.key] = seedVal;
        // a read-only column shows its value but is never an edit buffer field.
        if (!cellAllowed(config, fc.key, base, 0)) continue;
        editing[fc.key] = true;
        draft[fc.key] = seedVal;
        original[fc.key] = undefined;
      }
      const rs: EditableRowState = { isAdd: true, editing, draft, original, errors: {}, loading: false };
      const rows = [base, ...(state.list.rows as any[])];
      return ok({
        ...state,
        list: { ...state.list, rows: rows as any },
        editable: {
          ...state.editable,
          newRowSeq: seq - 1,
          rowStates: { ...state.editable.rowStates, [String(newId)]: rs },
          activeKey: null,
        },
      });
    }

    case CRUD_EVENT.editableRemoveRow:
      return removeRowAt(state, p.rowId, Number(p.index));

    default:
      return ok(state);
  }
}
