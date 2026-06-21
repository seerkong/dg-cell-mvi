import type {
  ArtifactMutation,
  ArtifactPort,
  ArtifactRef,
  ArtifactSnapshot,
  HalfcodeDocument,
} from 'dg-cell-mvi-halfcode-contract';

export interface ArtifactMutationApplier {
  (document: HalfcodeDocument, mutation: ArtifactMutation): HalfcodeDocument;
}

export interface CreateMemoryArtifactPortOptions {
  snapshots?: ArtifactSnapshot<HalfcodeDocument>[];
  applyMutation?: ArtifactMutationApplier;
  now?: () => string;
}

export interface BrowserArtifactStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CreateBrowserArtifactPortOptions {
  prefix?: string;
  applyMutation?: ArtifactMutationApplier;
  now?: () => string;
}

function artifactKey(ref: ArtifactRef): string {
  return ref.uri || `${ref.id}@${ref.version || 'latest'}`;
}

function nextRevision(snapshot: ArtifactSnapshot<unknown> | undefined): string {
  const current = Number(snapshot?.revision || 0);
  return Number.isFinite(current) ? String(current + 1) : '1';
}

function updateSnapshot(
  snapshot: ArtifactSnapshot<HalfcodeDocument>,
  now: () => string,
): ArtifactSnapshot<HalfcodeDocument> {
  return {
    ...snapshot,
    revision: nextRevision(snapshot),
    updatedAt: now(),
  };
}

function applyMutationOrThrow(
  snapshot: ArtifactSnapshot<HalfcodeDocument>,
  mutation: ArtifactMutation,
  applyMutation: ArtifactMutationApplier | undefined,
): ArtifactSnapshot<HalfcodeDocument> {
  if (!applyMutation) {
    throw new Error('Artifact mutation requires an injected mutation applier');
  }
  return {
    ...snapshot,
    document: applyMutation(snapshot.document, mutation),
  };
}

export function createMemoryArtifactPort(
  options: CreateMemoryArtifactPortOptions = {},
): ArtifactPort<HalfcodeDocument> {
  const store = new Map<string, ArtifactSnapshot<HalfcodeDocument>>();
  const now = options.now ?? (() => new Date().toISOString());
  for (const snapshot of options.snapshots ?? []) store.set(artifactKey(snapshot.ref), snapshot);

  return {
    async load(ref) {
      const snapshot = store.get(artifactKey(ref));
      if (!snapshot) throw new Error(`Artifact "${artifactKey(ref)}" not found`);
      return snapshot;
    },
    async save(snapshot) {
      const saved = updateSnapshot(snapshot, now);
      store.set(artifactKey(saved.ref), saved);
      return saved;
    },
    async diff(from, to) {
      const fromSnapshot = store.get(artifactKey(from));
      const toSnapshot = store.get(artifactKey(to));
      return {
        fromRevision: fromSnapshot?.revision,
        toRevision: toSnapshot?.revision,
        changes: [],
      };
    },
    async mutate(ref, mutation) {
      const snapshot = store.get(artifactKey(ref));
      if (!snapshot) throw new Error(`Artifact "${artifactKey(ref)}" not found`);
      const next = updateSnapshot(applyMutationOrThrow(snapshot, mutation, options.applyMutation), now);
      store.set(artifactKey(next.ref), next);
      return next;
    },
    async list(query) {
      return [...store.values()]
        .filter((snapshot) => !query?.productId || snapshot.document.product?.id === query.productId)
        .filter((snapshot) => !query?.tag || snapshot.document.product?.tags?.includes(query.tag))
        .map((snapshot) => snapshot.ref);
    },
    async import(source) {
      const document = source as HalfcodeDocument;
      const snapshot = updateSnapshot({
        ref: { id: `imported-${store.size + 1}` },
        document,
        revision: '0',
      }, now);
      store.set(artifactKey(snapshot.ref), snapshot);
      return snapshot;
    },
  };
}

export function createBrowserArtifactPort(
  storage: BrowserArtifactStorageLike,
  options: CreateBrowserArtifactPortOptions = {},
): ArtifactPort<HalfcodeDocument> {
  const prefix = options.prefix ?? 'dg-cell-mvi-halfcode:artifact:';
  const now = options.now ?? (() => new Date().toISOString());
  const keyFor = (ref: ArtifactRef) => `${prefix}${artifactKey(ref)}`;

  return {
    async load(ref) {
      const raw = storage.getItem(keyFor(ref));
      if (!raw) throw new Error(`Artifact "${artifactKey(ref)}" not found`);
      return JSON.parse(raw) as ArtifactSnapshot<HalfcodeDocument>;
    },
    async save(snapshot) {
      const saved = updateSnapshot(snapshot, now);
      storage.setItem(keyFor(saved.ref), JSON.stringify(saved));
      return saved;
    },
    async diff(from, to) {
      const fromRaw = storage.getItem(keyFor(from));
      const toRaw = storage.getItem(keyFor(to));
      const fromSnapshot = fromRaw ? JSON.parse(fromRaw) as ArtifactSnapshot<HalfcodeDocument> : undefined;
      const toSnapshot = toRaw ? JSON.parse(toRaw) as ArtifactSnapshot<HalfcodeDocument> : undefined;
      return {
        fromRevision: fromSnapshot?.revision,
        toRevision: toSnapshot?.revision,
        changes: [],
      };
    },
    async mutate(ref, mutation) {
      const current = await this.load(ref);
      const next = updateSnapshot(applyMutationOrThrow(current, mutation, options.applyMutation), now);
      storage.setItem(keyFor(next.ref), JSON.stringify(next));
      return next;
    },
    async list(query) {
      const refs: ArtifactRef[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;
        const snapshot = JSON.parse(raw) as ArtifactSnapshot<HalfcodeDocument>;
        if (query?.productId && snapshot.document.product?.id !== query.productId) continue;
        if (query?.tag && !snapshot.document.product?.tags?.includes(query.tag)) continue;
        refs.push(snapshot.ref);
      }
      return refs;
    },
    async import(source) {
      const document = source as HalfcodeDocument;
      const snapshot = updateSnapshot({
        ref: { id: `imported-${Date.now()}` },
        document,
        revision: '0',
      }, now);
      storage.setItem(keyFor(snapshot.ref), JSON.stringify(snapshot));
      return snapshot;
    },
  };
}
