import { describe, expect, it } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  XNL_RICH_DOCUMENT_CLASSIFICATION_IDS,
  XNL_RICH_DOCUMENT_IDENTITY_RULES,
  classifyXnlRichDocumentIdentity,
  lowerXnlRichDocument,
  normalizeXnlRichDocument,
  parseXnlRichDocumentCandidate,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionSerializableValue,
  type XnlRichDocument,
  type XnlRichDocumentNode,
} from '../src';

const EMPTY_RUNTIME = Object.freeze({});
const EMPTY_CONFIG = Object.freeze({});
const PRESENTER = Object.freeze({ id: 'rich-document.canonical-fixture' });

function nodeChildren(node: XnlRichDocumentNode): readonly XnlRichDocumentNode[] {
  if (node.kind === 'text') return [];
  if (node.kind === 'paragraph' || node.kind === 'heading') return node.content;
  return 'children' in node ? node.children : [];
}

function nodeData(node: XnlRichDocumentNode): XnlProjectionSerializableValue | undefined {
  switch (node.kind) {
    case 'heading': return { level: node.level };
    case 'ordered-list': return node.start === undefined ? {} : { start: node.start };
    case 'image': return {
      src: node.src,
      ...(node.alt === undefined ? {} : { alt: node.alt }),
      ...(node.title === undefined ? {} : { title: node.title }),
    };
    case 'table-cell':
    case 'table-header': return {
      ...(node.colspan === undefined ? {} : { colspan: node.colspan }),
      ...(node.rowspan === undefined ? {} : { rowspan: node.rowspan }),
    };
    case 'code-block': return {
      ...(node.language === undefined ? {} : { language: node.language }),
      text: node.text,
    };
    case 'mermaid': return { source: node.source };
    case 'component-embed': return {
      ref: node.component.ref,
      ...(node.component.version === undefined ? {} : { version: node.component.version }),
      ...(node.input === undefined ? {} : { input: node.input }),
    };
    case 'capsule-embed': return {
      ref: node.capsule.ref,
      ...(node.capsule.version === undefined ? {} : { version: node.capsule.version }),
      ...(node.input === undefined ? {} : { input: node.input }),
    };
    case 'text': return {
      text: node.text,
      ...(node.marks === undefined ? {} : { marks: node.marks }),
    };
    default: return undefined;
  }
}

function toPlanNode(
  node: XnlRichDocumentNode,
  path: readonly number[] = [],
): XnlProjectionPlanNode {
  const data = nodeData(node);
  return {
    kind: 'xnl-projection-plan-node',
    id: `plan:${path.length === 0 ? 'root' : path.join('.')}`,
    domain: {
      path,
      ...(node.kind === 'text' ? {} : { nodeId: node.nodeId }),
    },
    classification: { id: XNL_RICH_DOCUMENT_CLASSIFICATION_IDS[node.kind] },
    presenter: PRESENTER,
    ...(data === undefined ? {} : { data }),
    children: nodeChildren(node).map((child, index) => toPlanNode(child, [...path, index])),
  };
}

function canonicalPlan(): XnlProjectionPlan {
  return {
    kind: 'xnl-projection-plan',
    id: 'rich-document:canonical-fixture',
    root: toPlanNode(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE),
  };
}

function persistentIds(document: XnlRichDocument): readonly string[] {
  const ids: string[] = [];
  const visit = (node: XnlRichDocumentNode): void => {
    if (node.kind !== 'text') ids.push(node.nodeId);
    nodeChildren(node).forEach(visit);
  };
  visit(document);
  return ids;
}

function marks(document: XnlRichDocument): readonly string[] {
  const kinds: string[] = [];
  const visit = (node: XnlRichDocumentNode): void => {
    if (node.kind === 'text') kinds.push(...(node.marks ?? []).map((mark) => mark.kind));
    nodeChildren(node).forEach(visit);
  };
  visit(document);
  return kinds;
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}

describe('canonical RichDocument logic regression', () => {
  it('normalizes, parses, and lowers the shared fixture deterministically and immutably', () => {
    const plan = canonicalPlan();
    const planBefore = structuredClone(plan);
    const fixtureBefore = JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);

    const normalized = normalizeXnlRichDocument(
      EMPTY_RUNTIME,
      { candidate: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      EMPTY_CONFIG,
    );
    const parsed = parseXnlRichDocumentCandidate(
      EMPTY_RUNTIME,
      { candidate: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE },
      EMPTY_CONFIG,
    );
    const lowered = lowerXnlRichDocument(EMPTY_RUNTIME, { plan }, EMPTY_CONFIG);
    const loweredAgain = lowerXnlRichDocument(EMPTY_RUNTIME, { plan }, EMPTY_CONFIG);

    expect(normalized).toEqual(parsed);
    expect(lowered).toEqual(loweredAgain);
    expect(lowered).toEqual({ status: 'normalized', document: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE });
    expect(plan).toEqual(planBefore);
    expect(JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE)).toBe(fixtureBefore);
    expectDeepFrozen(normalized);
    expectDeepFrozen(lowered);
  });

  it('satisfies canonical GetPut without identity, order, or mark drift', () => {
    const lowered = lowerXnlRichDocument(EMPTY_RUNTIME, { plan: canonicalPlan() }, EMPTY_CONFIG);
    expect(lowered.status).toBe('normalized');
    if (lowered.status !== 'normalized') throw new Error('expected canonical lowering');

    const getPut = parseXnlRichDocumentCandidate(
      EMPTY_RUNTIME,
      { candidate: lowered.document },
      EMPTY_CONFIG,
    );
    expect(getPut).toEqual(lowered);
    if (getPut.status !== 'normalized') throw new Error('expected canonical GetPut');
    expect(persistentIds(getPut.document)).toEqual(persistentIds(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE));
    expect(getPut.document.children.map((node) => node.kind))
      .toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children.map((node) => node.kind));
    expect(marks(getPut.document)).toEqual(marks(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE));
  });

  it('uses persistent #id for alignment and moves, never as an ordinary payload update', () => {
    const [heading, paragraph, ...rest] = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children;
    if (heading === undefined || paragraph === undefined) throw new Error('fixture is incomplete');
    const moved: XnlRichDocument = {
      ...XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
      children: [paragraph, heading, ...rest],
    };
    const result = classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, {
      accepted: XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
      candidate: moved,
    }, EMPTY_CONFIG);

    expect(result.status).toBe('classified');
    if (result.status !== 'classified') throw new Error('expected identity classification');
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ classification: 'move', nodeId: heading.nodeId }),
      expect.objectContaining({ classification: 'move', nodeId: paragraph.nodeId }),
    ]));
    expect(result.changes.some((change) => change.classification === ('update-id' as never))).toBe(false);
    expect(XNL_RICH_DOCUMENT_IDENTITY_RULES.ordinaryPayloadUpdate).toBe(false);
  });

  it('fails closed for unsupported candidate and Projection classifications', () => {
    const unsupportedCandidate = {
      ...XNL_RICH_DOCUMENT_CANONICAL_FIXTURE,
      children: [
        ...XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children,
        { kind: 'video', nodeId: 'video.unsupported', src: 'vfs://./video.mp4' },
      ],
    };
    const plan = canonicalPlan();
    const firstChild = plan.root.children[0];
    if (firstChild === undefined) throw new Error('fixture plan is incomplete');
    const unsupportedPlan: XnlProjectionPlan = {
      ...plan,
      root: {
        ...plan.root,
        children: [
          { ...firstChild, classification: { id: 'xnl.rich-document:video' } },
          ...plan.root.children.slice(1),
        ],
      },
    };

    const parsed = parseXnlRichDocumentCandidate(
      EMPTY_RUNTIME,
      { candidate: unsupportedCandidate as never },
      EMPTY_CONFIG,
    );
    const lowered = lowerXnlRichDocument(EMPTY_RUNTIME, { plan: unsupportedPlan }, EMPTY_CONFIG);
    expect(parsed).toMatchObject({ status: 'rejected', diagnostics: [expect.objectContaining({
      code: 'UNSUPPORTED_CONSTRUCT',
    })] });
    expect(lowered).toMatchObject({ status: 'rejected', diagnostics: [expect.objectContaining({
      code: 'UNSUPPORTED_CONSTRUCT',
    })] });
  });
});
