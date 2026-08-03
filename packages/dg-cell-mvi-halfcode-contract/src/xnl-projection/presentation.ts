import type { XnlProjectionDomainPath } from './domain';
import type { XnlProjectionSerializableRecord } from './serializable';

export interface XnlProjectionPresenterRef {
  id: string;
  options?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPresentationRuleMatch {
  path?: XnlProjectionDomainPath;
  nodeId?: string;
  tag?: string;
  classification?: string;
  role?: string;
  sourceKind?: string;
}

export interface XnlProjectionPresentationRule {
  id: string;
  match: XnlProjectionPresentationRuleMatch;
  presenter?: XnlProjectionPresenterRef;
  visible?: boolean;
  data?: XnlProjectionSerializableRecord;
  metadata?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPresentation {
  kind: 'xnl-projection-presentation';
  id: string;
  rules: readonly XnlProjectionPresentationRule[];
  metadata?: XnlProjectionSerializableRecord;
}

