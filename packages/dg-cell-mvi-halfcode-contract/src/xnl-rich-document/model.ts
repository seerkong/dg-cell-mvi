import type { XnlRichDocumentDomainNodeId } from './identity';
import type { XnlRichDocumentGenericInputRecord } from './serializable';

export const XNL_RICH_DOCUMENT_NODE_KINDS = [
  'document',
  'paragraph',
  'heading',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'list-item',
  'image',
  'table',
  'table-row',
  'table-cell',
  'table-header',
  'code-block',
  'mermaid',
  'component-embed',
  'capsule-embed',
  'text',
] as const;

export const XNL_RICH_DOCUMENT_MARK_KINDS = [
  'bold',
  'italic',
  'strike',
  'code',
  'link',
] as const;

export type XnlRichDocumentNodeKind = (typeof XNL_RICH_DOCUMENT_NODE_KINDS)[number];
export type XnlRichDocumentMarkKind = (typeof XNL_RICH_DOCUMENT_MARK_KINDS)[number];
export type XnlRichDocumentPersistentNodeKind = Exclude<XnlRichDocumentNodeKind, 'text'>;

type XnlRichDocumentPersistentNode<TKind extends XnlRichDocumentPersistentNodeKind> = {
  readonly kind: TKind;
  readonly nodeId: XnlRichDocumentDomainNodeId;
};

export type XnlRichDocumentBoldMark = Readonly<{ kind: 'bold' }>;
export type XnlRichDocumentItalicMark = Readonly<{ kind: 'italic' }>;
export type XnlRichDocumentStrikeMark = Readonly<{ kind: 'strike' }>;
export type XnlRichDocumentCodeMark = Readonly<{ kind: 'code' }>;
export type XnlRichDocumentLinkMark = Readonly<{
  kind: 'link';
  href: string;
  title?: string;
}>;

export type XnlRichDocumentMark =
  | XnlRichDocumentBoldMark
  | XnlRichDocumentItalicMark
  | XnlRichDocumentStrikeMark
  | XnlRichDocumentCodeMark
  | XnlRichDocumentLinkMark;

export type XnlRichDocumentText = Readonly<{
  kind: 'text';
  text: string;
  marks?: readonly XnlRichDocumentMark[];
}>;

export type XnlRichDocumentParagraph = XnlRichDocumentPersistentNode<'paragraph'> & Readonly<{
  content: readonly XnlRichDocumentText[];
}>;

export type XnlRichDocumentHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type XnlRichDocumentHeading = XnlRichDocumentPersistentNode<'heading'> & Readonly<{
  level: XnlRichDocumentHeadingLevel;
  content: readonly XnlRichDocumentText[];
}>;

export type XnlRichDocumentBlockquote = XnlRichDocumentPersistentNode<'blockquote'> & Readonly<{
  children: readonly XnlRichDocumentBlockNode[];
}>;

export type XnlRichDocumentBulletList = XnlRichDocumentPersistentNode<'bullet-list'> & Readonly<{
  children: readonly XnlRichDocumentListItem[];
}>;

export type XnlRichDocumentOrderedList = XnlRichDocumentPersistentNode<'ordered-list'> & Readonly<{
  start?: number;
  children: readonly XnlRichDocumentListItem[];
}>;

export type XnlRichDocumentListItem = XnlRichDocumentPersistentNode<'list-item'> & Readonly<{
  children: readonly XnlRichDocumentBlockNode[];
}>;

export type XnlRichDocumentImage = XnlRichDocumentPersistentNode<'image'> & Readonly<{
  src: string;
  alt?: string;
  title?: string;
}>;

export type XnlRichDocumentTable = XnlRichDocumentPersistentNode<'table'> & Readonly<{
  children: readonly XnlRichDocumentTableRow[];
}>;

export type XnlRichDocumentTableRow = XnlRichDocumentPersistentNode<'table-row'> & Readonly<{
  children: readonly XnlRichDocumentTableCellNode[];
}>;

type XnlRichDocumentTableCellBase = Readonly<{
  colspan?: number;
  rowspan?: number;
  children: readonly XnlRichDocumentBlockNode[];
}>;

export type XnlRichDocumentTableCell = XnlRichDocumentPersistentNode<'table-cell'>
  & XnlRichDocumentTableCellBase;

export type XnlRichDocumentTableHeader = XnlRichDocumentPersistentNode<'table-header'>
  & XnlRichDocumentTableCellBase;

export type XnlRichDocumentTableCellNode =
  | XnlRichDocumentTableCell
  | XnlRichDocumentTableHeader;

export type XnlRichDocumentCodeBlock = XnlRichDocumentPersistentNode<'code-block'> & Readonly<{
  language?: string;
  text: string;
}>;

export type XnlRichDocumentMermaid = XnlRichDocumentPersistentNode<'mermaid'> & Readonly<{
  source: string;
}>;

export type XnlRichDocumentEmbedRef = Readonly<{
  ref: string;
  version?: string;
}>;

export type XnlRichDocumentComponentEmbed = XnlRichDocumentPersistentNode<'component-embed'> & Readonly<{
  component: XnlRichDocumentEmbedRef;
  input?: XnlRichDocumentGenericInputRecord;
}>;

export type XnlRichDocumentCapsuleEmbed = XnlRichDocumentPersistentNode<'capsule-embed'> & Readonly<{
  capsule: XnlRichDocumentEmbedRef;
  input?: XnlRichDocumentGenericInputRecord;
}>;

export type XnlRichDocumentBlockNode =
  | XnlRichDocumentParagraph
  | XnlRichDocumentHeading
  | XnlRichDocumentBlockquote
  | XnlRichDocumentBulletList
  | XnlRichDocumentOrderedList
  | XnlRichDocumentImage
  | XnlRichDocumentTable
  | XnlRichDocumentCodeBlock
  | XnlRichDocumentMermaid
  | XnlRichDocumentComponentEmbed
  | XnlRichDocumentCapsuleEmbed;

export type XnlRichDocumentNode =
  | XnlRichDocument
  | XnlRichDocumentBlockNode
  | XnlRichDocumentListItem
  | XnlRichDocumentTableRow
  | XnlRichDocumentTableCellNode
  | XnlRichDocumentText;

export type XnlRichDocument = XnlRichDocumentPersistentNode<'document'> & Readonly<{
  children: readonly XnlRichDocumentBlockNode[];
}>;
