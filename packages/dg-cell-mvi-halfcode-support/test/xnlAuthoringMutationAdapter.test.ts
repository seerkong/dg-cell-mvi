import { describe, expect, it } from 'vitest';
import {
  parsePath,
  parseXnl,
  type DataElementNode,
  type XnlMutation,
  type XnlNode,
} from 'xnl-core';
import { submitAuthoringEdit } from 'dg-cell-mvi-halfcode-logic';
import type {
  XnlAuthoringRuntime,
  XnlAuthoringSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import { createXnlCoreAuthoringMutationPort } from '../src';
import type { XnlCoreAuthoringMutation } from '../src';

function parseRoot(source: string): XnlNode {
  return JSON.parse(JSON.stringify(parseXnl(source).nodes[0])) as XnlNode;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function targetsOrdinaryIdPayload(mutation: XnlCoreAuthoringMutation | XnlMutation): boolean {
  if (mutation.type !== 'TREE_UPDATE' && mutation.type !== 'OBJECT_UPDATE') return false;
  const path = typeof mutation.path === 'string' ? parsePath(mutation.path) : [...mutation.path];
  const last = path.at(-1);
  return last?.type === 'InstanceProperty' && last.value === 'id';
}

function supportRuntime<TCommand = XnlAuthoringSerializableValue>(
  candidateDocument: XnlNode,
): XnlAuthoringRuntime<XnlNode, TCommand, XnlCoreAuthoringMutation> {
  return {
    domain: {
      materializeCandidate: () => candidateDocument,
      validateCandidate: () => ({ status: 'valid' }),
    },
    mutations: createXnlCoreAuthoringMutationPort<TCommand>(),
    persistence: {
      read: () => ({ status: 'failed', diagnostics: [] }),
      persist: (_runtime, input) => ({
        status: 'unchanged',
        persistedRevision: input.expectedPersistedRevision,
      }),
    },
    revision: {
      nextLiveRevision: () => ({
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session',
        value: 'next',
      }),
    },
    invalidation: {
      publish: () => undefined,
    },
  };
}

describe('xnl-core authoring mutation adapter', () => {
  it('diffs same-parent moves by #id without an ordinary id payload update', async () => {
    const before = parseRoot(`<Document #document [
      <Section #alpha>
      <Section #beta>
      <Section #gamma>
    ]>`);
    const after = parseRoot(`<Document #document [
      <Section #beta>
      <Section #alpha>
      <Section #gamma>
    ]>`);
    const port = createXnlCoreAuthoringMutationPort();

    const mutations = await port.diff(supportRuntime(after), {
      acceptedDocument: before,
      candidateDocument: after,
    }, {});
    const dryRun = await port.dryRun(supportRuntime(after), {
      acceptedDocument: before,
      mutations,
      metadataIdMode: 'identity',
    }, {});

    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TREE_MOVE_SAME_LEVEL',
        targetUniqueName: 'alpha',
      }),
    ]));
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(dryRun).toMatchObject({ status: 'applied', document: after });
  });

  it('diffs cross-parent moves by #id and keeps x-id as ordinary payload', async () => {
    const before = parseRoot(`<Document #document [
      <Section #left [
        <Panel #moving { "x-id" = "source-occurrence" tone = "neutral" }>
      ]>
      <Section #right>
    ]>`);
    const after = parseRoot(`<Document #document [
      <Section #left>
      <Section #right [
        <Panel #moving { "x-id" = "target-occurrence" tone = "warm" }>
      ]>
    ]>`);
    const port = createXnlCoreAuthoringMutationPort();

    const mutations = await port.diff(supportRuntime(after), {
      acceptedDocument: before,
      candidateDocument: after,
    }, {});
    const dryRun = await port.dryRun(supportRuntime(after), {
      acceptedDocument: before,
      mutations,
      metadataIdMode: 'identity',
    }, {});

    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TREE_MOVE_CROSS_LEVEL',
        targetUniqueName: 'moving',
        parentUniqueNameBefore: 'left',
        parentUniqueNameAfter: 'right',
      }),
      expect.objectContaining({
        type: 'OBJECT_UPDATE',
        path: "#moving:attributes::'x-id'",
        valueAfter: 'target-occurrence',
      }),
      expect.objectContaining({
        type: 'OBJECT_UPDATE',
        path: "#moving:attributes::'tone'",
        valueAfter: 'warm',
      }),
    ]));
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(dryRun.status).toBe('applied');
    expect(dryRun.status === 'applied' ? dryRun.document : undefined).toEqual(after);
    expect(dryRun.status === 'applied' ? dryRun.affectedIdentities : []).toEqual(expect.arrayContaining([
      'left',
      'moving',
      'right',
    ]));
  });

  it('represents identity replacement as delete plus add and never as id payload update', async () => {
    const before = parseRoot(`<Document #document [
      <Section #identity-before { tone = "neutral" }>
    ]>`);
    const after = parseRoot(`<Document #document [
      <Section #identity-after { tone = "neutral" }>
    ]>`);
    const port = createXnlCoreAuthoringMutationPort();

    const mutations = await port.diff(supportRuntime(after), {
      acceptedDocument: before,
      candidateDocument: after,
    }, {});
    const dryRun = await port.dryRun(supportRuntime(after), {
      acceptedDocument: before,
      mutations,
      metadataIdMode: 'identity',
    }, {});

    expect(mutations.map((mutation) => mutation.type)).toEqual(['TREE_DELETE', 'TREE_ADD']);
    expect(mutations).toEqual([
      expect.objectContaining({
        type: 'TREE_DELETE',
        targetUniqueName: 'identity-before',
      }),
      expect.objectContaining({
        type: 'TREE_ADD',
        targetUniqueName: 'identity-after',
      }),
    ]);
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(dryRun).toMatchObject({ status: 'applied', document: after });
  });

  it('strict dry-run rejects duplicate identity diagnostics without changing the accepted base', async () => {
    const base = parseRoot(`<Document #document [
      <Section #duplicate>
      <Section id="duplicate">
    ]>`);
    const baseBefore = clone(base);
    const port = createXnlCoreAuthoringMutationPort();

    const dryRun = await port.dryRun(supportRuntime(base), {
      acceptedDocument: base,
      mutations: [],
      metadataIdMode: 'identity',
    }, {});

    expect(dryRun.status).toBe('rejected');
    expect(dryRun.status === 'rejected' ? dryRun.diagnostics : []).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'DUPLICATE_IDENTITY',
        message: expect.stringContaining('duplicate'),
        details: expect.objectContaining({
          source: 'xnl-core',
          identity: 'duplicate',
        }),
      }),
    ]);
    expect(base).toEqual(baseBefore);
  });

  it('allows legal AppBundle-like domain nodes without identities through empty and normal dry-runs', async () => {
    const base = parseRoot(`<AppBundle #app [
      <Units [
        <Unit { name = "intro" } [
          <TextElement ?>Hello</?>
        ]>
      ]>
    ]>`);
    const target = parseRoot(`<AppBundle #app [
      <Units [
        <Unit { name = "intro" } [
          <TextElement ?>Hello world</?>
        ]>
      ]>
    ]>`);
    const baseBefore = clone(base);
    const port = createXnlCoreAuthoringMutationPort();

    const emptyDryRun = await port.dryRun(supportRuntime(base), {
      acceptedDocument: base,
      mutations: [],
      metadataIdMode: 'identity',
    }, {});
    const mutations = await port.diff(supportRuntime(target), {
      acceptedDocument: base,
      candidateDocument: target,
    }, {});
    const mutationDryRun = await port.dryRun(supportRuntime(target), {
      acceptedDocument: base,
      mutations,
      metadataIdMode: 'identity',
    }, {});

    expect(emptyDryRun).toMatchObject({ status: 'applied', document: base });
    expect(mutations).toEqual([
      expect.objectContaining({
        type: 'TREE_UPDATE',
        path: "<id='app'>:body::0:body::0:body::0:text",
        valueAfter: 'Hello world',
      }),
    ]);
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(mutationDryRun).toMatchObject({ status: 'applied', document: target });
    expect(base).toEqual(baseBefore);
  });

  it.each([
    {
      label: 'whole node identity replacement',
      baseSource: `<Document #document [
        <Section #old { tone = "neutral" }>
      ]>`,
      path: '#document:body::0',
      valueAfter: parseRoot(`<Section #new { tone = "neutral" }>`),
    },
    {
      label: 'body container identity replacement',
      baseSource: `<Document #document [
        <Section #old { tone = "neutral" }>
      ]>`,
      path: '#document:body',
      valueAfter: [parseRoot(`<Section #new { tone = "neutral" }>`)],
    },
    {
      label: 'attributes container identity replacement',
      baseSource: `<Document #document>`,
      path: '#document:attributes',
      valueAfter: { slot: parseRoot(`<Section #new { tone = "neutral" }>` ) },
      decorateBase(base: XnlNode) {
        (base as DataElementNode).attributes = { slot: parseRoot(`<Section #old { tone = "neutral" }>` ) };
      },
    },
  ])('strict dry-run rejects hidden identity replacement through $label', async ({ baseSource, path, valueAfter, decorateBase }) => {
    const base = parseRoot(baseSource);
    decorateBase?.(base);
    const baseBefore = clone(base);
    const port = createXnlCoreAuthoringMutationPort();

    const dryRun = await port.dryRun(supportRuntime(base), {
      acceptedDocument: base,
      mutations: [{
        type: 'TREE_UPDATE',
        path,
        valueAfter,
      }],
      metadataIdMode: 'identity',
    }, {});

    expect(dryRun.status).toBe('rejected');
    expect(dryRun.status === 'rejected' ? dryRun.diagnostics : []).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'IDENTITY_MUTATION_FORBIDDEN',
        details: expect.objectContaining({ source: 'xnl-core' }),
      }),
    ]);
    expect(base).toEqual(baseBefore);
  });

  it('strict dry-run rejects valueBefore precondition mismatches and preserves readonly input facts', async () => {
    const base = deepFreeze(parseRoot(`<Document #document [
      <Section #section { state = "draft" }>
    ]>`));
    const baseBefore = clone(base);
    const mutation = deepFreeze({
      type: 'OBJECT_UPDATE',
      path: "#section:attributes::'state'",
      valueBefore: 'published',
      valueAfter: 'archived',
    } satisfies XnlMutation);
    const mutationBefore = clone(mutation);
    const port = createXnlCoreAuthoringMutationPort();

    const dryRun = await port.dryRun(supportRuntime(base), {
      acceptedDocument: base,
      mutations: [mutation],
      metadataIdMode: 'identity',
    }, {});

    expect(dryRun.status).toBe('rejected');
    expect(dryRun.status === 'rejected' ? dryRun.diagnostics : []).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'PRECONDITION_FAILED',
        path: ['section', 'attributes', 'state'],
        details: expect.objectContaining({
          source: 'xnl-core',
          rawPath: "#section:attributes::'state'",
          mutationIndex: 0,
        }),
      }),
    ]);
    expect(base).toEqual(baseBefore);
    expect(mutation).toEqual(mutationBefore);
  });

  it('composes directly with the T2.2 coordinator runtime shape', async () => {
    const acceptedDocument = parseRoot(`<Document #document [
      <Section #left [
        <Panel #moving { state = "draft" }>
      ]>
      <Section #right>
    ]>`);
    const candidateDocument = parseRoot(`<Document #document [
      <Section #left>
      <Section #right [
        <Panel #moving { state = "published" }>
      ]>
    ]>`);
    const runtime = supportRuntime<{ readonly operation: 'publish' }>(candidateDocument);

    const result = await submitAuthoringEdit(runtime, {
      accepted: {
        kind: 'xnl-authoring-accepted-snapshot',
        document: acceptedDocument,
        liveRevision: {
          kind: 'xnl-authoring-live-revision',
          sessionId: 'session',
          value: '1',
        },
      },
      proposal: {
        kind: 'xnl-authoring-proposal',
        id: 'proposal-1',
        baseLiveRevision: {
          kind: 'xnl-authoring-live-revision',
          sessionId: 'session',
          value: '1',
        },
        command: { operation: 'publish' },
      },
    }, {});

    expect(result.status).toBe('candidate');
    expect(result.status === 'candidate' ? result.candidate.document : undefined).toEqual(candidateDocument);
    expect(result.status === 'candidate' ? result.candidate.mutations : []).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TREE_MOVE_CROSS_LEVEL',
        targetUniqueName: 'moving',
      }),
      expect.objectContaining({
        type: 'OBJECT_UPDATE',
        path: "#moving:attributes::'state'",
        valueAfter: 'published',
      }),
    ]));
    expect(result.status === 'candidate' ? result.candidate.affectedIdentities : []).toEqual([
      'left',
      'moving',
      'right',
    ]);
  });
});
