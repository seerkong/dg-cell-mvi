import {
  formatDocumentInstanceRef,
  type DocumentDisplayMode,
  type DocumentDisplayModeCommand,
  type DocumentDisplayModeDiagnostic,
  type DocumentDisplayModeLease,
  type DocumentDisplayModeOccurrenceState,
  type DocumentDisplayModePolicy,
  type DocumentDisplayModePolicyConfig,
  type DocumentDisplayModePolicyDecision,
  type DocumentDisplayModePolicyRuntime,
  type DocumentDisplayModeProjection,
  type DocumentDisplayModeRegistrationResult,
  type DocumentDisplayModeState,
  type DocumentDisplayModeTarget,
  type DocumentDisplayModeTransitionKind,
  type DocumentDisplayModeTransitionResult,
  type DocumentInstanceRef,
} from 'dg-cell-mvi-halfcode-contract';

const MODES: readonly DocumentDisplayMode[] = Object.freeze(['view', 'edit']);

function diagnostic(code: DocumentDisplayModeDiagnostic['code'], message: string): DocumentDisplayModeDiagnostic {
  return Object.freeze({ code, message });
}

function validMode(value: unknown): value is DocumentDisplayMode {
  return value === 'view' || value === 'edit';
}

function exactRef(ref: DocumentInstanceRef): DocumentInstanceRef | undefined {
  try {
    const value = Object.freeze({
      unitInstanceId: ref.unitInstanceId,
      projectionRole: ref.projectionRole,
      xId: ref.xId,
    });
    formatDocumentInstanceRef(value);
    return value;
  } catch {
    return undefined;
  }
}

function exactTarget(
  state: DocumentDisplayModeState,
  target: DocumentDisplayModeTarget,
): { target: DocumentDisplayModeTarget; occurrence?: DocumentDisplayModeOccurrenceState; valid: boolean; diagnostic?: DocumentDisplayModeDiagnostic } {
  if (target?.kind === 'document') {
    const valid = target.unitInstanceId === state.unitInstanceId;
    return {
      target: Object.freeze({ kind: 'document', unitInstanceId: state.unitInstanceId }),
      valid,
      ...(valid ? {} : { diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'Document target is outside this mode session.') }),
    };
  }
  if (target?.kind === 'occurrence') {
    const ref = exactRef(target.ref);
    if (ref !== undefined && ref.unitInstanceId === state.unitInstanceId) {
      const key = formatDocumentInstanceRef(ref);
      const occurrence = state.occurrences.find((entry) => formatDocumentInstanceRef(entry.ref) === key);
      if (occurrence !== undefined) {
        return { target: Object.freeze({ kind: 'occurrence', ref }), occurrence, valid: true };
      }
      return { target: Object.freeze({ kind: 'occurrence', ref }), valid: false, diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_UNKNOWN_TARGET', 'Occurrence target is not registered.') };
    }
  }
  return {
    target: Object.freeze({ kind: 'document', unitInstanceId: state.unitInstanceId }),
    valid: false,
    diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'Display mode target is malformed.'),
  };
}

function freezeState(state: DocumentDisplayModeState): DocumentDisplayModeState {
  return Object.freeze({
    unitInstanceId: state.unitInstanceId,
    baseMode: state.baseMode,
    revision: state.revision,
    occurrences: Object.freeze(state.occurrences.map((entry) => Object.freeze({
      ref: exactRef(entry.ref)!,
      lease: entry.lease,
      ...(entry.overlay === undefined ? {} : { overlay: entry.overlay }),
    }))),
  });
}

export function createDocumentDisplayModeState(unitInstanceId: string, baseMode: DocumentDisplayMode): DocumentDisplayModeState {
  if (!unitInstanceId || !validMode(baseMode)) throw new TypeError('A non-empty unitInstanceId and canonical Document mode are required.');
  return freezeState({ unitInstanceId, baseMode, revision: 0, occurrences: [] });
}

function locateOccurrence(state: DocumentDisplayModeState, ref: DocumentInstanceRef) {
  const canonical = exactRef(ref);
  if (canonical === undefined) return { index: -1 };
  const key = formatDocumentInstanceRef(canonical);
  const index = state.occurrences.findIndex((entry) => formatDocumentInstanceRef(entry.ref) === key);
  return { key, canonical, index, value: index >= 0 ? state.occurrences[index] : undefined };
}

export function registerDocumentDisplayModeOccurrence(
  state: DocumentDisplayModeState,
  ref: DocumentInstanceRef,
  lease: DocumentDisplayModeLease,
): DocumentDisplayModeRegistrationResult {
  const located = locateOccurrence(state, ref);
  if (!located.key || !located.canonical || located.canonical.unitInstanceId !== state.unitInstanceId || typeof lease !== 'string' || lease.length === 0) {
    return { ok: false, state, diagnostics: [diagnostic('DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'Occurrence identity and lease must be canonical.')] };
  }
  if (located.value) return { ok: false, state, diagnostics: [diagnostic('DOCUMENT_DISPLAY_MODE_DUPLICATE_OCCURRENCE', `Occurrence ${located.key} is already registered.`)] };
  return {
    ok: true,
    lease,
    state: freezeState({ ...state, revision: state.revision + 1, occurrences: [...state.occurrences, { ref: located.canonical, lease }] }),
    diagnostics: [],
  };
}

export function unregisterDocumentDisplayModeOccurrence(
  state: DocumentDisplayModeState,
  ref: DocumentInstanceRef,
  lease: DocumentDisplayModeLease,
): DocumentDisplayModeTransitionResult {
  const located = locateOccurrence(state, ref);
  if (!located.key) return rejected(state, 'DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'Occurrence identity is invalid.');
  if (!located.value) return rejected(state, 'DOCUMENT_DISPLAY_MODE_UNKNOWN_TARGET', `Occurrence ${located.key} is not registered.`);
  if (located.value.lease !== lease) return rejected(state, 'DOCUMENT_DISPLAY_MODE_STALE_LEASE', `Occurrence ${located.key} lease is stale.`);
  return { ok: true, changed: true, state: freezeState({ ...state, revision: state.revision + 1, occurrences: state.occurrences.filter((_, index) => index !== located.index) }), diagnostics: [] };
}

function rejected(state: DocumentDisplayModeState, code: DocumentDisplayModeDiagnostic['code'], message: string): DocumentDisplayModeTransitionResult {
  return { ok: false, changed: false, state, diagnostics: [diagnostic(code, message)] };
}

async function policyDecision<TRuntime extends DocumentDisplayModePolicyRuntime, TConfig extends DocumentDisplayModePolicyConfig>(
  policy: DocumentDisplayModePolicy<TRuntime, TConfig> | undefined,
  runtime: TRuntime,
  config: TConfig,
  transition: DocumentDisplayModeTransitionKind,
  target: DocumentDisplayModeTarget,
  inheritedMode: DocumentDisplayMode,
  currentMode: DocumentDisplayMode,
  requestedMode: DocumentDisplayMode,
): Promise<{ decision?: DocumentDisplayModePolicyDecision; diagnostic?: DocumentDisplayModeDiagnostic }> {
  if (!policy) return { diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_POLICY_MISSING', 'Display mode policy is not bound.') };
  try {
    const input = Object.freeze({ transition, target, inheritedMode, currentMode, requestedMode });
    const value = await policy(runtime, input, config);
    if (!value || typeof value.allowed !== 'boolean' || !Array.isArray(value.allowedModes) || value.allowedModes.some((mode) => !validMode(mode)) || new Set(value.allowedModes).size !== value.allowedModes.length || (value.allowed && !value.allowedModes.includes(requestedMode))) {
      return { diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_POLICY_INCONSISTENT', 'Display mode policy returned an inconsistent decision.') };
    }
    return { decision: Object.freeze({ allowed: value.allowed, allowedModes: Object.freeze([...value.allowedModes]), ...(typeof value.reason === 'string' ? { reason: value.reason } : {}) }) };
  } catch {
    return { diagnostic: diagnostic('DOCUMENT_DISPLAY_MODE_POLICY_FAILED', 'Display mode policy failed.') };
  }
}

function projection(
  target: DocumentDisplayModeTarget,
  valid: boolean,
  inheritedMode: DocumentDisplayMode,
  overlay: 'inherit' | DocumentDisplayMode,
  requestedMode: DocumentDisplayMode,
  decision?: DocumentDisplayModePolicyDecision,
  failure?: DocumentDisplayModeDiagnostic,
): DocumentDisplayModeProjection {
  const allowed = valid && decision?.allowed === true;
  const allowedModes = allowed ? Object.freeze([...decision.allowedModes]) : Object.freeze([]);
  return Object.freeze({
    valid,
    target,
    inheritedMode,
    overlay,
    effectiveMode: allowed ? requestedMode : 'view',
    allowedModes,
    canSwitch: allowedModes.length > 1,
    diagnostics: failure === undefined ? Object.freeze([]) : Object.freeze([failure]),
    ...(failure?.message ?? decision?.reason ? { reason: failure?.message ?? decision?.reason } : {}),
  });
}

export async function projectDocumentDisplayMode<TRuntime extends DocumentDisplayModePolicyRuntime, TConfig extends DocumentDisplayModePolicyConfig>(
  state: DocumentDisplayModeState,
  target: DocumentDisplayModeTarget,
  runtime: TRuntime,
  config: TConfig,
  policy?: DocumentDisplayModePolicy<TRuntime, TConfig>,
): Promise<DocumentDisplayModeProjection> {
  const exact = exactTarget(state, target);
  const inheritedMode = state.baseMode;
  const overlay = exact.occurrence?.overlay ?? 'inherit';
  const requestedMode = overlay === 'inherit' ? inheritedMode : overlay;
  if (!exact.valid) return projection(exact.target, false, inheritedMode, overlay, requestedMode, undefined, exact.diagnostic);
  const checked = await policyDecision(policy, runtime, config, 'observe', exact.target, inheritedMode, requestedMode, requestedMode);
  return projection(exact.target, true, inheritedMode, overlay, requestedMode, checked.decision, checked.diagnostic);
}

export async function reduceDocumentDisplayMode<TRuntime extends DocumentDisplayModePolicyRuntime, TConfig extends DocumentDisplayModePolicyConfig>(
  state: DocumentDisplayModeState,
  command: DocumentDisplayModeCommand,
  runtime: TRuntime,
  config: TConfig,
  policy?: DocumentDisplayModePolicy<TRuntime, TConfig>,
): Promise<DocumentDisplayModeTransitionResult> {
  if (typeof command.correlationId !== 'string' || command.correlationId.length === 0) {
    return rejected(state, 'DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'A non-empty command correlationId is required.');
  }
  const correlate = (result: DocumentDisplayModeTransitionResult): DocumentDisplayModeTransitionResult => Object.freeze({
    ...result,
    correlationId: command.correlationId,
  });
  if (command.type === 'set-base') {
    if (!validMode(command.mode)) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_INVALID_MODE', 'Requested base mode is invalid.'));
    const target = Object.freeze({ kind: 'document' as const, unitInstanceId: state.unitInstanceId });
    const checked = await policyDecision(policy, runtime, config, 'set-base', target, state.baseMode, state.baseMode, command.mode);
    if (!checked.decision) return correlate(rejected(state, checked.diagnostic!.code, checked.diagnostic!.message));
    if (!checked.decision.allowed) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_TRANSITION_DENIED', checked.decision.reason ?? 'Base mode transition denied.'));
    const next = state.baseMode === command.mode ? state : freezeState({ ...state, baseMode: command.mode, revision: state.revision + 1 });
    return correlate({ ok: true, changed: next !== state, state: next, projection: projection(target, true, command.mode, 'inherit', command.mode, checked.decision), diagnostics: [] });
  }
  const located = locateOccurrence(state, command.ref);
  if (!located.key || !located.canonical) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_INVALID_TARGET', 'Occurrence identity is invalid.'));
  if (!located.value) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_UNKNOWN_TARGET', `Occurrence ${located.key} is not registered.`));
  if (located.value.lease !== command.lease) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_STALE_LEASE', `Occurrence ${located.key} lease is stale.`));
  const target = Object.freeze({ kind: 'occurrence' as const, ref: located.canonical });
  const requestedMode = command.type === 'clear-overlay' ? state.baseMode : command.mode;
  if (!validMode(requestedMode)) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_INVALID_MODE', 'Requested overlay mode is invalid.'));
  const currentMode = located.value.overlay ?? state.baseMode;
  const checked = await policyDecision(policy, runtime, config, command.type, target, state.baseMode, currentMode, requestedMode);
  if (!checked.decision) return correlate(rejected(state, checked.diagnostic!.code, checked.diagnostic!.message));
  if (!checked.decision.allowed) return correlate(rejected(state, 'DOCUMENT_DISPLAY_MODE_TRANSITION_DENIED', checked.decision.reason ?? 'Occurrence mode transition denied.'));
  const overlay = command.type === 'clear-overlay' ? undefined : command.mode;
  const changed = located.value.overlay !== overlay;
  const next = changed ? freezeState({
    ...state,
    revision: state.revision + 1,
    occurrences: state.occurrences.map((entry, index) => index === located.index
      ? { ref: entry.ref, lease: entry.lease, ...(overlay ? { overlay } : {}) }
      : entry),
  }) : state;
  return correlate({ ok: true, changed, state: next, projection: projection(target, true, state.baseMode, overlay ?? 'inherit', requestedMode, checked.decision), diagnostics: [] });
}

export const allowDocumentDisplayModePolicy: DocumentDisplayModePolicy = () => ({
  allowed: true,
  allowedModes: MODES,
});
