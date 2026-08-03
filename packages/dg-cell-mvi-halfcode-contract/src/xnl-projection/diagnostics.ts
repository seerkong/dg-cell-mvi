import type { XnlProjectionDomainPath } from './domain';
import type { XnlProjectionSerializableRecord } from './serializable';

export type XnlProjectionDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface XnlProjectionDiagnostic {
  severity: XnlProjectionDiagnosticSeverity;
  code: string;
  message: string;
  path?: XnlProjectionDomainPath;
  planNodeId?: string;
  details?: XnlProjectionSerializableRecord;
}

