import type { XnlProjectionDiagnostic } from './diagnostics';
import type { XnlProjectionDomainRef } from './domain';
import type { XnlProjectionPresenterRef } from './presentation';
import type { XnlProjectionSerializableRecord, XnlProjectionSerializableValue } from './serializable';

export interface XnlProjectionClassification {
  id: string;
  traits?: readonly string[];
  facts?: XnlProjectionSerializableRecord;
  diagnostics?: readonly XnlProjectionDiagnostic[];
}

export interface XnlProjectionPlanNode {
  kind?: 'xnl-projection-plan-node';
  id: string;
  domain: XnlProjectionDomainRef;
  classification: XnlProjectionClassification;
  presenter: XnlProjectionPresenterRef;
  facts?: XnlProjectionSerializableRecord;
  data?: XnlProjectionSerializableValue;
  children: readonly XnlProjectionPlanNode[];
  diagnostics?: readonly XnlProjectionDiagnostic[];
  provenance?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPlan {
  kind: 'xnl-projection-plan';
  id: string;
  root: XnlProjectionPlanNode;
  diagnostics?: readonly XnlProjectionDiagnostic[];
  provenance?: XnlProjectionSerializableRecord;
}

