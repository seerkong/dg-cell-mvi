/**
 * dg-cell-mvi-admin-template · common/commonCrudOptions — app-wide request contract bridge.
 *
 * The limit/offset backend contract used by every CRUD page. `transformQuery` maps the framework's
 * {page,form,sort} into the backend's {page:{limit,offset}, query, sort}; `transformRes` maps the
 * backend's {records,total,limit,offset} back into the framework's {currentPage,pageSize,records,total}.
 * Passed as `commonOptions` to every useCrud (merged UNDER each page's own crudOptions).
 *
 * Adjust the two transforms to match YOUR backend's pagination/response shape — this is the single place
 * the whole app's request/response contract lives, so every CRUD page inherits it.
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
