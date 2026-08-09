import {
  Extension,
  Node,
  type Extensions,
  type NodeViewRenderer,
} from '@tiptap/core';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';

const PERSISTENT_NODE_TYPES = [
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'horizontalRule',
  'image',
  'codeBlock',
  'hardBreak',
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
  readonly codeBlock?: NodeViewRenderer;
  readonly mermaid?: NodeViewRenderer;
  readonly componentEmbed?: NodeViewRenderer;
  readonly capsuleEmbed?: NodeViewRenderer;
}

function createCodeBlockNode(nodeView?: NodeViewRenderer) {
  const base = CodeBlock.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        nodeId: { default: null },
      };
    },
  });
  return nodeView === undefined
    ? base
    : base.extend({
        addNodeView() {
          return nodeView;
        },
      });
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
const RichDocumentTaskItem = TaskItem.extend({
  content: 'block+',
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
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      listItem: false,
      listKeymap: false,
      trailingNode: false,
      undoRedo: false,
    }),
    ComposableCode,
    createCodeBlockNode(nodeViews.codeBlock),
    RichDocumentListItem,
    TaskList,
    RichDocumentTaskItem,
    PersistentNodeIdentity,
    LinkTitle,
    TextAlign.configure({
      types: ['paragraph', 'heading'],
      alignments: ['start', 'center', 'end', 'justify'],
      defaultAlignment: null,
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
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
