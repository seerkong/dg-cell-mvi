import { describe, expect, it } from 'vitest';
import {
  parseXnlRichDocumentCandidate,
  type XnlRichDocumentNormalizedResult,
} from '../src';

const EMPTY = Object.freeze({});

function parse(candidate: unknown): XnlRichDocumentNormalizedResult {
  return parseXnlRichDocumentCandidate(EMPTY, { candidate } as never, EMPTY);
}

function paragraph(
  id: string,
  content: readonly unknown[],
  align?: 'start' | 'center' | 'end' | 'justify',
): unknown {
  return {
    kind: 'paragraph',
    nodeId: id,
    ...(align === undefined ? {} : { align }),
    content,
  };
}

function documentWith(...children: readonly unknown[]): unknown {
  return { kind: 'document', nodeId: 'document:traditional', children };
}

function expectRejectedAt(
  result: XnlRichDocumentNormalizedResult,
  code: 'LOSSY_CONSTRUCT' | 'UNSUPPORTED_CONSTRUCT',
  path: readonly (string | number)[],
): void {
  expect(result.status).toBe('rejected');
  if (result.status !== 'rejected') return;
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code, path }),
  ]));
}

describe('RichDocument traditional canonical semantics', () => {
  it('normalizes underline, color, highlight and alignment with one deterministic mark order', () => {
    const candidate = documentWith(paragraph('paragraph:marks', [{
      kind: 'text',
      text: 'Canonical marks',
      marks: [
        { kind: 'highlight' },
        { kind: 'text-color', color: '#1a2b3c' },
        { kind: 'link', href: '/document' },
        { kind: 'code' },
        { kind: 'underline' },
        { kind: 'strike' },
        { kind: 'italic' },
        { kind: 'bold' },
      ],
    }], 'center'));

    const result = parse(candidate);

    expect(result).toMatchObject({
      status: 'normalized',
      document: {
        children: [{
          kind: 'paragraph',
          align: 'center',
          content: [{
            marks: [
              { kind: 'bold' },
              { kind: 'italic' },
              { kind: 'strike' },
              { kind: 'underline' },
              { kind: 'code' },
              { kind: 'link', href: '/document' },
              { kind: 'text-color', color: '#1a2b3c' },
              { kind: 'highlight' },
            ],
          }],
        }],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('keeps absent alignment and default highlight color absent instead of materializing defaults', () => {
    const result = parse(documentWith(paragraph('paragraph:defaults', [{
      kind: 'text',
      text: 'Defaults stay implicit',
      marks: [{ kind: 'highlight' }],
    }])));

    expect(result.status).toBe('normalized');
    if (result.status !== 'normalized') return;
    const block = result.document.children[0];
    expect(block).not.toHaveProperty('align');
    expect(block).toMatchObject({
      kind: 'paragraph',
      content: [{ marks: [{ kind: 'highlight' }] }],
    });
    if (block?.kind !== 'paragraph') return;
    const firstInline = block.content[0];
    if (firstInline?.kind !== 'text') return;
    expect(firstInline.marks?.[0]).not.toHaveProperty('color');
  });

  it.each(['start', 'center', 'end', 'justify'] as const)(
    'accepts canonical %s alignment on paragraph and heading',
    (align) => {
      const result = parse(documentWith(
        paragraph(`paragraph:${align}`, [{ kind: 'text', text: align }], align),
        {
          kind: 'heading',
          nodeId: `heading:${align}`,
          level: 2,
          align,
          content: [{ kind: 'text', text: align }],
        },
      ));

      expect(result).toMatchObject({
        status: 'normalized',
        document: { children: [{ align }, { align }] },
      });
    },
  );

  it.each(['left', 'right', '', 'CENTER'])('rejects non-canonical alignment %j', (align) => {
    const result = parse(documentWith({
      kind: 'paragraph',
      nodeId: 'paragraph:bad-align',
      align,
      content: [],
    }));

    expectRejectedAt(result, 'LOSSY_CONSTRUCT', ['children', 0, 'align']);
  });

  it('preserves task structure, checked state, horizontal rule and inline hard break', () => {
    const result = parse(documentWith(
      {
        kind: 'task-list',
        nodeId: 'task-list:release',
        children: [{
          kind: 'task-item',
          nodeId: 'task-item:test',
          checked: true,
          children: [paragraph('paragraph:task', [
            { kind: 'text', text: 'Run' },
            { kind: 'hard-break', nodeId: 'hard-break:task' },
            { kind: 'text', text: 'tests', marks: [{ kind: 'underline' }] },
          ])],
        }],
      },
      { kind: 'horizontal-rule', nodeId: 'horizontal-rule:one' },
    ));

    expect(result).toMatchObject({
      status: 'normalized',
      document: {
        children: [
          {
            kind: 'task-list',
            nodeId: 'task-list:release',
            children: [{
              kind: 'task-item',
              nodeId: 'task-item:test',
              checked: true,
              children: [{
                kind: 'paragraph',
                content: [
                  { kind: 'text', text: 'Run' },
                  { kind: 'hard-break', nodeId: 'hard-break:task' },
                  { kind: 'text', text: 'tests', marks: [{ kind: 'underline' }] },
                ],
              }],
            }],
          },
          { kind: 'horizontal-rule', nodeId: 'horizontal-rule:one' },
        ],
      },
    });
  });

  it('rejects duplicate marks instead of selecting one conflicting value', () => {
    const result = parse(documentWith(paragraph('paragraph:duplicate-mark', [{
      kind: 'text',
      text: 'duplicate',
      marks: [
        { kind: 'text-color', color: '#111111' },
        { kind: 'text-color', color: '#222222' },
      ],
    }])));

    expectRejectedAt(result, 'LOSSY_CONSTRUCT', ['children', 0, 'content', 0, 'marks', 1]);
  });

  it.each([
    'url(https://example.test/color)',
    'var(--brand-color)',
    'currentcolor',
    'red; background: black',
    'expression(alert(1))',
    'definitelynotacolor',
    'rgb(256, 0, 0)',
    'rgba(0, 0, 0, 2)',
    'hsl(361 50% 50%)',
    'hsl(10 101% 50%)',
  ])('rejects unsafe color token %j', (color) => {
    const result = parse(documentWith(paragraph('paragraph:unsafe-color', [{
      kind: 'text',
      text: 'unsafe',
      marks: [{ kind: 'text-color', color }],
    }])));

    expectRejectedAt(result, 'LOSSY_CONSTRUCT', [
      'children', 0, 'content', 0, 'marks', 0, 'color',
    ]);
  });

  it.each([
    '#1a2b3c',
    '#1a2b3c80',
    'rgb(10 20 30 / 50%)',
    'rgba(10, 20, 30, 0.5)',
    'hsl(210 50% 40%)',
    'rebeccapurple',
    'transparent',
  ])('preserves supported canonical color token %j', (color) => {
    const result = parse(documentWith(paragraph('paragraph:valid-color', [{
      kind: 'text',
      text: 'valid',
      marks: [
        { kind: 'text-color', color },
        { kind: 'highlight', color },
      ],
    }])));

    expect(result).toMatchObject({
      status: 'normalized',
      document: {
        children: [{
          content: [{
            marks: [
              { kind: 'text-color', color },
              { kind: 'highlight', color },
            ],
          }],
        }],
      },
    });
  });

  it.each([
    {
      name: 'task-list with arbitrary block child',
      candidate: documentWith({
        kind: 'task-list',
        nodeId: 'task-list:invalid',
        children: [paragraph('paragraph:not-task-item', [])],
      }),
      path: ['children', 0, 'children', 0],
    },
    {
      name: 'task-item with non-boolean checked state',
      candidate: documentWith({
        kind: 'task-list',
        nodeId: 'task-list:invalid-checked',
        children: [{
          kind: 'task-item',
          nodeId: 'task-item:invalid-checked',
          checked: 'true',
          children: [],
        }],
      }),
      path: ['children', 0, 'children', 0, 'checked'],
    },
    {
      name: 'horizontal rule with children',
      candidate: documentWith({
        kind: 'horizontal-rule',
        nodeId: 'horizontal-rule:invalid',
        children: [],
      }),
      path: ['children', 0, 'children'],
    },
    {
      name: 'hard break at block position',
      candidate: documentWith({ kind: 'hard-break', nodeId: 'hard-break:block-position' }),
      path: ['children', 0],
    },
  ])('rejects invalid shape: $name', ({ candidate, path }) => {
    expectRejectedAt(parse(candidate), 'LOSSY_CONSTRUCT', path);
  });

  it('rejects marks and persistent identity on hard-break inline atoms', () => {
    const marksResult = parse(documentWith(paragraph('paragraph:break-marks', [{
      kind: 'hard-break',
      nodeId: 'hard-break:marks',
      marks: [{ kind: 'bold' }],
    }])));
    const unknownAttributeResult = parse(documentWith(paragraph('paragraph:break-attribute', [{
      kind: 'hard-break',
      nodeId: 'hard-break:attribute',
      text: '\n',
    }])));

    expectRejectedAt(marksResult, 'LOSSY_CONSTRUCT', ['children', 0, 'content', 0, 'marks']);
    expectRejectedAt(unknownAttributeResult, 'LOSSY_CONSTRUCT', [
      'children', 0, 'content', 0, 'text',
    ]);
  });

  it('rejects unknown attributes on new nodes and marks without silently dropping them', () => {
    const nodeResult = parse(documentWith({
      kind: 'horizontal-rule',
      nodeId: 'horizontal-rule:unknown-attribute',
      thickness: 2,
    }));
    const markResult = parse(documentWith(paragraph('paragraph:unknown-mark-attribute', [{
      kind: 'text',
      text: 'underlined',
      marks: [{ kind: 'underline', color: 'red' }],
    }])));

    expectRejectedAt(nodeResult, 'LOSSY_CONSTRUCT', ['children', 0, 'thickness']);
    expectRejectedAt(markResult, 'LOSSY_CONSTRUCT', [
      'children', 0, 'content', 0, 'marks', 0, 'color',
    ]);
  });

  it.each(['theme', 'lineNumbers', 'folded', 'highlightLines']) (
    'keeps enhanced code field %s presenter-local by rejecting it from durable code-block facts',
    (field) => {
      const result = parse(documentWith({
        kind: 'code-block',
        nodeId: 'code-block:strict',
        language: 'typescript',
        text: 'const value = 1;',
        [field]: field === 'lineNumbers',
      }));

      expectRejectedAt(result, 'LOSSY_CONSTRUCT', ['children', 0, field]);
    },
  );
});
