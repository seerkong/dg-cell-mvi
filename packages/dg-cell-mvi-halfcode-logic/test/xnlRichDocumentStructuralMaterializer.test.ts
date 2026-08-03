import { describe, expect, it } from 'vitest';
import type {
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentSemanticEdit,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
} from 'dg-cell-mvi-halfcode-contract';
import * as logicRoot from 'dg-cell-mvi-halfcode-logic';

const EMPTY = Object.freeze({});
const DOCUMENT_ID = nodeId('document.root');
const ALPHA_ID = nodeId('paragraph.alpha');
const BETA_ID = nodeId('paragraph.beta');
const GAMMA_ID = nodeId('paragraph.gamma');
const QUOTE_ID = nodeId('blockquote.source');
const QUOTE_PARAGRAPH_ID = nodeId('paragraph.quote');

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function paragraph(id: XnlRichDocumentDomainNodeId, text: string) {
  return {
    kind: 'paragraph' as const,
    nodeId: id,
    content: [{ kind: 'text' as const, text }],
  };
}

function acceptedDocument(): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: DOCUMENT_ID,
    children: [
      paragraph(ALPHA_ID, 'Alpha'),
      paragraph(BETA_ID, 'Beta'),
      paragraph(GAMMA_ID, 'Gamma'),
      {
        kind: 'blockquote',
        nodeId: QUOTE_ID,
        children: [paragraph(QUOTE_PARAGRAPH_ID, 'Quoted')],
      },
    ],
  };
}

function stable(id: XnlRichDocumentDomainNodeId) {
  return { kind: 'stable' as const, nodeId: id };
}

function local(localNodeId: string) {
  return { kind: 'local' as const, localNodeId };
}

function command(...edits: readonly XnlRichDocumentSemanticEdit[]): XnlRichDocumentEditCommand {
  return {
    type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
    target: { path: [], nodeId: DOCUMENT_ID },
    payload: { version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION, edits },
  };
}

function materializer(): XnlRichDocumentCandidateMaterializer {
  const value = Reflect.get(logicRoot, 'materializeXnlRichDocumentSemanticCandidate');
  expect(value).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError('Missing structural materializer.');
  return value as XnlRichDocumentCandidateMaterializer;
}

async function materialize(value: XnlRichDocumentEditCommand, accepted = acceptedDocument()) {
  return await materializer()(EMPTY, { accepted, command: value }, EMPTY);
}

function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((rest) => [value, ...rest]));
}

function structuralEdits(): readonly XnlRichDocumentSemanticEdit[] {
  return [{
    kind: 'delete',
    nodeId: BETA_ID,
    parent: stable(DOCUMENT_ID),
    index: 1,
  }, {
    kind: 'move',
    nodeId: GAMMA_ID,
    from: { parent: stable(DOCUMENT_ID), index: 2 },
    to: { parent: stable(DOCUMENT_ID), index: 0 },
  }, {
    kind: 'insert',
    localNodeId: 'local:inserted',
    parent: stable(DOCUMENT_ID),
    index: 1,
    node: {
      kind: 'paragraph',
      localNodeId: 'local:inserted',
      content: [{ kind: 'text', text: 'Inserted' }],
    },
  }];
}

describe('RichDocument structural semantic materializer', () => {
  it('assembles one accepted-baseline final placement plan for every edit-order permutation', async () => {
    const candidates: XnlRichDocument[] = [];

    for (const edits of permutations(structuralEdits())) {
      const result = await materialize(command(...edits));
      expect(result.status).toBe('materialized');
      if (result.status !== 'materialized') continue;
      expect(result.candidate.children.map((node) => node.nodeId)).toEqual([
        GAMMA_ID,
        expect.stringMatching(/^xnl-temporary:/),
        ALPHA_ID,
        QUOTE_ID,
      ]);
      candidates.push(result.candidate);
    }

    expect(candidates).toHaveLength(6);
    for (const candidate of candidates.slice(1)) expect(candidate).toEqual(candidates[0]);
  });

  it('coalesces mixed structural and content edits for every accepted-baseline permutation', async () => {
    const contentEdit: XnlRichDocumentSemanticEdit = {
      kind: 'text',
      nodeId: GAMMA_ID,
      before: 'Gamma',
      after: 'Gamma updated',
      beforeInlineRuns: [{ text: 'Gamma', marks: [] }],
      afterInlineRuns: [{ text: 'Gamma updated', marks: [{ kind: 'bold' }] }],
    };
    const candidates: XnlRichDocument[] = [];

    for (const edits of permutations([...structuralEdits(), contentEdit])) {
      const result = await materialize(command(...edits));

      expect(result.status).toBe('materialized');
      if (result.status !== 'materialized') continue;
      expect(result.candidate.children).toMatchObject([
        {
          kind: 'paragraph',
          nodeId: GAMMA_ID,
          content: [{ kind: 'text', text: 'Gamma updated', marks: [{ kind: 'bold' }] }],
        },
        {
          kind: 'paragraph',
          nodeId: expect.stringMatching(/^xnl-temporary:/),
          content: [{ kind: 'text', text: 'Inserted' }],
        },
        { nodeId: ALPHA_ID },
        { nodeId: QUOTE_ID },
      ]);
      candidates.push(result.candidate);
    }

    expect(candidates).toHaveLength(24);
    for (const candidate of candidates.slice(1)) expect(candidate).toEqual(candidates[0]);
  });

  it('treats destination indices as final slots across index permutations', async () => {
    const labels = ['One', 'Two', 'Three'] as const;

    for (const finalOrder of permutations(labels)) {
      const edits = finalOrder.map((label, index): XnlRichDocumentSemanticEdit => ({
        kind: 'insert',
        localNodeId: `local:${label.toLowerCase()}`,
        parent: stable(DOCUMENT_ID),
        index,
        node: {
          kind: 'paragraph',
          localNodeId: `local:${label.toLowerCase()}`,
          content: [{ kind: 'text', text: label }],
        },
      }));
      const result = await materialize(command(...edits.reverse()));

      expect(result.status).toBe('materialized');
      if (result.status !== 'materialized') continue;
      expect(result.candidate.children.slice(0, 3).map((node) => (
        node.kind === 'paragraph' ? node.content[0]?.text : undefined
      ))).toEqual(finalOrder);
    }
  });

  it('supports a local parent independently of edit order', async () => {
    const outer: XnlRichDocumentSemanticEdit = {
      kind: 'insert',
      localNodeId: 'local:outer',
      parent: stable(DOCUMENT_ID),
      index: 4,
      node: { kind: 'blockquote', localNodeId: 'local:outer', children: [] },
    };
    const inner: XnlRichDocumentSemanticEdit = {
      kind: 'insert',
      localNodeId: 'local:inner',
      parent: local('local:outer'),
      index: 0,
      node: {
        kind: 'paragraph',
        localNodeId: 'local:inner',
        content: [{ kind: 'text', text: 'Nested' }],
      },
    };

    for (const edits of [[outer, inner], [inner, outer]]) {
      const result = await materialize(command(...edits));
      expect(result.status).toBe('materialized');
      if (result.status !== 'materialized') continue;
      expect(result.candidate.children[4]).toMatchObject({
        kind: 'blockquote',
        children: [{ kind: 'paragraph', content: [{ text: 'Nested' }] }],
      });
    }
  });

  it('preserves every stable identity in a moved subtree', async () => {
    const result = await materialize(command({
      kind: 'move',
      nodeId: QUOTE_ID,
      from: { parent: stable(DOCUMENT_ID), index: 3 },
      to: { parent: stable(DOCUMENT_ID), index: 0 },
    }));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate.children[0]).toMatchObject({
      nodeId: QUOTE_ID,
      children: [{ nodeId: QUOTE_PARAGRAPH_ID }],
    });
  });

  it('allocates collision-free temporary ids and exact per-node copy origins', async () => {
    const result = await materialize(command({
      kind: 'insert',
      localNodeId: 'local:quote-copy',
      parent: stable(DOCUMENT_ID),
      index: 4,
      node: {
        kind: 'blockquote',
        localNodeId: 'local:quote-copy',
        sourceNodeId: QUOTE_ID,
        children: [{
          kind: 'paragraph',
          localNodeId: 'local:quote-paragraph-copy',
          sourceNodeId: QUOTE_PARAGRAPH_ID,
          content: [{ kind: 'text', text: 'Quoted' }],
        }],
      },
    }));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    const copy = result.candidate.children[4];
    if (copy?.kind !== 'blockquote') throw new Error('Expected copied blockquote.');
    const temporaryIds = [copy.nodeId, copy.children[0]?.nodeId];
    expect(new Set(temporaryIds).size).toBe(2);
    expect(temporaryIds).not.toEqual(expect.arrayContaining([
      DOCUMENT_ID,
      ALPHA_ID,
      BETA_ID,
      GAMMA_ID,
      QUOTE_ID,
      QUOTE_PARAGRAPH_ID,
    ]));
    expect(result.copyOrigins).toEqual(expect.arrayContaining([
      { candidateNodeId: copy.nodeId, sourceNodeId: QUOTE_ID },
      { candidateNodeId: copy.children[0]?.nodeId, sourceNodeId: QUOTE_PARAGRAPH_ID },
    ]));
    expect(result.copyOrigins).toHaveLength(2);

    const classification = logicRoot.classifyXnlRichDocumentIdentity(
      EMPTY,
      { accepted: acceptedDocument(), candidate: result.candidate, copyOrigins: result.copyOrigins },
      EMPTY,
    );
    expect(classification.status).toBe('classified');
    if (classification.status === 'classified') {
      expect(classification.changes.filter((change) => change.classification === 'copy')).toHaveLength(2);
    }
  });

  it('skips temporary ids already reserved by the accepted document', async () => {
    const accepted = acceptedDocument();
    const collisionId = nodeId('xnl-temporary:0');
    const withCollision: XnlRichDocument = {
      ...accepted,
      children: [paragraph(collisionId, 'Reserved'), ...accepted.children],
    };
    const result = await materialize(command({
      kind: 'insert',
      localNodeId: 'local:new',
      parent: stable(DOCUMENT_ID),
      index: 0,
      node: { kind: 'paragraph', localNodeId: 'local:new', content: [] },
    }), withCollision);

    expect(result.status).toBe('materialized');
    if (result.status === 'materialized') {
      expect(result.candidate.children[0]?.nodeId).toBe('xnl-temporary:1');
    }
  });

  it('models replacement as delete plus add with a fresh local identity', async () => {
    const result = await materialize(command({
      kind: 'delete',
      nodeId: ALPHA_ID,
      parent: stable(DOCUMENT_ID),
      index: 0,
    }, {
      kind: 'insert',
      localNodeId: 'local:replacement',
      parent: stable(DOCUMENT_ID),
      index: 0,
      node: {
        kind: 'paragraph',
        localNodeId: 'local:replacement',
        content: [{ kind: 'text', text: 'Replacement' }],
      },
    }));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate.children[0]).toMatchObject({
      kind: 'paragraph',
      content: [{ text: 'Replacement' }],
    });
    expect(result.candidate.children[0]?.nodeId).not.toBe(ALPHA_ID);
    expect(JSON.stringify(result.candidate)).not.toContain(ALPHA_ID);
  });

  it.each([
    ['unknown reference', command({
      kind: 'insert', localNodeId: 'local:new', parent: stable(nodeId('missing.parent')), index: 0,
      node: { kind: 'paragraph', localNodeId: 'local:new', content: [] },
    })],
    ['bad final index', command({
      kind: 'insert', localNodeId: 'local:new', parent: stable(DOCUMENT_ID), index: 99,
      node: { kind: 'paragraph', localNodeId: 'local:new', content: [] },
    })],
    ['bad accepted index', command({
      kind: 'delete', nodeId: ALPHA_ID, parent: stable(DOCUMENT_ID), index: 1,
    })],
    ['ancestor conflict', command({
      kind: 'delete', nodeId: QUOTE_ID, parent: stable(DOCUMENT_ID), index: 3,
    }, {
      kind: 'move', nodeId: QUOTE_PARAGRAPH_ID,
      from: { parent: stable(QUOTE_ID), index: 0 },
      to: { parent: stable(DOCUMENT_ID), index: 0 },
    })],
    ['self move', command({
      kind: 'move', nodeId: QUOTE_ID,
      from: { parent: stable(DOCUMENT_ID), index: 3 },
      to: { parent: stable(QUOTE_ID), index: 0 },
    })],
    ['duplicate placement', command({
      kind: 'insert', localNodeId: 'local:one', parent: stable(DOCUMENT_ID), index: 0,
      node: { kind: 'paragraph', localNodeId: 'local:one', content: [] },
    }, {
      kind: 'insert', localNodeId: 'local:two', parent: stable(DOCUMENT_ID), index: 0,
      node: { kind: 'paragraph', localNodeId: 'local:two', content: [] },
    })],
    ['forged stable identity', command({
      kind: 'insert', localNodeId: 'local:forged', parent: stable(DOCUMENT_ID), index: 0,
      node: { kind: 'paragraph', nodeId: ALPHA_ID, content: [] } as never,
    })],
    ['forged copy provenance', command({
      kind: 'insert', localNodeId: 'local:copy', parent: stable(DOCUMENT_ID), index: 0,
      node: {
        kind: 'paragraph', localNodeId: 'local:copy', sourceNodeId: nodeId('missing.source'), content: [],
      },
    })],
    ['incomplete copied-subtree provenance', command({
      kind: 'insert', localNodeId: 'local:copy-root', parent: stable(DOCUMENT_ID), index: 0,
      node: {
        kind: 'blockquote', localNodeId: 'local:copy-root', sourceNodeId: QUOTE_ID,
        children: [{
          kind: 'paragraph', localNodeId: 'local:copy-child',
          content: [{ kind: 'text', text: 'Quoted' }],
        }],
      },
    })],
    ['cyclic local parents', command({
      kind: 'insert', localNodeId: 'local:one', parent: local('local:two'), index: 0,
      node: { kind: 'blockquote', localNodeId: 'local:one', children: [] },
    }, {
      kind: 'insert', localNodeId: 'local:two', parent: local('local:one'), index: 0,
      node: { kind: 'blockquote', localNodeId: 'local:two', children: [] },
    })],
  ])('atomically rejects %s', async (_label, value) => {
    const accepted = acceptedDocument();
    const acceptedBefore = structuredClone(accepted);
    const commandBefore = structuredClone(value);

    const result = await materialize(value, accepted);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    if (result.status === 'rejected') expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(accepted).toEqual(acceptedBefore);
    expect(value).toEqual(commandBefore);
  });

  it('does not invoke input, runtime, or config authority accessors', async () => {
    let getterInvocations = 0;
    const authority = {};
    Object.defineProperty(authority, 'writer', {
      enumerable: true,
      get: () => {
        getterInvocations += 1;
        return 'forbidden';
      },
    });
    const input = {};
    Object.defineProperty(input, 'accepted', {
      enumerable: true,
      get: () => {
        getterInvocations += 1;
        return acceptedDocument();
      },
    });

    const result = await materializer()(authority as never, input as never, authority as never);

    expect(result.status).toBe('rejected');
    expect(getterInvocations).toBe(0);
  });
});
