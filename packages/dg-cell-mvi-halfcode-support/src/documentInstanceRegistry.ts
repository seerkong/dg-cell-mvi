import type {
  DocumentAddressDescriptor,
  DocumentInstanceRef,
  DocumentInstanceRegistry,
  DocumentRuntimeDiagnostic,
  SerializableRecord,
  SerializableValue,
} from 'dg-cell-mvi-halfcode-contract';

const DUPLICATE_DOCUMENT_INSTANCE_REF = 'HALFCODE_DOCUMENT_INSTANCE_REF_DUPLICATE';
const DOCUMENT_INSTANCE_REF_DESCRIPTOR_MISMATCH =
  'HALFCODE_DOCUMENT_INSTANCE_REF_DESCRIPTOR_MISMATCH';
const DOCUMENT_INSTANCE_REF_NOT_FOUND = 'HALFCODE_DOCUMENT_INSTANCE_REF_NOT_FOUND';
const DOCUMENT_INSTANCE_OWNER_TOKEN_MISMATCH =
  'HALFCODE_DOCUMENT_INSTANCE_OWNER_TOKEN_MISMATCH';

type RegistryEntry<TTarget> = Readonly<{
  ref: DocumentInstanceRef;
  descriptor: DocumentAddressDescriptor;
  target: TTarget;
}>;

type StoredEntry = RegistryEntry<unknown> & Readonly<{
  ownerToken: string;
}>;

type RegisterResult = ReturnType<DocumentInstanceRegistry['register']>;
type MutationResult = ReturnType<DocumentInstanceRegistry['unregister']>;

function registryError(code: string, message: string): readonly DocumentRuntimeDiagnostic[] {
  return Object.freeze([
    Object.freeze({
      severity: 'error' as const,
      code,
      message,
    }),
  ]);
}

function registryKey(ref: DocumentInstanceRef): string {
  return `${ref.unitInstanceId}\u0000${ref.xId}`;
}

function refsMatch(left: DocumentInstanceRef, right: DocumentInstanceRef): boolean {
  return left.unitInstanceId === right.unitInstanceId &&
    left.projectionRole === right.projectionRole &&
    left.xId === right.xId;
}

function cloneRef(ref: DocumentInstanceRef): DocumentInstanceRef {
  return {
    unitInstanceId: ref.unitInstanceId,
    projectionRole: ref.projectionRole,
    xId: ref.xId,
  };
}

function cloneSerializableValue(value: SerializableValue): SerializableValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSerializableValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const clone: SerializableRecord = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneSerializableValue(child);
    }
    return clone;
  }
  return value;
}

function freezeSerializableValue<TValue extends SerializableValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeSerializableValue(item);
    }
    return Object.freeze(value) as TValue;
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freezeSerializableValue(child);
    }
    return Object.freeze(value) as TValue;
  }
  return value;
}

function cloneDescriptor(descriptor: DocumentAddressDescriptor): DocumentAddressDescriptor {
  const cloned: DocumentAddressDescriptor = {
    projectionRole: descriptor.projectionRole,
    xId: descriptor.xId,
    documentNodeId: descriptor.documentNodeId,
    unitFqn: descriptor.unitFqn,
    scopeId: descriptor.scopeId,
    ...(descriptor.metadata === undefined
      ? {}
      : { metadata: cloneSerializableValue(descriptor.metadata) as SerializableRecord }),
  };
  return cloned;
}

function frozenRef(ref: DocumentInstanceRef): DocumentInstanceRef {
  return Object.freeze(cloneRef(ref));
}

function frozenDescriptor(descriptor: DocumentAddressDescriptor): DocumentAddressDescriptor {
  const cloned = cloneDescriptor(descriptor);
  if (cloned.metadata !== undefined) {
    freezeSerializableValue(cloned.metadata);
  }
  return Object.freeze(cloned);
}

function snapshot<TTarget>(entry: RegistryEntry<TTarget>): RegistryEntry<TTarget> {
  return Object.freeze({
    ref: frozenRef(entry.ref),
    descriptor: frozenDescriptor(entry.descriptor),
    target: entry.target,
  });
}

export function createDocumentInstanceRegistry(): DocumentInstanceRegistry {
  const entries = new Map<string, StoredEntry>();
  let tokenSequence = 0;

  function nextOwnerToken(ref: DocumentInstanceRef): string {
    tokenSequence += 1;
    return `document-instance:${ref.unitInstanceId}:${ref.projectionRole}:${ref.xId}:${tokenSequence}`;
  }

  const registry: DocumentInstanceRegistry = {
    register<TTarget>(input: {
      readonly ref: DocumentInstanceRef;
      readonly descriptor: DocumentAddressDescriptor;
      readonly target: TTarget;
    }): RegisterResult {
      if (
        input.ref.projectionRole !== input.descriptor.projectionRole ||
        input.ref.xId !== input.descriptor.xId
      ) {
        return {
          ok: false,
          diagnostics: registryError(
            DOCUMENT_INSTANCE_REF_DESCRIPTOR_MISMATCH,
            `Document instance descriptor does not match ref: ${input.ref.unitInstanceId}/${input.ref.projectionRole}/${input.ref.xId}.`,
          ),
        };
      }

      const key = registryKey(input.ref);
      if (entries.has(key)) {
        return {
          ok: false,
          diagnostics: registryError(
            DUPLICATE_DOCUMENT_INSTANCE_REF,
            `Document instance ref is already registered: ${input.ref.unitInstanceId}/${input.ref.projectionRole}/${input.ref.xId}.`,
          ),
        };
      }

      const ownerToken = nextOwnerToken(input.ref);
      entries.set(key, {
        ref: cloneRef(input.ref),
        descriptor: cloneDescriptor(input.descriptor),
        target: input.target,
        ownerToken,
      });

      return { ok: true, ownerToken };
    },

    resolve<TTarget>(ref: DocumentInstanceRef) {
      const entry = entries.get(registryKey(ref));
      if (entry === undefined || !refsMatch(entry.ref, ref)) {
        return {
          ok: false,
          diagnostics: registryError(
            DOCUMENT_INSTANCE_REF_NOT_FOUND,
            `Document instance ref is not registered: ${ref.unitInstanceId}/${ref.projectionRole}/${ref.xId}.`,
          ),
        };
      }

      return {
        ok: true,
        value: snapshot({
          ref: entry.ref,
          descriptor: entry.descriptor,
          target: entry.target as TTarget,
        }),
      };
    },

    list(unitInstanceId?: string) {
      const result: RegistryEntry<unknown>[] = [];
      for (const entry of entries.values()) {
        if (unitInstanceId === undefined || entry.ref.unitInstanceId === unitInstanceId) {
          result.push(snapshot(entry));
        }
      }
      return Object.freeze(result);
    },

    unregister(input: {
      readonly ref: DocumentInstanceRef;
      readonly ownerToken: string;
    }): MutationResult {
      const key = registryKey(input.ref);
      const entry = entries.get(key);
      if (entry === undefined || !refsMatch(entry.ref, input.ref)) {
        const { unitInstanceId, projectionRole, xId } = input.ref;
        return {
          ok: false,
          diagnostics: registryError(
            DOCUMENT_INSTANCE_REF_NOT_FOUND,
            `Document instance ref is not registered: ${unitInstanceId}/${projectionRole}/${xId}.`,
          ),
        };
      }
      if (entry.ownerToken !== input.ownerToken) {
        const { unitInstanceId, projectionRole, xId } = input.ref;
        return {
          ok: false,
          diagnostics: registryError(
            DOCUMENT_INSTANCE_OWNER_TOKEN_MISMATCH,
            `Document instance owner token does not match: ${unitInstanceId}/${projectionRole}/${xId}.`,
          ),
        };
      }

      entries.delete(key);
      return { ok: true };
    },

    disposeNamespace(unitInstanceId: string): MutationResult {
      for (const [key, entry] of entries) {
        if (entry.ref.unitInstanceId === unitInstanceId) {
          entries.delete(key);
        }
      }
      return { ok: true };
    },
  };
  return Object.freeze(registry);
}
