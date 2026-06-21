import type { HalfcodeDocument } from './document';
import type { ArtifactMutation, ArtifactRef, DocumentMutation } from './ports';

export type AuthoringCommand =
  | { kind: 'load-artifact'; ref: ArtifactRef }
  | { kind: 'save-artifact'; ref: ArtifactRef }
  | { kind: 'apply-document-mutation'; mutation: DocumentMutation }
  | { kind: 'apply-artifact-mutation'; mutation: ArtifactMutation }
  | { kind: 'replace-document'; document: HalfcodeDocument };

export interface AuthoringCommandResult {
  document: HalfcodeDocument;
  mutation?: DocumentMutation | ArtifactMutation;
  affectedMaterialIds?: string[];
  affectedStateModelIds?: string[];
}

export interface PreviewCompileRequest {
  document: HalfcodeDocument;
  mutation?: DocumentMutation | ArtifactMutation;
}
