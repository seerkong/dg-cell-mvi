// @vitest-environment jsdom

import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  join,
  relative,
} from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { nextTick } from 'vue';
import {
  validateEditorPresentation,
  validateStructureSchema,
  type EditorPlan,
  type EditorPresentation,
  type SchemaEditorCommand,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  HalfcodeAppRuntime,
  LoweredEditorPlanSourceBundle,
  SchemaEditorApplyRequest,
  SchemaEditorSession,
} from 'dg-cell-mvi-halfcode-support';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';

const DEMO_ROOT = join(
  process.cwd(),
  'demo',
  'schema-editor-business-dialect',
);
const REQUIRED_DEMO_FILES = [
  'index.ts',
  'fixture.ts',
  'runtime.ts',
  'presenters.ts',
] as const;
const requiredDemoPaths = REQUIRED_DEMO_FILES.map((file) =>
  join(DEMO_ROOT, file));
const demoEntryAvailable = requiredDemoPaths.every(existsSync);
const DEMO_MODULE = '../demo/schema-editor-business-dialect';

interface SharedCapabilityIdentity {
  readonly transformer: unknown;
  readonly presenter: unknown;
}

interface BusinessEditorHarness {
  readonly id: 'business-a' | 'business-b' | 'business-a-override';
  readonly scopeId: string;
  readonly schema: StructureSchema;
  readonly presentation: EditorPresentation;
  readonly plan: EditorPlan;
  readonly phonePresenterId: string;
  readonly capabilities: Readonly<Record<
    'address' | 'entityRef' | 'enum',
    SharedCapabilityIdentity
  >>;
  readonly presenterRegistry: SchemaEditorPresenterRegistry;
  readonly session: SchemaEditorSession;
  readonly sourceBundle: LoweredEditorPlanSourceBundle;
  readonly appRuntime: HalfcodeAppRuntime;
  readonly target: Element;
  readonly diagnostics: readonly string[];
  readonly presenterEvents: readonly SchemaEditorPresenterEvent[];
  dispose(): void;
  readonly host: Readonly<{
    readonly requests: readonly SchemaEditorApplyRequest[];
    setNextOutcome(
      outcome:
        | 'accepted'
        | 'pending'
        | 'rejected'
        | 'conflict'
        | 'stale'
        | 'malformed',
    ): void;
    resolvePending(): void;
  }>;
}

interface MountedBusinessDialectDemo {
  readonly schema: StructureSchema;
  readonly presentations: Readonly<Record<string, EditorPresentation>>;
  readonly sharedCapabilities: Readonly<Record<
    'address' | 'entityRef' | 'enum',
    SharedCapabilityIdentity
  >>;
  readonly editors: Readonly<{
    businessA: BusinessEditorHarness;
    businessB: BusinessEditorHarness;
    businessAOverride: BusinessEditorHarness;
  }>;
  dispose(): void;
}

interface BusinessDialectDemoApi {
  readonly BUSINESS_DIALECT_SHARED_SCHEMA: StructureSchema;
  readonly BUSINESS_DIALECT_PRESENTATIONS:
    Readonly<Record<string, EditorPresentation>>;
  readonly BUSINESS_DIALECT_PRESENTER_IDS: Readonly<{
    businessAPhone: string;
    businessBPhone: string;
    businessAOverridePhone: string;
    address: string;
    entityRef: string;
    enum: string;
  }>;
  readonly createSharedBusinessPropertyCapsule: Function;
  readonly createSchemaEditorBusinessDialectDemoRuntime: Function;
  readonly mountSchemaEditorBusinessDialectDemo:
    (target: Element) => Promise<MountedBusinessDialectDemo>;
}

const demoApi = demoEntryAvailable
  ? await vi.importActual<BusinessDialectDemoApi>(DEMO_MODULE)
  : undefined;
const mountedDemos: MountedBusinessDialectDemo[] = [];

afterEach(() => {
  for (const mounted of mountedDemos.splice(0)) mounted.dispose();
  document.body.replaceChildren();
});

describe('Schema Editor business dialect demo public RED contract', () => {
  it('requires one public entry plus fixture, runtime, and presenter owners', () => {
    const missing = requiredDemoPaths
      .filter((file) => !existsSync(file))
      .map((file) => relative(process.cwd(), file));

    expect(
      missing,
      'T1.1 RED: business demo public entry/fixture/runtime is not implemented',
    ).toEqual([]);
    expect(demoApi).toEqual(expect.objectContaining({
      BUSINESS_DIALECT_SHARED_SCHEMA: expect.any(Object),
      BUSINESS_DIALECT_PRESENTATIONS: expect.any(Object),
      BUSINESS_DIALECT_PRESENTER_IDS: expect.any(Object),
      createSharedBusinessPropertyCapsule: expect.any(Function),
      createSchemaEditorBusinessDialectDemoRuntime: expect.any(Function),
      mountSchemaEditorBusinessDialectDemo: expect.any(Function),
    }));
    expect(demoApi?.createSharedBusinessPropertyCapsule).toHaveLength(3);
    expect(demoApi?.createSchemaEditorBusinessDialectDemoRuntime)
      .toHaveLength(3);
  });
});

describe.runIf(demoApi !== undefined)(
  'Schema Editor business dialect canonical runtime contract',
  () => {
    it('reuses one pure schema while A/B mount different stable phone controls', async () => {
      const mounted = await mountDemo();
      const {
        businessA,
        businessB,
        businessAOverride,
      } = mounted.editors;

      expect(mounted.schema).toBe(demoApi!.BUSINESS_DIALECT_SHARED_SCHEMA);
      expect(businessA.schema).toBe(mounted.schema);
      expect(businessB.schema).toBe(mounted.schema);
      expect(businessAOverride.schema).toBe(mounted.schema);
      expect(validateStructureSchema(mounted.schema)).toMatchObject({
        ok: true,
        issues: [],
      });
      for (const presentation of Object.values(mounted.presentations)) {
        expect(validateEditorPresentation(presentation)).toMatchObject({
          ok: true,
          issues: [],
        });
        expectCodeFreeData(presentation);
      }
      expectCodeFreeData(mounted.schema);

      expect(businessA.phonePresenterId).toBe(
        demoApi!.BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
      );
      expect(businessB.phonePresenterId).toBe(
        demoApi!.BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
      );
      expect(businessA.phonePresenterId).not.toBe(
        businessB.phonePresenterId,
      );
      expectRealPhoneControl(businessA);
      expectRealPhoneControl(businessB);
    });

    it('reuses address, ref, and enum implementations across editors', async () => {
      const mounted = await mountDemo();
      const editors = Object.values(mounted.editors);

      for (const capability of [
        'address',
        'entityRef',
        'enum',
      ] as const) {
        for (const editor of editors) {
          expect(editor.capabilities[capability].transformer).toBe(
            mounted.sharedCapabilities[capability].transformer,
          );
          expect(editor.capabilities[capability].presenter).toBe(
            mounted.sharedCapabilities[capability].presenter,
          );
        }
      }
    });

    it('applies editor-instance later-wins to one Scope only', async () => {
      const mounted = await mountDemo();
      const {
        businessA,
        businessB,
        businessAOverride,
      } = mounted.editors;

      expect(businessAOverride.phonePresenterId).toBe(
        demoApi!.BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
      );
      expect(businessA.phonePresenterId).toBe(
        demoApi!.BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
      );
      expect(businessB.phonePresenterId).toBe(
        demoApi!.BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
      );
      expect(new Set([
        businessA.scopeId,
        businessB.scopeId,
        businessAOverride.scopeId,
      ])).toHaveProperty('size', 3);
      expect(businessA.presenterRegistry).not.toBe(
        businessAOverride.presenterRegistry,
      );
      expect(businessA.session).not.toBe(businessAOverride.session);
      expectRealPhoneControl(businessAOverride);
    });

    it('loads every editor through the canonical runtime and one Scope Session', async () => {
      const mounted = await mountDemo();

      for (const editor of Object.values(mounted.editors)) {
        expect(editor.diagnostics).toEqual([]);
        expect(editor.sourceBundle.manifestUri).toMatch(/^vfs:\/\//);
        expect(Object.values(editor.sourceBundle.sourceMap).join('\n')
          .match(/<schemaEditor\.Editor\b/g)).toHaveLength(1);
        expect(editor.appRuntime.bundle.diagnostics.filter(
          ({ severity }) => severity === 'error',
        )).toEqual([]);
        expect(editor.appRuntime.plans.diagnostics.filter(
          ({ severity }) => severity === 'error',
        )).toEqual([]);
        expect(Object.values(editor.appRuntime.assemblies).flatMap(
          ({ diagnostics }) => diagnostics,
        )).toEqual([]);
        expect(editor.target.querySelector(
          '[data-schema-editor-presenter]',
        )).not.toBeNull();
        expect(editor.session.getState().disposed).toBe(false);
      }
    });

    it('emits normalized value events and advances DOM only after accepted snapshots', async () => {
      const mounted = await mountDemo();
      const editor = mounted.editors.businessA;
      const acceptedBefore = phoneControlValue(editor);

      for (const [outcome, attempted, diagnostic] of [
        ['rejected', '+90 555 000 0001', 'SCHEMA_EDITOR_HOST_REJECTED'],
        ['conflict', '+90 555 000 0002', 'SCHEMA_EDITOR_HOST_CONFLICT'],
        ['stale', '+90 555 000 0003', 'SCHEMA_EDITOR_STALE_ACCEPTANCE'],
        ['malformed', '+90 555 000 0004', 'MALFORMED_SCHEMA_EDITOR_HOST_RESULT'],
      ] as const) {
        editor.host.setNextOutcome(outcome);
        await setPhoneControlValue(editor, attempted);
        await vi.waitFor(() => {
          expect(editor.session.getState().pending).toEqual([]);
          expect(editor.session.getState().diagnostics).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ code: diagnostic }),
            ]),
          );
        });
        expect(phoneControlValue(editor)).toBe(acceptedBefore);
      }

      editor.host.setNextOutcome('pending');
      await setPhoneControlValue(editor, '+90 555 000 0005');
      await vi.waitFor(() => {
        expect(editor.session.getState().pending).toHaveLength(1);
        expect(phonePresenter(editor).getAttribute('aria-busy')).toBe('true');
      });
      expect(phoneControlValue(editor)).toBe(acceptedBefore);

      editor.host.resolvePending();
      await vi.waitFor(() => {
        expect(phoneControlValue(editor)).toBe('+90 555 000 0005');
        expect(editor.session.getState().pending).toEqual([]);
      });

      expect(editor.presenterEvents.at(-1)).toEqual({
        event: 'value.change',
        payload: { value: '+90 555 000 0005' },
      });
      expect(latestCommand(editor)).toEqual({
        kind: 'value.set',
        target: ['user', 'phone'],
        value: '+90 555 000 0005',
      });
    });

    it('keeps pending, revision, registry override, and value isolated between sibling editors', async () => {
      const mounted = await mountDemo();
      const {
        businessA,
        businessB,
        businessAOverride,
      } = mounted.editors;
      const businessABefore = phoneControlValue(businessA);
      const businessBBefore = phoneControlValue(businessB);
      const businessAOverrideBefore = phoneControlValue(businessAOverride);
      const businessBRevisionBefore =
        businessB.session.getState().snapshot.revision;
      const businessAOverrideRevisionBefore =
        businessAOverride.session.getState().snapshot.revision;
      const businessBRegistry = businessB.presenterRegistry;
      const businessAOverrideRegistry =
        businessAOverride.presenterRegistry;

      businessA.host.setNextOutcome('pending');
      await setPhoneControlValue(businessA, '+90 555 000 0011');
      await vi.waitFor(() => {
        expect(businessA.session.getState().pending).toHaveLength(1);
      });

      expect(phoneControlValue(businessA)).toBe(businessABefore);
      expect(phoneControlValue(businessB)).toBe(businessBBefore);
      expect(phoneControlValue(businessAOverride))
        .toBe(businessAOverrideBefore);
      expect(businessB.session.getState().pending).toEqual([]);
      expect(businessAOverride.session.getState().pending).toEqual([]);
      expect(businessB.session.getState().snapshot.revision)
        .toBe(businessBRevisionBefore);
      expect(businessAOverride.session.getState().snapshot.revision)
        .toBe(businessAOverrideRevisionBefore);
      expect(businessB.presenterRegistry).toBe(businessBRegistry);
      expect(businessAOverride.presenterRegistry)
        .toBe(businessAOverrideRegistry);

      businessA.host.resolvePending();
      await vi.waitFor(() => {
        expect(phoneControlValue(businessA)).toBe('+90 555 000 0011');
      });
      expect(phoneControlValue(businessB)).toBe(businessBBefore);
      expect(phoneControlValue(businessAOverride))
        .toBe(businessAOverrideBefore);
      expect(businessB.session.getState().snapshot.revision)
        .toBe(businessBRevisionBefore);
      expect(businessAOverride.session.getState().snapshot.revision)
        .toBe(businessAOverrideRevisionBefore);

      businessAOverride.host.setNextOutcome('accepted');
      await setPhoneControlValue(businessAOverride, '+90 555 000 0012');
      await vi.waitFor(() => {
        expect(phoneControlValue(businessAOverride))
          .toBe('+90 555 000 0012');
      });
      expect(phoneControlValue(businessA)).toBe('+90 555 000 0011');
      expect(phoneControlValue(businessB)).toBe(businessBBefore);
      expect(businessB.presenterRegistry).toBe(businessBRegistry);
      expect(businessAOverride.presenterRegistry)
        .toBe(businessAOverrideRegistry);
    });

    it('ignores late accepted results after the editor runtime is disposed', async () => {
      const mounted = await mountDemo();
      const editor = mounted.editors.businessB;
      const acceptedBefore = phoneControlValue(editor);

      editor.host.setNextOutcome('pending');
      await setPhoneControlValue(editor, '+90 555 000 0021');
      await vi.waitFor(() => {
        expect(editor.session.getState().pending).toHaveLength(1);
      });

      editor.dispose();
      editor.host.resolvePending();
      await nextTick();

      expect(editor.session.getState().disposed).toBe(true);
      expect(phoneControlValue(editor)).toBe(acceptedBefore);
    });

    it('uses package-root canonical stages and no synthetic loaded bundle', () => {
      const source = REQUIRED_DEMO_FILES
        .map((file) => readFileSync(join(DEMO_ROOT, file), 'utf8'))
        .join('\n');

      for (const stage of [
        'compileEditorPlan',
        'lowerEditorPlan',
        'loadHalfcodeAppRuntime',
        'CanonicalHalfcodeRenderer',
        'createSchemaEditorSession',
        'createElementPlusSchemaEditorCanonicalRegistry',
      ]) {
        expect(source).toMatch(new RegExp(`\\b${stage}\\b`));
      }
      expect(source).toMatch(
        /from ['"]dg-cell-mvi-halfcode-(?:logic|support|vue|element-plus)['"]/,
      );
      expect(source).not.toMatch(
        /from ['"]dg-cell-mvi-halfcode-[^'"]+\/(?:src|dist)\//,
      );
      expect(source).not.toMatch(
        /\bas\s+(?:LoadedHalfcodeUnitBundle|HalfcodeAppRuntime)\b/,
      );
      expect(source).not.toMatch(
        /\b(?:syntheticBundle|fakeBundle|mockBundle)\b/i,
      );
      expect(presenterOwnerSource()).not.toMatch(
        /\b(?:Session|ValueHost|writer|runtime|dispatch)\b/,
      );
      expect(presenterOwnerSource()).toMatch(/\bonSchemaEditorEvent\b/);
    });
  },
);

async function mountDemo(): Promise<MountedBusinessDialectDemo> {
  const target = document.createElement('div');
  target.dataset.schemaEditorDemo = 'business-dialect';
  document.body.appendChild(target);
  const mounted = await demoApi!.mountSchemaEditorBusinessDialectDemo(target);
  mountedDemos.push(mounted);
  return mounted;
}

function expectCodeFreeData(value: unknown): void {
  const seen = new Set<unknown>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') {
      expect(typeof candidate).not.toBe('function');
      return;
    }
    expect(candidate).not.toBeInstanceOf(HTMLElement);
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

function expectRealPhoneControl(editor: BusinessEditorHarness): void {
  const presenter = phonePresenter(editor);
  expect(presenter).not.toBeNull();
  expect(
    presenter!.querySelector('input, textarea, [role="combobox"]'),
    `${editor.id} must mount a real interactive phone control`,
  ).not.toBeNull();
}

function phonePresenter(editor: BusinessEditorHarness): HTMLElement {
  const presenter = editor.target.querySelector<HTMLElement>(
    `[data-schema-editor-presenter="${editor.phonePresenterId}"]`,
  );
  expect(presenter).not.toBeNull();
  return presenter!;
}

function phoneControl(
  editor: BusinessEditorHarness,
): HTMLInputElement | HTMLTextAreaElement {
  const control = phonePresenter(editor).querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >('input, textarea');
  expect(control).not.toBeNull();
  return control!;
}

function phoneControlValue(editor: BusinessEditorHarness): string {
  return phoneControl(editor).value;
}

async function setPhoneControlValue(
  editor: BusinessEditorHarness,
  value: string,
): Promise<void> {
  await setInput(phoneControl(editor), value);
}

async function setInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

function latestCommand(editor: BusinessEditorHarness): SchemaEditorCommand {
  const request = editor.host.requests.at(-1);
  expect(request).toBeDefined();
  return request!.command;
}

function presenterOwnerSource(): string {
  return readdirSync(DEMO_ROOT)
    .filter((file) => /presenter/i.test(file) && file.endsWith('.ts'))
    .map((file) => readFileSync(join(DEMO_ROOT, file), 'utf8'))
    .join('\n');
}
