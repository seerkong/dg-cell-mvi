import {
  areXnlAuthoringLiveRevisionsEqual,
  areXnlAuthoringPersistedRevisionsEqual,
  validateXnlAuthoringCandidate,
  validateXnlAuthoringLiveRevision,
  validateXnlAuthoringOpenConfig,
  validateXnlAuthoringOpenInput,
  validateXnlAuthoringPersistenceReadResult,
  validateXnlAuthoringPersistenceResult,
  validateXnlAuthoringProposal,
  validateXnlAuthoringReloadInput,
  validateXnlAuthoringRetryPersistenceInput,
  validateXnlAuthoringSerializableValue,
  validateXnlAuthoringSubmitConfig,
  type XnlAuthoringAcceptedSnapshot,
  type XnlAuthoringControlPort,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringInvalidationInput,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringOpenedSession,
  type XnlAuthoringOpenConfig,
  type XnlAuthoringOpenInput,
  type XnlAuthoringReadInput,
  type XnlAuthoringPersistenceReadResult,
  type XnlAuthoringPersistenceReceipt,
  type XnlAuthoringPersistenceResult,
  type XnlAuthoringPersistedRevision,
  type XnlAuthoringProposal,
  type XnlAuthoringProposalPort,
  type XnlAuthoringReadonlySerializable,
  type XnlAuthoringReloadInput,
  type XnlAuthoringReloadResult,
  type XnlAuthoringRetryPersistenceInput,
  type XnlAuthoringRuntime,
  type XnlAuthoringSerializableRecord,
  type XnlAuthoringSessionFactoryPort,
  type XnlAuthoringSessionState,
  type XnlAuthoringStateListener,
  type XnlAuthoringSubmitConfig,
  type XnlAuthoringSubmitResult,
  type XnlAuthoringUnsubscribe,
} from 'dg-cell-mvi-halfcode-contract';
import { submitAuthoringEdit } from 'dg-cell-mvi-halfcode-logic';
import { freezePublic } from './publicFacts';

interface SessionMutableState<TDocument> {
  status: XnlAuthoringSessionState<TDocument>['status'];
  accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
  persistedRevision: XnlAuthoringPersistedRevision;
  persistenceReceipt?: XnlAuthoringPersistenceReceipt;
  activeProposalId?: string;
  actualPersistedRevision?: XnlAuthoringPersistedRevision;
  diagnostics?: readonly XnlAuthoringDiagnostic[];
}

interface PendingAcceptedInvalidation {
  readonly liveRevision: XnlAuthoringLiveRevision;
  readonly affectedIdentities: readonly string[];
}

type SessionOperation<T> = () => Promise<T>;
const EMPTY_READ_INPUT = Object.freeze({}) satisfies XnlAuthoringReadInput;

export function createXnlAuthoringSessionFactory<
  TDocument,
  TCommand,
  TMutation,
>(): XnlAuthoringSessionFactoryPort<TDocument, TCommand, TMutation> {
  return Object.freeze({
    open: async (
      runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
      input: XnlAuthoringOpenInput<TDocument>,
      config: XnlAuthoringOpenConfig,
    ) => {
      const inputValidation = validateXnlAuthoringOpenInput(input);
      if (!inputValidation.ok) {
        throw new Error(`XNL authoring open input failed validation: ${issuesToMessage(inputValidation.issues)}`);
      }
      const configValidation = validateXnlAuthoringOpenConfig(config);
      if (!configValidation.ok) {
        throw new Error(`XNL authoring open config failed validation: ${issuesToMessage(configValidation.issues)}`);
      }
      const capturedInput = freezePublic(input);
      freezePublic(config);
      return openAuthoringSession(runtime, capturedInput);
    },
  });
}

async function openAuthoringSession<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  input: XnlAuthoringOpenInput<TDocument>,
): Promise<XnlAuthoringOpenedSession<TDocument, TCommand>> {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new Error('XNL authoring session id must be a non-empty string.');
  }

  const source = captureReadSource(input.source);
  const read = await runtime.persistence.read(runtime, readInputFromSource(source), {});
  const loaded = requireLoadedRead(read);
  const issuedLiveRevisionValues = new Set<string>();
  const initialLiveRevision = await allocateLiveRevision(
    runtime,
    input.id,
    undefined,
    issuedLiveRevisionValues,
  );
  const accepted = freezePublic({
    kind: 'xnl-authoring-accepted-snapshot',
    document: loaded.document,
    liveRevision: initialLiveRevision,
  } satisfies XnlAuthoringAcceptedSnapshot<TDocument>);

  return createOpenedSession(runtime, input.id, {
    status: 'ready',
    accepted,
    persistedRevision: freezePublic(loaded.persistedRevision),
  }, source, issuedLiveRevisionValues);
}

function createOpenedSession<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  sessionId: string,
  initial: SessionMutableState<TDocument>,
  source: XnlAuthoringSerializableRecord | undefined,
  issuedLiveRevisionValues: Set<string>,
): XnlAuthoringOpenedSession<TDocument, TCommand> {
  let state = initial;
  let publicState = snapshotState(state);
  let disposed = false;
  let operationGeneration = 0;
  let pending: Promise<void> = Promise.resolve();
  let pendingInvalidation: PendingAcceptedInvalidation | undefined;
  const listeners = new Set<XnlAuthoringStateListener<TDocument>>();

  const publishState = (next: SessionMutableState<TDocument>): void => {
    if (disposed && next.status !== 'disposed') return;
    state = next;
    publicState = snapshotState(state);
    for (const listener of [...listeners]) {
      try {
        listener(publicState);
      } catch {
        // Listener failures are isolated from the owner session.
      }
    }
  };

  const enqueue = <T>(operation: SessionOperation<T>): Promise<T> => {
    const run = pending.then(operation, operation);
    pending = run.then(() => undefined, () => undefined);
    return run;
  };

  const failCurrent = (code: string, message: string): XnlAuthoringSubmitResult<TDocument> =>
    freezePublic({
      status: 'failed',
      liveRevision: state.accepted.liveRevision,
      diagnostics: [diagnostic(code, message)],
    } satisfies XnlAuthoringSubmitResult<TDocument>);

  const disposedResult = (): XnlAuthoringSubmitResult<TDocument> => failCurrent(
    'XNL_AUTHORING_SESSION_DISPOSED',
    'Authoring session has been disposed.',
  );

  const operationContext = () => {
    const generation = operationGeneration;
    const active = () => !disposed && generation === operationGeneration;
    return {
      active,
      runtime: guardRuntime(runtime, active),
    };
  };

  const ensureDirtyForRetry = (): XnlAuthoringSubmitResult<TDocument> | undefined => {
    if (disposed || state.status === 'disposed') {
      return failCurrent('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.');
    }
    if (state.status === 'persistence-conflicted') {
      return failCurrent(
        'XNL_AUTHORING_PERSISTENCE_CONFLICT_RETRY_FORBIDDEN',
        'Persistence-conflicted state requires explicit reload or rebase, not retry.',
      );
    }
    if (state.status !== 'dirty-failed') {
      return failCurrent(
        'XNL_AUTHORING_SESSION_NOT_RECOVERABLE',
        'Persistence retry is only available for dirty failed accepted state.',
      );
    }
    return undefined;
  };

  const persistAccepted = async (
    operationRuntime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
    active: () => boolean,
  ): Promise<XnlAuthoringSubmitResult<TDocument>> => {
    if (!active()) return disposedResult();
    if (pendingInvalidation !== undefined) {
      try {
        await publishInvalidation(operationRuntime, pendingInvalidation);
        if (!active()) return disposedResult();
        pendingInvalidation = undefined;
      } catch (error) {
        if (!active()) return disposedResult();
        publishState({
          ...dirtyState(state, [diagnosticFromError('XNL_AUTHORING_INVALIDATION_FAILED', error)]),
          activeProposalId: undefined,
        });
        return failCurrent('XNL_AUTHORING_INVALIDATION_FAILED', messageFromError(error));
      }
    }

    const expectedPersistedRevision = state.persistedRevision;
    let persistence: XnlAuthoringPersistenceResult;
    try {
      if (!active()) return disposedResult();
      persistence = await operationRuntime.persistence.persist(operationRuntime, {
        document: state.accepted.document,
        expectedPersistedRevision,
        liveRevision: state.accepted.liveRevision,
      }, {});
    } catch (error) {
      if (!active()) return disposedResult();
      persistence = {
        status: 'failed',
        expectedPersistedRevision,
        diagnostics: [diagnosticFromError('XNL_AUTHORING_PERSISTENCE_THROWN', error)],
      };
    }
    if (!active()) return disposedResult();

    const checked = coercePersistenceResult(persistence, expectedPersistedRevision);
    applyPersistenceFeedback(checked, state, publishState);
    return freezePublic({
      status: 'accepted',
      accepted: state.accepted,
      persistence: checked,
    } satisfies XnlAuthoringSubmitResult<TDocument>);
  };

  const proposalImplementation: XnlAuthoringProposalPort<TDocument, TCommand> = {
    state: () => publicState,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      let subscribed = true;
      const unsubscribe: XnlAuthoringUnsubscribe = () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
      return unsubscribe;
    },
    submit: (submittedProposal: XnlAuthoringProposal<TCommand>, config: XnlAuthoringSubmitConfig) => {
      const proposalValidation = validateXnlAuthoringProposal(submittedProposal);
      if (!proposalValidation.ok) {
        return Promise.resolve(failCurrent(
          'XNL_AUTHORING_INVALID_PROPOSAL',
          `Authoring proposal failed validation: ${issuesToMessage(proposalValidation.issues)}`,
        ));
      }
      const configValidation = validateXnlAuthoringSubmitConfig(config);
      if (!configValidation.ok) {
        return Promise.resolve(failCurrent(
          'XNL_AUTHORING_INVALID_SUBMIT_CONFIG',
          `Authoring submit config failed validation: ${issuesToMessage(configValidation.issues)}`,
        ));
      }
      if (disposed || state.status === 'disposed') {
        return Promise.resolve(failCurrent(
          'XNL_AUTHORING_SESSION_DISPOSED',
          'Authoring session has been disposed.',
        ));
      }
      const capturedProposal = freezePublic(submittedProposal);
      const capturedConfig = freezePublic(config);
      const operation = operationContext();
      return enqueue(async () => {
        if (!operation.active() || state.status === 'disposed') return disposedResult();
        if (state.status === 'dirty-failed' || state.status === 'persistence-conflicted') {
          return failCurrent(
            'XNL_AUTHORING_SESSION_DIRTY',
            'Authoring session must be retried or reloaded before accepting another edit.',
          );
        }

        publishState({ ...state, status: 'evaluating', activeProposalId: capturedProposal.id });
        const coordinator = await submitAuthoringEdit(operation.runtime, {
          accepted: state.accepted,
          proposal: capturedProposal,
        }, capturedConfig);

        if (!operation.active()) return disposedResult();

        if (coordinator.status !== 'candidate') {
          publishState({ ...state, status: 'ready', activeProposalId: undefined });
          return freezePublic(coordinator satisfies XnlAuthoringSubmitResult<TDocument>);
        }
        const candidateValidation = validateXnlAuthoringCandidate(coordinator.candidate);
        if (
          !candidateValidation.ok
          || !areXnlAuthoringLiveRevisionsEqual(
            coordinator.candidate.baseLiveRevision,
            state.accepted.liveRevision,
          )
        ) {
          publishState({ ...state, status: 'ready', activeProposalId: undefined });
          return failCurrent(
            'XNL_AUTHORING_INVALID_CANDIDATE',
            candidateValidation.ok
              ? 'Coordinator returned a candidate for a stale or foreign accepted revision.'
              : `Coordinator returned an invalid candidate: ${issuesToMessage(candidateValidation.issues)}`,
          );
        }

        let nextRevision: XnlAuthoringLiveRevision;
        try {
          nextRevision = await allocateLiveRevision(
            operation.runtime,
            sessionId,
            state.accepted.liveRevision,
            issuedLiveRevisionValues,
          );
          if (!operation.active()) return disposedResult();
        } catch (error) {
          if (!operation.active()) return disposedResult();
          publishState({ ...state, status: 'ready', activeProposalId: undefined });
          return failCurrent('XNL_AUTHORING_REVISION_FAILED', messageFromError(error));
        }

        const accepted = freezePublic({
          kind: 'xnl-authoring-accepted-snapshot',
          document: coordinator.candidate.document,
          liveRevision: nextRevision,
        } satisfies XnlAuthoringAcceptedSnapshot<TDocument>);
        pendingInvalidation = {
          liveRevision: nextRevision,
          affectedIdentities: freezePublic(coordinator.candidate.affectedIdentities),
        };
        publishState({
          status: 'accepted-persisting',
          accepted,
          persistedRevision: state.persistedRevision,
          activeProposalId: capturedProposal.id,
          diagnostics: coordinator.diagnostics,
        });

        try {
          await publishInvalidation(operation.runtime, pendingInvalidation);
          if (!operation.active()) return disposedResult();
          pendingInvalidation = undefined;
        } catch (error) {
          if (!operation.active()) return disposedResult();
          publishState({
            ...dirtyState(state, [diagnosticFromError('XNL_AUTHORING_INVALIDATION_FAILED', error)]),
            activeProposalId: undefined,
          });
          return failCurrent('XNL_AUTHORING_INVALIDATION_FAILED', messageFromError(error));
        }

        const result = await persistAccepted(operation.runtime, operation.active);
        if (!operation.active()) return disposedResult();
        return result;
      });
    },
  };
  const proposal = Object.freeze({
    state: proposalImplementation.state,
    subscribe: proposalImplementation.subscribe,
    submit: proposalImplementation.submit,
  }) satisfies XnlAuthoringProposalPort<TDocument, TCommand>;

  const controlImplementation: XnlAuthoringControlPort<TDocument> = {
    retryPersistence: (input: XnlAuthoringRetryPersistenceInput) => {
      const validation = validateXnlAuthoringRetryPersistenceInput(input);
      if (!validation.ok) {
        return Promise.resolve(failCurrent(
          'XNL_AUTHORING_INVALID_RETRY_INPUT',
          `Authoring retry input failed validation: ${issuesToMessage(validation.issues)}`,
        ));
      }
      if (disposed || state.status === 'disposed') {
        return Promise.resolve(failCurrent(
          'XNL_AUTHORING_SESSION_DISPOSED',
          'Authoring session has been disposed.',
        ));
      }
      const capturedInput = freezePublic(input);
      const operation = operationContext();
      return enqueue(async () => {
        if (!operation.active()) return disposedResult();
        const closed = ensureDirtyForRetry();
        if (closed) return closed;
        if (!areXnlAuthoringLiveRevisionsEqual(capturedInput.expectedLiveRevision, state.accepted.liveRevision)) {
          return liveConflict(capturedInput.expectedLiveRevision, state.accepted.liveRevision);
        }
        publishState({ ...state, status: 'accepted-persisting' });
        const result = await persistAccepted(operation.runtime, operation.active);
        if (!operation.active()) return disposedResult();
        return result;
      });
    },
    reloadDiscardingAccepted: (input: XnlAuthoringReloadInput) => {
      const validation = validateXnlAuthoringReloadInput(input);
      if (!validation.ok) {
        return Promise.resolve(reloadFailed(state.accepted.liveRevision, [
          diagnostic(
            'XNL_AUTHORING_INVALID_RELOAD_INPUT',
            `Authoring reload input failed validation: ${issuesToMessage(validation.issues)}`,
          ),
        ]));
      }
      if (disposed || state.status === 'disposed') {
        return Promise.resolve(reloadFailed(state.accepted.liveRevision, [
          diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
        ]));
      }
      const capturedInput = freezePublic(input);
      const operation = operationContext();
      return enqueue(async () => {
        if (!operation.active() || state.status === 'disposed') {
          return reloadFailed(state.accepted.liveRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
        }
        if (state.status !== 'dirty-failed' && state.status !== 'persistence-conflicted') {
          return reloadFailed(state.accepted.liveRevision, [
            diagnostic(
              'XNL_AUTHORING_SESSION_NOT_RELOADABLE',
              'Reload is only available for dirty or conflicted accepted state.',
            ),
          ]);
        }
        if (!areXnlAuthoringLiveRevisionsEqual(capturedInput.expectedLiveRevision, state.accepted.liveRevision)) {
          return freezePublic({
            status: 'conflict',
            expectedLiveRevision: capturedInput.expectedLiveRevision,
            actualLiveRevision: state.accepted.liveRevision,
          } satisfies XnlAuthoringReloadResult<TDocument>);
        }

        const discardedLiveRevision = state.accepted.liveRevision;
        const expectedAuthorityId = state.persistedRevision.authorityId;
        let read: XnlAuthoringPersistenceReadResult<TDocument>;
        try {
          read = await operation.runtime.persistence.read(operation.runtime, readInputFromSource(source), {});
          if (!operation.active()) return reloadFailed(discardedLiveRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
        } catch (error) {
          if (!operation.active()) return reloadFailed(discardedLiveRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
          return reloadFailed(discardedLiveRevision, [
            diagnosticFromError('XNL_AUTHORING_RELOAD_READ_THROWN', error),
          ]);
        }

        let loaded: LoadedRead<TDocument>;
        try {
          loaded = requireLoadedRead(read);
        } catch (error) {
          return reloadFailed(discardedLiveRevision, [
            diagnosticFromError('XNL_AUTHORING_RELOAD_READ_FAILED', error),
          ]);
        }
        if (loaded.persistedRevision.authorityId !== expectedAuthorityId) {
          return reloadFailed(discardedLiveRevision, [
            diagnostic(
              'XNL_AUTHORING_RELOAD_FOREIGN_AUTHORITY',
              'Reload read returned a persisted revision from a foreign persistence authority.',
            ),
          ]);
        }

        let nextRevision: XnlAuthoringLiveRevision;
        try {
          nextRevision = await allocateLiveRevision(
            operation.runtime,
            sessionId,
            discardedLiveRevision,
            issuedLiveRevisionValues,
          );
          if (!operation.active()) return reloadFailed(discardedLiveRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
        } catch (error) {
          if (!operation.active()) return reloadFailed(discardedLiveRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
          return reloadFailed(discardedLiveRevision, [
            diagnosticFromError('XNL_AUTHORING_RELOAD_REVISION_FAILED', error),
          ]);
        }

        const accepted = freezePublic({
          kind: 'xnl-authoring-accepted-snapshot',
          document: loaded.document,
          liveRevision: nextRevision,
        } satisfies XnlAuthoringAcceptedSnapshot<TDocument>);
        const invalidation = {
          liveRevision: nextRevision,
          affectedIdentities: [],
        } satisfies XnlAuthoringInvalidationInput;
        publishState({
          status: 'accepted-persisting',
          accepted,
          persistedRevision: freezePublic(loaded.persistedRevision),
        });

        try {
          await publishInvalidation(operation.runtime, invalidation);
          if (!operation.active()) return reloadFailed(nextRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
          pendingInvalidation = undefined;
        } catch (error) {
          if (!operation.active()) return reloadFailed(nextRevision, [
            diagnostic('XNL_AUTHORING_SESSION_DISPOSED', 'Authoring session has been disposed.'),
          ]);
          pendingInvalidation = invalidation;
          publishState({
            ...dirtyState(state, [diagnosticFromError('XNL_AUTHORING_RELOAD_INVALIDATION_FAILED', error)]),
            activeProposalId: undefined,
          });
          return reloadFailed(nextRevision, [
            diagnosticFromError('XNL_AUTHORING_RELOAD_INVALIDATION_FAILED', error),
          ]);
        }

        publishState({
          status: 'ready',
          accepted,
          persistedRevision: freezePublic(loaded.persistedRevision),
        });
        return freezePublic({
          status: 'reloaded',
          accepted,
          discardedLiveRevision,
          persistedRevision: loaded.persistedRevision,
        } satisfies XnlAuthoringReloadResult<TDocument>);
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      operationGeneration += 1;
      listeners.clear();
      state = {
        ...state,
        status: 'disposed',
        activeProposalId: undefined,
        actualPersistedRevision: undefined,
      };
      publicState = snapshotState(state);
    },
  };
  const control = Object.freeze({
    retryPersistence: controlImplementation.retryPersistence,
    reloadDiscardingAccepted: controlImplementation.reloadDiscardingAccepted,
    dispose: controlImplementation.dispose,
  }) satisfies XnlAuthoringControlPort<TDocument>;

  return Object.freeze({ proposal, control });
}

type LoadedRead<TDocument> = {
  readonly document: XnlAuthoringReadonlySerializable<TDocument>;
  readonly persistedRevision: XnlAuthoringPersistedRevision;
};

function captureReadSource(
  source: XnlAuthoringSerializableRecord | undefined,
): XnlAuthoringSerializableRecord | undefined {
  if (source === undefined) return undefined;
  const validation = validateXnlAuthoringSerializableValue(source);
  if (!validation.ok) {
    throw new Error(`XNL authoring source must be serializable: ${issuesToMessage(validation.issues)}`);
  }
  return freezePublic(source);
}

function readInputFromSource(
  source: XnlAuthoringSerializableRecord | undefined,
): XnlAuthoringReadInput {
  return source === undefined
    ? EMPTY_READ_INPUT
    : Object.freeze({ source });
}

function requireLoadedRead<TDocument>(
  read: XnlAuthoringPersistenceReadResult<TDocument>,
): LoadedRead<TDocument> {
  const readValidation = validateXnlAuthoringPersistenceReadResult(read);
  if (!readValidation.ok) {
    throw new Error(`Persistence read returned malformed output: ${issuesToMessage(readValidation.issues)}`);
  }
  if (read.status !== 'loaded') {
    throw new Error(read.status === 'failed'
      ? diagnosticsToMessage(read.diagnostics)
      : 'Persistence read did not return a loaded document.');
  }
  const documentValidation = validateXnlAuthoringSerializableValue(read.document);
  if (!documentValidation.ok) {
    throw new Error(`Persistence read returned a non-serializable document: ${issuesToMessage(documentValidation.issues)}`);
  }
  const revisionValidation = validateXnlAuthoringPersistenceResult({
    status: 'unchanged',
    persistedRevision: read.persistedRevision,
  });
  if (!revisionValidation.ok) {
    throw new Error(`Persistence read returned an invalid persisted revision: ${issuesToMessage(revisionValidation.issues)}`);
  }
  return {
    document: freezePublic(read.document),
    persistedRevision: freezePublic(read.persistedRevision),
  };
}

async function allocateLiveRevision<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  sessionId: string,
  current: XnlAuthoringLiveRevision | undefined,
  issuedValues: Set<string>,
): Promise<XnlAuthoringLiveRevision> {
  const next = await runtime.revision.nextLiveRevision(runtime, { current }, {});
  const validation = validateXnlAuthoringLiveRevision(next);
  if (
    !validation.ok
    || next.sessionId !== sessionId
  ) {
    throw new Error('Runtime allocated a foreign or malformed live revision.');
  }
  if (issuedValues.has(next.value)) {
    throw new Error('Runtime reused a previously issued live revision.');
  }
  issuedValues.add(next.value);
  return freezePublic(next);
}

function coercePersistenceResult(
  persistence: XnlAuthoringPersistenceResult,
  expectedPersistedRevision: XnlAuthoringPersistedRevision,
): XnlAuthoringPersistenceResult {
  const validation = validateXnlAuthoringPersistenceResult(persistence);
  if (!validation.ok) {
    return {
      status: 'failed',
      expectedPersistedRevision,
      diagnostics: [
        diagnostic(
          'XNL_AUTHORING_INVALID_PERSISTENCE_RESULT',
          `Persistence result failed validation: ${issuesToMessage(validation.issues)}`,
        ),
      ],
    };
  }

  switch (persistence.status) {
    case 'applied':
      if (!areXnlAuthoringPersistedRevisionsEqual(
        persistence.receipt.previousRevision,
        expectedPersistedRevision,
      )) {
        return incoherentPersistence(expectedPersistedRevision, 'Applied receipt previous revision did not match the expected persisted revision.');
      }
      return freezePublic(persistence);
    case 'unchanged':
      if (!areXnlAuthoringPersistedRevisionsEqual(
        persistence.persistedRevision,
        expectedPersistedRevision,
      )) {
        return incoherentPersistence(expectedPersistedRevision, 'Unchanged persistence result did not match the expected persisted revision.');
      }
      return freezePublic(persistence);
    case 'conflict':
      if (!areXnlAuthoringPersistedRevisionsEqual(persistence.expectedPersistedRevision, expectedPersistedRevision)) {
        return incoherentPersistence(expectedPersistedRevision, 'Persistence result expected revision did not match the session persisted revision.');
      }
      if (areXnlAuthoringPersistedRevisionsEqual(
        persistence.actualPersistedRevision,
        expectedPersistedRevision,
      )) {
        return incoherentPersistence(expectedPersistedRevision, 'Persistence conflict did not advance the actual persisted revision.');
      }
      return freezePublic(persistence);
    case 'failed':
      if (!areXnlAuthoringPersistedRevisionsEqual(persistence.expectedPersistedRevision, expectedPersistedRevision)) {
        return incoherentPersistence(expectedPersistedRevision, 'Persistence result expected revision did not match the session persisted revision.');
      }
      return freezePublic(persistence);
  }
}

function applyPersistenceFeedback<TDocument>(
  persistence: XnlAuthoringPersistenceResult,
  currentState: SessionMutableState<TDocument>,
  publishState: (state: SessionMutableState<TDocument>) => void,
): void {
  switch (persistence.status) {
    case 'applied':
      publishState({
        ...baseSavedState(persistence.persistedRevision),
        persistenceReceipt: freezePublic(persistence.receipt),
      });
      return;
    case 'unchanged':
      publishState(baseSavedState(persistence.persistedRevision));
      return;
    case 'conflict':
      publishState({
        ...dirtyStateSnapshot('persistence-conflicted', persistence.diagnostics),
        actualPersistedRevision: freezePublic(persistence.actualPersistedRevision),
      });
      return;
    case 'failed':
      publishState(dirtyStateSnapshot('dirty-failed', persistence.diagnostics));
      return;
  }

  function baseSavedState(persistedRevision: XnlAuthoringPersistedRevision): SessionMutableState<TDocument> {
    return {
      status: 'ready',
      accepted: currentState.accepted,
      persistedRevision: freezePublic(persistedRevision),
    };
  }

  function dirtyStateSnapshot(
    status: 'dirty-failed' | 'persistence-conflicted',
    diagnostics: readonly XnlAuthoringDiagnostic[] | undefined,
  ): SessionMutableState<TDocument> {
    return {
      status,
      accepted: currentState.accepted,
      persistedRevision: currentState.persistedRevision,
      diagnostics: diagnostics === undefined ? undefined : freezePublic(diagnostics),
    };
  }
}

function dirtyState<TDocument>(
  state: SessionMutableState<TDocument>,
  diagnostics: readonly XnlAuthoringDiagnostic[],
): SessionMutableState<TDocument> {
  return {
    status: 'dirty-failed',
    accepted: state.accepted,
    persistedRevision: state.persistedRevision,
    diagnostics: freezePublic(diagnostics),
  };
}

async function publishInvalidation<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  input: XnlAuthoringInvalidationInput,
): Promise<void> {
  await runtime.invalidation.publish(runtime, freezePublic(input), {});
}

function liveConflict<TDocument>(
  expectedLiveRevision: XnlAuthoringLiveRevision,
  actualLiveRevision: XnlAuthoringLiveRevision,
): XnlAuthoringSubmitResult<TDocument> {
  return freezePublic({
    status: 'conflict',
    reason: 'stale-live-revision',
    expectedLiveRevision,
    actualLiveRevision,
  } satisfies XnlAuthoringSubmitResult<TDocument>);
}

function reloadFailed<TDocument>(
  liveRevision: XnlAuthoringLiveRevision,
  diagnostics: readonly XnlAuthoringDiagnostic[],
): XnlAuthoringReloadResult<TDocument> {
  return freezePublic({
    status: 'failed',
    liveRevision,
    diagnostics,
  } satisfies XnlAuthoringReloadResult<TDocument>);
}

function incoherentPersistence(
  expectedPersistedRevision: XnlAuthoringPersistedRevision,
  message: string,
): XnlAuthoringPersistenceResult {
  return freezePublic({
    status: 'failed',
    expectedPersistedRevision,
    diagnostics: [diagnostic('XNL_AUTHORING_INCOHERENT_PERSISTENCE_RESULT', message)],
  } satisfies XnlAuthoringPersistenceResult);
}

function snapshotState<TDocument>(
  state: SessionMutableState<TDocument>,
): XnlAuthoringSessionState<TDocument> {
  const snapshot: XnlAuthoringSessionState<TDocument> = {
    kind: 'xnl-authoring-session-state',
    status: state.status,
    accepted: state.accepted,
    ...(state.persistedRevision === undefined ? {} : { persistedRevision: state.persistedRevision }),
    ...(state.persistenceReceipt === undefined ? {} : { persistenceReceipt: state.persistenceReceipt }),
    ...(state.activeProposalId === undefined ? {} : { activeProposalId: state.activeProposalId }),
    ...(state.actualPersistedRevision === undefined ? {} : { actualPersistedRevision: state.actualPersistedRevision }),
    ...(state.diagnostics === undefined ? {} : { diagnostics: state.diagnostics }),
  };
  return freezePublic(snapshot);
}

function diagnostic(code: string, message: string): XnlAuthoringDiagnostic {
  return freezePublic({
    severity: 'error',
    code,
    message,
  } satisfies XnlAuthoringDiagnostic);
}

function diagnosticFromError(code: string, error: unknown): XnlAuthoringDiagnostic {
  return diagnostic(code, messageFromError(error));
}

function diagnosticsToMessage(diagnostics: readonly XnlAuthoringDiagnostic[]): string {
  return diagnostics.length === 0
    ? 'Persistence read failed without diagnostics.'
    : diagnostics.map((item) => item.message).join('; ');
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function issuesToMessage(
  issues: readonly { readonly path: string; readonly code?: string; readonly message: string }[],
): string {
  return issues
    .map((issue) => `${issue.path}${issue.code === undefined ? '' : ` ${issue.code}`}: ${issue.message}`)
    .join('; ');
}

function guardRuntime<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  active: () => boolean,
): XnlAuthoringRuntime<TDocument, TCommand, TMutation> {
  return {
    domain: {
      materializeCandidate: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.domain.materializeCandidate(runtime, input, config),
      ),
      validateCandidate: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.domain.validateCandidate(runtime, input, config),
      ),
    },
    mutations: {
      diff: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.mutations.diff(runtime, input, config),
      ),
      dryRun: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.mutations.dryRun(runtime, input, config),
      ),
    },
    persistence: {
      read: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.persistence.read(runtime, input, config),
      ),
      persist: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.persistence.persist(runtime, input, config),
      ),
    },
    revision: {
      nextLiveRevision: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.revision.nextLiveRevision(runtime, input, config),
      ),
    },
    invalidation: {
      publish: async (_runtime, input, config) => guardCapability(
        active,
        () => runtime.invalidation.publish(runtime, input, config),
      ),
    },
    ...(runtime.diagnostics === undefined ? {} : { diagnostics: runtime.diagnostics }),
  };
}

async function guardCapability<T>(
  active: () => boolean,
  effect: () => T | Promise<T>,
): Promise<T> {
  if (!active()) throw new Error('XNL authoring operation was cancelled.');
  const result = await effect();
  if (!active()) throw new Error('XNL authoring operation was cancelled.');
  return result;
}
