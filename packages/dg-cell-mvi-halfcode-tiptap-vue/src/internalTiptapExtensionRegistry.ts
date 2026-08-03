import {
  Extension,
  Node,
  type Extensions,
  type NodeViewRenderer,
} from '@tiptap/core';
import Code from '@tiptap/extension-code';
import Image from '@tiptap/extension-image';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';

const PERSISTENT_NODE_TYPES = [
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'image',
  'codeBlock',
] as const;

const PersistentNodeIdentity = Extension.create({
  name: 'xnlRichDocumentPersistentNodeIdentity',
  addGlobalAttributes() {
    return [{
      types: [...PERSISTENT_NODE_TYPES],
      attributes: {
        nodeId: { default: null },
      },
    }];
  },
});

const LinkTitle = Extension.create({
  name: 'xnlRichDocumentLinkTitle',
  addGlobalAttributes() {
    return [{
      types: ['link'],
      attributes: {
        title: { default: null },
      },
    }];
  },
});

const Mermaid = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      nodeId: { default: null },
      source: { default: '' },
    };
  },
});

interface XnlRichDocumentTiptapHostNodeViews {
  readonly mermaid?: NodeViewRenderer;
  readonly componentEmbed?: NodeViewRenderer;
  readonly capsuleEmbed?: NodeViewRenderer;
}

function createMermaidNode(nodeView?: NodeViewRenderer) {
  return nodeView === undefined
    ? Mermaid
    : Mermaid.extend({
        addNodeView() {
          return nodeView;
        },
      });
}

function createEmbedNode(
  name: 'componentEmbed' | 'capsuleEmbed',
  nodeView?: NodeViewRenderer,
) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    addAttributes() {
      return {
        nodeId: { default: null },
        ref: { default: null },
        version: { default: null },
        input: { default: null },
      };
    },
    ...(nodeView === undefined ? {} : {
      addNodeView() {
        return nodeView;
      },
    }),
  });
}

const ComposableCode = Code.extend({
  excludes: '',
});
const RichDocumentListItem = Node.create({
  name: 'listItem',
  defining: true,
  content: 'block+',
  renderHTML({ HTMLAttributes }) {
    return ['li', HTMLAttributes, 0];
  },
});
const RichDocumentTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null },
    };
  },
});
const RichDocumentTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null },
    };
  },
});
const RichDocumentTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null },
    };
  },
});
const RichDocumentTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null },
    };
  },
});

/** Package-internal registry assembly for restricted NodeView hosts. */
export function createXnlRichDocumentTiptapHostExtensions(
  nodeViews: XnlRichDocumentTiptapHostNodeViews,
): Extensions {
  return [
    StarterKit.configure({
      code: false,
      dropcursor: false,
      gapcursor: false,
      hardBreak: false,
      horizontalRule: false,
      listItem: false,
      listKeymap: false,
      trailingNode: false,
      underline: false,
      undoRedo: false,
    }),
    ComposableCode,
    RichDocumentListItem,
    PersistentNodeIdentity,
    LinkTitle,
    Image.configure({ resize: false }),
    RichDocumentTable,
    RichDocumentTableRow,
    RichDocumentTableCell,
    RichDocumentTableHeader,
    createMermaidNode(nodeViews.mermaid),
    createEmbedNode('componentEmbed', nodeViews.componentEmbed),
    createEmbedNode('capsuleEmbed', nodeViews.capsuleEmbed),
  ];
}
