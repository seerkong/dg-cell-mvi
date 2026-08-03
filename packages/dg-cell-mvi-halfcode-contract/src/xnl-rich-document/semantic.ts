import type { XnlProjectionDomainPath } from '../xnl-projection';
import type { XnlRichDocumentDiagnostic } from './diagnostics';
import type { XnlRichDocumentDomainNodeId } from './identity';
import type { XnlRichDocumentCopyOrigin } from './logic';
import type {
  XnlRichDocument,
  XnlRichDocumentBlockquote,
  XnlRichDocumentBulletList,
  XnlRichDocumentCapsuleEmbed,
  XnlRichDocumentCodeBlock,
  XnlRichDocumentComponentEmbed,
  XnlRichDocumentEmbedRef,
  XnlRichDocumentHeading,
  XnlRichDocumentImage,
  XnlRichDocumentListItem,
  XnlRichDocumentMark,
  XnlRichDocumentMermaid,
  XnlRichDocumentOrderedList,
  XnlRichDocumentParagraph,
  XnlRichDocumentTable,
  XnlRichDocumentTableCell,
  XnlRichDocumentTableHeader,
  XnlRichDocumentTableRow,
  XnlRichDocumentText,
} from './model';
import type { XnlRichDocumentProcessor } from './runtime';
import type { XnlRichDocumentSerializableRecord } from './serializable';

export const XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION = 1 as const;
export const XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE = 'xnl.rich-document.edit' as const;
export const XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE = 'xnl.rich-document.apply-interaction' as const;

export const XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS = Object.freeze([
  'insert',
  'delete',
  'move',
  'text',
  'mark',
  'table',
  'code',
  'mermaid-source',
] as const);

export type XnlRichDocumentSemanticEditKind =
  (typeof XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS)[number];

export function isXnlRichDocumentSemanticEditKind(
  value: unknown,
): value is XnlRichDocumentSemanticEditKind {
  return typeof value === 'string'
    && (XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS as readonly string[]).includes(value);
}

export type XnlRichDocumentStableNodeRef = Readonly<{
  kind: 'stable';
  nodeId: XnlRichDocumentDomainNodeId;
  localNodeId?: never;
}>;

export type XnlRichDocumentLocalNodeRef = Readonly<{
  kind: 'local';
  localNodeId: string;
  nodeId?: never;
}>;

export type XnlRichDocumentNodeRef =
  | XnlRichDocumentStableNodeRef
  | XnlRichDocumentLocalNodeRef;

type XnlRichDocumentStableSemanticIdentity = Readonly<{
  nodeId: XnlRichDocumentDomainNodeId;
  localNodeId?: never;
  sourceNodeId?: never;
}>;

type XnlRichDocumentLocalSemanticIdentity = Readonly<{
  nodeId?: never;
  localNodeId: string;
  sourceNodeId?: XnlRichDocumentDomainNodeId;
}>;

type XnlRichDocumentSemanticPersistentNode<TPayload> =
  | (Readonly<TPayload> & XnlRichDocumentStableSemanticIdentity)
  | (Readonly<TPayload> & XnlRichDocumentLocalSemanticIdentity);

export type XnlRichDocumentSemanticText = XnlRichDocumentText;

export type XnlRichDocumentSemanticParagraph = XnlRichDocumentSemanticPersistentNode<
  Omit<XnlRichDocumentParagraph, 'nodeId'>
>;

export type XnlRichDocumentSemanticHeading = XnlRichDocumentSemanticPersistentNode<
  Omit<XnlRichDocumentHeading, 'nodeId'>
>;

export type XnlRichDocumentSemanticBlockquote = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentBlockquote['kind'];
  children: readonly XnlRichDocumentSemanticBlockNode[];
}>>;

export type XnlRichDocumentSemanticBulletList = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentBulletList['kind'];
  children: readonly XnlRichDocumentSemanticListItem[];
}>>;

export type XnlRichDocumentSemanticOrderedList = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentOrderedList['kind'];
  start?: XnlRichDocumentOrderedList['start'];
  children: readonly XnlRichDocumentSemanticListItem[];
}>>;

export type XnlRichDocumentSemanticListItem = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentListItem['kind'];
  children: readonly XnlRichDocumentSemanticBlockNode[];
}>>;

export type XnlRichDocumentSemanticImage = XnlRichDocumentSemanticPersistentNode<
  Omit<XnlRichDocumentImage, 'nodeId'>
>;

export type XnlRichDocumentSemanticTable = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentTable['kind'];
  children: readonly XnlRichDocumentSemanticTableRow[];
}>>;

export type XnlRichDocumentSemanticTableRow = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocumentTableRow['kind'];
  children: readonly XnlRichDocumentSemanticTableCellNode[];
}>>;

type XnlRichDocumentSemanticTableCellPayload = Readonly<{
  colspan?: XnlRichDocumentTableCell['colspan'];
  rowspan?: XnlRichDocumentTableCell['rowspan'];
  children: readonly XnlRichDocumentSemanticBlockNode[];
}>;

export type XnlRichDocumentSemanticTableCell = XnlRichDocumentSemanticPersistentNode<
  Readonly<{ kind: XnlRichDocumentTableCell['kind'] }> & XnlRichDocumentSemanticTableCellPayload
>;

export type XnlRichDocumentSemanticTableHeader = XnlRichDocumentSemanticPersistentNode<
  Readonly<{ kind: XnlRichDocumentTableHeader['kind'] }> & XnlRichDocumentSemanticTableCellPayload
>;

export type XnlRichDocumentSemanticTableCellNode =
  | XnlRichDocumentSemanticTableCell
  | XnlRichDocumentSemanticTableHeader;

export type XnlRichDocumentSemanticCodeBlock = XnlRichDocumentSemanticPersistentNode<
  Omit<XnlRichDocumentCodeBlock, 'nodeId'>
>;

export type XnlRichDocumentSemanticMermaid = XnlRichDocumentSemanticPersistentNode<
  Omit<XnlRichDocumentMermaid, 'nodeId'>
>;

export type XnlRichDocumentSemanticComponentEmbed = XnlRichDocumentSemanticPersistentNode<
  Readonly<{
    kind: XnlRichDocumentComponentEmbed['kind'];
    ref: XnlRichDocumentEmbedRef['ref'];
    version?: XnlRichDocumentEmbedRef['version'];
    input?: XnlRichDocumentComponentEmbed['input'];
  }>
>;

export type XnlRichDocumentSemanticCapsuleEmbed = XnlRichDocumentSemanticPersistentNode<
  Readonly<{
    kind: XnlRichDocumentCapsuleEmbed['kind'];
    ref: XnlRichDocumentEmbedRef['ref'];
    version?: XnlRichDocumentEmbedRef['version'];
    input?: XnlRichDocumentCapsuleEmbed['input'];
  }>
>;

export type XnlRichDocumentSemanticBlockNode =
  | XnlRichDocumentSemanticParagraph
  | XnlRichDocumentSemanticHeading
  | XnlRichDocumentSemanticBlockquote
  | XnlRichDocumentSemanticBulletList
  | XnlRichDocumentSemanticOrderedList
  | XnlRichDocumentSemanticImage
  | XnlRichDocumentSemanticTable
  | XnlRichDocumentSemanticCodeBlock
  | XnlRichDocumentSemanticMermaid
  | XnlRichDocumentSemanticComponentEmbed
  | XnlRichDocumentSemanticCapsuleEmbed;

export type XnlRichDocumentSemanticDocument = XnlRichDocumentSemanticPersistentNode<Readonly<{
  kind: XnlRichDocument['kind'];
  children: readonly XnlRichDocumentSemanticBlockNode[];
}>>;

export type XnlRichDocumentSemanticNode =
  | XnlRichDocumentSemanticDocument
  | XnlRichDocumentSemanticBlockNode
  | XnlRichDocumentSemanticListItem
  | XnlRichDocumentSemanticTableRow
  | XnlRichDocumentSemanticTableCellNode
  | XnlRichDocumentSemanticText;

export type XnlRichDocumentLocalSemanticNode = Extract<
  XnlRichDocumentSemanticNode,
  { localNodeId: string }
>;

export type XnlRichDocumentInlineRun = Readonly<{
  text: string;
  marks: readonly XnlRichDocumentMark[];
}>;

export type XnlRichDocumentSemanticEdit =
  | Readonly<{
      kind: 'insert';
      localNodeId: string;
      parent: XnlRichDocumentNodeRef;
      index: number;
      node: XnlRichDocumentLocalSemanticNode;
    }>
  | Readonly<{
      kind: 'delete';
      nodeId: XnlRichDocumentDomainNodeId;
      parent: XnlRichDocumentStableNodeRef;
      index: number;
    }>
  | Readonly<{
      kind: 'move';
      nodeId: XnlRichDocumentDomainNodeId;
      from: Readonly<{
        parent: XnlRichDocumentStableNodeRef;
        index: number;
      }>;
      to: Readonly<{
        parent: XnlRichDocumentNodeRef;
        index: number;
      }>;
    }>
  | Readonly<{
      kind: 'text';
      nodeId: XnlRichDocumentDomainNodeId;
      before: string;
      after: string;
      beforeInlineRuns: readonly XnlRichDocumentInlineRun[];
      afterInlineRuns: readonly XnlRichDocumentInlineRun[];
    }>
  | Readonly<{
      kind: 'mark';
      nodeId: XnlRichDocumentDomainNodeId;
      before: readonly XnlRichDocumentInlineRun[];
      after: readonly XnlRichDocumentInlineRun[];
    }>
  | Readonly<{
      kind: 'table';
      nodeId: XnlRichDocumentDomainNodeId;
      before: XnlRichDocumentSemanticTable;
      after: XnlRichDocumentSemanticTable;
    }>
  | Readonly<{
      kind: 'code';
      nodeId: XnlRichDocumentDomainNodeId;
      before: Readonly<{
        language: string | null;
        text: string;
      }>;
      after: Readonly<{
        language: string | null;
        text: string;
      }>;
    }>
  | Readonly<{
      kind: 'mermaid-source';
      nodeId: XnlRichDocumentDomainNodeId;
      before: string;
      after: string;
    }>;

export type XnlRichDocumentEditInteractionPayload = Readonly<{
  version: typeof XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION;
  edits: readonly XnlRichDocumentSemanticEdit[];
}>;

export type XnlRichDocumentEditCommandTarget = Readonly<{
  path: XnlProjectionDomainPath;
  nodeId?: XnlRichDocumentDomainNodeId;
  tag?: string;
  sourceKind?: string;
  role?: string;
  sourceRef?: string;
  metadata?: XnlRichDocumentSerializableRecord;
}>;

export type XnlRichDocumentEditCommand = Readonly<{
  type: typeof XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE;
  target: XnlRichDocumentEditCommandTarget;
  payload: XnlRichDocumentEditInteractionPayload;
  provenance?: XnlRichDocumentSerializableRecord;
  metadata?: XnlRichDocumentSerializableRecord;
}>;

export type XnlRichDocumentCandidateMaterializationRuntime = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentCandidateMaterializationInput = Readonly<{
  accepted: XnlRichDocument;
  command: XnlRichDocumentEditCommand;
}>;

export type XnlRichDocumentCandidateMaterializationConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlRichDocumentCandidateMaterializationResult =
  | Readonly<{
      status: 'materialized';
      candidate: XnlRichDocument;
      copyOrigins?: readonly XnlRichDocumentCopyOrigin[];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly XnlRichDocumentDiagnostic[];
    }>;

export type XnlRichDocumentCandidateMaterializer = XnlRichDocumentProcessor<
  XnlRichDocumentCandidateMaterializationRuntime,
  XnlRichDocumentCandidateMaterializationInput,
  XnlRichDocumentCandidateMaterializationConfig,
  XnlRichDocumentCandidateMaterializationResult
>;
