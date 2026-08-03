import { describe, expect, it } from 'vitest';
import { parseXnl, type DataElementNode } from 'xnl-core';
import {
  MemoryRevisionedVfsAuthority,
  type RevisionedVfsAuthority,
} from 'xnl-vfs/revisioned-persistence';
import {
  createXnlAuthoringSessionFactory,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringPersistencePort,
  type XnlAuthoringPersistenceReadResult,
  type XnlAuthoringPersistInput,
  type XnlAuthoringRuntime,
} from '../src';

interface RenameTitleCommand {
  readonly type: 'document.rename-title';
  readonly title: string;
}

interface RenameTitleMutation {
  readonly kind: 'set-title';
  readonly title: string;
}

type AuthoringRuntime = XnlAuthoringRuntime<
  DataElementNode,
  RenameTitleCommand,
  RenameTitleMutation
>;
type PersistencePort = XnlAuthoringPersistencePort<DataElementNode, AuthoringRuntime>;
type CreatePersistencePort = (authority: RevisionedVfsAuthority) => PersistencePort;

const support = await import('../src') as unknown as Record<string, unknown>;
const createPersistencePort = typeof support.createXnlVfsAuthoringPersistencePort === 'function'
  ? support.createXnlVfsAuthoringPersistencePort as CreatePersistencePort
  : undefined;
const adapterAvailable = createPersistencePort !== undefined;
const PERSISTED_AT = '2026-08-01T00:00:00.000Z';

function document(title: string): DataElementNode {
  const node = parseXnl(`<Document #document title="${title}">`).nodes[0];
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Expected a DataElementNode authoring fixture');
  }
  const candidate = node as Partial<DataElementNode>;
  if (candidate.kind !== 'DataElement' || typeof candidate.tag !== 'string' || !candidate.metadata) {
    throw new Error('Expected a DataElementNode authoring fixture');
  }
  const snapshot = structuredClone(node as DataElementNode);
  if (snapshot.attributes === undefined) delete snapshot.attributes;
  if (snapshot.body === undefined) delete snapshot.body;
  if (snapshot.extend === undefined) delete snapshot.extend;
  return snapshot;
}

function authority(initial = document('Draft')): MemoryRevisionedVfsAuthority {
  return new MemoryRevisionedVfsAuthority(initial, {
    authorityId: 'authority:authoring-test',
    clock: () => PERSISTED_AT,
    revisionFactory: (sequence) => `vfs:${sequence + 1}`,
  });
}

function requirePersistencePort(vfsAuthority: RevisionedVfsAuthority): PersistencePort {
  if (!createPersistencePort) {
    throw new Error(
      'Missing support API createXnlVfsAuthoringPersistencePort; T4.2 must export the xnl-vfs adapter',
    );
  }
  return createPersistencePort(vfsAuthority);
}

async function read(
  port: PersistencePort,
  runtime = {} as AuthoringRuntime,
): Promise<XnlAuthoringPersistenceReadResult<DataElementNode>> {
  return await port.read(runtime, {}, {});
}

async function persist(
  port: PersistencePort,
  input: XnlAuthoringPersistInput<DataElementNode>,
  runtime = {} as AuthoringRuntime,
) {
  return await port.persist(runtime, input, {});
}

function liveRevision(value = 'live:2', sessionId = 'session:authoring'): XnlAuthoringLiveRevision {
  return {
    kind: 'xnl-authoring-live-revision',
    sessionId,
    value,
  };
}

function requireLoaded(
  result: XnlAuthoringPersistenceReadResult<DataElementNode>,
): Extract<XnlAuthoringPersistenceReadResult<DataElementNode>, { readonly status: 'loaded' }> {
  expect(result.status).toBe('loaded');
  if (result.status !== 'loaded') {
    throw new Error('Expected the real authority read to map to loaded');
  }
  return result;
}

function changedSnapshot(title: string): DataElementNode {
  const snapshot = document('Draft');
  snapshot.metadata.title = title;
  return snapshot;
}

function runtimeFor(
  persistence: PersistencePort,
  sessionId: string,
): AuthoringRuntime {
  let revisionSequence = 0;
  return {
    domain: {
      materializeCandidate: (_runtime, input) => {
        const candidate = structuredClone(input.accepted.document) as DataElementNode;
        candidate.metadata.title = input.proposal.command.title;
        return candidate;
      },
      validateCandidate: () => ({ status: 'valid' }),
    },
    mutations: {
      diff: (_runtime, input) => [{
        kind: 'set-title',
        title: String(input.candidateDocument.metadata.title),
      }],
      dryRun: (_runtime, input) => {
        const mutation = input.mutations[0];
        if (!mutation) {
          return { status: 'rejected', diagnostics: [] };
        }
        const candidate = structuredClone(input.acceptedDocument) as DataElementNode;
        candidate.metadata.title = mutation.title;
        return {
          status: 'applied',
          document: candidate,
          affectedIdentities: ['document'],
        };
      },
    },
    persistence,
    revision: {
      nextLiveRevision: () => ({
        kind: 'xnl-authoring-live-revision',
        sessionId,
        value: `live:${++revisionSequence}`,
      }),
    },
    invalidation: {
      publish: () => undefined,
    },
  };
}

describe('xnl-vfs authoring persistence adapter intended red', () => {
  it('locks the real authority fixture at initial vfs:1 and first applied vfs:2', async () => {
    const vfsAuthority = authority();
    const initial = await vfsAuthority.read();
    const applied = await vfsAuthority.compareAndSwap({
      expectedRevision: initial.revision,
      snapshot: changedSnapshot('Saved'),
    });

    expect(initial.revision).toEqual({
      authorityId: 'authority:authoring-test',
      value: 'vfs:1',
    });
    expect(applied).toMatchObject({
      status: 'applied',
      receipt: {
        previousRevision: initial.revision,
        revision: {
          authorityId: 'authority:authoring-test',
          value: 'vfs:2',
        },
      },
    });
  });

  it('exports the support adapter API that T4.2 must implement', () => {
    expect(
      createPersistencePort,
      'Missing support API createXnlVfsAuthoringPersistencePort; dependency resolution is already green',
    ).toBeTypeOf('function');
  });

  describe.skipIf(!adapterAvailable)('real MemoryRevisionedVfsAuthority contract', () => {
    it('maps read to a loaded authoring document and authority-scoped persisted revision', async () => {
      const port = requirePersistencePort(authority());

      const loaded = requireLoaded(await read(port));

      expect(loaded.document).toEqual(document('Draft'));
      expect(loaded.persistedRevision).toEqual({
        kind: 'xnl-authoring-persisted-revision',
        authorityId: 'authority:authoring-test',
        value: 'vfs:1',
      });
    });

    it('maps an applied CAS and preserves the real receipt without VCS identity', async () => {
      const vfsAuthority = authority();
      const port = requirePersistencePort(vfsAuthority);
      const loaded = requireLoaded(await read(port));
      const candidate = changedSnapshot('Saved');

      const result = await persist(port, {
        document: candidate,
        expectedPersistedRevision: loaded.persistedRevision,
        liveRevision: liveRevision(),
      });

      expect(result).toEqual({
        status: 'applied',
        persistedRevision: {
          kind: 'xnl-authoring-persisted-revision',
          authorityId: 'authority:authoring-test',
          value: 'vfs:2',
        },
        receipt: {
          kind: 'xnl-authoring-persistence-receipt',
          previousRevision: loaded.persistedRevision,
          currentRevision: {
            kind: 'xnl-authoring-persisted-revision',
            authorityId: 'authority:authoring-test',
            value: 'vfs:2',
          },
          persistedAt: PERSISTED_AT,
          durability: 'memory',
        },
      });
      expect(result).not.toHaveProperty('commitId');
      expect((await vfsAuthority.read()).snapshot).toEqual(candidate);
    });

    it('maps a current semantic no-op to unchanged without fabricating a receipt', async () => {
      const vfsAuthority = authority();
      const port = requirePersistencePort(vfsAuthority);
      const loaded = requireLoaded(await read(port));

      const result = await persist(port, {
        document: loaded.document,
        expectedPersistedRevision: loaded.persistedRevision,
        liveRevision: liveRevision(),
      });

      expect(result).toEqual({
        status: 'unchanged',
        persistedRevision: loaded.persistedRevision,
      });
      expect(result).not.toHaveProperty('receipt');
      expect((await vfsAuthority.read()).revision.value).toBe('vfs:1');
    });

    it('maps an injected flush failure without advancing persistence truth', async () => {
      const vfsAuthority = authority();
      const port = requirePersistencePort(vfsAuthority);
      const loaded = requireLoaded(await read(port));
      vfsAuthority.failNextFlush({
        code: 'TEST_FLUSH_FAILED',
        message: 'injected flush failure',
      });

      const result = await persist(port, {
        document: changedSnapshot('Unsaved'),
        expectedPersistedRevision: loaded.persistedRevision,
        liveRevision: liveRevision(),
      });

      expect(result).toEqual({
        status: 'failed',
        expectedPersistedRevision: loaded.persistedRevision,
        diagnostics: [{
          severity: 'error',
          code: 'TEST_FLUSH_FAILED',
          message: 'injected flush failure',
        }],
      });
      expect(await vfsAuthority.read()).toMatchObject({
        revision: { value: 'vfs:1' },
        snapshot: { metadata: { title: 'Draft' } },
      });
    });

    it('maps a stale CAS to conflict with the actual persisted revision', async () => {
      const vfsAuthority = authority();
      const port = requirePersistencePort(vfsAuthority);
      const stale = requireLoaded(await read(port));
      const rawBase = await vfsAuthority.read();
      const winner = await vfsAuthority.compareAndSwap({
        expectedRevision: rawBase.revision,
        snapshot: changedSnapshot('Winner'),
      });
      expect(winner.status).toBe('applied');

      const result = await persist(port, {
        document: changedSnapshot('Loser'),
        expectedPersistedRevision: stale.persistedRevision,
        liveRevision: liveRevision(),
      });

      expect(result).toEqual({
        status: 'conflict',
        expectedPersistedRevision: stale.persistedRevision,
        actualPersistedRevision: {
          kind: 'xnl-authoring-persisted-revision',
          authorityId: 'authority:authoring-test',
          value: 'vfs:2',
        },
      });
      expect((await vfsAuthority.read()).snapshot.metadata.title).toBe('Winner');
    });

    it('opens a fresh session from the exact snapshot persisted by the previous session', async () => {
      const vfsAuthority = authority();
      const persistence = requirePersistencePort(vfsAuthority);
      const factory = createXnlAuthoringSessionFactory<
        DataElementNode,
        RenameTitleCommand,
        RenameTitleMutation
      >();
      const firstSessionId = 'session:first';
      const first = await factory.open(runtimeFor(persistence, firstSessionId), {
        id: firstSessionId,
      }, {});
      const accepted = await first.proposal.submit({
        kind: 'xnl-authoring-proposal',
        id: 'proposal:save',
        baseLiveRevision: first.proposal.state().accepted.liveRevision,
        command: { type: 'document.rename-title', title: 'Persisted by first session' },
      }, {});
      expect(accepted.status).toBe('accepted');
      if (accepted.status !== 'accepted') {
        throw new Error('Expected first session persistence to apply');
      }

      const secondSessionId = 'session:reload';
      const reloaded = await factory.open(runtimeFor(persistence, secondSessionId), {
        id: secondSessionId,
      }, {});

      expect(reloaded.proposal.state().accepted.document).toEqual(accepted.accepted.document);
      expect(reloaded.proposal.state().persistedRevision).toEqual(
        accepted.persistence.status === 'applied'
          ? accepted.persistence.persistedRevision
          : undefined,
      );
      expect(reloaded.proposal.state().accepted.liveRevision.sessionId).toBe(secondSessionId);
    });
  });
});
