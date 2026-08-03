import type {
  XnlAuthoringAcceptedSnapshot,
  XnlAuthoringDiagnostic,
  XnlAuthoringLiveRevision,
  XnlAuthoringPersistenceReceipt,
  XnlAuthoringPersistedRevision,
} from './facts';
import type {
  XnlAuthoringReadonlySerializable,
  XnlAuthoringSerializableValue,
} from './serializable';

export type XnlAuthoringPersistenceResult<TAuthorityId extends string = string> =
  | {
      readonly status: 'applied';
      readonly persistedRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
      readonly receipt: XnlAuthoringPersistenceReceipt<TAuthorityId>;
    }
  | {
      readonly status: 'unchanged';
      readonly persistedRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
    }
  | {
      readonly status: 'conflict';
      readonly expectedPersistedRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
      readonly actualPersistedRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
      readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
    }
  | {
      readonly status: 'failed';
      readonly expectedPersistedRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };

export type XnlAuthoringSubmitResult<
  TDocument = XnlAuthoringSerializableValue,
> =
  | {
      readonly status: 'accepted';
      readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
      readonly persistence: XnlAuthoringPersistenceResult;
    }
  | {
      readonly status: 'unchanged';
      readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
    }
  | {
      readonly status: 'rejected';
      readonly liveRevision: XnlAuthoringLiveRevision;
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    }
  | {
      readonly status: 'conflict';
      readonly reason: 'stale-live-revision';
      readonly expectedLiveRevision: XnlAuthoringLiveRevision;
      readonly actualLiveRevision: XnlAuthoringLiveRevision;
      readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
    }
  | {
      readonly status: 'failed';
      readonly liveRevision: XnlAuthoringLiveRevision;
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };

export type XnlAuthoringDryRunResult<
  TDocument = XnlAuthoringSerializableValue,
> =
  | {
      readonly status: 'applied';
      readonly document: XnlAuthoringReadonlySerializable<TDocument>;
      readonly affectedIdentities: readonly string[];
    }
  | {
      readonly status: 'rejected';
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };

export type XnlAuthoringCandidateValidationResult =
  | {
      readonly status: 'valid';
      readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
    }
  | {
      readonly status: 'rejected';
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };

export type XnlAuthoringPersistenceReadResult<
  TDocument = XnlAuthoringSerializableValue,
> =
  | {
      readonly status: 'loaded';
      readonly document: XnlAuthoringReadonlySerializable<TDocument>;
      readonly persistedRevision: XnlAuthoringPersistedRevision;
    }
  | {
      readonly status: 'failed';
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };
