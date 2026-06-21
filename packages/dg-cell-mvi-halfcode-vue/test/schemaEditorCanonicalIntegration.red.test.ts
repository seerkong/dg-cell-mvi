import {
  createApp,
  defineComponent,
  h,
} from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  EditorPlan,
  SchemaEditorCommand,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createDefaultHalfcodeRuntime,
  createSchemaEditorSession,
  loadHalfcodeAppRuntime,
  lowerEditorPlan,
  resolveUnitConfigRef,
  type HalfcodeUnitBundleResolver,
  type SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';
import {
  CanonicalHalfcodeRenderer,
  createSchemaEditorCanonicalRegistry,
  createSchemaEditorPresenterRegistry,
} from '../src';

const PLAN: EditorPlan = {
  kind: 'editor-plan',
  id: 'canonical.profile',
  root: {
    kind: 'field',
    id: 'profile.title',
    path: ['title'],
    metadata: {
      display: {
        label: 'Title',
        visible: true,
        readOnly: false,
      },
      scalar: { kind: 'string' },
    },
    presenter: { id: 'probe.text' },
    commandBindings: [{
      event: 'title.commit',
      commandTemplate: {
        kind: 'value.set',
        target: { source: 'literal', value: ['title'] },
        arguments: {
          value: { source: 'event', path: ['value'] },
        },
      },
    }],
  },
};

function memoryResolver(
  sourceMap: Readonly<Record<string, string>>,
): HalfcodeUnitBundleResolver {
  const directories = new Set<string>(['/']);
  for (const path of Object.keys(sourceMap)) {
    const parts = path.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`/${parts.slice(0, index).join('/')}`);
    }
  }
  return {
    readFile: (path) => sourceMap[path] ?? null,
    isDir: (path) => directories.has(path.replace(/\/$/, '') || '/'),
    readDir: (path) => {
      const prefix = `${path.replace(/\/$/, '')}/`;
      const entries = new Set<string>();
      for (const file of Object.keys(sourceMap)) {
        if (file.startsWith(prefix)) {
          entries.add(file.slice(prefix.length).split('/')[0]);
        }
      }
      return entries.size > 0 ? [...entries] : null;
    },
  };
}

describe('Schema Editor P4 canonical shell integration', () => {
  it('mounts the real lowered shell and edits only through the scoped Session', async () => {
    let revision = 1;
    const valueHost: SchemaEditorValueHost = async (_runtime, request) => {
      const command = request.command as SchemaEditorCommand;
      if (command.kind !== 'value.set') {
        return {
          status: 'rejected',
          baseRevision: request.expectedRevision,
          issues: [],
        };
      }
      revision += 1;
      return {
        status: 'accepted',
        baseRevision: request.expectedRevision,
        snapshot: {
          value: { title: command.value },
          revision: `r${revision}`,
        },
      };
    };
    const session = createSchemaEditorSession(
      Object.freeze({}),
      {
        initialSnapshot: {
          value: { title: 'before' },
          revision: 'r1',
        },
        valueHost,
      },
      {
        sessionId: 'canonical-session',
        valueHostId: 'canonical-host',
      },
    );
    const hostRuntime = createDefaultHalfcodeRuntime('canonical-host-runtime', undefined, {
      schemaEditor: {
        valueHosts: { 'canonical-host': valueHost },
        sessions: { 'canonical-session': session },
      },
    });
    const lowered = lowerEditorPlan(
      Object.freeze({}),
      { plan: PLAN },
      {
        target: 'halfcode',
        unitFqn: 'dg.schemaEditor.$CanonicalProfile',
        scopeId: 'canonical-editor-scope',
        valueHostId: 'canonical-host',
        sessionId: 'canonical-session',
        uiLibrary: 'schemaEditor',
      },
    );
    const resolver = memoryResolver(lowered.sourceMap);
    const appRuntime = await loadHalfcodeAppRuntime(
      resolver,
      lowered.manifestUri,
      {
        baseDir: '/',
        workspaceRoot: '/',
        uiLibraries: ['schemaEditor'],
      },
      {
        hostRuntime,
        resolveSymbol: () => undefined,
        resolveConfig: (ref, context) => resolveUnitConfigRef(context.unit, ref),
      },
    );
    expect(appRuntime.bundle.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    )).toEqual([]);
    expect(appRuntime.plans.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    )).toEqual([]);
    expect(Object.values(appRuntime.assemblies).flatMap(
      (assembly) => assembly.diagnostics,
    )).toEqual([]);
    const renderPlan = appRuntime.plans.renderPlans.find(
      (candidate) => String(candidate.unitFqn) === lowered.runtimeUnitFqn,
    );
    expect(renderPlan).toBeDefined();
    if (!renderPlan) {
      throw new Error('Expected lowered schema-editor runtime unit render plan.');
    }
    expect(renderPlan?.root).toHaveLength(1);
    expect(renderPlan?.root[0]).toMatchObject({
      kind: 'atom',
      tag: 'schemaEditor.Editor',
      scopeId: 'canonical-editor-scope',
    });

    const presenterPropKeys: string[][] = [];
    const ProbeText = defineComponent({
      name: 'CanonicalSchemaEditorProbeText',
      inheritAttrs: false,
      setup(_props, context) {
        return () => {
          presenterPropKeys.push(Object.keys(context.attrs).sort());
          return h('button', {
            'data-testid': 'schema-editor-title',
            'data-value': String(context.attrs.value),
            'data-pending': String(context.attrs.pending),
            onClick: () => (
              context.attrs.onSchemaEditorEvent as (event: unknown) => void
            )({
              event: 'title.commit',
              payload: { value: 'after' },
            }),
          }, String(context.attrs.value));
        };
      },
    });
    const presenters = createSchemaEditorPresenterRegistry(
      Object.freeze({}),
      {
        entries: [{
          id: 'probe.text',
          adapter: Object.freeze({ component: ProbeText }),
        }],
      },
      { duplicate: 'reject' },
    );
    expect(presenters.ok).toBe(true);
    if (!presenters.ok) {
      throw new Error('Expected probe presenter registry to be valid.');
    }

    const parentResolutions: unknown[] = [];
    const canonical = createSchemaEditorCanonicalRegistry(
      { presenterRegistry: presenters.registry },
      {
        parentRegistry: {
          resolve(identity) {
            parentResolutions.push(identity);
            return identity;
          },
        },
      },
      { componentIdentity: 'Editor' },
    );
    expect(canonical).toMatchObject({ ok: true, diagnostics: [] });
    if (!canonical.ok) {
      throw new Error('Expected schema-editor canonical registry to be valid.');
    }

    const target = document.createElement('div');
    const app = createApp(CanonicalHalfcodeRenderer, {
      plan: renderPlan,
      runtime: appRuntime,
      registry: canonical.registry,
    });
    try {
      app.mount(target);
      const button = target.querySelector(
        '[data-testid="schema-editor-title"]',
      ) as HTMLButtonElement;
      expect(button.dataset.value).toBe('before');
      button.click();
      expect(button.dataset.value).toBe('before');

      await vi.waitFor(() => {
        expect(button.dataset.value).toBe('after');
        expect(button.dataset.pending).toBe('false');
      });
      expect(session.getState().snapshot).toEqual({
        value: { title: 'after' },
        revision: 'r2',
      });
      expect(presenterPropKeys.flat()).not.toEqual(expect.arrayContaining([
        'runtime',
        'session',
        'valueHost',
        'writer',
      ]));
      expect(parentResolutions).toEqual([]);
    } finally {
      app.unmount();
      expect(session.getState().disposed).toBe(false);
      appRuntime.dispose();
      hostRuntime.dispose?.();
      session.dispose();
    }
  });
});
