import type { XnlProjectionPlan } from '../xnl-projection';
import type { XnlRichDocumentDiagnostic } from './diagnostics';
import type {
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentOccurrenceXId,
} from './identity';
import type { XnlRichDocument } from './model';
import type { XnlRichDocumentNormalizedResult } from './results';
import type { XnlRichDocumentProcessor } from './runtime';
import type { XnlRichDocumentSerializableValue } from './serializable';

export const XNL_RICH_DOCUMENT_CLASSIFICATION_IDS = {
  document: 'xnl.rich-document:document',
  paragraph: 'xnl.rich-document:paragraph',
  heading: 'xnl.rich-document:heading',
  blockquote: 'xnl.rich-document:blockquote',
  'bullet-list': 'xnl.rich-document:bullet-list',
  'ordered-list': 'xnl.rich-document:ordered-list',
  'list-item': 'xnl.rich-document:list-item',
  image: 'xnl.rich-document:image',
  table: 'xnl.rich-document:table',
  'table-row': 'xnl.rich-document:table-row',
  'table-cell': 'xnl.rich-document:table-cell',
  'table-header': 'xnl.rich-document:table-header',
  'code-block': 'xnl.rich-document:code-block',
  mermaid: 'xnl.rich-document:mermaid',
  'component-embed': 'xnl.rich-document:component-embed',
  'capsule-embed': 'xnl.rich-document:capsule-embed',
  text: 'xnl.rich-document:text',
} as const;

export type XnlRichDocumentLogicRuntime = Readonly<Record<string, never>>;
export type XnlRichDocumentLogicConfig = Readonly<Record<string, never>>;
export type XnlRichDocumentPath = readonly (string | number)[];

export type XnlRichDocumentLowerInput = Readonly<{
  plan: XnlProjectionPlan;
}>;

export type XnlRichDocumentParseInput = Readonly<{
  candidate: XnlRichDocumentSerializableValue;
}>;

export type XnlRichDocumentLowerProcessor = XnlRichDocumentProcessor<
  XnlRichDocumentLogicRuntime,
  XnlRichDocumentLowerInput,
  XnlRichDocumentLogicConfig,
  XnlRichDocumentNormalizedResult
>;

export type XnlRichDocumentParseProcessor = XnlRichDocumentProcessor<
  XnlRichDocumentLogicRuntime,
  XnlRichDocumentParseInput,
  XnlRichDocumentLogicConfig,
  XnlRichDocumentNormalizedResult
>;

export type XnlRichDocumentCopyOrigin = Readonly<{
  candidateNodeId: XnlRichDocumentDomainNodeId;
  sourceNodeId: XnlRichDocumentDomainNodeId;
}>;

export type XnlRichDocumentIdentityClassificationInput = Readonly<{
  accepted: XnlRichDocumentSerializableValue;
  candidate: XnlRichDocumentSerializableValue;
  copyOrigins?: readonly XnlRichDocumentCopyOrigin[];
}>;

type XnlRichDocumentLocatedIdentity = Readonly<{
  nodeId: XnlRichDocumentDomainNodeId;
  path: XnlRichDocumentPath;
}>;

export type XnlRichDocumentIdentityChange =
  | XnlRichDocumentLocatedIdentity & Readonly<{
      classification: 'unchanged' | 'update' | 'new' | 'delete';
    }>
  | Readonly<{
      classification: 'copy';
      nodeId: XnlRichDocumentDomainNodeId;
      sourceNodeId: XnlRichDocumentDomainNodeId;
      path: XnlRichDocumentPath;
    }>
  | Readonly<{
      classification: 'move';
      nodeId: XnlRichDocumentDomainNodeId;
      fromPath: XnlRichDocumentPath;
      toPath: XnlRichDocumentPath;
      payloadChanged: boolean;
    }>
  | Readonly<{
      classification: 'replacement';
      path: XnlRichDocumentPath;
      deletedNodeId: XnlRichDocumentDomainNodeId;
      addedNodeId: XnlRichDocumentDomainNodeId;
      operations: readonly ['delete', 'add'];
      ordinaryIdUpdate: false;
    }>;

export type XnlRichDocumentIdentityClassificationResult =
  | Readonly<{
      status: 'classified';
      accepted: XnlRichDocument;
      candidate: XnlRichDocument;
      changes: readonly XnlRichDocumentIdentityChange[];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]];
    }>;

export type XnlRichDocumentIdentityClassificationProcessor = XnlRichDocumentProcessor<
  XnlRichDocumentLogicRuntime,
  XnlRichDocumentIdentityClassificationInput,
  XnlRichDocumentLogicConfig,
  XnlRichDocumentIdentityClassificationResult
>;

export type XnlRichDocumentOccurrenceAddressInput = Readonly<{
  nodeId: XnlRichDocumentDomainNodeId;
  role: string;
  roleCardinality: 'single' | 'multiple';
}>;

export type XnlRichDocumentOccurrenceAddressResult =
  | Readonly<{
      status: 'derived';
      nodeId: XnlRichDocumentDomainNodeId;
      role: string;
      xId: XnlRichDocumentOccurrenceXId;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]];
    }>;

export type XnlRichDocumentOccurrenceAddressProcessor = XnlRichDocumentProcessor<
  XnlRichDocumentLogicRuntime,
  XnlRichDocumentOccurrenceAddressInput,
  XnlRichDocumentLogicConfig,
  XnlRichDocumentOccurrenceAddressResult
>;
