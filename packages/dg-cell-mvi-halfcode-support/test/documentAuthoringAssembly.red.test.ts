import { describe, expect, it, vi } from 'vitest';
import {
  closeDocument,
  createDocumentInstanceRegistry,
  createDocumentOccurrenceRegistry,
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringViewScopeFacet,
  openDocument,
  type AssembleDocumentOccurrenceInput,
  type DiagnosticResult,
  type DocumentAuthoringHostPort,
  type DocumentInstanceHandle,
  type DocumentInstanceRegistry,
  type DocumentOccurrenceAssembly,
  type DocumentOccurrenceRuntime,
  type DocumentScopeRuntime,
  type DocumentRuntimeConfig,
  type DocumentRuntimePort,
  type DocumentUnitPlan,
  type HalfcodeRef,
  type UnitFqn,
  type XnlAuthoringControlPort,
  type XnlAuthoringOpenedSession,
  type XnlAuthoringProposalPort,
  type XnlAuthoringSerializableValue,
  type XnlAuthoringSessionFactoryPort,
} from '../src';

type DocumentFact = XnlAuthoringSerializableValue;
type DocumentCommand = XnlAuthoringSerializableValue;
type DocumentMutation = XnlAuthoringSerializableValue;

type ScopeRuntime = DocumentScopeRuntime<DocumentFact, DocumentCommand>;
type AuthoringHostRuntime = DocumentOccurrenceRuntime & Readonly<{
  documentAuthoring: DocumentAuthoringHostPort<DocumentFact, DocumentCommand, DocumentMutation>;
}>;

const CONFIG = Object.freeze({}) satisfies DocumentRuntimeConfig;

const EDIT_PLAN = Object.freeze({
  id: 'dg.docs.Edit.document-unit-plan',
  unitFqn: 'dg.docs.Edit' as UnitFqn,
  source: Object.freeze({
    kind: 'external' as const,
    ref: 'vfs://./edit.xnl' as HalfcodeRef,
  }),
  rootNodeId: 'dg.docs.Edit',
  mode: 'edit' as const,
  presentationId: 'edit',
  rootScopeId: 'document-root',
  embeddedUnits: Object.freeze([]),
  addressableInstances: Object.freeze([Object.freeze({
    projectionRole: 'main',
    xId: 'root',
    scopeId: 'document-root',
  })]),
}) satisfies DocumentUnitPlan;

const VIEW_PLAN = Object.freeze({
  ...EDIT_PLAN,
  id: 'dg.docs.View.document-unit-plan',
  unitFqn: 'dg.docs.View' as UnitFqn,
  mode: 'view' as const,
  presentationId: 'view',
}) satisfies DocumentUnitPlan;

function createOpenedSession(sessionId: string) {
  const state = Object.freeze({
    kind: 'xnl-authoring-session-state' as const,
    status: 'ready' as const,
    accepted: Object.freeze({
      kind: 'xnl-authoring-accepted-snapshot' as const,
      document: Object.freeze({ title: sessionId }),
      liveRevision: Object.freeze({
        kind: 'xnl-authoring-live-revision' as const,
        sessionId,
        value: 'live:1',
      }),
    }),
    persistedRevision: Object.freeze({
      kind: 'xnl-authoring-persisted-revision' as const,
      authorityId: 'vfs:docs',
      value: 'vfs:1',
    }),
  });
  const proposal = Object.freeze({
    state: vi.fn(() => state),
    subscribe: vi.fn(() => () => undefined),
    submit: vi.fn(async () => Object.freeze({
      status: 'unchanged' as const,
      accepted: state.accepted,
    })),
  }) satisfies XnlAuthoringProposalPort<DocumentFact, DocumentCommand>;
  const dispose = vi.fn();
  const control = Object.freeze({
    retryPersistence: vi.fn(async () => Object.freeze({
      status: 'unchanged' as const,
      accepted: state.accepted,
    })),
    reloadDiscardingAccepted: vi.fn(async () => Object.freeze({
      status: 'failed' as const,
      liveRevision: state.accepted.liveRevision,
      diagnostics: Object.freeze([Object.freeze({
        severity: 'error' as const,
        code: 'TEST_NOT_RELOADABLE',
        message: 'not reloadable',
      })]),
    })),
    dispose,
  }) satisfies XnlAuthoringControlPort<DocumentFact>;
  const opened = Object.freeze({ proposal, control }) satisfies XnlAuthoringOpenedSession<
    DocumentFact,
    DocumentCommand
  >;
  return { opened, proposal, control, dispose };
}

function createHost(input: {
  factory?: XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
  definitions?: Readonly<Record<string, DocumentUnitPlan>>;
  documentOccurrences?: ReturnType<typeof createDocumentOccurrenceRegistry>;
  assemble: (
    runtime: DocumentScopeRuntime,
    input: AssembleDocumentOccurrenceInput,
    config: DocumentRuntimeConfig,
  ) => DocumentOccurrenceAssembly | Promise<DocumentOccurrenceAssembly>;
}): AuthoringHostRuntime {
  const documentOccurrences = input.documentOccurrences ?? createDocumentOccurrenceRegistry();
  const definitions: Readonly<Record<string, DocumentUnitPlan>> = input.definitions ?? Object.freeze({
    [EDIT_PLAN.unitFqn]: EDIT_PLAN,
    [VIEW_PLAN.unitFqn]: VIEW_PLAN,
  });
  const documentRuntime: DocumentRuntimePort = {
    resolveDefinition: vi.fn((fqn) => definitions[fqn]),
    createRegistry: vi.fn(() => createDocumentInstanceRegistry()),
    assembleOccurrence: vi.fn((runtime, assemblyInput, config) =>
      input.assemble(runtime, assemblyInput, config)),
  };
  return Object.freeze({
    documentOccurrences,
    documentRuntime,
    ...(input.factory === undefined ? {} : {
      documentAuthoring: Object.freeze({
        factory: input.factory,
        runtime: Object.freeze({ owner: 'document-authoring-test-runtime' }),
      }),
    }),
  }) as unknown as AuthoringHostRuntime;
}

function scopeRuntime(
  runtime: DocumentScopeRuntime,
  authoring = runtime.authoring,
): ScopeRuntime {
  return Object.freeze({
    documentOccurrences: runtime.documentOccurrences,
    documentRuntime: runtime.documentRuntime,
    documentInstances: runtime.documentInstances,
    authoring,
  });
}

function scopesFor(
  runtime: DocumentScopeRuntime,
  input: AssembleDocumentOccurrenceInput,
): DocumentOccurrenceAssembly {
  return Object.freeze({
    rootScopeId: input.plan.rootScopeId,
    rootRuntime: scopeRuntime(runtime),
    capsuleScopeRuntimes: Object.freeze([scopeRuntime(runtime)]),
    componentScopeRuntimes: Object.freeze([scopeRuntime(runtime)]),
    dispose: vi.fn(),
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function hasFunction(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor === undefined || !('value' in descriptor) || hasFunction(descriptor.value, seen);
  });
}

function isHandle(value: DocumentInstanceHandle | DiagnosticResult): value is DocumentInstanceHandle {
  return 'lease' in value;
}

function expectHandle(value: DocumentInstanceHandle | DiagnosticResult): DocumentInstanceHandle {
  expect(isHandle(value)).toBe(true);
  return value as DocumentInstanceHandle;
}

function diagnostics(value: DocumentInstanceHandle | DiagnosticResult) {
  return isHandle(value) ? [] : value.diagnostics;
}

describe('T4.3 Document authoring occurrence assembly', () => {
  it('opens one owner-local edit session and exposes only its proposal facade to root, Capsule, and Component Scopes', async () => {
    const session = createOpenedSession('edit-occurrence');
    const factory = Object.freeze({
      open: vi.fn(async () => session.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    let assemblyRuntime: ScopeRuntime | undefined;
    let assemblyInput: AssembleDocumentOccurrenceInput | undefined;
    const host = createHost({
      factory,
      assemble: (runtime, input) => {
        assemblyRuntime = runtime;
        assemblyInput = input;
        return scopesFor(runtime, input);
      },
    });

    const handle = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'edit-occurrence', mode: 'edit' },
    }, CONFIG));

    expect(factory.open).toHaveBeenCalledTimes(1);
    expect(factory.open).toHaveBeenCalledWith(
      host.documentAuthoring.runtime,
      {
        id: 'edit-occurrence',
        source: { kind: 'external', ref: 'vfs://./edit.xnl' },
      },
      {},
    );
    expect(Object.keys(assemblyInput ?? {})).toEqual([
      'plan',
      'effectiveSource',
      'context',
      'addresses',
    ]);
    expect(hasFunction(assemblyInput)).toBe(false);
    expect(assemblyInput).not.toHaveProperty('authoring');
    expect(assemblyInput).not.toHaveProperty('registry');
    expect(assemblyRuntime?.authoring.mode).toBe('edit');
    expect(Object.isFrozen(assemblyRuntime?.authoring)).toBe(true);
    expect(Object.isFrozen(
      assemblyRuntime?.authoring.mode === 'edit' ? assemblyRuntime.authoring.proposal : undefined,
    )).toBe(true);

    const record = host.documentOccurrences.get(handle.unitInstanceId);
    expect(Object.isFrozen(host.documentOccurrences)).toBe(true);
    expect(Object.isFrozen(record?.registry)).toBe(true);
    expect(Object.isFrozen(record?.assembly)).toBe(true);
    const runtimes = [
      record?.assembly.rootRuntime,
      ...(record?.assembly.capsuleScopeRuntimes ?? []),
      ...(record?.assembly.componentScopeRuntimes ?? []),
    ] as ScopeRuntime[];
    expect(runtimes).toHaveLength(3);
    const proposal = assemblyRuntime?.authoring.mode === 'edit'
      ? assemblyRuntime.authoring.proposal
      : undefined;
    for (const runtime of runtimes) {
      expect(Object.keys(runtime.authoring)).toEqual(['mode', 'proposal']);
      expect(Object.keys(runtime.authoring.mode === 'edit' ? runtime.authoring.proposal : {}))
        .toEqual(['state', 'subscribe', 'submit']);
      expect(runtime).not.toHaveProperty('documentAuthoring');
      expect(runtime).not.toHaveProperty('factory');
      expect(runtime).not.toHaveProperty('control');
      expect(runtime.documentInstances).toBe(assemblyRuntime?.documentInstances);
      expect(runtime.authoring.mode === 'edit' ? runtime.authoring.proposal : undefined).toBe(proposal);
    }

    expect(await closeDocument(host, handle, CONFIG)).toEqual({ diagnostics: [] });
    expect((await closeDocument(host, handle, CONFIG)).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps view mode writer-free without inspecting or invoking the host factory and rejects leaked bindings', async () => {
    const factory = Object.freeze({
      open: vi.fn(async () => createOpenedSession('must-not-open').opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const viewOnlyHost = createHost({ assemble: scopesFor });
    const viewOnlyHandle = expectHandle(await openDocument(viewOnlyHost, {
      definitionFqn: VIEW_PLAN.unitFqn,
      context: { unitInstanceId: 'view-without-host-authoring', mode: 'view' },
    }, CONFIG));
    expect(viewOnlyHost).not.toHaveProperty('documentAuthoring');
    expect(factory.open).not.toHaveBeenCalled();
    await closeDocument(viewOnlyHost, viewOnlyHandle, CONFIG);

    let authoringGetterCalls = 0;
    const baseHost = createHost({ assemble: scopesFor });
    const getterHostValue = {
      documentOccurrences: baseHost.documentOccurrences,
      documentRuntime: baseHost.documentRuntime,
    } as Record<string, unknown>;
    Object.defineProperty(getterHostValue, 'documentAuthoring', {
      enumerable: true,
      get() {
        authoringGetterCalls += 1;
        return Object.freeze({ factory, runtime: Object.freeze({}) });
      },
    });
    const getterHost = Object.freeze(getterHostValue) as unknown as AuthoringHostRuntime;

    const viewHandle = expectHandle(await openDocument(getterHost, {
      definitionFqn: VIEW_PLAN.unitFqn,
      context: { unitInstanceId: 'view-occurrence', mode: 'view' },
    }, CONFIG));
    expect(authoringGetterCalls).toBe(0);
    expect(factory.open).not.toHaveBeenCalled();
    const viewRecord = getterHost.documentOccurrences.get(viewHandle.unitInstanceId);
    expect((viewRecord?.assembly.rootRuntime as ScopeRuntime).authoring).toEqual({ mode: 'view' });
    await closeDocument(getterHost, viewHandle, CONFIG);

    const leakHost = createHost({
      assemble: (runtime, input) => Object.freeze({
        ...scopesFor(runtime, input),
        rootRuntime: Object.freeze({
          ...scopeRuntime(runtime, createXnlAuthoringViewScopeFacet()),
          submit: vi.fn(),
        }) as ScopeRuntime,
      }),
    });
    const leaked = await openDocument(leakHost, {
      definitionFqn: VIEW_PLAN.unitFqn,
      context: { unitInstanceId: 'view-leak', mode: 'view' },
    }, CONFIG);
    expect(diagnostics(leaked)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: expect.stringMatching(/AUTHORING|SCOPE|CAPABILITY/),
      }),
    ]));
    expect(leakHost.documentOccurrences.get('view-leak')).toBeUndefined();
  });

  it('fails closed on session identity mismatch and partial assembly, rolling back namespace and disposing exactly once', async () => {
    const mismatched = createOpenedSession('foreign-session');
    const mismatchedFactory = Object.freeze({
      open: vi.fn(async () => mismatched.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const mismatchAssemble = vi.fn(scopesFor);
    const mismatchHost = createHost({ factory: mismatchedFactory, assemble: mismatchAssemble });

    const mismatch = await openDocument(mismatchHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'identity-mismatch', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(mismatch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: expect.stringMatching(/AUTHORING.*MISMATCH|IDENTITY/) }),
    ]));
    expect(mismatchAssemble).not.toHaveBeenCalled();
    expect(mismatched.dispose).toHaveBeenCalledTimes(1);
    expect(mismatchHost.documentOccurrences.get('identity-mismatch')).toBeUndefined();

    const partial = createOpenedSession('partial-open');
    const partialFactory = Object.freeze({
      open: vi.fn(async () => partial.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const childDispose = vi.fn();
    const rootDispose = vi.fn();
    let partialRegistry: DocumentInstanceRegistry | undefined;
    const partialHost = createHost({
      factory: partialFactory,
      assemble: (runtime, input) => {
        partialRegistry = runtime.documentInstances;
        expect(runtime.documentInstances.register({
          ref: { unitInstanceId: 'partial-open', projectionRole: 'main', xId: 'root' },
          descriptor: EDIT_PLAN.addressableInstances[0],
          target: Object.freeze({ mounted: true }),
        }).ok).toBe(true);
        return Object.freeze({
          ...scopesFor(runtime, input),
          childOccurrences: Object.freeze([{ dispose: childDispose }]),
          dispose: rootDispose,
          diagnostics: Object.freeze([Object.freeze({
            severity: 'error' as const,
            code: 'TEST_PARTIAL_AUTHORING_OPEN',
            message: 'partial authoring assembly',
          })]),
        });
      },
    });

    const failed = await openDocument(partialHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'partial-open', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TEST_PARTIAL_AUTHORING_OPEN' }),
    ]));
    expect(childDispose).toHaveBeenCalledTimes(1);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(partial.dispose).toHaveBeenCalledTimes(1);
    expect(partialRegistry?.resolve({
      unitInstanceId: 'partial-open',
      projectionRole: 'main',
      xId: 'root',
    }).ok).toBe(false);
    expect(partialHost.documentOccurrences.get('partial-open')).toBeUndefined();
  });

  it('accepts class and prototype runtime capability implementations with stable method binding', async () => {
    const session = createOpenedSession('class-runtime');

    class ClassProposalPort implements XnlAuthoringProposalPort<DocumentFact, DocumentCommand> {
      state() {
        return session.proposal.state();
      }

      subscribe(...args: Parameters<typeof session.proposal.subscribe>) {
        return session.proposal.subscribe(...args);
      }

      submit(...args: Parameters<typeof session.proposal.submit>) {
        return session.proposal.submit(...args);
      }
    }

    class ClassControlPort implements XnlAuthoringControlPort<DocumentFact> {
      retryPersistence(...args: Parameters<typeof session.control.retryPersistence>) {
        return session.control.retryPersistence(...args);
      }

      reloadDiscardingAccepted(...args: Parameters<typeof session.control.reloadDiscardingAccepted>) {
        return session.control.reloadDiscardingAccepted(...args);
      }

      dispose() {
        return session.control.dispose();
      }
    }

    const classOpenedSession = Object.freeze({
      proposal: new ClassProposalPort(),
      control: new ClassControlPort(),
    });

    class ClassFactory implements XnlAuthoringSessionFactoryPort<
      DocumentFact,
      DocumentCommand,
      DocumentMutation
    > {
      calls = 0;

      async open() {
        this.calls += 1;
        return classOpenedSession;
      }
    }

    class ClassRuntimePort implements DocumentRuntimePort {
      assembledWith: DocumentScopeRuntime | undefined;

      resolveDefinition(fqn: UnitFqn) {
        return fqn === EDIT_PLAN.unitFqn ? EDIT_PLAN : undefined;
      }

      createRegistry() {
        return createDocumentInstanceRegistry();
      }

      assembleOccurrence(runtime: DocumentScopeRuntime, input: AssembleDocumentOccurrenceInput) {
        this.assembledWith = runtime;
        class ClassScopeRuntime implements DocumentScopeRuntime {
          readonly documentOccurrences = runtime.documentOccurrences;
          readonly documentRuntime = runtime.documentRuntime;
          readonly documentInstances = runtime.documentInstances;
          readonly authoring = runtime.authoring;

          marker() {
            return input.context.unitInstanceId;
          }
        }
        const scope = Object.freeze(new ClassScopeRuntime());
        expect(scope.marker()).toBe('class-runtime');
        return Object.freeze({
          rootScopeId: input.plan.rootScopeId,
          rootRuntime: scope,
          capsuleScopeRuntimes: Object.freeze([scope]),
          componentScopeRuntimes: Object.freeze([scope]),
          dispose: vi.fn(),
        });
      }
    }

    class ClassHostRuntime implements DocumentOccurrenceRuntime {
      readonly documentOccurrences = createDocumentOccurrenceRegistry();
      readonly documentRuntime = new ClassRuntimePort();
      readonly documentAuthoring: DocumentAuthoringHostPort<
        DocumentFact,
        DocumentCommand,
        DocumentMutation
      >;

      constructor(factory: ClassFactory) {
        class ClassHostPort implements DocumentAuthoringHostPort<
          DocumentFact,
          DocumentCommand,
          DocumentMutation
        > {
          readonly runtime = Object.freeze({ owner: 'class-host' }) as never;

          constructor(readonly factory: ClassFactory) {}
        }
        this.documentAuthoring = new ClassHostPort(factory);
      }

      hostMarker() {
        return 'class-host-runtime';
      }
    }

    const factory = new ClassFactory();
    const host = new ClassHostRuntime(factory);
    const handle = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'class-runtime', mode: 'edit' },
    }, CONFIG));

    expect(factory.calls).toBe(1);
    expect(host.documentRuntime.assembledWith?.authoring.mode).toBe('edit');
    expect((host.documentRuntime.assembledWith as unknown as { hostMarker(): string }).hostMarker())
      .toBe('class-host-runtime');
    expect(await closeDocument(host, handle, CONFIG)).toEqual({ diagnostics: [] });
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects accessor-bearing host, factory return, and Scope facets without invoking getters', async () => {
    const valid = createOpenedSession('getter-host');
    const validFactory = Object.freeze({
      open: vi.fn(async () => valid.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const baseHost = createHost({ factory: validFactory, assemble: scopesFor });
    let factoryGetterCalls = 0;
    const accessorHostPort = { runtime: baseHost.documentAuthoring.runtime } as Record<string, unknown>;
    Object.defineProperty(accessorHostPort, 'factory', {
      enumerable: true,
      get() {
        factoryGetterCalls += 1;
        return validFactory;
      },
    });
    const accessorHost = Object.freeze({
      documentOccurrences: baseHost.documentOccurrences,
      documentRuntime: baseHost.documentRuntime,
      documentAuthoring: Object.freeze(accessorHostPort),
    }) as unknown as AuthoringHostRuntime;
    const hostFailure = await openDocument(accessorHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'getter-host', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(hostFailure)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH' }),
    ]));
    expect(factoryGetterCalls).toBe(0);
    expect(validFactory.open).not.toHaveBeenCalled();

    const malformed = createOpenedSession('malformed-return');
    const malformedFactory = Object.freeze({
      open: vi.fn(async () => Object.freeze({ ...malformed.opened, leaked: true })),
    }) as unknown as XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const malformedHost = createHost({ factory: malformedFactory, assemble: scopesFor });
    const malformedResult = await openDocument(malformedHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'malformed-return', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(malformedResult)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_DOCUMENT_AUTHORING_HOST_CAPABILITY_MISMATCH' }),
    ]));
    expect(malformed.dispose).toHaveBeenCalledTimes(1);

    const assemblySession = createOpenedSession('getter-assembly');
    const assemblyFactory = Object.freeze({
      open: vi.fn(async () => assemblySession.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    let assemblyGetterCalls = 0;
    const assemblyDispose = vi.fn();
    const assemblyHost = createHost({
      factory: assemblyFactory,
      assemble: (runtime, input) => {
        const facade = {
          rootScopeId: input.plan.rootScopeId,
          dispose: assemblyDispose,
        } as Record<string, unknown>;
        Object.defineProperty(facade, 'rootRuntime', {
          enumerable: true,
          get() {
            assemblyGetterCalls += 1;
            return scopeRuntime(runtime);
          },
        });
        return Object.freeze(facade) as unknown as DocumentOccurrenceAssembly;
      },
    });
    const assemblyFailure = await openDocument(assemblyHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'getter-assembly', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(assemblyFailure)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED' }),
    ]));
    expect(assemblyGetterCalls).toBe(0);
    expect(assemblyDispose).toHaveBeenCalledTimes(1);
    expect(assemblySession.dispose).toHaveBeenCalledTimes(1);

    const scopeSession = createOpenedSession('getter-scope');
    const scopeFactory = Object.freeze({
      open: vi.fn(async () => scopeSession.opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    let authoringGetterCalls = 0;
    const scopeHost = createHost({
      factory: scopeFactory,
      assemble: (runtime, input) => {
        const root = {
          documentOccurrences: runtime.documentOccurrences,
          documentRuntime: runtime.documentRuntime,
        } as Record<string, unknown>;
        Object.defineProperty(root, 'authoring', {
          enumerable: true,
          get() {
            authoringGetterCalls += 1;
            return runtime.authoring;
          },
        });
        return Object.freeze({
          rootScopeId: input.plan.rootScopeId,
          rootRuntime: Object.freeze(root) as unknown as ScopeRuntime,
          dispose: vi.fn(),
        });
      },
    });
    const scopeFailure = await openDocument(scopeHost, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'getter-scope', mode: 'edit' },
    }, CONFIG);
    expect(diagnostics(scopeFailure)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HALFCODE_DOCUMENT_AUTHORING_SCOPE_LEAK' }),
    ]));
    expect(authoringGetterCalls).toBe(0);
    expect(scopeSession.dispose).toHaveBeenCalledTimes(1);
  });

  it('isolates default occurrence namespaces without a string-based cross-occurrence session binding', async () => {
    const factory = Object.freeze({
      open: vi.fn(async (_runtime, input) => createOpenedSession(input.id).opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const proposals = new Map<string, XnlAuthoringProposalPort<DocumentFact, DocumentCommand>>();
    const host = createHost({
      factory,
      assemble: (runtime, input) => {
        if (runtime.authoring.mode === 'edit') {
          proposals.set(input.context.unitInstanceId, runtime.authoring.proposal);
        }
        return scopesFor(runtime, input);
      },
    });

    for (const context of [
      { unitInstanceId: 'left', mode: 'edit' as const },
      { unitInstanceId: 'right', mode: 'edit' as const },
    ]) {
      expectHandle(await openDocument(host, { definitionFqn: EDIT_PLAN.unitFqn, context }, CONFIG));
    }

    expect(proposals.get('left')).not.toBe(proposals.get('right'));
    expect(factory.open.mock.calls.map((call) => call[1].id)).toEqual(['left', 'right']);
  });
});

describe('T4.4 Document Scope runtime protocol derivation', () => {
  it('uses bindScope with root Scope bindings and preserves private class, symbol, mixin, dispatch, and dispose protocols', async () => {
    const session = createOpenedSession('protocol-scope');
    const symbolCapability = Symbol('document-scope-capability');
    const bindInputs: unknown[] = [];
    const callLog: string[] = [];
    const sendLog: string[] = [];
    const disposeLog: string[] = [];

    type ProtocolScope = ScopeRuntime & {
      readonly dispose: () => void;
      readonly call: (name: string, input: unknown, config?: unknown) => string;
      readonly send: (message: { type: string }) => string;
      readonly mixinDispatch: () => string;
      readonly [symbolCapability]: () => string;
    };

    const scopeMixin = {
      mixinDispatch(this: { mixinToken: string }) {
        return `mixin:${this.mixinToken}`;
      },
    };

    class ProtocolHostRuntime implements DocumentOccurrenceRuntime {
      #secret = 'private-owner';
      readonly documentOccurrences = createDocumentOccurrenceRegistry();
      readonly documentAuthoring = Object.freeze({
        factory: Object.freeze({
          open: vi.fn(async () => session.opened),
        }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>,
        runtime: Object.freeze({ owner: 'protocol-host' }) as never,
      });
      readonly documentRuntime: DocumentRuntimePort = {
        resolveDefinition: vi.fn((fqn) => fqn === EDIT_PLAN.unitFqn ? EDIT_PLAN : undefined),
        createRegistry: vi.fn(() => createDocumentInstanceRegistry()),
        assembleOccurrence: vi.fn((runtime: ScopeRuntime, input) => {
          const protocolRuntime = runtime as ProtocolScope;
          expect(protocolRuntime[symbolCapability]()).toBe('symbol:private-owner:document-root');
          expect(protocolRuntime.mixinDispatch()).toBe('mixin:document-root');
          expect(protocolRuntime.call('proposal.save', { ok: true })).toBe('call:document-root:proposal.save');
          expect(protocolRuntime.send({ type: 'proposal.changed' })).toBe('send:document-root:proposal.changed');
          return Object.freeze({
            rootScopeId: input.plan.rootScopeId,
            rootRuntime: protocolRuntime,
            capsuleScopeRuntimes: Object.freeze([protocolRuntime]),
            componentScopeRuntimes: Object.freeze([protocolRuntime]),
            dispose: () => protocolRuntime.dispose(),
          });
        }),
      };

      bindScope(input: Readonly<{
        scopeId: string;
        runtime?: unknown;
        bindings?: Readonly<Record<string, unknown>>;
      }>) {
        bindInputs.push(input);
        expect(input.scopeId).toBe(EDIT_PLAN.rootScopeId);
        expect(input.runtime).toBe(this);
        expect(input.bindings).toEqual(expect.objectContaining({
          documentOccurrences: this.documentOccurrences,
          documentRuntime: this.documentRuntime,
          documentInstances: expect.any(Object),
          authoring: expect.objectContaining({ mode: 'edit' }),
        }));
        expect(input.bindings).not.toHaveProperty('documentAuthoring');
        expect(input.bindings).not.toHaveProperty('factory');
        expect(input.bindings).not.toHaveProperty('control');

        const host = this;
        class BoundProtocolScope implements ScopeRuntime {
          readonly mixinToken = input.scopeId;
          readonly documentOccurrences = input.bindings?.documentOccurrences as ScopeRuntime['documentOccurrences'];
          readonly documentRuntime = input.bindings?.documentRuntime as ScopeRuntime['documentRuntime'];
          readonly documentInstances = input.bindings?.documentInstances as ScopeRuntime['documentInstances'];
          readonly authoring = input.bindings?.authoring as ScopeRuntime['authoring'];

          [symbolCapability]() {
            return `symbol:${host.#secret}:${input.scopeId}`;
          }

          call(name: string) {
            callLog.push(`${input.scopeId}:${name}`);
            return `call:${input.scopeId}:${name}`;
          }

          send(message: { type: string }) {
            sendLog.push(`${input.scopeId}:${message.type}`);
            return `send:${input.scopeId}:${message.type}`;
          }

          dispose() {
            disposeLog.push(`dispose:${host.#secret}:${input.scopeId}`);
          }
        }
        Object.assign(BoundProtocolScope.prototype, scopeMixin);
        return Object.freeze(new BoundProtocolScope());
      }
    }

    const host = new ProtocolHostRuntime();
    const handle = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'protocol-scope', mode: 'edit' },
    }, CONFIG));

    expect(bindInputs).toHaveLength(1);
    expect(callLog).toEqual(['document-root:proposal.save']);
    expect(sendLog).toEqual(['document-root:proposal.changed']);
    expect(disposeLog).toEqual([]);

    expect(await closeDocument(host, handle, CONFIG)).toEqual({ diagnostics: [] });
    expect(disposeLog).toEqual(['dispose:private-owner:document-root']);
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('T4.5 Document data-only dynamic boundary', () => {
  it('rejects malformed open input and config before reserve, factory, or assembly', async () => {
    let contextGetterCalls = 0;
    const context = { unitInstanceId: 'malformed-input', mode: 'edit' } as Record<string, unknown>;
    Object.defineProperty(context, 'parameters', {
      enumerable: true,
      get() {
        contextGetterCalls += 1;
        return { title: 'must-not-read' };
      },
    });
    const factory = Object.freeze({
      open: vi.fn(async () => createOpenedSession('malformed-input').opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const documentOccurrences = createDocumentOccurrenceRegistry();
    const reserve = vi.fn(documentOccurrences.reserve);
    const host = createHost({
      factory,
      documentOccurrences: Object.freeze({ ...documentOccurrences, reserve }),
      assemble: vi.fn(scopesFor),
    });

    const malformedInput = await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context,
      leaked: true,
    } as unknown as Parameters<typeof openDocument>[1], CONFIG);
    expect(diagnostics(malformedInput)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'HALFCODE_DOCUMENT_DATA_BOUNDARY_INVALID' }),
    ]));
    expect(contextGetterCalls).toBe(0);
    expect(reserve).not.toHaveBeenCalled();
    expect(factory.open).not.toHaveBeenCalled();
    expect(host.documentRuntime.assembleOccurrence).not.toHaveBeenCalled();

    const malformedConfig = await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'malformed-config', mode: 'edit' },
    }, { writer: vi.fn() } as unknown as DocumentRuntimeConfig);
    expect(diagnostics(malformedConfig)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'HALFCODE_DOCUMENT_DATA_BOUNDARY_INVALID' }),
    ]));
    expect(reserve).not.toHaveBeenCalled();
    expect(factory.open).not.toHaveBeenCalled();
    expect(host.documentRuntime.assembleOccurrence).not.toHaveBeenCalled();
  });

  it('validates resolved Document plans as exact serializable data before reserve and authoring', async () => {
    let planGetterCalls = 0;
    const malformedPlan = {
      ...EDIT_PLAN,
      addressableInstances: [{
        projectionRole: 'main',
        xId: 'root',
        scopeId: 'document-root',
        writer: { persist: vi.fn() },
      }],
      extra: 'not-allowed',
    } as Record<string, unknown>;
    Object.defineProperty(malformedPlan, 'parameters', {
      enumerable: true,
      get() {
        planGetterCalls += 1;
        return { title: 'must-not-read' };
      },
    });
    const factory = Object.freeze({
      open: vi.fn(async () => createOpenedSession('malformed-plan').opened),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    const documentOccurrences = createDocumentOccurrenceRegistry();
    const reserve = vi.fn(documentOccurrences.reserve);
    const host = createHost({
      factory,
      definitions: { [EDIT_PLAN.unitFqn]: malformedPlan as unknown as DocumentUnitPlan },
      documentOccurrences: Object.freeze({ ...documentOccurrences, reserve }),
      assemble: vi.fn(scopesFor),
    });

    const result = await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'malformed-plan', mode: 'edit' },
    }, CONFIG);

    expect(diagnostics(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'HALFCODE_DOCUMENT_DATA_BOUNDARY_INVALID' }),
    ]));
    expect(planGetterCalls).toBe(0);
    expect(reserve).not.toHaveBeenCalled();
    expect(factory.open).not.toHaveBeenCalled();
    expect(host.documentRuntime.assembleOccurrence).not.toHaveBeenCalled();
  });

  it('passes immutable pre-await input, config, and plan snapshots to assembly', async () => {
    const mutablePlan = {
      id: EDIT_PLAN.id,
      unitFqn: EDIT_PLAN.unitFqn,
      source: { kind: 'external' as const, ref: 'vfs://./before.xnl' as HalfcodeRef },
      rootNodeId: EDIT_PLAN.rootNodeId,
      mode: 'edit' as const,
      presentationId: EDIT_PLAN.presentationId,
      rootScopeId: EDIT_PLAN.rootScopeId,
      embeddedUnits: [] as DocumentUnitPlan['embeddedUnits'][number][],
      addressableInstances: [{
        projectionRole: 'main',
        xId: 'root',
        scopeId: EDIT_PLAN.rootScopeId,
        metadata: { title: 'before' },
      }],
    } satisfies DocumentUnitPlan;
    const opened = deferred<XnlAuthoringOpenedSession<DocumentFact, DocumentCommand>>();
    const factory = Object.freeze({
      open: vi.fn(async () => opened.promise),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    let assemblyInput: AssembleDocumentOccurrenceInput | undefined;
    let assemblyConfig: DocumentRuntimeConfig | undefined;
    const host = createHost({
      factory,
      definitions: { [EDIT_PLAN.unitFqn]: mutablePlan },
      assemble: (runtime, input, config) => {
        assemblyInput = input;
        assemblyConfig = config;
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.plan)).toBe(true);
        expect(Object.isFrozen(input.plan.source)).toBe(true);
        expect(Object.isFrozen(input.plan.addressableInstances)).toBe(true);
        expect(Object.isFrozen(input.plan.addressableInstances[0]?.metadata)).toBe(true);
        expect(Object.isFrozen(input.effectiveSource)).toBe(true);
        expect(Object.isFrozen(input.context)).toBe(true);
        expect(Object.isFrozen(input.context.parameters)).toBe(true);
        expect(Object.isFrozen(input.addresses)).toBe(true);
        expect(Object.isFrozen(input.addresses[0])).toBe(true);
        expect(Object.isFrozen(config)).toBe(true);
        return scopesFor(runtime, input);
      },
    });
    const openInput = {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: {
        unitInstanceId: 'snapshot-occurrence',
        mode: 'edit' as const,
        parameters: { title: 'before' },
      },
    };
    const config = {} as DocumentRuntimeConfig;

    const pending = openDocument(host, openInput, config);
    openInput.context.unitInstanceId = 'mutated-occurrence';
    openInput.context.parameters.title = 'after';
    (mutablePlan as { rootScopeId: string }).rootScopeId = 'mutated-root';
    (mutablePlan.source as { ref: HalfcodeRef }).ref = 'vfs://./after.xnl' as HalfcodeRef;
    (mutablePlan.addressableInstances[0] as { xId: string }).xId = 'mutated-root';
    (mutablePlan.addressableInstances[0]!.metadata as { title: string }).title = 'after';
    (config as Record<string, unknown>).writer = vi.fn();
    opened.resolve(createOpenedSession('snapshot-occurrence').opened);
    const handle = expectHandle(await pending);

    expect(factory.open).toHaveBeenCalledWith(
      host.documentAuthoring.runtime,
      {
        id: 'snapshot-occurrence',
        source: { kind: 'external', ref: 'vfs://./before.xnl' },
      },
      {},
    );
    expect(handle.unitInstanceId).toBe('snapshot-occurrence');
    expect(handle.rootScopeId).toBe(EDIT_PLAN.rootScopeId);
    expect(assemblyInput?.context).toEqual({
      unitInstanceId: 'snapshot-occurrence',
      mode: 'edit',
      parameters: { title: 'before' },
    });
    expect(assemblyInput?.plan.rootScopeId).toBe(EDIT_PLAN.rootScopeId);
    expect(assemblyInput?.effectiveSource).toEqual({ kind: 'external', ref: 'vfs://./before.xnl' });
    expect(assemblyInput?.addresses).toEqual([{
      unitInstanceId: 'snapshot-occurrence',
      projectionRole: 'main',
      xId: 'root',
    }]);
    expect(assemblyConfig).toEqual({});
    expect(assemblyConfig).not.toHaveProperty('writer');
  });
});

describe('T4.6 Document parent/child occurrence lifecycle authority', () => {
  function createSessionFactory() {
    const sessions = new Map<string, ReturnType<typeof createOpenedSession>>();
    const factory = Object.freeze({
      open: vi.fn(async (_runtime, input) => {
        const session = createOpenedSession(input.id);
        sessions.set(input.id, session);
        return session.opened;
      }),
    }) satisfies XnlAuthoringSessionFactoryPort<DocumentFact, DocumentCommand, DocumentMutation>;
    return { factory, sessions };
  }

  it('rejects a late child commit when parent close wins the child-open race and remounts with a new lease', async () => {
    const { factory, sessions } = createSessionFactory();
    const childStarted = deferred<void>();
    const childGate = deferred<DocumentOccurrenceAssembly>();
    const disposeLog: string[] = [];
    let parentOpenCount = 0;
    let pendingChildRuntime: DocumentScopeRuntime | undefined;
    let pendingChildInput: AssembleDocumentOccurrenceInput | undefined;
    const host = createHost({
      factory,
      assemble: (runtime, input) => {
        if (input.context.unitInstanceId === 'race-parent') {
          parentOpenCount += 1;
          expect(runtime.documentInstances.register({
            ref: { unitInstanceId: 'race-parent', projectionRole: 'main', xId: 'child-host' },
            descriptor: { projectionRole: 'main', xId: 'child-host', scopeId: EDIT_PLAN.rootScopeId },
            target: scopeRuntime(runtime),
          }).ok).toBe(true);
          return Object.freeze({
            ...scopesFor(runtime, input),
            dispose: () => { disposeLog.push(`parent:${parentOpenCount}`); },
          });
        }
        pendingChildRuntime = runtime;
        pendingChildInput = input;
        childStarted.resolve();
        return childGate.promise;
      },
    });

    const parent = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'race-parent', mode: 'edit' },
    }, CONFIG));
    const childPromise = openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'race-child', mode: 'edit' },
      hostOccurrenceRef: { unitInstanceId: 'race-parent', projectionRole: 'main', xId: 'child-host' },
    }, CONFIG);
    await childStarted.promise;

    expect(await closeDocument(host, parent, CONFIG)).toEqual({ diagnostics: [] });
    const remounted = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'race-parent', mode: 'edit' },
    }, CONFIG));
    expect(remounted.lease).not.toBe(parent.lease);

    const childDispose = vi.fn(() => { disposeLog.push('late-child-child'); });
    const childRootDispose = vi.fn(() => { disposeLog.push('late-child-root'); });
    childGate.resolve(Object.freeze({
      ...scopesFor(pendingChildRuntime!, pendingChildInput!),
      childOccurrences: Object.freeze([{ dispose: childDispose }]),
      dispose: childRootDispose,
    }));

    const lateChild = await childPromise;
    expect(diagnostics(lateChild)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: expect.stringMatching(/COMMIT_STALE|RELEASE_STALE/),
      }),
    ]));
    expect(childDispose).toHaveBeenCalledTimes(1);
    expect(childRootDispose).toHaveBeenCalledTimes(1);
    expect(sessions.get('race-child')?.dispose).toHaveBeenCalledTimes(1);
    expect(host.documentOccurrences.get('race-child')).toBeUndefined();
    expect(host.documentOccurrences.get('race-parent')?.lease).toBe(remounted.lease);
    expect(host.documentOccurrences.list().map((record) => record.unitInstanceId)).toEqual(['race-parent']);

    expect(await closeDocument(host, remounted, CONFIG)).toEqual({ diagnostics: [] });
    expect(disposeLog).toEqual(['parent:1', 'late-child-child', 'late-child-root', 'parent:2']);
  });

  it('recursively claims committed children when the parent closes and keeps repeated stale close once-only', async () => {
    const { factory, sessions } = createSessionFactory();
    const disposeLog: string[] = [];
    const host = createHost({
      factory,
      assemble: (runtime, input) => {
        if (input.context.unitInstanceId === 'cascade-parent') {
          expect(runtime.documentInstances.register({
            ref: { unitInstanceId: 'cascade-parent', projectionRole: 'main', xId: 'child-host' },
            descriptor: { projectionRole: 'main', xId: 'child-host', scopeId: EDIT_PLAN.rootScopeId },
            target: scopeRuntime(runtime),
          }).ok).toBe(true);
        }
        if (input.context.unitInstanceId === 'cascade-child') {
          expect(runtime.documentInstances.register({
            ref: { unitInstanceId: 'cascade-child', projectionRole: 'main', xId: 'grandchild-host' },
            descriptor: { projectionRole: 'main', xId: 'grandchild-host', scopeId: EDIT_PLAN.rootScopeId },
            target: scopeRuntime(runtime),
          }).ok).toBe(true);
        }
        return Object.freeze({
          ...scopesFor(runtime, input),
          dispose: () => { disposeLog.push(`root:${input.context.unitInstanceId}`); },
        });
      },
    });

    const parent = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'cascade-parent', mode: 'edit' },
    }, CONFIG));
    const child = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'cascade-child', mode: 'edit' },
      hostOccurrenceRef: { unitInstanceId: 'cascade-parent', projectionRole: 'main', xId: 'child-host' },
    }, CONFIG));
    const grandchild = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'cascade-grandchild', mode: 'edit' },
      hostOccurrenceRef: { unitInstanceId: 'cascade-child', projectionRole: 'main', xId: 'grandchild-host' },
    }, CONFIG));

    expect(host.documentOccurrences.list().map((record) => record.unitInstanceId).sort())
      .toEqual(['cascade-child', 'cascade-grandchild', 'cascade-parent']);
    expect(await closeDocument(host, parent, CONFIG)).toEqual({ diagnostics: [] });
    expect(disposeLog).toEqual([
      'root:cascade-grandchild',
      'root:cascade-child',
      'root:cascade-parent',
    ]);
    expect(sessions.get('cascade-grandchild')?.dispose).toHaveBeenCalledTimes(1);
    expect(sessions.get('cascade-child')?.dispose).toHaveBeenCalledTimes(1);
    expect(sessions.get('cascade-parent')?.dispose).toHaveBeenCalledTimes(1);
    expect(host.documentOccurrences.list()).toEqual([]);

    const staleChildClose = await closeDocument(host, child, CONFIG);
    expect(diagnostics(staleChildClose)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: expect.stringMatching(/CLOSE_STALE/) }),
    ]));
    expect(disposeLog).toEqual([
      'root:cascade-grandchild',
      'root:cascade-child',
      'root:cascade-parent',
    ]);
    expect(sessions.get('cascade-child')?.dispose).toHaveBeenCalledTimes(1);
    const staleGrandchildClose = await closeDocument(host, grandchild, CONFIG);
    expect(diagnostics(staleGrandchildClose)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: expect.stringMatching(/CLOSE_STALE/) }),
    ]));
    expect(sessions.get('cascade-grandchild')?.dispose).toHaveBeenCalledTimes(1);
  });

  it('captures prototype child occurrence dispose before commit into an exact frozen once-only facade', async () => {
    const { factory, sessions } = createSessionFactory();
    const disposeLog: string[] = [];
    class PrototypeChild {
      dispose() {
        disposeLog.push('prototype-child:original');
      }
    }
    const child = new PrototypeChild();
    const host = createHost({
      factory,
      assemble: (runtime, input) => Object.freeze({
        ...scopesFor(runtime, input),
        childOccurrences: Object.freeze([child]),
        dispose: () => { disposeLog.push('root'); },
      }),
    });

    const handle = expectHandle(await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'prototype-child', mode: 'edit' },
    }, CONFIG));
    const committedChild = host.documentOccurrences.get(handle.unitInstanceId)?.assembly.childOccurrences?.[0];
    expect(Object.keys(committedChild ?? {})).toEqual(['dispose']);
    expect(Object.isFrozen(committedChild)).toBe(true);

    PrototypeChild.prototype.dispose = function dispose() {
      disposeLog.push('prototype-child:mutated');
    };
    await committedChild?.dispose();
    await committedChild?.dispose();
    expect(await closeDocument(host, handle, CONFIG)).toEqual({ diagnostics: [] });

    expect(disposeLog).toEqual(['prototype-child:original', 'root']);
    expect(sessions.get('prototype-child')?.dispose).toHaveBeenCalledTimes(1);
  });

  it('captures prototype child occurrence dispose before later validation rollback', async () => {
    const { factory, sessions } = createSessionFactory();
    const disposeLog: string[] = [];
    class PrototypeChild {
      dispose() {
        disposeLog.push('prototype-child:rollback');
      }
    }
    const rootDispose = vi.fn(() => { disposeLog.push('root:rollback'); });
    const host = createHost({
      factory,
      assemble: (runtime, input) => Object.freeze({
        ...scopesFor(runtime, input),
        rootScopeId: 'wrong-root-scope',
        childOccurrences: Object.freeze([new PrototypeChild()]),
        dispose: rootDispose,
      }),
    });

    const failed = await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'prototype-child-rollback', mode: 'edit' },
    }, CONFIG);

    expect(diagnostics(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'HALFCODE_DOCUMENT_OCCURRENCE_ROOT_SCOPE_MISMATCH',
      }),
    ]));
    expect(disposeLog).toEqual(['prototype-child:rollback', 'root:rollback']);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(sessions.get('prototype-child-rollback')?.dispose).toHaveBeenCalledTimes(1);
    expect(host.documentOccurrences.get('prototype-child-rollback')).toBeUndefined();
    expect(host.documentOccurrences.list()).toEqual([]);
  });

  it.each([
    ['accessor child', () => {
      let getterCalls = 0;
      const child = {};
      Object.defineProperty(child, 'dispose', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return vi.fn();
        },
      });
      return { child, getterCalls: (): number => getterCalls };
    }],
    ['malformed child', () => ({
      child: Object.freeze({ close: vi.fn() }),
      getterCalls: (): number => 0,
    })],
  ] as const)('rejects %s without adopting partial child work', async (_label, createChild) => {
    const { factory, sessions } = createSessionFactory();
    const { child, getterCalls } = createChild();
    const rootDispose = vi.fn();
    const host = createHost({
      factory,
      assemble: (runtime, input) => Object.freeze({
        ...scopesFor(runtime, input),
        childOccurrences: Object.freeze([child as { dispose: () => void }]),
        dispose: rootDispose,
      }),
    });

    const failed = await openDocument(host, {
      definitionFqn: EDIT_PLAN.unitFqn,
      context: { unitInstanceId: 'bad-child', mode: 'edit' },
    }, CONFIG);

    expect(diagnostics(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'HALFCODE_DOCUMENT_OCCURRENCE_ASSEMBLY_FAILED',
      }),
    ]));
    expect(getterCalls()).toBe(0);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(sessions.get('bad-child')?.dispose).toHaveBeenCalledTimes(1);
    expect(host.documentOccurrences.get('bad-child')).toBeUndefined();
    expect(host.documentOccurrences.list()).toEqual([]);
  });
});
