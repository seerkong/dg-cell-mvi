import type {
  XnlAuthoringAcceptedSnapshot,
  XnlAuthoringCandidate,
  XnlAuthoringDiagnostic,
  XnlAuthoringLiveRevision,
  XnlAuthoringPersistedRevision,
  XnlAuthoringProposal,
} from './facts';
import type {
  XnlAuthoringCandidateValidationResult,
  XnlAuthoringDryRunResult,
  XnlAuthoringPersistenceReadResult,
  XnlAuthoringPersistenceResult,
} from './results';
import type {
  XnlAuthoringEmptyConfig,
  XnlAuthoringReadonlySerializable,
  XnlAuthoringSerializableRecord,
  XnlAuthoringSerializableValue,
} from './serializable';

export type XnlAuthoringProcessor<
  TRuntime = Readonly<Record<string, never>>,
  TInput = XnlAuthoringSerializableValue,
  TConfig = XnlAuthoringEmptyConfig,
  TOutput = XnlAuthoringSerializableValue,
> = (
  runtime: TRuntime,
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

export interface XnlAuthoringMaterializeInput<
  TDocument,
  TCommand,
> {
  readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
  readonly proposal: XnlAuthoringProposal<TCommand>;
}

export interface XnlAuthoringDiffInput<TDocument> {
  readonly acceptedDocument: XnlAuthoringReadonlySerializable<TDocument>;
  readonly candidateDocument: XnlAuthoringReadonlySerializable<TDocument>;
}

export interface XnlAuthoringDryRunInput<
  TDocument,
  TMutation,
> {
  readonly acceptedDocument: XnlAuthoringReadonlySerializable<TDocument>;
  readonly mutations: readonly XnlAuthoringReadonlySerializable<TMutation>[];
  readonly metadataIdMode: 'identity';
}

export interface XnlAuthoringValidateCandidateInput<
  TDocument,
  TCommand,
  TMutation,
> {
  readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
  readonly proposal: XnlAuthoringProposal<TCommand>;
  readonly candidate: XnlAuthoringCandidate<TDocument, TMutation>;
}

export interface XnlAuthoringPersistInput<TDocument> {
  readonly document: XnlAuthoringReadonlySerializable<TDocument>;
  readonly expectedPersistedRevision: XnlAuthoringPersistedRevision;
  readonly liveRevision: XnlAuthoringLiveRevision;
}

export interface XnlAuthoringReadInput {
  readonly source?: XnlAuthoringSerializableRecord;
}

export interface XnlAuthoringNextRevisionInput {
  readonly current?: XnlAuthoringLiveRevision;
}

export interface XnlAuthoringInvalidationInput {
  readonly liveRevision: XnlAuthoringLiveRevision;
  readonly affectedIdentities: readonly string[];
}

export interface XnlAuthoringDomainPort<
  TDocument,
  TCommand,
  TMutation,
  TRuntime,
> {
  readonly materializeCandidate: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringMaterializeInput<TDocument, TCommand>,
    XnlAuthoringEmptyConfig,
    XnlAuthoringReadonlySerializable<TDocument>
  >;
  readonly validateCandidate: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringValidateCandidateInput<TDocument, TCommand, TMutation>,
    XnlAuthoringEmptyConfig,
    XnlAuthoringCandidateValidationResult
  >;
}

export interface XnlAuthoringMutationPort<
  TDocument,
  TMutation,
  TRuntime,
> {
  readonly diff: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringDiffInput<TDocument>,
    XnlAuthoringEmptyConfig,
    readonly XnlAuthoringReadonlySerializable<TMutation>[]
  >;
  readonly dryRun: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringDryRunInput<TDocument, TMutation>,
    XnlAuthoringEmptyConfig,
    XnlAuthoringDryRunResult<TDocument>
  >;
}

export interface XnlAuthoringPersistencePort<
  TDocument = XnlAuthoringSerializableValue,
  TRuntime = Readonly<Record<string, never>>,
> {
  readonly read: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringReadInput,
    XnlAuthoringEmptyConfig,
    XnlAuthoringPersistenceReadResult<TDocument>
  >;
  readonly persist: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringPersistInput<TDocument>,
    XnlAuthoringEmptyConfig,
    XnlAuthoringPersistenceResult
  >;
}

export interface XnlAuthoringRevisionPort<
  TRuntime = Readonly<Record<string, never>>,
> {
  readonly nextLiveRevision: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringNextRevisionInput,
    XnlAuthoringEmptyConfig,
    XnlAuthoringLiveRevision
  >;
}

export interface XnlAuthoringInvalidationPort<
  TRuntime = Readonly<Record<string, never>>,
> {
  readonly publish: XnlAuthoringProcessor<
    TRuntime,
    XnlAuthoringInvalidationInput,
    XnlAuthoringEmptyConfig,
    void
  >;
}

export interface XnlAuthoringRuntime<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
  TMutation = XnlAuthoringSerializableValue,
> {
  readonly domain: XnlAuthoringDomainPort<
    TDocument,
    TCommand,
    TMutation,
    XnlAuthoringRuntime<TDocument, TCommand, TMutation>
  >;
  readonly mutations: XnlAuthoringMutationPort<
    TDocument,
    TMutation,
    XnlAuthoringRuntime<TDocument, TCommand, TMutation>
  >;
  readonly persistence: XnlAuthoringPersistencePort<
    TDocument,
    XnlAuthoringRuntime<TDocument, TCommand, TMutation>
  >;
  readonly revision: XnlAuthoringRevisionPort<
    XnlAuthoringRuntime<TDocument, TCommand, TMutation>
  >;
  readonly invalidation: XnlAuthoringInvalidationPort<
    XnlAuthoringRuntime<TDocument, TCommand, TMutation>
  >;
  readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
}
