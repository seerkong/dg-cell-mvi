import { describe, expect, it } from 'vitest';
import {
  parseXnl,
  wordToString,
  type DataElementNode,
  type XnlNode,
} from 'xnl-core';
import { MemoryRevisionedVfsAuthority } from 'xnl-vfs/revisioned-persistence';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  translateXnlProjectionInteraction,
  type XnlProjectionCompilerDialect,
  type XnlProjectionDomainPath,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
} from 'dg-cell-mvi-halfcode-logic';
import type {
  XnlAuthoringRuntime,
  XnlProjectionSerializableRecord,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createDefaultXnlProjectionDialect,
  createXnlAuthoringSessionFactory,
  createXnlCoreAuthoringMutationPort,
  createXnlProjectionRootInput,
  createXnlVfsAuthoringPersistencePort,
  type XnlCoreAuthoringMutation,
} from '../src';

interface RenameCommand {
  readonly type: 'document.rename-title';
  readonly target: {
    readonly path: XnlProjectionDomainPath;
    readonly nodeId?: string;
    readonly tag?: string;
    readonly sourceKind?: string;
    readonly role?: string;
    readonly sourceRef?: string;
  };
  readonly payload: {
    readonly title: string;
  };
  readonly provenance?: {
    readonly interactionId: string;
  };
}

interface ProjectionMeaning {
  readonly titlesByNodeId: Readonly<Record<string, string>>;
}

function parseRoot(source: string): DataElementNode {
  const root = parseXnl(source).nodes[0];
  if (!isDataElementNode(root)) {
    throw new Error('Expected a DataElement root fixture.');
  }
  return withoutUndefinedOptionals(structuredClone(root));
}

function isDataElementNode(value: unknown): value is DataElementNode {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'DataElement';
}

function withoutUndefinedOptionals<T extends DataElementNode>(node: T): T {
  if (node.attributes === undefined) delete node.attributes;
  if (node.body === undefined) delete node.body;
  if (node.extend === undefined) delete node.extend;
  for (const child of node.body ?? []) normalizeXnlOptionals(child);
  for (const child of Object.values(node.extend?.children ?? {})) normalizeXnlOptionals(child);
  return node;
}

function normalizeXnlOptionals(node: XnlNode): void {
  if (isDataElementNode(node)) {
    withoutUndefinedOptionals(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(normalizeXnlOptionals);
    return;
  }
  if (node !== null && typeof node === 'object') {
    Object.values(node as Record<string, XnlNode>).forEach(normalizeXnlOptionals);
  }
}

function compilePlan(node: XnlNode, dialect: XnlProjectionCompilerDialect<XnlNode>): XnlProjectionPlan {
  return compileXnlProjection(
    createXnlProjectionCompilerRuntime({ dialects: [dialect] }),
    createXnlProjectionRootInput(node, {
      role: 'document',
      sourceRef: 'vfs://./put-get-oracle.xnl',
    }),
    { planId: 'put-get.semantic-oracle' },
  );
}

function createRenameDialect(): XnlProjectionCompilerDialect<XnlNode> {
  const dialect = createDefaultXnlProjectionDialect();
  return {
    ...dialect,
    id: 'xnl-projection.put-get-rename-dialect',
    translateInteraction: (_runtime, input) => {
      if (input.interaction.type !== 'projection.rename-title') {
        return {
          status: 'unsupported',
          diagnostics: [{
            severity: 'error',
            code: 'UNSUPPORTED_PUT_GET_INTERACTION',
            message: `Unsupported interaction "${input.interaction.type}".`,
          }],
        };
      }
      const payload = input.interaction.payload;
      if (
        payload === null
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || typeof (payload as { title?: unknown }).title !== 'string'
      ) {
        return {
          status: 'rejected',
          diagnostics: [{
            severity: 'error',
            code: 'INVALID_PUT_GET_TITLE',
            message: 'Rename interaction payload must contain a string title.',
          }],
        };
      }
      return {
        status: 'translated',
        command: {
          type: 'document.rename-title',
          target: {
            path: input.planNode.domain.path,
            ...(input.planNode.domain.nodeId !== undefined ? { nodeId: input.planNode.domain.nodeId } : {}),
            ...(input.planNode.domain.tag !== undefined ? { tag: input.planNode.domain.tag } : {}),
            ...(input.planNode.domain.sourceKind !== undefined ? { sourceKind: input.planNode.domain.sourceKind } : {}),
            ...(input.planNode.domain.role !== undefined ? { role: input.planNode.domain.role } : {}),
            ...(input.planNode.domain.sourceRef !== undefined ? { sourceRef: input.planNode.domain.sourceRef } : {}),
          },
          payload: {
            title: (payload as { title: string }).title,
          },
          provenance: {
            interactionId: input.interaction.id ?? 'anonymous',
          },
        },
      };
    },
  };
}

function semanticMeaning(plan: XnlProjectionPlan): ProjectionMeaning {
  const titles = new Map<string, string>();
  const visit = (node: XnlProjectionPlanNode): void => {
    const nodeId = node.domain.nodeId;
    const title = titleFromPlanNode(node);
    if (nodeId !== undefined && title !== undefined) titles.set(nodeId, title);
    node.children.forEach(visit);
  };
  visit(plan.root);
  return {
    titlesByNodeId: Object.freeze(Object.fromEntries([...titles].sort())),
  };
}

function titleFromPlanNode(node: XnlProjectionPlanNode): string | undefined {
  const data = node.data as
    | {
        readonly metadata?: readonly { readonly key: string; readonly value: unknown }[];
      }
    | undefined;
  const value = data?.metadata?.find((entry) => entry.key === 'title')?.value;
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'literal.string'
    ? (value as { value: string }).value
    : undefined;
}

function requirePlanNodeByNodeId(plan: XnlProjectionPlan, nodeId: string): XnlProjectionPlanNode {
  const found = findPlanNodeByNodeId(plan.root, nodeId);
  if (found === undefined) throw new Error(`Missing plan node "${nodeId}".`);
  return found;
}

function findPlanNodeByNodeId(node: XnlProjectionPlanNode, nodeId: string): XnlProjectionPlanNode | undefined {
  if (node.domain.nodeId === nodeId) return node;
  for (const child of node.children) {
    const found = findPlanNodeByNodeId(child, nodeId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function createAuthoringRuntime(
  persistence: ReturnType<typeof createXnlVfsAuthoringPersistencePort>,
): XnlAuthoringRuntime<XnlNode, RenameCommand, XnlCoreAuthoringMutation> {
  let liveRevision = 0;
  return {
    domain: {
      materializeCandidate: (_runtime, input) =>
        materializeRenameCommand(input.accepted.document, input.proposal.command),
      validateCandidate: (_runtime, input) => {
        const intended = input.proposal.command.payload.title;
        const plan = compilePlan(input.candidate.document, createRenameDialect());
        const actual = semanticMeaning(plan).titlesByNodeId[input.proposal.command.target.nodeId ?? ''];
        return actual === intended
          ? { status: 'valid' }
          : {
              status: 'rejected',
              diagnostics: [{
                severity: 'error',
                code: 'PUT_GET_SEMANTIC_ORACLE_MISMATCH',
                message: `Expected "${intended}", got "${String(actual)}".`,
              }],
            };
      },
    },
    mutations: createXnlCoreAuthoringMutationPort<RenameCommand>(),
    persistence: persistence as unknown as XnlAuthoringRuntime<
      XnlNode,
      RenameCommand,
      XnlCoreAuthoringMutation
    >['persistence'],
    revision: {
      nextLiveRevision: () => ({
        kind: 'xnl-authoring-live-revision',
        sessionId: 'session:put-get-oracle',
        value: `live:${++liveRevision}`,
      }),
    },
    invalidation: {
      publish: () => undefined,
    },
  };
}

function materializeRenameCommand(
  accepted: Readonly<XnlNode>,
  command: RenameCommand,
): XnlNode {
  const candidate = structuredClone(accepted) as XnlNode;
  const targetId = command.target.nodeId;
  if (targetId === undefined) throw new Error('Rename command target must carry a domain nodeId.');
  const target = findElementById(candidate, targetId);
  if (target === undefined) throw new Error(`Rename command target "${targetId}" was not found.`);
  target.metadata = {
    ...target.metadata,
    title: command.payload.title,
  } as DataElementNode['metadata'];
  if (!isDataElementNode(candidate)) {
    throw new Error('Rename command accepted document must be a DataElement root.');
  }
  return withoutUndefinedOptionals(candidate);
}

function findElementById(node: XnlNode, nodeId: string): DataElementNode | undefined {
  if (isDataElementNode(node)) {
    if (node.id !== undefined && wordToString(node.id) === nodeId) return node;
    for (const child of node.body ?? []) {
      const found = findElementById(child, nodeId);
      if (found !== undefined) return found;
    }
    for (const child of Object.values(node.extend?.children ?? {})) {
      const found = findElementById(child, nodeId);
      if (found !== undefined) return found;
    }
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementById(child, nodeId);
      if (found !== undefined) return found;
    }
  }
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const child of Object.values(node as Record<string, XnlNode>)) {
      const found = findElementById(child, nodeId);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function collectOwnKeys(value: unknown, keys = new Set<string>()): ReadonlySet<string> {
  if (value === null || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectOwnKeys(item, keys));
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectOwnKeys(child, keys);
  }
  return keys;
}

describe('renderer-neutral authoring PutGet semantic oracle', () => {
  it('recompiles accepted Domain XNL to the intended interaction meaning', async () => {
    const initialDocument = parseRoot(`
      <Document #doc title="System Design" [
        <Section #overview title="Overview">
        <Section #constraints title="Constraints">
      ]>
    `);
    const dialect = createRenameDialect();
    const firstPlan = compilePlan(initialDocument, dialect);
    const overview = requirePlanNodeByNodeId(firstPlan, 'overview');
    const beforeMeaning = semanticMeaning(firstPlan);
    const intendedMeaning: ProjectionMeaning = {
      titlesByNodeId: {
        ...beforeMeaning.titlesByNodeId,
        overview: 'Published Overview',
      },
    };

    const translated = translateXnlProjectionInteraction(
      createXnlProjectionCompilerRuntime({ dialects: [dialect] }),
      {
        planNode: overview,
        interaction: {
          id: 'interaction:rename-overview',
          type: 'projection.rename-title',
          target: { planNodeId: overview.id },
          payload: { title: 'Published Overview' },
        },
      },
      { reason: 'ignored-invocation-data' } as XnlProjectionSerializableRecord,
    );
    expect(translated.status).toBe('translated');
    if (translated.status !== 'translated') {
      throw new Error('Expected Projection interaction translation to produce a Domain Command.');
    }
    expect(translated.command).toMatchObject({
      type: 'document.rename-title',
      target: {
        nodeId: 'overview',
        path: ['body', 0],
      },
      payload: { title: 'Published Overview' },
    });

    const persistence = createXnlVfsAuthoringPersistencePort(
      new MemoryRevisionedVfsAuthority(initialDocument, {
        authorityId: 'authority:put-get-oracle',
        clock: () => '2026-08-01T00:00:00.000Z',
        revisionFactory: (sequence) => `vfs:${sequence + 1}`,
      }),
    );
    const runtime = createAuthoringRuntime(persistence);
    const session = await createXnlAuthoringSessionFactory<
      XnlNode,
      RenameCommand,
      XnlCoreAuthoringMutation
    >().open(runtime, { id: 'session:put-get-oracle' }, {});

    const accepted = await session.proposal.submit({
      kind: 'xnl-authoring-proposal',
      id: 'proposal:rename-overview',
      baseLiveRevision: session.proposal.state().accepted.liveRevision,
      command: translated.command as RenameCommand,
      source: {
        occurrenceId: 'occurrence:neutral-presenter',
        xId: 'overview-title-control',
      },
    }, {});

    expect(accepted.status).toBe('accepted');
    if (accepted.status !== 'accepted') throw new Error('Expected owner session to accept the edit.');
    expect(accepted.persistence.status).toBe('applied');
    expect(session.proposal.state().status).toBe('ready');

    const recompiled = compilePlan(accepted.accepted.document, dialect);
    expect(semanticMeaning(recompiled)).toEqual(intendedMeaning);
    expect(semanticMeaning(firstPlan)).toEqual(beforeMeaning);
    expect(collectOwnKeys(recompiled)).not.toContain('writer');
    expect(collectOwnKeys(recompiled)).not.toContain('mutationWriter');
    expect(collectOwnKeys(recompiled)).not.toContain('vfsClient');
  });
});
