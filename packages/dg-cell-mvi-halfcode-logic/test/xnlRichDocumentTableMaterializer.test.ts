import { describe, expect, it } from 'vitest';
import type {
  XnlRichDocument,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentDomainNodeId,
  XnlRichDocumentEditCommand,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentSemanticTable,
  XnlRichDocumentTable,
} from 'dg-cell-mvi-halfcode-contract';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
} from 'dg-cell-mvi-halfcode-contract';
import * as logicRoot from 'dg-cell-mvi-halfcode-logic';

const EMPTY = Object.freeze({});
const DOCUMENT_ID = nodeId('document.root');
const INTRO_ID = nodeId('paragraph.intro');
const TABLE_ID = nodeId('table.main');
const ROW_ONE_ID = nodeId('table-row.one');
const ROW_TWO_ID = nodeId('table-row.two');
const HEADER_ID = nodeId('table-header.a');
const CELL_B_ID = nodeId('table-cell.b');
const CELL_C_ID = nodeId('table-cell.c');
const CELL_D_ID = nodeId('table-cell.d');
const PARAGRAPH_A_ID = nodeId('paragraph.a');
const PARAGRAPH_B_ID = nodeId('paragraph.b');
const PARAGRAPH_C_ID = nodeId('paragraph.c');
const PARAGRAPH_D_ID = nodeId('paragraph.d');

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

function acceptedTable(): XnlRichDocumentTable {
  return {
    kind: 'table',
    nodeId: TABLE_ID,
    children: [{
      kind: 'table-row',
      nodeId: ROW_ONE_ID,
      children: [{
        kind: 'table-header',
        nodeId: HEADER_ID,
        colspan: 1,
        rowspan: 1,
        children: [paragraph(PARAGRAPH_A_ID, 'A')],
      }, {
        kind: 'table-cell',
        nodeId: CELL_B_ID,
        colspan: 1,
        rowspan: 1,
        children: [paragraph(PARAGRAPH_B_ID, 'B')],
      }],
    }, {
      kind: 'table-row',
      nodeId: ROW_TWO_ID,
      children: [{
        kind: 'table-cell',
        nodeId: CELL_C_ID,
        colspan: 1,
        rowspan: 1,
        children: [paragraph(PARAGRAPH_C_ID, 'C')],
      }, {
        kind: 'table-cell',
        nodeId: CELL_D_ID,
        colspan: 1,
        rowspan: 1,
        children: [paragraph(PARAGRAPH_D_ID, 'D')],
      }],
    }],
  };
}

function acceptedDocument(): XnlRichDocument {
  return {
    kind: 'document',
    nodeId: DOCUMENT_ID,
    children: [paragraph(INTRO_ID, 'Intro'), acceptedTable()],
  };
}

function beforeTable(): XnlRichDocumentSemanticTable {
  return structuredClone(acceptedTable()) as XnlRichDocumentSemanticTable;
}

function afterTable(): XnlRichDocumentSemanticTable {
  return {
    kind: 'table',
    nodeId: TABLE_ID,
    children: [{
      kind: 'table-row',
      nodeId: ROW_ONE_ID,
      children: [{
        kind: 'table-header',
        nodeId: HEADER_ID,
        colspan: 2,
        rowspan: 1,
        children: [{
          kind: 'paragraph',
          nodeId: PARAGRAPH_A_ID,
          content: [{ kind: 'text', text: 'A + B', marks: [{ kind: 'bold' }] }],
        }],
      }],
    }, {
      kind: 'table-row',
      nodeId: ROW_TWO_ID,
      children: [{
        kind: 'table-cell',
        nodeId: CELL_D_ID,
        colspan: 1,
        rowspan: 1,
        children: [paragraph(PARAGRAPH_D_ID, 'D')],
      }, {
        kind: 'table-cell',
        nodeId: CELL_C_ID,
        colspan: 1,
        rowspan: 2,
        children: [paragraph(PARAGRAPH_C_ID, 'C')],
      }],
    }, {
      kind: 'table-row',
      localNodeId: 'local:row.three',
      children: [{
        kind: 'table-header',
        localNodeId: 'local:header.new',
        colspan: 1,
        rowspan: 1,
        children: [{
          kind: 'paragraph',
          localNodeId: 'local:paragraph.new',
          content: [{ kind: 'text', text: 'New header' }],
        }],
      }, {
        kind: 'table-cell',
        localNodeId: 'local:cell.copy',
        sourceNodeId: CELL_D_ID,
        colspan: 1,
        rowspan: 1,
        children: [{
          kind: 'paragraph',
          localNodeId: 'local:paragraph.copy',
          sourceNodeId: PARAGRAPH_D_ID,
          content: [{ kind: 'text', text: 'D' }],
        }],
      }],
    }],
  };
}

function stable(id: XnlRichDocumentDomainNodeId) {
  return { kind: 'stable' as const, nodeId: id };
}

function tableEdit(
  after: XnlRichDocumentSemanticTable = afterTable(),
  before: XnlRichDocumentSemanticTable = beforeTable(),
): XnlRichDocumentSemanticEdit {
  return { kind: 'table', nodeId: TABLE_ID, before, after };
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
  if (typeof value !== 'function') throw new TypeError('Missing semantic materializer.');
  return value as XnlRichDocumentCandidateMaterializer;
}

async function materialize(
  value: XnlRichDocumentEditCommand,
  accepted: XnlRichDocument = acceptedDocument(),
) {
  return await materializer()(EMPTY, { accepted, command: value }, EMPTY);
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

describe('RichDocument table atomic semantic materialization', () => {
  it('preserves complete merge/split/header/content topology, spans, order, and aligned stable ids', async () => {
    const result = await materialize(command(tableEdit()));

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    const table = result.candidate.children[1];
    expect(table).toMatchObject({
      kind: 'table',
      nodeId: TABLE_ID,
      children: [{
        nodeId: ROW_ONE_ID,
        children: [{
          kind: 'table-header',
          nodeId: HEADER_ID,
          colspan: 2,
          rowspan: 1,
          children: [{
            nodeId: PARAGRAPH_A_ID,
            content: [{ text: 'A + B', marks: [{ kind: 'bold' }] }],
          }],
        }],
      }, {
        nodeId: ROW_TWO_ID,
        children: [{ nodeId: CELL_D_ID }, { nodeId: CELL_C_ID, rowspan: 2 }],
      }, {
        children: [{ kind: 'table-header' }, { kind: 'table-cell' }],
      }],
    });
    expect(JSON.stringify(table)).not.toContain(CELL_B_ID);
    expect(JSON.stringify(table)).not.toContain(PARAGRAPH_B_ID);
  });

  it('allocates collision-free temporary ids and exact copy origins for local table descendants', async () => {
    const baseline = acceptedDocument();
    const accepted: XnlRichDocument = {
      ...baseline,
      children: [paragraph(nodeId('xnl-temporary:0'), 'Reserved'), ...baseline.children],
    };
    const result = await materialize(command(tableEdit()), accepted);

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    const table = result.candidate.children[2];
    if (table?.kind !== 'table') throw new Error('Expected materialized table.');
    const localRow = table.children[2]!;
    const localIds = [
      localRow.nodeId,
      ...localRow.children.flatMap((cell) => [cell.nodeId, ...cell.children.map((child) => child.nodeId)]),
    ];
    expect(new Set(localIds).size).toBe(localIds.length);
    expect(localIds.every((id) => id.startsWith('xnl-temporary:'))).toBe(true);
    expect(localIds).not.toContain(nodeId('xnl-temporary:0'));

    const copiedCell = localRow.children[1]!;
    const copiedParagraph = copiedCell.children[0]!;
    expect(result.copyOrigins).toEqual(expect.arrayContaining([
      { candidateNodeId: copiedCell.nodeId, sourceNodeId: CELL_D_ID },
      { candidateNodeId: copiedParagraph.nodeId, sourceNodeId: PARAGRAPH_D_ID },
    ]));
    expect(result.copyOrigins).toHaveLength(2);

    const classified = logicRoot.classifyXnlRichDocumentIdentity(EMPTY, {
      accepted,
      candidate: result.candidate,
      copyOrigins: result.copyOrigins,
    }, EMPTY);
    expect(classified.status).toBe('classified');
    if (classified.status === 'classified') {
      expect(classified.changes.filter(({ classification }) => classification === 'copy')).toHaveLength(2);
    }
  });

  it('is edit-order independent when a compatible table-root move shares the command', async () => {
    const move: XnlRichDocumentSemanticEdit = {
      kind: 'move',
      nodeId: TABLE_ID,
      from: { parent: stable(DOCUMENT_ID), index: 1 },
      to: { parent: stable(DOCUMENT_ID), index: 0 },
    };
    const first = await materialize(command(move, tableEdit()));
    const second = await materialize(command(tableEdit(), move));

    expect(first.status).toBe('materialized');
    expect(second.status).toBe('materialized');
    if (first.status !== 'materialized' || second.status !== 'materialized') return;
    expect(first.candidate).toEqual(second.candidate);
    expect(first.candidate.children[0]).toMatchObject({ kind: 'table', nodeId: TABLE_ID });
  });

  it('returns a deeply frozen, alias-safe result and leaves caller inputs unchanged', async () => {
    const accepted = acceptedDocument();
    const value = command(tableEdit());
    const acceptedBefore = structuredClone(accepted);
    const commandBefore = structuredClone(value);
    const result = await materialize(value, accepted);

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate).not.toBe(accepted);
    expect(result.candidate.children[1]).not.toBe(accepted.children[1]);
    expect(accepted).toEqual(acceptedBefore);
    expect(value).toEqual(commandBefore);
    expectDeepFrozen(result);
  });
});

describe('RichDocument table adversarial atomic rejection', () => {
  it.each([
    ['stale root before snapshot', command(tableEdit(afterTable(), {
      ...beforeTable(),
      children: [],
    }))],
    ['unknown stable descendant', command(tableEdit({
      ...afterTable(),
      children: [{
        kind: 'table-row',
        nodeId: nodeId('table-row.forged'),
        children: [],
      }],
    }))],
    ['duplicate table edit', command(tableEdit(), tableEdit())],
    ['deleted table', command(
      { kind: 'delete', nodeId: TABLE_ID, parent: stable(DOCUMENT_ID), index: 1 },
      tableEdit(),
    )],
    ['replaced table', command(
      { kind: 'delete', nodeId: TABLE_ID, parent: stable(DOCUMENT_ID), index: 1 },
      {
        kind: 'insert',
        localNodeId: 'local:table.replacement',
        parent: stable(DOCUMENT_ID),
        index: 1,
        node: {
          kind: 'table',
          localNodeId: 'local:table.replacement',
          children: [],
        },
      },
      tableEdit(),
    )],
    ['deleted table descendant', command(
      { kind: 'delete', nodeId: CELL_B_ID, parent: stable(ROW_ONE_ID), index: 1 },
      tableEdit(),
    )],
    ['inserted table descendant', command(
      {
        kind: 'insert',
        localNodeId: 'local:inside.table',
        parent: stable(CELL_B_ID),
        index: 1,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:inside.table',
          content: [{ kind: 'text', text: 'Conflict' }],
        },
      },
      tableEdit(),
    )],
    ['content-edited table descendant', command(
      {
        kind: 'text',
        nodeId: PARAGRAPH_A_ID,
        before: 'A',
        after: 'Conflict',
        beforeInlineRuns: [{ text: 'A', marks: [] }],
        afterInlineRuns: [{ text: 'Conflict', marks: [] }],
      },
      tableEdit(),
    )],
  ])('rejects the whole command for %s', async (_label, value) => {
    const accepted = acceptedDocument();
    const acceptedBefore = structuredClone(accepted);
    const commandBefore = structuredClone(value);
    const result = await materialize(value, accepted);

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('candidate');
    expect(accepted).toEqual(acceptedBefore);
    expect(value).toEqual(commandBefore);
    if (result.status === 'rejected') expectDeepFrozen(result);
  });

  it('does not inspect runtime/config authority on a table failure', async () => {
    let getterInvocations = 0;
    const authority = {};
    Object.defineProperty(authority, 'writer', {
      enumerable: true,
      get: () => {
        getterInvocations += 1;
        return 'forbidden';
      },
    });
    const result = await materializer()(
      authority as never,
      { accepted: acceptedDocument(), command: command(tableEdit(afterTable(), {
        ...beforeTable(), children: [],
      })) },
      authority as never,
    );

    expect(result.status).toBe('rejected');
    expect(getterInvocations).toBe(0);
  });
});
