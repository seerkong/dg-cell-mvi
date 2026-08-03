import {
  areXnlAuthoringLiveRevisionsEqual,
  validateXnlAuthoringCandidateValidationResult,
  validateXnlAuthoringDocument,
  validateXnlAuthoringDryRunResult,
  validateXnlAuthoringMutationBatch,
  type XnlAuthoringCandidate,
  type XnlAuthoringCoordinatorConfig,
  type XnlAuthoringCoordinatorInput,
  type XnlAuthoringCoordinatorResult,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringRuntime,
} from 'dg-cell-mvi-halfcode-contract';

export async function submitAuthoringEdit<TDocument, TCommand, TMutation>(
  runtime: XnlAuthoringRuntime<TDocument, TCommand, TMutation>,
  input: XnlAuthoringCoordinatorInput<TDocument, TCommand>,
  _config: XnlAuthoringCoordinatorConfig = {},
): Promise<XnlAuthoringCoordinatorResult<TDocument, TMutation>> {
  const { accepted, proposal } = input;

  if (!areXnlAuthoringLiveRevisionsEqual(proposal.baseLiveRevision, accepted.liveRevision)) {
    return {
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: proposal.baseLiveRevision,
      actualLiveRevision: accepted.liveRevision,
    };
  }

  try {
    const materialized = await runtime.domain.materializeCandidate(runtime, {
      accepted,
      proposal,
    }, {});
    requireValidCapabilityOutput(
      'materializeCandidate',
      validateXnlAuthoringDocument(materialized),
    );
    const candidateDocument = captureFact(materialized);
    const diff = await runtime.mutations.diff(runtime, {
      acceptedDocument: accepted.document,
      candidateDocument,
    }, {});
    requireValidCapabilityOutput('diff', validateXnlAuthoringMutationBatch(diff));
    const mutations = captureFact(diff);

    if (mutations.length === 0) {
      return {
        status: 'unchanged',
        accepted,
      };
    }

    const dryRunOutput = await runtime.mutations.dryRun(runtime, {
      acceptedDocument: accepted.document,
      mutations,
      metadataIdMode: 'identity',
    }, {});
    requireValidCapabilityOutput('dryRun', validateXnlAuthoringDryRunResult(dryRunOutput));
    const dryRun = captureFact(dryRunOutput);

    switch (dryRun.status) {
      case 'rejected':
        return captureFact({
          status: 'rejected',
          liveRevision: accepted.liveRevision,
          diagnostics: dryRun.diagnostics,
        });
      case 'applied':
        break;
      default:
        throw new Error('dryRun returned an unknown status.');
    }

    const candidate: XnlAuthoringCandidate<TDocument, TMutation> = captureFact({
      kind: 'xnl-authoring-candidate',
      baseLiveRevision: accepted.liveRevision,
      document: dryRun.document,
      mutations,
      affectedIdentities: deterministicIdentities(dryRun.affectedIdentities),
    });
    const validationOutput = await runtime.domain.validateCandidate(runtime, {
      accepted,
      proposal,
      candidate,
    }, {});
    requireValidCapabilityOutput(
      'validateCandidate',
      validateXnlAuthoringCandidateValidationResult(validationOutput),
    );
    const validation = captureFact(validationOutput);

    switch (validation.status) {
      case 'rejected':
        return captureFact({
          status: 'rejected',
          liveRevision: accepted.liveRevision,
          diagnostics: validation.diagnostics,
        });
      case 'valid':
        break;
      default:
        throw new Error('validateCandidate returned an unknown status.');
    }

    const result: XnlAuthoringCoordinatorResult<TDocument, TMutation> = {
      status: 'candidate',
      candidate,
    };
    return validation.diagnostics !== undefined && validation.diagnostics.length > 0
      ? captureFact({ ...result, diagnostics: validation.diagnostics })
      : captureFact(result);
  } catch (error) {
    return {
      status: 'failed',
      liveRevision: accepted.liveRevision,
      diagnostics: [diagnosticFromError(error)],
    };
  }
}

function requireValidCapabilityOutput(
  capability: string,
  validation: { readonly ok: boolean; readonly issues: readonly { readonly path: string; readonly message: string }[] },
): void {
  if (validation.ok) return;
  throw new Error(`${capability} returned malformed output: ${validation.issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ')}`);
}

function captureFact<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function deterministicIdentities(identities: readonly string[]): readonly string[] {
  return [...new Set(identities)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function diagnosticFromError(error: unknown): XnlAuthoringDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    severity: 'error',
    code: 'XNL_AUTHORING_COORDINATOR_FAILED',
    message,
  };
}
