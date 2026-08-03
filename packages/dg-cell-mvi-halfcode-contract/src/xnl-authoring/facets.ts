import type {
  XnlAuthoringAcceptedSnapshot,
  XnlAuthoringDiagnostic,
  XnlAuthoringLiveRevision,
  XnlAuthoringPersistenceReceipt,
  XnlAuthoringPersistedRevision,
  XnlAuthoringProposal,
  XnlAuthoringSubmitConfig,
} from './facts';
import type { XnlAuthoringSubmitResult } from './results';
import type { XnlAuthoringRuntime } from './runtime';
import type {
  XnlAuthoringReadonlySerializable,
  XnlAuthoringSerializableRecord,
  XnlAuthoringSerializableValue,
} from './serializable';

export type XnlAuthoringSessionStatus =
  | 'ready'
  | 'evaluating'
  | 'accepted-persisting'
  | 'dirty-failed'
  | 'persistence-conflicted'
  | 'disposed';

export type XnlAuthoringSessionState<
  TDocument = XnlAuthoringSerializableValue,
> = {
  readonly kind: 'xnl-authoring-session-state';
  readonly status: XnlAuthoringSessionStatus;
  readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
  readonly persistedRevision?: XnlAuthoringPersistedRevision;
  readonly persistenceReceipt?: XnlAuthoringPersistenceReceipt;
  readonly activeProposalId?: string;
  readonly actualPersistedRevision?: XnlAuthoringPersistedRevision;
  readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
};

export interface XnlAuthoringOpenInput<
  TDocument = XnlAuthoringSerializableValue,
> {
  readonly id: string;
  readonly source?: XnlAuthoringSerializableRecord;
}

export type XnlAuthoringOpenConfig = Readonly<Record<string, never>>;

export interface XnlAuthoringRetryPersistenceInput {
  readonly expectedLiveRevision: XnlAuthoringLiveRevision;
}

export interface XnlAuthoringReloadInput {
  readonly expectedLiveRevision: XnlAuthoringLiveRevision;
}

export type XnlAuthoringReloadResult<
  TDocument = XnlAuthoringSerializableValue,
> =
  | {
      readonly status: 'reloaded';
      readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
      readonly discardedLiveRevision: XnlAuthoringLiveRevision;
      readonly persistedRevision: XnlAuthoringPersistedRevision;
    }
  | {
      readonly status: 'conflict';
      readonly expectedLiveRevision: XnlAuthoringLiveRevision;
      readonly actualLiveRevision: XnlAuthoringLiveRevision;
    }
  | {
      readonly status: 'failed';
      readonly liveRevision: XnlAuthoringLiveRevision;
      readonly diagnostics: readonly XnlAuthoringDiagnostic[];
    };

export type XnlAuthoringStateListener<TDocument> = (
  state: XnlAuthoringSessionState<TDocument>,
) => void;

export type XnlAuthoringUnsubscribe = () => void;

export interface XnlAuthoringProposalPort<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
> {
  readonly state: () => XnlAuthoringSessionState<TDocument>;
  readonly subscribe: (
    listener: XnlAuthoringStateListener<TDocument>,
  ) => XnlAuthoringUnsubscribe;
  readonly submit: (
    proposal: XnlAuthoringProposal<TCommand>,
    config: XnlAuthoringSubmitConfig,
  ) => Promise<XnlAuthoringSubmitResult<TDocument>>;
}

export interface XnlAuthoringEditScopeAuthoringFacet<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
> {
  readonly mode: 'edit';
  readonly proposal: XnlAuthoringProposalPort<TDocument, TCommand>;
}

export interface XnlAuthoringViewScopeAuthoringFacet {
  readonly mode: 'view';
}

export type XnlAuthoringScopeAuthoringFacet<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
> =
  | XnlAuthoringEditScopeAuthoringFacet<TDocument, TCommand>
  | XnlAuthoringViewScopeAuthoringFacet;

export interface XnlAuthoringControlPort<
  TDocument = XnlAuthoringSerializableValue,
> {
  readonly retryPersistence: (
    input: XnlAuthoringRetryPersistenceInput,
  ) => Promise<XnlAuthoringSubmitResult<TDocument>>;
  readonly reloadDiscardingAccepted: (
    input: XnlAuthoringReloadInput,
  ) => Promise<XnlAuthoringReloadResult<TDocument>>;
  readonly dispose: () => void | Promise<void>;
}

export interface XnlAuthoringOpenedSession<
  TDocument,
  TCommand,
> {
  readonly proposal: XnlAuthoringProposalPort<TDocument, TCommand>;
  readonly control: XnlAuthoringControlPort<TDocument>;
}

export interface XnlAuthoringSessionFactoryPort<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
  TMutation = XnlAuthoringSerializableValue,
> {
  readonly open: (
    runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
    input: XnlAuthoringOpenInput<TDocument>,
    config: XnlAuthoringOpenConfig,
  ) => Promise<XnlAuthoringOpenedSession<TDocument, TCommand>>;
}
