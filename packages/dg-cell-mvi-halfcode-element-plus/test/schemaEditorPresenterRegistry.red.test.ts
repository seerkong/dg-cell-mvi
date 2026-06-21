import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import * as elementPlusPackage from 'dg-cell-mvi-halfcode-element-plus';

const DEFAULT_PRESENTER_IDS = Object.freeze([
  'object.group',
  'scalar.text',
  'scalar.number',
  'scalar.boolean',
  'scalar.null',
  'scalar.enum',
  'scalar.const',
  'collection.list',
  'map.entries',
  'structured-value.modal',
  'union.select',
  'schema.ref',
  'unsupported',
  'scalar.email',
  'scalar.password',
  'scalar.textarea',
  'scalar.multiline',
  'scalar.url',
  'scalar.uri',
  'scalar.tel',
  'scalar.phone',
  'scalar.date',
  'scalar.time',
  'scalar.datetime',
  'scalar.date-time',
  'scalar.color',
  'scalar.currency',
] as const);

const PUBLIC_FACTORIES = [
  'createElementPlusSchemaEditorPresenterRegistry',
  'composeElementPlusSchemaEditorPresenterRegistries',
] as const;

type PresenterAdapter = Readonly<{ component: unknown }>;
type PresenterEntry = Readonly<{ id: string; adapter: PresenterAdapter }>;
type RegistryDiagnostic = Readonly<{
  code: string;
  id: string;
  message: string;
}>;
type PresenterResolution =
  | Readonly<{ ok: true; id: string; adapter: PresenterAdapter }>
  | Readonly<{ ok: false; id: string; diagnostic: RegistryDiagnostic }>;
type PresenterRegistry = Readonly<{
  entries: readonly PresenterEntry[];
  resolve(id: string): PresenterResolution;
}>;
type RegistryResult =
  | Readonly<{ ok: true; registry: PresenterRegistry; diagnostics: readonly [] }>
  | Readonly<{ ok: false; diagnostics: readonly RegistryDiagnostic[] }>;
type DefaultRegistryFactory = (
  runtime: unknown,
  input: unknown,
  config: unknown,
) => RegistryResult;
type ComposeRegistryFactory = (
  runtime: Readonly<{ registries: readonly PresenterRegistry[] }>,
  input: unknown,
  config: Readonly<{ conflict: 'reject' | 'last-wins' }>,
) => RegistryResult;

const packageValues = elementPlusPackage as unknown as Record<string, unknown>;
const createDefaultRegistry =
  packageValues.createElementPlusSchemaEditorPresenterRegistry as
    | DefaultRegistryFactory
    | undefined;
const composeRegistries =
  packageValues.composeElementPlusSchemaEditorPresenterRegistries as
    | ComposeRegistryFactory
    | undefined;
const publicApiAvailable = PUBLIC_FACTORIES.every(
  (name) => typeof packageValues[name] === 'function',
);

function expectInvalidInput(result: RegistryResult): void {
  expect(result).toEqual({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
      }),
    ],
  });
}

function createBusinessRegistry(
  id: string,
  componentName: string,
): PresenterRegistry {
  const component = defineComponent({
    name: componentName,
    setup: () => () => h('div', componentName),
  });
  const adapter = Object.freeze({ component });
  const entry = Object.freeze({ id, adapter });
  const entries = Object.freeze([entry]);
  return Object.freeze({
    entries,
    resolve(requestedId: string): PresenterResolution {
      if (requestedId === id) {
        return Object.freeze({ ok: true, id, adapter });
      }
      return Object.freeze({
        ok: false,
        id: requestedId,
        diagnostic: Object.freeze({
          code: 'UNKNOWN_SCHEMA_EDITOR_PRESENTER',
          id: requestedId,
          message: `Presenter id "${requestedId}" is not registered.`,
        }),
      });
    },
  });
}

describe('Element Plus Schema Editor presenter registry T1.1 RED', () => {
  it('exports both three-parameter registry factories from the package root', () => {
    expect(Object.fromEntries(PUBLIC_FACTORIES.map((name) => [
      name,
      {
        type: typeof packageValues[name],
        arity: typeof packageValues[name] === 'function'
          ? (packageValues[name] as (...args: unknown[]) => unknown).length
          : undefined,
      },
    ]))).toEqual(Object.fromEntries(PUBLIC_FACTORIES.map((name) => [
      name,
      { type: 'function', arity: 3 },
    ])));
  });
});

describe.runIf(publicApiAvailable)(
  'Element Plus Schema Editor presenter registry public contract',
  () => {
    it('freezes the complete compiler-default and common-format id snapshot', () => {
      const result = createDefaultRegistry!({}, {}, {});

      expect(result).toMatchObject({ ok: true, diagnostics: [] });
      if (!result.ok) return;
      expect(result.registry.entries.map(({ id }) => id)).toEqual(
        DEFAULT_PRESENTER_IDS,
      );
      expect(new Set(result.registry.entries.map(({ id }) => id)).size).toBe(
        DEFAULT_PRESENTER_IDS.length,
      );
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.registry)).toBe(true);
      expect(Object.isFrozen(result.registry.entries)).toBe(true);
      for (const entry of result.registry.entries) {
        expect(Object.isFrozen(entry)).toBe(true);
        expect(result.registry.resolve(entry.id)).toEqual({
          ok: true,
          id: entry.id,
          adapter: entry.adapter,
        });
      }
      expect(result.registry.resolve('scalar.business-only')).toEqual({
        ok: false,
        id: 'scalar.business-only',
        diagnostic: expect.objectContaining({
          code: 'UNKNOWN_SCHEMA_EDITOR_PRESENTER',
          id: 'scalar.business-only',
        }),
      });
    });

    it('rejects duplicate composition unless the caller explicitly selects last-wins', () => {
      const first = createDefaultRegistry!({}, {}, {});
      const second = createDefaultRegistry!({}, {}, {});
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      const rejected = composeRegistries!(
        { registries: [first.registry, second.registry] },
        {},
        { conflict: 'reject' },
      );
      expect(rejected).toEqual({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: 'DUPLICATE_SCHEMA_EDITOR_PRESENTER',
            id: DEFAULT_PRESENTER_IDS[0],
          }),
        ],
      });

      const invalidPolicy = composeRegistries!(
        { registries: [first.registry, second.registry] },
        {},
        {} as { conflict: 'reject' },
      );
      expectInvalidInput(invalidPolicy);

      const business = createBusinessRegistry(
        'scalar.text',
        'BusinessTextPresenter',
      );
      const composed = composeRegistries!(
        { registries: [first.registry, business] },
        {},
        { conflict: 'last-wins' },
      );
      expect(composed.ok).toBe(true);
      if (!composed.ok) return;
      expect(composed.registry.resolve('scalar.text')).toEqual(
        business.resolve('scalar.text'),
      );
    });

    it('keeps default instances isolated when a later business registry overrides one id', () => {
      const first = createDefaultRegistry!({}, {}, {});
      const second = createDefaultRegistry!({}, {}, {});
      const business = createBusinessRegistry(
        'scalar.text',
        'BoundedContextTextPresenter',
      );
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      const firstTextBefore = first.registry.resolve('scalar.text');
      const secondTextBefore = second.registry.resolve('scalar.text');
      const composed = composeRegistries!(
        { registries: [first.registry, business] },
        {},
        { conflict: 'last-wins' },
      );
      expect(composed.ok).toBe(true);
      if (!composed.ok) return;

      expect(first.registry).not.toBe(second.registry);
      expect(first.registry.entries).not.toBe(second.registry.entries);
      expect(composed.registry).not.toBe(first.registry);
      expect(composed.registry).not.toBe(second.registry);
      expect(composed.registry.resolve('scalar.text')).toEqual(
        business.resolve('scalar.text'),
      );
      expect(first.registry.resolve('scalar.text')).toEqual(firstTextBefore);
      expect(second.registry.resolve('scalar.text')).toEqual(secondTextBefore);

      const third = createDefaultRegistry!({}, {}, {});
      expect(third.ok).toBe(true);
      if (!third.ok) return;
      expect(third.registry.resolve('scalar.text')).toEqual(secondTextBefore);
    });

    it('fails closed for revoked top-level and nested inputs without throwing', () => {
      const revokedRuntime = Proxy.revocable({}, {});
      const revokedInput = Proxy.revocable({}, {});
      const revokedConfig = Proxy.revocable({}, {});
      const revokedRegistries = Proxy.revocable([], {});
      revokedRuntime.revoke();
      revokedInput.revoke();
      revokedConfig.revoke();
      revokedRegistries.revoke();

      for (const args of [
        [revokedRuntime.proxy, {}, {}],
        [{}, revokedInput.proxy, {}],
        [{}, {}, revokedConfig.proxy],
      ] as const) {
        expect(() => createDefaultRegistry!(...args)).not.toThrow();
        expectInvalidInput(createDefaultRegistry!(...args));
      }

      const composeArgs = [
        [revokedRuntime.proxy, {}, { conflict: 'reject' }],
        [{ registries: revokedRegistries.proxy }, {}, { conflict: 'reject' }],
        [{ registries: [] }, revokedInput.proxy, { conflict: 'reject' }],
        [{ registries: [] }, {}, revokedConfig.proxy],
      ] as const;
      const callCompose = composeRegistries as unknown as (
        ...args: readonly unknown[]
      ) => RegistryResult;
      for (const args of composeArgs) {
        expect(() => callCompose(...args)).not.toThrow();
        expectInvalidInput(callCompose(...args));
      }
    });

    it('reads only own data descriptors and never invokes hostile accessors', () => {
      let accessorReads = 0;
      const accessor = (field: string): object => Object.defineProperty(
        {},
        field,
        {
          enumerable: true,
          get() {
            accessorReads += 1;
            return [];
          },
        },
      );

      expectInvalidInput(createDefaultRegistry!(accessor('runtime'), {}, {}));
      expectInvalidInput(createDefaultRegistry!({}, accessor('input'), {}));
      expectInvalidInput(createDefaultRegistry!({}, {}, accessor('config')));
      expectInvalidInput(composeRegistries!(
        accessor('registries') as { registries: readonly PresenterRegistry[] },
        {},
        { conflict: 'reject' },
      ));
      const defaultRegistry = createDefaultRegistry!({}, {}, {});
      expect(defaultRegistry.ok).toBe(true);
      if (!defaultRegistry.ok) return;
      const nestedAccessor = [defaultRegistry.registry];
      Object.defineProperty(nestedAccessor, '0', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return defaultRegistry.registry;
        },
      });
      expectInvalidInput(composeRegistries!(
        { registries: nestedAccessor },
        {},
        { conflict: 'reject' },
      ));
      expect(accessorReads).toBe(0);
    });
  },
);
