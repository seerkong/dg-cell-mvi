import type { XnlRichDocumentDomainNodeId } from './identity';
import type { XnlRichDocumentSerializableRecord } from './serializable';

export const XNL_RICH_DOCUMENT_DIAGNOSTIC_CODES = [
  'DUPLICATE_DOMAIN_NODE_ID',
  'MISSING_DOMAIN_NODE_ID',
  'UNSUPPORTED_CONSTRUCT',
  'LOSSY_CONSTRUCT',
  'UNSUPPORTED_IDENTITY_REPLACEMENT',
  'INVALID_IDENTITY_PROVENANCE',
  'MISSING_OCCURRENCE_ROLE',
  'IDENTITY_ALLOCATOR_COLLISION',
  'IDENTITY_ALLOCATOR_NOT_FRESH',
  'IDENTITY_ALLOCATION_FAILED',
] as const;

export type XnlRichDocumentDiagnosticCode =
  (typeof XNL_RICH_DOCUMENT_DIAGNOSTIC_CODES)[number];

export type XnlRichDocumentDiagnosticSeverity = 'info' | 'warning' | 'error';

export type XnlRichDocumentDiagnostic = Readonly<{
  severity: XnlRichDocumentDiagnosticSeverity;
  code: XnlRichDocumentDiagnosticCode;
  message: string;
  path?: readonly (string | number)[];
  nodeId?: XnlRichDocumentDomainNodeId;
  details?: XnlRichDocumentSerializableRecord;
}>;

export type XnlRichDocumentIdentityAllocatorCollisionDiagnostic = Readonly<
  Omit<XnlRichDocumentDiagnostic, 'code'> & {
    code: 'IDENTITY_ALLOCATOR_COLLISION';
    nodeId: XnlRichDocumentDomainNodeId;
  }
>;

export type XnlRichDocumentIdentityAllocatorFailureDiagnostic = Readonly<
  Omit<XnlRichDocumentDiagnostic, 'code'> & {
    code: 'IDENTITY_ALLOCATOR_NOT_FRESH' | 'IDENTITY_ALLOCATION_FAILED';
  }
>;

export type XnlRichDocumentIdentityAllocatorDiagnostic =
  | XnlRichDocumentIdentityAllocatorCollisionDiagnostic
  | XnlRichDocumentIdentityAllocatorFailureDiagnostic;
