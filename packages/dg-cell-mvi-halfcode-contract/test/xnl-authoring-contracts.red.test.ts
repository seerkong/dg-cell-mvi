import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contract from '../src';

interface ValidationIssue {
  readonly path: string;
  readonly code?: string;
  readonly message: string;
}

interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

interface XnlAuthoringRuntimeSurface {
  readonly XNL_AUTHORING_IDENTITY_RULES?: {
    readonly metadataIdRole: string;
    readonly ordinaryPayloadUpdate: boolean;
    readonly replacement: string;
  };
  readonly validateXnlAuthoringAcceptedSnapshot?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringCandidate?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringOpenConfig?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringOpenInput?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringProposal?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringScopeAuthoringFacet?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringSubmitConfig?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringPersistenceResult?: (value: unknown) => ValidationResult;
  readonly validateXnlAuthoringSubmitResult?: (value: unknown) => ValidationResult;
  readonly areXnlAuthoringLiveRevisionsEqual?: (left: unknown, right: unknown) => boolean;
  readonly areXnlAuthoringPersistedRevisionsEqual?: (left: unknown, right: unknown) => boolean;
}

const authoring = contract as XnlAuthoringRuntimeSurface;
const CONTRACT_SRC = resolve(__dirname, '../src/xnl-authoring');
const LOGIC_SRC = resolve(__dirname, '../../dg-cell-mvi-halfcode-logic/src/xnl-authoring');
const EXPECTED_RUNTIME_EXPORTS = [
  'XNL_AUTHORING_IDENTITY_RULES',
  'validateXnlAuthoringAcceptedSnapshot',
  'validateXnlAuthoringCandidate',
  'validateXnlAuthoringOpenConfig',
  'validateXnlAuthoringOpenInput',
  'validateXnlAuthoringProposal',
  'validateXnlAuthoringScopeAuthoringFacet',
  'validateXnlAuthoringSubmitConfig',
  'validateXnlAuthoringPersistenceResult',
  'validateXnlAuthoringSubmitResult',
  'areXnlAuthoringLiveRevisionsEqual',
  'areXnlAuthoringPersistedRevisionsEqual',
] as const;

function sourceFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : extname(path) === '.ts'
        ? [path]
        : [];
  });
}

function readSources(root: string): string {
  return sourceFiles(root)
    .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

describe('xnl-authoring public contract boundary', () => {
  it('exports the renderer-neutral authoring validators and identity rules from the package root', () => {
    for (const exportName of EXPECTED_RUNTIME_EXPORTS) {
      expect(exportName in contract, exportName).toBe(true);
    }

    expect(authoring.XNL_AUTHORING_IDENTITY_RULES).toEqual({
      metadataIdRole: 'tree-alignment-and-move-identity',
      ordinaryPayloadUpdate: false,
      replacement: 'delete-and-add',
    });
  });

  it('accepts readonly serializable accepted, candidate, and proposal facts', () => {
    const acceptedSnapshot = {
      kind: 'xnl-authoring-accepted-snapshot',
      document: {
        tag: 'Document',
        attributes: { '#id': 'architecture-document' },
        children: [{ tag: 'Title', text: 'Checkout architecture' }],
      },
      liveRevision: {
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session:architecture',
        value: 'live:7',
      },
    } as const;
    const proposal = {
      kind: 'xnl-authoring-proposal',
      id: 'proposal:rename-title',
      baseLiveRevision: acceptedSnapshot.liveRevision,
      command: {
        type: 'document.rename-title',
        target: { nodeId: 'architecture-document', path: ['children', 0] },
        payload: { title: 'Checkout platform architecture' },
      },
      source: { occurrenceId: 'document-occurrence:1', xId: 'title-editor' },
    } as const;
    const candidate = {
      kind: 'xnl-authoring-candidate',
      baseLiveRevision: acceptedSnapshot.liveRevision,
      document: {
        ...acceptedSnapshot.document,
        children: [{ tag: 'Title', text: 'Checkout platform architecture' }],
      },
      mutations: [{ kind: 'set-text', targetId: 'architecture-document', value: 'Checkout platform architecture' }],
      affectedIdentities: ['architecture-document'],
    } as const;

    expect(JSON.parse(JSON.stringify({ acceptedSnapshot, candidate, proposal }))).toEqual({
      acceptedSnapshot,
      candidate,
      proposal,
    });
    expect(authoring.validateXnlAuthoringAcceptedSnapshot?.(acceptedSnapshot)).toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringCandidate?.(candidate)).toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringProposal?.(proposal)).toEqual({ ok: true, issues: [] });
  });

  it('rejects executable and authority-bearing values from proposal input and config', () => {
    const invalidProposals = [
      {
        kind: 'xnl-authoring-proposal',
        id: 'proposal:callback',
        baseLiveRevision: { kind: 'xnl-authoring-live-revision', sessionId: 'session:1', value: 'live:7' },
        command: { type: 'document.edit', payload: { callback: () => undefined } },
      },
      {
        kind: 'xnl-authoring-proposal',
        id: 'proposal:writer',
        baseLiveRevision: { kind: 'xnl-authoring-live-revision', sessionId: 'session:1', value: 'live:7' },
        command: { type: 'document.edit' },
        writer: { apply: () => undefined },
      },
      {
        kind: 'xnl-authoring-proposal',
        id: 'proposal:registry',
        baseLiveRevision: { kind: 'xnl-authoring-live-revision', sessionId: 'session:1', value: 'live:7' },
        command: { type: 'document.edit' },
        registry: new Map(),
      },
      {
        kind: 'xnl-authoring-proposal',
        id: 'proposal:persistence',
        baseLiveRevision: { kind: 'xnl-authoring-live-revision', sessionId: 'session:1', value: 'live:7' },
        command: { type: 'document.edit' },
        persistenceClient: { persist: () => undefined },
      },
    ];

    for (const proposal of invalidProposals) {
      const result = authoring.validateXnlAuthoringProposal?.(proposal);
      expect(result?.ok).toBe(false);
      expect(result?.issues.some((issue) =>
        issue.code === 'NON_SERIALIZABLE_VALUE' || issue.code === 'OWNERSHIP_FIELD',
      )).toBe(true);
    }

    const invalidConfig = {
      policy: { conflict: 'reject' },
      validator: () => true,
      writer: {},
      registry: new Map(),
      persistenceClient: {},
    };
    const configResult = authoring.validateXnlAuthoringSubmitConfig?.(invalidConfig);
    expect(configResult?.ok).toBe(false);
    expect(configResult?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['NON_SERIALIZABLE_VALUE', 'OWNERSHIP_FIELD']),
    );
  });

  it('keeps open input/config as serializable facts and Scope facets mode-specific', () => {
    expect(authoring.validateXnlAuthoringOpenInput?.({
      id: 'session:architecture',
      source: { uri: 'vfs://@/documents/architecture.xnl' },
    })).toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringOpenConfig?.({})).toEqual({ ok: true, issues: [] });

    for (const invalid of [
      { id: 'session:runtime', runtime: {} },
      { id: 'session:callback', source: { uri: 'vfs://@/documents/architecture.xnl', callback: () => undefined } },
      { id: 'session:writer', source: { uri: 'vfs://@/documents/architecture.xnl', writer: {} } },
      { id: 'session:persistence', source: { uri: 'vfs://@/documents/architecture.xnl', persistenceClient: {} } },
    ]) {
      const result = authoring.validateXnlAuthoringOpenInput?.(invalid);
      expect(result?.ok).toBe(false);
      expect(result?.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['OWNERSHIP_FIELD']),
      );
    }
    expect(authoring.validateXnlAuthoringOpenConfig?.({ registry: new Map() })).toMatchObject({ ok: false });

    const proposalPort = Object.freeze({
      state: () => ({ kind: 'xnl-authoring-session-state' }),
      subscribe: () => () => undefined,
      submit: () => Promise.resolve({ status: 'unchanged' }),
    });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'edit',
      proposal: proposalPort,
    })).toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({ mode: 'view' }))
      .toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'view',
      submit: proposalPort.submit,
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'edit',
      proposal: proposalPort,
      control: { dispose: () => undefined },
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'edit',
      proposal: { submit: proposalPort.submit },
    })).toMatchObject({ ok: false });

    for (const extra of [
      { control: { dispose: () => undefined } },
      { writer: { write: () => undefined } },
      { persistence: { persist: () => Promise.resolve() } },
      { extraCapability: () => undefined },
    ]) {
      expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
        mode: 'edit',
        proposal: { ...proposalPort, ...extra },
      })).toMatchObject({ ok: false });
    }

    let getterCalls = 0;
    const accessorProposal = {
      subscribe: proposalPort.subscribe,
      submit: proposalPort.submit,
    } as Record<string, unknown>;
    Object.defineProperty(accessorProposal, 'state', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return proposalPort.state;
      },
    });
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'edit',
      proposal: accessorProposal,
    })).toMatchObject({ ok: false });
    expect(getterCalls).toBe(0);

    const inheritedProposal = Object.create(proposalPort) as Record<string, unknown>;
    expect(authoring.validateXnlAuthoringScopeAuthoringFacet?.({
      mode: 'edit',
      proposal: inheritedProposal,
    })).toMatchObject({ ok: false });
  });

  it('keeps live revision, persisted revision, receipt, and persistence outcomes distinct', () => {
    const liveRevision = {
      kind: 'xnl-authoring-live-revision',
      sessionId: 'session:architecture',
      value: 'live:8',
    } as const;
    const previousPersistedRevision = {
      kind: 'xnl-authoring-persisted-revision',
      authorityId: 'authority:memory-vfs',
      value: 'vfs:11',
    } as const;
    const persistedRevision = {
      kind: 'xnl-authoring-persisted-revision',
      authorityId: 'authority:memory-vfs',
      value: 'vfs:12',
    } as const;
    const receipt = {
      kind: 'xnl-authoring-persistence-receipt',
      previousRevision: previousPersistedRevision,
      currentRevision: persistedRevision,
      persistedAt: '2026-07-31T18:56:49Z',
      durability: 'memory',
      metadata: { authority: 'memory-vfs' },
    } as const;
    const persistenceResults = [
      { status: 'applied', persistedRevision, receipt },
      { status: 'unchanged', persistedRevision },
      {
        status: 'conflict',
        expectedPersistedRevision: { ...persistedRevision, value: 'vfs:11' },
        actualPersistedRevision: persistedRevision,
      },
      {
        status: 'failed',
        expectedPersistedRevision: { ...persistedRevision, value: 'vfs:11' },
        diagnostics: [{ severity: 'error', code: 'WRITE_FAILED', message: 'The authority rejected the write.' }],
      },
    ] as const;

    for (const result of persistenceResults) {
      expect(authoring.validateXnlAuthoringPersistenceResult?.(result)).toEqual({ ok: true, issues: [] });
    }
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'unchanged',
      persistedRevision,
      receipt,
    })).toMatchObject({ ok: false });
    expect(JSON.stringify({ liveRevision, persistedRevision, receipt })).toContain('live:8');
  });

  it('fails closed for foreign revision scopes and incoherent applied receipts', () => {
    const liveRevision = {
      kind: 'xnl-authoring-live-revision',
      sessionId: 'session:a',
      value: 'revision:7',
    } as const;
    const foreignSessionRevision = {
      ...liveRevision,
      sessionId: 'session:b',
    } as const;
    const previousRevision = {
      kind: 'xnl-authoring-persisted-revision',
      authorityId: 'authority:a',
      value: 'revision:7',
    } as const;
    const currentRevision = {
      ...previousRevision,
      value: 'revision:8',
    } as const;
    const foreignAuthorityRevision = {
      ...currentRevision,
      authorityId: 'authority:b',
      value: previousRevision.value,
    } as const;
    const sameValueForeignAuthorityRevision = {
      ...currentRevision,
      authorityId: 'authority:b',
    } as const;
    const receipt = {
      kind: 'xnl-authoring-persistence-receipt',
      previousRevision,
      currentRevision,
      persistedAt: '2026-07-31T18:56:49Z',
      durability: 'workspace',
    } as const;

    expect(authoring.areXnlAuthoringLiveRevisionsEqual?.(liveRevision, liveRevision)).toBe(true);
    expect(authoring.areXnlAuthoringLiveRevisionsEqual?.(liveRevision, foreignSessionRevision)).toBe(false);
    expect(authoring.areXnlAuthoringPersistedRevisionsEqual?.(previousRevision, previousRevision)).toBe(true);
    expect(authoring.areXnlAuthoringPersistedRevisionsEqual?.(
      previousRevision,
      foreignAuthorityRevision,
    )).toBe(false);
    expect(authoring.validateXnlAuthoringAcceptedSnapshot?.({
      kind: 'xnl-authoring-accepted-snapshot',
      document: { kind: 'Document' },
      liveRevision: { kind: liveRevision.kind, value: liveRevision.value },
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'unchanged',
      persistedRevision: { kind: currentRevision.kind, value: currentRevision.value },
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'applied',
      persistedRevision: currentRevision,
      receipt: { ...receipt, previousRevision: foreignAuthorityRevision },
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'applied',
      persistedRevision: { ...currentRevision, value: 'revision:9' },
      receipt,
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'applied',
      persistedRevision: currentRevision,
      receipt: { ...receipt, currentRevision: previousRevision },
    })).toMatchObject({ ok: false });
    expect(authoring.validateXnlAuthoringPersistenceResult?.({
      status: 'conflict',
      expectedPersistedRevision: currentRevision,
      actualPersistedRevision: sameValueForeignAuthorityRevision,
    })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'FOREIGN_PERSISTENCE_AUTHORITY',
        message: expect.stringContaining('foreign persistence authority'),
      })]),
    });
  });

  it('allows optional absence and rejects explicit undefined as non-JSON evidence', () => {
    const baseLiveRevision = {
      kind: 'xnl-authoring-live-revision',
      sessionId: 'session:1',
      value: 'live:7',
    } as const;
    const absentOptional = {
      kind: 'xnl-authoring-proposal',
      id: 'proposal:absence',
      baseLiveRevision,
      command: { type: 'document.edit' },
      source: { occurrenceId: 'occurrence:1' },
    } as const;
    const explicitUndefined = {
      ...absentOptional,
      source: { occurrenceId: 'occurrence:1', xId: undefined },
    };

    expect(authoring.validateXnlAuthoringProposal?.(absentOptional)).toEqual({ ok: true, issues: [] });
    expect(authoring.validateXnlAuthoringProposal?.(explicitUndefined)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'NON_SERIALIZABLE_VALUE' })]),
    });
  });

  it('closes submit results over accepted, unchanged, rejected, conflict, and failed', () => {
    const liveRevision = {
      kind: 'xnl-authoring-live-revision',
      sessionId: 'session:architecture',
      value: 'live:8',
    } as const;
    const persistedRevision = {
      kind: 'xnl-authoring-persisted-revision',
      authorityId: 'authority:memory-vfs',
      value: 'vfs:12',
    } as const;
    const accepted = {
      kind: 'xnl-authoring-accepted-snapshot',
      document: { tag: 'Document', attributes: { '#id': 'architecture-document' } },
      liveRevision,
    } as const;
    const diagnostics = [{ severity: 'error', code: 'REJECTED', message: 'Candidate rejected.' }] as const;
    const submitResults = [
      { status: 'accepted', accepted, persistence: { status: 'unchanged', persistedRevision } },
      { status: 'unchanged', accepted },
      { status: 'rejected', liveRevision, diagnostics },
      {
        status: 'conflict',
        reason: 'stale-live-revision',
        expectedLiveRevision: { ...liveRevision, value: 'live:7' },
        actualLiveRevision: liveRevision,
      },
      { status: 'failed', liveRevision, diagnostics },
    ] as const;

    for (const result of submitResults) {
      expect(authoring.validateXnlAuthoringSubmitResult?.(result)).toEqual({ ok: true, issues: [] });
    }
    expect(authoring.validateXnlAuthoringSubmitResult?.({
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: liveRevision,
      actualLiveRevision: { ...liveRevision, sessionId: 'session:foreign' },
    })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'FOREIGN_LIVE_SESSION',
        message: expect.stringContaining('foreign live session'),
      })]),
    });
    expect(authoring.validateXnlAuthoringSubmitResult?.({ status: 'saved', accepted })).toMatchObject({ ok: false });
  });

  it('keeps contract and logic independent of XNL engines and renderer implementations', () => {
    expect(existsSync(CONTRACT_SRC), 'xnl-authoring contract capsule').toBe(true);

    const forbiddenDependency = /(?:from|import\s*\()\s*['"](?:xnl-core|xnl-vfs|xnl-vcs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom)(?:\/[^'"]*)?['"]/;
    const forbiddenRuntimeGlobal = /\b(?:window|document)\s*\.|\b(?:HTMLElement|NodeView|querySelector)\b/;

    for (const root of [CONTRACT_SRC, LOGIC_SRC]) {
      const source = readSources(root);
      expect(source, relative(dirname(CONTRACT_SRC), root)).not.toMatch(forbiddenDependency);
      expect(source, relative(dirname(CONTRACT_SRC), root)).not.toMatch(forbiddenRuntimeGlobal);
    }
  });
});
