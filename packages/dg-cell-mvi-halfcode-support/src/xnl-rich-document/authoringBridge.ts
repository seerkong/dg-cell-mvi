import type {
  XnlAuthoringCandidateValidationResult,
  XnlAuthoringAcceptedSnapshot,
  XnlAuthoringDiagnostic,
  XnlAuthoringDomainPort,
  XnlAuthoringProposal,
  XnlAuthoringProposalPort,
  XnlAuthoringProposalSource,
  XnlAuthoringRuntime,
  XnlAuthoringSubmitConfig,
  XnlAuthoringSubmitResult,
  XnlProjectionCommandResult,
  XnlProjectionDomainCommand,
  XnlProjectionInteraction,
  XnlProjectionPlanNode,
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCopyOrigin,
  XnlRichDocumentDiagnostic,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentIdentityAllocationRequest,
  XnlRichDocumentIdentityAllocationResult,
  XnlRichDocumentIdentityAllocator,
  XnlRichDocumentNode,
  XnlRichDocumentProcessor,
  XnlRichDocumentSerializableRecord,
  XnlRichDocumentSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import { resolveApplicationDataCapability } from '../applicationCapabilityResolver';
import {
  XNL_AUTHORING_OWNERSHIP_FIELD_NAMES,
  XNL_AUTHORING_REVISION_AUTHORITY_FIELD_NAMES,
  validateXnlProjectionCommandResult,
  validateXnlProjectionInteraction,
} from 'dg-cell-mvi-halfcode-contract';
import {
  classifyXnlRichDocumentIdentity,
  parseXnlRichDocumentCandidate,
} from 'dg-cell-mvi-halfcode-logic';
import type { XnlNode } from 'xnl-core';
import type { XnlCoreAuthoringMutation } from '../xnl-authoring';
import {
  adaptXnlNodeToRichDocument,
  materializeXnlRichDocument,
} from './xnlAdapter';

const EMPTY_CANDIDATE_MATERIALIZATION_RUNTIME = Object.freeze({});
const EMPTY_INTERACTION_TRANSLATION_RUNTIME = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

export type XnlRichDocumentInteractionEditIntent = Readonly<{
  kind: 'interaction';
  proposal: XnlProjectionInteraction;
}>;

export type XnlRichDocumentInteractionTranslationProcessor<TRuntime> =
  XnlRichDocumentProcessor<
    TRuntime,
    Readonly<{ interaction: XnlProjectionInteraction }>,
    Readonly<Record<string, never>>,
    XnlProjectionCommandResult
  >;

export type XnlRichDocumentEditTranslatorBindingRuntime = Readonly<{
  translateInteraction: XnlRichDocumentProcessor<
    Readonly<Record<PropertyKey, never>>,
    Readonly<{
      planNode: XnlProjectionPlanNode;
      interaction: XnlProjectionInteraction;
    }>,
    Readonly<Record<PropertyKey, never>>,
    XnlProjectionCommandResult
  >;
}>;

export type XnlRichDocumentEditTranslatorBindingInput = Readonly<{
  planNode: XnlProjectionPlanNode;
}>;

export type XnlRichDocumentEditTranslatorBindingConfig =
  Readonly<Record<PropertyKey, never>>;

export function bindXnlRichDocumentEditTranslator(
  runtime: XnlRichDocumentEditTranslatorBindingRuntime,
  input: XnlRichDocumentEditTranslatorBindingInput,
  config: XnlRichDocumentEditTranslatorBindingConfig,
): XnlRichDocumentInteractionTranslationProcessor<unknown> {
  const runtimeFields = readExactPlainDataRecord(
    runtime,
    ['translateInteraction'],
    'RichDocument translator binding runtime',
  );
  const inputFields = readExactPlainDataRecord(
    input,
    ['planNode'],
    'RichDocument translator binding input',
  );
  readExactPlainDataRecord(config, [], 'RichDocument translator binding config');
  if (typeof runtimeFields.translateInteraction !== 'function') {
    throw new TypeError(
      'RichDocument translator binding runtime.translateInteraction must be an own data descriptor function.',
    );
  }
  const snappedPlanNode = snapshotSerializable(
    inputFields.planNode,
    '$binding.input.planNode',
    new WeakSet(),
    false,
  );
  if (!snappedPlanNode.ok || !isRecord(snappedPlanNode.value)) {
    const detail = snappedPlanNode.ok
      ? 'planNode must be a plain data record.'
      : snappedPlanNode.diagnostics.map((item) => item.message).join('; ');
    throw new TypeError(`RichDocument translator binding input is malformed: ${detail}`);
  }
  const translateInteraction = runtimeFields.translateInteraction as XnlRichDocumentEditTranslatorBindingRuntime['translateInteraction'];
  const planNode = snappedPlanNode.value as unknown as XnlProjectionPlanNode;
  return Object.freeze((
    _hostRuntime: unknown,
    translationInput: Readonly<{ interaction: XnlProjectionInteraction }>,
    _translationConfig: Readonly<Record<string, never>>,
  ) => translateInteraction(
    EMPTY_INTERACTION_TRANSLATION_RUNTIME,
    { planNode, interaction: translationInput.interaction },
    EMPTY_INTERACTION_TRANSLATION_RUNTIME,
  ));
}

function readExactPlainDataRecord<const TKeys extends readonly string[]>(
  value: unknown,
  expectedKeys: TKeys,
  label: string,
): Record<TKeys[number], unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${label} must be a plain record.`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must use a plain object prototype.`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      throw new TypeError(`${label} must contain exactly ${expectedKeys.join(', ') || 'no fields'}.`);
    }
    const fields = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError(`${label}.${key} must be an own enumerable data descriptor.`);
      }
      fields[key] = descriptor.value;
    }
    return fields as Record<TKeys[number], unknown>;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(label)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`${label} could not be inspected safely: ${detail}`);
  }
}

export type {
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCandidateMaterializer,
} from 'dg-cell-mvi-halfcode-contract';

export type XnlRichDocumentReplaceDocumentCommand = Readonly<{
  kind: 'xnl-rich-document-replace-document';
  document: XnlNode;
}>;

export interface XnlRichDocumentTrustedAuthoringRuntime {
  readonly proposal: XnlAuthoringProposalPort<XnlNode, XnlRichDocumentReplaceDocumentCommand>;
  readonly translateInteraction: XnlRichDocumentInteractionTranslationProcessor<XnlRichDocumentTrustedAuthoringRuntime>;
  readonly materializeInteraction: XnlRichDocumentCandidateMaterializer;
  readonly identityAllocator: XnlRichDocumentIdentityAllocator<XnlRichDocumentTrustedAuthoringRuntime>;
}

export type XnlRichDocumentTrustedAuthoringHostInput = Readonly<{
  source?: XnlAuthoringProposalSource;
}>;

export type XnlRichDocumentTrustedAuthoringHostConfig = Readonly<{
  proposalIdPrefix: string;
  submission?: XnlAuthoringSubmitConfig;
}>;

export type XnlRichDocumentBridgeRejectionStage =
  | 'interaction'
  | 'translation'
  | 'accepted-document'
  | 'materialization'
  | 'identity-allocation'
  | 'concurrent-change'
  | 'submission';

export type XnlRichDocumentBridgeResult =
  | Readonly<{
      status: 'submitted';
      result: XnlAuthoringSubmitResult<XnlNode>;
    }>
  | Readonly<{
      status: 'rejected';
      stage: XnlRichDocumentBridgeRejectionStage;
      diagnostics: readonly [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]];
    }>;

/** Adapter-facing grant. It intentionally has no session, revision, submit, or allocator surface. */
export interface XnlRichDocumentInteractionBridgePort {
  readonly emitEditIntent: (
    intent: XnlRichDocumentInteractionEditIntent,
  ) => Promise<XnlRichDocumentBridgeResult>;
}

export function createXnlRichDocumentTrustedAuthoringHost(
  runtime: XnlRichDocumentTrustedAuthoringRuntime,
  input: XnlRichDocumentTrustedAuthoringHostInput,
  config: XnlRichDocumentTrustedAuthoringHostConfig,
): XnlRichDocumentInteractionBridgePort {
  let proposalSequence = 0;
  const issuedNodeIds = new Set<XnlRichDocumentDomainNodeId>();
  const assembly = snapshotHostAssembly(runtime, input, config);

  return Object.freeze({
    emitEditIntent: async (intent: XnlRichDocumentInteractionEditIntent) => {
      if (!assembly.ok) return reject('interaction', assembly.diagnostics);
      const invocationSequence = ++proposalSequence;
      const proposalId = `${assembly.value.proposalIdPrefix}:${invocationSequence}`;
      const interaction = snapshotInteractionIntent(intent);
      if (!interaction.ok) return reject('interaction', interaction.diagnostics);

      let translated: XnlProjectionCommandResult;
      try {
        translated = await assembly.value.translateInteraction(runtime, {
          interaction: interaction.value,
        }, {});
      } catch (error) {
        return reject('translation', [diagnostic(
          'XNL_RICH_DOCUMENT_TRANSLATOR_FAILED',
          `Interaction translator failed: ${messageOf(error)}`,
        )]);
      }
      const command = snapshotTranslatedCommand(translated);
      if (!command.ok) return reject('translation', command.diagnostics);

      const acceptedBeforeMaterialization = readAcceptedSnapshot(assembly.value.state);
      if (!acceptedBeforeMaterialization.ok) {
        return reject('accepted-document', acceptedBeforeMaterialization.diagnostics);
      }
      const acceptedRich = adaptXnlNodeToRichDocument(acceptedBeforeMaterialization.value.document);
      if (acceptedRich.status === 'rejected') {
        return reject('accepted-document', acceptedRich.diagnostics.map(toAuthoringDiagnostic));
      }

      let materialized: XnlRichDocumentCandidateMaterializationResult;
      try {
        materialized = await assembly.value.materializeInteraction(
          EMPTY_CANDIDATE_MATERIALIZATION_RUNTIME,
          {
            accepted: acceptedRich.document,
            command: command.value as XnlRichDocumentEditCommand,
          },
          {},
        );
      } catch (error) {
        return reject('materialization', [diagnostic(
          'XNL_RICH_DOCUMENT_MATERIALIZER_FAILED',
          `Interaction materializer failed: ${messageOf(error)}`,
        )]);
      }
      const candidate = snapshotMaterializedCandidate(materialized);
      if (!candidate.ok) return reject('materialization', candidate.diagnostics);

      const allocation = await allocateCandidateIdentities(
        runtime,
        assembly.value.identityAllocator,
        acceptedRich.document,
        candidate.value.candidate,
        candidate.value.copyOrigins,
        proposalId,
        interaction.value,
        issuedNodeIds,
      );
      if (!allocation.ok) return reject('identity-allocation', allocation.diagnostics);

      const concrete = materializeXnlRichDocument(allocation.value);
      if (concrete.status === 'rejected') {
        return reject('materialization', concrete.diagnostics.map(toAuthoringDiagnostic));
      }

      const acceptedAtSubmission = readAcceptedSnapshot(assembly.value.state);
      if (!acceptedAtSubmission.ok) {
        return reject('accepted-document', acceptedAtSubmission.diagnostics);
      }
      if (!sameRevision(
        acceptedBeforeMaterialization.value.liveRevision,
        acceptedAtSubmission.value.liveRevision,
      )) {
        return reject('concurrent-change', [diagnostic(
          'XNL_RICH_DOCUMENT_ACCEPTED_REVISION_CHANGED',
          'Accepted live revision changed while the interaction was being materialized.',
        )]);
      }
      const proposal: XnlAuthoringProposal<XnlRichDocumentReplaceDocumentCommand> = Object.freeze({
        kind: 'xnl-authoring-proposal',
        id: proposalId,
        baseLiveRevision: acceptedAtSubmission.value.liveRevision,
        command: Object.freeze({
          kind: 'xnl-rich-document-replace-document',
          document: concrete.document,
        }),
        ...(assembly.value.source === undefined ? {} : { source: assembly.value.source }),
      });

      try {
        const result = await assembly.value.submit(proposal, assembly.value.submission);
        return Object.freeze({ status: 'submitted', result });
      } catch (error) {
        return reject('submission', [diagnostic(
          'XNL_RICH_DOCUMENT_SUBMISSION_FAILED',
          `Proposal submission failed: ${messageOf(error)}`,
        )]);
      }
    },
  });
}

type XnlRichDocumentAuthoringRuntime = XnlAuthoringRuntime<
  XnlNode,
  XnlRichDocumentReplaceDocumentCommand,
  XnlCoreAuthoringMutation
>;

export function createXnlRichDocumentAuthoringDomainPort(): XnlAuthoringDomainPort<
  XnlNode,
  XnlRichDocumentReplaceDocumentCommand,
  XnlCoreAuthoringMutation,
  XnlRichDocumentAuthoringRuntime
> {
  const port: XnlAuthoringDomainPort<
    XnlNode,
    XnlRichDocumentReplaceDocumentCommand,
    XnlCoreAuthoringMutation,
    XnlRichDocumentAuthoringRuntime
  > = {
    materializeCandidate: (_runtime, input) => structuredClone(input.proposal.command.document),
    validateCandidate: (_runtime, input): XnlAuthoringCandidateValidationResult => {
      const normalized = adaptXnlNodeToRichDocument(input.candidate.document as XnlNode);
      return normalized.status === 'normalized'
        ? Object.freeze({ status: 'valid' as const })
        : Object.freeze({
            status: 'rejected' as const,
            diagnostics: normalized.diagnostics.map(toAuthoringDiagnostic),
          });
    },
  };
  return Object.freeze(port);
}

type SnapshotResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      diagnostics: readonly [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]];
    }>;

type TrustedHostAssembly = Readonly<{
  proposalIdPrefix: string;
  source?: XnlAuthoringProposalSource;
  submission: XnlAuthoringSubmitConfig;
  state: () => unknown;
  submit: XnlAuthoringProposalPort<XnlNode, XnlRichDocumentReplaceDocumentCommand>['submit'];
  translateInteraction: XnlRichDocumentTrustedAuthoringRuntime['translateInteraction'];
  materializeInteraction: XnlRichDocumentTrustedAuthoringRuntime['materializeInteraction'];
  identityAllocator: XnlRichDocumentTrustedAuthoringRuntime['identityAllocator'];
}>;

function snapshotHostAssembly(
  runtime: unknown,
  input: unknown,
  config: unknown,
): SnapshotResult<TrustedHostAssembly> {
  const inputSnapshot = snapshotSerializable(input, '$host.input', new WeakSet(), false);
  if (!inputSnapshot.ok) return inputSnapshot;
  const configSnapshot = snapshotSerializable(config, '$host.config', new WeakSet(), false);
  if (!configSnapshot.ok) return configSnapshot;
  if (!isRecord(inputSnapshot.value)
    || !hasOnlyKeys(inputSnapshot.value, new Set(['source']))) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_HOST_INPUT', 'Host input must contain only an optional source.');
  }
  if (!isRecord(configSnapshot.value)
    || !hasOnlyKeys(configSnapshot.value, new Set(['proposalIdPrefix', 'submission']))
    || typeof configSnapshot.value.proposalIdPrefix !== 'string'
    || configSnapshot.value.proposalIdPrefix.length === 0) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_HOST_CONFIG', 'Host config requires a non-empty proposalIdPrefix.');
  }

  const source = snapshotProposalSource(inputSnapshot.value.source);
  if (!source.ok) return source;
  const submission = snapshotSubmissionConfig(configSnapshot.value.submission);
  if (!submission.ok) return submission;
  const capabilities = snapshotRuntimeCapabilities(runtime);
  if (!capabilities.ok) return capabilities;

  return {
    ok: true,
    value: Object.freeze({
      proposalIdPrefix: configSnapshot.value.proposalIdPrefix,
      ...(source.value === undefined ? {} : { source: source.value }),
      submission: submission.value,
      ...capabilities.value,
    }),
  };
}

function snapshotProposalSource(value: unknown): SnapshotResult<XnlAuthoringProposalSource | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)
    || !hasOnlyKeys(value, new Set(['occurrenceId', 'xId']))
    || typeof value.occurrenceId !== 'string'
    || value.occurrenceId.length === 0
    || (value.xId !== undefined && typeof value.xId !== 'string')) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_HOST_SOURCE', 'Host source requires occurrenceId and optional xId strings.');
  }
  return {
    ok: true,
    value: Object.freeze({
      occurrenceId: value.occurrenceId,
      ...(value.xId === undefined ? {} : { xId: value.xId }),
    }),
  };
}

function snapshotSubmissionConfig(value: unknown): SnapshotResult<XnlAuthoringSubmitConfig> {
  if (value === undefined) return { ok: true, value: Object.freeze({}) };
  if (!isRecord(value) || !hasOnlyKeys(value, new Set(['policy']))) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_SUBMISSION_CONFIG', 'Submission config may contain only policy.');
  }
  if (value.policy === undefined) return { ok: true, value: Object.freeze({}) };
  if (!isRecord(value.policy)
    || !hasOnlyKeys(value.policy, new Set(['conflict', 'diagnostics']))
    || (value.policy.conflict !== undefined && value.policy.conflict !== 'reject')
    || (value.policy.diagnostics !== undefined
      && value.policy.diagnostics !== 'collect'
      && value.policy.diagnostics !== 'fail-fast')) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_SUBMISSION_CONFIG', 'Submission policy is malformed.');
  }
  return {
    ok: true,
    value: Object.freeze({
      policy: Object.freeze({
        ...(value.policy.conflict === undefined ? {} : { conflict: value.policy.conflict }),
        ...(value.policy.diagnostics === undefined ? {} : { diagnostics: value.policy.diagnostics }),
      }),
    }),
  };
}

function snapshotRuntimeCapabilities(runtime: unknown): SnapshotResult<Pick<
  TrustedHostAssembly,
  'state' | 'submit' | 'translateInteraction' | 'materializeInteraction' | 'identityAllocator'
>> {
  if (!isInspectableRecord(runtime)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_RUNTIME', 'Trusted authoring runtime must be an inspectable object.');
  }
  const proposal = resolveDataCapability(runtime, 'proposal', 'runtime proposal');
  if (!proposal.ok) return proposal;
  if (!isInspectableRecord(proposal.value)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_RUNTIME', 'Trusted authoring runtime proposal must be an inspectable object.');
  }
  const translateInteraction = resolveMethodCapability(runtime, 'translateInteraction', 'interaction translator');
  if (!translateInteraction.ok) return translateInteraction;
  const materializeInteraction = resolveMethodCapability(runtime, 'materializeInteraction', 'interaction materializer');
  if (!materializeInteraction.ok) return materializeInteraction;
  const identityAllocator = resolveMethodCapability(runtime, 'identityAllocator', 'identity allocator');
  if (!identityAllocator.ok) return identityAllocator;
  const state = resolveMethodCapability(proposal.value, 'state', 'proposal state');
  if (!state.ok) return state;
  const submit = resolveMethodCapability(proposal.value, 'submit', 'proposal submit');
  if (!submit.ok) return submit;
  return {
    ok: true,
    value: Object.freeze({
      state: state.value as TrustedHostAssembly['state'],
      submit: submit.value as TrustedHostAssembly['submit'],
      translateInteraction: translateInteraction.value as TrustedHostAssembly['translateInteraction'],
      materializeInteraction: materializeInteraction.value as TrustedHostAssembly['materializeInteraction'],
      identityAllocator: identityAllocator.value as TrustedHostAssembly['identityAllocator'],
    }),
  };
}

const STANDARD_ARRAY_PROTOTYPE = Array.prototype;

function resolveMethodCapability(
  owner: object,
  key: string,
  label: string,
): SnapshotResult<(...args: never[]) => unknown> {
  const capability = resolveDataCapability(owner, key, label);
  if (!capability.ok) return capability;
  if (typeof capability.value !== 'function') {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_INVALID_RUNTIME',
      `Trusted authoring ${label} capability must be a data-function descriptor.`,
    );
  }
  try {
    return {
      ok: true,
      value: Function.prototype.bind.call(capability.value, owner) as (...args: never[]) => unknown,
    };
  } catch {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_INVALID_RUNTIME',
      `Trusted authoring ${label} capability could not be bound safely.`,
    );
  }
}

function resolveDataCapability(
  owner: object,
  key: string,
  label: string,
): SnapshotResult<unknown> {
  const capability = resolveApplicationDataCapability(owner, key);
  return capability.ok
    ? capability
    : snapshotRejected(
      'XNL_RICH_DOCUMENT_INVALID_RUNTIME',
      `Trusted authoring ${label} capability ${capability.reason}.`,
    );
}

function readAcceptedSnapshot(
  state: () => unknown,
): SnapshotResult<XnlAuthoringAcceptedSnapshot<XnlNode>> {
  let rawState: unknown;
  try {
    rawState = state();
  } catch (error) {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_STATE_FAILED',
      `Proposal state failed: ${messageOf(error)}`,
    );
  }
  const snapshot = snapshotSerializable(rawState, '$proposal.state', new WeakSet(), false, true);
  if (!snapshot.ok) return snapshot;
  if (!isRecord(snapshot.value)
    || snapshot.value.kind !== 'xnl-authoring-session-state'
    || !hasOnlyKeys(snapshot.value, new Set([
      'kind', 'status', 'accepted', 'persistedRevision', 'persistenceReceipt',
      'activeProposalId', 'actualPersistedRevision', 'diagnostics',
    ]))
    || !SESSION_STATUSES.has(snapshot.value.status)
    || !isRecord(snapshot.value.accepted)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_STATE', 'Proposal state must contain an accepted snapshot.');
  }
  const accepted = snapshot.value.accepted;
  if (accepted.kind !== 'xnl-authoring-accepted-snapshot'
    || !hasOnlyKeys(accepted, new Set(['kind', 'document', 'liveRevision']))
    || !hasOwn(accepted, 'document')
    || !isRecord(accepted.liveRevision)
    || !hasOnlyKeys(accepted.liveRevision, new Set(['kind', 'sessionId', 'value']))
    || accepted.liveRevision.kind !== 'xnl-authoring-live-revision'
    || typeof accepted.liveRevision.sessionId !== 'string'
    || accepted.liveRevision.sessionId.length === 0
    || typeof accepted.liveRevision.value !== 'string'
    || accepted.liveRevision.value.length === 0) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_STATE', 'Accepted snapshot or live revision is malformed.');
  }
  return {
    ok: true,
    value: Object.freeze({
      kind: 'xnl-authoring-accepted-snapshot',
      document: accepted.document as XnlNode,
      liveRevision: Object.freeze({
        kind: 'xnl-authoring-live-revision',
        sessionId: accepted.liveRevision.sessionId,
        value: accepted.liveRevision.value,
      }),
    }),
  };
}

const SESSION_STATUSES = new Set<unknown>([
  'ready', 'evaluating', 'accepted-persisting', 'dirty-failed',
  'persistence-conflicted', 'disposed',
]);

function snapshotInteractionIntent(
  intent: unknown,
): SnapshotResult<XnlProjectionInteraction> {
  const snapshot = snapshotSerializable(intent, '$', new WeakSet(), true, false, true);
  if (!snapshot.ok) return snapshot;
  if (!isRecord(snapshot.value)
    || !hasOnlyKeys(snapshot.value, INTERACTION_INTENT_KEYS)
    || snapshot.value.kind !== 'interaction') {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_EDIT_INTENT', 'Edit intent must have kind="interaction".');
  }
  if (!isRecord(snapshot.value.proposal)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_INTERACTION', 'Interaction proposal must be a plain record.');
  }
  const proposal = snapshot.value.proposal;
  const validation = validateXnlProjectionInteraction(proposal);
  if (!validation.ok) {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_INVALID_INTERACTION',
      `Interaction validation failed: ${validation.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  if (typeof proposal.type !== 'string' || proposal.type.length === 0 || !isRecord(proposal.target)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_INTERACTION', 'Interaction must contain type and target data.');
  }
  if (typeof proposal.target.planNodeId !== 'string' || proposal.target.planNodeId.length === 0) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_INTERACTION', 'Interaction target requires planNodeId.');
  }
  return { ok: true, value: proposal as unknown as XnlProjectionInteraction };
}

const INTERACTION_INTENT_KEYS = new Set(['kind', 'proposal']);

function snapshotTranslatedCommand(
  translated: unknown,
): SnapshotResult<XnlProjectionDomainCommand> {
  const snapshot = snapshotSerializable(translated, '$translation', new WeakSet());
  if (!snapshot.ok) return snapshot;
  const validation = validateXnlProjectionCommandResult(snapshot.value);
  if (!validation.ok) {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_INVALID_TRANSLATED_COMMAND',
      `Translated command validation failed: ${validation.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  if (!isRecord(snapshot.value) || snapshot.value.status !== 'translated' || !isRecord(snapshot.value.command)) {
    const message = isRecord(snapshot.value) && Array.isArray(snapshot.value.diagnostics)
      ? 'Interaction translation was rejected or unsupported.'
      : 'Interaction translator returned a malformed result.';
    return snapshotRejected('XNL_RICH_DOCUMENT_TRANSLATION_REJECTED', message);
  }
  const command = snapshot.value.command;
  if (typeof command.type !== 'string' || command.type.length === 0 || !isRecord(command.target)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_TRANSLATED_COMMAND', 'Translated command is malformed.');
  }
  return { ok: true, value: command as unknown as XnlProjectionDomainCommand };
}

function snapshotMaterializedCandidate(
  value: unknown,
): SnapshotResult<Readonly<{
  candidate: XnlRichDocument;
  copyOrigins?: readonly XnlRichDocumentCopyOrigin[];
}>> {
  const snapshot = snapshotSerializable(value, '$materialization', new WeakSet(), false);
  if (!snapshot.ok) return snapshot;
  if (!isRecord(snapshot.value)
    || !hasOnlyKeys(snapshot.value, MATERIALIZED_RESULT_KEYS)
    || !hasOwn(snapshot.value, 'status')
    || !hasOwn(snapshot.value, 'candidate')
    || snapshot.value.status !== 'materialized') {
    return snapshotRejected('XNL_RICH_DOCUMENT_MATERIALIZATION_REJECTED', 'Interaction materialization was rejected or malformed.');
  }
  const normalized = parseXnlRichDocumentCandidate({}, {
    candidate: snapshot.value.candidate as XnlRichDocumentSerializableValue,
  }, {});
  if (normalized.status === 'rejected') {
    return {
      ok: false,
      diagnostics: normalized.diagnostics.map(toAuthoringDiagnostic) as [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]],
    };
  }
  const copyOrigins = parseCopyOrigins(snapshot.value.copyOrigins);
  if (!copyOrigins.ok) return copyOrigins;
  return {
    ok: true,
    value: Object.freeze({
      candidate: normalized.document,
      ...(copyOrigins.value === undefined ? {} : { copyOrigins: copyOrigins.value }),
    }),
  };
}

const MATERIALIZED_RESULT_KEYS = new Set(['status', 'candidate', 'copyOrigins']);

function parseCopyOrigins(value: unknown): SnapshotResult<readonly XnlRichDocumentCopyOrigin[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_COPY_ORIGINS', 'copyOrigins must be an array.');
  }
  const origins: XnlRichDocumentCopyOrigin[] = [];
  for (const origin of value) {
    if (!isRecord(origin)
      || !hasOnlyKeys(origin, COPY_ORIGIN_KEYS)
      || !hasOwn(origin, 'candidateNodeId')
      || !hasOwn(origin, 'sourceNodeId')
      || typeof origin.candidateNodeId !== 'string'
      || origin.candidateNodeId.length === 0
      || typeof origin.sourceNodeId !== 'string'
      || origin.sourceNodeId.length === 0) {
      return snapshotRejected('XNL_RICH_DOCUMENT_INVALID_COPY_ORIGINS', 'Every copy origin requires candidateNodeId and sourceNodeId.');
    }
    origins.push(Object.freeze({
      candidateNodeId: origin.candidateNodeId as XnlRichDocumentDomainNodeId,
      sourceNodeId: origin.sourceNodeId as XnlRichDocumentDomainNodeId,
    }));
  }
  return { ok: true, value: Object.freeze(origins) };
}

const COPY_ORIGIN_KEYS = new Set(['candidateNodeId', 'sourceNodeId']);

async function allocateCandidateIdentities(
  runtime: XnlRichDocumentTrustedAuthoringRuntime,
  identityAllocator: XnlRichDocumentTrustedAuthoringRuntime['identityAllocator'],
  accepted: XnlRichDocument,
  candidate: XnlRichDocument,
  copyOrigins: readonly XnlRichDocumentCopyOrigin[] | undefined,
  proposalId: string,
  interaction: XnlProjectionInteraction,
  issuedNodeIds: Set<XnlRichDocumentDomainNodeId>,
): Promise<SnapshotResult<XnlRichDocument>> {
  const classification = classifyXnlRichDocumentIdentity({}, {
    accepted,
    candidate,
    ...(copyOrigins === undefined ? {} : { copyOrigins }),
  }, {});
  if (classification.status === 'rejected') {
    return {
      ok: false,
      diagnostics: classification.diagnostics.map(toAuthoringDiagnostic) as [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]],
    };
  }

  const reserved = new Set([
    ...collectNodeIds(classification.accepted),
    ...collectNodeIds(classification.candidate),
    ...issuedNodeIds,
  ]);
  const replacements = new Map<string, XnlRichDocumentDomainNodeId>();
  const allocatable = classification.changes.flatMap((change) => {
    if (change.classification === 'new' || change.classification === 'copy') {
      return [{
        nodeId: change.nodeId,
        reason: change.classification,
        ...(change.classification === 'copy' ? { sourceNodeId: change.sourceNodeId } : {}),
      } as const];
    }
    if (change.classification === 'replacement') {
      return [{ nodeId: change.addedNodeId, reason: 'new' as const }];
    }
    return [];
  });

  for (let index = 0; index < allocatable.length; index += 1) {
    const change = allocatable[index]!;
    const node = findNode(classification.candidate, change.nodeId);
    if (node === undefined) {
      return snapshotRejected('XNL_RICH_DOCUMENT_ALLOCATION_TARGET_MISSING', `Identity allocation target "${change.nodeId}" is missing.`);
    }
    const requestBase = {
      kind: 'xnl-rich-document-identity-allocation-request',
      requestId: `${proposalId}:identity:${index + 1}`,
      nodeKind: node.kind,
      reservedNodeIds: Object.freeze([...reserved].sort(compareStrings)) as readonly XnlRichDocumentDomainNodeId[],
      provenance: Object.freeze({
        interactionType: interaction.type,
        temporaryNodeId: change.nodeId,
      }) as XnlRichDocumentSerializableRecord,
    } as const;
    const request: XnlRichDocumentIdentityAllocationRequest = change.reason === 'copy'
      ? Object.freeze({ ...requestBase, reason: 'copy', sourceNodeId: change.sourceNodeId! })
      : Object.freeze({ ...requestBase, reason: 'new' });

    let rawResult: XnlRichDocumentIdentityAllocationResult;
    try {
      rawResult = await identityAllocator(runtime, request, { collisionPolicy: 'reject' });
    } catch (error) {
      return snapshotRejected(
        'XNL_RICH_DOCUMENT_IDENTITY_ALLOCATOR_FAILED',
        `Identity allocator failed: ${messageOf(error)}`,
      );
    }
    const result = snapshotAllocationResult(rawResult, request.requestId);
    if (!result.ok) return result;
    if (reserved.has(result.value) || issuedNodeIds.has(result.value)) {
      return snapshotRejected(
        'XNL_RICH_DOCUMENT_IDENTITY_COLLISION',
        `Identity allocator reused reserved #id "${result.value}".`,
      );
    }
    reserved.add(result.value);
    issuedNodeIds.add(result.value);
    replacements.set(change.nodeId, result.value);
  }

  const replaced = replaceNodeIds(classification.candidate, replacements);
  const normalized = parseXnlRichDocumentCandidate({}, { candidate: replaced }, {});
  if (normalized.status === 'rejected') {
    return {
      ok: false,
      diagnostics: normalized.diagnostics.map(toAuthoringDiagnostic) as [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]],
    };
  }
  return { ok: true, value: normalized.document };
}

function snapshotAllocationResult(
  value: unknown,
  expectedRequestId: string,
): SnapshotResult<XnlRichDocumentDomainNodeId> {
  const snapshot = snapshotSerializable(value, '$allocation', new WeakSet());
  if (!snapshot.ok) return snapshot;
  if (!isRecord(snapshot.value)
    || !hasOnlyKeys(snapshot.value, new Set(['status', 'requestId', 'nodeId', 'freshness', 'diagnostics']))
    || snapshot.value.status !== 'allocated'
    || snapshot.value.freshness !== 'fresh'
    || snapshot.value.requestId !== expectedRequestId
    || typeof snapshot.value.nodeId !== 'string'
    || !isValidXnlIdentity(snapshot.value.nodeId)) {
    return snapshotRejected(
      'XNL_RICH_DOCUMENT_IDENTITY_UNVERIFIED',
      'Identity allocator result must be an exact fresh allocation for the current request.',
    );
  }
  return { ok: true, value: snapshot.value.nodeId as XnlRichDocumentDomainNodeId };
}

function collectNodeIds(document: XnlRichDocument): XnlRichDocumentDomainNodeId[] {
  const ids: XnlRichDocumentDomainNodeId[] = [];
  visitPersistent(document, (node) => ids.push(node.nodeId));
  return ids;
}

function findNode(document: XnlRichDocument, nodeId: string): Exclude<XnlRichDocumentNode, { kind: 'text' }> | undefined {
  let found: Exclude<XnlRichDocumentNode, { kind: 'text' }> | undefined;
  visitPersistent(document, (node) => {
    if (node.nodeId === nodeId) found = node;
  });
  return found;
}

function visitPersistent(
  node: XnlRichDocumentNode,
  visitor: (node: Exclude<XnlRichDocumentNode, { kind: 'text' }>) => void,
): void {
  if (node.kind === 'text') return;
  visitor(node);
  if ('children' in node) node.children.forEach((child) => visitPersistent(child, visitor));
  if (node.kind === 'paragraph' || node.kind === 'heading') {
    node.content.forEach((child) => visitPersistent(child, visitor));
  }
}

function replaceNodeIds(
  document: XnlRichDocument,
  replacements: ReadonlyMap<string, XnlRichDocumentDomainNodeId>,
): XnlRichDocument {
  const replace = (node: XnlRichDocumentNode): XnlRichDocumentNode => {
    if (node.kind === 'text') return node;
    const nodeId = replacements.get(node.nodeId) ?? node.nodeId;
    if ('children' in node) {
      return { ...node, nodeId, children: node.children.map(replace) } as XnlRichDocumentNode;
    }
    if (node.kind === 'paragraph' || node.kind === 'heading') {
      return { ...node, nodeId, content: node.content.map(replace) } as XnlRichDocumentNode;
    }
    return { ...node, nodeId } as XnlRichDocumentNode;
  };
  return replace(document) as XnlRichDocument;
}

function snapshotSerializable(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  rejectAuthority = true,
  omitUndefinedProperties = false,
  rejectRevisionAuthority = false,
): SnapshotResult<unknown> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return { ok: true, value };
  if (typeof value !== 'object') {
    return snapshotRejected('XNL_RICH_DOCUMENT_NON_SERIALIZABLE_VALUE', `${path} is not serializable data.`);
  }
  if (ancestors.has(value)) {
    return snapshotRejected('XNL_RICH_DOCUMENT_CYCLIC_VALUE', `${path} contains a cycle.`);
  }
  let isArray: boolean;
  let prototype: object | null;
  let symbols: symbol[];
  try {
    isArray = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path} could not be inspected safely.`);
  }
  if (symbols.length > 0) {
    return snapshotRejected('XNL_RICH_DOCUMENT_SYMBOL_KEY', `${path} contains symbol keys.`);
  }
  ancestors.add(value);
  if (isArray) {
    if (prototype !== STANDARD_ARRAY_PROTOTYPE) {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_RUNTIME_INSTANCE', `${path} must use the standard Array prototype.`);
    }
    let ownNames: string[];
    try {
      ownNames = Object.getOwnPropertyNames(value);
    } catch {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path} array shape could not be inspected safely.`);
    }
    const lengthDescriptor = safeDescriptor(value, 'length');
    if (lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > 0xffff_ffff
      || lengthDescriptor.enumerable
      || lengthDescriptor.configurable) {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path}.length must be the standard Array data descriptor.`);
    }
    const length = lengthDescriptor.value as number;
    if (ownNames.length !== length + 1 || !ownNames.includes('length')) {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path} must be a dense Array with no extra own keys.`);
    }
    const indexedDescriptors = new Array<PropertyDescriptor>(length);
    for (const key of ownNames) {
      if (key === 'length') continue;
      const index = parseArrayIndex(key, length);
      const descriptor = index === undefined ? undefined : safeDescriptor(value, key);
      if (index === undefined
        || descriptor === undefined
        || !('value' in descriptor)
        || !descriptor.enumerable) {
        ancestors.delete(value);
        return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path} must contain only dense data indexes.`);
      }
      indexedDescriptors[index] = descriptor;
    }
    const result = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = indexedDescriptors[index];
      if (descriptor === undefined) {
        ancestors.delete(value);
        return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path}[${index}] is missing.`);
      }
      const child = snapshotSerializable(
        descriptor.value,
        `${path}[${index}]`,
        ancestors,
        rejectAuthority,
        omitUndefinedProperties,
        rejectRevisionAuthority,
      );
      if (!child.ok) {
        ancestors.delete(value);
        return child;
      }
      result[index] = child.value;
    }
    ancestors.delete(value);
    return { ok: true, value: Object.freeze(result) };
  }
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    return snapshotRejected('XNL_RICH_DOCUMENT_RUNTIME_INSTANCE', `${path} must be a plain record.`);
  }
  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(value);
  } catch {
    ancestors.delete(value);
    return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path} property names could not be inspected.`);
  }
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (rejectAuthority && BRIDGE_AUTHORITY_KEYS.has(key)) {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_AUTHORITY_FIELD', `${path}.${key} is host authority, not interaction data.`);
    }
    if (rejectRevisionAuthority && REVISION_AUTHORITY_KEYS.has(key)) {
      ancestors.delete(value);
      return snapshotRejected(
        'XNL_RICH_DOCUMENT_REVISION_AUTHORITY_FIELD',
        `${path}.${key} is revision authority, not interaction data.`,
      );
    }
    const descriptor = safeDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      ancestors.delete(value);
      return snapshotRejected('XNL_RICH_DOCUMENT_UNSAFE_VALUE', `${path}.${key} is accessor-backed.`);
    }
    if (descriptor.value === undefined && omitUndefinedProperties) continue;
    const child = snapshotSerializable(
      descriptor.value,
      `${path}.${key}`,
      ancestors,
      rejectAuthority,
      omitUndefinedProperties,
      rejectRevisionAuthority,
    );
    if (!child.ok) {
      ancestors.delete(value);
      return child;
    }
    Object.defineProperty(record, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: child.value,
    });
  }
  ancestors.delete(value);
  return { ok: true, value: Object.freeze(record) };
}

function parseArrayIndex(key: string, length: number): number | undefined {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key
    ? index
    : undefined;
}

const BRIDGE_AUTHORITY_KEYS = new Set<string>([
  ...XNL_AUTHORING_OWNERSHIP_FIELD_NAMES,
  'identityAllocator', 'mutationWriter', 'session', 'submit', 'submitCallback', 'translator',
]);

const REVISION_AUTHORITY_KEYS = new Set<string>(XNL_AUTHORING_REVISION_AUTHORITY_FIELD_NAMES);

function safeDescriptor(value: object, key: PropertyKey): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
}

function isInspectableRecord(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  try {
    return !Array.isArray(value) && Object.getOwnPropertySymbols(value).length === 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValidXnlIdentity(value: string): boolean {
  return value.split('.').every((segment) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(segment));
}

function sameRevision(
  left: Readonly<{ kind: string; sessionId: string; value: string }>,
  right: Readonly<{ kind: string; sessionId: string; value: string }>,
): boolean {
  return left.kind === right.kind && left.sessionId === right.sessionId && left.value === right.value;
}

function snapshotRejected<T = never>(code: string, message: string): SnapshotResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, message)] };
}

function reject(
  stage: XnlRichDocumentBridgeRejectionStage,
  diagnostics: readonly XnlAuthoringDiagnostic[],
): XnlRichDocumentBridgeResult {
  const nonEmpty = diagnostics.length > 0 ? diagnostics : [diagnostic(
    'XNL_RICH_DOCUMENT_BRIDGE_REJECTED',
    'RichDocument bridge rejected the interaction.',
  )];
  return Object.freeze({
    status: 'rejected',
    stage,
    diagnostics: Object.freeze(nonEmpty) as readonly [XnlAuthoringDiagnostic, ...XnlAuthoringDiagnostic[]],
  });
}

function diagnostic(code: string, message: string): XnlAuthoringDiagnostic {
  return Object.freeze({ severity: 'error', code, message });
}

function toAuthoringDiagnostic(value: XnlRichDocumentDiagnostic): XnlAuthoringDiagnostic {
  return Object.freeze({
    severity: value.severity,
    code: value.code,
    message: value.message,
    ...(value.path === undefined ? {} : { path: value.path }),
  });
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
