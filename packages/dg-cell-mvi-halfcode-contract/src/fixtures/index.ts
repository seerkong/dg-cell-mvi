import type { HalfcodeDocument } from '../document';

export const canonicalAdminCrudDocumentFixture = {
  kind: 'HalfcodeDocument',
  apiVersion: 'halfcode.dg-cell-mvi/v1',
  product: {
    id: 'admin-product',
    version: '1.0.0',
    name: '工业化 Admin 示例',
    productLine: 'admin',
    entryModuleId: 'admin-module',
    settings: { layout: 'side' },
  },
  modules: [
    {
      id: 'admin-module',
      version: '1.0.0',
      materialRefs: [
        { id: 'admin-shell', version: '1.0.0' },
        { id: 'users-crud', version: '1.0.0' },
        { id: 'users-view', version: '1.0.0' },
      ],
      resourceRefs: [{ id: 'users-resource', version: '1.0.0' }],
      effectRefs: [{ id: 'users-list-effect', version: '1.0.0' }],
      route: { path: '/users', title: '用户' },
    },
  ],
  materials: [
    {
      kind: 'admin-shell',
      id: 'admin-shell',
      version: '1.0.0',
      routes: [{ id: 'route-users', path: '/users', title: '用户', materialRef: { id: 'users-view', version: '1.0.0' } }],
      menus: [{ id: 'menu-users', title: '用户', routeId: 'route-users' }],
      permissions: [{ id: 'users.read', action: 'read', subject: 'users' }],
      settings: { layout: 'side' },
      theme: { preset: 'light', tokens: { primary: '#1677ff' } },
      i18n: { zh: { users: '用户' } },
    },
    {
      kind: 'crud',
      id: 'users-crud',
      version: '1.0.0',
      entity: 'users',
      resourceRef: { id: 'users-resource', version: '1.0.0' },
      operations: [{
        id: 'list',
        purpose: 'list',
        resourceOperationId: 'page',
        effectRef: { id: 'users-list-effect', version: '1.0.0' },
      }],
      fields: [
        { id: 'name', path: 'name', label: '姓名', valueType: 'string', display: { table: true, form: true } },
        { id: 'score', path: 'score', label: '分数', valueType: 'number', display: { table: true, form: true } },
      ],
      table: { primaryKey: 'id', columns: ['name', 'score'], defaultPageSize: 20 },
      form: { fields: ['name', 'score'], submitOperationId: 'list' },
    },
    {
      kind: 'view',
      id: 'users-view',
      version: '1.0.0',
      root: {
        id: 'users-page',
        component: { kind: 'component-ref', ref: 'CrudPlanPreview', adapter: 'element-plus' },
        props: { crudPlanId: 'users-crud.crud-plan' },
      },
    },
  ],
  stateModels: [{
    id: 'users-state',
    version: '1.0.0',
    owner: 'runtime',
    fields: [{ id: 'selectedUserId', path: 'selectedUserId', valueType: 'string' }],
    initialSnapshot: { selectedUserId: '' },
  }],
  resources: [{
    id: 'users-resource',
    version: '1.0.0',
    kind: 'http-resource',
    operations: [{ id: 'page', method: 'POST', path: '/api/users/page' }],
  }],
  effects: [{
    id: 'users-list-effect',
    version: '1.0.0',
    kind: 'resource-operation',
    resourceId: 'users-resource',
    operationId: 'page',
  }],
} satisfies HalfcodeDocument;
