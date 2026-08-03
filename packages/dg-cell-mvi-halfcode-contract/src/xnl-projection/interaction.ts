import type { XnlProjectionDiagnostic } from './diagnostics';
import type { XnlProjectionDomainPath, XnlProjectionDomainRef } from './domain';
import type { XnlProjectionSerializableRecord, XnlProjectionSerializableValue } from './serializable';

export interface XnlProjectionInteractionTarget {
  planNodeId: string;
  domain?: XnlProjectionDomainRef;
  path?: XnlProjectionDomainPath;
}

export interface XnlProjectionInteraction {
  id?: string;
  type: string;
  target: XnlProjectionInteractionTarget;
  payload?: XnlProjectionSerializableValue;
  provenance?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionDomainCommand {
  type: string;
  target: XnlProjectionDomainRef;
  payload?: XnlProjectionSerializableValue;
  provenance?: XnlProjectionSerializableRecord;
  metadata?: XnlProjectionSerializableRecord;
}

export type XnlProjectionCommandResult =
  | {
      status: 'translated';
      command: XnlProjectionDomainCommand;
      diagnostics?: readonly XnlProjectionDiagnostic[];
    }
  | {
      status: 'rejected';
      diagnostics: readonly XnlProjectionDiagnostic[];
      command?: never;
    }
  | {
      status: 'unsupported';
      diagnostics: readonly XnlProjectionDiagnostic[];
      command?: never;
    };

