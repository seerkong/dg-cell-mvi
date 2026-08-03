import { XNL_AUTHORING_OWNERSHIP_FIELD_NAMES } from './serializable';

export interface XnlAuthoringValidationIssue {
  readonly path: string;
  readonly code?: string;
  readonly message: string;
}

export interface XnlAuthoringValidationResult {
  readonly ok: boolean;
  readonly issues: readonly XnlAuthoringValidationIssue[];
}

const OWNERSHIP_FIELDS = new Set<string>(XNL_AUTHORING_OWNERSHIP_FIELD_NAMES);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error']);

const ACCEPTED_KEYS = new Set(['kind', 'document', 'liveRevision']);
const CANDIDATE_KEYS = new Set([
  'kind',
  'baseLiveRevision',
  'document',
  'mutations',
  'affectedIdentities',
  'diagnostics',
]);
const PROPOSAL_KEYS = new Set(['kind', 'id', 'baseLiveRevision', 'command', 'source', 'metadata']);
const PROPOSAL_SOURCE_KEYS = new Set(['occurrenceId', 'xId']);
const OPEN_INPUT_KEYS = new Set(['id', 'source']);
const OPEN_CONFIG_KEYS = new Set<string>();
const EXPECTED_LIVE_REVISION_INPUT_KEYS = new Set(['expectedLiveRevision']);
const SUBMIT_CONFIG_KEYS = new Set(['policy']);
const SUBMIT_POLICY_KEYS = new Set(['conflict', 'diagnostics']);
const EDIT_SCOPE_AUTHORING_FACET_KEYS = new Set(['mode', 'proposal']);
const VIEW_SCOPE_AUTHORING_FACET_KEYS = new Set(['mode']);
const PROPOSAL_PORT_KEYS = new Set(['state', 'subscribe', 'submit']);
const LIVE_REVISION_KEYS = new Set(['kind', 'sessionId', 'value']);
const PERSISTED_REVISION_KEYS = new Set(['kind', 'authorityId', 'value']);
const RECEIPT_KEYS = new Set([
  'kind',
  'previousRevision',
  'currentRevision',
  'persistedAt',
  'durability',
  'metadata',
]);
const DIAGNOSTIC_KEYS = new Set(['severity', 'code', 'message', 'path', 'details']);
const DRY_RUN_KEYS_BY_STATUS: Readonly<Record<string, ReadonlySet<string>>> = {
  applied: new Set(['status', 'document', 'affectedIdentities']),
  rejected: new Set(['status', 'diagnostics']),
};
const CANDIDATE_VALIDATION_KEYS_BY_STATUS: Readonly<Record<string, ReadonlySet<string>>> = {
  valid: new Set(['status', 'diagnostics']),
  rejected: new Set(['status', 'diagnostics']),
};
const PERSISTENCE_READ_KEYS_BY_STATUS: Readonly<Record<string, ReadonlySet<string>>> = {
  loaded: new Set(['status', 'document', 'persistedRevision']),
  failed: new Set(['status', 'diagnostics']),
};

const PERSISTENCE_KEYS_BY_STATUS: Readonly<Record<string, ReadonlySet<string>>> = {
  applied: new Set(['status', 'persistedRevision', 'receipt']),
  unchanged: new Set(['status', 'persistedRevision']),
  conflict: new Set([
    'status',
    'expectedPersistedRevision',
    'actualPersistedRevision',
    'diagnostics',
  ]),
  failed: new Set(['status', 'expectedPersistedRevision', 'diagnostics']),
};

const SUBMIT_KEYS_BY_STATUS: Readonly<Record<string, ReadonlySet<string>>> = {
  accepted: new Set(['status', 'accepted', 'persistence']),
  unchanged: new Set(['status', 'accepted']),
  rejected: new Set(['status', 'liveRevision', 'diagnostics']),
  conflict: new Set([
    'status',
    'reason',
    'expectedLiveRevision',
    'actualLiveRevision',
    'diagnostics',
  ]),
  failed: new Set(['status', 'liveRevision', 'diagnostics']),
};

export function validateXnlAuthoringAcceptedSnapshot(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateAcceptedSnapshot);
}

export function validateXnlAuthoringCandidate(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateCandidate);
}

export function validateXnlAuthoringProposal(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateProposal);
}

export function validateXnlAuthoringOpenInput(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateOpenInput);
}

export function validateXnlAuthoringOpenConfig(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateOpenConfig);
}

export function validateXnlAuthoringSubmitConfig(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateSubmitConfig);
}

export function validateXnlAuthoringRetryPersistenceInput(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateExpectedLiveRevisionInput);
}

export function validateXnlAuthoringReloadInput(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateExpectedLiveRevisionInput);
}

export function validateXnlAuthoringLiveRevision(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateLiveRevision);
}

export function validateXnlAuthoringDocument(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateSerializableDocument);
}

export function validateXnlAuthoringMutationBatch(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, (batch, path, issues) => {
    validateArray(batch, path, issues, () => undefined);
  });
}

export function validateXnlAuthoringDryRunResult(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateDryRunResult);
}

export function validateXnlAuthoringCandidateValidationResult(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateCandidateValidationResult);
}

export function validateXnlAuthoringPersistenceReadResult(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validatePersistenceReadResult);
}

export function validateXnlAuthoringScopeAuthoringFacet(value: unknown): XnlAuthoringValidationResult {
  const issues: XnlAuthoringValidationIssue[] = [];
  validateScopeAuthoringFacet(value, '$', issues);
  return validationResult(issues);
}

export function validateXnlAuthoringPersistenceResult(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validatePersistenceResult);
}

export function validateXnlAuthoringSubmitResult(value: unknown): XnlAuthoringValidationResult {
  return validateFact(value, validateSubmitResult);
}

export function validateXnlAuthoringSerializableValue(value: unknown): XnlAuthoringValidationResult {
  const issues: XnlAuthoringValidationIssue[] = [];
  inspectSerializableValue(value, '$', issues, new Set());
  return validationResult(issues);
}

export function areXnlAuthoringLiveRevisionsEqual(left: unknown, right: unknown): boolean {
  return validateFact(left, validateLiveRevision).ok
    && validateFact(right, validateLiveRevision).ok
    && scopedRevisionsEqual(left, right, 'sessionId');
}

export function areXnlAuthoringPersistedRevisionsEqual(left: unknown, right: unknown): boolean {
  return validateFact(left, validatePersistedRevision).ok
    && validateFact(right, validatePersistedRevision).ok
    && scopedRevisionsEqual(left, right, 'authorityId');
}

function validateFact(
  value: unknown,
  validateShape: (
    value: unknown,
    path: string,
    issues: XnlAuthoringValidationIssue[],
  ) => void,
): XnlAuthoringValidationResult {
  const issues: XnlAuthoringValidationIssue[] = [];
  inspectSerializableValue(value, '$', issues, new Set());
  validateShape(value, '$', issues);
  return validationResult(issues);
}

function validationResult(issues: XnlAuthoringValidationIssue[]): XnlAuthoringValidationResult {
  return { ok: issues.length === 0, issues };
}

function validateAcceptedSnapshot(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_ACCEPTED_SNAPSHOT', 'Accepted snapshot');
  if (!record) return;
  validateAllowedKeys(record, ACCEPTED_KEYS, path, issues, 'Accepted snapshot');
  validateLiteral(
    readOwn(record, 'kind', path, issues),
    'xnl-authoring-accepted-snapshot',
    appendPath(path, 'kind'),
    issues,
    'INVALID_ACCEPTED_SNAPSHOT_KIND',
  );
  validateSerializableDocument(readOwn(record, 'document', path, issues), appendPath(path, 'document'), issues);
  validateLiveRevision(readOwn(record, 'liveRevision', path, issues), appendPath(path, 'liveRevision'), issues);
}

function validateCandidate(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_CANDIDATE', 'Candidate');
  if (!record) return;
  validateAllowedKeys(record, CANDIDATE_KEYS, path, issues, 'Candidate');
  validateLiteral(
    readOwn(record, 'kind', path, issues),
    'xnl-authoring-candidate',
    appendPath(path, 'kind'),
    issues,
    'INVALID_CANDIDATE_KIND',
  );
  validateLiveRevision(
    readOwn(record, 'baseLiveRevision', path, issues),
    appendPath(path, 'baseLiveRevision'),
    issues,
  );
  validateSerializableDocument(readOwn(record, 'document', path, issues), appendPath(path, 'document'), issues);
  validateArray(readOwn(record, 'mutations', path, issues), appendPath(path, 'mutations'), issues, () => undefined);
  validateStringArray(
    readOwn(record, 'affectedIdentities', path, issues),
    appendPath(path, 'affectedIdentities'),
    issues,
    'affected identity',
  );
  validateOptionalDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
}

function validateProposal(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_PROPOSAL', 'Proposal');
  if (!record) return;
  validateAllowedKeys(record, PROPOSAL_KEYS, path, issues, 'Proposal');
  validateLiteral(
    readOwn(record, 'kind', path, issues),
    'xnl-authoring-proposal',
    appendPath(path, 'kind'),
    issues,
    'INVALID_PROPOSAL_KIND',
  );
  validateStableString(readOwn(record, 'id', path, issues), appendPath(path, 'id'), issues, 'proposal id');
  validateLiveRevision(
    readOwn(record, 'baseLiveRevision', path, issues),
    appendPath(path, 'baseLiveRevision'),
    issues,
  );
  validateSerializableRecord(readOwn(record, 'command', path, issues), appendPath(path, 'command'), issues, 'command');

  const source = readOwn(record, 'source', path, issues);
  if (source !== undefined) validateProposalSource(source, appendPath(path, 'source'), issues);
  const metadata = readOwn(record, 'metadata', path, issues);
  if (metadata !== undefined) validateSerializableRecord(metadata, appendPath(path, 'metadata'), issues, 'proposal metadata');
}

function validateProposalSource(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_PROPOSAL_SOURCE', 'Proposal source');
  if (!record) return;
  validateAllowedKeys(record, PROPOSAL_SOURCE_KEYS, path, issues, 'Proposal source');
  validateStableString(
    readOwn(record, 'occurrenceId', path, issues),
    appendPath(path, 'occurrenceId'),
    issues,
    'source occurrenceId',
  );
  validateOptionalStableString(readOwn(record, 'xId', path, issues), appendPath(path, 'xId'), issues, 'source xId');
}

function validateOpenInput(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_OPEN_INPUT', 'Open input');
  if (!record) return;
  validateAllowedKeys(record, OPEN_INPUT_KEYS, path, issues, 'Open input');
  validateStableString(readOwn(record, 'id', path, issues), appendPath(path, 'id'), issues, 'session id');
  const source = readOwn(record, 'source', path, issues);
  if (source !== undefined) validateSerializableRecord(source, appendPath(path, 'source'), issues, 'source');
}

function validateOpenConfig(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_OPEN_CONFIG', 'Open config');
  if (!record) return;
  validateAllowedKeys(record, OPEN_CONFIG_KEYS, path, issues, 'Open config');
}

function validateScopeAuthoringFacet(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_SCOPE_AUTHORING_FACET', 'Scope authoring facet');
  if (!record) return;
  const mode = readOwn(record, 'mode', path, issues);
  if (mode !== 'edit' && mode !== 'view') {
    issue(issues, appendPath(path, 'mode'), 'INVALID_SCOPE_AUTHORING_MODE', 'Scope authoring mode must be edit or view.');
    return;
  }
  if (mode === 'view') {
    validateAllowedKeys(record, VIEW_SCOPE_AUTHORING_FACET_KEYS, path, issues, 'View Scope authoring facet');
    return;
  }

  validateAllowedKeys(record, EDIT_SCOPE_AUTHORING_FACET_KEYS, path, issues, 'Edit Scope authoring facet');
  const proposal = readOwn(record, 'proposal', path, issues);
  validateProposalPort(proposal, appendPath(path, 'proposal'), issues);
}

function validateSubmitConfig(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_SUBMIT_CONFIG', 'Submit config');
  if (!record) return;
  validateAllowedKeys(record, SUBMIT_CONFIG_KEYS, path, issues, 'Submit config');
  const policy = readOwn(record, 'policy', path, issues);
  if (policy === undefined) return;
  const policyRecord = requirePlainRecord(policy, appendPath(path, 'policy'), issues, 'INVALID_SUBMIT_POLICY', 'Submit policy');
  if (!policyRecord) return;
  validateAllowedKeys(policyRecord, SUBMIT_POLICY_KEYS, appendPath(path, 'policy'), issues, 'Submit policy');
  validateOptionalLiteral(
    readOwn(policyRecord, 'conflict', appendPath(path, 'policy'), issues),
    ['reject'],
    appendPath(appendPath(path, 'policy'), 'conflict'),
    issues,
    'INVALID_CONFLICT_POLICY',
  );
  validateOptionalLiteral(
    readOwn(policyRecord, 'diagnostics', appendPath(path, 'policy'), issues),
    ['collect', 'fail-fast'],
    appendPath(appendPath(path, 'policy'), 'diagnostics'),
    issues,
    'INVALID_DIAGNOSTICS_POLICY',
  );
}

function validateExpectedLiveRevisionInput(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_EXPECTED_LIVE_REVISION_INPUT', 'Expected live revision input');
  if (!record) return;
  validateAllowedKeys(record, EXPECTED_LIVE_REVISION_INPUT_KEYS, path, issues, 'Expected live revision input');
  validateLiveRevision(
    readOwn(record, 'expectedLiveRevision', path, issues),
    appendPath(path, 'expectedLiveRevision'),
    issues,
  );
}

function validateDryRunResult(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_DRY_RUN_RESULT', 'Dry-run result');
  if (!record) return;
  const status = readOwn(record, 'status', path, issues);
  if (typeof status !== 'string' || !(status in DRY_RUN_KEYS_BY_STATUS)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_DRY_RUN_STATUS', 'Dry-run status must be applied or rejected.');
    validateAllowedKeys(record, new Set(['status']), path, issues, 'Dry-run result');
    return;
  }
  validateAllowedKeys(record, DRY_RUN_KEYS_BY_STATUS[status], path, issues, 'Dry-run result');
  if (status === 'applied') {
    validateSerializableDocument(readOwn(record, 'document', path, issues), appendPath(path, 'document'), issues);
    validateStringArray(
      readOwn(record, 'affectedIdentities', path, issues),
      appendPath(path, 'affectedIdentities'),
      issues,
      'affected identity',
    );
    return;
  }
  validateDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
}

function validateCandidateValidationResult(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_CANDIDATE_VALIDATION_RESULT', 'Candidate validation result');
  if (!record) return;
  const status = readOwn(record, 'status', path, issues);
  if (typeof status !== 'string' || !(status in CANDIDATE_VALIDATION_KEYS_BY_STATUS)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_CANDIDATE_VALIDATION_STATUS', 'Candidate validation status must be valid or rejected.');
    validateAllowedKeys(record, new Set(['status']), path, issues, 'Candidate validation result');
    return;
  }
  validateAllowedKeys(record, CANDIDATE_VALIDATION_KEYS_BY_STATUS[status], path, issues, 'Candidate validation result');
  const diagnostics = readOwn(record, 'diagnostics', path, issues);
  if (status === 'rejected') validateDiagnostics(diagnostics, appendPath(path, 'diagnostics'), issues);
  else validateOptionalDiagnostics(diagnostics, appendPath(path, 'diagnostics'), issues);
}

function validatePersistenceReadResult(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_PERSISTENCE_READ_RESULT', 'Persistence read result');
  if (!record) return;
  const status = readOwn(record, 'status', path, issues);
  if (typeof status !== 'string' || !(status in PERSISTENCE_READ_KEYS_BY_STATUS)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_PERSISTENCE_READ_STATUS', 'Persistence read status must be loaded or failed.');
    validateAllowedKeys(record, new Set(['status']), path, issues, 'Persistence read result');
    return;
  }
  validateAllowedKeys(record, PERSISTENCE_READ_KEYS_BY_STATUS[status], path, issues, 'Persistence read result');
  if (status === 'loaded') {
    validateSerializableDocument(readOwn(record, 'document', path, issues), appendPath(path, 'document'), issues);
    validatePersistedRevision(
      readOwn(record, 'persistedRevision', path, issues),
      appendPath(path, 'persistedRevision'),
      issues,
    );
    return;
  }
  validateDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
}

function validatePersistenceResult(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_PERSISTENCE_RESULT', 'Persistence result');
  if (!record) return;
  const status = readOwn(record, 'status', path, issues);
  if (typeof status !== 'string' || !(status in PERSISTENCE_KEYS_BY_STATUS)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_PERSISTENCE_STATUS', 'Persistence status must be applied, unchanged, conflict, or failed.');
    validateAllowedKeys(record, new Set(['status']), path, issues, 'Persistence result');
    return;
  }
  validateAllowedKeys(record, PERSISTENCE_KEYS_BY_STATUS[status], path, issues, 'Persistence result');

  if (status === 'applied' || status === 'unchanged') {
    validatePersistedRevision(
      readOwn(record, 'persistedRevision', path, issues),
      appendPath(path, 'persistedRevision'),
      issues,
    );
  }
  if (status === 'applied') {
    const persistedRevision = readOwn(record, 'persistedRevision', path, issues);
    const receipt = readOwn(record, 'receipt', path, issues);
    validateReceipt(receipt, appendPath(path, 'receipt'), issues);
    validateAppliedReceiptCoherence(persistedRevision, receipt, appendPath(path, 'receipt'), issues);
  }
  if (status === 'conflict' || status === 'failed') {
    validatePersistedRevision(
      readOwn(record, 'expectedPersistedRevision', path, issues),
      appendPath(path, 'expectedPersistedRevision'),
      issues,
    );
  }
  if (status === 'conflict') {
    const expectedPersistedRevision = readOwn(record, 'expectedPersistedRevision', path, issues);
    const actualPersistedRevision = readOwn(record, 'actualPersistedRevision', path, issues);
    validatePersistedRevision(
      actualPersistedRevision,
      appendPath(path, 'actualPersistedRevision'),
      issues,
    );
    validatePersistenceConflictScope(
      expectedPersistedRevision,
      actualPersistedRevision,
      path,
      issues,
    );
    validateOptionalDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
  }
  if (status === 'failed') {
    validateDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
  }
}

function validateSubmitResult(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_SUBMIT_RESULT', 'Submit result');
  if (!record) return;
  const status = readOwn(record, 'status', path, issues);
  if (typeof status !== 'string' || !(status in SUBMIT_KEYS_BY_STATUS)) {
    issue(issues, appendPath(path, 'status'), 'INVALID_SUBMIT_STATUS', 'Submit status must be accepted, unchanged, rejected, conflict, or failed.');
    validateAllowedKeys(record, new Set(['status']), path, issues, 'Submit result');
    return;
  }
  validateAllowedKeys(record, SUBMIT_KEYS_BY_STATUS[status], path, issues, 'Submit result');

  if (status === 'accepted' || status === 'unchanged') {
    validateAcceptedSnapshot(readOwn(record, 'accepted', path, issues), appendPath(path, 'accepted'), issues);
  }
  if (status === 'accepted') {
    validatePersistenceResult(readOwn(record, 'persistence', path, issues), appendPath(path, 'persistence'), issues);
  }
  if (status === 'rejected' || status === 'failed') {
    validateLiveRevision(readOwn(record, 'liveRevision', path, issues), appendPath(path, 'liveRevision'), issues);
    validateDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
  }
  if (status === 'conflict') {
    const expectedLiveRevision = readOwn(record, 'expectedLiveRevision', path, issues);
    const actualLiveRevision = readOwn(record, 'actualLiveRevision', path, issues);
    validateLiteral(
      readOwn(record, 'reason', path, issues),
      'stale-live-revision',
      appendPath(path, 'reason'),
      issues,
      'INVALID_CONFLICT_REASON',
    );
    validateLiveRevision(
      expectedLiveRevision,
      appendPath(path, 'expectedLiveRevision'),
      issues,
    );
    validateLiveRevision(
      actualLiveRevision,
      appendPath(path, 'actualLiveRevision'),
      issues,
    );
    validateSubmitConflictScope(expectedLiveRevision, actualLiveRevision, path, issues);
    validateOptionalDiagnostics(readOwn(record, 'diagnostics', path, issues), appendPath(path, 'diagnostics'), issues);
  }
}

function validateLiveRevision(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  validateRevision(
    value,
    path,
    issues,
    LIVE_REVISION_KEYS,
    'xnl-authoring-live-revision',
    'Live revision',
    'sessionId',
  );
}

function validatePersistedRevision(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  validateRevision(
    value,
    path,
    issues,
    PERSISTED_REVISION_KEYS,
    'xnl-authoring-persisted-revision',
    'Persisted revision',
    'authorityId',
  );
}

function validateRevision(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  allowedKeys: ReadonlySet<string>,
  kind: string,
  label: string,
  scopeKey: 'sessionId' | 'authorityId',
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_REVISION', label);
  if (!record) return;
  validateAllowedKeys(record, allowedKeys, path, issues, label);
  validateLiteral(readOwn(record, 'kind', path, issues), kind, appendPath(path, 'kind'), issues, 'INVALID_REVISION_KIND');
  validateStableString(
    readOwn(record, scopeKey, path, issues),
    appendPath(path, scopeKey),
    issues,
    `${label} ${scopeKey}`,
  );
  validateStableString(readOwn(record, 'value', path, issues), appendPath(path, 'value'), issues, `${label} value`);
}

function validateReceipt(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(value, path, issues, 'INVALID_PERSISTENCE_RECEIPT', 'Persistence receipt');
  if (!record) return;
  validateAllowedKeys(record, RECEIPT_KEYS, path, issues, 'Persistence receipt');
  validateLiteral(
    readOwn(record, 'kind', path, issues),
    'xnl-authoring-persistence-receipt',
    appendPath(path, 'kind'),
    issues,
    'INVALID_RECEIPT_KIND',
  );
  validatePersistedRevision(
    readOwn(record, 'previousRevision', path, issues),
    appendPath(path, 'previousRevision'),
    issues,
  );
  validatePersistedRevision(
    readOwn(record, 'currentRevision', path, issues),
    appendPath(path, 'currentRevision'),
    issues,
  );
  validateIsoTimestamp(
    readOwn(record, 'persistedAt', path, issues),
    appendPath(path, 'persistedAt'),
    issues,
  );
  validateLiteralSet(
    readOwn(record, 'durability', path, issues),
    ['memory', 'workspace'],
    appendPath(path, 'durability'),
    issues,
    'INVALID_PERSISTENCE_DURABILITY',
  );
  const metadata = readOwn(record, 'metadata', path, issues);
  if (metadata !== undefined) validateSerializableRecord(metadata, appendPath(path, 'metadata'), issues, 'receipt metadata');
}

function validateAppliedReceiptCoherence(
  persistedRevision: unknown,
  receipt: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  if (!isPlainRecordWithoutIssue(receipt)) return;
  const previousRevision = ownDataValue(receipt, 'previousRevision');
  const currentRevision = ownDataValue(receipt, 'currentRevision');
  const previousScope = revisionScope(previousRevision);
  const currentScope = revisionScope(currentRevision);

  if (previousScope && currentScope && previousScope.authorityId !== currentScope.authorityId) {
    issue(
      issues,
      appendPath(path, 'previousRevision'),
      'FOREIGN_PERSISTENCE_AUTHORITY',
      'Applied receipt revisions must belong to the same persistence authority.',
    );
  }
  if (previousScope && currentScope && previousScope.value === currentScope.value) {
    issue(
      issues,
      appendPath(path, 'currentRevision'),
      'UNCHANGED_APPLIED_REVISION',
      'Applied receipt current revision must differ from its previous revision.',
    );
  }
  if (!revisionsEqual(persistedRevision, currentRevision)) {
    issue(
      issues,
      appendPath(path, 'currentRevision'),
      'MISMATCHED_PERSISTENCE_RECEIPT',
      'Applied result persistedRevision must exactly equal the receipt current revision.',
    );
  }
}

function validatePersistenceConflictScope(
  expectedPersistedRevision: unknown,
  actualPersistedRevision: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const expectedScope = revisionScope(expectedPersistedRevision);
  const actualScope = revisionScope(actualPersistedRevision);
  if (expectedScope && actualScope && expectedScope.authorityId !== actualScope.authorityId) {
    issue(
      issues,
      appendPath(path, 'actualPersistedRevision'),
      'FOREIGN_PERSISTENCE_AUTHORITY',
      'Persistence conflict actual revision belongs to a foreign persistence authority.',
    );
  }
}

function validateSubmitConflictScope(
  expectedLiveRevision: unknown,
  actualLiveRevision: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const expectedScope = liveRevisionScope(expectedLiveRevision);
  const actualScope = liveRevisionScope(actualLiveRevision);
  if (expectedScope && actualScope && expectedScope.sessionId !== actualScope.sessionId) {
    issue(
      issues,
      appendPath(path, 'actualLiveRevision'),
      'FOREIGN_LIVE_SESSION',
      'Submit conflict actual revision belongs to a foreign live session.',
    );
  }
}

function revisionsEqual(left: unknown, right: unknown): boolean {
  const leftScope = revisionScope(left);
  const rightScope = revisionScope(right);
  return leftScope !== undefined
    && rightScope !== undefined
    && leftScope.authorityId === rightScope.authorityId
    && leftScope.value === rightScope.value;
}

function scopedRevisionsEqual(
  left: unknown,
  right: unknown,
  scopeKey: 'sessionId' | 'authorityId',
): boolean {
  if (!isPlainRecordWithoutIssue(left) || !isPlainRecordWithoutIssue(right)) return false;
  return ownDataValue(left, 'kind') === ownDataValue(right, 'kind')
    && ownDataValue(left, scopeKey) === ownDataValue(right, scopeKey)
    && ownDataValue(left, 'value') === ownDataValue(right, 'value');
}

function revisionScope(
  value: unknown,
): { readonly authorityId: string; readonly value: string } | undefined {
  if (!isPlainRecordWithoutIssue(value)) return undefined;
  const kind = ownDataValue(value, 'kind');
  const authorityId = ownDataValue(value, 'authorityId');
  const revisionValue = ownDataValue(value, 'value');
  return kind === 'xnl-authoring-persisted-revision'
    && typeof authorityId === 'string'
    && typeof revisionValue === 'string'
    ? { authorityId, value: revisionValue }
    : undefined;
}

function liveRevisionScope(
  value: unknown,
): { readonly sessionId: string; readonly value: string } | undefined {
  if (!isPlainRecordWithoutIssue(value)) return undefined;
  const kind = ownDataValue(value, 'kind');
  const sessionId = ownDataValue(value, 'sessionId');
  const revisionValue = ownDataValue(value, 'value');
  return kind === 'xnl-authoring-live-revision'
    && typeof sessionId === 'string'
    && typeof revisionValue === 'string'
    ? { sessionId, value: revisionValue }
    : undefined;
}

function isPlainRecordWithoutIssue(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function validateProposalPort(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  const record = requirePlainRecord(
    value,
    path,
    issues,
    'INVALID_PROPOSAL_PORT',
    'Proposal port',
  );
  if (!record) return;

  validateAllowedKeys(record, PROPOSAL_PORT_KEYS, path, issues, 'Proposal port');
  inspectNoSymbolKeys(record, path, issues);
  for (const key of PROPOSAL_PORT_KEYS) {
    const capabilityPath = appendPath(path, key);
    const descriptor = safeOwnDescriptor(record, key, capabilityPath, issues);
    if (!descriptor) {
      issue(
        issues,
        capabilityPath,
        'MISSING_PROPOSAL_CAPABILITY',
        `Proposal port must define own capability "${key}".`,
      );
    } else if (!('value' in descriptor)) {
      issue(
        issues,
        capabilityPath,
        'ACCESSOR_CAPABILITY_FIELD',
        'Proposal port capabilities must be own data properties, not accessors.',
      );
    } else if (typeof descriptor.value !== 'function') {
      issue(
        issues,
        capabilityPath,
        'INVALID_PROPOSAL_CAPABILITY',
        `Proposal port capability "${key}" must be a function.`,
      );
    }
  }
}

function ownDataValue(value: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function validateDiagnostics(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  validateArray(value, path, issues, (diagnostic, diagnosticPath) => {
    const record = requirePlainRecord(diagnostic, diagnosticPath, issues, 'INVALID_DIAGNOSTIC', 'Diagnostic');
    if (!record) return;
    validateAllowedKeys(record, DIAGNOSTIC_KEYS, diagnosticPath, issues, 'Diagnostic');
    const severity = readOwn(record, 'severity', diagnosticPath, issues);
    if (typeof severity !== 'string' || !DIAGNOSTIC_SEVERITIES.has(severity)) {
      issue(issues, appendPath(diagnosticPath, 'severity'), 'INVALID_DIAGNOSTIC_SEVERITY', 'Diagnostic severity must be info, warning, or error.');
    }
    validateStableString(readOwn(record, 'code', diagnosticPath, issues), appendPath(diagnosticPath, 'code'), issues, 'diagnostic code');
    validateNonEmptyString(readOwn(record, 'message', diagnosticPath, issues), appendPath(diagnosticPath, 'message'), issues, 'diagnostic message');
    const diagnosticPathValue = readOwn(record, 'path', diagnosticPath, issues);
    if (diagnosticPathValue !== undefined) {
      validatePath(diagnosticPathValue, appendPath(diagnosticPath, 'path'), issues);
    }
    const details = readOwn(record, 'details', diagnosticPath, issues);
    if (details !== undefined) {
      validateSerializableRecord(details, appendPath(diagnosticPath, 'details'), issues, 'diagnostic details');
    }
  });
}

function validateOptionalDiagnostics(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  if (value !== undefined) validateDiagnostics(value, path, issues);
}

function validateSerializableDocument(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  if (value === undefined) {
    issue(issues, path, 'MISSING_DOCUMENT', 'Document must be present.');
  }
}

function validateSerializableRecord(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  if (!safeIsPlainRecord(value, path, issues)) {
    issue(issues, path, 'INVALID_SERIALIZABLE_RECORD', `${label} must be a plain serializable object.`);
  }
}

function validatePath(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  validateArray(value, path, issues, (segment, segmentPath) => {
    if (typeof segment !== 'string' && typeof segment !== 'number') {
      issue(issues, segmentPath, 'INVALID_PATH_SEGMENT', 'Path segments must be strings or numbers.');
    } else if (typeof segment === 'number' && !Number.isFinite(segment)) {
      issue(issues, segmentPath, 'NON_FINITE_NUMBER', 'Path number segments must be finite.');
    }
  });
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  validateArray(value, path, issues, (item, itemPath) => {
    validateStableString(item, itemPath, issues, label);
  });
}

function validateArray(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  validateItem: (item: unknown, path: string) => void,
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'INVALID_ARRAY', 'Value must be an array.');
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = safeOwnDescriptor(value, String(index), appendPath(path, index), issues);
    if (!descriptor || !('value' in descriptor)) continue;
    validateItem(descriptor.value, appendPath(path, index));
  }
}

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  for (const key of safeOwnNames(value, path, issues)) {
    if (OWNERSHIP_FIELDS.has(key)) {
      issue(issues, appendPath(path, key), 'OWNERSHIP_FIELD', 'Runtime capability, registry, writer, or persistence authority is not authoring fact data.');
    }
    if (!allowed.has(key)) {
      issue(issues, appendPath(path, key), 'UNKNOWN_FIELD', `${label} does not allow field "${key}".`);
    }
  }
}

function requirePlainRecord(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  code: string,
  label: string,
): Record<string, unknown> | undefined {
  if (!safeIsPlainRecord(value, path, issues)) {
    issue(issues, path, code, `${label} must be a plain object.`);
    return undefined;
  }
  return value;
}

function inspectSerializableValue(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  seen: Set<object>,
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issue(issues, path, 'NON_FINITE_NUMBER', 'Serializable numbers must be finite.');
      return false;
    }
    return true;
  }
  if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issue(issues, path, 'NON_SERIALIZABLE_VALUE', `Unsupported non-serializable value type: ${typeof value}.`);
    return false;
  }
  if (Array.isArray(value)) return inspectSerializableArray(value, path, issues, seen);
  if (!safeIsPlainRecord(value, path, issues)) {
    issue(issues, path, 'NON_SERIALIZABLE_VALUE', 'Class, runtime, registry, and host instances are not serializable authoring facts.');
    return false;
  }
  if (seen.has(value)) {
    issue(issues, path, 'CYCLIC_CONTRACT_VALUE', 'Serializable authoring facts must not contain cycles.');
    return false;
  }
  seen.add(value);
  let ok = inspectNoSymbolKeys(value, path, issues);
  for (const key of safeOwnNames(value, path, issues)) {
    const childPath = appendPath(path, key);
    if (OWNERSHIP_FIELDS.has(key)) {
      issue(issues, childPath, 'OWNERSHIP_FIELD', 'Runtime capability, registry, writer, or persistence authority is not authoring fact data.');
      ok = false;
    }
    const descriptor = safeOwnDescriptor(value, key, childPath, issues);
    if (!descriptor) {
      ok = false;
    } else if (!('value' in descriptor)) {
      issue(issues, childPath, 'ACCESSOR_CONTRACT_FIELD', 'Serializable authoring facts must use data properties, not accessors.');
      ok = false;
    } else if (!inspectSerializableValue(descriptor.value, childPath, issues, seen)) {
      ok = false;
    }
  }
  seen.delete(value);
  return ok;
}

function inspectSerializableArray(
  value: readonly unknown[],
  path: string,
  issues: XnlAuthoringValidationIssue[],
  seen: Set<object>,
): boolean {
  if (!safeHasPrototype(value, Array.prototype, path, issues)) {
    issue(issues, path, 'NON_SERIALIZABLE_VALUE', 'Serializable arrays must use the built-in Array prototype.');
    return false;
  }
  if (seen.has(value)) {
    issue(issues, path, 'CYCLIC_CONTRACT_VALUE', 'Serializable authoring facts must not contain cycles.');
    return false;
  }
  seen.add(value);
  let ok = inspectNoSymbolKeys(value, path, issues);
  const ownNames = safeOwnNames(value, path, issues);
  for (const name of ownNames) {
    if (name !== 'length' && !isCanonicalArrayIndex(name, value.length)) {
      issue(issues, appendPath(path, name), 'NON_SERIALIZABLE_VALUE', 'Serializable arrays must not contain named properties.');
      ok = false;
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const childPath = appendPath(path, index);
    const descriptor = safeOwnDescriptor(value, String(index), childPath, issues);
    if (!descriptor) {
      issue(issues, childPath, 'SPARSE_CONTRACT_ARRAY', 'Serializable authoring arrays must not contain sparse entries.');
      ok = false;
    } else if (!('value' in descriptor)) {
      issue(issues, childPath, 'ACCESSOR_CONTRACT_FIELD', 'Serializable authoring arrays must use data properties, not accessors.');
      ok = false;
    } else if (!inspectSerializableValue(descriptor.value, childPath, issues, seen)) {
      ok = false;
    }
  }
  seen.delete(value);
  return ok;
}

function inspectNoSymbolKeys(
  value: object,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): boolean {
  try {
    if (Object.getOwnPropertySymbols(value).length === 0) return true;
    issue(issues, path, 'NON_SERIALIZABLE_VALUE', 'Serializable authoring facts must not contain symbol keys.');
    return false;
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Authoring fact symbol keys could not be inspected safely.');
    return false;
  }
}

function safeIsPlainRecord(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return safeHasPrototype(value, Object.prototype, path, issues)
    || safeHasPrototype(value, null, path, issues);
}

function safeHasPrototype(
  value: object,
  expected: object | null,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): boolean {
  try {
    return Object.getPrototypeOf(value) === expected;
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Authoring fact prototype could not be inspected safely.');
    return false;
  }
}

function readOwn(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): unknown {
  const descriptor = safeOwnDescriptor(value, key, appendPath(path, key), issues);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function safeOwnNames(
  value: object,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): readonly string[] {
  try {
    return Object.getOwnPropertyNames(value);
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Authoring fact property names could not be inspected safely.');
    return [];
  }
}

function safeOwnDescriptor(
  value: object,
  key: string,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    issue(issues, path, 'UNSAFE_CONTRACT_DESCRIPTOR', 'Authoring fact property descriptor could not be inspected safely.');
    return undefined;
  }
}

function validateLiteral(
  value: unknown,
  expected: string,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  code: string,
): void {
  if (value !== expected) issue(issues, path, code, `Value must be "${expected}".`);
}

function validateLiteralSet(
  value: unknown,
  expected: readonly string[],
  path: string,
  issues: XnlAuthoringValidationIssue[],
  code: string,
): void {
  if (typeof value !== 'string' || !expected.includes(value)) {
    issue(issues, path, code, `Value must be one of: ${expected.join(', ')}.`);
  }
}

function validateIsoTimestamp(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    issue(issues, path, 'INVALID_PERSISTED_AT', 'Persisted timestamp must be an ISO-8601 UTC string.');
  }
}

function validateOptionalLiteral(
  value: unknown,
  expected: readonly string[],
  path: string,
  issues: XnlAuthoringValidationIssue[],
  code: string,
): void {
  if (value !== undefined && (typeof value !== 'string' || !expected.includes(value))) {
    issue(issues, path, code, `Value must be one of: ${expected.join(', ')}.`);
  }
}

function validateStableString(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(value)) {
    issue(issues, path, 'INVALID_STABLE_ID', `${label} must be a stable non-empty string.`);
  }
}

function validateOptionalStableString(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  if (value !== undefined) validateStableString(value, path, issues, label);
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: XnlAuthoringValidationIssue[],
  label: string,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issue(issues, path, 'INVALID_STRING', `${label} must be a non-empty string.`);
  }
}

function isCanonicalArrayIndex(value: string, length: number): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return false;
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function appendPath(path: string, segment: string | number): string {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${path}.${segment}` : `${path}[${JSON.stringify(segment)}]`;
}

function issue(
  issues: XnlAuthoringValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}
