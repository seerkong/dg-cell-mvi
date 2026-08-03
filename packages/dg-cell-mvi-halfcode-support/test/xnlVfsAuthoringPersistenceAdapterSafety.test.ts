import { describe, expect, it, vi } from 'vitest';
import { parseXnl, type DataElementNode } from 'xnl-core';
import type { RevisionedVfsAuthority } from 'xnl-vfs/revisioned-persistence';
import {
  createXnlVfsAuthoringPersistencePort,
  type XnlAuthoringPersistedRevision,
} from '../src';

function document(): DataElementNode {
  const node = parseXnl('<Document #document title="Draft">').nodes[0];
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Expected a DataElementNode fixture');
  }
  const candidate = node as Partial<DataElementNode>;
  if (candidate.kind !== 'DataElement' || typeof candidate.tag !== 'string' || !candidate.metadata) {
    throw new Error('Expected a DataElementNode fixture');
  }
  const snapshot = structuredClone(node as DataElementNode);
  if (snapshot.attributes === undefined) delete snapshot.attributes;
  if (snapshot.body === undefined) delete snapshot.body;
  if (snapshot.extend === undefined) delete snapshot.extend;
  return snapshot;
}

const expected: XnlAuthoringPersistedRevision = {
  kind: 'xnl-authoring-persisted-revision',
  authorityId: 'authority:safety',
  value: 'vfs:1',
};

function persistInput() {
  return {
    document: document(),
    expectedPersistedRevision: expected,
    liveRevision: {
      kind: 'xnl-authoring-live-revision' as const,
      sessionId: 'session:safety',
      value: 'live:1',
    },
  };
}

describe('xnl-vfs authoring persistence adapter safety boundary', () => {
  it('fails closed on a foreign conflict result without exposing the foreign revision', async () => {
    const authority: RevisionedVfsAuthority = {
      read: () => ({
        revision: { authorityId: expected.authorityId, value: expected.value },
        snapshot: document(),
      }),
      compareAndSwap: () => ({
        status: 'conflict',
        actualRevision: { authorityId: 'authority:foreign', value: 'vfs:2' },
      }),
    };
    const port = createXnlVfsAuthoringPersistencePort(authority);
    expect((await port.read({}, {}, {})).status).toBe('loaded');

    const result = await port.persist({}, persistInput(), {});

    expect(result).toEqual({
      status: 'failed',
      expectedPersistedRevision: expected,
      diagnostics: [{
        severity: 'error',
        code: 'XNL_AUTHORING_VFS_PERSIST_FAILED',
        message: 'Revisioned VFS authority persist failed or returned malformed data.',
      }],
    });
    expect(JSON.stringify(result)).not.toContain('authority:foreign');
  });

  it('maps serializable diagnostics but strips an authority cause from public facts', async () => {
    const cause = vi.fn();
    const authority: RevisionedVfsAuthority = {
      read: () => ({
        revision: { authorityId: expected.authorityId, value: expected.value },
        snapshot: document(),
      }),
      compareAndSwap: () => ({
        status: 'failed',
        actualRevision: { authorityId: expected.authorityId, value: expected.value },
        diagnostics: [{ code: 'FLUSH_FAILED', message: 'flush failed', cause }],
      }),
    };
    const result = await createXnlVfsAuthoringPersistencePort(authority)
      .persist({}, persistInput(), {});

    expect(result).toEqual({
      status: 'failed',
      expectedPersistedRevision: expected,
      diagnostics: [{ severity: 'error', code: 'FLUSH_FAILED', message: 'flush failed' }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== 'failed') throw new Error('Expected failed persistence');
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(result.diagnostics[0]).not.toHaveProperty('cause');
  });

  it('clones and freezes an applied receipt before publishing authoring facts', async () => {
    const receipt = {
      previousRevision: { authorityId: expected.authorityId, value: expected.value },
      revision: { authorityId: expected.authorityId, value: 'vfs:2' },
      persistedAt: '2026-08-01T00:00:00.000Z',
      durability: 'memory' as const,
    };
    const authority: RevisionedVfsAuthority = {
      read: () => ({ revision: receipt.previousRevision, snapshot: document() }),
      compareAndSwap: () => ({ status: 'applied', receipt }),
    };
    const result = await createXnlVfsAuthoringPersistencePort(authority)
      .persist({}, persistInput(), {});

    receipt.previousRevision.value = 'mutated:previous';
    receipt.revision.value = 'mutated:current';

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('Expected applied persistence');
    expect(result.receipt.previousRevision.value).toBe('vfs:1');
    expect(result.receipt.currentRevision.value).toBe('vfs:2');
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.currentRevision)).toBe(true);
  });

  it('rejects a foreign expected revision before invoking the bound authority CAS', async () => {
    const compareAndSwap = vi.fn((
      _input: Parameters<RevisionedVfsAuthority['compareAndSwap']>[0],
    ) => ({
      status: 'failed' as const,
      actualRevision: { authorityId: expected.authorityId, value: expected.value },
      diagnostics: [{ code: 'UNEXPECTED_CALL', message: 'unexpected call' }],
    }));
    const authority: RevisionedVfsAuthority = {
      read: () => ({
        revision: { authorityId: expected.authorityId, value: expected.value },
        snapshot: document(),
      }),
      compareAndSwap,
    };
    const port = createXnlVfsAuthoringPersistencePort(authority);
    await port.read({}, {}, {});

    const result = await port.persist({}, {
      ...persistInput(),
      expectedPersistedRevision: { ...expected, authorityId: 'authority:foreign' },
    }, {});

    expect(result.status).toBe('failed');
    expect(compareAndSwap).not.toHaveBeenCalled();
  });
});
