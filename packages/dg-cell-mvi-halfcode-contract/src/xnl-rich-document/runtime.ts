import type {
  XnlRichDocumentDiagnostic,
  XnlRichDocumentIdentityAllocatorDiagnostic,
  XnlRichDocumentIdentityAllocatorCollisionDiagnostic,
  XnlRichDocumentIdentityAllocatorFailureDiagnostic,
} from './diagnostics';
import type { XnlRichDocumentDomainNodeId } from './identity';
import type { XnlRichDocumentPersistentNodeKind } from './model';
import type { XnlRichDocumentSerializableRecord } from './serializable';

export type XnlRichDocumentProcessor<
  TRuntime = Readonly<Record<string, never>>,
  TInput = Readonly<Record<string, never>>,
  TConfig = Readonly<Record<string, never>>,
  TOutput = void,
> = (
  runtime: TRuntime,
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

export type XnlRichDocumentIdentityAllocationReason = 'new' | 'copy';

type XnlRichDocumentIdentityAllocationRequestBase = Readonly<{
  kind: 'xnl-rich-document-identity-allocation-request';
  requestId: string;
  nodeKind: XnlRichDocumentPersistentNodeKind;
  reservedNodeIds: readonly XnlRichDocumentDomainNodeId[];
  provenance?: XnlRichDocumentSerializableRecord;
}>;

export type XnlRichDocumentIdentityAllocationRequest =
  | XnlRichDocumentIdentityAllocationRequestBase & Readonly<{
      reason: 'new';
      sourceNodeId?: never;
    }>
  | XnlRichDocumentIdentityAllocationRequestBase & Readonly<{
      reason: 'copy';
      sourceNodeId: XnlRichDocumentDomainNodeId;
    }>;

export type XnlRichDocumentIdentityFreshness = 'fresh' | 'collision' | 'unverified';

export type XnlRichDocumentIdentityAllocationResult =
  | Readonly<{
      status: 'allocated';
      requestId: string;
      nodeId: XnlRichDocumentDomainNodeId;
      freshness: 'fresh';
      diagnostics?: readonly XnlRichDocumentDiagnostic[];
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      freshness: 'collision';
      diagnostics: readonly [
        XnlRichDocumentIdentityAllocatorCollisionDiagnostic,
        ...XnlRichDocumentIdentityAllocatorDiagnostic[],
      ];
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      freshness: 'unverified';
      diagnostics: readonly [
        XnlRichDocumentIdentityAllocatorFailureDiagnostic,
        ...XnlRichDocumentIdentityAllocatorDiagnostic[],
      ];
    }>;

export type XnlRichDocumentIdentityAllocatorConfig = Readonly<{
  collisionPolicy: 'reject';
}>;

export type XnlRichDocumentIdentityAllocator<
  TRuntime = Readonly<Record<string, never>>,
> = XnlRichDocumentProcessor<
  TRuntime,
  XnlRichDocumentIdentityAllocationRequest,
  XnlRichDocumentIdentityAllocatorConfig,
  XnlRichDocumentIdentityAllocationResult
>;
