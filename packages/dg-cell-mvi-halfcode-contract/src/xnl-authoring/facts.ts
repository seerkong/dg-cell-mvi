import type {
  XnlAuthoringMetadata,
  XnlAuthoringReadonlySerializable,
  XnlAuthoringSerializableValue,
} from './serializable';

export const XNL_AUTHORING_IDENTITY_RULES = {
  metadataIdRole: 'tree-alignment-and-move-identity',
  ordinaryPayloadUpdate: false,
  replacement: 'delete-and-add',
} as const;

export type XnlAuthoringLiveRevision<TSessionId extends string = string> = {
  readonly kind: 'xnl-authoring-live-revision';
  readonly sessionId: TSessionId;
  readonly value: string;
};

export type XnlAuthoringPersistedRevision<TAuthorityId extends string = string> = {
  readonly kind: 'xnl-authoring-persisted-revision';
  readonly authorityId: TAuthorityId;
  readonly value: string;
};

export type XnlAuthoringPersistenceDurability = 'memory' | 'workspace';

export type XnlAuthoringPersistenceReceipt<TAuthorityId extends string = string> = {
  readonly kind: 'xnl-authoring-persistence-receipt';
  readonly previousRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
  readonly currentRevision: XnlAuthoringPersistedRevision<TAuthorityId>;
  readonly persistedAt: string;
  readonly durability: XnlAuthoringPersistenceDurability;
  readonly metadata?: XnlAuthoringMetadata;
};

export type XnlAuthoringDiagnosticSeverity = 'info' | 'warning' | 'error';

export type XnlAuthoringDiagnostic = {
  readonly severity: XnlAuthoringDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly details?: XnlAuthoringMetadata;
};

export type XnlAuthoringAcceptedSnapshot<
  TDocument = XnlAuthoringSerializableValue,
> = {
  readonly kind: 'xnl-authoring-accepted-snapshot';
  readonly document: XnlAuthoringReadonlySerializable<TDocument>;
  readonly liveRevision: XnlAuthoringLiveRevision;
};

export type XnlAuthoringProposalSource = {
  readonly occurrenceId: string;
  readonly xId?: string;
};

export type XnlAuthoringProposal<
  TCommand = XnlAuthoringSerializableValue,
> = {
  readonly kind: 'xnl-authoring-proposal';
  readonly id: string;
  readonly baseLiveRevision: XnlAuthoringLiveRevision;
  readonly command: XnlAuthoringReadonlySerializable<TCommand>;
  readonly source?: XnlAuthoringProposalSource;
  readonly metadata?: XnlAuthoringMetadata;
};

export type XnlAuthoringCandidate<
  TDocument = XnlAuthoringSerializableValue,
  TMutation = XnlAuthoringSerializableValue,
> = {
  readonly kind: 'xnl-authoring-candidate';
  readonly baseLiveRevision: XnlAuthoringLiveRevision;
  readonly document: XnlAuthoringReadonlySerializable<TDocument>;
  readonly mutations: readonly XnlAuthoringReadonlySerializable<TMutation>[];
  readonly affectedIdentities: readonly string[];
  readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
};

export type XnlAuthoringSubmitPolicy = {
  readonly conflict?: 'reject';
  readonly diagnostics?: 'collect' | 'fail-fast';
};

export type XnlAuthoringSubmitConfig = {
  readonly policy?: XnlAuthoringSubmitPolicy;
};
