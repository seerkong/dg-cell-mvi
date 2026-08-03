import { describe, expect, it, vi } from 'vitest';
import * as support from '../src';

interface DocumentInstanceRef {
  unitInstanceId: string;
  projectionRole: string;
  xId: string;
}

interface DocumentAddressDescriptor {
  projectionRole: string;
  xId: string;
  documentNodeId?: string;
  unitFqn?: string;
  scopeId: string;
  metadata?: Record<string, unknown>;
}

interface RuntimeDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
}

interface RegistryResult<T = unknown> {
  ok: boolean;
  value?: T;
  ownerToken?: string;
  diagnostics?: readonly RuntimeDiagnostic[];
}

interface DocumentInstanceRegistry {
  register<T>(input: {
    ref: DocumentInstanceRef;
    descriptor: DocumentAddressDescriptor;
    target: T;
  }): RegistryResult;
  resolve<T>(ref: DocumentInstanceRef): RegistryResult<{
    ref: DocumentInstanceRef;
    descriptor: DocumentAddressDescriptor;
    target: T;
  }>;
  list(unitInstanceId?: string): readonly {
    ref: DocumentInstanceRef;
    descriptor: DocumentAddressDescriptor;
    target: unknown;
  }[];
  unregister(input: { ref: DocumentInstanceRef; ownerToken: string }): RegistryResult;
  disposeNamespace(unitInstanceId: string): RegistryResult;
}

interface DocumentOccurrenceRecord {
  unitInstanceId: string;
  lease: string;
  rootScopeId: string;
  addresses: readonly DocumentInstanceRef[];
  registry: DocumentInstanceRegistry;
  assembly: OccurrenceAssembly;
}

interface ReserveResult extends DiagnosticResult {
  lease?: string;
}

interface DocumentOccurrenceRegistryPort {
  reserve(input: { unitInstanceId: string }): ReserveResult;
  get(unitInstanceId: string): DocumentOccurrenceRecord | undefined;
  beginClose(input: {
    unitInstanceId: string;
    lease: string;
  }): DiagnosticResult & { record?: DocumentOccurrenceRecord };
  commit(input: {
    unitInstanceId: string;
    lease: string;
    record: DocumentOccurrenceRecord;
  }): DiagnosticResult;
  release(input: { unitInstanceId: string; lease: string }): DiagnosticResult;
  resolveHost(ref: DocumentInstanceRef): unknown | undefined;
  list(): readonly DocumentOccurrenceRecord[];
}

interface DocumentOccurrenceRuntime {
  readonly documentOccurrences: DocumentOccurrenceRegistryPort;
  readonly documentRuntime: DocumentRuntimePort;
  readonly documentAuthoring?: Readonly<{
    factory: Readonly<{
      open(runtime: unknown, input: { id: string }, config: Record<string, never>): Promise<unknown>;
    }>;
    runtime: object;
  }>;
  readonly authoring?: unknown;
}

interface DocumentScopeRuntime extends DocumentOccurrenceRuntime {
  readonly documentInstances: DocumentInstanceRegistry;
  readonly authoring: Readonly<
    | { mode: 'view' }
    | { mode: 'edit'; proposal: Record<string, unknown> }
  >;
}

interface DocumentUnitPlan {
  id: string;
  unitFqn: string;
  source:
    | { kind: 'inline'; unitSourceRef: string; region: 'body' }
    | { kind: 'external'; ref: string };
  rootNodeId: string;
  mode: 'view' | 'edit';
  presentationId: string;
  rootScopeId: string;
  embeddedUnits: readonly Record<string, unknown>[];
  addressableInstances: readonly DocumentAddressDescriptor[];
}

interface OpenDocumentInput {
  definitionFqn: string;
  context: {
    unitInstanceId: string;
    externalSourceRef?: string;
    revision?: string;
    mode: 'view' | 'edit';
    parameters?: Readonly<Record<string, unknown>>;
  };
  hostOccurrenceRef?: DocumentInstanceRef;
}

interface DocumentInstanceHandle {
  unitInstanceId: string;
  lease: string;
  rootScopeId: string;
  addresses: readonly DocumentInstanceRef[];
}

interface DiagnosticResult {
  diagnostics: readonly RuntimeDiagnostic[];
}

interface OccurrenceAssembly {
  rootScopeId: string;
  rootRuntime: DocumentScopeRuntime;
  capsuleScopeRuntimes?: readonly DocumentScopeRuntime[];
  componentScopeRuntimes?: readonly DocumentScopeRuntime[];
  childOccurrences?: readonly { dispose(): void | Promise<void> }[];
  dispose(): void | Promise<void>;
  diagnostics?: readonly RuntimeDiagnostic[];
}

interface AssembleDocumentOccurrenceInput {
  plan: DocumentUnitPlan;
  effectiveSource: DocumentUnitPlan['source'];
  context: OpenDocumentInput['context'];
  addresses: readonly DocumentInstanceRef[];
}

interface DocumentRuntimePort {
  resolveDefinition(definitionFqn: string): DocumentUnitPlan | undefined;
  createRegistry(): DocumentInstanceRegistry;
  assembleOccurrence(
    runtime: DocumentScopeRuntime,
    input: AssembleDocumentOccurrenceInput,
    config: DocumentRuntimeConfig,
  ): OccurrenceAssembly | Promise<OccurrenceAssembly>;
}

type DocumentRuntimeConfig = Readonly<Record<string, never>>;

type CreateDocumentInstanceRegistry = () => DocumentInstanceRegistry;
type CreateDocumentOccurrenceRegistry = () => DocumentOccurrenceRegistryPort;
type OpenDocument = (
  runtime: DocumentOccurrenceRuntime,
  input: OpenDocumentInput,
  config: DocumentRuntimeConfig,
) => Promise<DocumentInstanceHandle | DiagnosticResult>;
type CloseDocument = (
  runtime: DocumentOccurrenceRuntime,
  input: { unitInstanceId: string; lease: string },
  config: DocumentRuntimeConfig,
) => Promise<DiagnosticResult>;

const api = support as unknown as Record<string, unknown>;
const createDocumentInstanceRegistry =
  typeof api.createDocumentInstanceRegistry === 'function'
    ? api.createDocumentInstanceRegistry as CreateDocumentInstanceRegistry
    : undefined;
const createDocumentOccurrenceRegistry =
  typeof api.createDocumentOccurrenceRegistry === 'function'
    ? api.createDocumentOccurrenceRegistry as CreateDocumentOccurrenceRegistry
    : undefined;
const openDocument =
  typeof api.openDocument === 'function' ? api.openDocument as OpenDocument : undefined;
const closeDocument =
  typeof api.closeDocument === 'function' ? api.closeDocument as CloseDocument : undefined;
const registryApiAvailable = createDocumentInstanceRegistry !== undefined;
const lifecycleApiAvailable = registryApiAvailable
  && createDocumentOccurrenceRegistry !== undefined
  && openDocument !== undefined
  && closeDocument !== undefined;
const productionOccurrenceRegistryApiAvailable = registryApiAvailable
  && createDocumentOccurrenceRegistry !== undefined;

const ADDRESS_DESCRIPTOR: DocumentAddressDescriptor = Object.freeze({
  projectionRole: 'main',
  xId: 'review-panel',
  documentNodeId: 'review-panel',
  unitFqn: 'dg.docs.ReviewPanel',
  scopeId: 'document-root',
});

const PLAN: DocumentUnitPlan = Object.freeze({
  id: 'dg.docs.demo.SystemDesign.document-unit-plan',
  unitFqn: 'dg.docs.demo.SystemDesign',
  source: Object.freeze({
    kind: 'inline',
    unitSourceRef: 'vfs://@/document-units/documents/system-design.xnl',
    region: 'body',
  }),
  rootNodeId: 'dg.docs.demo.SystemDesign',
  mode: 'edit',
  presentationId: 'system-design',
  rootScopeId: 'document-root',
  embeddedUnits: Object.freeze([]),
  addressableInstances: Object.freeze([ADDRESS_DESCRIPTOR]),
});

const EXTERNAL_PLAN: DocumentUnitPlan = Object.freeze({
  ...PLAN,
  id: 'dg.docs.demo.ExternalDesign.document-unit-plan',
  unitFqn: 'dg.docs.demo.ExternalDesign',
  source: Object.freeze({
    kind: 'external',
    ref: 'vfs://./domain/system-design.xnl',
  }),
});

function ref(unitInstanceId: string, xId = 'review-panel'): DocumentInstanceRef {
  return { unitInstanceId, projectionRole: 'main', xId };
}

function descriptor(xId = 'review-panel'): DocumentAddressDescriptor {
  return {
    projectionRole: 'main',
    xId,
    documentNodeId: xId,
    unitFqn: 'dg.docs.ReviewPanel',
    scopeId: 'document-root',
  };
}

function createInspectableOccurrencePort(): DocumentOccurrenceRegistryPort {
  const reservations = new Map<string, string>();
  const records = new Map<string, DocumentOccurrenceRecord>();
  const closingRecords = new Map<string, DocumentOccurrenceRecord>();
  let leaseSequence = 0;

  const error = (code: string, message: string): DiagnosticResult => ({
    diagnostics: [{ severity: 'error', code, message }],
  });

  return {
    reserve: vi.fn(({ unitInstanceId }) => {
      if (reservations.has(unitInstanceId) || records.has(unitInstanceId) || closingRecords.has(unitInstanceId)) {
        return {
          ...error('DOCUMENT_OCCURRENCE_DUPLICATE', `Occurrence ${unitInstanceId} is already active.`),
        };
      }
      const lease = `test-lease-${++leaseSequence}`;
      reservations.set(unitInstanceId, lease);
      return { lease, diagnostics: [] };
    }),
    get: vi.fn((unitInstanceId) => records.get(unitInstanceId)),
    beginClose: vi.fn(({ unitInstanceId, lease }) => {
      const record = records.get(unitInstanceId);
      if (record === undefined || record.lease !== lease) {
        return error('DOCUMENT_OCCURRENCE_CLOSE_STALE', `Lease for ${unitInstanceId} is stale.`);
      }
      records.delete(unitInstanceId);
      closingRecords.set(unitInstanceId, record);
      return { diagnostics: [], record };
    }),
    commit: vi.fn(({ unitInstanceId, lease, record }) => {
      if (reservations.get(unitInstanceId) !== lease) {
        return error('DOCUMENT_OCCURRENCE_COMMIT_STALE', `Lease for ${unitInstanceId} is stale.`);
      }
      if (record.unitInstanceId !== unitInstanceId || record.lease !== lease) {
        return error('DOCUMENT_OCCURRENCE_COMMIT_MISMATCH', 'Committed record does not match its reservation.');
      }
      reservations.delete(unitInstanceId);
      records.set(unitInstanceId, record);
      return { diagnostics: [] };
    }),
    release: vi.fn(({ unitInstanceId, lease }) => {
      const activeLease = records.get(unitInstanceId)?.lease ??
        closingRecords.get(unitInstanceId)?.lease ??
        reservations.get(unitInstanceId);
      if (activeLease !== lease) {
        return error('DOCUMENT_OCCURRENCE_RELEASE_STALE', `Lease for ${unitInstanceId} is stale.`);
      }
      reservations.delete(unitInstanceId);
      records.delete(unitInstanceId);
      closingRecords.delete(unitInstanceId);
      return { diagnostics: [] };
    }),
    resolveHost: vi.fn((address) => {
      const record = records.get(address.unitInstanceId);
      const resolved = record?.registry.resolve(address);
      return resolved?.ok ? resolved.value?.target : undefined;
    }),
    list: vi.fn(() => [...records.values()]),
  };
}

function testAuthoringOpenedSession(sessionId: string) {
  const liveRevision = Object.freeze({
    kind: 'xnl-authoring-live-revision' as const,
    sessionId,
    value: 'live:1',
  });
  const accepted = Object.freeze({
    kind: 'xnl-authoring-accepted-snapshot' as const,
    document: Object.freeze({ sessionId }),
    liveRevision,
  });
  const proposal = Object.freeze({
    state: () => Object.freeze({
      kind: 'xnl-authoring-session-state' as const,
      status: 'ready' as const,
      accepted,
      persistedRevision: Object.freeze({
        kind: 'xnl-authoring-persisted-revision' as const,
        authorityId: 'test:documents',
        value: 'vfs:1',
      }),
    }),
    subscribe: () => () => undefined,
    submit: async () => Object.freeze({ status: 'unchanged' as const, accepted }),
  });
  const control = Object.freeze({
    retryPersistence: async () => Object.freeze({ status: 'unchanged' as const, accepted }),
    reloadDiscardingAccepted: async () => Object.freeze({
      status: 'failed' as const,
      liveRevision,
      diagnostics: Object.freeze([Object.freeze({
        severity: 'error' as const,
        code: 'TEST_NOT_RELOADABLE',
        message: 'not reloadable',
      })]),
    }),
    dispose: vi.fn(),
  });
  return Object.freeze({ proposal, control });
}

function testDocumentAuthoringHostPort() {
  const factory = Object.freeze({
    open: vi.fn(async (_runtime: unknown, input: { id: string }) =>
      testAuthoringOpenedSession(input.id)),
  });
  return Object.freeze({
    factory,
    runtime: Object.freeze({ owner: 'document-runtime-test' }),
  });
}

function runtimeOwner(
  kind = 'host-runtime',
  documentOccurrences = createInspectableOccurrencePort(),
): DocumentOccurrenceRuntime & { kind: string } {
  return Object.freeze({
    kind,
    documentOccurrences,
    documentRuntime: createInspectableDocumentRuntimePort(),
    documentAuthoring: testDocumentAuthoringHostPort(),
  });
}

function scopeRuntime(
  parent: unknown,
  documentOccurrences: DocumentOccurrenceRegistryPort,
  kind: string,
): DocumentScopeRuntime & { kind: string } {
  const source = parent as DocumentScopeRuntime;
  return Object.freeze({
    kind,
    documentOccurrences,
    documentRuntime: source.documentRuntime,
    documentInstances: source.documentInstances,
    authoring: source.authoring,
  });
}

function inheritedScopeRuntime(
  parent: unknown,
  kind: string,
): DocumentScopeRuntime & { kind: string } {
  return scopeRuntime(
    parent,
    (parent as DocumentOccurrenceRuntime).documentOccurrences,
    kind,
  );
}

function allObjectKeys(
  value: unknown,
  keys = new Set<string>(),
  seen = new WeakSet<object>(),
): Set<string> {
  if (value === null || typeof value !== 'object') return keys;
  if (seen.has(value)) return keys;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    allObjectKeys(child, keys, seen);
  }
  return keys;
}

function isHandle(
  result: DocumentInstanceHandle | DiagnosticResult,
): result is DocumentInstanceHandle {
  return 'lease' in result;
}

function diagnosticsOf(result: DocumentInstanceHandle | DiagnosticResult): readonly RuntimeDiagnostic[] {
  return isHandle(result) ? [] : result.diagnostics;
}

function successfulHandle(result: DocumentInstanceHandle | DiagnosticResult): DocumentInstanceHandle {
  expect(diagnosticsOf(result)).toEqual([]);
  expect(isHandle(result)).toBe(true);
  return result as DocumentInstanceHandle;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createInspectableDocumentRuntimePort(
  assembleOccurrence: DocumentRuntimePort['assembleOccurrence'] = () => {
    throw new Error('Document occurrence assembly capability was not configured.');
  },
  definitions: Readonly<Record<string, DocumentUnitPlan>> = {
    [PLAN.unitFqn]: PLAN,
    [EXTERNAL_PLAN.unitFqn]: EXTERNAL_PLAN,
  },
  createRegistry: DocumentRuntimePort['createRegistry'] = () => createDocumentInstanceRegistry!(),
): DocumentRuntimePort {
  return {
    resolveDefinition: vi.fn((definitionFqn) => definitions[definitionFqn]),
    createRegistry: vi.fn(createRegistry),
    assembleOccurrence: vi.fn(assembleOccurrence),
  };
}

function configureDocumentRuntime(
  runtime: DocumentOccurrenceRuntime | readonly DocumentOccurrenceRuntime[],
  assembleOccurrence: DocumentRuntimePort['assembleOccurrence'],
  definitions?: Readonly<Record<string, DocumentUnitPlan>>,
  createRegistry?: DocumentRuntimePort['createRegistry'],
): DocumentRuntimeConfig {
  const runtimes = Array.isArray(runtime) ? runtime : [runtime];
  for (const item of runtimes) {
    Object.assign(
      item.documentRuntime,
      createInspectableDocumentRuntimePort(assembleOccurrence, definitions, createRegistry),
    );
  }
  return Object.freeze({});
}

function productionOccurrenceRecord(input: {
  occurrencePort: DocumentOccurrenceRegistryPort;
  unitInstanceId: string;
  lease: string;
  target: unknown;
}): { address: DocumentInstanceRef; record: DocumentOccurrenceRecord } {
  const registry = createDocumentInstanceRegistry!();
  const address = ref(input.unitInstanceId);
  expect(registry.register({
    ref: address,
    descriptor: descriptor(),
    target: input.target,
  }).ok).toBe(true);

  const assemblyRuntime = runtimeOwner(`production:${input.unitInstanceId}`, input.occurrencePort);
  const assembly: OccurrenceAssembly = {
    rootScopeId: PLAN.rootScopeId,
    rootRuntime: Object.freeze({
      ...assemblyRuntime,
      documentInstances: registry,
      authoring: Object.freeze({ mode: 'view' as const }),
    }),
    dispose() {},
  };
  return {
    address,
    record: {
      unitInstanceId: input.unitInstanceId,
      lease: input.lease,
      rootScopeId: PLAN.rootScopeId,
      addresses: [address],
      registry,
      assembly,
    },
  };
}

function expectRuntimeError(result: DiagnosticResult): void {
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: 'error' }),
  ]));
}

describe('Document occurrence runtime public surface', () => {
  it('exports both registry capabilities and async runtime-first open/close processors', () => {
    const occurrenceRegistry = createDocumentOccurrenceRegistry?.();
    expect({
      createDocumentInstanceRegistry: typeof api.createDocumentInstanceRegistry,
      createDocumentOccurrenceRegistry: typeof api.createDocumentOccurrenceRegistry,
      documentOccurrenceRegistryPort: {
        reserve: typeof occurrenceRegistry?.reserve,
        get: typeof occurrenceRegistry?.get,
        beginClose: typeof occurrenceRegistry?.beginClose,
        commit: typeof occurrenceRegistry?.commit,
        release: typeof occurrenceRegistry?.release,
        resolveHost: typeof occurrenceRegistry?.resolveHost,
        list: typeof occurrenceRegistry?.list,
      },
      openDocument: {
        type: typeof api.openDocument,
        arity: typeof api.openDocument === 'function' ? api.openDocument.length : undefined,
      },
      closeDocument: {
        type: typeof api.closeDocument,
        arity: typeof api.closeDocument === 'function' ? api.closeDocument.length : undefined,
      },
    }).toEqual({
      createDocumentInstanceRegistry: 'function',
      createDocumentOccurrenceRegistry: 'function',
      documentOccurrenceRegistryPort: {
        reserve: 'function',
        get: 'function',
        beginClose: 'function',
        commit: 'function',
        release: 'function',
        resolveHost: 'function',
        list: 'function',
      },
      openDocument: { type: 'function', arity: 3 },
      closeDocument: { type: 'function', arity: 3 },
    });
  });
});

describe.runIf(productionOccurrenceRegistryApiAvailable)(
  'production Document occurrence registry port',
  () => {
    it('enforces matching leases across reserve, commit, visibility, and release', () => {
      const occurrencePort = createDocumentOccurrenceRegistry!();
      const unitInstanceId = 'production-lifecycle';
      const reservation = occurrencePort.reserve({ unitInstanceId });

      expect(reservation.lease).toEqual(expect.any(String));
      expect(reservation.lease).not.toBe('');
      expect(reservation.diagnostics).toEqual([]);

      const duplicate = occurrencePort.reserve({ unitInstanceId });
      expectRuntimeError(duplicate);

      const { record } = productionOccurrenceRecord({
        occurrencePort,
        unitInstanceId,
        lease: reservation.lease!,
        target: { generation: 1 },
      });
      expectRuntimeError(occurrencePort.commit({
        unitInstanceId,
        lease: 'stale-lease',
        record,
      }));
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();

      const mismatchedRecord = { ...record, unitInstanceId: 'another-occurrence' };
      expectRuntimeError(occurrencePort.commit({
        unitInstanceId,
        lease: reservation.lease!,
        record: mismatchedRecord,
      }));
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();

      expect(occurrencePort.commit({
        unitInstanceId,
        lease: reservation.lease!,
        record,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.get(unitInstanceId)).toBe(record);
      expect(occurrencePort.list()).toEqual([record]);

      expectRuntimeError(occurrencePort.release({ unitInstanceId, lease: 'stale-lease' }));
      expect(occurrencePort.get(unitInstanceId)).toBe(record);

      expect(occurrencePort.release({
        unitInstanceId,
        lease: reservation.lease!,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();
      expect(occurrencePort.list()).toEqual([]);
    });

    it('rejects a stale release after the same occurrence id is remounted', () => {
      const occurrencePort = createDocumentOccurrenceRegistry!();
      const unitInstanceId = 'production-remount';
      const firstReservation = occurrencePort.reserve({ unitInstanceId });
      const first = productionOccurrenceRecord({
        occurrencePort,
        unitInstanceId,
        lease: firstReservation.lease!,
        target: { generation: 1 },
      });

      expect(occurrencePort.commit({
        unitInstanceId,
        lease: firstReservation.lease!,
        record: first.record,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.release({
        unitInstanceId,
        lease: firstReservation.lease!,
      }).diagnostics).toEqual([]);

      const secondReservation = occurrencePort.reserve({ unitInstanceId });
      const second = productionOccurrenceRecord({
        occurrencePort,
        unitInstanceId,
        lease: secondReservation.lease!,
        target: { generation: 2 },
      });
      expect(secondReservation.lease).toEqual(expect.any(String));
      expect(secondReservation.lease).not.toBe(firstReservation.lease);
      expect(occurrencePort.commit({
        unitInstanceId,
        lease: secondReservation.lease!,
        record: second.record,
      }).diagnostics).toEqual([]);

      expectRuntimeError(occurrencePort.release({
        unitInstanceId,
        lease: firstReservation.lease!,
      }));
      expect(occurrencePort.get(unitInstanceId)).toBe(second.record);
      expect(occurrencePort.list()).toEqual([second.record]);

      expect(occurrencePort.release({
        unitInstanceId,
        lease: secondReservation.lease!,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();
      expect(occurrencePort.list()).toEqual([]);
    });

    it('atomically claims close and hides closing records from active resolution', () => {
      const occurrencePort = createDocumentOccurrenceRegistry!();
      const unitInstanceId = 'production-closing-claim';
      const reservation = occurrencePort.reserve({ unitInstanceId });
      const target = Object.freeze({ generation: 1 });
      const { address, record } = productionOccurrenceRecord({
        occurrencePort,
        unitInstanceId,
        lease: reservation.lease!,
        target,
      });
      expect(occurrencePort.commit({
        unitInstanceId,
        lease: reservation.lease!,
        record,
      }).diagnostics).toEqual([]);

      const claim = occurrencePort.beginClose({
        unitInstanceId,
        lease: reservation.lease!,
      });
      expect(claim).toEqual({ diagnostics: [], record, descendants: [] });
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();
      expect(occurrencePort.list()).toEqual([]);
      expect(occurrencePort.resolveHost(address)).toBeUndefined();

      expectRuntimeError(occurrencePort.beginClose({
        unitInstanceId,
        lease: reservation.lease!,
      }));
      expectRuntimeError(occurrencePort.reserve({ unitInstanceId }));
      expectRuntimeError(occurrencePort.release({ unitInstanceId, lease: 'stale-lease' }));
      expect(occurrencePort.release({
        unitInstanceId,
        lease: reservation.lease!,
      }).diagnostics).toEqual([]);

      const remount = occurrencePort.reserve({ unitInstanceId });
      expect(remount).toMatchObject({ diagnostics: [], lease: expect.any(String) });
      expect(remount.lease).not.toBe(reservation.lease);
      expectRuntimeError(occurrencePort.release({
        unitInstanceId,
        lease: reservation.lease!,
      }));
      expect(occurrencePort.release({
        unitInstanceId,
        lease: remount.lease!,
      }).diagnostics).toEqual([]);
    });

    it('keeps same-named occurrence records and host targets local to each port', () => {
      const leftPort = createDocumentOccurrenceRegistry!();
      const rightPort = createDocumentOccurrenceRegistry!();
      const unitInstanceId = 'shared-occurrence-name';
      const leftReservation = leftPort.reserve({ unitInstanceId });
      const rightReservation = rightPort.reserve({ unitInstanceId });
      const leftTarget = Object.freeze({ owner: 'left' });
      const rightTarget = Object.freeze({ owner: 'right' });
      const left = productionOccurrenceRecord({
        occurrencePort: leftPort,
        unitInstanceId,
        lease: leftReservation.lease!,
        target: leftTarget,
      });
      const right = productionOccurrenceRecord({
        occurrencePort: rightPort,
        unitInstanceId,
        lease: rightReservation.lease!,
        target: rightTarget,
      });

      expect(leftReservation.lease).toEqual(expect.any(String));
      expect(rightReservation.lease).toEqual(expect.any(String));
      expect(leftPort.commit({
        unitInstanceId,
        lease: leftReservation.lease!,
        record: left.record,
      }).diagnostics).toEqual([]);
      expect(rightPort.commit({
        unitInstanceId,
        lease: rightReservation.lease!,
        record: right.record,
      }).diagnostics).toEqual([]);

      expect(leftPort.get(unitInstanceId)).toBe(left.record);
      expect(rightPort.get(unitInstanceId)).toBe(right.record);
      expect(leftPort.list()).toEqual([left.record]);
      expect(rightPort.list()).toEqual([right.record]);
      expect(leftPort.resolveHost(right.address)).toBe(leftTarget);
      expect(rightPort.resolveHost(left.address)).toBe(rightTarget);
    });
  },
);

describe.runIf(registryApiAvailable)('per-occurrence Document instance registry', () => {
  it('isolates the same local address across two unitInstanceId namespaces', () => {
    const registry = createDocumentInstanceRegistry!();
    const leftTarget = Object.freeze({ occurrence: 'left' });
    const rightTarget = Object.freeze({ occurrence: 'right' });

    expect(registry.register({ ref: ref('system-design-left'), descriptor: descriptor(), target: leftTarget }).ok)
      .toBe(true);
    expect(registry.register({ ref: ref('system-design-right'), descriptor: descriptor(), target: rightTarget }).ok)
      .toBe(true);
    expect(registry.resolve<typeof leftTarget>(ref('system-design-left')).value?.target).toBe(leftTarget);
    expect(registry.resolve<typeof rightTarget>(ref('system-design-right')).value?.target).toBe(rightTarget);
  });

  it('rejects duplicate active registration without replacing the first target', () => {
    const registry = createDocumentInstanceRegistry!();
    const address = ref('system-design');
    const firstTarget = { generation: 1 };
    const first = registry.register({ ref: address, descriptor: descriptor(), target: firstTarget });
    const duplicate = registry.register({
      ref: address,
      descriptor: descriptor(),
      target: { generation: 2 },
    });

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(registry.resolve<typeof firstTarget>(address).value?.target).toBe(firstTarget);
  });

  it('rejects the same active x-id across projection roles without widening ref identity', () => {
    const registry = createDocumentInstanceRegistry!();
    const mainAddress = ref('cross-role-document');
    const sidebarAddress = { ...mainAddress, projectionRole: 'sidebar' };
    const mainTarget = { projection: 'main' };
    const sidebarTarget = { projection: 'sidebar' };
    const mainRegistration = registry.register({
      ref: mainAddress,
      descriptor: descriptor(),
      target: mainTarget,
    });

    const duplicate = registry.register({
      ref: sidebarAddress,
      descriptor: { ...descriptor(), projectionRole: 'sidebar' },
      target: sidebarTarget,
    });

    expect(mainRegistration.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(registry.resolve<typeof mainTarget>(mainAddress).value?.target).toBe(mainTarget);
    expect(registry.resolve(sidebarAddress).ok).toBe(false);
    expect(registry.list('cross-role-document')).toEqual([
      expect.objectContaining({ ref: mainAddress, target: mainTarget }),
    ]);

    expect(registry.unregister({
      ref: sidebarAddress,
      ownerToken: mainRegistration.ownerToken!,
    }).ok).toBe(false);
    expect(registry.resolve<typeof mainTarget>(mainAddress).value?.target).toBe(mainTarget);
    expect(registry.unregister({
      ref: mainAddress,
      ownerToken: mainRegistration.ownerToken!,
    }).ok).toBe(true);
    expect(registry.register({
      ref: sidebarAddress,
      descriptor: { ...descriptor(), projectionRole: 'sidebar' },
      target: sidebarTarget,
    }).ok).toBe(true);
    expect(registry.resolve<typeof sidebarTarget>(sidebarAddress).value?.target).toBe(sidebarTarget);
  });

  it('rejects descriptor role or x-id mismatches without polluting resolve or list', () => {
    const registry = createDocumentInstanceRegistry!();
    const address = ref('mismatch-document');

    const roleMismatch = registry.register({
      ref: address,
      descriptor: { ...descriptor(), projectionRole: 'secondary' },
      target: { mismatch: 'role' },
    });
    const xIdMismatch = registry.register({
      ref: address,
      descriptor: descriptor('different-x-id'),
      target: { mismatch: 'x-id' },
    });

    for (const failed of [roleMismatch, xIdMismatch]) {
      expect(failed.ok).toBe(false);
      expect(failed.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/descriptor|ref|match/i),
        }),
      ]));
    }
    expect(registry.resolve(address).ok).toBe(false);
    expect(registry.list()).toEqual([]);

    const target = { clean: true };
    expect(registry.register({
      ref: address,
      descriptor: descriptor(),
      target,
    }).ok).toBe(true);
    expect(registry.resolve<typeof target>(address).value?.target).toBe(target);
    expect(registry.list()).toHaveLength(1);
  });

  it('uses owner tokens so a stale unregister cannot remove a remounted target', () => {
    const registry = createDocumentInstanceRegistry!();
    const address = ref('system-design');
    const first = registry.register({
      ref: address,
      descriptor: descriptor(),
      target: { generation: 1 },
    });
    expect(first.ownerToken).toEqual(expect.any(String));
    expect(registry.unregister({ ref: address, ownerToken: first.ownerToken! }).ok).toBe(true);

    const secondTarget = { generation: 2 };
    const second = registry.register({ ref: address, descriptor: descriptor(), target: secondTarget });
    const stale = registry.unregister({ ref: address, ownerToken: first.ownerToken! });

    expect(second.ownerToken).not.toBe(first.ownerToken);
    expect(stale.ok).toBe(false);
    expect(registry.resolve<typeof secondTarget>(address).value?.target).toBe(secondTarget);
  });

  it('returns alias-safe frozen snapshots without freezing or copying the opaque target', () => {
    const registry = createDocumentInstanceRegistry!();
    const address = ref('immutable-resolution');
    const addressDescriptor = descriptor();
    addressDescriptor.metadata = {
      projection: {
        placement: {
          region: 'sidebar',
          panels: [
            {
              id: 'outline',
              slots: [{ name: 'primary', dimensions: [{ axis: 'x', size: 2 }] }],
            },
            {
              id: 'inspection',
              slots: [{ name: 'secondary', dimensions: [{ axis: 'y', size: 1 }] }],
            },
          ],
          breadcrumb: ['document', 'sidebar', 'review'],
        },
      },
    };
    const expectedAddress = structuredClone(address);
    const expectedDescriptor = structuredClone(addressDescriptor);
    const target = { mutable: true };
    expect(registry.register({ ref: address, descriptor: addressDescriptor, target }).ok).toBe(true);

    address.xId = 'mutated-external-alias';
    addressDescriptor.scopeId = 'mutated-external-scope';
    const metadata = addressDescriptor.metadata as {
      projection: {
        placement: {
          region: string;
          panels: Array<{
            id: string;
            slots: Array<{
              name: string;
              dimensions: Array<{ axis: string; size: number }>;
            }>;
          }>;
          breadcrumb: string[];
        };
      };
    };
    metadata.projection.placement.region = 'mutated-external-region';
    metadata.projection.placement.panels.push({
      id: 'mutated-panel',
      slots: [{ name: 'mutated', dimensions: [{ axis: 'z', size: 99 }] }],
    });
    metadata.projection.placement.breadcrumb.splice(1, 1, 'mutated-breadcrumb');
    metadata.projection.placement.panels[0].id = 'mutated-element';
    metadata.projection.placement.panels[0].slots[0].name = 'mutated-slot';
    metadata.projection.placement.panels[0].slots[0].dimensions[0].size = 99;

    const first = registry.resolve<typeof target>(expectedAddress);
    expect(first.ok).toBe(true);
    expect(first.value).toEqual({
      ref: expectedAddress,
      descriptor: expectedDescriptor,
      target,
    });
    expect(first.value?.target).toBe(target);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value?.ref)).toBe(true);
    expect(Object.isFrozen(first.value?.descriptor)).toBe(true);
    const resolvedMetadata = first.value?.descriptor.metadata as {
      projection: typeof metadata.projection;
    };
    expect(resolvedMetadata.projection.placement.region).toBe('sidebar');
    expect(resolvedMetadata.projection.placement.panels).toHaveLength(2);
    expect(resolvedMetadata.projection.placement.panels[0].id).toBe('outline');
    expect(resolvedMetadata.projection.placement.breadcrumb).toEqual([
      'document', 'sidebar', 'review',
    ]);
    expect(resolvedMetadata.projection.placement.panels[0].slots[0].name).toBe('primary');
    expect(resolvedMetadata.projection.placement.panels[0].slots[0].dimensions[0].size).toBe(2);
    expect(Object.isFrozen(resolvedMetadata)).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection)).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement)).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement.panels)).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement.panels[0])).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement.panels[0].slots)).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement.panels[0].slots[0])).toBe(true);
    expect(Object.isFrozen(
      resolvedMetadata.projection.placement.panels[0].slots[0].dimensions,
    )).toBe(true);
    expect(Object.isFrozen(
      resolvedMetadata.projection.placement.panels[0].slots[0].dimensions[0],
    )).toBe(true);
    expect(Object.isFrozen(resolvedMetadata.projection.placement.breadcrumb)).toBe(true);
    expect(Object.isFrozen(target)).toBe(false);

    expect(Reflect.set(first.value!, 'target', { mutable: false })).toBe(false);
    expect(Reflect.set(first.value!.ref, 'xId', 'mutated-x-id')).toBe(false);
    expect(Reflect.set(first.value!.descriptor, 'scopeId', 'mutated-scope')).toBe(false);
    expect(Reflect.set(resolvedMetadata.projection.placement, 'region', 'mutated-resolved-region'))
      .toBe(false);
    expect(Reflect.set(resolvedMetadata.projection.placement.panels[0], 'id', 'mutated-resolved-id'))
      .toBe(false);
    expect(Reflect.set(
      resolvedMetadata.projection.placement.panels[0].slots[0].dimensions[0],
      'size',
      100,
    )).toBe(false);
    expect(Reflect.set(resolvedMetadata.projection.placement.panels, '0', {})).toBe(false);
    expect(Reflect.set(resolvedMetadata.projection.placement.breadcrumb, '1', 'mutated'))
      .toBe(false);
    expect(Reflect.set(target, 'mutable', false)).toBe(true);

    const second = registry.resolve<typeof target>(ref('immutable-resolution'));
    expect(second.ok).toBe(true);
    expect(second.value).toEqual({
      ref: expectedAddress,
      descriptor: expectedDescriptor,
      target,
    });
    expect(second.value?.target).toBe(target);
    expect(second.value?.target.mutable).toBe(false);
    expect(Object.isFrozen(second.value)).toBe(true);
    expect(Object.isFrozen(second.value?.ref)).toBe(true);
    expect(Object.isFrozen(second.value?.descriptor)).toBe(true);
    const secondMetadata = second.value?.descriptor.metadata as {
      projection: typeof metadata.projection;
    };
    expect(secondMetadata.projection.placement.region).toBe('sidebar');
    expect(secondMetadata.projection.placement.panels[0].id).toBe('outline');
    expect(secondMetadata.projection.placement.panels[0].slots[0].dimensions[0].size).toBe(2);
    expect(secondMetadata.projection.placement.breadcrumb).toEqual([
      'document', 'sidebar', 'review',
    ]);
    expect(Object.isFrozen(secondMetadata.projection.placement)).toBe(true);
    expect(Object.isFrozen(secondMetadata.projection.placement.panels)).toBe(true);
    expect(Object.isFrozen(secondMetadata.projection.placement.panels[0])).toBe(true);
    expect(Object.isFrozen(
      secondMetadata.projection.placement.panels[0].slots[0].dimensions,
    )).toBe(true);
    expect(Object.isFrozen(
      secondMetadata.projection.placement.panels[0].slots[0].dimensions[0],
    )).toBe(true);
    expect(Object.isFrozen(secondMetadata.projection.placement.breadcrumb)).toBe(true);
    expect(Object.isFrozen(second.value?.target)).toBe(false);
  });
});

describe.runIf(lifecycleApiAvailable)('runtime-first Document occurrence lifecycle', () => {
  it('rejects non-canonical occurrence addresses before reserve, registry creation, or assembly', async () => {
    const cases: Array<{
      label: string;
      unitInstanceId: string;
      plan: DocumentUnitPlan;
    }> = [
      {
        label: 'unitInstanceId',
        unitInstanceId: 'bad unit',
        plan: PLAN,
      },
      {
        label: 'projectionRole',
        unitInstanceId: 'preflight-role',
        plan: Object.freeze({
          ...PLAN,
          addressableInstances: Object.freeze([
            Object.freeze({ ...ADDRESS_DESCRIPTOR, projectionRole: 'SidePanel' }),
          ]),
        }),
      },
      {
        label: 'xId',
        unitInstanceId: 'preflight-x-id',
        plan: Object.freeze({
          ...PLAN,
          addressableInstances: Object.freeze([
            Object.freeze({ ...ADDRESS_DESCRIPTOR, xId: 'bad x-id' }),
          ]),
        }),
      },
    ];

    for (const item of cases) {
      const occurrencePort = createInspectableOccurrencePort();
      const owner = runtimeOwner(`canonical-preflight:${item.label}`, occurrencePort);
      const createRegistry = vi.fn(() => createDocumentInstanceRegistry!());
      const assembleOccurrence = vi.fn((runtime: unknown, input: AssembleDocumentOccurrenceInput) => ({
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      }));
      const config = configureDocumentRuntime(
        owner,
        assembleOccurrence,
        { [item.plan.unitFqn]: item.plan },
        createRegistry,
      );
      const result = await openDocument!(owner, {
        definitionFqn: item.plan.unitFqn,
        context: { unitInstanceId: item.unitInstanceId, mode: 'edit' },
      }, config);

      expect(diagnosticsOf(result)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'HALFCODE_DOCUMENT_INSTANCE_REF_INVALID',
        }),
      ]));
      expect(occurrencePort.reserve).not.toHaveBeenCalled();
      expect(createRegistry).not.toHaveBeenCalled();
      expect(assembleOccurrence).not.toHaveBeenCalled();
      expect(occurrencePort.list()).toEqual([]);
    }
  });

  it('obtains definition lookup, registry creation, and assembly only from runtime capabilities', async () => {
    const owner = runtimeOwner('runtime-authority-owner');
    const assembleOccurrence = vi.fn((runtime: DocumentScopeRuntime, input: AssembleDocumentOccurrenceInput) => ({
      rootScopeId: input.plan.rootScopeId,
      rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
      dispose() {},
    }));
    const config = configureDocumentRuntime(owner, assembleOccurrence);

    expect(Object.keys(config)).toEqual([]);
    expect(Object.values(config).some((value) => typeof value === 'function')).toBe(false);

    const handle = successfulHandle(await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'runtime-authority-document', mode: 'edit' },
    }, config));

    expect(owner.documentRuntime.resolveDefinition).toHaveBeenCalledWith(PLAN.unitFqn);
    expect(owner.documentRuntime.createRegistry).toHaveBeenCalledTimes(1);
    expect(owner.documentRuntime.assembleOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({
        documentOccurrences: owner.documentOccurrences,
        documentRuntime: owner.documentRuntime,
        documentInstances: expect.any(Object),
        authoring: expect.objectContaining({ mode: 'edit' }),
      }),
      expect.objectContaining({ plan: PLAN }),
      config,
    );
    expect(assembleOccurrence).toHaveBeenCalledTimes(1);
    expect(await closeDocument!(owner, handle, config)).toEqual({ diagnostics: [] });
  });

  it('uses the injected occurrence port for lifecycle authority across all Scope runtimes', async () => {
    const occurrencePort = createInspectableOccurrencePort();
    const owner = runtimeOwner('observable-owner', occurrencePort);
    const hostedRuntime = scopeRuntime(owner, occurrencePort, 'host-target');
    const assembledScopes: DocumentScopeRuntime[][] = [];
    const config = configureDocumentRuntime(owner, (runtime, input) => {
      if (input.context.unitInstanceId === 'port-host') {
        expect(runtime.documentInstances.register({
          ref: ref('port-host', 'child-host'),
          descriptor: descriptor('child-host'),
          target: hostedRuntime,
        }).ok).toBe(true);
      }
      const rootRuntime = inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`);
      const capsuleRuntime = inheritedScopeRuntime(rootRuntime, `capsule:${input.context.unitInstanceId}`);
      const componentRuntime = inheritedScopeRuntime(rootRuntime, `component:${input.context.unitInstanceId}`);
      assembledScopes.push([rootRuntime, capsuleRuntime, componentRuntime]);
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime,
        capsuleScopeRuntimes: [capsuleRuntime],
        componentScopeRuntimes: [componentRuntime],
        dispose() {},
      };
    });

    const host = successfulHandle(await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'port-host', mode: 'edit' },
    }, config));
    const child = successfulHandle(await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'port-child', mode: 'edit' },
      hostOccurrenceRef: ref('port-host', 'child-host'),
    }, config));

    expect(occurrencePort.reserve).toHaveBeenCalledWith({ unitInstanceId: 'port-host' });
    expect(occurrencePort.reserve).toHaveBeenCalledWith({
      unitInstanceId: 'port-child',
      parent: { unitInstanceId: 'port-host', lease: host.lease },
    });
    expect(occurrencePort.commit).toHaveBeenCalledTimes(2);
    expect(occurrencePort.resolveHost).toHaveBeenCalledWith(ref('port-host', 'child-host'));
    expect(occurrencePort.list().map((record) => record.unitInstanceId).sort()).toEqual([
      'port-child',
      'port-host',
    ]);
    for (const scopeRuntime of assembledScopes.flat()) {
      expect(scopeRuntime.documentOccurrences).toBe(occurrencePort);
      expect(scopeRuntime.documentRuntime).toBe(owner.documentRuntime);
    }

    expect(await closeDocument!(owner, child, config)).toEqual({ diagnostics: [] });
    expect(await closeDocument!(owner, host, config)).toEqual({ diagnostics: [] });
    expect(occurrencePort.beginClose).toHaveBeenCalledWith({
      unitInstanceId: 'port-child',
      lease: child.lease,
    });
    expect(occurrencePort.beginClose).toHaveBeenCalledWith({
      unitInstanceId: 'port-host',
      lease: host.lease,
    });
    expect(occurrencePort.release).toHaveBeenCalledWith({
      unitInstanceId: 'port-child',
      lease: child.lease,
    });
    expect(occurrencePort.release).toHaveBeenCalledWith({
      unitInstanceId: 'port-host',
      lease: host.lease,
    });
    expect(occurrencePort.list()).toEqual([]);
  });

  it('rejects a mismatched Scope occurrence port and fully rolls back assembly state', async () => {
    const occurrencePort = createInspectableOccurrencePort();
    const foreignPort = createInspectableOccurrencePort();
    const owner = runtimeOwner('mismatch-owner', occurrencePort);
    const childDispose = vi.fn();
    const rootDispose = vi.fn();
    let instanceRegistry: DocumentInstanceRegistry | undefined;
    const config = configureDocumentRuntime(owner, (runtime, input) => {
      instanceRegistry = runtime.documentInstances;
      expect(runtime.documentInstances.register({
        ref: ref(input.context.unitInstanceId),
        descriptor: descriptor(),
        target: { partial: true },
      }).ok).toBe(true);
      const rootRuntime = inheritedScopeRuntime(runtime, 'root:mismatched-document');
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime,
        capsuleScopeRuntimes: [inheritedScopeRuntime(rootRuntime, 'capsule:mismatched-document')],
        componentScopeRuntimes: [scopeRuntime(rootRuntime, foreignPort, 'component:mismatched-document')],
        childOccurrences: [{ dispose: childDispose }],
        dispose: rootDispose,
      };
    });

    const result = await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'mismatched-document', mode: 'edit' },
    }, config);

    expect(diagnosticsOf(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/occurrence|port|capability|scope|mismatch/i),
      }),
    ]));
    expect(childDispose).toHaveBeenCalledTimes(1);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(instanceRegistry?.resolve(ref('mismatched-document')).ok).toBe(false);
    expect(occurrencePort.release).toHaveBeenCalled();
    expect(occurrencePort.list()).toEqual([]);
    expect(foreignPort.list()).toEqual([]);
  });

  it('rejects an assembly root Scope mismatch before commit and keeps the plan as root authority', async () => {
    const occurrencePort = createInspectableOccurrencePort();
    const owner = runtimeOwner('root-authority-owner', occurrencePort);
    const childDispose = vi.fn();
    const rootDispose = vi.fn();
    let failedRegistry: DocumentInstanceRegistry | undefined;
    let returnWrongRoot = true;
    const config = configureDocumentRuntime(owner, (runtime, input) => {
      if (returnWrongRoot) {
        failedRegistry = runtime.documentInstances;
        expect(runtime.documentInstances.register({
          ref: ref(input.context.unitInstanceId),
          descriptor: descriptor(),
          target: { partial: true },
        }).ok).toBe(true);
      }
      return {
        rootScopeId: returnWrongRoot ? 'assembler-owned-root' : PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        childOccurrences: returnWrongRoot ? [{ dispose: childDispose }] : undefined,
        dispose: returnWrongRoot ? rootDispose : () => {},
      };
    });
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'root-authority-document', mode: 'edit' },
    };

    const failed = await openDocument!(owner, input, config);

    expect(diagnosticsOf(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/root.*scope|scope.*root/i),
      }),
    ]));
    expect(childDispose).toHaveBeenCalledTimes(1);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(failedRegistry?.resolve(ref('root-authority-document')).ok).toBe(false);
    expect(occurrencePort.commit).not.toHaveBeenCalled();
    expect(occurrencePort.release).toHaveBeenCalledWith({
      unitInstanceId: 'root-authority-document',
      lease: 'test-lease-1',
    });
    expect(occurrencePort.list()).toEqual([]);

    returnWrongRoot = false;
    const retried = successfulHandle(await openDocument!(owner, input, config));
    const record = occurrencePort.get('root-authority-document');
    expect(retried.rootScopeId).toBe(PLAN.rootScopeId);
    expect(record?.rootScopeId).toBe(PLAN.rootScopeId);
    expect(record?.assembly.rootScopeId).toBe(PLAN.rootScopeId);
    expect(record?.addresses).toEqual(retried.addresses);

    expect(await closeDocument!(owner, retried, config)).toEqual({ diagnostics: [] });
    expect(occurrencePort.list()).toEqual([]);
  });

  it('keeps active occurrences owner-local and never resolves a host ref across owners', async () => {
    const leftOwner = runtimeOwner('left-owner');
    const rightOwner = runtimeOwner('right-owner');
    const hostedRuntime = scopeRuntime(
      leftOwner,
      leftOwner.documentOccurrences,
      'left-hosted-occurrence',
    );
    const assemblyParents: unknown[] = [];
    const config = configureDocumentRuntime([leftOwner, rightOwner], (runtime, input) => {
      assemblyParents.push(runtime);
      if (
        runtime.documentOccurrences === leftOwner.documentOccurrences &&
        input.context.unitInstanceId === 'shared-document'
      ) {
        expect(runtime.documentInstances.register({
          ref: ref('shared-document', 'child-host'),
          descriptor: descriptor('child-host'),
          target: hostedRuntime,
        }).ok).toBe(true);
      }
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      };
    });
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'shared-document', mode: 'edit' },
    };

    successfulHandle(await openDocument!(leftOwner, input, config));
    successfulHandle(await openDocument!(rightOwner, input, config));
    expect(leftOwner.documentOccurrences).not.toBe(rightOwner.documentOccurrences);

    successfulHandle(await openDocument!(leftOwner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'left-child', mode: 'edit' },
      hostOccurrenceRef: ref('shared-document', 'child-host'),
    }, config));
    expect((assemblyParents.at(-1) as { kind?: string }).kind).toBe(hostedRuntime.kind);
    expect(assemblyParents.at(-1)).not.toBe(hostedRuntime);

    const assemblyCountBeforeCrossOwnerOpen = assemblyParents.length;
    const crossOwner = await openDocument!(rightOwner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'right-child', mode: 'edit' },
      hostOccurrenceRef: ref('shared-document', 'child-host'),
    }, config);
    expect(diagnosticsOf(crossOwner)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(assemblyParents).toHaveLength(assemblyCountBeforeCrossOwnerOpen);
  });

  it('binds frozen static descriptors at open time and passes refs to assembly and handle', async () => {
    const owner = runtimeOwner();
    const planBeforeOpen = structuredClone(PLAN);
    let assemblyInput: AssembleDocumentOccurrenceInput | undefined;
    const config = configureDocumentRuntime(owner, (runtime, input) => {
      assemblyInput = input;
      return {
        rootScopeId: input.plan.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      };
    });

    const handle = successfulHandle(await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'bound-document', mode: 'edit' },
    }, config));
    const expectedRefs = [{
      unitInstanceId: 'bound-document',
      projectionRole: ADDRESS_DESCRIPTOR.projectionRole,
      xId: ADDRESS_DESCRIPTOR.xId,
    }];

    expect(assemblyInput?.plan).toEqual(PLAN);
    expect(assemblyInput?.plan).not.toBe(PLAN);
    expect(assemblyInput?.effectiveSource).toEqual(PLAN.source);
    expect(Object.isFrozen(assemblyInput?.plan)).toBe(true);
    expect(Object.isFrozen(assemblyInput?.plan.addressableInstances)).toBe(true);
    expect(Object.isFrozen(assemblyInput?.plan.addressableInstances[0])).toBe(true);
    expect(Object.isFrozen(assemblyInput?.context)).toBe(true);
    expect(Object.isFrozen(assemblyInput?.addresses)).toBe(true);
    expect(assemblyInput?.addresses).toEqual(expectedRefs);
    expect(handle.addresses).toEqual(expectedRefs);
    expect(PLAN).toEqual(planBeforeOpen);
    expect(Object.isFrozen(PLAN)).toBe(true);
    expect(Object.isFrozen(PLAN.addressableInstances)).toBe(true);
    expect(Object.isFrozen(PLAN.addressableInstances[0])).toBe(true);

    const boundaryKeys = allObjectKeys({ handle, assemblyInput });
    for (const forbidden of [
      'presenter',
      'presenterref',
      'dom',
      'writer',
      'target',
      'mountedtarget',
      'registry',
      'authoring',
      'proposal',
      'control',
    ]) {
      expect(boundaryKeys.has(forbidden), forbidden).toBe(false);
    }
  });

  it('rejects inline source override and applies external override without changing Scope/address plan', async () => {
    const owner = runtimeOwner();
    const inlinePlanBeforeOpen = structuredClone(PLAN);
    const inlineAssembly = vi.fn((): OccurrenceAssembly => {
      throw new Error('Inline source override must fail before occurrence assembly.');
    });
    const inlineResult = await openDocument!(owner, {
      definitionFqn: PLAN.unitFqn,
      context: {
        unitInstanceId: 'inline-override',
        mode: 'edit',
        externalSourceRef: 'vfs://./domain/forbidden.xnl',
      },
    }, configureDocumentRuntime(owner, inlineAssembly));

    expect(diagnosticsOf(inlineResult)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/inline.*external|external.*inline|override/i),
      }),
    ]));
    expect(inlineAssembly).not.toHaveBeenCalled();
    expect(PLAN).toEqual(inlinePlanBeforeOpen);

    const externalPlanBeforeOpen = structuredClone(EXTERNAL_PLAN);
    let externalAssemblyInput: AssembleDocumentOccurrenceInput | undefined;
    const externalHandle = successfulHandle(await openDocument!(owner, {
      definitionFqn: EXTERNAL_PLAN.unitFqn,
      context: {
        unitInstanceId: 'external-override',
        mode: 'edit',
        externalSourceRef: 'vfs://./domain/system-design.local.xnl',
      },
    }, configureDocumentRuntime(owner, (runtime, input) => {
      externalAssemblyInput = input;
      return {
        rootScopeId: input.plan.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      };
    })));

    expect(externalAssemblyInput?.effectiveSource).toEqual({
      kind: 'external',
      ref: 'vfs://./domain/system-design.local.xnl',
    });
    expect(externalAssemblyInput?.effectiveSource).not.toEqual(EXTERNAL_PLAN.source);
    expect(externalAssemblyInput?.plan.source).toEqual({
      kind: 'external',
      ref: 'vfs://./domain/system-design.xnl',
    });
    expect(externalAssemblyInput?.plan.rootScopeId).toBe(EXTERNAL_PLAN.rootScopeId);
    expect(externalAssemblyInput?.plan.addressableInstances[0]).toEqual(ADDRESS_DESCRIPTOR);
    expect(externalAssemblyInput?.plan.addressableInstances[0]).not.toBe(ADDRESS_DESCRIPTOR);
    expect(Object.isFrozen(externalAssemblyInput?.plan.addressableInstances[0])).toBe(true);
    expect(externalHandle.rootScopeId).toBe(EXTERNAL_PLAN.rootScopeId);
    expect(externalHandle.addresses).toEqual([{
      unitInstanceId: 'external-override',
      projectionRole: ADDRESS_DESCRIPTOR.projectionRole,
      xId: ADDRESS_DESCRIPTOR.xId,
    }]);
    expect(EXTERNAL_PLAN).toEqual(externalPlanBeforeOpen);
  });

  it('opens the same FQN twice with isolated occurrence runtime and registry namespaces', async () => {
    const hostRuntime = runtimeOwner();
    const assemblies: Array<{
      runtime: unknown;
      input: AssembleDocumentOccurrenceInput;
      rootRuntime: DocumentScopeRuntime;
    }> = [];
    const config = configureDocumentRuntime(hostRuntime, (runtime, input) => {
      const rootRuntime = inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`);
      assemblies.push({ runtime, input, rootRuntime });
      return { rootScopeId: PLAN.rootScopeId, rootRuntime, dispose() {} };
    });

    const left = successfulHandle(await openDocument!(hostRuntime, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'system-design-left', mode: 'edit' },
    }, config));
    const right = successfulHandle(await openDocument!(hostRuntime, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'system-design-right', mode: 'edit' },
    }, config));

    expect(left.unitInstanceId).toBe('system-design-left');
    expect(right.unitInstanceId).toBe('system-design-right');
    expect(left.lease).not.toBe(right.lease);
    expect(assemblies.map((entry) => entry.runtime)).not.toContain(hostRuntime);
    expect(assemblies[0].runtime).not.toBe(assemblies[1].runtime);
    expect(assemblies[0].rootRuntime).not.toBe(assemblies[1].rootRuntime);
    expect((assemblies[0].runtime as DocumentScopeRuntime).documentInstances)
      .not.toBe((assemblies[1].runtime as DocumentScopeRuntime).documentInstances);
  });

  it('reserves unitInstanceId before awaiting assembly so duplicate and concurrent opens fail atomically', async () => {
    const hostRuntime = runtimeOwner();
    const gate = deferred<OccurrenceAssembly>();
    const assemblyStarted = deferred<DocumentScopeRuntime>();
    let pendingRuntime: DocumentScopeRuntime | undefined;
    const config = configureDocumentRuntime(hostRuntime, (runtime) => {
      pendingRuntime = runtime;
      assemblyStarted.resolve(runtime);
      return gate.promise;
    });
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'reserved-document', mode: 'edit' },
    };

    const firstPromise = openDocument!(hostRuntime, input, config);
    await assemblyStarted.promise;
    const concurrent = await openDocument!(hostRuntime, input, config);
    expect(diagnosticsOf(concurrent)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/active|duplicate|reserved/i),
      }),
    ]));

    gate.resolve({
      rootScopeId: PLAN.rootScopeId,
      rootRuntime: inheritedScopeRuntime(pendingRuntime, 'root:reserved-document'),
      dispose() {},
    });
    const first = successfulHandle(await firstPromise);
    const duplicate = await openDocument!(hostRuntime, input, config);
    expect(diagnosticsOf(duplicate)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    await closeDocument!(hostRuntime, first, config);
  });

  it('resolves hostOccurrenceRef through the parent occurrence registry and fails closed otherwise', async () => {
    const hostRuntime = runtimeOwner('top-level-host');
    const hostedRuntime = scopeRuntime(
      hostRuntime,
      hostRuntime.documentOccurrences,
      'hosted-occurrence-runtime',
    );
    const assemblyParents: unknown[] = [];
    const config = configureDocumentRuntime(hostRuntime, (runtime, input) => {
      assemblyParents.push(runtime);
      if (input.context.unitInstanceId === 'host-document') {
        const registered = runtime.documentInstances.register({
          ref: ref('host-document', 'child-host'),
          descriptor: descriptor('child-host'),
          target: hostedRuntime,
        });
        expect(registered.ok).toBe(true);
      }
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      };
    });
    successfulHandle(await openDocument!(hostRuntime, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'host-document', mode: 'edit' },
    }, config));
    successfulHandle(await openDocument!(hostRuntime, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'child-document', mode: 'edit' },
      hostOccurrenceRef: ref('host-document', 'child-host'),
    }, config));

    expect((assemblyParents[0] as { kind?: string }).kind).toBe(hostRuntime.kind);
    expect((assemblyParents[1] as { kind?: string }).kind).toBe(hostedRuntime.kind);
    expect(assemblyParents[0]).not.toBe(hostRuntime);
    expect(assemblyParents[1]).not.toBe(hostedRuntime);
    const notFound = await openDocument!(hostRuntime, {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'orphan-document', mode: 'edit' },
      hostOccurrenceRef: ref('missing-document', 'child-host'),
    }, config);
    expect(diagnosticsOf(notFound)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(assemblyParents).toHaveLength(2);
  });

  it.each([
    ['a plain object', 'plain-object'],
    ['a foreign occurrence capability', 'foreign-capability'],
  ] as const)(
    'rejects hostOccurrenceRef resolving to %s before occurrence assembly',
    async (_label, invalidTargetKind) => {
      const occurrencePort = createInspectableOccurrencePort();
      const owner = runtimeOwner('host-capability-owner', occurrencePort);
      const invalidTarget = invalidTargetKind === 'plain-object'
        ? { kind: 'plain-host-target' }
        : scopeRuntime(
            owner,
            createInspectableOccurrencePort(),
            'foreign-host-target',
          );
      const assembleOccurrence = vi.fn((runtime: unknown, input: AssembleDocumentOccurrenceInput) => ({
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        dispose() {},
      }));
      const config = configureDocumentRuntime(owner, assembleOccurrence);
      const unitInstanceId = `invalid-host-${invalidTargetKind}`;
      const hostOccurrenceRef = ref('host-document', 'child-host');
      const parentReservation = occurrencePort.reserve({ unitInstanceId: 'host-document' });
      const { record: parentRecord } = productionOccurrenceRecord({
        occurrencePort,
        unitInstanceId: 'host-document',
        lease: parentReservation.lease!,
        target: invalidTarget,
      });
      expect(occurrencePort.commit({
        unitInstanceId: 'host-document',
        lease: parentReservation.lease!,
        record: parentRecord,
      }).diagnostics).toEqual([]);
      vi.mocked(occurrencePort.reserve).mockClear();
      vi.mocked(occurrencePort.release).mockClear();
      vi.mocked(occurrencePort.resolveHost).mockClear();

      const result = await openDocument!(owner, {
        definitionFqn: PLAN.unitFqn,
        context: { unitInstanceId, mode: 'edit' },
        hostOccurrenceRef,
      }, config);

      expect(diagnosticsOf(result)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/host|occurrence|runtime|capability|mismatch/i),
        }),
      ]));
      expect(assembleOccurrence).not.toHaveBeenCalled();
      expect(occurrencePort.reserve).not.toHaveBeenCalled();
      expect(occurrencePort.resolveHost).toHaveBeenCalledWith(hostOccurrenceRef);
      expect(occurrencePort.release).not.toHaveBeenCalledWith(expect.objectContaining({
        unitInstanceId,
      }));
      expect(occurrencePort.get(unitInstanceId)).toBeUndefined();
      expect(occurrencePort.list()).toEqual([parentRecord]);

      const retry = occurrencePort.reserve({ unitInstanceId });
      expect(retry).toMatchObject({ diagnostics: [], lease: expect.any(String) });
      expect(occurrencePort.release({
        unitInstanceId,
        lease: retry.lease!,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.release({
        unitInstanceId: 'host-document',
        lease: parentReservation.lease!,
      }).diagnostics).toEqual([]);
      expect(occurrencePort.list()).toEqual([]);
    },
  );

  it('rolls back partial open state and releases the reservation for a clean retry', async () => {
    const childDispose = vi.fn();
    const rootDispose = vi.fn();
    let fail = true;
    let failedRegistry: DocumentInstanceRegistry | undefined;
    const hostRuntime = runtimeOwner();
    const config = configureDocumentRuntime(hostRuntime, (runtime, input) => {
      if (fail) {
        failedRegistry = runtime.documentInstances;
        runtime.documentInstances.register({
          ref: ref(input.context.unitInstanceId),
          descriptor: descriptor(),
          target: { partial: true },
        });
        return {
          rootScopeId: PLAN.rootScopeId,
          rootRuntime: inheritedScopeRuntime(runtime, 'root:retry-document:partial'),
          childOccurrences: [{ dispose: childDispose }],
          dispose: rootDispose,
          diagnostics: [{
            severity: 'error',
            code: 'TEST_PARTIAL_OPEN',
            message: 'assembly stopped after child creation',
          }],
        };
      }
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, 'root:retry-document:ready'),
        dispose() {},
      };
    });
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'retry-document', mode: 'edit' },
    };

    const failed = await openDocument!(hostRuntime, input, config);
    expect(diagnosticsOf(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TEST_PARTIAL_OPEN' }),
    ]));
    expect(childDispose).toHaveBeenCalledTimes(1);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(failedRegistry?.resolve(ref('retry-document')).ok).toBe(false);
    expect(hostRuntime.documentOccurrences.release).toHaveBeenCalled();
    expect(hostRuntime.documentOccurrences.list()).toEqual([]);

    fail = false;
    const retried = successfulHandle(await openDocument!(hostRuntime, input, config));
    expect(await closeDocument!(hostRuntime, retried, config)).toEqual({ diagnostics: [] });
  });

  it('claims concurrent close atomically, blocks remount while closing, and protects reopened occurrences', async () => {
    const occurrencePort = createDocumentOccurrenceRegistry!();
    const hostRuntime = runtimeOwner('concurrent-close-owner', occurrencePort);
    const releaseRootDispose = deferred<void>();
    const disposeEvents: string[] = [];
    let generation = 0;
    const assembleOccurrence = vi.fn((runtime: unknown, input: AssembleDocumentOccurrenceInput) => {
      generation += 1;
      const currentGeneration = generation;
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}:${currentGeneration}`),
        childOccurrences: [
          { dispose: () => { disposeEvents.push(`child:${currentGeneration}`); } },
        ],
        dispose: async () => {
          disposeEvents.push(`root:${currentGeneration}`);
          if (currentGeneration === 1) {
            await releaseRootDispose.promise;
          }
        },
      };
    });
    const config = configureDocumentRuntime(hostRuntime, assembleOccurrence);
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'concurrent-close-document', mode: 'edit' },
    };
    const first = successfulHandle(await openDocument!(hostRuntime, input, config));
    expect(assembleOccurrence).toHaveBeenCalledTimes(1);

      const firstClose = closeDocument!(hostRuntime, first, config);
      await vi.waitFor(() => {
        expect(disposeEvents).toEqual(['child:1', 'root:1']);
      });
    expect(occurrencePort.get(first.unitInstanceId)).toBeUndefined();
    expect(occurrencePort.list()).toEqual([]);

    const concurrentClose = await closeDocument!(hostRuntime, first, config);
    expectRuntimeError(concurrentClose);
    expect(disposeEvents).toEqual(['child:1', 'root:1']);

    expectRuntimeError(occurrencePort.reserve({ unitInstanceId: first.unitInstanceId }));
    const remountWhileClosing = await openDocument!(hostRuntime, input, config);
    expect(diagnosticsOf(remountWhileClosing)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/active|duplicate|reserved/i),
      }),
    ]));
    expect(assembleOccurrence).toHaveBeenCalledTimes(1);

    releaseRootDispose.resolve();
    expect(await firstClose).toEqual({ diagnostics: [] });
    expect(occurrencePort.list()).toEqual([]);

    const reopened = successfulHandle(await openDocument!(hostRuntime, input, config));
    expect(reopened.lease).not.toBe(first.lease);
    expect(assembleOccurrence).toHaveBeenCalledTimes(2);
    const staleClose = await closeDocument!(hostRuntime, first, config);
    expectRuntimeError(staleClose);
    expect(disposeEvents).toEqual(['child:1', 'root:1']);
    expect(occurrencePort.list()).toHaveLength(1);

    expect(await closeDocument!(hostRuntime, reopened, config)).toEqual({ diagnostics: [] });
    expect(disposeEvents).toEqual(['child:1', 'root:1', 'child:2', 'root:2']);
    expect(occurrencePort.list()).toEqual([]);
  });

  it('validates lease, ignores stale close, and cascades child then root disposal', async () => {
    const disposeOrder: string[] = [];
    const registries: DocumentInstanceRegistry[] = [];
    const hostRuntime = runtimeOwner();
    const config = configureDocumentRuntime(hostRuntime, (runtime, input) => {
      registries.push(runtime.documentInstances);
      expect(runtime.documentInstances.register({
        ref: ref(input.context.unitInstanceId),
        descriptor: descriptor(),
        target: { generation: registries.length },
      }).ok).toBe(true);
      return {
        rootScopeId: PLAN.rootScopeId,
        rootRuntime: inheritedScopeRuntime(runtime, `root:${input.context.unitInstanceId}`),
        childOccurrences: [
          { dispose: () => { disposeOrder.push('child-a'); } },
          { dispose: () => { disposeOrder.push('child-b'); } },
        ],
        dispose: () => { disposeOrder.push('root'); },
      };
    });
    const input: OpenDocumentInput = {
      definitionFqn: PLAN.unitFqn,
      context: { unitInstanceId: 'lease-document', mode: 'edit' },
    };
    const first = successfulHandle(await openDocument!(hostRuntime, input, config));
    expect(registries[0].resolve(ref('lease-document')).ok).toBe(true);
    expect(first).not.toHaveProperty('close');
    expect(await closeDocument!(hostRuntime, first, config)).toEqual({ diagnostics: [] });
    expect(disposeOrder).toEqual(['child-b', 'child-a', 'root']);
    expect(registries[0].resolve(ref('lease-document')).ok).toBe(false);
    expect(hostRuntime.documentOccurrences.list()).toEqual([]);

    disposeOrder.length = 0;
    const reopened = successfulHandle(await openDocument!(hostRuntime, input, config));
    expect(registries[1].resolve(ref('lease-document')).ok).toBe(true);
    expect(reopened.lease).not.toBe(first.lease);
    const stale = await closeDocument!(hostRuntime, first, config);
    expect(stale.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/lease|stale/i),
      }),
    ]));
    expect(disposeOrder).toEqual([]);
    expect(registries[1].resolve(ref('lease-document')).ok).toBe(true);
    expect(hostRuntime.documentOccurrences.list()).toHaveLength(1);

    expect(await closeDocument!(hostRuntime, reopened, config)).toEqual({ diagnostics: [] });
    expect(disposeOrder).toEqual(['child-b', 'child-a', 'root']);
    expect(registries[1].resolve(ref('lease-document')).ok).toBe(false);
    expect(hostRuntime.documentOccurrences.list()).toEqual([]);
  });
});
