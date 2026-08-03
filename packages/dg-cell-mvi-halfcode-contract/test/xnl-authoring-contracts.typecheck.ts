import {
  type XnlAuthoringAcceptedSnapshot,
  type XnlAuthoringCandidate,
  type XnlAuthoringControlPort,
  type XnlAuthoringCoordinatorConfig,
  type XnlAuthoringCoordinatorInput,
  type XnlAuthoringCoordinatorResult,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringEditScopeAuthoringFacet,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringOpenConfig,
  type XnlAuthoringOpenInput,
  type XnlAuthoringPersistencePort,
  type XnlAuthoringPersistenceReceipt,
  type XnlAuthoringPersistenceResult,
  type XnlAuthoringPersistedRevision,
  type XnlAuthoringProcessor,
  type XnlAuthoringProposal,
  type XnlAuthoringProposalPort,
  type XnlAuthoringRevisionPort,
  type XnlAuthoringRuntime,
  type XnlAuthoringScopeAuthoringFacet,
  type XnlAuthoringSerializableValue,
  type XnlAuthoringSessionFactoryPort,
  type XnlAuthoringSessionState,
  type XnlAuthoringSubmitConfig,
  type XnlAuthoringSubmitResult,
  type XnlAuthoringViewScopeAuthoringFacet,
} from 'dg-cell-mvi-halfcode-contract';
import type { DataElementNode } from 'xnl-core';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
    (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsUnknown<T> = IsAny<T> extends true
  ? false
  : unknown extends T
    ? [keyof T] extends [never]
      ? true
      : false
    : false;
type Property<T, Key extends PropertyKey> = Key extends keyof T ? T[Key] : never;
type FunctionParameters<T> = T extends (...args: infer Parameters) => unknown ? Parameters : never;
type ContainsUnsafe<
  T,
  TDepth extends readonly unknown[] = readonly [1, 1, 1, 1, 1, 1, 1, 1],
> = TDepth extends readonly [unknown, ...infer TRest]
  ? IsAny<T> extends true
  ? true
  : IsUnknown<T> extends true
    ? true
    : T extends readonly (infer TItem)[]
      ? ContainsUnsafe<TItem, TRest>
      : T extends object
        ? true extends { [TKey in keyof T]-?: ContainsUnsafe<T[TKey], TRest> }[keyof T]
          ? true
          : false
        : false
  : false;

interface RecursiveBranch {
  readonly kind: 'branch';
  readonly label?: string;
  readonly children?: readonly RecursiveDocumentNode[];
}

type RecursiveDocumentNode = string | RecursiveBranch;

interface DocumentFact {
  readonly tag: 'Document';
  readonly attributes: { readonly '#id': string };
  readonly children: readonly ({
    readonly tag: 'Title';
    readonly attributes: { readonly '#id': string };
    readonly text: string;
    readonly annotation?: RecursiveDocumentNode;
  })[];
}

interface DomainCommand {
  readonly type: 'document.rename-title';
  readonly target: {
    readonly nodeId: string;
    readonly path: readonly (string | number)[];
  };
  readonly payload: { readonly title: string };
}

interface Mutation {
  readonly kind: 'set-text';
  readonly targetId: string;
  readonly value: string;
  readonly note?: string;
}

const liveRevision = {
  kind: 'xnl-authoring-live-revision',
  sessionId: 'session:architecture',
  value: 'live:7',
} as const satisfies XnlAuthoringLiveRevision<'session:architecture'>;
const persistedRevision = {
  kind: 'xnl-authoring-persisted-revision',
  authorityId: 'authority:memory-vfs',
  value: 'vfs:11',
} as const satisfies XnlAuthoringPersistedRevision<'authority:memory-vfs'>;
const receipt = {
  kind: 'xnl-authoring-persistence-receipt',
  previousRevision: { ...persistedRevision, value: 'vfs:10' },
  currentRevision: persistedRevision,
  persistedAt: '2026-07-31T18:56:49Z',
  durability: 'memory',
  metadata: { authority: 'memory-vfs' },
} as const satisfies XnlAuthoringPersistenceReceipt<'authority:memory-vfs'>;

const acceptedSnapshot = {
  kind: 'xnl-authoring-accepted-snapshot',
  document: {
    tag: 'Document',
    attributes: { '#id': 'architecture-document' },
    children: [{
      tag: 'Title',
      attributes: { '#id': 'document-title' },
      text: 'Checkout architecture',
    }],
  },
  liveRevision,
} as const satisfies XnlAuthoringAcceptedSnapshot<DocumentFact>;

const proposal = {
  kind: 'xnl-authoring-proposal',
  id: 'proposal:rename-title',
  baseLiveRevision: liveRevision,
  command: {
    type: 'document.rename-title',
    target: { nodeId: 'document-title', path: ['children', 0] },
    payload: { title: 'Checkout platform architecture' },
  },
  source: { occurrenceId: 'document-occurrence:1', xId: 'title-editor' },
} as const satisfies XnlAuthoringProposal<DomainCommand>;

const candidate = {
  kind: 'xnl-authoring-candidate',
  baseLiveRevision: liveRevision,
  document: {
    ...acceptedSnapshot.document,
    children: [{
      tag: 'Title',
      attributes: { '#id': 'document-title' },
      text: 'Checkout platform architecture',
    }],
  },
  mutations: [{ kind: 'set-text', targetId: 'document-title', value: 'Checkout platform architecture' }],
  affectedIdentities: ['document-title'],
} as const satisfies XnlAuthoringCandidate<DocumentFact, Mutation>;

const coordinatorInput = {
  accepted: acceptedSnapshot,
  proposal,
} as const satisfies XnlAuthoringCoordinatorInput<DocumentFact, DomainCommand>;

const submitConfig = {
  policy: { conflict: 'reject', diagnostics: 'collect' },
} as const satisfies XnlAuthoringSubmitConfig;
const coordinatorConfig: XnlAuthoringCoordinatorConfig = submitConfig;
const openInput = {
  id: 'session:architecture',
  source: { uri: 'vfs://@/documents/architecture.xnl' },
} as const satisfies XnlAuthoringOpenInput<DocumentFact>;
const openConfig = {} as const satisfies XnlAuthoringOpenConfig;

const appliedPersistence = {
  status: 'applied',
  persistedRevision,
  receipt,
} as const satisfies XnlAuthoringPersistenceResult;
const unchangedPersistence = {
  status: 'unchanged',
  persistedRevision,
} as const satisfies XnlAuthoringPersistenceResult;
const conflictedPersistence = {
  status: 'conflict',
  expectedPersistedRevision: persistedRevision,
  actualPersistedRevision: { ...persistedRevision, value: 'vfs:12' },
} as const satisfies XnlAuthoringPersistenceResult;
const failedPersistence = {
  status: 'failed',
  expectedPersistedRevision: persistedRevision,
  diagnostics: [{ severity: 'error', code: 'WRITE_FAILED', message: 'Write failed.' }],
} as const satisfies XnlAuthoringPersistenceResult;

const acceptedResult = {
  status: 'accepted',
  accepted: acceptedSnapshot,
  persistence: appliedPersistence,
} as const satisfies XnlAuthoringSubmitResult<DocumentFact>;
const unchangedResult = {
  status: 'unchanged',
  accepted: acceptedSnapshot,
} as const satisfies XnlAuthoringSubmitResult<DocumentFact>;
const rejectedResult = {
  status: 'rejected',
  liveRevision,
  diagnostics: [{ severity: 'error', code: 'INVALID_CANDIDATE', message: 'Candidate rejected.' }],
} as const satisfies XnlAuthoringSubmitResult<DocumentFact>;
const conflictResult = {
  status: 'conflict',
  reason: 'stale-live-revision',
  expectedLiveRevision: { ...liveRevision, value: 'live:6' },
  actualLiveRevision: liveRevision,
} as const satisfies XnlAuthoringSubmitResult<DocumentFact>;
const failedResult = {
  status: 'failed',
  liveRevision,
  diagnostics: [{ severity: 'error', code: 'AUTHORING_FAILED', message: 'Authoring failed.' }],
} as const satisfies XnlAuthoringSubmitResult<DocumentFact>;
const candidateCoordinatorResult = {
  status: 'candidate',
  candidate,
} as const satisfies XnlAuthoringCoordinatorResult<DocumentFact, Mutation>;
const unchangedCoordinatorResult = {
  status: 'unchanged',
  accepted: acceptedSnapshot,
} as const satisfies XnlAuthoringCoordinatorResult<DocumentFact, Mutation>;
const rejectedCoordinatorResult = {
  status: 'rejected',
  liveRevision,
  diagnostics: [{ severity: 'error', code: 'INVALID_CANDIDATE', message: 'Candidate rejected.' }],
} as const satisfies XnlAuthoringCoordinatorResult<DocumentFact, Mutation>;
const conflictCoordinatorResult = {
  status: 'conflict',
  reason: 'stale-live-revision',
  expectedLiveRevision: { ...liveRevision, value: 'live:6' },
  actualLiveRevision: liveRevision,
} as const satisfies XnlAuthoringCoordinatorResult<DocumentFact, Mutation>;
const failedCoordinatorResult = {
  status: 'failed',
  liveRevision,
  diagnostics: [{ severity: 'error', code: 'AUTHORING_FAILED', message: 'Authoring failed.' }],
} as const satisfies XnlAuthoringCoordinatorResult<DocumentFact, Mutation>;

declare const canonicalXnlDocument: DataElementNode;
const canonicalAcceptedSnapshot = {
  kind: 'xnl-authoring-accepted-snapshot',
  document: canonicalXnlDocument,
  liveRevision,
} satisfies XnlAuthoringAcceptedSnapshot<DataElementNode>;
type CanonicalRuntime = XnlAuthoringRuntime<DataElementNode, DomainCommand, Mutation>;
type CanonicalXnlNodeIsNotAny = ExpectFalse<IsAny<DataElementNode>>;
type CanonicalDocumentIsNotAny = ExpectFalse<IsAny<typeof canonicalAcceptedSnapshot.document>>;

const recursiveCandidate = {
  kind: 'xnl-authoring-candidate',
  baseLiveRevision: liveRevision,
  document: {
    tag: 'Document',
    attributes: { '#id': 'recursive-document' },
    children: [{
      tag: 'Title',
      attributes: { '#id': 'recursive-title' },
      text: 'Recursive title',
      annotation: { kind: 'branch', children: ['leaf'] },
    }],
  },
  mutations: [{ kind: 'set-text', targetId: 'recursive-title', value: 'Other' }],
  affectedIdentities: ['recursive-title'],
} as const satisfies XnlAuthoringCandidate<DocumentFact, Mutation>;

type SubmitProcessor = XnlAuthoringProcessor<
  XnlAuthoringRuntime<DocumentFact, DomainCommand, Mutation>,
  XnlAuthoringProposal<DomainCommand>,
  XnlAuthoringSubmitConfig,
  XnlAuthoringSubmitResult<DocumentFact>
>;
declare const submitAuthoringEdit: SubmitProcessor;
declare const runtime: XnlAuthoringRuntime<DocumentFact, DomainCommand, Mutation>;
const submitOutput = submitAuthoringEdit(runtime, proposal, submitConfig);
type CoordinatorProcessor = XnlAuthoringProcessor<
  XnlAuthoringRuntime<DocumentFact, DomainCommand, Mutation>,
  XnlAuthoringCoordinatorInput<DocumentFact, DomainCommand>,
  XnlAuthoringCoordinatorConfig,
  XnlAuthoringCoordinatorResult<DocumentFact, Mutation>
>;
declare const submitAuthoringEditCandidate: CoordinatorProcessor;
const coordinatorOutput = submitAuthoringEditCandidate(runtime, coordinatorInput, submitConfig);
declare const proposalPort: XnlAuthoringProposalPort<DocumentFact, DomainCommand>;
declare const controlPort: XnlAuthoringControlPort<DocumentFact>;
const editScopeFacet = {
  mode: 'edit',
  proposal: proposalPort,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, DomainCommand>;
const viewScopeFacet = {
  mode: 'view',
} satisfies XnlAuthoringViewScopeAuthoringFacet;
const scopeFacet: XnlAuthoringScopeAuthoringFacet<DocumentFact, DomainCommand> =
  Math.random() > 0.5 ? editScopeFacet : viewScopeFacet;
if (scopeFacet.mode === 'edit') {
  scopeFacet.proposal.submit(proposal, submitConfig);
}
const stateFromScope: XnlAuthoringSessionState<DocumentFact> = proposalPort.state();
const readableAccepted: XnlAuthoringAcceptedSnapshot<DocumentFact> = stateFromScope.accepted;
const readableTitle: string = stateFromScope.accepted.document.children[0].text;

type SubmitParameters = FunctionParameters<Property<XnlAuthoringProposalPort<DocumentFact, DomainCommand>, 'submit'>>;
type SubscribeParameters = FunctionParameters<Property<XnlAuthoringProposalPort<DocumentFact, DomainCommand>, 'subscribe'>>;
type ScopeFacetUnionModeOnly = Expect<Equal<keyof XnlAuthoringScopeAuthoringFacet<DocumentFact, DomainCommand>, 'mode'>>;

const inputWithFunction = {
  ...proposal,
  // @ts-expect-error function objects are runtime capabilities, never proposal input.
  callback: () => undefined,
} satisfies XnlAuthoringProposal<DomainCommand>;
const inputWithWriter = {
  ...proposal,
  // @ts-expect-error writers are stable runtime authority, never proposal input.
  writer: { apply: () => undefined },
} satisfies XnlAuthoringProposal<DomainCommand>;
const inputWithRegistry = {
  ...proposal,
  // @ts-expect-error registries are stable runtime dependencies, never proposal input.
  registry: new Map<string, DomainCommand>(),
} satisfies XnlAuthoringProposal<DomainCommand>;
const inputWithPersistenceClient = {
  ...proposal,
  // @ts-expect-error persistence clients belong to XnlAuthoringRuntime.
  persistenceClient: { persist: () => Promise.resolve() },
} satisfies XnlAuthoringProposal<DomainCommand>;
const configWithFunction = {
  ...submitConfig,
  // @ts-expect-error config is serializable per-call policy, not callback wiring.
  callback: () => undefined,
} satisfies XnlAuthoringSubmitConfig;
const configWithWriter = {
  ...submitConfig,
  // @ts-expect-error config cannot own the accepted-fact writer.
  writer: {},
} satisfies XnlAuthoringSubmitConfig;
const configWithRegistry = {
  ...submitConfig,
  // @ts-expect-error config cannot carry an implementation registry.
  registry: new Map(),
} satisfies XnlAuthoringSubmitConfig;
const configWithPersistenceClient = {
  ...submitConfig,
  // @ts-expect-error config cannot carry persistence authority.
  persistenceClient: {},
} satisfies XnlAuthoringSubmitConfig;
const inputWithRuntime = {
  ...proposal,
  // @ts-expect-error runtime authority belongs to the first processor argument.
  runtime,
} satisfies XnlAuthoringProposal<DomainCommand>;
const configWithRuntime = {
  ...submitConfig,
  // @ts-expect-error runtime authority belongs to the first processor argument.
  runtime,
} satisfies XnlAuthoringSubmitConfig;
const openInputWithCallback = {
  id: 'session:architecture',
  source: {
    uri: 'vfs://@/documents/architecture.xnl',
    // @ts-expect-error source is an identity fact, not callback wiring.
    callback: () => undefined,
  },
} satisfies XnlAuthoringOpenInput<DocumentFact>;
const openInputWithWriter = {
  id: 'session:architecture',
  source: {
    uri: 'vfs://@/documents/architecture.xnl',
    // @ts-expect-error source cannot carry writer authority.
    writer: {},
  },
} satisfies XnlAuthoringOpenInput<DocumentFact>;
const openInputWithRuntime = {
  id: 'session:architecture',
  // @ts-expect-error open input only carries id/source fact.
  runtime,
} satisfies XnlAuthoringOpenInput<DocumentFact>;
const openConfigWithRegistry = {
  // @ts-expect-error open config is serializable empty policy, not registry authority.
  registry: new Map<string, unknown>(),
} satisfies XnlAuthoringOpenConfig;
declare const unknownAuthority: unknown;
declare const anyAuthority: any;
const proposalWithUnknownCommand = {
  ...proposal,
  // @ts-expect-error unknown command authority is not serializable proposal data.
  command: unknownAuthority,
} satisfies XnlAuthoringProposal<unknown>;
const proposalWithAnyCommand = {
  ...proposal,
  // @ts-expect-error any command authority collapses to never in the serializable guard.
  command: anyAuthority,
} satisfies XnlAuthoringProposal<any>;
const proposalWithFunctionCommand = {
  ...proposal,
  // @ts-expect-error function command is a capability, not immutable proposal data.
  command: () => undefined,
} satisfies XnlAuthoringProposal<() => void>;
const viewFacetWithProposal = {
  mode: 'view',
  // @ts-expect-error view Scope authoring facet must not carry proposal authority.
  proposal: proposalPort,
} satisfies XnlAuthoringViewScopeAuthoringFacet;
const viewFacetWithSubmit = {
  mode: 'view',
  // @ts-expect-error view Scope authoring facet must not have an optional submit field.
  submit: proposalPort.submit,
} satisfies XnlAuthoringViewScopeAuthoringFacet;
const editFacetWithControl = {
  mode: 'edit',
  proposal: proposalPort,
  // @ts-expect-error Scope edit facet must not expose host control authority.
  control: controlPort,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, DomainCommand>;
const editFacetWithFactory = {
  mode: 'edit',
  proposal: proposalPort,
  // @ts-expect-error Scope edit facet must not expose host factory authority.
  factory: {} as XnlAuthoringSessionFactoryPort<DocumentFact, DomainCommand, Mutation>,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, DomainCommand>;
const editFacetWithPersistence = {
  mode: 'edit',
  proposal: proposalPort,
  // @ts-expect-error Scope edit facet must not expose persistence authority.
  persistence: {} as XnlAuthoringPersistencePort<DocumentFact>,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, DomainCommand>;

// @ts-expect-error live and persisted revisions are separate authorities.
const persistedAsLive: XnlAuthoringLiveRevision = persistedRevision;
// @ts-expect-error live and persisted revisions are separate authorities.
const liveAsPersisted: XnlAuthoringPersistedRevision = liveRevision;
const unchangedWithReceipt = {
  status: 'unchanged',
  persistedRevision,
  // @ts-expect-error unchanged persistence must not fabricate an applied receipt.
  receipt,
} satisfies XnlAuthoringPersistenceResult;
const ordinaryIdentityUpdate: Mutation = {
  // @ts-expect-error #id is tree alignment/move identity, not an ordinary payload update.
  kind: 'update-id',
  targetId: 'document-title',
  value: 'replacement-title',
};
const foreignSessionRevision = {
  ...liveRevision,
  sessionId: 'session:foreign',
} as const satisfies XnlAuthoringLiveRevision<'session:foreign'>;
// @ts-expect-error a foreign session token is not a revision from this session, even with the same value.
const foreignSessionAsLocal: XnlAuthoringLiveRevision<'session:architecture'> = foreignSessionRevision;
const foreignAuthorityRevision = {
  ...persistedRevision,
  authorityId: 'authority:foreign',
} as const satisfies XnlAuthoringPersistedRevision<'authority:foreign'>;
// @ts-expect-error a foreign persistence authority token cannot be substituted by value.
const foreignAuthorityAsLocal: XnlAuthoringPersistedRevision<'authority:memory-vfs'> = foreignAuthorityRevision;
const mismatchedReceipt = {
  ...receipt,
  // @ts-expect-error receipt revisions must belong to one persistence authority.
  previousRevision: foreignAuthorityRevision,
} satisfies XnlAuthoringPersistenceReceipt<'authority:memory-vfs'>;
const explicitUndefinedOptional = {
  ...proposal,
  // @ts-expect-error optional absence is allowed, but explicit undefined is not JSON/XNL fact data.
  source: {
    occurrenceId: 'document-occurrence:1',
    xId: undefined,
  },
} satisfies XnlAuthoringProposal<DomainCommand>;
const openInputWithInitialDocument = {
  id: 'session:architecture',
  // @ts-expect-error open input is source identity only; seeding belongs to runtime persistence.
  initialDocument: acceptedSnapshot.document,
} satisfies XnlAuthoringOpenInput<DocumentFact>;

// @ts-expect-error accepted facts are readonly.
acceptedSnapshot.liveRevision = { ...liveRevision, value: 'live:8' };
// @ts-expect-error published state is readonly.
stateFromScope.accepted = acceptedSnapshot;
// @ts-expect-error published accepted revision is readonly.
stateFromScope.accepted.liveRevision = { ...liveRevision, value: 'live:9' };
// @ts-expect-error published accepted document is deeply readonly.
stateFromScope.accepted.document.children[0].text = 'Other';
// @ts-expect-error published accepted document children are readonly.
stateFromScope.accepted.document.children.push(stateFromScope.accepted.document.children[0]);
// @ts-expect-error candidate mutation batches are readonly proposal data.
candidate.mutations.push({ kind: 'set-text', targetId: 'document-title', value: 'Other' });
// @ts-expect-error proposal commands are readonly facts.
proposal.command.payload.title = 'Other';
// @ts-expect-error receipts are immutable persistence evidence.
receipt.metadata.authority = 'other-vfs';

type FactoryKeys = keyof XnlAuthoringSessionFactoryPort<DocumentFact, DomainCommand, Mutation>;
type ProposalKeys = keyof XnlAuthoringProposalPort<DocumentFact, DomainCommand>;
type ControlKeys = keyof XnlAuthoringControlPort<DocumentFact>;
type EditScopeKeys = keyof XnlAuthoringEditScopeAuthoringFacet<DocumentFact, DomainCommand>;
type ViewScopeKeys = keyof XnlAuthoringViewScopeAuthoringFacet;
type FactoryFacetIsHostOnly = Expect<Equal<FactoryKeys, 'open'>>;
type ProposalFacetIsScopeSafe = Expect<Equal<ProposalKeys, 'state' | 'subscribe' | 'submit'>>;
type ControlFacetIsHostOnly = Expect<
  Equal<ControlKeys, 'retryPersistence' | 'reloadDiscardingAccepted' | 'dispose'>
>;
type EditScopeFacetIsProposalOnly = Expect<Equal<EditScopeKeys, 'mode' | 'proposal'>>;
type ViewScopeFacetHasNoProposal = Expect<Equal<ViewScopeKeys, 'mode'>>;
type ProposalHasNoFactory = ExpectFalse<'open' extends ProposalKeys ? true : false>;
type ProposalHasNoControl = ExpectFalse<'retryPersistence' extends ProposalKeys ? true : false>;
type ProposalHasNoPersistence = ExpectFalse<'persistence' extends ProposalKeys ? true : false>;
type SubmitTakesImmutableProposalAndConfig = Expect<Equal<
  SubmitParameters,
  [proposal: XnlAuthoringProposal<DomainCommand>, config: XnlAuthoringSubmitConfig]
>>;
type SubscribeListenerIsCapabilityArgument = Expect<Equal<
  Property<SubscribeParameters, 0>,
  (state: XnlAuthoringSessionState<DocumentFact>) => void
>>;

type PublicFactSurface =
  | XnlAuthoringAcceptedSnapshot<DocumentFact>
  | XnlAuthoringCandidate<DocumentFact, Mutation>
  | XnlAuthoringProposal<DomainCommand>
  | XnlAuthoringCoordinatorInput<DocumentFact, DomainCommand>
  | XnlAuthoringCoordinatorResult<DocumentFact, Mutation>
  | XnlAuthoringLiveRevision
  | XnlAuthoringPersistedRevision
  | XnlAuthoringPersistenceReceipt
  | XnlAuthoringPersistenceResult
  | XnlAuthoringSessionState<DocumentFact>
  | XnlAuthoringSubmitConfig
  | XnlAuthoringSubmitResult<DocumentFact>
  | XnlAuthoringDiagnostic;
type PublicFactsHaveNoAnyOrUnknown = ExpectFalse<ContainsUnsafe<PublicFactSurface>>;
type PublicFactsAreSerializable = Expect<PublicFactSurface extends XnlAuthoringSerializableValue ? true : false>;
type PersistencePortIsRuntimeCapability = XnlAuthoringPersistencePort<DocumentFact>;
type RevisionPortIsRuntimeCapability = XnlAuthoringRevisionPort;

void [
  acceptedSnapshot,
  proposal,
  candidate,
  coordinatorInput,
  coordinatorConfig,
  appliedPersistence,
  unchangedPersistence,
  conflictedPersistence,
  failedPersistence,
  acceptedResult,
  unchangedResult,
  rejectedResult,
  conflictResult,
  failedResult,
  candidateCoordinatorResult,
  unchangedCoordinatorResult,
  rejectedCoordinatorResult,
  conflictCoordinatorResult,
  failedCoordinatorResult,
  canonicalAcceptedSnapshot,
  recursiveCandidate,
  openInput,
  openConfig,
  submitOutput,
  coordinatorOutput,
  editScopeFacet,
  viewScopeFacet,
  scopeFacet,
  stateFromScope,
  readableAccepted,
  readableTitle,
  inputWithFunction,
  inputWithWriter,
  inputWithRegistry,
  inputWithPersistenceClient,
  inputWithRuntime,
  configWithFunction,
  configWithWriter,
  configWithRegistry,
  configWithPersistenceClient,
  configWithRuntime,
  openInputWithCallback,
  openInputWithWriter,
  openInputWithRuntime,
  openConfigWithRegistry,
  proposalWithUnknownCommand,
  proposalWithAnyCommand,
  proposalWithFunctionCommand,
  viewFacetWithProposal,
  viewFacetWithSubmit,
  editFacetWithControl,
  editFacetWithFactory,
  editFacetWithPersistence,
  persistedAsLive,
  liveAsPersisted,
  unchangedWithReceipt,
  ordinaryIdentityUpdate,
  openInputWithInitialDocument,
  foreignSessionRevision,
  foreignSessionAsLocal,
  foreignAuthorityRevision,
  foreignAuthorityAsLocal,
  mismatchedReceipt,
  explicitUndefinedOptional,
];
void (undefined as never as [
  FactoryFacetIsHostOnly,
  ProposalFacetIsScopeSafe,
  ControlFacetIsHostOnly,
  EditScopeFacetIsProposalOnly,
  ViewScopeFacetHasNoProposal,
  ProposalHasNoFactory,
  ProposalHasNoControl,
  ProposalHasNoPersistence,
  SubmitTakesImmutableProposalAndConfig,
  SubscribeListenerIsCapabilityArgument,
  ScopeFacetUnionModeOnly,
  PublicFactsHaveNoAnyOrUnknown,
  PublicFactsAreSerializable,
  PersistencePortIsRuntimeCapability,
  RevisionPortIsRuntimeCapability,
  CanonicalRuntime,
  CanonicalXnlNodeIsNotAny,
  CanonicalDocumentIsNotAny,
]);
