/**
 * dg-cell-mvi-crud · support/buildPageQuery — pure query assembly.
 *
 * Port of the reference crud's CrudExpose.buildPageQuery: { page, form: cloneDeep(search.validatedForm),
 * sort } then request.transformQuery if present. Called from the reducer when emitting the
 * pageRequest effect, so the query snapshots state at dispatch time (pull-at-query-time semantics).
 *
 * The tabs quick-filter is merged in HERE (the single query-assembly point), additively over the
 * search form: when a tabs bar is configured AND its active value is not the no-filter sentinel
 * (config.tabs.allValue, default TABS_ALL), `{ [config.tabs.name]: active }` is added to `form` so it
 * flows through transformQuery exactly like a search field. The all-sentinel adds nothing. The search
 * form wins on key collision (assigned last) so an explicit search value is never clobbered.
 *
 * Search `valueResolve` runs HERE too, AFTER the search
 * form is assembled but BEFORE transformQuery — the single point where the search form becomes a
 * query param. For each searchable column with a `valueResolve`, the resolver receives
 * `{ form, key, value }`: it may MUTATE `form` (add/replace query keys — e.g. split a daterange into
 * `startTime`/`endTime`) and/or RETURN a replacement value for `key` (written back at `key`). Sync
 * only (a Promise return is ignored). Additive: no resolver → the form flows through verbatim. The
 * resolver mutates the cloned `form` (never `state.search.validatedForm`), keeping the reducer pure.
 */
import { cloneDeep, get, set } from 'lodash-es';

import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';

export function buildPageQuery<R = any>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): any {
  const page = {
    currentPage: state.list.page.currentPage,
    pageSize: state.list.page.pageSize,
  };
  const searchForm = cloneDeep(state.search.validatedForm || {});
  // merge the tabs quick-filter additively: tab filter first, search form last (search wins on collision).
  const tabsFilter: Record<string, any> = {};
  const tabs = config.tabs;
  if (tabs && state.tabs.active !== tabs.allValue) {
    tabsFilter[tabs.name] = state.tabs.active;
  }
  const form: Record<string, any> = { ...tabsFilter, ...searchForm };

  // search valueResolve: transform each searchable field before it becomes a query param. The
  // resolver may mutate `form` (add/replace keys) and/or return a replacement for `key`. Sync only.
  for (const col of config.columns) {
    const resolve = col.search?.valueResolve;
    if (!col.search?.show || typeof resolve !== 'function') continue;
    const key = col.key;
    const res = resolve({ form, key, value: get(form, key) });
    if (res !== undefined && !(res instanceof Promise)) {
      set(form, key, res);
    }
  }

  const sort = state.list.sort || {};
  const query = { page, form, sort };
  if (config.request.transformQuery) {
    return config.request.transformQuery(query as any);
  }
  return query;
}
