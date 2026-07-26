/**
 * dg-cell-mvi-crud · logic/reducers — pure reduceCrud(state, event, config) -> {state, effects}.
 *
 * Stage 0+1+2: list (refresh/page/sort/select/setData) + search. Never mutates inputs, never does
 * IO; request work is described as effects. `config` (normalized authoring options) is bound by the
 * store so the reducer can read mode/transforms and build the page query.
 */
import { merge } from 'lodash-es';
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../contract/events';
import { loadColumnsFilterEffect, pageRequestEffect } from '../contract/effects';
import type { CrudState, SortState } from '../contract/state';
import { buildPageQuery } from '../support/buildPageQuery';
import type { NormalizedCrudOptions } from '../support/optionsBuild';
import { reduceForm } from './reducers/form';
import { reduceRemove } from './reducers/remove';
import { reduceDict } from './reducers/dict';
import { reduceEditable } from './reducers/editable';
import { reduceColumnsFilter } from './reducers/columnsFilter';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

/** set list to loading + emit a pageRequest built from the (already-updated) state. */
function refreshFrom<R>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const next: CrudState<R> = { ...state, list: { ...state.list, status: 'loading', error: null } };
  return { state: next, effects: [pageRequestEffect(buildPageQuery(next, config))] };
}

function withPage<R>(state: CrudState<R>, patch: Partial<CrudState<R>['list']['page']>): CrudState<R> {
  return { ...state, list: { ...state.list, page: { ...state.list.page, ...patch } } };
}

export function reduceCrud<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;

  switch (event.type) {
    // ---- list ----
    case CRUD_EVENT.doRefresh: {
      const next = p.goFirstPage ? withPage(state, { currentPage: 1 }) : state;
      return refreshFrom(next, config);
    }
    case CRUD_EVENT.setPage:
      return refreshFrom(withPage(state, { currentPage: Number(p.currentPage) || 1 }), config);
    case CRUD_EVENT.setPageSize:
      return refreshFrom(withPage(state, { pageSize: Number(p.pageSize) || state.list.page.pageSize, currentPage: 1 }), config);
    case CRUD_EVENT.setSort: {
      const hadServerSort = Boolean(state.list.sort?.prop);
      const sort: SortState = p.isServerSort ? { prop: p.prop, order: p.order, asc: p.asc } : {};
      const next: CrudState<R> = { ...state, list: { ...state.list, sort } };
      return p.isServerSort || hadServerSort ? refreshFrom(next, config) : ok(next);
    }
    case CRUD_EVENT.select:
      return ok({ ...state, list: { ...state.list, selectedRowKeys: p.rowKeys || [] } });

    // ---- tabs quick-filter ----
    // set the active tab, reset to page 1, and refetch (same shape as a search submit). The active
    // value is merged into the page query by buildPageQuery (unless it is the all-sentinel).
    case CRUD_EVENT.setActiveTab: {
      const next: CrudState<R> = { ...state, tabs: { ...state.tabs, active: p.value } };
      return refreshFrom(withPage(next, { currentPage: 1 }), config);
    }
    case CRUD_EVENT.setTableData:
      return ok({ ...state, list: { ...state.list, rows: p.rows || [] } });
    case CRUD_EVENT.refreshSucceeded:
      return ok({
        ...state,
        list: {
          ...state.list,
          status: 'ready',
          rows: p.rows || [],
          error: null,
          page: { ...state.list.page, currentPage: p.currentPage, pageSize: p.pageSize, total: p.total },
        },
      });
    case CRUD_EVENT.refreshFailed:
      return ok({ ...state, list: { ...state.list, status: 'error', error: String(p.error ?? '') } });

    // ---- search ----
    case CRUD_EVENT.setSearchField:
      return ok({ ...state, search: { ...state.search, form: { ...state.search.form, [p.key]: p.value } } });
    case CRUD_EVENT.setSearchForm: {
      const base = p.mergeForm === false ? {} : { ...state.search.validatedForm };
      const validatedForm = merge(base, p.form || {});
      const next: CrudState<R> = { ...state, search: { ...state.search, validatedForm, form: { ...validatedForm } } };
      return p.triggerSearch ? refreshFrom(withPage(next, { currentPage: 1 }), config) : ok(next);
    }
    case CRUD_EVENT.doSearch: {
      let next: CrudState<R>;
      if (p.form) {
        const base = p.mergeForm === false ? {} : { ...state.search.validatedForm };
        const validatedForm = merge(base, p.form);
        next = { ...state, search: { ...state.search, validatedForm, form: { ...validatedForm } } };
      } else {
        // commit the live search form to the validated (query) form
        next = { ...state, search: { ...state.search, validatedForm: { ...state.search.form } } };
      }
      if (p.goFirstPage !== false) next = withPage(next, { currentPage: 1 });
      return refreshFrom(next, config);
    }
    case CRUD_EVENT.resetSearch: {
      const initial = { ...config.seed.searchInitialForm };
      const next: CrudState<R> = {
        ...state,
        list: { ...state.list, sort: {} },
        search: { ...state.search, form: { ...initial }, validatedForm: { ...initial } },
      };
      return refreshFrom(withPage(next, { currentPage: 1 }), config);
    }
    case CRUD_EVENT.toggleSearch:
      return ok({ ...state, search: { ...state.search, show: !state.search.show } });

    // ---- toolbar ----
    case CRUD_EVENT.setCompact:
      return ok({ ...state, ui: { ...state.ui, toolbarCompact: Boolean(p.value) } });

    // ---- columns-filter slice (delegated) ----
    case CRUD_EVENT.setColumnsFilter:
    case CRUD_EVENT.resetColumnsFilter:
    case CRUD_EVENT.columnsFilterLoaded:
      return reduceColumnsFilter<R>(state, event, config);
    case CRUD_EVENT.loadColumnsFilter:
      // pure: no state change — the support handler reads storage and re-dispatches columnsFilterLoaded.
      return { state, effects: [loadColumnsFilterEffect()] };

    // ---- remove slice (delegated) ----
    case CRUD_EVENT.doRemove:
    case CRUD_EVENT.removeSucceeded:
    case CRUD_EVENT.removeFailed:
    case CRUD_EVENT.removeAborted:
      return reduceRemove<R>(state, event, config);

    // ---- dict slice (delegated) ----
    case CRUD_EVENT.loadDict:
    case CRUD_EVENT.refreshDict:
    case CRUD_EVENT.invalidateDict:
    case CRUD_EVENT.hydrateDict:
    case CRUD_EVENT.searchDict:
    case CRUD_EVENT.dictLoaded:
    case CRUD_EVENT.dictLoadFailed:
      return reduceDict<R>(state, event, config);

    // ---- editable slice (delegated) ----
    case CRUD_EVENT.editableEnable:
    case CRUD_EVENT.editableDisable:
    case CRUD_EVENT.editableStartRowEdit:
    case CRUD_EVENT.editableStartCellEdit:
    case CRUD_EVENT.editableSetCellValue:
    case CRUD_EVENT.editableUpdateCell:
    case CRUD_EVENT.editableSaveRow:
    case CRUD_EVENT.editableSaveCell:
    case CRUD_EVENT.editableSaveAll:
    case CRUD_EVENT.editableCancelRow:
    case CRUD_EVENT.editableCancelCell:
    case CRUD_EVENT.editableAddRow:
    case CRUD_EVENT.editableRemoveRow:
    case CRUD_EVENT.editableSaveRowSucceeded:
    case CRUD_EVENT.editableSaveRowFailed:
    case CRUD_EVENT.editableSaveCellSucceeded:
    case CRUD_EVENT.editableSaveCellFailed:
      return reduceEditable<R>(state, event, config);

    // ---- form slice (delegated) ----
    case CRUD_EVENT.openAdd:
    case CRUD_EVENT.openEdit:
    case CRUD_EVENT.openView:
    case CRUD_EVENT.openCopy:
    case CRUD_EVENT.setFormField:
    case CRUD_EVENT.setFormData:
    case CRUD_EVENT.doSubmit:
    case CRUD_EVENT.closeForm:
    case CRUD_EVENT.formOpened:
    case CRUD_EVENT.submitSucceeded:
    case CRUD_EVENT.submitFailed:
    case CRUD_EVENT.submitAborted:
    case CRUD_EVENT.asyncComputeResolved:
      return reduceForm<R>(state, event, config);

    default:
      return ok(state);
  }
}
