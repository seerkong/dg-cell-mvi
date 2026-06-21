/**
 * dg-cell-mvi-admin-element-plus · common/commonCrudOptions — app-wide request contract bridge.
 *
 * Verbatim port of the reference admin's commonOptions: the limit/offset backend contract used by every
 * mock page. `transformQuery` maps the framework's {page,form,sort} into the backend's
 * {page:{limit,offset}, query, sort}; `transformRes` maps the backend's {records,total,limit,offset}
 * back into the framework's {currentPage,pageSize,records,total}. Passed as `commonOptions` to every
 * useCrud (merged under the page's own crudOptions in optionsBuild).
 */
import type { CrudOptions, PageQuery } from 'dg-cell-mvi-element-plus';

const commonOptions: CrudOptions = {
  request: {
    transformQuery: ({ page, form, sort }: PageQuery) => ({
      page: {
        limit: page.pageSize,
        offset: page.pageSize * (page.currentPage - 1),
      },
      query: form,
      sort,
    }),
    transformRes: ({ res }: { res: any; query: any }) => ({
      currentPage: res.offset / res.limit + 1,
      pageSize: res.limit,
      records: res.records,
      total: res.total,
    }),
  },
};

export default commonOptions;
