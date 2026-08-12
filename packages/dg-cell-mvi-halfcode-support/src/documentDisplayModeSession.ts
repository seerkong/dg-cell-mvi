import { formatDocumentInstanceRef } from 'dg-cell-mvi-halfcode-contract';
import type {
  DocumentDisplayMode,
  DocumentDisplayModeCommand,
  DocumentDisplayModeDiagnostic,
  DocumentDisplayModeLease,
  DocumentDisplayModePolicy,
  DocumentDisplayModePolicyConfig,
  DocumentDisplayModePolicyRuntime,
  DocumentDisplayModeProjection,
  DocumentDisplayModeRegistrationResult,
  DocumentDisplayModeSession,
  DocumentDisplayModeSessionSnapshot,
  DocumentDisplayModeTransitionResult,
  DocumentInstanceRef,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createDocumentDisplayModeState,
  projectDocumentDisplayMode,
  reduceDocumentDisplayMode,
  registerDocumentDisplayModeOccurrence,
  unregisterDocumentDisplayModeOccurrence,
} from 'dg-cell-mvi-halfcode-logic';

export interface DocumentDisplayModePolicyBinding<
  TRuntime extends DocumentDisplayModePolicyRuntime = DocumentDisplayModePolicyRuntime,
  TConfig extends DocumentDisplayModePolicyConfig = DocumentDisplayModePolicyConfig,
> {
  readonly runtime: TRuntime;
  readonly processor: DocumentDisplayModePolicy<TRuntime, TConfig>;
  readonly config: TConfig;
}

export interface CreateDocumentDisplayModeSessionOptions<
  TRuntime extends DocumentDisplayModePolicyRuntime = DocumentDisplayModePolicyRuntime,
  TConfig extends DocumentDisplayModePolicyConfig = DocumentDisplayModePolicyConfig,
> {
  readonly unitInstanceId: string;
  readonly initialBaseMode: DocumentDisplayMode;
  readonly policy?: DocumentDisplayModePolicyBinding<TRuntime, TConfig>;
  readonly createLease?: (ref: DocumentInstanceRef, generation: number) => DocumentDisplayModeLease;
}

export function createDocumentDisplayModeSession<
  TRuntime extends DocumentDisplayModePolicyRuntime = DocumentDisplayModePolicyRuntime,
  TConfig extends DocumentDisplayModePolicyConfig = DocumentDisplayModePolicyConfig,
>(options: CreateDocumentDisplayModeSessionOptions<TRuntime, TConfig>): DocumentDisplayModeSession {
  let state = createDocumentDisplayModeState(options.unitInstanceId, options.initialBaseMode);
  let destroyed = false;
  let leaseGeneration = 0;
  const usedLeases = new Set<DocumentDisplayModeLease>();
  let operationQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<(snapshot: DocumentDisplayModeSessionSnapshot) => void>();
  const policy = options.policy?.processor;
  const runtime = options.policy?.runtime ?? (Object.freeze({}) as TRuntime);
  const config = options.policy?.config ?? (Object.freeze({}) as TConfig);
  let cachedSnapshot = Object.freeze({
    state,
    projections: Object.freeze([closedDocumentProjection(state.unitInstanceId, state.baseMode)]),
  });

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener(cachedSnapshot);
      } catch {
        // An observer cannot interrupt the owner actor or sibling observers.
      }
    });
  };

  const buildSnapshot = async (
    candidateState: typeof state,
    decidedProjection?: DocumentDisplayModeProjection,
  ): Promise<DocumentDisplayModeSessionSnapshot> => {
    const decidedKey = decidedProjection === undefined ? undefined : projectionKey(decidedProjection);
    const targets = [
      { kind: 'document' as const, unitInstanceId: candidateState.unitInstanceId },
      ...candidateState.occurrences.map((entry) => ({ kind: 'occurrence' as const, ref: entry.ref })),
    ];
    const projections = await Promise.all(targets.map((target) => (
      decidedProjection !== undefined && projectionKey({ target }) === decidedKey
        ? Promise.resolve(decidedProjection)
        : projectDocumentDisplayMode(candidateState, target, runtime, config, policy)
    )));
    return Object.freeze({ state: candidateState, projections: Object.freeze(projections) });
  };

  const refreshInternal = async (): Promise<DocumentDisplayModeSessionSnapshot> => {
    if (destroyed) return cachedSnapshot;
    const observedState = state;
    const nextSnapshot = await buildSnapshot(observedState);
    if (destroyed || state !== observedState) return cachedSnapshot;
    cachedSnapshot = nextSnapshot;
    notify();
    return cachedSnapshot;
  };

  const session: DocumentDisplayModeSession = Object.freeze({
    snapshot: () => cachedSnapshot,
    refreshPolicy: () => serialize(refreshInternal),
    register: (ref: DocumentInstanceRef) => serialize(async () => {
      if (destroyed) return registrationDestroyed(state);
      leaseGeneration += 1;
      const preferred = options.createLease?.(ref, leaseGeneration) ?? `mode-lease-${leaseGeneration.toString(36)}`;
      let lease = preferred;
      let collision = 0;
      while (usedLeases.has(lease)) {
        collision += 1;
        lease = `${preferred}-${leaseGeneration.toString(36)}-${collision.toString(36)}`;
      }
      const result = registerDocumentDisplayModeOccurrence(state, ref, lease);
      if (!result.ok) return result;
      usedLeases.add(lease);
      state = result.state;
      await refreshInternal();
      return result;
    }),
    unregister: (ref: DocumentInstanceRef, lease: DocumentDisplayModeLease) => serialize(async () => {
      if (destroyed) return transitionDestroyed(state);
      const result = unregisterDocumentDisplayModeOccurrence(state, ref, lease);
      if (!result.ok || !result.changed) return result;
      state = result.state;
      await refreshInternal();
      return result;
    }),
    dispatch: (command: DocumentDisplayModeCommand) => serialize(async () => {
      if (destroyed) return transitionDestroyed(state, command.correlationId);
      const result = await reduceDocumentDisplayMode(state, command, runtime, config, policy);
      if (!result.ok || !result.changed || destroyed) return destroyed ? transitionDestroyed(state, command.correlationId) : result;
      const nextSnapshot = await buildSnapshot(result.state, result.projection);
      if (destroyed) return transitionDestroyed(state, command.correlationId);
      state = result.state;
      cachedSnapshot = nextSnapshot;
      notify();
      return result;
    }),
    subscribe: (listener: (snapshot: DocumentDisplayModeSessionSnapshot) => void) => {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      try { listener(cachedSnapshot); } catch { /* isolated observer */ }
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      state = Object.freeze({ ...state, revision: state.revision + 1, occurrences: Object.freeze([]) });
      cachedSnapshot = Object.freeze({ state, projections: Object.freeze([closedDocumentProjection(state.unitInstanceId, state.baseMode)]) });
    },
  });
  return session;
}

function projectionKey(value: Pick<DocumentDisplayModeProjection, 'target'>): string {
  return value.target.kind === 'document'
    ? `document:${value.target.unitInstanceId}`
    : `occurrence:${formatDocumentInstanceRef(value.target.ref)}`;
}

function closedDocumentProjection(unitInstanceId: string, baseMode: DocumentDisplayMode): DocumentDisplayModeProjection {
  return Object.freeze({
    valid: true,
    target: Object.freeze({ kind: 'document', unitInstanceId }),
    inheritedMode: baseMode,
    overlay: 'inherit',
    effectiveMode: 'view',
    allowedModes: Object.freeze([]),
    canSwitch: false,
    diagnostics: Object.freeze([]),
    reason: 'Display mode policy has not been evaluated.',
  });
}

function destroyedDiagnostic(): DocumentDisplayModeDiagnostic {
  return Object.freeze({ code: 'DOCUMENT_DISPLAY_MODE_SESSION_DESTROYED', message: 'The document display mode session has been destroyed.' });
}

function transitionDestroyed(
  state: ReturnType<typeof createDocumentDisplayModeState>,
  correlationId?: string,
): DocumentDisplayModeTransitionResult {
  return Object.freeze({
    ok: false,
    changed: false,
    state,
    diagnostics: Object.freeze([destroyedDiagnostic()]),
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}

function registrationDestroyed(state: ReturnType<typeof createDocumentDisplayModeState>): DocumentDisplayModeRegistrationResult {
  return Object.freeze({ ok: false, state, diagnostics: Object.freeze([destroyedDiagnostic()]) });
}
