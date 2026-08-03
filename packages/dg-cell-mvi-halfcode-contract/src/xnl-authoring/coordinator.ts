import type {
  XnlAuthoringAcceptedSnapshot,
  XnlAuthoringCandidate,
  XnlAuthoringDiagnostic,
  XnlAuthoringLiveRevision,
  XnlAuthoringProposal,
  XnlAuthoringSubmitConfig,
} from './facts';
import type { XnlAuthoringSerializableValue } from './serializable';

export type XnlAuthoringCoordinatorInput<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
> = {
  readonly accepted: XnlAuthoringAcceptedSnapshot<TDocument>;
  readonly proposal: XnlAuthoringProposal<TCommand>;
};

export type XnlAuthoringCoordinatorResult<
  TDocument = XnlAuthoringSerializableValue,
  TMutation = XnlAuthoringSerializableValue,
> =
  | {
      readonly status: 'candidate';
      readonly candidate: XnlAuthoringCandidate<TDocument, TMutation>;
      readonly diagnostics?: readonly XnlAuthoringDiagnostic[];
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

export type XnlAuthoringCoordinatorConfig = XnlAuthoringSubmitConfig;
