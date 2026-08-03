/**
 * AppBundle vocabulary loader E2E (track add-halfcode-unit-vocabulary-loader,
 * mission evolve-halfcode-non-frontend-dsl G2R-T1).
 *
 * Loads the *real on-disk* new-vocabulary fixtures (test/fixtures/xnl-bundles/
 * runtime-counter and data-graph-counter) through loadHalfcodeUnitBundle —
 * closing the review-g2 gap where these fixtures were only text-scanned and
 * the slicing track-2 acceptance ran against an in-memory old-vocabulary
 * replica. Spec source of truth: docs/halfcode/dsl-bundle/spec/frontend/
 * {files,nodes}.md (§3 content-based domain discovery, §2 AppBundle/Unit).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ImportResolver } from 'xnl-core';
import {
  HALFCODE_APP_BUNDLE_API_VERSION,
  loadHalfcodeUnitBundle,
  type HalfcodeUnitBundleDiagnostic,
} from '../src';

const workspaceRoot = new URL('./fixtures/xnl-bundles', import.meta.url).pathname;

function normalizeFsPath(vfsPath: string): string {
  return path.posix.normalize(vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`);
}

function fsPathFor(vfsPath: string): string {
  return path.join(workspaceRoot, normalizeFsPath(vfsPath));
}

function fixtureResolver(): ImportResolver {
  return {
    readFile(vfsPath) {
      try {
        return readFileSync(fsPathFor(vfsPath), 'utf8');
      } catch {
        return null;
      }
    },
    isDir(vfsPath) {
      try {
        return statSync(fsPathFor(vfsPath)).isDirectory();
      } catch {
        return false;
      }
    },
    readDir(vfsPath) {
      try {
        return readdirSync(fsPathFor(vfsPath));
      } catch {
        return null;
      }
    },
  };
}

function memoryResolver(files: Record<string, string>): ImportResolver {
  const dirs = new Set<string>(['/']);
  for (const filePath of Object.keys(files)) {
    const segments = filePath.split('/').filter(Boolean);
    for (let i = 1; i < segments.length; i += 1) {
      dirs.add(`/${segments.slice(0, i).join('/')}`);
    }
  }
  return {
    readFile: (vfsPath) => files[vfsPath] ?? null,
    isDir: (vfsPath) => dirs.has(vfsPath.replace(/\/$/, '') || '/'),
    readDir: (vfsPath) => {
      const prefix = `${vfsPath.replace(/\/$/, '')}/`;
      const entries = new Set<string>();
      for (const filePath of Object.keys(files)) {
        if (filePath.startsWith(prefix)) entries.add(filePath.slice(prefix.length).split('/')[0]);
      }
      return entries.size ? [...entries] : null;
    },
  };
}

function loadBundle(src: string) {
  return loadHalfcodeUnitBundle(fixtureResolver(), src, {
    baseDir: '/',
    workspaceRoot: '/',
    uiLibraries: ['elementPlus'],
  });
}

function errors(diagnostics: HalfcodeUnitBundleDiagnostic[]): HalfcodeUnitBundleDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

describe('AppBundle vocabulary E2E (real on-disk fixtures)', () => {
  it('loads every canonical demo bundle without message-protocol diagnostics', () => {
    for (const fixture of [
      'basic-admin',
      'embedded-admin',
      'import-admin',
      'data-graph-admin',
      'data-graph-counter',
      'runtime-counter',
      'flow-showcase',
    ]) {
      const bundle = loadBundle(`vfs://@/${fixture}/`);
      expect(errors(bundle.diagnostics), fixture).toEqual([]);
    }
  });

  it('loads flow-showcase as canonical CtrlFlow and DAGFlow product units', () => {
    const bundle = loadBundle('vfs://@/flow-showcase/');

    expect(errors(bundle.diagnostics)).toEqual([]);
    expect(Object.fromEntries(Object.entries(bundle.units).map(([fqn, unit]) => [
      fqn,
      [unit.kind, unit.flow?.form],
    ]))).toEqual({
      'dg.demo.flow.WelcomeCtrl': ['instant-ctrl-flow', 'InstantCtrlFlow'],
      'dg.demo.flow.ComplexCtrl': ['instant-ctrl-flow', 'InstantCtrlFlow'],
      'dg.demo.flow.WelcomeWork': ['work-ctrl-flow', 'WorkCtrlFlow'],
      'dg.demo.flow.WelcomeBiz': ['bp-ctrl-flow', 'BPCtrlFlow'],
      'dg.demo.flow.WelcomeData': ['eager-data-flow', 'EagerDataFlow'],
      'dg.demo.flow.TransformMain': ['eager-data-flow', 'EagerDataFlow'],
      'dg.demo.flow.TransformSub': ['eager-data-flow', 'EagerDataFlow'],
    });
    expect([
      bundle.units['dg.demo.flow.WelcomeCtrl'].flow,
      bundle.units['dg.demo.flow.ComplexCtrl'].flow,
      bundle.units['dg.demo.flow.WelcomeWork'].flow,
      bundle.units['dg.demo.flow.WelcomeBiz'].flow,
    ]).toEqual([
      expect.objectContaining({
        flowContract: {
          id: 'dg.demo.flow.WelcomeCtrl',
          input: 'vfs://./flow-code/welcome.contracts.ts#WelcomeCtrlInput',
          output: 'vfs://./flow-code/welcome.contracts.ts#WelcomeCtrlOutput',
        },
      }),
      expect.objectContaining({
        flowContract: {
          id: 'dg.demo.flow.ComplexCtrl',
          input: 'vfs://./flow-code/complex.ctrl.types.ts#ComplexCtrlInput',
          output: 'vfs://./flow-code/complex.ctrl.types.ts#ComplexCtrlOutput',
        },
      }),
      expect.objectContaining({
        flowContract: {
          id: 'dg.demo.flow.WelcomeWork',
          input: 'vfs://./flow-code/welcome.contracts.ts#WelcomeWorkInput',
          output: 'vfs://./flow-code/welcome.contracts.ts#WelcomeWorkOutput',
        },
      }),
      expect.objectContaining({
        flowContract: {
          id: 'dg.demo.flow.WelcomeBiz',
          input: 'vfs://./flow-code/welcome.contracts.ts#WelcomeBizInput',
          output: 'vfs://./flow-code/welcome.contracts.ts#WelcomeBizOutput',
        },
      }),
    ]);
  });

  it('expands imported Prefabs before projecting import-admin elements', () => {
    const bundle = loadBundle('vfs://@/import-admin/');
    const ordersPage = bundle.units['dg.admin.imports.OrdersPage'];
    const ordersTable = ordersPage.elements?.children.find((element) => element.id === 'orders-table');

    expect(ordersTable).toMatchObject({
      kind: 'instance',
      tag: 'dg.materials.CrudTable',
      props: 'config://#orders-table',
    });
    expect(ordersTable?.kind === 'instance' ? ordersTable.inlineProps : undefined).toEqual({
      entity: 'orders',
      pageSize: 20,
    });
    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('loads runtime-counter: AppBundle manifest, unit registry and app domain discovery', () => {
    const bundle = loadBundle('vfs://@/runtime-counter/');

    expect(bundle.manifest).toMatchObject({
      id: 'dg.demo.runtime.App',
      version: '0.1.0',
      apiVersion: HALFCODE_APP_BUNDLE_API_VERSION,
    });
    expect(Object.keys(bundle.registry)).toEqual(['dg.demo.runtime.CounterPage']);
    expect(bundle.registry['dg.demo.runtime.CounterPage'].kind).toBe('page');

    // Product identity is inline on the AppBundle root (M-N8).
    expect(bundle.app.product).toMatchObject({
      id: 'dg.demo.runtime.App',
      version: '0.1.0',
      name: 'Runtime Counter Demo',
    });

    // App-level content discovery: config.xnl + routes.xnl, nothing declared.
    expect(Object.keys(bundle.app.domains).sort()).toEqual(['config', 'routes']);
    expect(bundle.app.routes).toEqual([
      expect.objectContaining({
        id: 'counter-route',
        path: '/',
        page: 'page://dg.demo.runtime.CounterPage',
        title: 'Runtime Counter',
      }),
    ]);

    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('discovers all six CounterPage domains by content with root-tag verification (files.md §3)', () => {
    const bundle = loadBundle('vfs://@/runtime-counter/');
    const unit = bundle.units['dg.demo.runtime.CounterPage'];

    expect(unit).toMatchObject({ kind: 'page', form: 'folder' });
    expect(unit.manifest).toMatchObject({
      kind: 'page',
      fqn: 'dg.demo.runtime.CounterPage',
      version: '0.1.0',
      title: 'Runtime Counter',
    });
    expect(Object.keys(unit.domains).sort()).toEqual([
      'commands',
      'config',
      'contracts',
      'elements',
      'runtime',
      'scopes',
    ]);
    for (const [domain, doc] of Object.entries(unit.domains)) {
      expect(doc.path.endsWith(`/${domain}.xnl`), `${domain} loaded from its own file`).toBe(true);
    }
    expect(unit.domains.config.tag).toBe('Config');
    expect(unit.domains.runtime.tag).toBe('Runtime');
  });

  it('projects the runtime-counter RuntimeSpec and scope runtime bindings from disk', () => {
    const bundle = loadBundle('vfs://@/runtime-counter/');
    const unit = bundle.units['dg.demo.runtime.CounterPage'];

    expect(unit.runtime).toEqual({
      id: 'counter-runtime',
      instances: [
        {
          id: 'counter-base',
          create: 'vfs://./runtime/counter.runtime.ts#createCounterRuntime',
          config: 'config://#counter-initial-state',
          src: undefined,
          prototype: undefined,
          derive: undefined,
        },
        {
          id: 'counter',
          prototype: 'runtime://#counter-base',
          derive: 'vfs://./runtime/counter.runtime.ts#deriveCounterRuntime',
          src: undefined,
          create: undefined,
          config: undefined,
        },
      ],
    });
    expect(unit.scopeRuntimeBindings).toEqual([
      {
        scopeId: 'counter-page',
        runtime: 'runtime://#counter',
        config: 'config://#counter-page',
        commands: 'command://#counter-page-commands',
        events: undefined,
        messagePolicy: undefined,
        effects: undefined,
        dataGraphs: undefined,
      },
    ]);

    // Contract + element tree round out the slicing track-2 acceptance.
    expect(unit.contract).toMatchObject({
      kind: 'page-contract',
      fqn: 'dg.demo.runtime.CounterPage',
      urlInputs: { query: { seed: 'number?' } },
    });
    expect(unit.contract?.elementContracts?.[0]).toMatchObject({
      id: 'increment-button',
      sends: [{ ref: 'command://#counter.increment' }],
      requires: {
        commands: ['command://#counter.increment'],
        effects: [],
        config: ['config://#counter-actions'],
      },
    });
    expect(unit.elements?.children.map((child) => child.id)).toEqual([
      'counter-title',
      'counter-value',
      'increment-button',
    ]);
    expect(unit.elements?.scope).toEqual({
      kind: 'ref',
      ref: 'scope://#counter-page',
    });
    expect(unit.elements?.children[2]).toMatchObject({
      command: 'command://#counter.increment',
    });
    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('loads data-graph-counter with the data.graph domain handled through the canonical scheme table', () => {
    const bundle = loadBundle('vfs://@/data-graph-counter/');

    expect(bundle.manifest).toMatchObject({
      id: 'dg.demo.counter.App',
      version: '0.1.0',
      // apiVersion is optional in the metadata slot; absent defaults to the vocabulary version.
      apiVersion: HALFCODE_APP_BUNDLE_API_VERSION,
    });
    expect(Object.keys(bundle.registry)).toEqual(['dg.demo.counter.CounterPage']);

    const unit = bundle.units['dg.demo.counter.CounterPage'];
    expect(Object.keys(unit.domains).sort()).toEqual([
      'commands',
      'config',
      'contracts',
      'data.graph',
      'elements',
      'scopes',
    ]);
    expect(unit.domains['data.graph'].tag).toBe('DataGraph');
    // No runtime domain: the graph demo binds a GraphMount, not a RuntimeInstance.
    expect(unit.runtime).toBeUndefined();
    expect(unit.scopeRuntimeBindings).toEqual([
      {
        scopeId: 'counter-page',
        runtime: undefined,
        config: 'config://#counter-page',
        commands: 'command://#counter-page-commands',
        events: undefined,
        messagePolicy: undefined,
        effects: undefined,
        dataGraphs: {
          objects: [],
          mounts: [{
            id: 'counter',
            graph: undefined,
            module: 'data-graph://#counter.core',
            scope: undefined,
            seed: undefined,
            impls: 'vfs://./graph-code/counter.graph.impl.ts#counterGraphImpls',
            nodeBindings: [],
          }],
          extensions: [],
        },
      },
    ]);

    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('loads Command and Event domains, preserves typed message refs, and assembles them into the scope runtime', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/message/manifest.xnl': `<AppBundle #dg.message.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Routes #message-routes []>
        <Units [ <Unit kind="page" fqn="dg.message.Page" src="vfs://./pages/message/manifest.xnl"> ]>
      )>`,
      '/message/pages/message/manifest.xnl': `<Page #dg.message.Page version="1.0.0">`,
      '/message/pages/message/config.xnl': `<Config #message-config [
        <ConfigEntry #counter-actions { step = 1 }>
      ]>`,
      '/message/pages/message/commands.xnl': `<Commands #message-commands [
        <Command #counter.increment {
          handler = "vfs://./counter.commands.ts#incrementCounter"
          config = "config://#counter-actions"
        }>
      ]>`,
      '/message/pages/message/events.xnl': `<Events #message-events [
        <Event #counter.incremented>
      ]>`,
      '/message/pages/message/contracts.xnl': `<Contracts #message-contracts (
        <PageContract #dg.message.Page (
          <Accepts [ <Event ref="event://#counter.incremented"> ]>
          <Sends [ <Command ref="command://#counter.increment"> ]>
        )>
      )>`,
      '/message/pages/message/elements.xnl': `<Elements #message-elements [
        <elementPlus.ElButton #increment { command = "command://#counter.increment" }>
      ]>`,
      '/message/pages/message/scopes.xnl': `<Scopes #message-scopes [
        <Scope #message-page {
          commands = "command://#message-commands"
          events = "event://#message-events"
        } (
          <MessagePolicy #boundary { default = "bubble" } [
            <MessageRule message="command://#counter.increment" action="consume">
          ]>
        )>
      ]>`,
    }), 'vfs://@/message/', { baseDir: '/', workspaceRoot: '/', uiLibraries: ['elementPlus'] });

    const unit = bundle.units['dg.message.Page'];
    expect(Object.keys(unit.domains).sort()).toEqual([
      'commands',
      'config',
      'contracts',
      'elements',
      'events',
      'scopes',
    ]);
    expect(unit.scopeRuntimeBindings).toEqual([{
      scopeId: 'message-page',
      runtime: undefined,
      config: undefined,
      commands: 'command://#message-commands',
      events: 'event://#message-events',
      messagePolicy: {
        id: 'boundary',
        default: 'bubble',
        rules: [{ message: 'command://#counter.increment', action: 'consume' }],
      },
    }]);
    expect(unit.contract).toMatchObject({
      accepts: [{ ref: 'event://#counter.incremented' }],
      sends: [{ ref: 'command://#counter.increment' }],
    });
    expect(unit.elements?.children[0]).toMatchObject({
      command: 'command://#counter.increment',
    });
    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('preserves ref and inline Scope uses from Elements/Capsule (...) sections', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/scope-use/manifest.xnl': `<AppBundle #dg.scopeUse.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Units [ <Unit kind="page" fqn="dg.scopeUse.Page" src="vfs://./pages/page/manifest.xnl"> ]>
      )>`,
      '/scope-use/pages/page/manifest.xnl': `<Page #dg.scopeUse.Page version="1.0.0">`,
      '/scope-use/pages/page/elements.xnl': `<Elements #scope-use-elements (
        <Scope #page-root { config = "config://#page-root" }>
      ) [
        <Capsule #filter ( <Scope ref="filter"> )>
        <elementPlus.ElButton #save { command = "command://#save" }>
      ]>`,
      '/scope-use/pages/page/scopes.xnl': `<Scopes #scope-use-scopes [
        <Scope #filter { config = "config://#filter" }>
      ]>`,
    }), 'vfs://@/scope-use/', { baseDir: '/', workspaceRoot: '/', uiLibraries: ['elementPlus'] });

    const elements = bundle.units['dg.scopeUse.Page'].elements;
    expect(elements?.scope).toEqual({
      kind: 'inline',
      scope: {
        scopeId: 'page-root',
        runtime: undefined,
        config: 'config://#page-root',
        commands: undefined,
        events: undefined,
        messagePolicy: undefined,
      },
    });
    expect(elements?.children[0]).toMatchObject({
      kind: 'capsule',
      scope: { kind: 'ref', ref: 'scope://#filter' },
    });
    expect(elements?.children[1]).toMatchObject({
      kind: 'instance',
      command: 'command://#save',
    });
  });

  it('rejects Ref-suffixed canonical XNL attributes instead of accepting aliases', () => {
    expect(() => loadHalfcodeUnitBundle(memoryResolver({
      '/legacy-ref/manifest.xnl': `<AppBundle #dg.legacyRef.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Routes #legacy-routes [
          <Route #home { path = "/" pageRef = "page://dg.legacyRef.Page" }>
        ]>
      )>`,
    }), 'vfs://@/legacy-ref/', { baseDir: '/', workspaceRoot: '/' })).toThrow(/pageRef/);
  });

  it('rejects a handled Event and redundant Command type in canonical AppBundle syntax', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/invalid-message/manifest.xnl': `<AppBundle #dg.invalidMessage.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Units [ <Unit kind="page" fqn="dg.invalidMessage.Page" src="vfs://./pages/invalid/manifest.xnl"> ]>
      )>`,
      '/invalid-message/pages/invalid/manifest.xnl': `<Page #dg.invalidMessage.Page version="1.0.0">`,
      '/invalid-message/pages/invalid/commands.xnl': `<Commands #invalid-commands [
        <Command #orders.submit { type = "orders.submit" }>
      ]>`,
      '/invalid-message/pages/invalid/events.xnl': `<Events #invalid-events [
        <Event #orders.submitted { handler = "vfs://./orders.events.ts#handle" }>
      ]>`,
    }), 'vfs://@/invalid-message/', { baseDir: '/', workspaceRoot: '/' });

    const invalid = bundle.diagnostics.filter((diagnostic) => diagnostic.code === 'HALFCODE_MESSAGE_DSL_INVALID');
    expect(invalid).toHaveLength(2);
    expect(invalid.map((diagnostic) => diagnostic.message).join('\n')).toMatch(/Command.*type|Event.*handler/);
  });

  it('cross-checks Unit registration kind and fqn against the target manifest root', () => {
    const files = {
      '/x/manifest.xnl': `<AppBundle #dg.x.App apiVersion="halfcode.dg-cell-mvi/v1" version="1.0.0" (
        <Units [
          <Unit kind="component" fqn="dg.x.HomePage" src="vfs://./pages/home/manifest.xnl">
          <Unit kind="page" fqn="dg.x.OtherPage" src="vfs://./pages/other.xnl">
        ]>
      )>`,
      '/x/pages/home/manifest.xnl': `<Page #dg.x.HomePage version="1.0.0" { title = "Home" }>`,
      '/x/pages/other.xnl': `<Page #dg.x.RealPage version="1.0.0" [
        <h1 #other-title { text = "other" }>
      ]>`,
    };
    const bundle = loadHalfcodeUnitBundle(memoryResolver(files), 'vfs://@/x/', {
      baseDir: '/',
      workspaceRoot: '/',
    });

    const kindMismatches = bundle.diagnostics.filter((d) => d.code === 'HALFCODE_UNIT_KIND_MISMATCH');
    expect(kindMismatches).toHaveLength(1);
    expect(kindMismatches[0].message).toContain('registered as kind "component"');
    // Root tag stays the source of truth for kind.
    expect(bundle.registry['dg.x.HomePage'].kind).toBe('page');

    const fqnMismatches = bundle.diagnostics.filter((d) => d.code === 'HALFCODE_UNIT_FQN_CONFLICT');
    expect(fqnMismatches).toHaveLength(1);
    expect(fqnMismatches[0].message).toContain('dg.x.OtherPage');
    expect(fqnMismatches[0].message).toContain('dg.x.RealPage');
    // Root #id stays the source of truth for the FQN registry.
    expect(bundle.registry['dg.x.RealPage']).toBeDefined();
    expect(bundle.registry['dg.x.OtherPage']).toBeUndefined();
  });

  it('reports a domain file whose root tag does not match PascalCase(domain)', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/bad/manifest.xnl': `<AppBundle #dg.bad.App version="1.0.0" (
        <Units [ <Unit kind="page" fqn="dg.bad.Page" src="vfs://./pages/p/manifest.xnl"> ]>
      )>`,
      '/bad/pages/p/manifest.xnl': `<Page #dg.bad.Page version="1.0.0">`,
      '/bad/pages/p/config.xnl': `<Events #not-config [ <Event #x> ]>`,
    }), 'vfs://@/bad/', { baseDir: '/', workspaceRoot: '/' });

    const mismatches = bundle.diagnostics.filter(
      (d) => d.code === 'HALFCODE_UNIT_KIND_MISMATCH' && d.message.includes('<Config>'),
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('config.xnl');
    // The mis-rooted domain is not enabled.
    expect(bundle.units['dg.bad.Page'].domains.config).toBeUndefined();
  });

  it('defers scope-derived visibility until a resolver has the lexical scope chain', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/scope/manifest.xnl': `<AppBundle #dg.scope.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Routes #scope-routes []>
        <Units [ <Unit kind="page" fqn="dg.scope.Page" src="vfs://./pages/scope.xnl"> ]>
      )>`,
      '/scope/pages/scope.xnl': `<Page #dg.scope.Page version="1.0.0" (
        <Runtime #scope-runtime [
          <RuntimeInstance #counter { src = "vfs://./runtime.ts#counter" }>
        ]>
        <Scopes #scope-scopes [
          <Scope #left-scope { runtime = "runtime://#counter" }>
          <Scope #right-scope>
        ]>
      ) [
        <h1 #scope-title { text = "scope-runtime://#other" }>
      ]>`,
    }), 'vfs://@/scope/', { baseDir: '/', workspaceRoot: '/' });

    // The generic document index has no lexical source Scope for the element
    // ref. It must not claim that unit-global declarations decide visibility.
    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('rejects imperative runtime DSL structure while retaining RuntimeInstance references', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/guard/manifest.xnl': `<AppBundle #dg.guard.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Routes #guard-routes []>
        <Units [ <Unit kind="page" fqn="dg.guard.Page" src="vfs://./pages/guard.xnl"> ]>
      )>`,
      '/guard/pages/guard.xnl': `<Page #dg.guard.Page version="1.0.0" (
        <Runtime #guard-runtime [
          <RuntimeInstance #counter {
            create = "vfs://./runtime.ts#createCounter"
            call = "vfs://./runtime.ts#callCounter"
          } (
            <Methods [ <Method #increment> ]>
          )>
          <StreamSignalStore #legacy-store>
          <StateDef #legacy-state>
        ]>
      )>`,
    }), 'vfs://@/guard/', { baseDir: '/', workspaceRoot: '/' });

    expect(bundle.units['dg.guard.Page'].runtime?.instances).toEqual([
      expect.objectContaining({ id: 'counter', create: 'vfs://./runtime.ts#createCounter' }),
    ]);
    const guards = bundle.diagnostics.filter((diagnostic) => diagnostic.code === 'HALFCODE_RUNTIME_DSL_UNSUPPORTED');
    expect(guards).toHaveLength(4);
    expect(guards.map((diagnostic) => diagnostic.message).join('\n')).toMatch(/call|Methods|StreamSignalStore|StateDef/);
  });

  it('gives an explicit error when the resolver has no readDir capability', () => {
    const files: Record<string, string> = {
      '/nd/manifest.xnl': `<AppBundle #dg.nd.App version="1.0.0" (
        <Units [ <Unit kind="page" fqn="dg.nd.Page" src="vfs://./pages/p/manifest.xnl"> ]>
      )>`,
      '/nd/pages/p/manifest.xnl': `<Page #dg.nd.Page version="1.0.0">`,
    };
    const base = memoryResolver(files);
    const resolver = {
      readFile: base.readFile,
      isDir: base.isDir,
    } as unknown as ImportResolver;

    expect(() =>
      loadHalfcodeUnitBundle(resolver, 'vfs://@/nd/manifest.xnl', { baseDir: '/', workspaceRoot: '/' }),
    ).toThrow(/readDir/);
  });

  it('loads a packaged AppBundle from explicit domain-file inventory without readDir', () => {
    const files: Record<string, string> = {
      '/portable/manifest.xnl': `<AppBundle #dg.portable.App apiVersion="halfcode.dg-cell-mvi/v1" (
        <Units [ <Unit kind="page" fqn="dg.portable.Page" src="vfs://./pages/page/manifest.xnl"> ]>
      )>`,
      '/portable/routes.xnl': `<Routes #portable-routes []>`,
      '/portable/pages/page/manifest.xnl': `<Page #dg.portable.Page version="1.0.0">`,
      '/portable/pages/page/config.xnl': `<Config #portable-config []>`,
    };
    const base = memoryResolver(files);
    const resolver = {
      readFile: base.readFile,
      isDir: base.isDir,
    };

    const bundle = loadHalfcodeUnitBundle(resolver, 'vfs://@/portable/', {
      baseDir: '/',
      workspaceRoot: '/',
      domainFileInventory: {
        '/portable': ['routes.xnl'],
        '/portable/pages/page': ['config.xnl'],
      },
    });

    expect(Object.keys(bundle.app.domains)).toEqual(['routes']);
    expect(Object.keys(bundle.units['dg.portable.Page'].domains)).toEqual(['config']);
    expect(errors(bundle.diagnostics)).toEqual([]);
  });

  it('rejects the retired v3 vocabulary as a AppBundle apiVersion', () => {
    const resolver = memoryResolver({
      '/version/manifest.xnl': `<AppBundle #dg.version.App apiVersion="halfcode.dg-cell-mvi/v3" (
        <Routes #version-routes []>
        <Units []>
      )>`,
    });

    expect(() =>
      loadHalfcodeUnitBundle(resolver, 'vfs://@/version/manifest.xnl', {
        baseDir: '/',
        workspaceRoot: '/',
      }),
    ).toThrow(`AppBundle manifest apiVersion must be "${HALFCODE_APP_BUNDLE_API_VERSION}"`);
  });

  it('rejects a non-AppBundle root', () => {
    expect(() => loadHalfcodeUnitBundle(memoryResolver({
      '/old/manifest.xnl': `<LegacyBundle #old>`,
    }), 'vfs://@/old/', { baseDir: '/', workspaceRoot: '/' }))
      .toThrow('must contain <AppBundle>');
  });
});
