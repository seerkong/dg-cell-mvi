// @vitest-environment jsdom

import {
  readFileSync,
} from 'node:fs';
import {
  join,
} from 'node:path';
import {
  createApp,
  defineComponent,
  h,
  type App,
  type Component,
} from 'vue';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  validateEditorPresentation,
  validateStructureSchema,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';

import {
  BUSINESS_DIALECT_FACTORIES,
  BUSINESS_DIALECT_SHARED_CAPABILITY_KINDS,
  classifyBusinessAOverridePhone,
  classifyBusinessAPhone,
  classifyBusinessBPhone,
  createBusinessDialectScopeAssembly,
  transformBusinessAOverridePhone,
  transformBusinessAPhone,
  transformBusinessBPhone,
  type BusinessDialectEditorAssembly,
} from '../demo/schema-editor-business-dialect/boundedContext';
import {
  BUSINESS_DIALECT_INITIAL_VALUE,
  BUSINESS_DIALECT_PRESENTATIONS,
  BUSINESS_DIALECT_PRESENTER_IDS,
  BUSINESS_DIALECT_SHARED_SCHEMA,
} from '../demo/schema-editor-business-dialect/fixture';

const EMPTY = Object.freeze({});
const mountedApps: App[] = [];

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

describe('Schema Editor business dialect T3.1 Scope assembly', () => {
  it('keeps one schema identity while A/B select and mount different real controls', () => {
    const assembly = createBusinessDialectScopeAssembly(
      EMPTY,
      EMPTY,
      EMPTY,
    );
    const {
      businessA,
      businessB,
      businessAOverride,
    } = assembly.editors;

    expect(assembly.schema).toBe(BUSINESS_DIALECT_SHARED_SCHEMA);
    expect(businessA.schema).toBe(assembly.schema);
    expect(businessB.schema).toBe(assembly.schema);
    expect(businessAOverride.schema).toBe(assembly.schema);
    expect(businessA.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    );
    expect(businessB.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    );
    expect(businessAOverride.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    );

    const controlA = mountPhonePresenter(businessA);
    const controlB = mountPhonePresenter(businessB);
    expect(controlA.querySelector('input[type="tel"]')).not.toBeNull();
    expect(controlA.querySelector('textarea')).toBeNull();
    expect(controlB.querySelector('textarea')).not.toBeNull();
    expect(controlB.querySelector('input')).toBeNull();

    const componentA = resolvePhoneComponent(businessA);
    const componentB = resolvePhoneComponent(businessB);
    expect(componentA).not.toBe(componentB);
  });

  it('applies the editor-instance override only to its own sibling Scope', () => {
    const assembly = createBusinessDialectScopeAssembly(
      EMPTY,
      EMPTY,
      EMPTY,
    );
    const {
      businessA,
      businessB,
      businessAOverride,
    } = assembly.editors;

    expect(new Set([
      businessA.scopeId,
      businessB.scopeId,
      businessAOverride.scopeId,
    ]).size).toBe(3);
    expect(businessA.scopeRuntime.parent).toBe(assembly.rootRuntime);
    expect(businessB.scopeRuntime.parent).toBe(assembly.rootRuntime);
    expect(businessAOverride.scopeRuntime.parent).toBe(
      assembly.rootRuntime,
    );
    expect(businessA.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    );
    expect(businessAOverride.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    );
    expect(businessB.phonePresenterId).toBe(
      BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    );
    expect(
      businessA.presenterRegistry.resolve(
        BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
      ).ok,
    ).toBe(false);
    expect(
      businessB.presenterRegistry.resolve(
        BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
      ).ok,
    ).toBe(false);

    const overrideControl = mountPhonePresenter(businessAOverride);
    expect(
      overrideControl.querySelector(
        '[data-schema-editor-business-control="business-a-phone-override"]',
      ),
    ).not.toBeNull();
  });

  it('reuses T2.1 address/ref/enum capability identities and factories', () => {
    const assembly = createBusinessDialectScopeAssembly(
      EMPTY,
      EMPTY,
      EMPTY,
    );
    const editors = Object.values(assembly.editors);

    for (const kind of BUSINESS_DIALECT_SHARED_CAPABILITY_KINDS) {
      const expected = assembly.sharedCapabilities[kind];
      for (const editor of editors) {
        expect(editor.sharedCapsule.capabilities[kind]).toBe(expected);
        expect(
          editor.sharedCapsule.capabilities[kind].transformer,
        ).toBe(expected.transformer);
        expect(
          editor.sharedCapsule.capabilities[kind].presenter,
        ).toBe(expected.presenter);
      }
      const components = editors.map((editor) => {
        const resolution = editor.presenterRegistry.resolve(
          expected.presenterId,
        );
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) throw new Error(resolution.diagnostic.message);
        return resolution.adapter.component;
      });
      expect(new Set(components).size).toBe(1);
    }

    const firstFactories = editors[0]!.sharedCapsule.factories;
    for (const editor of editors.slice(1)) {
      expect(editor.sharedCapsule.factories).toBe(firstFactories);
    }
  });

  it('keeps compiler, presenter registry, Scope, and Session identities isolated', () => {
    const assembly = createBusinessDialectScopeAssembly(
      EMPTY,
      EMPTY,
      EMPTY,
    );
    const editors = Object.values(assembly.editors);

    const identityProjections: ReadonlyArray<
      (editor: BusinessDialectEditorAssembly) => unknown
    > = [
      (editor) => editor.compiler,
      (editor: BusinessDialectEditorAssembly) =>
        editor.presenterRegistry,
      (editor: BusinessDialectEditorAssembly) =>
        editor.scopeRuntime,
      (editor: BusinessDialectEditorAssembly) =>
        editor.sessionRuntime,
      (editor: BusinessDialectEditorAssembly) => editor.session,
      (editor: BusinessDialectEditorAssembly) => editor.valueHost,
    ];
    for (const project of identityProjections) {
      expect(new Set(editors.map(project)).size).toBe(3);
    }

    for (const editor of editors) {
      expect(
        editor.scopeRuntime.localBindings.schemaEditorCompiler,
      ).toBe(editor.compiler);
      expect(
        editor.scopeRuntime.localBindings
          .schemaEditorPresenterRegistry,
      ).toBe(editor.presenterRegistry);
      expect(editor.scopeRuntime.schemaEditor).toBeDefined();
    }

    assembly.editors.businessAOverride.session.dispose();
    expect(
      assembly.editors.businessAOverride.session.getState().disposed,
    ).toBe(true);
    expect(assembly.editors.businessA.session.getState().disposed)
      .toBe(false);
    expect(assembly.editors.businessB.session.getState().disposed)
      .toBe(false);
  });

  it('keeps schema and presentation as validated JSON-roundtrippable data', () => {
    expect(validateStructureSchema(BUSINESS_DIALECT_SHARED_SCHEMA))
      .toEqual({ ok: true, issues: [] });
    expectCodeFreeJson(BUSINESS_DIALECT_SHARED_SCHEMA);

    for (const presentation of Object.values(
      BUSINESS_DIALECT_PRESENTATIONS,
    )) {
      expect(validateEditorPresentation(presentation))
        .toEqual({ ok: true, issues: [] });
      expectCodeFreeJson(presentation);
    }
    expectCodeFreeJson(BUSINESS_DIALECT_INITIAL_VALUE);
  });

  it('keeps every owned classifier, transformer, and factory three-parameter', () => {
    for (const processor of [
      classifyBusinessAPhone,
      classifyBusinessBPhone,
      classifyBusinessAOverridePhone,
      transformBusinessAPhone,
      transformBusinessBPhone,
      transformBusinessAOverridePhone,
      ...Object.values(BUSINESS_DIALECT_FACTORIES),
    ]) {
      expect(processor).toHaveLength(3);
    }

    const assembly = createBusinessDialectScopeAssembly(
      EMPTY,
      EMPTY,
      EMPTY,
    );
    for (const editor of Object.values(assembly.editors)) {
      expect(editor.compiler.dialect.classify).toHaveLength(3);
      for (const transformer of Object.values(
        editor.compiler.dialect.transformers ?? {},
      )) {
        expect(transformer).toHaveLength(3);
      }
    }
  });

  it('leaves canonical lowering, loader, app runtime, and public demo entry to T3.2', () => {
    const root = join(
      process.cwd(),
      'demo',
      'schema-editor-business-dialect',
    );
    const source = [
      'fixture.ts',
      'boundedContextPresenters.ts',
      'boundedContext.ts',
    ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');

    expect(source).not.toMatch(
      /\b(?:lowerEditorPlan|loadHalfcodeAppRuntime|CanonicalHalfcodeRenderer)\b/,
    );
  });
});

function resolvePhoneComponent(
  editor: BusinessDialectEditorAssembly,
): Component {
  const resolution = editor.presenterRegistry.resolve(
    editor.phonePresenterId,
  );
  expect(resolution.ok).toBe(true);
  if (!resolution.ok) throw new Error(resolution.diagnostic.message);
  return resolution.adapter.component;
}

function mountPhonePresenter(
  editor: BusinessDialectEditorAssembly,
): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const events: SchemaEditorPresenterEvent[] = [];
  const value = editor.session.getState().snapshot.value as
    Readonly<{ user: Readonly<Record<string, unknown>> }>;
  const props: SchemaEditorPresenterProps = {
    node: editor.phoneNode,
    value: value.user.phone as string,
    path: editor.phoneNode.path,
    presenterOptions: editor.phoneNode.presenter?.options,
    pending: false,
    diagnostics: Object.freeze([]),
    eventContext: Object.freeze({
      wildcardBindings: Object.freeze([]),
    }),
    onSchemaEditorEvent: (event) => events.push(event),
  };
  const app = createApp(defineComponent({
    setup: () => () => h(resolvePhoneComponent(editor), props),
  }));
  app.mount(target);
  mountedApps.push(app);
  return target;
}

function expectCodeFreeJson(value: unknown): void {
  const seen = new Set<unknown>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') {
      expect(typeof candidate).not.toBe('function');
      return;
    }
    expect([
      Object.prototype,
      Array.prototype,
      null,
    ]).toContain(Object.getPrototypeOf(candidate));
    if (seen.has(candidate)) return;
    seen.add(candidate);
    for (const child of Object.values(candidate)) visit(child);
  };
  visit(value);
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}
