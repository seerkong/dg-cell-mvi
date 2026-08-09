import { describe, expect, it } from 'vitest';
import {
  adaptXnlNodeToRichDocument,
  materializeXnlRichDocument,
  type XnlRichDocument,
  type XnlRichDocumentDomainNodeId,
} from '../src';

const id = (value: string): XnlRichDocumentDomainNodeId => value as XnlRichDocumentDomainNodeId;

const DOCUMENT: XnlRichDocument = {
  kind: 'document',
  nodeId: id('document.traditional'),
  children: [{
    kind: 'task-list',
    nodeId: id('tasks.release'),
    children: [{
      kind: 'task-item',
      nodeId: id('task.verify'),
      checked: true,
      children: [{
        kind: 'paragraph',
        nodeId: id('paragraph.verify'),
        align: 'center',
        content: [
          {
            kind: 'text',
            text: 'Run',
            marks: [
              { kind: 'underline' },
              { kind: 'text-color', color: '#123456' },
              { kind: 'highlight' },
            ],
          },
          { kind: 'hard-break', nodeId: id('break.verify') },
          { kind: 'text', text: 'tests' },
        ],
      }],
    }],
  }, {
    kind: 'horizontal-rule',
    nodeId: id('rule.finish'),
  }, {
    kind: 'code-block',
    nodeId: id('code.sample'),
    language: 'ts',
    text: 'const ready = true;',
  }],
};

describe('traditional RichDocument concrete XNL support', () => {
  it('round-trips canonical semantics through the support-owned xnl-core adapter', () => {
    const materialized = materializeXnlRichDocument(DOCUMENT);
    expect(materialized.status).toBe('materialized');
    if (materialized.status !== 'materialized') return;

    expect(adaptXnlNodeToRichDocument(materialized.document)).toEqual({
      status: 'normalized',
      document: DOCUMENT,
    });
    expect(Object.isFrozen(materialized)).toBe(true);
  });

  it('rejects presenter-only code fields instead of persisting renderer state', () => {
    expect(materializeXnlRichDocument({
      ...DOCUMENT,
      children: [{
        kind: 'code-block',
        nodeId: 'code.unsafe',
        language: 'ts',
        text: 'const value = 1;',
        folded: true,
      }],
    } as never)).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({
        code: 'LOSSY_CONSTRUCT',
        path: ['children', 0, 'folded'],
      })],
    });
  });
});
