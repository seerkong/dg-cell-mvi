// @vitest-environment jsdom

import {
  readFile,
} from 'node:fs/promises';
import {
  join,
} from 'node:path';
import {
  createApp,
  defineComponent,
  h,
  type Component,
} from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  EditorPlan,
  RenderNodePlan,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  HalfcodeAppRuntime,
  SchemaEditorSession,
  SchemaEditorSessionState,
  SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';
import {
  createSchemaEditorPresenterRegistry,
  type CanonicalComponentRegistry,
  type SchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import * as elementPlusPackage from 'dg-cell-mvi-halfcode-element-plus';

type CanonicalCompositionResult =
  | Readonly<{
      ok: true;
      registry: CanonicalComponentRegistry;
      presenterRegistry: SchemaEditorPresenterRegistry;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly Readonly<{
        code: string;
        message: string;
      }>[];
    }>;

type CanonicalCompositionFactory = (
  runtime: Readonly<{
    parentRegistry?: CanonicalComponentRegistry;
    presenterRegistries?: readonly SchemaEditorPresenterRegistry[];
  }>,
  input: Readonly<Record<string, never>>,
  config: Readonly<{
    presenterConflict: 'reject' | 'last-wins';
    componentIdentity: 'Editor';
  }>,
) => CanonicalCompositionResult;

const packageValues = elementPlusPackage as unknown as Record<string, unknown>;
const createCanonicalRegistry =
  packageValues.createElementPlusSchemaEditorCanonicalRegistry as
    | CanonicalCompositionFactory
    | undefined;
const publicApiAvailable = typeof createCanonicalRegistry === 'function';

const CONFIG = Object.freeze({
  presenterConflict: 'last-wins',
  componentIdentity: 'Editor',
} as const);

function businessRegistry(
  id: string,
  component: Component,
): SchemaEditorPresenterRegistry {
  const result = createSchemaEditorPresenterRegistry(
    Object.freeze({}),
    {
      entries: Object.freeze([
        Object.freeze({
          id,
          adapter: Object.freeze({ component }),
        }),
      ]),
    },
    { duplicate: 'reject' },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.registry;
}

function expectInvalid(result: CanonicalCompositionResult): void {
  expect(result).toEqual({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: expect.stringMatching(
          /INVALID|DUPLICATE_SCHEMA_EDITOR_PRESENTER/,
        ),
        message: expect.any(String),
      }),
    ],
  });
}

describe('Element Plus Schema Editor canonical composition T4.2 RED', () => {
  it('exports one three-parameter canonical composition helper', () => {
    expect({
      type: typeof createCanonicalRegistry,
      arity: createCanonicalRegistry?.length,
    }).toEqual({
      type: 'function',
      arity: 3,
    });
  });
});

describe.runIf(publicApiAvailable)(
  'Element Plus Schema Editor canonical composition helper',
  () => {
    it('creates isolated frozen defaults and delegates non-Editor identities', () => {
      const first = createCanonicalRegistry!({}, {}, CONFIG);
      const second = createCanonicalRegistry!({}, {}, CONFIG);

      expect(first).toMatchObject({ ok: true, diagnostics: [] });
      expect(second).toMatchObject({ ok: true, diagnostics: [] });
      if (!first.ok || !second.ok) return;
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.presenterRegistry)).toBe(true);
      expect(first.registry).not.toBe(second.registry);
      expect(first.presenterRegistry).not.toBe(second.presenterRegistry);
      expect(first.presenterRegistry.resolve('scalar.text')).toMatchObject({
        ok: true,
        id: 'scalar.text',
      });
      expect(first.registry.resolve('ElButton')).toBeDefined();
    });

    it('composes default then ordered business registries with explicit conflict', () => {
      const BusinessText = defineComponent({
        name: 'BusinessTextPresenter',
        setup: () => () => h('input', { 'data-business-text': '' }),
      });
      const business = businessRegistry('scalar.text', BusinessText);
      const accepted = createCanonicalRegistry!(
        { presenterRegistries: Object.freeze([business]) },
        {},
        CONFIG,
      );
      const rejected = createCanonicalRegistry!(
        { presenterRegistries: Object.freeze([business]) },
        {},
        {
          presenterConflict: 'reject',
          componentIdentity: 'Editor',
        },
      );
      const freshDefault = createCanonicalRegistry!({}, {}, CONFIG);

      expect(accepted).toMatchObject({ ok: true, diagnostics: [] });
      if (accepted.ok) {
        expect(accepted.presenterRegistry.resolve('scalar.text')).toMatchObject({
          ok: true,
          adapter: { component: BusinessText },
        });
      }
      expectInvalid(rejected);
      expect(freshDefault).toMatchObject({ ok: true });
      if (freshDefault.ok) {
        expect(freshDefault.presenterRegistry.resolve('scalar.text')).not.toMatchObject({
          adapter: { component: BusinessText },
        });
      }
    });

    it('preserves one-argument parents and forwards the canonical context', () => {
      const parentResolve = vi.fn((identity: unknown) => (
        identity === 'LegacyPanel' ? 'aside' : undefined
      ));
      const result = createCanonicalRegistry!(
        { parentRegistry: { resolve: parentResolve } },
        {},
        CONFIG,
      );
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;

      const node = Object.freeze({ id: 'node' }) as unknown as RenderNodePlan;
      const plan = Object.freeze({
        unitFqn: 'dg.schemaEditor.$CanonicalComposition',
        root: Object.freeze([node]),
      }) as unknown as UnitRenderPlan;
      const runtime = Object.freeze({}) as HalfcodeAppRuntime;
      const context = Object.freeze({ node, plan, runtime });

      expect(result.registry.resolve('LegacyPanel', context)).toBe('aside');
      expect(parentResolve).toHaveBeenCalledWith('LegacyPanel', context);
    });

    it('resolves Editor against the current unit Scope without exposing host capabilities', () => {
      const state: SchemaEditorSessionState = Object.freeze({
        sessionId: 'profile-session',
        snapshot: Object.freeze({
          value: Object.freeze({ title: 'before' }),
          revision: 'r1',
        }),
        pending: Object.freeze([]),
        diagnostics: Object.freeze([]),
        disposed: false,
      });
      const session: SchemaEditorSession = Object.freeze({
        getState: () => state,
        subscribe: () => () => undefined,
        dispatch: vi.fn(async () => undefined),
        dispose: vi.fn(),
      });
      const valueHost: SchemaEditorValueHost = vi.fn();
      const scope = Object.freeze({
        schemaEditor: Object.freeze({
          valueHosts: Object.freeze({ 'profile-host': valueHost }),
          sessions: Object.freeze({ 'profile-session': session }),
        }),
      });
      const resolveScope = vi.fn(() => scope);
      const runtime = Object.freeze({ resolveScope }) as unknown as HalfcodeAppRuntime;
      const renderNode = Object.freeze({
        kind: 'atom',
        id: 'profile-editor',
        tag: 'schemaEditor.Editor',
        library: 'schemaEditor',
        scopeId: 'profile-scope',
        inlineProps: Object.freeze({}),
      }) as unknown as RenderNodePlan;
      const unitPlan = Object.freeze({
        unitFqn: 'dg.schemaEditor.$Profile',
        root: Object.freeze([renderNode]),
      }) as unknown as UnitRenderPlan;
      const editorPlan: EditorPlan = Object.freeze({
        kind: 'editor-plan',
        id: 'profile',
        root: Object.freeze({
          kind: 'field',
          id: 'profile.title',
          path: Object.freeze(['title']),
          metadata: Object.freeze({
            display: Object.freeze({
              label: 'Title',
              visible: true,
              readOnly: false,
            }),
            scalar: Object.freeze({ kind: 'string' }),
          }),
          presenter: Object.freeze({ id: 'scalar.text' }),
          commandBindings: Object.freeze([]),
        }),
      });
      const result = createCanonicalRegistry!({}, {}, CONFIG);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      const Editor = result.registry.resolve('Editor', {
        runtime,
        plan: unitPlan,
        node: renderNode,
      });
      expect(Editor).toBeDefined();

      const target = document.createElement('div');
      const app = createApp(Editor as Component, {
        plan: editorPlan,
        scopeBridge: Object.freeze({
          valueHostId: 'profile-host',
          sessionId: 'profile-session',
        }),
        uiLibrary: 'schemaEditor',
      });
      try {
        app.mount(target);
        expect(resolveScope).toHaveBeenCalledWith(
          unitPlan.unitFqn,
          'profile-scope',
        );
        expect(
          (target.querySelector('input') as HTMLInputElement | null)?.value,
        ).toBe('before');
      } finally {
        app.unmount();
      }
    });

    it('fails closed for accessor, revoked and malformed composition inputs', () => {
      let accessorReads = 0;
      const accessorRuntime = Object.defineProperty({}, 'parentRegistry', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return { resolve: () => undefined };
        },
      });
      const accessorParent = Object.defineProperty({}, 'resolve', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return () => undefined;
        },
      });
      const revokedRuntime = Proxy.revocable({}, {});
      const revokedInput = Proxy.revocable({}, {});
      const revokedConfig = Proxy.revocable({}, {});
      const revokedRegistries = Proxy.revocable([], {});
      const revokedParent = Proxy.revocable({ resolve: () => undefined }, {});
      revokedRuntime.revoke();
      revokedInput.revoke();
      revokedConfig.revoke();
      revokedRegistries.revoke();
      revokedParent.revoke();

      const cases: readonly [unknown, unknown, unknown][] = [
        [accessorRuntime, {}, CONFIG],
        [{ parentRegistry: accessorParent }, {}, CONFIG],
        [revokedRuntime.proxy, {}, CONFIG],
        [{}, revokedInput.proxy, CONFIG],
        [{}, {}, revokedConfig.proxy],
        [{ presenterRegistries: revokedRegistries.proxy }, {}, CONFIG],
        [{ parentRegistry: revokedParent.proxy }, {}, CONFIG],
        [{}, { unexpected: true }, CONFIG],
        [{}, {}, { ...CONFIG, unexpected: true }],
        [{}, {}, { presenterConflict: 'implicit', componentIdentity: 'Editor' }],
        [{}, {}, { presenterConflict: 'last-wins', componentIdentity: 'Other' }],
      ];

      for (const [runtime, input, config] of cases) {
        expect(() => createCanonicalRegistry!(
          runtime as never,
          input as never,
          config as never,
        )).not.toThrow();
        expectInvalid(createCanonicalRegistry!(
          runtime as never,
          input as never,
          config as never,
        ));
      }
      expect(accessorReads).toBe(0);
    });

    it('contains only composition code and owns no editor runtime capability', async () => {
      const source = await readFile(
        join(
          process.cwd(),
          'src/schema-editor/canonicalComposition.ts',
        ),
        'utf8',
      );
      expect(source).not.toMatch(
        /ValueHost|createSchemaEditorSession|resolveSchemaEditorScopeBridge|lowerEditorPlan|loadHalfcodeAppRuntime|CanonicalHalfcodeRenderer|renderSchemaEditorNode/,
      );
    });
  },
);
