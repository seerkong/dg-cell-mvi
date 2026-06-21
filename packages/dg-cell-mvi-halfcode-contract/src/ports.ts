import type { HalfcodeDocument } from './document';

export type ArtifactId = string;

export interface ArtifactRef {
  id: ArtifactId;
  version?: string;
  uri?: string;
}

export interface ArtifactSnapshot<TDocument = HalfcodeDocument> {
  ref: ArtifactRef;
  document: TDocument;
  revision: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactDiff {
  fromRevision?: string;
  toRevision?: string;
  changes: ArtifactMutation[];
}

export type ArtifactMutation =
  | { kind: 'replace-document'; document: HalfcodeDocument }
  | { kind: 'document-mutation'; mutation: DocumentMutation };

export type DocumentMutation =
  | { kind: 'set-product-settings'; path: string; value: unknown }
  | { kind: 'upsert-material'; material: HalfcodeDocument['materials'][number] }
  | { kind: 'remove-material'; materialId: string }
  | { kind: 'upsert-state-field'; stateModelId: string; field: NonNullable<HalfcodeDocument['stateModels']>[number]['fields'][number] }
  | { kind: 'set-state-initial-value'; stateModelId: string; path: string; value: unknown };

export interface ArtifactPort<TDocument = HalfcodeDocument> {
  load(ref: ArtifactRef): Promise<ArtifactSnapshot<TDocument>>;
  save(snapshot: ArtifactSnapshot<TDocument>): Promise<ArtifactSnapshot<TDocument>>;
  diff?(from: ArtifactRef, to: ArtifactRef): Promise<ArtifactDiff>;
  mutate?(ref: ArtifactRef, mutation: ArtifactMutation): Promise<ArtifactSnapshot<TDocument>>;
  list?(query?: ArtifactListQuery): Promise<ArtifactRef[]>;
  import?(source: unknown): Promise<ArtifactSnapshot<TDocument>>;
}

export interface ArtifactListQuery {
  productId?: string;
  moduleId?: string;
  tag?: string;
}
