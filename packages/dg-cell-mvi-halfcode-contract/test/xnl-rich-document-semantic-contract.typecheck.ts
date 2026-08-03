import type {
  XnlProjectionDomainCommand,
  XnlRichDocumentCandidateMaterializationInput,
  XnlRichDocumentCandidateMaterializationRuntime,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentEditInteractionPayload,
  XnlRichDocumentInlineRun,
  XnlRichDocumentLocalNodeRef,
  XnlRichDocumentMark,
  XnlRichDocumentNodeKind,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentSemanticBlockNode,
  XnlRichDocumentSemanticNode,
  XnlRichDocumentSerializableValue,
  XnlRichDocumentStableNodeRef,
} from 'dg-cell-mvi-halfcode-contract';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type Extends<Left, Right> = Left extends Right ? true : false;
type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

type EditKinds = XnlRichDocumentSemanticEdit['kind'];
type InsertEdit = Extract<XnlRichDocumentSemanticEdit, { kind: 'insert' }>;
type TextEdit = Extract<XnlRichDocumentSemanticEdit, { kind: 'text' }>;
type MarkEdit = Extract<XnlRichDocumentSemanticEdit, { kind: 'mark' }>;
type SemanticParagraph = Extract<XnlRichDocumentSemanticNode, { kind: 'paragraph' }>;
type SemanticTableCell = Extract<XnlRichDocumentSemanticNode, { kind: 'table-cell' }>;
type SemanticText = Extract<XnlRichDocumentSemanticNode, { kind: 'text' }>;
type LocalSemanticNode = Extract<XnlRichDocumentSemanticNode, { localNodeId: string }>;
type StableSemanticNode = Extract<XnlRichDocumentSemanticNode, { nodeId: XnlRichDocumentDomainNodeId }>;

type AllEightEditKindsAreClosed = Expect<Equal<EditKinds,
  | 'insert'
  | 'delete'
  | 'move'
  | 'text'
  | 'mark'
  | 'table'
  | 'code'
  | 'mermaid-source'>>;
type SemanticNodeKindsAreCanonical = Expect<Equal<
  XnlRichDocumentSemanticNode['kind'],
  XnlRichDocumentNodeKind
>>;
type SemanticNodeIsSerializable = Expect<Extends<XnlRichDocumentSemanticNode, XnlRichDocumentSerializableValue>>;
type SemanticEditIsSerializable = Expect<Extends<XnlRichDocumentSemanticEdit, XnlRichDocumentSerializableValue>>;
type PayloadIsSerializable = Expect<Extends<XnlRichDocumentEditInteractionPayload, XnlRichDocumentSerializableValue>>;
type CommandIsSerializable = Expect<Extends<XnlRichDocumentEditCommand, XnlRichDocumentSerializableValue>>;
type ResultIsSerializable = Expect<Extends<XnlRichDocumentCandidateMaterializationResult, XnlRichDocumentSerializableValue>>;
type CanonicalCommandIsDomainCommand = Expect<Extends<XnlRichDocumentEditCommand, XnlProjectionDomainCommand>>;
type InsertRootIsLocal = Expect<Extends<InsertEdit['node'], LocalSemanticNode>>;
type StableRefHasNoLocalIdentity = Expect<Equal<XnlRichDocumentStableNodeRef['localNodeId'], undefined>>;
type LocalRefHasNoStableIdentity = Expect<Equal<XnlRichDocumentLocalNodeRef['nodeId'], undefined>>;
type LocalCopySourceIsStableId = Expect<Equal<Exclude<LocalSemanticNode['sourceNodeId'], undefined>, XnlRichDocumentDomainNodeId>>;
type StableNodeHasNoCopySource = Expect<Equal<StableSemanticNode['sourceNodeId'], undefined>>;
type SemanticNodeHasNoAdapterType = Expect<Equal<HasKey<XnlRichDocumentSemanticNode, 'type'>, false>>;
type SemanticNodeHasNoAdapterAttrs = Expect<Equal<HasKey<XnlRichDocumentSemanticNode, 'attrs'>, false>>;
type ParagraphUsesCanonicalContent = Expect<Equal<
  SemanticParagraph['content'],
  readonly SemanticText[]
>>;
type TableCellUsesCanonicalPayload = Expect<Equal<
  Pick<SemanticTableCell, 'colspan' | 'rowspan' | 'children'>,
  Readonly<{
    colspan?: number;
    rowspan?: number;
    children: readonly XnlRichDocumentSemanticBlockNode[];
  }>
>>;
type TextUsesCanonicalMarks = Expect<Equal<
  SemanticText['marks'],
  readonly XnlRichDocumentMark[] | undefined
>>;
type TextCarriesExactBeforeRuns = Expect<Equal<TextEdit['beforeInlineRuns'], readonly XnlRichDocumentInlineRun[]>>;
type TextCarriesExactFinalRuns = Expect<Equal<TextEdit['afterInlineRuns'], readonly XnlRichDocumentInlineRun[]>>;
type MarkCarriesExactBeforeRuns = Expect<Equal<MarkEdit['before'], readonly XnlRichDocumentInlineRun[]>>;
type MarkCarriesExactFinalRuns = Expect<Equal<MarkEdit['after'], readonly XnlRichDocumentInlineRun[]>>;
type InputHasNoRuntime = Expect<Equal<HasKey<XnlRichDocumentCandidateMaterializationInput, 'runtime'>, false>>;
type InputHasNoSession = Expect<Equal<HasKey<XnlRichDocumentCandidateMaterializationInput, 'session'>, false>>;
type InputHasNoWriter = Expect<Equal<HasKey<XnlRichDocumentCandidateMaterializationInput, 'writer'>, false>>;
type RuntimeIsExactlyEmpty = Expect<Equal<
  Parameters<XnlRichDocumentCandidateMaterializer>[0],
  XnlRichDocumentCandidateMaterializationRuntime
>>;
type AuthorityRuntimeCannotEnter = Expect<Equal<Extends<Readonly<{
  proposal: unknown;
  submit: unknown;
  allocator: unknown;
  VFS: unknown;
  session: unknown;
  writer: unknown;
}>, XnlRichDocumentCandidateMaterializationRuntime>, false>>;

const stableId = 'paragraph:accepted' as XnlRichDocumentDomainNodeId;
const stableRef = {
  kind: 'stable',
  nodeId: stableId,
  // @ts-expect-error Stable refs cannot also carry local identity.
  localNodeId: 'local:forged',
} satisfies XnlRichDocumentStableNodeRef;
const localRef = {
  kind: 'local',
  localNodeId: 'local:new',
  // @ts-expect-error Local refs cannot also carry stable identity.
  nodeId: stableId,
} satisfies XnlRichDocumentLocalNodeRef;
const invalidStableCopyNode = {
  kind: 'paragraph',
  nodeId: stableId,
  content: [],
  // @ts-expect-error Copy provenance belongs only to a local candidate identity.
  sourceNodeId: stableId,
} satisfies XnlRichDocumentSemanticNode;
const invalidLocalStableNode = {
  kind: 'paragraph',
  localNodeId: 'local:conflict',
  content: [],
  // @ts-expect-error A semantic node cannot carry stable and local identity together.
  nodeId: stableId,
} satisfies XnlRichDocumentSemanticNode;
const invalidUnbrandedCopySource = {
  kind: 'paragraph',
  localNodeId: 'local:copy',
  content: [],
  // @ts-expect-error Copy provenance must reference an accepted stable Domain #id.
  sourceNodeId: 'paragraph:unbranded',
} satisfies XnlRichDocumentSemanticNode;

declare const payload: XnlRichDocumentEditInteractionPayload;
declare const command: XnlRichDocumentEditCommand;
declare const result: XnlRichDocumentCandidateMaterializationResult;
declare const materializer: XnlRichDocumentCandidateMaterializer;
declare const semanticNode: XnlRichDocumentSemanticNode;
declare const materializationInput: XnlRichDocumentCandidateMaterializationInput;

// @ts-expect-error Canonical payload fields are readonly.
payload.version = 1;
// @ts-expect-error Canonical edit collection is readonly.
payload.edits.push({} as XnlRichDocumentSemanticEdit);
// @ts-expect-error Canonical command target is readonly.
command.target.path = [];
if (semanticNode.kind === 'document') {
  // @ts-expect-error Recursive semantic children are readonly.
  semanticNode.children.push(semanticNode.children[0]!);
}
if (semanticNode.kind === 'paragraph') {
  // @ts-expect-error Inline semantic content is readonly.
  semanticNode.content.push({ kind: 'text', text: 'forbidden' });
}
if (result.status === 'materialized') {
  // @ts-expect-error Candidate output is deeply readonly.
  result.candidate.children.push({} as never);
  // @ts-expect-error Copy provenance is readonly.
  result.copyOrigins?.push({ candidateNodeId: stableId, sourceNodeId: stableId });
}

// @ts-expect-error The canonical materializer runtime cannot be widened with host authority.
type MaterializerWithAuthorityRuntime = XnlRichDocumentCandidateMaterializer<{
  proposal: unknown;
}>;
const authorityRuntime = {
  proposal: {},
  submit: () => undefined,
  allocator: {},
  VFS: {},
  session: {},
  writer: {},
};
// @ts-expect-error Proposal/submit/allocator/VFS/session/writer capabilities cannot enter this facet.
materializer(authorityRuntime, materializationInput, {});

void [
  stableRef,
  localRef,
  invalidStableCopyNode,
  invalidLocalStableNode,
  invalidUnbrandedCopySource,
  materializer,
];

type ContractAssertions = [
  AllEightEditKindsAreClosed,
  SemanticNodeKindsAreCanonical,
  SemanticNodeIsSerializable,
  SemanticEditIsSerializable,
  PayloadIsSerializable,
  CommandIsSerializable,
  ResultIsSerializable,
  CanonicalCommandIsDomainCommand,
  InsertRootIsLocal,
  StableRefHasNoLocalIdentity,
  LocalRefHasNoStableIdentity,
  LocalCopySourceIsStableId,
  StableNodeHasNoCopySource,
  SemanticNodeHasNoAdapterType,
  SemanticNodeHasNoAdapterAttrs,
  ParagraphUsesCanonicalContent,
  TableCellUsesCanonicalPayload,
  TextUsesCanonicalMarks,
  TextCarriesExactBeforeRuns,
  TextCarriesExactFinalRuns,
  MarkCarriesExactBeforeRuns,
  MarkCarriesExactFinalRuns,
  InputHasNoRuntime,
  InputHasNoSession,
  InputHasNoWriter,
  RuntimeIsExactlyEmpty,
  AuthorityRuntimeCannotEnter,
];

void (undefined as unknown as ContractAssertions);
