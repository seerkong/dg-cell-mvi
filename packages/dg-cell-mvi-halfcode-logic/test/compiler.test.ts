import { describe, expect, it } from 'vitest';
import {
  canonicalAdminCrudDocumentFixture,
  type HalfcodeDocument,
} from 'dg-cell-mvi-halfcode-contract';
import { compileHalfcode } from '../src';

describe('halfcode compiler pipeline', () => {
  it('compiles canonical view material to render plan', () => {
    const document: HalfcodeDocument = {
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v1',
      product: { id: 'product', version: '1.0.0' },
      modules: [{ id: 'module', version: '1.0.0', materialRefs: [{ id: 'view.main', version: '1.0.0' }] }],
      materials: [
        {
          kind: 'view',
          id: 'view.main',
          version: '1.0.0',
          root: {
            id: 'root',
            component: { kind: 'component-ref', ref: 'Page' },
          },
        },
      ],
    };

    const result = compileHalfcode({ kind: 'canonical', document });

    expect(result.diagnostics).toEqual([]);
    expect(result.plans.renderPlans).toHaveLength(1);
    expect(result.plans.renderPlans[0]).toMatchObject({
      id: 'view.main.render-plan',
      materialRef: { id: 'view.main', version: '1.0.0' },
    });
  });

  it('compiles CrudMaterial to CrudPlan', () => {
    const document: HalfcodeDocument = {
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v1',
      product: { id: 'product', version: '1.0.0' },
      modules: [{ id: 'module', version: '1.0.0', materialRefs: [{ id: 'crud.users', version: '1.0.0' }] }],
      materials: [
        {
          kind: 'crud',
          id: 'crud.users',
          version: '1.0.0',
          entity: 'users',
          resourceRef: { id: 'resource.users', version: '1.0.0' },
          operations: [
            {
              id: 'list',
              purpose: 'list',
              resourceOperationId: 'page',
              effectRef: { id: 'effect.users.page', version: '1.0.0' },
            },
          ],
          fields: [{ id: 'name', path: 'name', valueType: 'string' }],
        },
      ],
    };

    const result = compileHalfcode({ kind: 'canonical', document });

    expect(result.plans.crudPlans).toHaveLength(1);
    expect(result.plans.crudPlans[0]).toMatchObject({
      id: 'crud.users.crud-plan',
      resourceRefs: [{ id: 'resource.users', version: '1.0.0' }],
      effectRefs: [{ id: 'effect.users.page', version: '1.0.0' }],
    });
    expect(result.plans.crudPlans[0].material).toMatchObject({
      entity: 'users',
      fields: [{ id: 'name', path: 'name', valueType: 'string' }],
      operations: [
        {
          id: 'list',
          purpose: 'list',
          resourceOperationId: 'page',
        },
      ],
    });
  });

  it('compiles AdminShellMaterial to AdminShellPlan', () => {
    const document: HalfcodeDocument = {
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v1',
      product: { id: 'product', version: '1.0.0' },
      modules: [{ id: 'module', version: '1.0.0', materialRefs: [{ id: 'admin.main', version: '1.0.0' }] }],
      materials: [
        {
          kind: 'admin-shell',
          id: 'admin.main',
          version: '1.0.0',
          routes: [
            {
              id: 'route.users',
              path: '/users',
              title: 'Users',
              materialRef: { id: 'crud.users', version: '1.0.0' },
              permissionRefs: ['users.read'],
            },
          ],
          menus: [{ id: 'menu.users', title: 'Users', routeId: 'route.users', iconRef: 'users' }],
          permissions: [{ id: 'users.read', action: 'read', subject: 'users' }],
          settings: { layout: 'side' },
          theme: { preset: 'light', tokens: { primary: '#1677ff' } },
          i18n: { zh: { users: '用户' } },
        },
      ],
    };

    const result = compileHalfcode({ kind: 'canonical', document });

    expect(result.diagnostics).toEqual([]);
    expect(result.plans.adminShellPlans).toHaveLength(1);
    expect(result.plans.adminShellPlans[0]).toMatchObject({
      id: 'admin.main.admin-shell-plan',
      materialRef: { id: 'admin.main', version: '1.0.0' },
      routes: [
        {
          id: 'route.users',
          path: '/users',
          permissionRefs: ['users.read'],
        },
      ],
      menus: [{ id: 'menu.users', title: 'Users', routeId: 'route.users' }],
      permissions: [{ id: 'users.read', action: 'read', subject: 'users' }],
      settings: { layout: 'side' },
      theme: { preset: 'light', tokens: { primary: '#1677ff' } },
      i18n: { zh: { users: '用户' } },
    });
  });

  it('compiles canonical admin CRUD demo through derived plans', () => {
    const result = compileHalfcode({ kind: 'canonical', document: canonicalAdminCrudDocumentFixture });

    expect(result.diagnostics).toEqual([]);
    expect(result.plans.adminShellPlans).toHaveLength(1);
    expect(result.plans.crudPlans).toHaveLength(1);
    expect(result.plans.renderPlans).toHaveLength(1);
    expect(result.plans.adminShellPlans[0]).toMatchObject({
      routes: [{ id: 'route-users', path: '/users' }],
      permissions: [{ id: 'users.read', action: 'read', subject: 'users' }],
      theme: { preset: 'light' },
      i18n: { zh: { users: '用户' } },
    });
    expect(result.plans.crudPlans[0]).toMatchObject({
      materialRef: { id: 'users-crud', version: '1.0.0' },
      resourceRefs: [{ id: 'users-resource', version: '1.0.0' }],
      effectRefs: [{ id: 'users-list-effect', version: '1.0.0' }],
    });
  });

  it('compiles a v2 ElementTree into element, render, and admin shell plans', () => {
    const document: HalfcodeDocument = {
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v2',
      product: { id: 'product', version: '1.0.0' },
      modules: [],
      materials: [],
      elementTree: {
        root: 'users-page',
        elements: [{
          kind: 'page',
          id: 'users-page',
          version: '1.0.0',
          route: '/users',
          title: '用户',
          mount: 'both',
          scopeRef: 'scopes:users-page',
          contractRef: 'contracts:users-page',
          children: [
            {
              kind: 'capsule',
              id: 'users-filter',
              version: '1.0.0',
              scopeRef: 'scopes:users-filter',
              contractRef: 'contracts:users-filter',
              children: [
                {
                  kind: 'atomic',
                  id: 'keyword-input',
                  version: '1.0.0',
                  ui: 'element-plus:ElInput',
                  propsRef: 'config:users-filter.keywordInput',
                  contractRef: 'contracts:keyword-input',
                },
              ],
            },
            {
              kind: 'component',
              id: 'users-table',
              version: '1.0.0',
              componentRef: 'components:CrudTable',
              scopeRef: 'scopes:users-table',
              contractRef: 'contracts:users-table',
            },
          ],
        }],
      },
      scopes: [{ id: 'users-page', version: '1.0.0', configRef: 'config:users-page' }],
      contracts: [{ id: 'users-page', version: '1.0.0' }],
    };

    const result = compileHalfcode({ kind: 'canonical', document });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(result.plans.elementPlans.map((plan) => [plan.id, plan.parentId])).toEqual([
      ['users-page', undefined],
      ['users-filter', 'users-page'],
      ['keyword-input', 'users-filter'],
      ['users-table', 'users-page'],
    ]);
    expect(result.plans.renderPlans[0]).toMatchObject({
      id: 'users-page.render-plan',
      root: {
        id: 'users-page',
        component: { kind: 'component-ref', ref: 'Page' },
        children: [
          expect.objectContaining({ id: 'users-filter' }),
          expect.objectContaining({ id: 'users-table', component: expect.objectContaining({ ref: 'CrudTable' }) }),
        ],
      },
    });
    expect(result.plans.adminShellPlans[0]).toMatchObject({
      id: 'users-page.admin-shell-plan',
      routes: [{ id: 'route-users-page', path: '/users', title: '用户' }],
    });
    expect(result.plans.crudPlans[0]).toMatchObject({
      id: 'users-table.crud.crud-plan',
      material: { id: 'users-table.crud', entity: 'users-table' },
    });
  });
});
