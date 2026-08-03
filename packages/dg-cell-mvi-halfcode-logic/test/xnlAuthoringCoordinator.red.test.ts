import { describe, expect, it } from 'vitest';
import {
  XNL_AUTHORING_IDENTITY_RULES,
  type XnlAuthoringAcceptedSnapshot,
  type XnlAuthoringCandidateValidationResult,
  type XnlAuthoringCoordinatorInput,
  type XnlAuthoringCoordinatorResult,
  type XnlAuthoringDiagnostic,
  type XnlAuthoringDiffInput,
  type XnlAuthoringDryRunInput,
  type XnlAuthoringDryRunResult,
  type XnlAuthoringLiveRevision,
  type XnlAuthoringMaterializeInput,
  type XnlAuthoringProposal,
  type XnlAuthoringRuntime,
  type XnlAuthoringSubmitConfig,
  type XnlAuthoringValidateCandidateInput,
} from 'dg-cell-mvi-halfcode-contract';
import { submitAuthoringEdit } from '../src';

interface DocumentNode {
  readonly tag: string;
  readonly attributes: {
    readonly '#id': string;
    readonly title?: string;
  };
  readonly text?: string;
  readonly children?: readonly DocumentNode[];
}

type RenameCommand = {
  readonly type: 'document.rename-title';
  readonly targetId: string;
  readonly title: string;
};

type NoopCommand = {
  readonly type: 'document.noop';
  readonly targetId: string;
};

type Command = RenameCommand | NoopCommand;

type Mutation =
  | {
      readonly kind: 'set-text';
      readonly path: readonly (string | number)[];
      readonly value: string;
    }
  | {
      readonly kind: 'move-node';
      readonly path: readonly (string | number)[];
      readonly id: string;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: 'delete-node';
      readonly path: readonly (string | number)[];
      readonly id: string;
    }
  | {
      readonly kind: 'add-node';
      readonly path: readonly (string | number)[];
      readonly id: string;
      readonly node: DocumentNode;
    }
  | {
      readonly kind: 'update-field';
      readonly path: readonly (string | number)[];
      readonly value: string;
    };

type CapabilityCall =
  | { readonly name: 'materialize'; readonly input: XnlAuthoringMaterializeInput<DocumentNode, Command> }
  | { readonly name: 'diff'; readonly input: XnlAuthoringDiffInput<DocumentNode> }
  | { readonly name: 'dryRun'; readonly input: XnlAuthoringDryRunInput<DocumentNode, Mutation> }
  | { readonly name: 'validate'; readonly input: XnlAuthoringValidateCandidateInput<DocumentNode, Command, Mutation> }
  | { readonly name: 'persist' | 'read' | 'nextLiveRevision' | 'publish' };

type RuntimeBehavior = {
  readonly candidateDocument?: DocumentNode;
  readonly mutations?: readonly Mutation[];
  readonly dryRunResult?: XnlAuthoringDryRunResult<DocumentNode>;
  readonly validationResult?: XnlAuthoringCandidateValidationResult;
  readonly materializeThrows?: Error;
  readonly diffThrows?: Error;
  readonly dryRunThrows?: Error;
  readonly validateThrows?: Error;
  readonly rawCandidateDocument?: unknown;
  readonly rawMutations?: unknown;
  readonly rawDryRunResult?: unknown;
  readonly rawValidationResult?: unknown;
};

const acceptedRevision: XnlAuthoringLiveRevision = {
  kind: 'xnl-authoring-live-revision',
  sessionId: 'session:document',
  value: 'live:7',
};

const acceptedDocument: DocumentNode = {
  tag: 'Document',
  attributes: { '#id': 'doc:architecture', title: 'Checkout Architecture' },
  children: [
    {
      tag: 'Section',
      attributes: { '#id': 'section:overview', title: 'Overview' },
      text: 'Current overview',
    },
  ],
};

const candidateDocument: DocumentNode = {
  ...acceptedDocument,
  attributes: { ...acceptedDocument.attributes, title: 'Checkout Platform Architecture' },
};

const mutationBatch: readonly Mutation[] = [{
  kind: 'set-text',
  path: ['attributes', 'title'],
  value: 'Checkout Platform Architecture',
}];

function accepted(document: DocumentNode = acceptedDocument): XnlAuthoringAcceptedSnapshot<DocumentNode> {
  return {
    kind: 'xnl-authoring-accepted-snapshot',
    document,
    liveRevision: acceptedRevision,
  };
}

function proposal(
  overrides: Partial<XnlAuthoringProposal<Command>> = {},
): XnlAuthoringProposal<Command> {
  return {
    kind: 'xnl-authoring-proposal',
    id: 'proposal:rename-title',
    baseLiveRevision: acceptedRevision,
    command: {
      type: 'document.rename-title',
      targetId: 'doc:architecture',
      title: 'Checkout Platform Architecture',
    },
    source: { occurrenceId: 'occurrence:editor', xId: 'title-field' },
    ...overrides,
  };
}

function diagnostic(code: string, message = code): XnlAuthoringDiagnostic {
  return { severity: 'error', code, message };
}

function makeRuntime(
  calls: CapabilityCall[],
  behavior: RuntimeBehavior = {},
): XnlAuthoringRuntime<DocumentNode, Command, Mutation> {
  return {
    domain: {
      materializeCandidate: async (_runtime, input) => {
        calls.push({ name: 'materialize', input });
        if (behavior.materializeThrows) throw behavior.materializeThrows;
        return (behavior.rawCandidateDocument ?? behavior.candidateDocument ?? candidateDocument) as DocumentNode;
      },
      validateCandidate: async (_runtime, input) => {
        calls.push({ name: 'validate', input });
        if (behavior.validateThrows) throw behavior.validateThrows;
        return (behavior.rawValidationResult ?? behavior.validationResult ?? { status: 'valid' }) as XnlAuthoringCandidateValidationResult;
      },
    },
    mutations: {
      diff: async (_runtime, input) => {
        calls.push({ name: 'diff', input });
        if (behavior.diffThrows) throw behavior.diffThrows;
        return (behavior.rawMutations ?? behavior.mutations ?? mutationBatch) as readonly Mutation[];
      },
      dryRun: async (_runtime, input) => {
        calls.push({ name: 'dryRun', input });
        if (behavior.dryRunThrows) throw behavior.dryRunThrows;
        return (behavior.rawDryRunResult ?? behavior.dryRunResult ?? {
          status: 'applied',
          document: behavior.candidateDocument ?? candidateDocument,
          affectedIdentities: ['doc:architecture'],
        }) as XnlAuthoringDryRunResult<DocumentNode>;
      },
    },
    persistence: {
      read: async () => {
        calls.push({ name: 'read' });
        throw new Error('pure coordinator must not read persistence');
      },
      persist: async () => {
        calls.push({ name: 'persist' });
        throw new Error('pure coordinator must not persist');
      },
    },
    revision: {
      nextLiveRevision: async () => {
        calls.push({ name: 'nextLiveRevision' });
        throw new Error('pure coordinator must not allocate live revisions');
      },
    },
    invalidation: {
      publish: async () => {
        calls.push({ name: 'publish' });
        throw new Error('pure coordinator must not publish invalidation');
      },
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

async function coordinate(
  runtime: XnlAuthoringRuntime<DocumentNode, Command, Mutation>,
  input: XnlAuthoringCoordinatorInput<DocumentNode, Command>,
): Promise<XnlAuthoringCoordinatorResult<DocumentNode, Mutation>> {
  return await submitAuthoringEdit(runtime, input, { policy: { conflict: 'reject' } });
}

describe('xnl-authoring pure coordinator red tests', () => {
  it('exports the runtime-first pure authoring coordinator API from logic', () => {
    expect(submitAuthoringEdit).toBeTypeOf('function');
  });

  it('returns stale conflict before materialization and compares live revisions by sessionId plus value', async () => {
    const calls: CapabilityCall[] = [];
    const sameValueForeignSession = {
      ...acceptedRevision,
      sessionId: 'session:foreign',
    };
    const result = await coordinate(makeRuntime(calls), {
      accepted: accepted(),
      proposal: proposal({ baseLiveRevision: sameValueForeignSession }),
    });

    expect(result).toMatchObject({
      status: 'conflict',
      reason: 'stale-live-revision',
      expectedLiveRevision: sameValueForeignSession,
      actualLiveRevision: acceptedRevision,
    });
    expect(calls).toEqual([]);
  });

  it('orders capabilities as materialize -> diff -> dryRun(identity) -> validate for an acceptable candidate', async () => {
    const calls: CapabilityCall[] = [];
    const result = await coordinate(makeRuntime(calls), {
      accepted: accepted(),
      proposal: proposal(),
    });

    expect(calls.map(({ name }) => name)).toEqual(['materialize', 'diff', 'dryRun', 'validate']);
    const diffCall = calls.find((call): call is Extract<CapabilityCall, { name: 'diff' }> => call.name === 'diff');
    expect(diffCall?.input).toEqual({
      acceptedDocument,
      candidateDocument,
    });

    const dryRunCall = calls.find((call): call is Extract<CapabilityCall, { name: 'dryRun' }> => call.name === 'dryRun');
    expect(dryRunCall?.input).toMatchObject({
      acceptedDocument,
      metadataIdMode: 'identity',
    });
    expect(dryRunCall?.input.mutations).toEqual(mutationBatch);

    const validateCall = calls.find((call): call is Extract<CapabilityCall, { name: 'validate' }> => call.name === 'validate');
    expect(validateCall?.input.candidate).toEqual({
      kind: 'xnl-authoring-candidate',
      baseLiveRevision: acceptedRevision,
      document: candidateDocument,
      mutations: mutationBatch,
      affectedIdentities: ['doc:architecture'],
    });
    expect(result).toEqual({
      status: 'candidate',
      candidate: validateCall?.input.candidate,
    });
  });

  it('short-circuits diff no-op as unchanged without dry-run or validation', async () => {
    const calls: CapabilityCall[] = [];
    const result = await coordinate(makeRuntime(calls, {
      candidateDocument: acceptedDocument,
      mutations: [],
    }), {
      accepted: accepted(),
      proposal: proposal({ command: { type: 'document.noop', targetId: 'doc:architecture' } }),
    });

    expect(calls.map(({ name }) => name)).toEqual(['materialize', 'diff']);
    expect(result).toEqual({
      status: 'unchanged',
      accepted: accepted(),
    });
  });

  it('maps dry-run rejection to rejected and does not call domain validation', async () => {
    const calls: CapabilityCall[] = [];
    const result = await coordinate(makeRuntime(calls, {
      dryRunResult: {
        status: 'rejected',
        diagnostics: [diagnostic('IDENTITY_REPLACEMENT_REQUIRES_DELETE_ADD')],
      },
    }), {
      accepted: accepted(),
      proposal: proposal(),
    });

    expect(calls.map(({ name }) => name)).toEqual(['materialize', 'diff', 'dryRun']);
    expect(result).toMatchObject({
      status: 'rejected',
      liveRevision: acceptedRevision,
      diagnostics: [diagnostic('IDENTITY_REPLACEMENT_REQUIRES_DELETE_ADD')],
    });
    expect('candidate' in result).toBe(false);
  });

  it('maps domain validation rejection to rejected without producing an acceptable candidate', async () => {
    const calls: CapabilityCall[] = [];
    const result = await coordinate(makeRuntime(calls, {
      validationResult: {
        status: 'rejected',
        diagnostics: [diagnostic('DOMAIN_RULE_REJECTED', 'A title is required.')],
      },
    }), {
      accepted: accepted(),
      proposal: proposal(),
    });

    expect(calls.map(({ name }) => name)).toEqual(['materialize', 'diff', 'dryRun', 'validate']);
    expect(result).toEqual({
      status: 'rejected',
      liveRevision: acceptedRevision,
      diagnostics: [diagnostic('DOMAIN_RULE_REJECTED', 'A title is required.')],
    });
    expect('candidate' in result).toBe(false);
  });

  it('maps thrown runtime capabilities to failed diagnostics and leaves input facts untouched', async () => {
    const calls: CapabilityCall[] = [];
    const frozenAccepted = deepFreeze(accepted());
    const frozenProposal = deepFreeze(proposal());
    const before = clone({ frozenAccepted, frozenProposal });
    const result = await coordinate(makeRuntime(calls, {
      diffThrows: new Error('diff exploded'),
    }), {
      accepted: frozenAccepted,
      proposal: frozenProposal,
    });

    expect(calls.map(({ name }) => name)).toEqual(['materialize', 'diff']);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('Expected failed result.');
    expect(result.liveRevision).toEqual(acceptedRevision);
    expect(result.diagnostics.some((item) =>
      item.severity === 'error' && item.message.includes('diff exploded'),
    )).toBe(true);
    expect({ frozenAccepted, frozenProposal }).toEqual(before);
  });

  it('does not mutate accepted snapshots, proposal commands, materialized candidates, or mutation batches', async () => {
    const calls: CapabilityCall[] = [];
    const frozenAccepted = deepFreeze(accepted(clone(acceptedDocument)));
    const frozenProposal = deepFreeze(proposal());
    const frozenCandidate = deepFreeze(clone(candidateDocument));
    const frozenMutations = deepFreeze(clone(mutationBatch));
    const before = clone({
      acceptedSnapshot: frozenAccepted,
      proposalCommand: frozenProposal.command,
      candidate: frozenCandidate,
      mutations: frozenMutations,
    });

    const result = await coordinate(makeRuntime(calls, {
      candidateDocument: frozenCandidate,
      mutations: frozenMutations,
    }), {
      accepted: frozenAccepted,
      proposal: frozenProposal,
    });

    expect(result.status).toBe('candidate');
    expect({
      acceptedSnapshot: frozenAccepted,
      proposalCommand: frozenProposal.command,
      candidate: frozenCandidate,
      mutations: frozenMutations,
    }).toEqual(before);
    expect(Object.isFrozen(frozenAccepted.document)).toBe(true);
    expect(Object.isFrozen(frozenProposal.command)).toBe(true);
    expect(Object.isFrozen(frozenCandidate)).toBe(true);
    expect(Object.isFrozen(frozenMutations)).toBe(true);
  });

  it('preserves renderer-neutral PutGet preconditions and treats #id as identity, not payload', async () => {
    const calls: CapabilityCall[] = [];
    const movedDocument: DocumentNode = {
      ...acceptedDocument,
      children: [
        {
          tag: 'Section',
          attributes: { '#id': 'section:details', title: 'Details' },
          text: 'Replacement section',
        },
        ...(acceptedDocument.children ?? []),
      ],
    };
    const identityMutations: readonly Mutation[] = [
      { kind: 'move-node', path: ['children'], id: 'section:overview', from: 0, to: 1 },
      { kind: 'delete-node', path: ['children', 0], id: 'section:details-old' },
      {
        kind: 'add-node',
        path: ['children', 0],
        id: 'section:details',
        node: movedDocument.children?.[0] ?? movedDocument,
      },
    ];
    const result = await coordinate(makeRuntime(calls, {
      candidateDocument: movedDocument,
      mutations: identityMutations,
      dryRunResult: {
        status: 'applied',
        document: movedDocument,
        affectedIdentities: ['section:overview', 'section:details', 'section:overview'],
      },
    }), {
      accepted: accepted(),
      proposal: proposal(),
    });

    const dryRunCall = calls.find((call): call is Extract<CapabilityCall, { name: 'dryRun' }> => call.name === 'dryRun');
    expect(XNL_AUTHORING_IDENTITY_RULES).toEqual({
      metadataIdRole: 'tree-alignment-and-move-identity',
      ordinaryPayloadUpdate: false,
      replacement: 'delete-and-add',
    });
    expect(dryRunCall?.input.metadataIdMode).toBe('identity');
    expect(dryRunCall?.input.mutations).toEqual(identityMutations);
    expect(identityMutations.some((mutation) =>
      mutation.kind === 'update-field' && mutation.path.includes('#id'),
    )).toBe(false);
    expect(identityMutations.map(({ kind }) => kind)).toEqual(['move-node', 'delete-node', 'add-node']);
    expect(result).toMatchObject({
      status: 'candidate',
      candidate: {
        document: movedDocument,
        mutations: identityMutations,
        affectedIdentities: ['section:details', 'section:overview'],
      },
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain('tiptap');
  });

  it('uses the dry-run applied document rather than the unverified materialized draft', async () => {
    const calls: CapabilityCall[] = [];
    const materializedDraft: DocumentNode = {
      ...acceptedDocument,
      attributes: { ...acceptedDocument.attributes, title: 'Unverified draft title' },
    };
    const appliedDocument: DocumentNode = {
      ...acceptedDocument,
      attributes: { ...acceptedDocument.attributes, title: 'Dry-run applied title' },
    };
    const result = await coordinate(makeRuntime(calls, {
      candidateDocument: materializedDraft,
      dryRunResult: {
        status: 'applied',
        document: appliedDocument,
        affectedIdentities: ['doc:architecture'],
      },
    }), {
      accepted: accepted(),
      proposal: proposal(),
    });

    expect(result).toMatchObject({
      status: 'candidate',
      candidate: {
        document: appliedDocument,
      },
    });
    expect(result).not.toMatchObject({
      candidate: {
        document: materializedDraft,
      },
    });
  });

  it.each([
    {
      name: 'non-serializable materialized document',
      behavior: { rawCandidateDocument: { ...candidateDocument, callback: () => undefined } },
      calls: ['materialize'],
    },
    {
      name: 'non-array mutation batch',
      behavior: { rawMutations: { kind: 'not-an-array' } },
      calls: ['materialize', 'diff'],
    },
    {
      name: 'unknown dry-run status',
      behavior: { rawDryRunResult: { status: 'accepted', document: candidateDocument, affectedIdentities: [] } },
      calls: ['materialize', 'diff', 'dryRun'],
    },
    {
      name: 'malformed dry-run diagnostic',
      behavior: { rawDryRunResult: { status: 'rejected', diagnostics: [{ severity: 'fatal', code: 'BAD', message: 'bad' }] } },
      calls: ['materialize', 'diff', 'dryRun'],
    },
    {
      name: 'unknown validation status',
      behavior: { rawValidationResult: { status: 'accepted' } },
      calls: ['materialize', 'diff', 'dryRun', 'validate'],
    },
    {
      name: 'malformed validation diagnostic',
      behavior: { rawValidationResult: { status: 'valid', diagnostics: [{ severity: 'error', code: '', message: '' }] } },
      calls: ['materialize', 'diff', 'dryRun', 'validate'],
    },
  ])('fails closed for $name capability output', async ({ behavior, calls: expectedCalls }) => {
    const calls: CapabilityCall[] = [];
    const result = await coordinate(makeRuntime(calls, behavior), {
      accepted: accepted(),
      proposal: proposal(),
    });

    expect(result).toMatchObject({
      status: 'failed',
      liveRevision: acceptedRevision,
    });
    expect(calls.map(({ name }) => name)).toEqual(expectedCalls);
  });

  it('does not invoke getter-backed materialized output while failing closed', async () => {
    let getterCalls = 0;
    const malformed = { tag: 'Document', attributes: {}, children: [] } as Record<string, unknown>;
    Object.defineProperty(malformed, 'runtime', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return {};
      },
    });
    const calls: CapabilityCall[] = [];

    await expect(coordinate(makeRuntime(calls, { rawCandidateDocument: malformed }), {
      accepted: accepted(),
      proposal: proposal(),
    })).resolves.toMatchObject({ status: 'failed' });
    expect(getterCalls).toBe(0);
    expect(calls.map(({ name }) => name)).toEqual(['materialize']);
  });
});
