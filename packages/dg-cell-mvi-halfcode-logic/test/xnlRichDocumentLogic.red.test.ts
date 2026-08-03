import { describe, expect, it } from 'vitest';
import {
  XNL_RICH_DOCUMENT_CLASSIFICATION_IDS,
  classifyXnlRichDocumentIdentity,
  deriveXnlRichDocumentOccurrenceXId,
  lowerXnlRichDocument,
  normalizeXnlRichDocument,
  parseXnlRichDocumentCandidate,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionSerializableRecord,
  type XnlRichDocument,
  type XnlRichDocumentDomainNodeId,
} from '../src';

const EMPTY_RUNTIME = Object.freeze({});
const EMPTY_CONFIG = Object.freeze({});
const PRESENTER = Object.freeze({ id: 'rich-document' });
let planNodeSequence = 0;

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function planNode(
  kind: keyof typeof XNL_RICH_DOCUMENT_CLASSIFICATION_IDS,
  id: string | undefined,
  data: XnlProjectionPlanNode['data'],
  children: readonly XnlProjectionPlanNode[] = [],
): XnlProjectionPlanNode {
  return {
    kind: 'xnl-projection-plan-node',
    id: `plan:${kind}:${planNodeSequence += 1}`,
    domain: {
      path: [],
      ...(id === undefined ? {} : { nodeId: id }),
    },
    classification: { id: XNL_RICH_DOCUMENT_CLASSIFICATION_IDS[kind] },
    presenter: PRESENTER,
    ...(data === undefined ? {} : { data }),
    children,
  };
}

function text(textValue: string, marks?: readonly XnlProjectionSerializableRecord[]): XnlProjectionPlanNode {
  return planNode('text', undefined, {
    text: textValue,
    ...(marks === undefined ? {} : { marks }),
  });
}

function supportedPlan(): XnlProjectionPlan {
  const paragraph = (id: string, value: string) => planNode(
    'paragraph',
    id,
    undefined,
    [text(value)],
  );
  return {
    kind: 'xnl-projection-plan',
    id: 'rich-document:all-families',
    root: planNode('document', 'document:root', undefined, [
      planNode('heading', 'heading:title', { level: 2 }, [
        text('Title', [
          { kind: 'link', href: 'https://example.test', title: 'Example' },
          { kind: 'code' },
          { kind: 'bold' },
          { kind: 'italic' },
          { kind: 'strike' },
        ]),
      ]),
      paragraph('paragraph:intro', 'Intro'),
      planNode('blockquote', 'blockquote:one', undefined, [paragraph('paragraph:quote', 'Quote')]),
      planNode('bullet-list', 'list:bullet', undefined, [
        planNode('list-item', 'item:bullet', undefined, [paragraph('paragraph:bullet', 'Bullet')]),
      ]),
      planNode('ordered-list', 'list:ordered', { start: 3 }, [
        planNode('list-item', 'item:ordered', undefined, [paragraph('paragraph:ordered', 'Ordered')]),
      ]),
      planNode('image', 'image:one', {
        src: 'vfs://./diagram.png',
        alt: 'Diagram',
        title: 'Architecture',
      }),
      planNode('table', 'table:one', undefined, [
        planNode('table-row', 'row:one', undefined, [
          planNode('table-header', 'header:one', { colspan: 2, rowspan: 1 }, [
            paragraph('paragraph:header', 'Header'),
          ]),
          planNode('table-cell', 'cell:one', undefined, [paragraph('paragraph:cell', 'Cell')]),
        ]),
      ]),
      planNode('code-block', 'code:one', { language: 'typescript', text: 'const value = 1;' }),
      planNode('mermaid', 'mermaid:one', { source: 'flowchart LR\nA --> B' }),
      planNode('component-embed', 'component:one', {
        ref: 'component://demo.Card',
        version: '1',
        input: { value: 1 },
      }),
      planNode('capsule-embed', 'capsule:one', {
        ref: 'capsule://demo.Map',
        input: { active: true },
      }),
    ]),
  };
}

function paragraph(id: string, value: string): XnlRichDocument['children'][number] {
  return {
    kind: 'paragraph',
    nodeId: nodeId(id),
    content: [{ kind: 'text', text: value }],
  };
}

describe('renderer-neutral RichDocument lower and parse', () => {
  it('lowers every supported family deterministically without changing its plan input', () => {
    const plan = supportedPlan();
    const before = structuredClone(plan);

    const first = lowerXnlRichDocument(EMPTY_RUNTIME, { plan }, EMPTY_CONFIG);
    const second = lowerXnlRichDocument(EMPTY_RUNTIME, { plan }, EMPTY_CONFIG);

    expect(plan).toEqual(before);
    expect(first).toEqual(second);
    expect(first.status).toBe('normalized');
    if (first.status !== 'normalized') throw new Error('expected normalized document');
    expect(first.document.children.map((child) => child.kind)).toEqual([
      'heading',
      'paragraph',
      'blockquote',
      'bullet-list',
      'ordered-list',
      'image',
      'table',
      'code-block',
      'mermaid',
      'component-embed',
      'capsule-embed',
    ]);
    expect(first.document.children[0]).toMatchObject({
      kind: 'heading',
      content: [{
        marks: [
          { kind: 'bold' },
          { kind: 'italic' },
          { kind: 'strike' },
          { kind: 'code' },
          { kind: 'link', href: 'https://example.test', title: 'Example' },
        ],
      }],
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.document)).toBe(true);
    expect(Object.isFrozen(first.document.children)).toBe(true);
  });

  it('parses and canonically normalizes renderer-neutral candidate data without mutation', () => {
    const candidate = {
      kind: 'document',
      nodeId: nodeId('document:parse'),
      children: [{
        kind: 'paragraph',
        nodeId: nodeId('paragraph:parse'),
        content: [{
          kind: 'text',
          text: 'Canonical marks',
          marks: [{ kind: 'link', href: '/docs' }, { kind: 'bold' }, { kind: 'code' }],
        }],
      }],
    } satisfies XnlRichDocument;
    const before = structuredClone(candidate);

    const first = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, { candidate }, EMPTY_CONFIG);
    const second = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, { candidate }, EMPTY_CONFIG);

    expect(candidate).toEqual(before);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'normalized',
      document: {
        children: [{
          content: [{ marks: [{ kind: 'bold' }, { kind: 'code' }, { kind: 'link', href: '/docs' }] }],
        }],
      },
    });
  });

  it('inspects candidate data through descriptors without invoking accessors', () => {
    let getterInvocations = 0;
    const accessorText = {};
    Object.defineProperties(accessorText, {
      kind: { value: 'text', enumerable: true },
      text: {
        get: () => {
          getterInvocations += 1;
          return 'must not execute';
        },
        enumerable: true,
      },
    });
    const nestedAccessorResult = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, {
      candidate: {
        kind: 'document',
        nodeId: 'document:accessor',
        children: [{
          kind: 'paragraph',
          nodeId: 'paragraph:accessor',
          content: [accessorText],
        }],
      } as never,
    }, EMPTY_CONFIG);

    const accessorInput = {};
    Object.defineProperty(accessorInput, 'candidate', {
      get: () => {
        getterInvocations += 1;
        return { kind: 'document', nodeId: 'document:input-accessor', children: [] };
      },
      enumerable: true,
    });
    const inputAccessorResult = parseXnlRichDocumentCandidate(
      EMPTY_RUNTIME,
      accessorInput as never,
      EMPTY_CONFIG,
    );

    expect(getterInvocations).toBe(0);
    expect(nestedAccessorResult).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'LOSSY_CONSTRUCT' })],
    });
    expect(inputAccessorResult).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'LOSSY_CONSTRUCT' })],
    });
  });

  it('fails closed at every public processor wrapper without invoking accessors', () => {
    let getterInvocations = 0;
    const accessorInput = (key: string): object => {
      const value = {};
      Object.defineProperty(value, key, {
        get: () => {
          getterInvocations += 1;
          return supportedPlan();
        },
        enumerable: true,
      });
      return value;
    };

    const lower = lowerXnlRichDocument(EMPTY_RUNTIME, accessorInput('plan') as never, EMPTY_CONFIG);
    const parse = parseXnlRichDocumentCandidate(
      EMPTY_RUNTIME,
      accessorInput('candidate') as never,
      EMPTY_CONFIG,
    );
    const normalize = normalizeXnlRichDocument(
      EMPTY_RUNTIME,
      accessorInput('candidate') as never,
      EMPTY_CONFIG,
    );
    const classify = classifyXnlRichDocumentIdentity(
      EMPTY_RUNTIME,
      accessorInput('accepted') as never,
      EMPTY_CONFIG,
    );
    const occurrence = deriveXnlRichDocumentOccurrenceXId(
      EMPTY_RUNTIME,
      accessorInput('nodeId') as never,
      EMPTY_CONFIG,
    );

    expect(getterInvocations).toBe(0);
    for (const result of [lower, parse, normalize, classify, occurrence]) {
      expect(result.status).toBe('rejected');
    }
  });

  it('returns structured rejection for null, primitives, and uninspectable proxies', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const unsafeInputs: readonly unknown[] = [null, 'invalid', 1, true, revoked.proxy];

    for (const unsafe of unsafeInputs) {
      const calls = [
        () => lowerXnlRichDocument(EMPTY_RUNTIME, unsafe as never, EMPTY_CONFIG),
        () => parseXnlRichDocumentCandidate(EMPTY_RUNTIME, unsafe as never, EMPTY_CONFIG),
        () => normalizeXnlRichDocument(EMPTY_RUNTIME, unsafe as never, EMPTY_CONFIG),
        () => classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, unsafe as never, EMPTY_CONFIG),
        () => deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, unsafe as never, EMPTY_CONFIG),
      ];
      for (const call of calls) {
        expect(call).not.toThrow();
        expect(call()).toMatchObject({
          status: 'rejected',
          diagnostics: [expect.objectContaining({ severity: 'error' })],
        });
      }
    }
  });

  it('rejects cycles, exotic records, symbols, and non-serializable generic values', () => {
    class OwnedValue {
      readonly value = 'owned';
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const symbolKeyed = { safe: true } as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol('authority')] = 'hidden';
    const sparse = new Array(2);
    sparse[1] = 'present';
    const cases: readonly unknown[] = [
      { nested: { execute: () => 'owned' } },
      { nested: 1n },
      { nested: undefined },
      { nested: Symbol('owned') },
      { nested: new OwnedValue() },
      { nested: cyclic },
      { nested: symbolKeyed },
      { nested: sparse },
    ];

    for (const [index, unsafeInput] of cases.entries()) {
      const result = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, {
        candidate: {
          kind: 'document',
          nodeId: `document:unsafe:${index}`,
          children: [{
            kind: 'component-embed',
            nodeId: `component:unsafe:${index}`,
            component: { ref: 'component://demo.Unsafe' },
            input: unsafeInput,
          }],
        } as never,
      }, EMPTY_CONFIG);

      expect(result.status, `unsafe case ${index}`).toBe('rejected');
      expect(JSON.stringify(result)).not.toContain('owned');
    }
  });

  it('keeps modeled embed references but rejects ownership fields in generic input records', () => {
    const valid = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, {
      candidate: {
        kind: 'document',
        nodeId: 'document:embed-structure',
        children: [{
          kind: 'component-embed',
          nodeId: 'component:embed-structure',
          component: { ref: 'component://demo.Card', version: '1' },
          input: { cardId: 'card:one', nested: { visible: true } },
        }, {
          kind: 'capsule-embed',
          nodeId: 'capsule:embed-structure',
          capsule: { ref: 'capsule://demo.Map' },
          input: { region: 'north' },
        }],
      },
    }, EMPTY_CONFIG);
    expect(valid).toMatchObject({
      status: 'normalized',
      document: {
        children: [{
          kind: 'component-embed',
          component: { ref: 'component://demo.Card', version: '1' },
        }, {
          kind: 'capsule-embed',
          capsule: { ref: 'capsule://demo.Map' },
        }],
      },
    });

    const rejectedOwnership = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, {
      candidate: {
        kind: 'document',
        nodeId: 'document:ownership',
        children: [{
          kind: 'component-embed',
          nodeId: 'component:ownership',
          component: { ref: 'component://demo.Card' },
          input: {
            runtime: 'runtime://must-not-cross',
            nested: { writer: 'writer://must-not-cross' },
          },
        }],
      } as never,
    }, EMPTY_CONFIG);
    expect(rejectedOwnership.status).toBe('rejected');
    if (rejectedOwnership.status !== 'rejected') throw new Error('expected ownership rejection');
    expect(rejectedOwnership.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['children', 0, 'input', 'runtime'] }),
      expect.objectContaining({ path: ['children', 0, 'input', 'nested', 'writer'] }),
    ]));
    expect(JSON.stringify(rejectedOwnership)).not.toContain('must-not-cross');

    for (const authorityKey of [
      'component',
      'capsule',
      'session',
      'submit',
      'identityAllocator',
    ] as const) {
      const rejected = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, {
        candidate: {
          kind: 'document',
          nodeId: `document:authority:${authorityKey}`,
          children: [{
            kind: 'component-embed',
            nodeId: `component:authority:${authorityKey}`,
            component: { ref: 'component://demo.Card' },
            input: { nested: { [authorityKey]: `authority://${authorityKey}` } },
          }],
        } as never,
      }, EMPTY_CONFIG);
      expect(rejected.status, authorityKey).toBe('rejected');
      expect(JSON.stringify(rejected)).not.toContain(`authority://${authorityKey}`);
    }
  });

  it('rejects unsupported, lossy, duplicate, and missing identity instead of falling back', () => {
    const unsupported = supportedPlan();
    const unsupportedRoot = {
      ...unsupported.root,
      children: [{
        ...unsupported.root.children[0],
        classification: { id: 'xnl.rich-document.video' },
      }],
    };
    const unsupportedResult = lowerXnlRichDocument(
      EMPTY_RUNTIME,
      { plan: { ...unsupported, root: unsupportedRoot } },
      EMPTY_CONFIG,
    );
    expect(unsupportedResult).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'UNSUPPORTED_CONSTRUCT' }],
    });

    const candidate = {
      kind: 'document',
      nodeId: 'document:bad',
      children: [
        { kind: 'paragraph', nodeId: 'duplicate', content: [], rendererState: 'forbidden' },
        { kind: 'paragraph', nodeId: 'duplicate', content: [] },
        { kind: 'heading', level: 1, content: [] },
      ],
    } as never;
    const parsed = parseXnlRichDocumentCandidate(EMPTY_RUNTIME, { candidate }, EMPTY_CONFIG);
    expect(parsed.status).toBe('rejected');
    if (parsed.status !== 'rejected') throw new Error('expected rejected candidate');
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'LOSSY_CONSTRUCT',
      'DUPLICATE_DOMAIN_NODE_ID',
      'MISSING_DOMAIN_NODE_ID',
    ]));
    expect(JSON.stringify(parsed)).not.toContain('html');
  });
});

describe('RichDocument identity classification', () => {
  it('classifies unchanged, move, new, copy, delete, and replacement without id updates', () => {
    const accepted: XnlRichDocument = {
      kind: 'document',
      nodeId: nodeId('document:identity'),
      children: [
        {
          kind: 'blockquote',
          nodeId: nodeId('container:left'),
          children: [paragraph('paragraph:moved', 'Move me'), paragraph('paragraph:deleted', 'Delete me')],
        },
        {
          kind: 'blockquote',
          nodeId: nodeId('container:right'),
          children: [paragraph('paragraph:replaced', 'Old')],
        },
        paragraph('paragraph:copy-source', 'Copy me'),
      ],
    };
    const candidate: XnlRichDocument = {
      kind: 'document',
      nodeId: nodeId('document:identity'),
      children: [
        { kind: 'blockquote', nodeId: nodeId('container:left'), children: [] },
        {
          kind: 'blockquote',
          nodeId: nodeId('container:right'),
          children: [paragraph('paragraph:replacement-new', 'New'), paragraph('paragraph:moved', 'Move me')],
        },
        paragraph('paragraph:copy-source', 'Copy me'),
        paragraph('paragraph:copy-fresh', 'Copy me'),
        paragraph('paragraph:new', 'Brand new'),
      ],
    };
    const acceptedBefore = structuredClone(accepted);
    const candidateBefore = structuredClone(candidate);

    const result = classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, {
      accepted,
      candidate,
      copyOrigins: [{
        candidateNodeId: nodeId('paragraph:copy-fresh'),
        sourceNodeId: nodeId('paragraph:copy-source'),
      }],
    }, EMPTY_CONFIG);
    const repeated = classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, {
      accepted,
      candidate,
      copyOrigins: [{
        candidateNodeId: nodeId('paragraph:copy-fresh'),
        sourceNodeId: nodeId('paragraph:copy-source'),
      }],
    }, EMPTY_CONFIG);

    expect(accepted).toEqual(acceptedBefore);
    expect(candidate).toEqual(candidateBefore);
    expect(result).toEqual(repeated);
    expect(result.status).toBe('classified');
    if (result.status !== 'classified') throw new Error('expected classifications');
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ classification: 'unchanged', nodeId: nodeId('document:identity') }),
      expect.objectContaining({ classification: 'move', nodeId: nodeId('paragraph:moved'), payloadChanged: false }),
      expect.objectContaining({ classification: 'delete', nodeId: nodeId('paragraph:deleted') }),
      expect.objectContaining({ classification: 'copy', nodeId: nodeId('paragraph:copy-fresh'), sourceNodeId: nodeId('paragraph:copy-source') }),
      expect.objectContaining({ classification: 'new', nodeId: nodeId('paragraph:new') }),
      expect.objectContaining({
        classification: 'replacement',
        deletedNodeId: nodeId('paragraph:replaced'),
        addedNodeId: nodeId('paragraph:replacement-new'),
        operations: ['delete', 'add'],
        ordinaryIdUpdate: false,
      }),
    ]));
    expect(result.changes.some((change) => change.classification === ('update-id' as never))).toBe(false);
    expect(Object.isFrozen(result.changes)).toBe(true);
  });

  it('rejects duplicate and missing candidate identity before classification', () => {
    const accepted: XnlRichDocument = {
      kind: 'document',
      nodeId: nodeId('document:accepted'),
      children: [],
    };
    const candidate = {
      kind: 'document',
      nodeId: 'document:candidate',
      children: [
        { kind: 'paragraph', nodeId: 'duplicate', content: [] },
        { kind: 'paragraph', nodeId: 'duplicate', content: [] },
        { kind: 'paragraph', content: [] },
      ],
    } as never;

    const result = classifyXnlRichDocumentIdentity(
      EMPTY_RUNTIME,
      { accepted, candidate, copyOrigins: [] },
      EMPTY_CONFIG,
    );
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') throw new Error('expected rejected classifications');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_DOMAIN_NODE_ID',
      'MISSING_DOMAIN_NODE_ID',
    ]));
  });

  it('validates copy origins as exact descriptor-safe provenance data', () => {
    const accepted: XnlRichDocument = {
      kind: 'document',
      nodeId: nodeId('document:copy-origin'),
      children: [paragraph('paragraph:source', 'Source')],
    };
    const candidate: XnlRichDocument = {
      kind: 'document',
      nodeId: nodeId('document:copy-origin'),
      children: [
        paragraph('paragraph:source', 'Source'),
        paragraph('paragraph:copy', 'Source'),
      ],
    };
    let getterInvocations = 0;
    const accessorOrigin = {};
    Object.defineProperties(accessorOrigin, {
      candidateNodeId: {
        get: () => {
          getterInvocations += 1;
          return 'paragraph:copy';
        },
        enumerable: true,
      },
      sourceNodeId: { value: 'paragraph:source', enumerable: true },
    });
    const cyclicOrigin: Record<string, unknown> = {
      candidateNodeId: 'paragraph:copy',
      sourceNodeId: 'paragraph:source',
    };
    cyclicOrigin.self = cyclicOrigin;
    const sparseOrigins = new Array(2);
    sparseOrigins[1] = {
      candidateNodeId: 'paragraph:copy',
      sourceNodeId: 'paragraph:source',
    };
    const invalidOrigins: readonly unknown[] = [
      [accessorOrigin],
      [{ candidateNodeId: 'paragraph:copy', sourceNodeId: 'paragraph:source', extra: true }],
      [{ candidateNodeId: '', sourceNodeId: 'paragraph:source' }],
      [{ candidateNodeId: 'paragraph:copy', sourceNodeId: '' }],
      [cyclicOrigin],
      sparseOrigins,
      { candidateNodeId: 'paragraph:copy', sourceNodeId: 'paragraph:source' },
    ];

    for (const copyOrigins of invalidOrigins) {
      const result = classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, {
        accepted,
        candidate,
        copyOrigins,
      } as never, EMPTY_CONFIG);
      expect(result.status).toBe('rejected');
    }
    expect(getterInvocations).toBe(0);

    const valid = classifyXnlRichDocumentIdentity(EMPTY_RUNTIME, {
      accepted,
      candidate,
      copyOrigins: [{
        candidateNodeId: nodeId('paragraph:copy'),
        sourceNodeId: nodeId('paragraph:source'),
      }],
    }, EMPTY_CONFIG);
    expect(valid).toMatchObject({
      status: 'classified',
      changes: expect.arrayContaining([
        expect.objectContaining({
          classification: 'copy',
          nodeId: 'paragraph:copy',
          sourceNodeId: 'paragraph:source',
        }),
      ]),
    });
  });
});

describe('RichDocument occurrence identity', () => {
  it('derives single-role and collision-safe multi-role x-id only from persistent identity', () => {
    const single = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId('component:card'),
      role: 'body',
      roleCardinality: 'single',
    }, EMPTY_CONFIG);
    const multiBody = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId('component:card'),
      role: 'body',
      roleCardinality: 'multiple',
    }, EMPTY_CONFIG);
    const multiSummary = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId('component:card'),
      role: 'summary',
      roleCardinality: 'multiple',
    }, EMPTY_CONFIG);
    const ambiguousA = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId('a:b'),
      role: 'c',
      roleCardinality: 'multiple',
    }, EMPTY_CONFIG);
    const ambiguousB = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId('a'),
      role: 'b:c',
      roleCardinality: 'multiple',
    }, EMPTY_CONFIG);

    expect(single).toMatchObject({ status: 'derived' });
    if (single.status !== 'derived') throw new Error('expected derived single occurrence address');
    expect(single.xId).toMatch(/^[A-Za-z0-9._~-]+$/);
    expect(multiBody).toMatchObject({ status: 'derived', role: 'body' });
    expect(multiSummary).toMatchObject({ status: 'derived', role: 'summary' });
    if (multiBody.status !== 'derived' || multiSummary.status !== 'derived'
      || ambiguousA.status !== 'derived' || ambiguousB.status !== 'derived') {
      throw new Error('expected derived occurrence addresses');
    }
    expect(multiBody.xId).not.toBe(multiSummary.xId);
    expect(ambiguousA.xId).not.toBe(ambiguousB.xId);
    const reservedSingle = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId(multiBody.xId),
      role: 'body',
      roleCardinality: 'single',
    }, EMPTY_CONFIG);
    expect(reservedSingle).toMatchObject({ status: 'derived' });
    if (reservedSingle.status === 'derived') {
      expect(reservedSingle.xId).toMatch(/^xrd-s-/);
      expect(reservedSingle.xId).not.toBe(multiBody.xId);
    }

    const missing = deriveXnlRichDocumentOccurrenceXId(EMPTY_RUNTIME, {
      nodeId: nodeId(''),
      role: 'body',
      roleCardinality: 'multiple',
    }, EMPTY_CONFIG);
    expect(missing).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'MISSING_DOMAIN_NODE_ID' }],
    });
  });
});
