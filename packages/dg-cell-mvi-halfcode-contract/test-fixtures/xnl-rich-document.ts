import type {
  XnlRichDocument,
  XnlRichDocumentDomainNodeId,
} from '../src/xnl-rich-document';

const nodeId = (value: string): XnlRichDocumentDomainNodeId =>
  value as XnlRichDocumentDomainNodeId;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

/** Canonical renderer-neutral fixture for package consumers' contract tests only. */
export const XNL_RICH_DOCUMENT_CANONICAL_FIXTURE: XnlRichDocument = deepFreeze({
  kind: 'document',
  nodeId: nodeId('document.canonical'),
  children: [
    {
      kind: 'heading',
      nodeId: nodeId('heading.overview'),
      level: 2,
      content: [{
        kind: 'text',
        text: 'Canonical RichDocument',
        marks: [
          { kind: 'bold' },
          { kind: 'italic' },
          { kind: 'strike' },
          { kind: 'underline' },
          { kind: 'code' },
          {
            kind: 'link',
            href: 'https://example.test/rich-document',
            title: 'RichDocument contract',
          },
          { kind: 'text-color', color: '#1a2b3c' },
          { kind: 'highlight' },
        ],
      }],
    },
    {
      kind: 'paragraph',
      nodeId: nodeId('paragraph.introduction'),
      align: 'start',
      content: [
        { kind: 'text', text: 'Domain XNL remains' },
        { kind: 'hard-break', nodeId: nodeId('hardbreak.introduction') },
        { kind: 'text', text: 'authoritative.' },
      ],
    },
    {
      kind: 'blockquote',
      nodeId: nodeId('blockquote.identity'),
      children: [{
        kind: 'paragraph',
        nodeId: nodeId('paragraph.identity'),
        content: [{ kind: 'text', text: '#id aligns structure and preserves moves.' }],
      }],
    },
    {
      kind: 'bullet-list',
      nodeId: nodeId('list.bullet'),
      children: [{
        kind: 'list-item',
        nodeId: nodeId('listitem.bullet.first'),
        children: [{
          kind: 'paragraph',
          nodeId: nodeId('paragraph.bullet.first'),
          content: [{ kind: 'text', text: 'Renderer-neutral body' }],
        }],
      }],
    },
    {
      kind: 'ordered-list',
      nodeId: nodeId('list.ordered'),
      start: 3,
      children: [{
        kind: 'list-item',
        nodeId: nodeId('listitem.ordered.third'),
        children: [{
          kind: 'blockquote',
          nodeId: nodeId('blockquote.ordered.third'),
          children: [{
            kind: 'paragraph',
            nodeId: nodeId('paragraph.ordered.third'),
            content: [{ kind: 'text', text: 'Nested list and blockquote content' }],
          }],
        }],
      }],
    },
    {
      kind: 'image',
      nodeId: nodeId('image.architecture'),
      src: 'vfs://./assets/architecture.png',
      alt: 'RichDocument architecture',
      title: 'Architecture',
    },
    {
      kind: 'task-list',
      nodeId: nodeId('tasklist.release'),
      children: [{
        kind: 'task-item',
        nodeId: nodeId('taskitem.release.verify'),
        checked: true,
        children: [{
          kind: 'paragraph',
          nodeId: nodeId('paragraph.task.release'),
          content: [{ kind: 'text', text: 'Verify the canonical document' }],
        }],
      }],
    },
    {
      kind: 'horizontal-rule',
      nodeId: nodeId('horizontalrule.section'),
    },
    {
      kind: 'table',
      nodeId: nodeId('table.capabilities'),
      children: [{
        kind: 'table-row',
        nodeId: nodeId('tablerow.capabilities.header'),
        children: [
          {
            kind: 'table-header',
            nodeId: nodeId('tableheader.capability'),
            colspan: 2,
            rowspan: 1,
            children: [{
              kind: 'paragraph',
              nodeId: nodeId('paragraph.table.header'),
              content: [{ kind: 'text', text: 'Capability' }],
            }],
          },
          {
            kind: 'table-cell',
            nodeId: nodeId('tablecell.capability.value'),
            children: [{
              kind: 'paragraph',
              nodeId: nodeId('paragraph.table.value'),
              content: [{ kind: 'text', text: 'Canonical projection' }],
            }],
          },
        ],
      }],
    },
    {
      kind: 'code-block',
      nodeId: nodeId('codeblock.example'),
      language: 'typescript',
      text: 'export const authority = "xnl";',
    },
    {
      kind: 'mermaid',
      nodeId: nodeId('mermaid.flow'),
      source: 'flowchart LR\nXNL --> RichDocument',
    },
    {
      kind: 'component-embed',
      nodeId: nodeId('componentembed.servicecard'),
      component: { ref: 'component://architecture.ServiceCard', version: '1' },
      input: {
        service: {
          id: 'payments',
          enabled: true,
          thresholds: [1, 5, 10],
          metadata: { owner: 'checkout', note: null },
        },
      },
    },
    {
      kind: 'capsule-embed',
      nodeId: nodeId('capsuleembed.servicemap'),
      capsule: { ref: 'capsule://architecture.ServiceMap', version: '2' },
      input: {
        regions: [
          { name: 'eu', active: true },
          { name: 'us', active: false },
        ],
        viewport: { zoom: 2, center: [41.01, 28.97] },
      },
    },
  ],
});
