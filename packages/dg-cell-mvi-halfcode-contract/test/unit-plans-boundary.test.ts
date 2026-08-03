import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  asHalfcodeRef,
  asUnitFqn,
  type AdminShellPlanV3,
  type MessageDispatchPlan,
  type ScopeRuntimePlan,
  type UnitCompileDocumentProjection,
  type UnitCompileInput,
  type UnitCompileResult,
  type UnitRenderPlan,
  type WiringPlan,
} from '../src';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

type DocumentProjectionRejectsDefinitionSource = Expect<
  Equal<HasKey<UnitCompileDocumentProjection, 'definitionSource'>, false>
>;
type DocumentProjectionRejectsRawSource = Expect<
  Equal<HasKey<UnitCompileDocumentProjection, 'rawSource'>, false>
>;
type DocumentProjectionRejectsXnlDocument = Expect<
  Equal<HasKey<UnitCompileDocumentProjection, 'xnlDocument'>, false>
>;

interface LoadedDocumentProjectionSuperset extends UnitCompileDocumentProjection {
  readonly definitionSource: {
    readonly path: string;
    readonly text: string;
    readonly xnlDocument: unknown;
  };
  readonly rawSource: {
    readonly path: string;
    readonly text: string;
    readonly xnlDocument: unknown;
  };
}

const loaderDocumentProjection: LoadedDocumentProjectionSuperset = {
  sourceDescriptor: {
    kind: 'inline',
    unitSourceRef: asHalfcodeRef('vfs://@/documents/system-design.xnl'),
    region: 'body',
  },
  definitionSource: {
    path: '/documents/system-design.xnl',
    text: '<Document #dg.docs.SystemDesign>',
    xnlDocument: { nodes: [] },
  },
  rawSource: {
    path: '/documents/system-design.xnl',
    text: '<Document #dg.docs.SystemDesign>',
    xnlDocument: { nodes: [] },
  },
  rootNodeId: 'dg.docs.SystemDesign',
  skeleton: [],
};
const compileDocumentProjection: UnitCompileDocumentProjection = loaderDocumentProjection;
type DocumentProjectionAssertions = [
  DocumentProjectionRejectsDefinitionSource,
  DocumentProjectionRejectsRawSource,
  DocumentProjectionRejectsXnlDocument,
];

void [compileDocumentProjection];
void (undefined as unknown as DocumentProjectionAssertions);

describe('v3 unit compile plans (P1 boundary)', () => {
  it('plan and input types round-trip through JSON (fully serializable)', () => {
    const adminShellPlan: AdminShellPlanV3 = {
      id: 'basic-admin.admin-shell-plan-v3',
      bundleId: 'basic-admin',
      product: { id: 'dg.admin.basic', version: '2.0.0', productLine: 'admin' },
      routes: [
        {
          id: 'users-route',
          path: '/users',
          title: '用户',
          menu: { icon: 'user', order: 1 },
          pageFqn: asUnitFqn('dg.admin.basic.UsersPage'),
          children: [
            {
              id: 'users-report-route',
              path: '/users/reports/:id',
              title: '用户报表',
              pageFqn: asUnitFqn('dg.admin.basic.ReportDetailPage'),
            },
          ],
        },
      ],
    };

    const renderPlan: UnitRenderPlan = {
      id: 'dg.admin.basic.UsersPage.unit-render-plan',
      unitFqn: asUnitFqn('dg.admin.basic.UsersPage'),
      unitKind: 'page',
      title: '用户',
      root: [
        { kind: 'atom', id: 'users-title', tag: 'h1', inlineProps: { text: '用户管理' } },
        {
          kind: 'capsule',
          id: 'users-filter',
          scopeId: 'users-filter',
          children: [
            {
              kind: 'atom',
              id: 'keyword-input',
              tag: 'elementPlus.ElInput',
              library: 'elementPlus',
              scopeId: 'users-filter',
              propsBinding: asHalfcodeRef('config://#users-filter/keywordInput'),
            },
          ],
        },
        {
          kind: 'component',
          id: 'users-table',
          tag: 'dg.materials.CrudTable',
          fqn: asUnitFqn('dg.materials.CrudTable'),
          inlineProps: { pageSize: 20 },
          slots: [
            {
              id: 'toolbar',
              children: [
                {
                  kind: 'component',
                  id: 'selected-badge',
                  tag: 'dg.materials.StatusBadge',
                  fqn: asUnitFqn('dg.materials.StatusBadge'),
                  inlineProps: { status: 'info' },
                },
              ],
            },
          ],
        },
        {
          kind: 'page-embed',
          id: 'report-embed',
          tag: 'dg.admin.basic.ReportDetailPage',
          pageFqn: asUnitFqn('dg.admin.basic.ReportDetailPage'),
          urlInputsBinding: asHalfcodeRef('config://#report-embed/url'),
        },
      ],
    };

    const scopeRuntimePlans: ScopeRuntimePlan[] = [
      {
        scopeId: 'users-page',
        ownerElementId: 'users-page-elements',
        unitFqn: asUnitFqn('dg.admin.basic.UsersPage'),
        runtime: asHalfcodeRef('runtime://#users-page'),
        config: asHalfcodeRef('config://#users-page'),
        commands: asHalfcodeRef('command://#users-page-commands'),
        events: asHalfcodeRef('event://#users-page-events'),
        messagePolicy: { default: 'bubble' },
      },
      {
        scopeId: 'users-filter',
        parentScopeId: 'users-page',
        ownerElementId: 'users-filter',
        unitFqn: asUnitFqn('dg.admin.basic.UsersPage'),
        config: asHalfcodeRef('config://#users-filter'),
      },
    ];

    const messageDispatchPlan: MessageDispatchPlan = {
      id: 'basic-admin.message-dispatch-plan',
      entries: [
        {
          unitFqn: asUnitFqn('dg.admin.basic.UsersPage'),
          elementId: 'keyword-input',
          scopeId: 'users-filter',
          kind: 'command',
          command: asHalfcodeRef('command://#users.search'),
          commandType: 'users.search',
          handler: asHalfcodeRef('vfs://./command-handlers/users.command-handlers.ts#searchUsers'),
          config: { debounceMs: 150 },
        },
      ],
    };

    const wiringPlan: WiringPlan = {
      id: 'basic-admin.wiring-plan',
      wires: [
        {
          fromRouteId: 'report-detail-route',
          toRouteId: 'users-route',
          fromPageFqn: asUnitFqn('dg.admin.basic.ReportDetailPage'),
          toPageFqn: asUnitFqn('dg.admin.basic.UsersPage'),
          message: asHalfcodeRef('event://#report.saved'),
        },
      ],
    };

    const result: UnitCompileResult = {
      adminShellPlan,
      renderPlans: [renderPlan],
      documentPlans: [],
      wiringPlan,
      scopeRuntimePlans,
      messageDispatchPlan,
      diagnostics: [
        {
          severity: 'warning',
          code: 'HALFCODE_MESSAGE_UNWIRED',
          message: 'Page sends "command://#users.selected" with no app wiring.',
        },
      ],
    };

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);

    const input: UnitCompileInput = {
      manifest: { id: 'basic-admin', apiVersion: 'halfcode.dg-cell-mvi/v3', domains: [], units: [] },
      app: { routes: [], wiring: [], domains: {} },
      units: {},
      registry: {},
    };
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });

  it('plans partition only depends on contract v3 unit types (no v2, no cross-package imports)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/unit/plans.ts'),
      'utf8',
    );
    const importSpecifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    for (const specifier of importSpecifiers) {
      expect(specifier).toMatch(/^\.\//);
    }
    expect(source).not.toMatch(/from\s+'\.\.\//);
    expect(source).not.toMatch(/\b(ViewNodeSpec|HalfcodeElement|HalfcodeMaterial|AdminRouteSpec)\b/);
    expect(source).not.toMatch(/\b(permissionRef|propsRef|urlInputsRef|commandRef|scopeRef|contractRef)\??\s*:/);
  });
});
