import type { CrudCommands, CrudOptions } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-plugins demo — build-time settings.plugins transforms (Feature B).
 *
 * Two plugins run once over crudOptions at normalization (in array order, before the defaults merge):
 *  - `inject-createdAt` ADDS a read-only `createdAt` column (the authored columns below never declare
 *    it) — so the table/form gain a column purely from a plugin.
 *  - `default-pagesize` sets pagination.pageSize when unset (a "set defaults" plugin).
 *  - a disabled plugin (`enabled:false`) demonstrates skipping (it would add a bogus column).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ({ commands }: { commands: CrudCommands }) {
  return {
    crudOptions: {
      request: {
        pageRequest: async (query: any) => api.GetList(query),
        addRequest: async ({ form }: { form: Record<string, any> }) => api.AddObj(form),
        editRequest: async ({ form, row }: { form: Record<string, any>; row: any }) => {
          form.id = row.id;
          return api.UpdateObj(form);
        },
        delRequest: async ({ row }: { row: any }) => api.DelObj(row.id),
      },
      settings: {
        plugins: [
          {
            name: 'inject-createdAt',
            exec: (opts: CrudOptions) => {
              opts.columns = {
                ...(opts.columns || {}),
                createdAt: {
                  title: '创建时间',
                  column: { width: 160 },
                  // injected as read-only (not editable in the add/edit form).
                  form: { show: false },
                },
              };
              return opts;
            },
          },
          {
            name: 'default-pagesize',
            exec: (opts: CrudOptions) => {
              opts.pagination = { pageSize: 10, ...(opts.pagination || {}) };
              return opts;
            },
          },
          {
            name: 'never-runs',
            enabled: false,
            exec: (opts: CrudOptions) => {
              // skipped (enabled:false) — would inject a bogus column if it ran.
              opts.columns = { ...(opts.columns || {}), __bogus__: { title: 'BOGUS' } };
              return opts;
            },
          },
        ],
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: { title: '姓名', search: { show: true }, column: { width: 160 } },
        dept: { title: '部门' },
        // NOTE: createdAt is NOT declared here — the plugin injects it.
      },
    },
  };
}
