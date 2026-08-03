import type { XnlProjectionSerializableRecord } from './serializable';

export type XnlProjectionDomainPathSegment = string | number;
export type XnlProjectionDomainPath = readonly XnlProjectionDomainPathSegment[];

export interface XnlProjectionDomainRef {
  /** Path inside the authority domain tree. */
  path: XnlProjectionDomainPath;
  /** Stable domain node identity, such as XNL #id. It is not editable payload. */
  nodeId?: string;
  /** Domain node tag/name when the source has one. */
  tag?: string;
  /** Source node family, for structural fallback resolution. */
  sourceKind?: string;
  /** Projection role of this occurrence of the domain node. */
  role?: string;
  /** Optional stable source reference owned by the source adapter. */
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
}

