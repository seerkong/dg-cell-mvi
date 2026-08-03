import {
  type XnlRichDocument,
  type XnlRichDocumentAdapterPosition,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentIdentityAllocationRequest,
  type XnlRichDocumentIdentityAllocationResult,
  type XnlRichDocumentIdentityAllocator,
  type XnlRichDocumentGenericInputRecord,
  type XnlRichDocumentOccurrenceXId,
  type XnlRichDocumentNormalizedResult,
  type XnlRichDocumentSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type Extends<Left, Right> = Left extends Right ? true : false;
type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

type DomainIdIsNotOccurrenceId = Expect<Equal<Extends<XnlRichDocumentDomainNodeId, XnlRichDocumentOccurrenceXId>, false>>;
type OccurrenceIdIsNotDomainId = Expect<Equal<Extends<XnlRichDocumentOccurrenceXId, XnlRichDocumentDomainNodeId>, false>>;
type PositionIsNotDomainId = Expect<Equal<Extends<XnlRichDocumentAdapterPosition, XnlRichDocumentDomainNodeId>, false>>;
type PositionIsNotOccurrenceId = Expect<Equal<Extends<XnlRichDocumentAdapterPosition, XnlRichDocumentOccurrenceXId>, false>>;
type DocumentHasNoAdapterPosition = Expect<Equal<HasKey<XnlRichDocument, 'position'>, false>>;
type DocumentHasNoOccurrenceAddress = Expect<Equal<HasKey<XnlRichDocument, 'xId'>, false>>;
type AllocationRequestIsSerializable = Expect<Extends<XnlRichDocumentIdentityAllocationRequest, XnlRichDocumentSerializableValue>>;
type AllocationResultIsSerializable = Expect<Extends<XnlRichDocumentIdentityAllocationResult, XnlRichDocumentSerializableValue>>;
type DocumentIsSerializable = Expect<Extends<XnlRichDocument, XnlRichDocumentSerializableValue>>;
type DiagnosticIsSerializable = Expect<Extends<XnlRichDocumentDiagnostic, XnlRichDocumentSerializableValue>>;
type NormalizedResultIsSerializable = Expect<Extends<XnlRichDocumentNormalizedResult, XnlRichDocumentSerializableValue>>;

const domainNodeId = 'paragraph:intro' as XnlRichDocumentDomainNodeId;
const occurrenceXId = 'document:main/paragraph:intro' as XnlRichDocumentOccurrenceXId;
const adapterPosition = 7 as XnlRichDocumentAdapterPosition;

// @ts-expect-error Occurrence x-id cannot become persistent Domain #id.
const invalidDomainFromOccurrence: XnlRichDocumentDomainNodeId = occurrenceXId;
// @ts-expect-error Adapter-local positions cannot become persistent Domain #id.
const invalidDomainFromPosition: XnlRichDocumentDomainNodeId = adapterPosition;
// @ts-expect-error Persistent Domain #id is not an occurrence x-id.
const invalidOccurrenceFromDomain: XnlRichDocumentOccurrenceXId = domainNodeId;
// @ts-expect-error Persistent Domain #id is not an adapter-local position.
const invalidPositionFromDomain: XnlRichDocumentAdapterPosition = domainNodeId;

interface AllocationRuntime {
  readonly namespace: string;
}

const allocator: XnlRichDocumentIdentityAllocator<AllocationRuntime> = (
  runtime,
  request,
  config,
) => ({
  status: 'allocated',
  requestId: request.requestId,
  nodeId: `${runtime.namespace}:${config.collisionPolicy}:${request.requestId}` as XnlRichDocumentDomainNodeId,
  freshness: 'fresh',
});

const allocationRequest = {
  kind: 'xnl-rich-document-identity-allocation-request',
  requestId: 'allocation:new-paragraph',
  reason: 'new',
  nodeKind: 'paragraph',
  reservedNodeIds: [domainNodeId],
} satisfies XnlRichDocumentIdentityAllocationRequest;

const allocationResult = allocator(
  { namespace: 'document' },
  allocationRequest,
  { collisionPolicy: 'reject' },
);

const invalidRequestWithOccurrence = {
  ...allocationRequest,
  // @ts-expect-error Allocator reservations are persistent Domain identities, not x-id addresses.
  reservedNodeIds: [occurrenceXId],
} satisfies XnlRichDocumentIdentityAllocationRequest;
const invalidRequestWithPosition = {
  ...allocationRequest,
  // @ts-expect-error Allocator reservations cannot use adapter-local positions.
  reservedNodeIds: [adapterPosition],
} satisfies XnlRichDocumentIdentityAllocationRequest;
const invalidAdapterBoundRequest = {
  ...allocationRequest,
  // @ts-expect-error The host-owned allocator contract does not carry adapter state.
  tiptapPosition: adapterPosition,
} satisfies XnlRichDocumentIdentityAllocationRequest;

const validGenericInput = {
  user: { name: 'Ada' },
} satisfies XnlRichDocumentGenericInputRecord;
const invalidGenericComponent = {
  // @ts-expect-error Component selection is an explicit embed field, not generic input data.
  component: 'component://demo.Card',
} satisfies XnlRichDocumentGenericInputRecord;
const invalidGenericCapsule = {
  // @ts-expect-error Capsule selection is an explicit embed field, not generic input data.
  capsule: 'capsule://demo.Map',
} satisfies XnlRichDocumentGenericInputRecord;
const invalidGenericSession = {
  // @ts-expect-error Authoring session authority cannot cross the generic input boundary.
  session: 'session:one',
} satisfies XnlRichDocumentGenericInputRecord;
const invalidGenericSubmit = {
  // @ts-expect-error Submit authority cannot cross the generic input boundary.
  submit: 'submit:one',
} satisfies XnlRichDocumentGenericInputRecord;
const invalidGenericAllocator = {
  // @ts-expect-error Identity allocator authority belongs to the trusted host runtime.
  identityAllocator: 'allocator:one',
} satisfies XnlRichDocumentGenericInputRecord;

void [
  invalidDomainFromOccurrence,
  invalidDomainFromPosition,
  invalidOccurrenceFromDomain,
  invalidPositionFromDomain,
  allocator,
  allocationRequest,
  allocationResult,
  invalidRequestWithOccurrence,
  invalidRequestWithPosition,
  invalidAdapterBoundRequest,
  validGenericInput,
  invalidGenericComponent,
  invalidGenericCapsule,
  invalidGenericSession,
  invalidGenericSubmit,
  invalidGenericAllocator,
];

type ContractAssertions = [
  DomainIdIsNotOccurrenceId,
  OccurrenceIdIsNotDomainId,
  PositionIsNotDomainId,
  PositionIsNotOccurrenceId,
  DocumentHasNoAdapterPosition,
  DocumentHasNoOccurrenceAddress,
  AllocationRequestIsSerializable,
  AllocationResultIsSerializable,
  DocumentIsSerializable,
  DiagnosticIsSerializable,
  NormalizedResultIsSerializable,
];

void (undefined as unknown as ContractAssertions);
