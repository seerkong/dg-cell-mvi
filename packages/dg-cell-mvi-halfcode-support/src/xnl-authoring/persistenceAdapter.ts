import {
  validateXnlAuthoringDocument,
  validateXnlAuthoringLiveRevision,
  validateXnlAuthoringPersistenceReadResult,
  validateXnlAuthoringPersistenceResult,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringPersistedRevision,
  type XnlAuthoringPersistencePort,
  type XnlAuthoringPersistenceReadResult,
  type XnlAuthoringPersistenceResult,
} from 'dg-cell-mvi-halfcode-contract';
import type { DataElementNode } from 'xnl-core';
import type {
  RevisionedVfsAuthority,
  RevisionedVfsCompareAndSwapResult,
  RevisionedVfsSnapshot,
  VfsRevision,
} from 'xnl-vfs/revisioned-persistence';
import { freezePublic } from './publicFacts';

type PersistencePort = XnlAuthoringPersistencePort<DataElementNode, object>;

export function createXnlVfsAuthoringPersistencePort(
  authority: RevisionedVfsAuthority,
): PersistencePort {
  const capabilities = captureAuthority(authority);
  let authorityId: string | undefined;

  const read: PersistencePort['read'] = async () => {
    try {
      const loaded = mapReadResult(await capabilities.read());
      authorityId = bindAuthorityId(authorityId, loaded.persistedRevision.authorityId);
      return loaded;
    } catch {
      return readFailure();
    }
  };

  const persist: PersistencePort['persist'] = async (_runtime, input) => {
    const captured = capturePersistInput(input);
    if (
      authorityId !== undefined
      && captured.expectedPersistedRevision.authorityId !== authorityId
    ) {
      return persistenceFailure(captured.expectedPersistedRevision);
    }
    try {
      const rawResult = await capabilities.compareAndSwap({
        expectedRevision: toVfsRevision(captured.expectedPersistedRevision),
        snapshot: captured.document,
      });
      const mapped = mapPersistResult(rawResult, captured.expectedPersistedRevision);
      authorityId = bindAuthorityId(authorityId, captured.expectedPersistedRevision.authorityId);
      return mapped;
    } catch {
      return persistenceFailure(captured.expectedPersistedRevision);
    }
  };

  return Object.freeze({ read, persist });
}

function captureAuthority(authority: RevisionedVfsAuthority): {
  readonly read: RevisionedVfsAuthority['read'];
  readonly compareAndSwap: RevisionedVfsAuthority['compareAndSwap'];
} {
  if (authority === null || typeof authority !== 'object') {
    throw new TypeError('Revisioned VFS authority must be an object.');
  }
  const read = authority.read;
  const compareAndSwap = authority.compareAndSwap;
  if (typeof read !== 'function' || typeof compareAndSwap !== 'function') {
    throw new TypeError('Revisioned VFS authority must expose read and compareAndSwap methods.');
  }
  return Object.freeze({
    read: () => read.call(authority),
    compareAndSwap: (input) => compareAndSwap.call(authority, input),
  });
}

function capturePersistInput(
  input: Parameters<PersistencePort['persist']>[1],
): {
  readonly document: DataElementNode;
  readonly expectedPersistedRevision: XnlAuthoringPersistedRevision;
} {
  const record = requireRecord(input, 'persist input');
  requireExactKeys(
    record,
    ['document', 'expectedPersistedRevision', 'liveRevision'],
    'persist input',
  );
  const document = ownValue(record, 'document', 'persist input');
  const expectedPersistedRevision = ownValue(
    record,
    'expectedPersistedRevision',
    'persist input',
  );
  const liveRevision = ownValue(record, 'liveRevision', 'persist input');

  requireValid(validateXnlAuthoringDocument(document));
  requireValid(validateXnlAuthoringPersistenceResult({
    status: 'unchanged',
    persistedRevision: expectedPersistedRevision,
  }));
  requireValid(validateXnlAuthoringLiveRevision(liveRevision));

  return freezePublic({
    document: document as DataElementNode,
    expectedPersistedRevision: expectedPersistedRevision as XnlAuthoringPersistedRevision,
  });
}

function mapReadResult(raw: RevisionedVfsSnapshot): Extract<
  XnlAuthoringPersistenceReadResult<DataElementNode>,
  { readonly status: 'loaded' }
> {
  const record = requireRecord(raw, 'read result');
  requireExactKeys(record, ['revision', 'snapshot'], 'read result');
  const result = {
    status: 'loaded',
    document: ownValue(record, 'snapshot', 'read result') as DataElementNode,
    persistedRevision: mapRevision(ownValue(record, 'revision', 'read result')),
  } as const;
  requireValid(validateXnlAuthoringPersistenceReadResult(result));
  return freezePublic(result);
}

function mapPersistResult(
  raw: RevisionedVfsCompareAndSwapResult,
  expected: XnlAuthoringPersistedRevision,
): XnlAuthoringPersistenceResult {
  const record = requireRecord(raw, 'compareAndSwap result');
  const status = ownValue(record, 'status', 'compareAndSwap result');
  let result: XnlAuthoringPersistenceResult;

  switch (status) {
    case 'applied': {
      requireExactKeys(record, ['status', 'receipt'], 'applied compareAndSwap result');
      const receipt = requireRecord(
        ownValue(record, 'receipt', 'applied compareAndSwap result'),
        'applied receipt',
      );
      requireExactKeys(
        receipt,
        ['previousRevision', 'revision', 'persistedAt', 'durability'],
        'applied receipt',
      );
      const previousRevision = mapRevision(ownValue(receipt, 'previousRevision', 'applied receipt'));
      const currentRevision = mapRevision(ownValue(receipt, 'revision', 'applied receipt'));
      requireSameRevision(previousRevision, expected);
      requireSameAuthority(currentRevision, expected);
      if (currentRevision.value === expected.value) throw new TypeError('Applied revision did not advance.');
      result = {
        status: 'applied',
        persistedRevision: currentRevision,
        receipt: {
          kind: 'xnl-authoring-persistence-receipt',
          previousRevision,
          currentRevision,
          persistedAt: ownValue(receipt, 'persistedAt', 'applied receipt') as string,
          durability: ownValue(receipt, 'durability', 'applied receipt') as 'memory' | 'workspace',
        },
      };
      break;
    }
    case 'unchanged': {
      requireExactKeys(record, ['status', 'revision'], 'unchanged compareAndSwap result');
      const revision = mapRevision(ownValue(record, 'revision', 'unchanged compareAndSwap result'));
      requireSameRevision(revision, expected);
      result = { status: 'unchanged', persistedRevision: revision };
      break;
    }
    case 'conflict': {
      requireExactKeys(record, ['status', 'actualRevision'], 'conflict compareAndSwap result');
      const actualRevision = mapRevision(ownValue(record, 'actualRevision', 'conflict compareAndSwap result'));
      requireSameAuthority(actualRevision, expected);
      if (actualRevision.value === expected.value) throw new TypeError('Conflict revision did not advance.');
      result = {
        status: 'conflict',
        expectedPersistedRevision: expected,
        actualPersistedRevision: actualRevision,
      };
      break;
    }
    case 'failed': {
      requireExactKeys(
        record,
        ['status', 'actualRevision', 'diagnostics'],
        'failed compareAndSwap result',
      );
      requireSameRevision(
        mapRevision(ownValue(record, 'actualRevision', 'failed compareAndSwap result')),
        expected,
      );
      result = {
        status: 'failed',
        expectedPersistedRevision: expected,
        diagnostics: mapDiagnostics(ownValue(record, 'diagnostics', 'failed compareAndSwap result')),
      };
      break;
    }
    default:
      throw new TypeError('Unknown compareAndSwap result status.');
  }

  requireValid(validateXnlAuthoringPersistenceResult(result));
  return freezePublic(result);
}

function mapRevision(value: unknown): XnlAuthoringPersistedRevision {
  const record = requireRecord(value, 'VFS revision');
  requireExactKeys(record, ['authorityId', 'value'], 'VFS revision');
  return {
    kind: 'xnl-authoring-persisted-revision',
    authorityId: ownValue(record, 'authorityId', 'VFS revision') as string,
    value: ownValue(record, 'value', 'VFS revision') as string,
  };
}

function toVfsRevision(revision: XnlAuthoringPersistedRevision): VfsRevision {
  return { authorityId: revision.authorityId, value: revision.value };
}

function mapDiagnostics(value: unknown): readonly XnlAuthoringDiagnostic[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length === 0
  ) {
    throw new TypeError('VFS diagnostics must be an array.');
  }
  return value.map((item) => {
    const record = requireRecord(item, 'VFS diagnostic');
    requireAllowedKeys(record, ['code', 'message'], ['cause'], 'VFS diagnostic');
    return {
      severity: 'error',
      code: ownValue(record, 'code', 'VFS diagnostic') as string,
      message: ownValue(record, 'message', 'VFS diagnostic') as string,
    } satisfies XnlAuthoringDiagnostic;
  });
}

function bindAuthorityId(current: string | undefined, candidate: string): string {
  if (current !== undefined && current !== candidate) {
    throw new TypeError('Revisioned VFS authority changed authorityId.');
  }
  return candidate;
}

function requireSameAuthority(
  actual: XnlAuthoringPersistedRevision,
  expected: XnlAuthoringPersistedRevision,
): void {
  if (actual.authorityId !== expected.authorityId) throw new TypeError('Foreign VFS authority.');
}

function requireSameRevision(
  actual: XnlAuthoringPersistedRevision,
  expected: XnlAuthoringPersistedRevision,
): void {
  requireSameAuthority(actual, expected);
  if (actual.value !== expected.value) throw new TypeError('Incoherent VFS revision.');
}

function readFailure(): XnlAuthoringPersistenceReadResult<DataElementNode> {
  return freezePublic({
    status: 'failed',
    diagnostics: [diagnostic(
      'XNL_AUTHORING_VFS_READ_FAILED',
      'Revisioned VFS authority read failed or returned malformed data.',
    )],
  });
}

function persistenceFailure(
  expectedPersistedRevision: XnlAuthoringPersistedRevision,
): XnlAuthoringPersistenceResult {
  return freezePublic({
    status: 'failed',
    expectedPersistedRevision,
    diagnostics: [diagnostic(
      'XNL_AUTHORING_VFS_PERSIST_FAILED',
      'Revisioned VFS authority persist failed or returned malformed data.',
    )],
  });
}

function diagnostic(code: string, message: string): XnlAuthoringDiagnostic {
  return { severity: 'error', code, message };
}

function requireValid(validation: { readonly ok: boolean }): void {
  if (!validation.ok) throw new TypeError('Authoring fact validation failed.');
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new TypeError(`${label} prototype could not be inspected.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  requireAllowedKeys(record, keys, [], label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(record);
  } catch {
    throw new TypeError(`${label} keys could not be inspected.`);
  }
  const allowed = new Set([...required, ...optional]);
  if (
    ownKeys.some((key) => typeof key !== 'string' || !allowed.has(key))
    || required.some((key) => !ownKeys.includes(key))
  ) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
  for (const key of ownKeys) ownValue(record, key as string, label);
}

function ownValue(record: Record<string, unknown>, key: string, label: string): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, key);
  } catch {
    throw new TypeError(`${label}.${key} could not be inspected.`);
  }
  if (!descriptor || !('value' in descriptor)) {
    throw new TypeError(`${label}.${key} must be an own data property.`);
  }
  return descriptor.value;
}
