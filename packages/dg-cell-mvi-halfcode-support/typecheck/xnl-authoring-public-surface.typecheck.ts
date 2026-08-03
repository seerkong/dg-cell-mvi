import {
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringSessionFactory,
  createXnlAuthoringViewScopeFacet,
  type XnlAuthoringControlPort,
  type XnlAuthoringEditScopeAuthoringFacet,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringOpenConfig,
  type XnlAuthoringOpenInput,
  type XnlAuthoringPersistencePort,
  type XnlAuthoringProposal,
  type XnlAuthoringProposalPort,
  type XnlAuthoringRuntime,
  type XnlAuthoringScopeAuthoringFacet,
  type XnlAuthoringSessionFactoryPort,
  type XnlAuthoringSessionState,
  type XnlAuthoringSubmitConfig,
  type XnlAuthoringViewScopeAuthoringFacet,
} from 'dg-cell-mvi-halfcode-support';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Property<T, Key extends PropertyKey> = Key extends keyof T ? T[Key] : never;
type FunctionParameters<T> = T extends (...args: infer Parameters) => unknown ? Parameters : never;

interface DocumentFact {
  readonly tag: 'Document';
  readonly children: readonly { readonly text: string }[];
}

interface Command {
  readonly type: 'document.rename-title';
  readonly title: string;
}

interface Mutation {
  readonly kind: 'set-title';
  readonly value: string;
}

declare const runtime: XnlAuthoringRuntime<DocumentFact, Command, Mutation>;
declare const proposalPort: XnlAuthoringProposalPort<DocumentFact, Command>;
declare const controlPort: XnlAuthoringControlPort<DocumentFact>;
declare const persistencePort: XnlAuthoringPersistencePort<DocumentFact>;
declare const liveRevision: XnlAuthoringLiveRevision;
declare const unknownAuthority: unknown;
declare const anyAuthority: any;

const factory = createXnlAuthoringSessionFactory<DocumentFact, Command, Mutation>();
const hostFactory: XnlAuthoringSessionFactoryPort<DocumentFact, Command, Mutation> = factory;
const editFacet = createXnlAuthoringEditScopeFacet(proposalPort);
const viewFacet = createXnlAuthoringViewScopeFacet();
const scopeFacet: XnlAuthoringScopeAuthoringFacet<DocumentFact, Command> =
  Math.random() > 0.5 ? editFacet : viewFacet;

const proposal = {
  kind: 'xnl-authoring-proposal',
  id: 'proposal:rename',
  baseLiveRevision: liveRevision,
  command: { type: 'document.rename-title', title: 'Architecture' },
} as const satisfies XnlAuthoringProposal<Command>;
const openInput = {
  id: 'session:document',
  source: { uri: 'vfs://@/documents/architecture.xnl' },
} as const satisfies XnlAuthoringOpenInput<DocumentFact>;
const openConfig = {} as const satisfies XnlAuthoringOpenConfig;
const submitConfig = {
  policy: { conflict: 'reject' },
} as const satisfies XnlAuthoringSubmitConfig;

if (scopeFacet.mode === 'edit') {
  scopeFacet.proposal.submit(proposal, submitConfig);
}

const state = proposalPort.state();
const readableState: XnlAuthoringSessionState<DocumentFact> = state;
const readableText: string = state.accepted.document.children[0].text;

// @ts-expect-error Scope-visible edit facet must not expose host control.
editFacet.control;
// @ts-expect-error Scope-visible edit facet must not expose host factory.
editFacet.factory;
// @ts-expect-error View facet has no proposal authority.
viewFacet.proposal;
// @ts-expect-error View facet has no submit authority, not even optional.
viewFacet.submit;
// @ts-expect-error Published state is deeply readonly.
state.accepted.document.children[0].text = 'Other';
// @ts-expect-error Published state revision is readonly.
state.accepted.liveRevision = liveRevision;
const editFacetWithControl = {
  mode: 'edit',
  proposal: proposalPort,
  // @ts-expect-error Scope facet must not carry host control authority.
  control: controlPort,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, Command>;
const editFacetWithPersistence = {
  mode: 'edit',
  proposal: proposalPort,
  // @ts-expect-error Scope facet must not carry persistence authority.
  persistence: persistencePort,
} satisfies XnlAuthoringEditScopeAuthoringFacet<DocumentFact, Command>;
const viewFacetWithSubmit = {
  mode: 'view',
  // @ts-expect-error View facet must not declare submit.
  submit: proposalPort.submit,
} satisfies XnlAuthoringViewScopeAuthoringFacet;
const openInputWithRuntime = {
  id: 'session:document',
  // @ts-expect-error open input only accepts id/source fact.
  runtime,
} satisfies XnlAuthoringOpenInput<DocumentFact>;
const openInputWithUnknownSource = {
  id: 'session:document',
  // @ts-expect-error unknown source authority is not a serializable source fact.
  source: unknownAuthority,
} satisfies XnlAuthoringOpenInput<DocumentFact>;
const openConfigWithWriter = {
  // @ts-expect-error open config is empty serializable data, not writer authority.
  writer: {},
} satisfies XnlAuthoringOpenConfig;
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
  // @ts-expect-error function command is runtime capability, not proposal data.
  command: () => undefined,
} satisfies XnlAuthoringProposal<() => void>;

type FactoryKeys = keyof XnlAuthoringSessionFactoryPort<DocumentFact, Command, Mutation>;
type ProposalKeys = keyof XnlAuthoringProposalPort<DocumentFact, Command>;
type ControlKeys = keyof XnlAuthoringControlPort<DocumentFact>;
type EditKeys = keyof XnlAuthoringEditScopeAuthoringFacet<DocumentFact, Command>;
type ViewKeys = keyof XnlAuthoringViewScopeAuthoringFacet;
type SubmitParameters = FunctionParameters<Property<XnlAuthoringProposalPort<DocumentFact, Command>, 'submit'>>;

type FactoryIsHostOnly = Expect<Equal<FactoryKeys, 'open'>>;
type ProposalIsScopeSafe = Expect<Equal<ProposalKeys, 'state' | 'subscribe' | 'submit'>>;
type ControlIsHostOnly = Expect<Equal<ControlKeys, 'retryPersistence' | 'reloadDiscardingAccepted' | 'dispose'>>;
type EditFacetIsProposalOnly = Expect<Equal<EditKeys, 'mode' | 'proposal'>>;
type ViewFacetHasNoAuthority = Expect<Equal<ViewKeys, 'mode'>>;
type ScopeUnionDoesNotExposeProposalWithoutNarrowing = Expect<Equal<keyof XnlAuthoringScopeAuthoringFacet<DocumentFact, Command>, 'mode'>>;
type SubmitTakesProposalAndConfig = Expect<Equal<
  SubmitParameters,
  [proposal: XnlAuthoringProposal<Command>, config: XnlAuthoringSubmitConfig]
>>;
type PublicConstructorsAreTyped = ExpectFalse<IsAny<typeof createXnlAuthoringEditScopeFacet>>;

void [
  factory,
  hostFactory,
  editFacet,
  viewFacet,
  scopeFacet,
  proposal,
  openInput,
  openConfig,
  submitConfig,
  readableState,
  readableText,
  editFacetWithControl,
  editFacetWithPersistence,
  viewFacetWithSubmit,
  openInputWithRuntime,
  openInputWithUnknownSource,
  openConfigWithWriter,
  proposalWithUnknownCommand,
  proposalWithAnyCommand,
  proposalWithFunctionCommand,
];
void (undefined as unknown as [
  FactoryIsHostOnly,
  ProposalIsScopeSafe,
  ControlIsHostOnly,
  EditFacetIsProposalOnly,
  ViewFacetHasNoAuthority,
  ScopeUnionDoesNotExposeProposalWithoutNarrowing,
  SubmitTakesProposalAndConfig,
  PublicConstructorsAreTyped,
]);
