import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  HALFCODE_CAPSULE_REQUIRES_UNMET,
  HALFCODE_MESSAGE_UNWIRED,
  HALFCODE_PROPS_CONTRACT_MISMATCH,
  HALFCODE_REF_UNRESOLVED,
  HALFCODE_ROUTE_URLINPUTS_MISMATCH,
  asHalfcodeRef,
  asUnitFqn,
  compileHalfcodeUnitBundle,
  type UnitCompileDiagnostic,
  type UnitCompileDomainDocument,
  type UnitCompileInput,
  type UnitCompileUnit,
  type UnitDomainNodeSpec,
  type UnitElementNode,
} from '../src';

const ref = asHalfcodeRef;
const fqn = asUnitFqn;

const USERS_PAGE = fqn('dg.admin.basic.UsersPage');
const REPORT_PAGE = fqn('dg.admin.basic.ReportDetailPage');
const CRUD_TABLE = fqn('dg.materials.CrudTable');
const STATUS_BADGE = fqn('dg.materials.StatusBadge');

function domainDoc(
  domain: string,
  tag: string,
  children: UnitDomainNodeSpec[],
): UnitCompileDomainDocument {
  return {
    domain,
    path: `/test/${domain}.xnl`,
    tag,
    id: `${domain}-root`,
    data: {},
    nodes: [{ tag, id: `${domain}-root`, data: {}, children }],
  };
}

function usersElements(): UnitElementNode[] {
  return [
    { kind: 'instance', tag: 'h1', id: 'users-title', inlineProps: { text: '用户管理' } },
    {
      kind: 'capsule',
      id: 'users-filter',
      scope: { kind: 'ref', ref: ref('scope://#users-filter') },
      children: [
        {
          kind: 'instance',
          tag: 'elementPlus.ElInput',
          id: 'keyword-input',
          props: ref('config://#users-filter/keywordInput'),
          command: ref('command://#users.search'),
        },
      ],
    },
    {
      kind: 'instance',
      tag: 'dg.materials.CrudTable',
      id: 'users-table',
      inlineProps: { pageSize: 20 },
      props: ref('config://#users-table'),
      slots: [
        {
          id: 'toolbar',
          children: [
            {
              kind: 'instance',
              tag: 'dg.materials.StatusBadge',
              id: 'selected-badge',
              inlineProps: { status: 'info' },
            },
          ],
        },
      ],
    },
    {
      kind: 'instance',
      tag: 'dg.admin.basic.ReportDetailPage',
      id: 'report-embed',
      urlInputs: ref('config://#report-embed/url'),
    },
  ];
}

function usersPageUnit(): UnitCompileUnit {
  return {
    fqn: USERS_PAGE,
    kind: 'page',
    form: 'folder',
    path: '/pages/users',
    manifest: {
      kind: 'page',
      fqn: USERS_PAGE,
      version: '1.0.0',
      title: '用户',
    },
    domains: {
      scopes: domainDoc('scopes', 'Scopes', [
        {
          tag: 'Scope',
          id: 'users-page',
          data: {
            commands: 'command://#users-page-commands',
            config: 'config://#users-page',
          },
        },
        {
          tag: 'Scope',
          id: 'users-filter',
          data: { config: 'config://#users-filter' },
        },
        {
          tag: 'Scope',
          id: 'users-table',
          data: { config: 'config://#users-table' },
        },
      ]),
      commands: domainDoc('commands', 'Commands', [
        {
          tag: 'Command',
          id: 'users.search',
          data: {
            payloadDef: 'command-def://#users.search',
            handler: 'vfs://./command-handlers/users.command-handlers.ts#searchUsers',
            config: 'config://#users-search-command',
          },
        },
        { tag: 'Command', id: 'users.refresh', data: {} },
        { tag: 'Command', id: 'users.selected', data: {} },
      ]),
      config: domainDoc('config', 'Config', [
        { tag: 'ConfigEntry', id: 'users-filter', data: { keywordInput: { placeholder: '搜索' } } },
        { tag: 'ConfigEntry', id: 'users-search-command', data: { debounceMs: 150 } },
        { tag: 'ConfigEntry', id: 'users-table', data: { entity: 'users' } },
        { tag: 'ConfigEntry', id: 'report-embed', data: { url: { path: { id: 'latest' } } } },
      ]),
    },
    elements: {
      id: 'users-page-elements',
      scope: { kind: 'ref', ref: ref('scope://#users-page') },
      children: usersElements(),
    },
    contract: {
      kind: 'page-contract',
      fqn: USERS_PAGE,
      urlInputs: { query: { keyword: 'string?' } },
      accepts: [{ ref: ref('event://#report.saved') }],
      sends: [{ ref: ref('command://#users.selected') }],
      elementContracts: [
        {
          id: 'users-filter',
          requires: {
            commands: [ref('command://#users.search')],
            effects: [],
            config: [ref('config://#users-filter')],
          },
          sends: [{ ref: ref('command://#users.search') }],
        },
      ],
    },
  };
}

function reportPageUnit(): UnitCompileUnit {
  return {
    fqn: REPORT_PAGE,
    kind: 'page',
    form: 'folder',
    path: '/pages/report-detail',
    manifest: { kind: 'page', fqn: REPORT_PAGE, version: '1.0.0', title: '报表详情' },
    domains: {},
    elements: {
      id: 'report-detail-elements',
      children: [{ kind: 'instance', tag: 'h1', id: 'report-title', inlineProps: { text: '报表详情' } }],
    },
    contract: {
      kind: 'page-contract',
      fqn: REPORT_PAGE,
      urlInputs: { path: { id: 'string' }, query: { tab: 'string?' } },
      accepts: [{ ref: ref('event://#report.refresh') }],
      sends: [{ ref: ref('event://#report.saved') }],
    },
  };
}

function crudTableUnit(): UnitCompileUnit {
  return {
    fqn: CRUD_TABLE,
    kind: 'component',
    form: 'folder',
    path: '/components/crud-table',
    manifest: { kind: 'component', fqn: CRUD_TABLE, version: '1.0.0' },
    domains: {},
    elements: {
      id: 'crud-table-elements',
      children: [{ kind: 'instance', tag: 'div', id: 'table-shell' }],
    },
    contract: {
      kind: 'component-contract',
      fqn: CRUD_TABLE,
      props: { pageSize: 'number?', entity: 'string?' },
      slots: [{ id: 'toolbar' }],
    },
  };
}

function statusBadgeUnit(): UnitCompileUnit {
  return {
    fqn: STATUS_BADGE,
    kind: 'component',
    form: 'single-file',
    path: '/components/status-badge.xnl',
    manifest: { kind: 'component', fqn: STATUS_BADGE, version: '1.0.0' },
    domains: {},
    elements: {
      id: 'status-badge-elements',
      children: [{ kind: 'instance', tag: 'span', id: 'badge' }],
    },
    contract: {
      kind: 'component-contract',
      fqn: STATUS_BADGE,
      props: { status: 'string', size: 'string?' },
    },
  };
}

function makeInput(): UnitCompileInput {
  const units: Record<string, UnitCompileUnit> = {};
  for (const unit of [usersPageUnit(), reportPageUnit(), crudTableUnit(), statusBadgeUnit()]) {
    units[unit.fqn] = unit;
  }
  return {
    manifest: { id: 'basic-admin', version: '2.0.0', apiVersion: 'halfcode.dg-cell-mvi/v3', domains: [], units: [] },
    app: {
      product: { id: 'dg.admin.basic', version: '2.0.0', productLine: 'admin' },
      routes: [
        {
          id: 'users-route',
          path: '/users',
          page: ref('page://dg.admin.basic.UsersPage'),
          menu: { icon: 'user', order: 1 },
          children: [
            {
              id: 'users-report-route',
              path: '/users/reports/:id',
              page: ref('page://dg.admin.basic.ReportDetailPage'),
            },
          ],
        },
        {
          id: 'report-detail-route',
          path: '/reports/:id',
          page: ref('page://dg.admin.basic.ReportDetailPage'),
          title: '报表详情（运营）',
          permission: ref('config://#permissions/reportsView'),
        },
      ],
      wiring: [
        {
          from: ref('route://#report-detail-route'),
          to: ref('route://#users-route'),
          message: ref('event://#report.saved'),
        },
      ],
      domains: {},
    },
    units,
    registry: Object.fromEntries(
      Object.values(units).map((unit) => [unit.fqn, { fqn: unit.fqn, kind: unit.kind, path: unit.path }]),
    ),
  };
}

function byCode(diagnostics: UnitCompileDiagnostic[], code: string): UnitCompileDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.code === code);
}

function errors(diagnostics: UnitCompileDiagnostic[]): UnitCompileDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

describe('route projection → AdminShellPlanV3 (T2.1)', () => {
  it('resolves title override and manifest fallback across the nested tree', () => {
    const { adminShellPlan, diagnostics } = compileHalfcodeUnitBundle(makeInput());

    expect(adminShellPlan.id).toBe('basic-admin.admin-shell-plan-v3');
    expect(adminShellPlan.bundleId).toBe('basic-admin');
    expect(adminShellPlan.product?.id).toBe('dg.admin.basic');

    const [users, report] = adminShellPlan.routes;
    // no Route.title → page manifest default
    expect(users).toMatchObject({
      id: 'users-route',
      path: '/users',
      title: '用户',
      menu: { icon: 'user', order: 1 },
      pageFqn: 'dg.admin.basic.UsersPage',
    });
    // Route.title override wins over the manifest default
    expect(report).toMatchObject({
      id: 'report-detail-route',
      title: '报表详情（运营）',
      permissionBinding: 'config://#permissions/reportsView',
      pageFqn: 'dg.admin.basic.ReportDetailPage',
    });
    // nesting preserved; nested route falls back to the page default title
    expect(users.children).toHaveLength(1);
    expect(users.children?.[0]).toMatchObject({
      id: 'users-report-route',
      path: '/users/reports/:id',
      title: '报表详情',
      pageFqn: 'dg.admin.basic.ReportDetailPage',
    });

    expect(byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH)).toEqual([]);
  });

  it('reports HALFCODE_ROUTE_URLINPUTS_MISMATCH for undeclared path variables', () => {
    const input = makeInput();
    input.app.routes[0].path = '/users/:userId';
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const mismatches = byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].severity).toBe('error');
    expect(mismatches[0].message).toContain(':userId');
    expect(mismatches[0].message).toContain('dg.admin.basic.UsersPage');
  });

  it('reports HALFCODE_ROUTE_URLINPUTS_MISMATCH when a required path variable is not provided', () => {
    const input = makeInput();
    input.app.routes[1].path = '/reports'; // ReportDetailPage requires path { id: "string" }
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const mismatches = byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('id');
    expect(mismatches[0].message).toContain('/reports');
  });

  it('does not require optional declared variables in the route path (query/hash never participate)', () => {
    const input = makeInput();
    const report = input.units[REPORT_PAGE];
    if (report.contract?.kind === 'page-contract') {
      report.contract.urlInputs = { path: { id: 'string', mode: 'string?' }, query: { tab: 'string?' } };
    }
    const { diagnostics } = compileHalfcodeUnitBundle(input);
    expect(byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH)).toEqual([]);
  });
});

describe('embedded page urlInputs matching (T2.1, D2)', () => {
  it('treats a present urlInputs binding as provided (no value-level check at compile time)', () => {
    const { diagnostics } = compileHalfcodeUnitBundle(makeInput());
    expect(
      byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH).filter((d) => d.message.includes('report-embed')),
    ).toEqual([]);
  });

  it('reports a mismatch when the target page requires path variables and the instance has no urlInputs binding', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const embed = users.elements?.children.find((node) => node.id === 'report-embed');
    if (embed?.kind === 'instance') delete embed.urlInputs;
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const mismatches = byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('report-embed');
    expect(mismatches[0].message).toContain('dg.admin.basic.ReportDetailPage');
  });

  it('does not report when the target page declares no required path variables and the instance has no urlInputs binding', () => {
    const input = makeInput();
    const report = input.units[REPORT_PAGE];
    if (report.contract?.kind === 'page-contract') {
      report.contract.urlInputs = { query: { tab: 'string?' } };
    }
    // keep the /reports/:id route from tripping the (now empty) declaration
    input.app.routes[1].path = '/reports';
    input.app.routes[0].children = [];
    const users = input.units[USERS_PAGE];
    const embed = users.elements?.children.find((node) => node.id === 'report-embed');
    if (embed?.kind === 'instance') delete embed.urlInputs;

    const { diagnostics } = compileHalfcodeUnitBundle(input);
    expect(byCode(diagnostics, HALFCODE_ROUTE_URLINPUTS_MISMATCH)).toEqual([]);
  });
});

describe('component props vs ComponentContract (T2.1, D12)', () => {
  it('accepts known inline props and required props satisfied inline', () => {
    const { diagnostics } = compileHalfcodeUnitBundle(makeInput());
    expect(byCode(diagnostics, HALFCODE_PROPS_CONTRACT_MISMATCH)).toEqual([]);
  });

  it('reports HALFCODE_PROPS_CONTRACT_MISMATCH for unknown inline props', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const table = users.elements?.children.find((node) => node.id === 'users-table');
    if (table?.kind === 'instance') table.inlineProps = { ...table.inlineProps, bogus: true };
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const mismatches = byCode(diagnostics, HALFCODE_PROPS_CONTRACT_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('bogus');
    expect(mismatches[0].message).toContain('dg.materials.CrudTable');
  });

  it('reports HALFCODE_PROPS_CONTRACT_MISMATCH when a required prop is missing and no props binding exists', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const table = users.elements?.children.find((node) => node.id === 'users-table');
    const badge = table?.slots?.[0].children?.find((node) => node.id === 'selected-badge');
    if (badge?.kind === 'instance') delete badge.inlineProps; // StatusBadge requires status: "string"
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const mismatches = byCode(diagnostics, HALFCODE_PROPS_CONTRACT_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('status');
    expect(mismatches[0].message).toContain('dg.materials.StatusBadge');
  });

  it('skips the required-prop check when a props binding provides props in batch', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const table = users.elements?.children.find((node) => node.id === 'users-table');
    const badge = table?.slots?.[0].children?.find((node) => node.id === 'selected-badge');
    if (badge?.kind === 'instance') {
      delete badge.inlineProps;
      badge.props = ref('config://#users-table');
    }
    const { diagnostics } = compileHalfcodeUnitBundle(input);
    expect(byCode(diagnostics, HALFCODE_PROPS_CONTRACT_MISMATCH)).toEqual([]);
  });
});

describe('Capsule Requires along the scope chain (T2.2, D14)', () => {
  it('accepts requires satisfied across chain levels (command at parent, config at own scope)', () => {
    const { diagnostics } = compileHalfcodeUnitBundle(makeInput());
    expect(byCode(diagnostics, HALFCODE_CAPSULE_REQUIRES_UNMET)).toEqual([]);
  });

  it('reports HALFCODE_CAPSULE_REQUIRES_UNMET when the required command is not declared', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    if (users.contract?.kind === 'page-contract' && users.contract.elementContracts?.[0].requires) {
      users.contract.elementContracts[0].requires.commands = [ref('command://#missing.command')];
    }
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const unmet = byCode(diagnostics, HALFCODE_CAPSULE_REQUIRES_UNMET);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].severity).toBe('error');
    expect(unmet[0].message).toContain('users-filter');
    expect(unmet[0].message).toContain('missing.command');
  });

  it('reports unmet when no scope along the chain wires the required command domain', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const scopesDoc = users.domains.scopes;
    const usersPageScope = scopesDoc.nodes[0].children?.find((node) => node.id === 'users-page');
    if (usersPageScope) delete usersPageScope.data.commands;
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const unmet = byCode(diagnostics, HALFCODE_CAPSULE_REQUIRES_UNMET);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].message).toContain('command://#users.search');
    expect(unmet[0].message).toContain('commands');
  });

  it('reports unmet when a required config ref does not resolve in the config domain', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    if (users.contract?.kind === 'page-contract' && users.contract.elementContracts?.[0].requires) {
      users.contract.elementContracts[0].requires.config = [ref('config://#nowhere')];
    }
    const { diagnostics } = compileHalfcodeUnitBundle(input);

    const unmet = byCode(diagnostics, HALFCODE_CAPSULE_REQUIRES_UNMET);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].message).toContain('config://#nowhere');
  });
});

describe('wiring compilation + unwired emits (T2.2, D5/D13)', () => {
  it('preserves one canonical Event ref from sender through Wire to receiver', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const report = input.units[REPORT_PAGE];
    if (users.contract?.kind === 'page-contract') {
      users.contract.accepts = [{ ref: ref('event://#report.saved') }];
      users.contract.sends = [];
      delete (users.contract as { emits?: unknown }).emits;
      users.domains.scopes = domainDoc('scopes', 'Scopes', [
        { tag: 'Scope', id: 'users-page', data: { commands: 'command://#users-page', config: 'config://#users-page' } },
        { tag: 'Scope', id: 'users-filter', data: { commands: 'command://#users-page', config: 'config://#users-filter' } },
      ]);
      users.domains.commands = domainDoc('commands', 'Commands', [
        { tag: 'Command', id: 'users.search', data: {} },
      ]);
      users.domains.config = domainDoc('config', 'Config', [
        { tag: 'ConfigEntry', id: 'users-filter', data: {} },
      ]);
    }
    if (report.contract?.kind === 'page-contract') {
      report.contract.sends = [{ ref: ref('event://#report.saved') }];
      delete (report.contract as { emits?: unknown }).emits;
    }
    input.app.wiring = [{
      from: ref('route://#report-detail-route'),
      to: ref('route://#users-route'),
      message: ref('event://#report.saved'),
    }];

    const { wiringPlan, diagnostics } = compileHalfcodeUnitBundle(input);
    expect(wiringPlan.wires).toEqual([{
      fromRouteId: 'report-detail-route',
      toRouteId: 'users-route',
      fromPageFqn: 'dg.admin.basic.ReportDetailPage',
      toPageFqn: 'dg.admin.basic.UsersPage',
      message: 'event://#report.saved',
    }]);
    expect(errors(diagnostics)).toEqual([]);
  });

  it('compiles a wire into a fully resolved binding (id-form endpoints)', () => {
    const { wiringPlan, diagnostics } = compileHalfcodeUnitBundle(makeInput());
    expect(wiringPlan.id).toBe('basic-admin.wiring-plan');
    expect(wiringPlan.wires).toEqual([
      {
        fromRouteId: 'report-detail-route',
        toRouteId: 'users-route',
        fromPageFqn: 'dg.admin.basic.ReportDetailPage',
        toPageFqn: 'dg.admin.basic.UsersPage',
        message: 'event://#report.saved',
      },
    ]);
    expect(errors(diagnostics)).toEqual([]);
  });

  it('resolves route://<path> endpoints against route paths', () => {
    const input = makeInput();
    input.app.wiring[0].from = ref('route://reports/:id');
    const { wiringPlan, diagnostics } = compileHalfcodeUnitBundle(input);
    expect(wiringPlan.wires).toHaveLength(1);
    expect(wiringPlan.wires[0].fromRouteId).toBe('report-detail-route');
    expect(errors(diagnostics)).toEqual([]);
  });

  it('reports HALFCODE_REF_UNRESOLVED for a wire endpoint matching no route instance', () => {
    const input = makeInput();
    input.app.wiring[0].to = ref('route://#no-such-route');
    const { wiringPlan, diagnostics } = compileHalfcodeUnitBundle(input);
    expect(wiringPlan.wires).toEqual([]);
    const unresolved = byCode(diagnostics, HALFCODE_REF_UNRESOLVED);
    expect(unresolved.some((d) => d.message.includes('route://#no-such-route'))).toBe(true);
  });

  it('reports HALFCODE_REF_UNRESOLVED when a message is not declared by the endpoint page contracts', () => {
    const input = makeInput();
    input.app.wiring[0].message = ref('event://#report.deleted');
    const { wiringPlan, diagnostics } = compileHalfcodeUnitBundle(input);
    expect(wiringPlan.wires).toEqual([]);
    const unresolved = byCode(diagnostics, HALFCODE_REF_UNRESOLVED);
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((diagnostic) => diagnostic.message.includes('event://#report.deleted'))).toBe(true);
    expect(unresolved.some((diagnostic) => diagnostic.message.includes('PageContract.sends'))).toBe(true);
  });

  it('warns HALFCODE_MESSAGE_UNWIRED for declared page messages with no wire, and only for those', () => {
    const { diagnostics } = compileHalfcodeUnitBundle(makeInput());
    const unwired = byCode(diagnostics, HALFCODE_MESSAGE_UNWIRED);
    expect(unwired).toHaveLength(1);
    expect(unwired[0].severity).toBe('warning');
    expect(unwired[0].message).toContain('command://#users.selected');
    // report.saved is wired -> no warning for it
    expect(unwired.some((d) => d.message.includes('report.saved'))).toBe(false);
  });

  it('does not warn for pages not mounted on any route (embedded-only pages bubble, not wire)', () => {
    const input = makeInput();
    input.app.routes = [input.app.routes[0]];
    input.app.routes[0].children = [];
    input.app.wiring = [];
    const { diagnostics } = compileHalfcodeUnitBundle(input);
    const unwired = byCode(diagnostics, HALFCODE_MESSAGE_UNWIRED);
    expect(unwired.some((d) => d.message.includes('report.saved'))).toBe(false);
    expect(unwired.some((d) => d.message.includes('users.selected'))).toBe(true);
  });
});

describe('UnitRenderPlan projection (T2.3)', () => {
  it('projects every node category with instance props and refs preserved', () => {
    const { renderPlans } = compileHalfcodeUnitBundle(makeInput());
    expect(renderPlans.map((plan) => plan.unitFqn).sort()).toEqual([
      'dg.admin.basic.ReportDetailPage',
      'dg.admin.basic.UsersPage',
      'dg.materials.CrudTable',
      'dg.materials.StatusBadge',
    ]);

    const users = renderPlans.find((plan) => plan.unitFqn === USERS_PAGE);
    expect(users).toMatchObject({
      id: 'dg.admin.basic.UsersPage.unit-render-plan',
      unitKind: 'page',
      title: '用户',
    });

    const [title, filter, table, embed] = users?.root ?? [];
    // 1. native HTML atom
    expect(title).toMatchObject({
      kind: 'atom',
      id: 'users-title',
      tag: 'h1',
      inlineProps: { text: '用户管理' },
      scopeId: 'users-page',
    });
    // 2. inline capsule with an implicit id-associated contract and lexical scope
    expect(filter).toMatchObject({
      kind: 'capsule',
      id: 'users-filter',
      scopeId: 'users-filter',
    });
    expect(filter.children?.[0]).toMatchObject({
      kind: 'atom',
      tag: 'elementPlus.ElInput',
      library: 'elementPlus',
      scopeId: 'users-filter',
      propsBinding: 'config://#users-filter/keywordInput',
      commandBinding: 'command://#users.search',
    });
    // 3. registered component instance inherits the lexical scope and preserves bindings
    expect(table).toMatchObject({
      kind: 'component',
      id: 'users-table',
      tag: 'dg.materials.CrudTable',
      fqn: 'dg.materials.CrudTable',
      inlineProps: { pageSize: 20 },
      propsBinding: 'config://#users-table',
      scopeId: 'users-page',
    });
    expect(table.slots).toHaveLength(1);
    expect(table.slots?.[0].id).toBe('toolbar');
    expect(table.slots?.[0].children[0]).toMatchObject({
      kind: 'component',
      id: 'selected-badge',
      fqn: 'dg.materials.StatusBadge',
      inlineProps: { status: 'info' },
      scopeId: 'users-page',
    });
    // 4. embedded page with synthetic URL inputs ref
    expect(embed).toMatchObject({
      kind: 'page-embed',
      id: 'report-embed',
      tag: 'dg.admin.basic.ReportDetailPage',
      pageFqn: 'dg.admin.basic.ReportDetailPage',
      urlInputsBinding: 'config://#report-embed/url',
      scopeId: 'users-page',
    });
  });

  it('preserves multiple named slots (Slots container form arrives as a slot list)', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    users.elements?.children.push({
      kind: 'instance',
      tag: 'div',
      id: 'layout',
      slots: [
        { id: 'header', children: [{ kind: 'instance', tag: 'span', id: 'head-text' }] },
        { id: 'footer', children: [{ kind: 'instance', tag: 'span', id: 'foot-text' }] },
      ],
    });
    const { renderPlans } = compileHalfcodeUnitBundle(input);
    const plan = renderPlans.find((p) => p.unitFqn === USERS_PAGE);
    const layout = plan?.root.find((node) => node.id === 'layout');
    expect(layout?.slots?.map((slot) => slot.id)).toEqual(['header', 'footer']);
    expect(layout?.slots?.[1].children[0]).toMatchObject({ kind: 'atom', id: 'foot-text', tag: 'span' });
  });

  it('produces a serializable result (plans and diagnostics survive a JSON round-trip)', () => {
    const result = compileHalfcodeUnitBundle(makeInput());
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('ScopeRuntimePlan and MessageDispatchPlan compilation (complete-halfcode-canonical-runtime T2.1/T2.4)', () => {
  it('derives root, nested capsule, and sibling scope parents only from the lexical element tree', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    const filter = users.elements?.children.find((node) => node.id === 'users-filter');
    if (filter?.kind === 'capsule') {
      filter.children = [
        ...(filter.children ?? []),
        {
          kind: 'capsule',
          id: 'filter-actions',
          scope: {
            kind: 'inline',
            scope: {
              scopeId: 'filter-actions-scope',
              runtime: ref('runtime://#filter-actions'),
              config: ref('config://#filter-actions'),
              messagePolicy: { default: 'reject' },
            },
          },
        },
      ];
    }
    users.elements?.children.push({
      kind: 'capsule',
      id: 'users-toolbar',
      scope: {
        kind: 'inline',
        scope: {
          scopeId: 'users-toolbar-scope',
          commands: ref('command://#users-page-commands'),
          events: ref('event://#users-page-events'),
        },
      },
    });

    const { scopeRuntimePlans } = compileHalfcodeUnitBundle(input);
    const usersScopes = scopeRuntimePlans.filter((plan) => plan.unitFqn === USERS_PAGE);

    expect(usersScopes).toEqual([
      {
        scopeId: 'users-page',
        ownerElementId: 'users-page-elements',
        unitFqn: USERS_PAGE,
        commands: 'command://#users-page-commands',
        config: 'config://#users-page',
      },
      {
        scopeId: 'users-filter',
        parentScopeId: 'users-page',
        ownerElementId: 'users-filter',
        unitFqn: USERS_PAGE,
        config: 'config://#users-filter',
      },
      {
        scopeId: 'filter-actions',
        parentScopeId: 'users-filter',
        ownerElementId: 'filter-actions',
        unitFqn: USERS_PAGE,
        runtime: 'runtime://#filter-actions',
        config: 'config://#filter-actions',
        messagePolicy: { default: 'reject' },
      },
      {
        scopeId: 'users-toolbar',
        parentScopeId: 'users-page',
        ownerElementId: 'users-toolbar',
        unitFqn: USERS_PAGE,
        commands: 'command://#users-page-commands',
        events: 'event://#users-page-events',
      },
    ]);
  });

  it('compiles an element command into a dispatch entry with handler and resolved config', () => {
    const { messageDispatchPlan } = compileHalfcodeUnitBundle(makeInput());

    expect(messageDispatchPlan).toEqual({
      id: 'basic-admin.message-dispatch-plan',
      entries: [
        {
          unitFqn: USERS_PAGE,
          elementId: 'keyword-input',
          scopeId: 'users-filter',
          kind: 'command',
          command: 'command://#users.search',
          commandType: 'users.search',
          payloadDef: 'command-def://#users.search',
          handler: 'vfs://./command-handlers/users.command-handlers.ts#searchUsers',
          config: { debounceMs: 150 },
        },
      ],
    });
  });

  it('compiles AsyncNode projections and its runtime-first implementation binding', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    users.domains['data.graph'] = domainDoc('data.graph', 'DataGraph', [
      {
        tag: 'GraphModule',
        id: 'users.list',
        data: { src: 'vfs://./graph-code/users.graph.ts#UsersGraphModule' },
        children: [
          {
            tag: 'Internals',
            data: {},
            children: [{
              tag: 'AsyncNode',
              id: 'load',
              data: {
                slot: 'internals.load',
                deps: ['inputs.query'],
                type: 'vfs://./graph-code/users.graph.types.ts#UsersLoadLogic',
                initial: [],
                projections: {
                  result: 'outputs.rows',
                  loading: 'outputs.loading',
                  error: 'outputs.error',
                },
              },
            }],
          },
        ],
      },
    ]);
    users.scopeRuntimeBindings = [{
      scopeId: 'users-page',
      dataGraphs: {
        objects: [],
        mounts: [{
          id: 'users-list',
          module: ref('data-graph://#users.list'),
          nodeBindings: [{
            id: 'users.load',
            kind: 'async',
            impl: ref('vfs://./graph-code/users.graph.impl.ts#loadUsers'),
          }],
        }],
        extensions: [],
      },
    }];

    const plan = compileHalfcodeUnitBundle(input).scopeRuntimePlans
      .find((candidate) => candidate.scopeId === 'users-page')?.dataGraphs;

    expect(plan?.mounts[0].module.nodes).toEqual([{
      kind: 'async',
      id: 'load',
      slot: 'internals.load',
      type: 'vfs://./graph-code/users.graph.types.ts#UsersLoadLogic',
      deps: ['inputs.query'],
      logicId: 'users.load',
      initial: [],
      projections: {
        result: 'outputs.rows',
        loading: 'outputs.loading',
        error: 'outputs.error',
      },
    }]);
    expect(plan?.mounts[0].nodeBindings[0]).toMatchObject({
      id: 'users.load',
      kind: 'async',
      impl: 'vfs://./graph-code/users.graph.impl.ts#loadUsers',
    });
  });

  it('gives sibling uses of one predefined Scope distinct lexical runtime identities', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    if (!users.elements) throw new Error('users fixture must define Elements');
    users.elements.children = ['left-filter', 'right-filter'].map((id) => ({
      kind: 'capsule' as const,
      id,
      scope: { kind: 'ref' as const, ref: ref('scope://#users-filter') },
      children: [
        {
          kind: 'instance' as const,
          tag: 'button',
          id: `${id}-search`,
          command: ref('command://#users.search'),
        },
      ],
    }));

    const result = compileHalfcodeUnitBundle(input);
    const scopes = result.scopeRuntimePlans.filter((plan) =>
      ['left-filter', 'right-filter'].includes(plan.ownerElementId));
    const render = result.renderPlans.find((plan) => plan.unitFqn === USERS_PAGE);

    expect(scopes).toMatchObject([
      {
        scopeId: 'left-filter',
        parentScopeId: 'users-page',
        ownerElementId: 'left-filter',
        config: 'config://#users-filter',
      },
      {
        scopeId: 'right-filter',
        parentScopeId: 'users-page',
        ownerElementId: 'right-filter',
        config: 'config://#users-filter',
      },
    ]);
    expect(new Set(scopes.map((plan) => plan.scopeId))).toEqual(
      new Set(['left-filter', 'right-filter']),
    );
    expect(render?.root.map((node) => node.scopeId)).toEqual(['left-filter', 'right-filter']);
    expect(result.messageDispatchPlan.entries.map((entry) => entry.scopeId)).toEqual([
      'left-filter',
      'right-filter',
    ]);
  });

  it('keeps descendant uses of one predefined Scope distinct and parent-consistent', () => {
    const input = makeInput();
    const users = input.units[USERS_PAGE];
    if (!users.elements) throw new Error('users fixture must define Elements');
    users.elements.children = [
      {
        kind: 'capsule',
        id: 'outer-filter',
        scope: { kind: 'ref', ref: ref('scope://#users-filter') },
        children: [
          {
            kind: 'capsule',
            id: 'inner-filter',
            scope: { kind: 'ref', ref: ref('scope://#users-filter') },
            children: [
              {
                kind: 'instance',
                tag: 'button',
                id: 'nested-search',
                command: ref('command://#users.search'),
              },
            ],
          },
        ],
      },
    ];

    const result = compileHalfcodeUnitBundle(input);
    const scopes = result.scopeRuntimePlans.filter((plan) =>
      ['outer-filter', 'inner-filter'].includes(plan.ownerElementId));
    const render = result.renderPlans.find((plan) => plan.unitFqn === USERS_PAGE);
    const outer = render?.root[0];
    const inner = outer?.children?.[0];

    expect(scopes).toMatchObject([
      {
        scopeId: 'outer-filter',
        parentScopeId: 'users-page',
        ownerElementId: 'outer-filter',
      },
      {
        scopeId: 'inner-filter',
        parentScopeId: 'outer-filter',
        ownerElementId: 'inner-filter',
      },
    ]);
    expect(outer?.scopeId).toBe('outer-filter');
    expect(inner?.scopeId).toBe('inner-filter');
    expect(inner?.children?.[0].scopeId).toBe('inner-filter');
    expect(result.messageDispatchPlan.entries).toMatchObject([
      { elementId: 'nested-search', scopeId: 'inner-filter' },
    ]);
  });

  it('contains no parentRef source guard in the canonical compiler', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/unitCompiler.ts'), 'utf8');
    expect(source).not.toContain('parentRef');
  });
});
