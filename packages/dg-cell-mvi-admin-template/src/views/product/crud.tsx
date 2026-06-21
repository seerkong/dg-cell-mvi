import { createHttpCrudRequest } from '../../common/httpCrudRequest';
import { chassis } from '../../chassis/stores';
import { PRODUCT_RESOURCE } from './resource';

/**
 * Example product CRUD config — the template's single demonstration page.
 *
 * Every request is routed through the SHARED chassis transport (`chassis.http`) via `createHttpCrudRequest`,
 * so it inherits that one port's auth header / 401→logout / `{code,msg,data}` envelope unwrap. mock vs real
 * is decided ONLY by which HttpPort the app injected (dev → mockHttpPort serving the in-memory product
 * store; prod → axios hitting the real `/product/*` endpoints) — this page is identical either way.
 * transformQuery / transformRes (the limit/offset contract) come from common/commonCrudOptions via the
 * useCrud deep-merge in index.vue.
 *
 * `chassis.http` (not `useChassis().http`) is imported directly because crud.tsx is a plain module, not a
 * component setup — the module singleton IS the canonical injected instance.
 *
 * Button permissions: the actionbar add / rowHandle edit / rowHandle delete buttons each carry a
 * `permission` code; index.vue injects a `permission` predicate (useCrud `{ permission }`) backed by the
 * GLOBAL permission actor's live codes. The dev mock grants `product:add` + `product:edit` but WITHHOLDS
 * `product:remove` → after login the DELETE button is HIDDEN while add/edit remain — a button hide/show
 * driven by real, remote-loaded codes. Grant `product:remove` in src/chassis/mockHttpPort.ts to see it show.
 */
export default function () {
  return {
    crudOptions: {
      // the four crud request callbacks, all going through chassis.http (auth/401/envelope for free).
      request: createHttpCrudRequest(chassis.http, PRODUCT_RESOURCE),
      pagination: { pageSize: 10 },
      // button-permission codes (filtered by the injected global-store predicate — see index.vue).
      actionbar: { buttons: { add: { permission: 'product:add' } } },
      rowHandle: {
        buttons: {
          edit: { permission: 'product:edit' },
          // product:remove is WITHHELD by the dev mock → this delete button is hidden after login.
          remove: { permission: 'product:remove' },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 180 },
          form: { rules: [{ required: true, message: '请输入名称' }] },
        },
        category: {
          title: '分类',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'hardware', label: '硬件' },
              { value: 'software', label: '软件' },
              { value: 'service', label: '服务' },
            ],
          },
          search: { show: true },
          column: { width: 120 },
        },
        price: {
          title: '价格',
          type: 'number',
          column: { width: 120, sortable: true },
          form: { rules: [{ required: true, message: '请输入价格' }] },
        },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'on', label: '上架' },
              { value: 'off', label: '下架' },
            ],
          },
          column: { width: 100 },
        },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 200 } },
      },
    },
  };
}
