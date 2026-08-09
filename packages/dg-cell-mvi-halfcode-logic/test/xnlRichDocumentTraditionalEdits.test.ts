import { describe, expect, it } from 'vitest';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
  materializeXnlRichDocumentSemanticCandidate,
  type XnlRichDocument,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentEditCommand,
  type XnlRichDocumentSemanticEdit,
} from '../src';

const id = (value: string): XnlRichDocumentDomainNodeId => value as XnlRichDocumentDomainNodeId;
const DOCUMENT_ID = id('document.traditional-edits');
const PARAGRAPH_ID = id('paragraph.editable');
const BREAK_ID = id('break.existing');
const TASK_ID = id('task.editable');

const ACCEPTED: XnlRichDocument = {
  kind: 'document',
  nodeId: DOCUMENT_ID,
  children: [{
    kind: 'paragraph',
    nodeId: PARAGRAPH_ID,
    content: [
      { kind: 'text', text: 'Before' },
      { kind: 'hard-break', nodeId: BREAK_ID },
      { kind: 'text', text: 'After' },
    ],
  }, {
    kind: 'task-list',
    nodeId: id('task-list.editable'),
    children: [{
      kind: 'task-item',
      nodeId: TASK_ID,
      checked: false,
      children: [{
        kind: 'paragraph',
        nodeId: id('paragraph.task'),
        content: [{ kind: 'text', text: 'Ship' }],
      }],
    }],
  }],
};

function command(...edits: readonly XnlRichDocumentSemanticEdit[]): XnlRichDocumentEditCommand {
  return {
    type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
    target: { path: [], nodeId: DOCUMENT_ID },
    payload: { version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION, edits },
  };
}

describe('traditional RichDocument semantic edits', () => {
  it('atomically updates alignment, task state and hard-break structure', async () => {
    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted: ACCEPTED,
      command: command(
        {
          kind: 'node-attributes',
          nodeId: PARAGRAPH_ID,
          before: { kind: 'paragraph' },
          after: { kind: 'paragraph', align: 'justify' },
        },
        {
          kind: 'node-attributes',
          nodeId: TASK_ID,
          before: { kind: 'task-item', checked: false },
          after: { kind: 'task-item', checked: true },
        },
        {
          kind: 'inline',
          nodeId: PARAGRAPH_ID,
          before: [
            { kind: 'text', text: 'Before' },
            { kind: 'hard-break', nodeId: BREAK_ID },
            { kind: 'text', text: 'After' },
          ],
          after: [
            { kind: 'text', text: 'Before', marks: [{ kind: 'underline' }] },
            { kind: 'hard-break', nodeId: BREAK_ID },
            { kind: 'text', text: 'Middle' },
            { kind: 'hard-break', localNodeId: 'local:break.new' },
            { kind: 'text', text: 'After' },
          ],
        },
      ),
    }, {});

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    expect(result.candidate.children[0]).toMatchObject({
      kind: 'paragraph',
      align: 'justify',
      content: [
        { kind: 'text', text: 'Before', marks: [{ kind: 'underline' }] },
        { kind: 'hard-break', nodeId: BREAK_ID },
        { kind: 'text', text: 'Middle' },
        { kind: 'hard-break', nodeId: expect.stringMatching(/^xnl-temporary:inline:/) },
        { kind: 'text', text: 'After' },
      ],
    });
    expect(result.candidate.children[1]).toMatchObject({
      kind: 'task-list',
      children: [{ checked: true }],
    });
  });

  it('rejects a mixed batch when any before snapshot is stale without mutating accepted data', async () => {
    const snapshot = JSON.stringify(ACCEPTED);
    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted: ACCEPTED,
      command: command(
        {
          kind: 'node-attributes',
          nodeId: PARAGRAPH_ID,
          before: { kind: 'paragraph' },
          after: { kind: 'paragraph', align: 'center' },
        },
        {
          kind: 'node-attributes',
          nodeId: TASK_ID,
          before: { kind: 'task-item', checked: true },
          after: { kind: 'task-item', checked: false },
        },
      ),
    }, {});

    expect(result).toMatchObject({ status: 'rejected' });
    expect(JSON.stringify(ACCEPTED)).toBe(snapshot);
  });

  it('allocates a pre-authority identity for a hard break inside an inserted paragraph', async () => {
    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted: ACCEPTED,
      command: command({
        kind: 'insert',
        localNodeId: 'local:paragraph.with-break',
        parent: { kind: 'stable', nodeId: DOCUMENT_ID },
        index: 2,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:paragraph.with-break',
          content: [
            { kind: 'text', text: 'First' },
            { kind: 'hard-break', localNodeId: 'local:break.inserted' },
            { kind: 'text', text: 'Second' },
          ],
        },
      }),
    }, {});

    expect(result).toMatchObject({
      status: 'materialized',
      candidate: {
        children: [
          {},
          {},
          {
            kind: 'paragraph',
            content: [
              { kind: 'text', text: 'First' },
              { kind: 'hard-break', nodeId: expect.stringMatching(/^xnl-temporary:inline:/) },
              { kind: 'text', text: 'Second' },
            ],
          },
        ],
      },
    });
  });

  it('allocates hard-break identities globally across inline edits and accepted collisions', async () => {
    const collisionId = id('xnl-temporary:inline:0');
    const secondParagraphId = id('paragraph.second-edit');
    const accepted: XnlRichDocument = {
      kind: 'document',
      nodeId: DOCUMENT_ID,
      children: [{
        kind: 'paragraph',
        nodeId: PARAGRAPH_ID,
        content: [{ kind: 'hard-break', nodeId: collisionId }],
      }, {
        kind: 'paragraph',
        nodeId: secondParagraphId,
        content: [],
      }],
    };

    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted,
      command: command({
        kind: 'inline',
        nodeId: PARAGRAPH_ID,
        before: [{ kind: 'hard-break', nodeId: collisionId }],
        after: [
          { kind: 'hard-break', nodeId: collisionId },
          { kind: 'hard-break', localNodeId: 'local:break.first-edit' },
        ],
      }, {
        kind: 'inline',
        nodeId: secondParagraphId,
        before: [],
        after: [{ kind: 'hard-break', localNodeId: 'local:break.second-edit' }],
      }),
    }, {});

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    const allocatedIds = result.candidate.children.flatMap((node) => (
      node.kind === 'paragraph'
        ? node.content.flatMap((inline) => inline.kind === 'hard-break' ? [inline.nodeId] : [])
        : []
    ));
    expect(allocatedIds).toEqual([
      collisionId,
      id('xnl-temporary:inline:1'),
      id('xnl-temporary:inline:2'),
    ]);
    expect(new Set(allocatedIds).size).toBe(3);
  });

  it('retains exact hard-break provenance for inline and subtree copies', async () => {
    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted: ACCEPTED,
      command: command({
        kind: 'inline',
        nodeId: PARAGRAPH_ID,
        before: [
          { kind: 'text', text: 'Before' },
          { kind: 'hard-break', nodeId: BREAK_ID },
          { kind: 'text', text: 'After' },
        ],
        after: [
          { kind: 'text', text: 'Before' },
          { kind: 'hard-break', nodeId: BREAK_ID },
          {
            kind: 'hard-break',
            localNodeId: 'local:break.inline-copy',
            sourceNodeId: BREAK_ID,
          },
          { kind: 'text', text: 'After' },
        ],
      }, {
        kind: 'insert',
        localNodeId: 'local:paragraph.copy',
        parent: { kind: 'stable', nodeId: DOCUMENT_ID },
        index: 2,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:paragraph.copy',
          sourceNodeId: PARAGRAPH_ID,
          content: [
            { kind: 'text', text: 'Before' },
            {
              kind: 'hard-break',
              localNodeId: 'local:break.subtree-copy',
              sourceNodeId: BREAK_ID,
            },
            { kind: 'text', text: 'After' },
          ],
        },
      }),
    }, {});

    expect(result.status).toBe('materialized');
    if (result.status !== 'materialized') return;
    const edited = result.candidate.children[0];
    const copied = result.candidate.children[2];
    if (edited?.kind !== 'paragraph' || copied?.kind !== 'paragraph') {
      throw new Error('Expected edited and copied paragraphs.');
    }
    const inlineCopy = edited.content[2];
    const subtreeCopy = copied.content[1];
    if (inlineCopy?.kind !== 'hard-break' || subtreeCopy?.kind !== 'hard-break') {
      throw new Error('Expected copied hard breaks.');
    }
    expect(result.copyOrigins).toEqual(expect.arrayContaining([
      { candidateNodeId: inlineCopy.nodeId, sourceNodeId: BREAK_ID },
      { candidateNodeId: copied.nodeId, sourceNodeId: PARAGRAPH_ID },
      { candidateNodeId: subtreeCopy.nodeId, sourceNodeId: BREAK_ID },
    ]));
    expect(result.copyOrigins).toHaveLength(3);
  });

  it.each([
    {
      label: 'a forged stable hard-break identity in an inserted paragraph',
      hardBreak: { kind: 'hard-break', nodeId: id('forged.break') },
    },
    {
      label: 'missing hard-break provenance in a copied paragraph',
      sourceNodeId: PARAGRAPH_ID,
      hardBreak: { kind: 'hard-break', localNodeId: 'local:break.missing-source' },
    },
  ])('rejects $label', async ({ sourceNodeId, hardBreak }) => {
    const result = await materializeXnlRichDocumentSemanticCandidate({}, {
      accepted: ACCEPTED,
      command: command({
        kind: 'insert',
        localNodeId: 'local:paragraph.invalid',
        parent: { kind: 'stable', nodeId: DOCUMENT_ID },
        index: 2,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:paragraph.invalid',
          ...(sourceNodeId === undefined ? {} : { sourceNodeId }),
          content: [
            { kind: 'text', text: 'Before' },
            hardBreak,
            { kind: 'text', text: 'After' },
          ],
        } as never,
      }),
    }, {});

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_IDENTITY_PROVENANCE' }),
      ]));
    }
  });
});
