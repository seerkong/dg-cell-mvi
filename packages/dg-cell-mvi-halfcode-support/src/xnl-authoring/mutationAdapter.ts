import type {
  XnlAuthoringDiagnostic,
  XnlAuthoringMetadata,
  XnlAuthoringMetadataValue,
  XnlAuthoringMutationPort,
  XnlAuthoringRuntime,
  XnlAuthoringSerializableRecord,
  XnlAuthoringSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  diffNodes,
  dryRunMutations,
  parsePath,
  type PathItem,
  type XnlMutation,
  type XnlMutationDiagnostic,
  type XnlNode,
  type XnlPath,
} from 'xnl-core';

export type XnlCoreAuthoringPath = string | readonly PathItem[];

export type XnlCoreAuthoringMutation = {
  readonly type: XnlMutation['type'];
  readonly path: XnlCoreAuthoringPath;
  readonly pathBefore?: XnlCoreAuthoringPath;
  readonly valueBefore?: XnlNode;
  readonly valueAfter?: XnlNode;
  readonly metadata?: XnlAuthoringSerializableRecord;
  readonly destinationKey?: string;
  readonly targetUniqueName?: string;
  readonly parentUniqueNameBefore?: string;
  readonly parentUniqueNameAfter?: string;
};

type XnlCoreAuthoringRuntime<TCommand> = XnlAuthoringRuntime<XnlNode, TCommand, XnlCoreAuthoringMutation>;

export type XnlCoreAuthoringMutationPort<TCommand = XnlAuthoringSerializableValue> =
  XnlAuthoringMutationPort<XnlNode, XnlCoreAuthoringMutation, XnlCoreAuthoringRuntime<TCommand>>;

export function createXnlCoreAuthoringMutationPort<
  TCommand = XnlAuthoringSerializableValue,
>(): XnlCoreAuthoringMutationPort<TCommand> {
  return {
    diff: (_runtime, input) => {
      const accepted = clone(input.acceptedDocument) as XnlNode;
      const candidate = clone(input.candidateDocument) as XnlNode;
      return diffNodes(accepted, candidate, [], { metadataIdMode: 'identity' })
        .map(toAuthoringMutation);
    },
    dryRun: (_runtime, input) => {
      const accepted = clone(input.acceptedDocument) as XnlNode;
      const mutations = input.mutations.map(toCoreMutation);
      const result = dryRunMutations(accepted, mutations, {
        metadataIdMode: 'identity',
        verifyValueBefore: true,
        identityPolicy: 'allow-missing',
      });

      if (result.status === 'applied') {
        return {
          status: 'applied',
          document: clone(result.value) as XnlNode,
          affectedIdentities: collectAffectedIdentities(input.mutations),
        };
      }

      return {
        status: 'rejected',
        diagnostics: result.diagnostics.length > 0
          ? result.diagnostics.map(mapXnlMutationDiagnostic)
          : [{
              severity: 'error',
              code: 'XNL_CORE_DRY_RUN_REJECTED',
              message: 'xnl-core rejected the mutation batch without diagnostics',
              details: { source: 'xnl-core' },
            }],
      };
    },
  };
}

export function mapXnlMutationDiagnostic(
  diagnostic: XnlMutationDiagnostic,
): XnlAuthoringDiagnostic {
  const details: Record<string, XnlAuthoringMetadataValue> = {
    source: 'xnl-core',
    xnlCode: diagnostic.code,
  };
  if (diagnostic.identity !== undefined) details.identity = diagnostic.identity;
  if (diagnostic.mutationIndex !== undefined) details.mutationIndex = diagnostic.mutationIndex;
  if (diagnostic.path !== undefined) details.rawPath = pathToRawString(diagnostic.path);

  const path = diagnostic.path === undefined ? [] : pathToContractPath(diagnostic.path);
  return {
    severity: 'error',
    code: diagnostic.code,
    message: diagnostic.message,
    ...(path.length > 0 ? { path } : {}),
    details: details as XnlAuthoringMetadata,
  };
}

function collectAffectedIdentities(mutations: readonly XnlCoreAuthoringMutation[]): readonly string[] {
  const identities = new Set<string>();
  for (const mutation of mutations) {
    addIdentity(identities, mutation.targetUniqueName);
    addIdentity(identities, mutation.parentUniqueNameBefore);
    addIdentity(identities, mutation.parentUniqueNameAfter);
    collectPathIdentities(identities, mutation.path);
    if (mutation.pathBefore !== undefined) collectPathIdentities(identities, mutation.pathBefore);
  }
  return [...identities].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function addIdentity(identities: Set<string>, identity: string | undefined): void {
  const normalized = normalizeIdentity(identity);
  if (normalized) identities.add(normalized);
}

function collectPathIdentities(identities: Set<string>, path: XnlCoreAuthoringPath): void {
  for (const item of safeParsePath(path)) {
    if (item.type !== 'MetadataSelector' && item.type !== 'UniqueName') continue;
    addIdentity(identities, item.value);
  }
}

function normalizeIdentity(identity: string | undefined): string | undefined {
  if (!identity) return undefined;
  return identity.match(/^<id='(.+)'>$/)?.[1] ?? identity;
}

function pathToContractPath(path: string | XnlPath): readonly (string | number)[] {
  return safeParsePath(path).map((item) => {
    if (item.type === 'ListIndex') {
      const index = Number(item.value);
      return Number.isSafeInteger(index) ? index : item.value;
    }
    return item.value;
  });
}

function pathToRawString(path: string | XnlPath): string {
  return typeof path === 'string'
    ? path
    : path.map((item) => `${item.type}:${item.value}`).join('/');
}

function safeParsePath(path: XnlCoreAuthoringPath): PathItem[] {
  if (typeof path !== 'string') return [...path];
  try {
    return parsePath(path);
  } catch {
    return [];
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toAuthoringMutation(mutation: XnlMutation): XnlCoreAuthoringMutation {
  let authoringMutation: XnlCoreAuthoringMutation = {
    type: mutation.type,
    path: immutablePath(mutation.path),
  };
  if (mutation.pathBefore !== undefined) {
    authoringMutation = { ...authoringMutation, pathBefore: immutablePath(mutation.pathBefore) };
  }
  if (mutation.valueBefore !== undefined) {
    authoringMutation = { ...authoringMutation, valueBefore: clone(mutation.valueBefore) };
  }
  if (mutation.valueAfter !== undefined) {
    authoringMutation = { ...authoringMutation, valueAfter: clone(mutation.valueAfter) };
  }
  if (mutation.metadata !== undefined) {
    authoringMutation = { ...authoringMutation, metadata: normalizeMetadata(mutation.metadata) };
  }
  if (mutation.destinationKey !== undefined) {
    authoringMutation = { ...authoringMutation, destinationKey: mutation.destinationKey };
  }
  if (mutation.targetUniqueName !== undefined) {
    authoringMutation = { ...authoringMutation, targetUniqueName: mutation.targetUniqueName };
  }
  if (mutation.parentUniqueNameBefore !== undefined) {
    authoringMutation = { ...authoringMutation, parentUniqueNameBefore: mutation.parentUniqueNameBefore };
  }
  if (mutation.parentUniqueNameAfter !== undefined) {
    authoringMutation = { ...authoringMutation, parentUniqueNameAfter: mutation.parentUniqueNameAfter };
  }
  return authoringMutation;
}

function toCoreMutation(mutation: XnlCoreAuthoringMutation): XnlMutation {
  let coreMutation: XnlMutation = {
    type: mutation.type,
    path: mutablePath(mutation.path),
  };
  if (mutation.pathBefore !== undefined) {
    coreMutation = { ...coreMutation, pathBefore: mutablePath(mutation.pathBefore) };
  }
  if (mutation.valueBefore !== undefined) {
    coreMutation = { ...coreMutation, valueBefore: clone(mutation.valueBefore) };
  }
  if (mutation.valueAfter !== undefined) {
    coreMutation = { ...coreMutation, valueAfter: clone(mutation.valueAfter) };
  }
  if (mutation.metadata !== undefined) {
    coreMutation = { ...coreMutation, metadata: clone(mutation.metadata) };
  }
  if (mutation.destinationKey !== undefined) {
    coreMutation = { ...coreMutation, destinationKey: mutation.destinationKey };
  }
  if (mutation.targetUniqueName !== undefined) {
    coreMutation = { ...coreMutation, targetUniqueName: mutation.targetUniqueName };
  }
  if (mutation.parentUniqueNameBefore !== undefined) {
    coreMutation = { ...coreMutation, parentUniqueNameBefore: mutation.parentUniqueNameBefore };
  }
  if (mutation.parentUniqueNameAfter !== undefined) {
    coreMutation = { ...coreMutation, parentUniqueNameAfter: mutation.parentUniqueNameAfter };
  }
  return coreMutation;
}

function immutablePath(path: string | XnlPath): XnlCoreAuthoringPath {
  return typeof path === 'string' ? path : path.map((item) => ({ ...item }));
}

function mutablePath(path: XnlCoreAuthoringPath): string | XnlPath {
  return typeof path === 'string' ? path : path.map((item) => ({ ...item }));
}

function normalizeMetadata(metadata: Record<string, unknown>): XnlAuthoringSerializableRecord {
  const normalized: Record<string, XnlAuthoringSerializableValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const serializable = toSerializable(value);
    if (serializable !== undefined) normalized[key] = serializable;
  }
  return normalized as XnlAuthoringSerializableRecord;
}

function toSerializable(value: unknown): XnlAuthoringSerializableValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(toSerializable);
    return values.every((item): item is XnlAuthoringSerializableValue => item !== undefined)
      ? values
      : undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record: Record<string, XnlAuthoringSerializableValue> = {};
  for (const [key, child] of Object.entries(value)) {
    const serializable = toSerializable(child);
    if (serializable !== undefined) record[key] = serializable;
  }
  return record as XnlAuthoringSerializableRecord;
}
