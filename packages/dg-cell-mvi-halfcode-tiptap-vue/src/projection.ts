import type { JSONContent } from '@tiptap/core';
import {
  XNL_RICH_DOCUMENT_IDENTITY_RULES,
  type XnlRichDocument,
  type XnlRichDocumentBlockNode,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentGenericInputRecord,
  type XnlRichDocumentMark,
  type XnlRichDocumentSerializableRecord,
  type XnlRichDocumentSerializableValue,
  type XnlRichDocumentTableCellNode,
  type XnlRichDocumentText,
} from 'dg-cell-mvi-halfcode-contract';
import { parseXnlRichDocumentCandidate } from 'dg-cell-mvi-halfcode-logic';
import { createXnlRichDocumentTiptapSchema } from './registry';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapConfig,
  type XnlRichDocumentTiptapDiagnostic,
  type XnlRichDocumentTiptapParseInput,
  type XnlRichDocumentTiptapParseProcessor,
  type XnlRichDocumentTiptapParseResult,
  type XnlRichDocumentTiptapProjectionProcessor,
  type XnlRichDocumentTiptapProjectionResult,
} from './types';

type Path = readonly (string | number)[];
type AdapterDiagnostic = XnlRichDocumentTiptapDiagnostic | XnlRichDocumentDiagnostic;

const BLOCK_TIPTAP_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'image',
  'table',
  'codeBlock',
  'mermaid',
  'componentEmbed',
  'capsuleEmbed',
]);

const TIPTAP_NODE_FIELDS = ['type', 'attrs', 'content', 'marks', 'text'] as const;
type TiptapNodeField = (typeof TIPTAP_NODE_FIELDS)[number];
type TiptapContentRole = 'block' | 'list-item' | 'table-row' | 'table-cell' | 'text' | 'code-text';

type TiptapNodeShape = Readonly<{
  fields: readonly TiptapNodeField[];
  attrs: readonly string[];
  contentRole?: TiptapContentRole;
}>;

const TIPTAP_NODE_SHAPES: Readonly<Record<string, TiptapNodeShape>> = {
  doc: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'block' },
  paragraph: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'text' },
  heading: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId', 'level'], contentRole: 'text' },
  blockquote: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'block' },
  bulletList: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'list-item' },
  orderedList: {
    fields: ['type', 'attrs', 'content'],
    attrs: ['nodeId', 'start', 'type'],
    contentRole: 'list-item',
  },
  listItem: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'block' },
  image: {
    fields: ['type', 'attrs'],
    attrs: ['nodeId', 'src', 'alt', 'title', 'width', 'height'],
  },
  table: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'table-row' },
  tableRow: { fields: ['type', 'attrs', 'content'], attrs: ['nodeId'], contentRole: 'table-cell' },
  tableCell: {
    fields: ['type', 'attrs', 'content'],
    attrs: ['nodeId', 'colspan', 'rowspan', 'colwidth', 'align'],
    contentRole: 'block',
  },
  tableHeader: {
    fields: ['type', 'attrs', 'content'],
    attrs: ['nodeId', 'colspan', 'rowspan', 'colwidth', 'align'],
    contentRole: 'block',
  },
  codeBlock: {
    fields: ['type', 'attrs', 'content'],
    attrs: ['nodeId', 'language'],
    contentRole: 'code-text',
  },
  mermaid: { fields: ['type', 'attrs'], attrs: ['nodeId', 'source'] },
  componentEmbed: {
    fields: ['type', 'attrs'],
    attrs: ['nodeId', 'ref', 'version', 'input'],
  },
  capsuleEmbed: {
    fields: ['type', 'attrs'],
    attrs: ['nodeId', 'ref', 'version', 'input'],
  },
  text: { fields: ['type', 'marks', 'text'], attrs: [] },
};

const TIPTAP_MARK_SHAPES: Readonly<Record<string, TiptapNodeShape>> = {
  bold: { fields: ['type'], attrs: [] },
  italic: { fields: ['type'], attrs: [] },
  strike: { fields: ['type'], attrs: [] },
  code: { fields: ['type'], attrs: [] },
  link: {
    fields: ['type', 'attrs'],
    attrs: ['href', 'title', 'target', 'rel', 'class'],
  },
};

const TIPTAP_MARK_ORDER = new Map([
  ['link', 0],
  ['bold', 1],
  ['code', 2],
  ['italic', 3],
  ['strike', 4],
]);

const IDENTITY = {
  field: 'nodeId',
  source: XNL_RICH_DOCUMENT_IDENTITY_RULES.persistentIdentity,
  ordinaryPayloadUpdate: XNL_RICH_DOCUMENT_IDENTITY_RULES.ordinaryPayloadUpdate,
} as const;

interface Sanitized {
  readonly ok: true;
  readonly value: XnlRichDocumentSerializableValue;
}

interface Unsafe {
  readonly ok: false;
  readonly diagnostics: readonly [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]];
}

interface ParseContext {
  readonly diagnostics: XnlRichDocumentTiptapDiagnostic[];
}

export const projectTiptapDocument: XnlRichDocumentTiptapProjectionProcessor = (
  _runtime,
  input,
  config,
): XnlRichDocumentTiptapProjectionResult => {
  const configDiagnostics = validateConfig(config);
  if (configDiagnostics.length > 0) return rejected(configDiagnostics);

  const safeInput = sanitize(input, []);
  if (!safeInput.ok) return rejected(safeInput.diagnostics);
  if (!isRecord(safeInput.value) || !hasExactKeys(safeInput.value, ['document'])) {
    return rejected([diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Projection input must contain only a RichDocument document field.',
      [],
    )]);
  }

  if (safeInput.value.document === undefined) {
    return rejected([diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Projection input document cannot be undefined.',
      ['document'],
    )]);
  }
  const normalized = parseXnlRichDocumentCandidate(
    {},
    { candidate: safeInput.value.document },
    {},
  );
  if (normalized.status === 'rejected') return rejected(normalized.diagnostics);

  const context: ParseContext = { diagnostics: [] };
  const document = projectDocument(normalized.document, context);
  if (context.diagnostics.length > 0) return rejected(context.diagnostics);
  const schemaDiagnostics = validateRegisteredSchema(document, ['document']);
  if (schemaDiagnostics.length > 0) return rejected(schemaDiagnostics);
  return deepFreeze({
    status: 'projected',
    schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
    document,
    identity: IDENTITY,
  });
};

export const parseTiptapDocument: XnlRichDocumentTiptapParseProcessor = (
  _runtime,
  input,
  config,
): XnlRichDocumentTiptapParseResult => {
  const configDiagnostics = validateConfig(config);
  if (configDiagnostics.length > 0) return rejected(configDiagnostics);

  return parseTiptapDocumentInput(input, true);
};

/** Package-internal semantic validation for an already materialized canonical document. */
export function parseXnlRichDocumentTiptapSemantics(
  input: XnlRichDocumentTiptapParseInput,
): XnlRichDocumentTiptapParseResult {
  return parseTiptapDocumentInput(input, false);
}

function parseTiptapDocumentInput(
  input: XnlRichDocumentTiptapParseInput,
  validateSchema: boolean,
): XnlRichDocumentTiptapParseResult {
  const safeInput = sanitize(input, []);
  if (!safeInput.ok) return rejected(safeInput.diagnostics);
  if (!isRecord(safeInput.value) || !hasExactKeys(safeInput.value, ['document'])) {
    return rejected([diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Parse input must contain only a Tiptap document field.',
      [],
    )]);
  }

  const shapeContext: ParseContext = { diagnostics: [] };
  validateTiptapNodeShape(safeInput.value.document, ['document'], 'doc', shapeContext);
  if (shapeContext.diagnostics.length > 0) return rejected(shapeContext.diagnostics);

  if (validateSchema) {
    const schemaDiagnostics = validateRegisteredSchema(safeInput.value.document, ['document']);
    if (schemaDiagnostics.length > 0) return rejected(schemaDiagnostics);
  }

  const context: ParseContext = { diagnostics: [] };
  const document = parseDocument(safeInput.value.document, ['document'], context);
  if (context.diagnostics.length > 0 || document === undefined) {
    return rejected(context.diagnostics.length > 0 ? context.diagnostics : [diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap document could not be parsed.',
      ['document'],
    )]);
  }
  const normalized = parseXnlRichDocumentCandidate({}, { candidate: document }, {});
  if (normalized.status === 'rejected') return rejected(normalized.diagnostics);
  return deepFreeze({ status: 'parsed', document: normalized.document });
}

function projectDocument(document: XnlRichDocument, context: ParseContext): JSONContent {
  return {
    type: 'doc',
    attrs: { nodeId: document.nodeId },
    content: document.children.map((node, index) => projectBlock(
      node,
      ['children', index],
      context,
    )),
  };
}

function projectBlock(
  node: XnlRichDocumentBlockNode,
  path: Path,
  context: ParseContext,
): JSONContent {
  const attrs = { nodeId: node.nodeId };
  switch (node.kind) {
    case 'paragraph':
      return { type: 'paragraph', attrs, content: projectTextContent(node.content, path, context) };
    case 'heading':
      return {
        type: 'heading',
        attrs: { ...attrs, level: node.level },
        content: projectTextContent(node.content, path, context),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        attrs,
        content: node.children.map((child, index) => projectBlock(
          child,
          [...path, 'children', index],
          context,
        )),
      };
    case 'bullet-list':
    case 'ordered-list':
      return {
        type: node.kind === 'bullet-list' ? 'bulletList' : 'orderedList',
        attrs: node.kind === 'ordered-list' && node.start !== undefined
          ? { ...attrs, start: node.start }
          : attrs,
        content: node.children.map((item, itemIndex) => ({
          type: 'listItem',
          attrs: { nodeId: item.nodeId },
          content: item.children.map((child, childIndex) => projectBlock(
            child,
            [...path, 'children', itemIndex, 'children', childIndex],
            context,
          )),
        })),
      };
    case 'image':
      return {
        type: 'image',
        attrs: compact({ ...attrs, src: node.src, alt: node.alt, title: node.title }),
      };
    case 'table':
      return {
        type: 'table',
        attrs,
        content: node.children.map((row, rowIndex) => ({
          type: 'tableRow',
          attrs: { nodeId: row.nodeId },
          content: row.children.map((cell, cellIndex) => projectCell(
            cell,
            [...path, 'children', rowIndex, 'children', cellIndex],
            context,
          )),
        })),
      };
    case 'code-block':
      return {
        type: 'codeBlock',
        attrs: compact({ ...attrs, language: node.language }),
        ...(node.text.length > 0 ? { content: [{ type: 'text', text: node.text }] } : {}),
      };
    case 'mermaid':
      return { type: 'mermaid', attrs: { ...attrs, source: node.source } };
    case 'component-embed':
      return {
        type: 'componentEmbed',
        attrs: compact({
          ...attrs,
          ref: node.component.ref,
          version: node.component.version,
          input: node.input,
        }),
      };
    case 'capsule-embed':
      return {
        type: 'capsuleEmbed',
        attrs: compact({
          ...attrs,
          ref: node.capsule.ref,
          version: node.capsule.version,
          input: node.input,
        }),
      };
  }
}

function projectCell(
  cell: XnlRichDocumentTableCellNode,
  path: Path,
  context: ParseContext,
): JSONContent {
  return {
    type: cell.kind === 'table-header' ? 'tableHeader' : 'tableCell',
    attrs: compact({
      nodeId: cell.nodeId,
      colspan: cell.colspan,
      rowspan: cell.rowspan,
    }),
    content: cell.children.map((child, index) => projectBlock(
      child,
      [...path, 'children', index],
      context,
    )),
  };
}

function projectTextContent(
  content: readonly XnlRichDocumentText[],
  path: Path,
  context: ParseContext,
): JSONContent[] {
  return content.map((text, index) => {
    if (text.text.length === 0) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        'Tiptap cannot preserve an empty text node as a distinct node.',
        [...path, 'content', index, 'text'],
      ));
    }
    return {
      type: 'text',
      text: text.text,
      ...(text.marks === undefined
        ? {}
        : {
            marks: text.marks
              .map(projectMark)
              .sort((left, right) => (
                (TIPTAP_MARK_ORDER.get(left.type) ?? Number.MAX_SAFE_INTEGER)
                - (TIPTAP_MARK_ORDER.get(right.type) ?? Number.MAX_SAFE_INTEGER)
              )),
          }),
    };
  });
}

function projectMark(mark: XnlRichDocumentMark): NonNullable<JSONContent['marks']>[number] {
  return mark.kind === 'link'
    ? {
        type: 'link',
        attrs: compact({ href: mark.href, title: mark.title }),
      }
    : { type: mark.kind };
}

function parseDocument(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): XnlRichDocument | undefined {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (node.type !== 'doc') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Tiptap root node type "${node.type}" is not supported; expected doc.`,
      [...path, 'type'],
    ));
    return undefined;
  }
  const attrs = readAttrs(node.attrs, ['nodeId'], [...path, 'attrs'], context);
  const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
  const content = readContent(node.content, [...path, 'content'], context);
  const children = content.map((child, index) => parseBlock(
    child,
    [...path, 'content', index],
    context,
  )).filter((child): child is XnlRichDocumentBlockNode => child !== undefined);
  if (nodeId === undefined) return undefined;
  return { kind: 'document', nodeId, children };
}

function parseBlock(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): XnlRichDocumentBlockNode | undefined {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (!BLOCK_TIPTAP_TYPES.has(node.type)) {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Tiptap node type "${node.type}" is not supported as a RichDocument block.`,
      [...path, 'type'],
    ));
    return undefined;
  }

  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const allowed = node.type === 'heading' ? ['nodeId', 'level'] : ['nodeId'];
      const attrs = readAttrs(node.attrs, allowed, [...path, 'attrs'], context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      const content = parseTextContent(node.content, [...path, 'content'], context);
      if (nodeId === undefined) return undefined;
      if (node.type === 'paragraph') return { kind: 'paragraph', nodeId, content };
      const level = attrs.level;
      if (!Number.isInteger(level) || typeof level !== 'number' || level < 1 || level > 6) {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Heading level must be an integer from 1 through 6.',
          [...path, 'attrs', 'level'],
        ));
        return undefined;
      }
      return { kind: 'heading', nodeId, level: level as 1 | 2 | 3 | 4 | 5 | 6, content };
    }
    case 'blockquote': {
      const attrs = readAttrs(node.attrs, ['nodeId'], [...path, 'attrs'], context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      const children = parseBlockContent(node.content, [...path, 'content'], context);
      return nodeId === undefined ? undefined : { kind: 'blockquote', nodeId, children };
    }
    case 'bulletList':
    case 'orderedList': {
      const allowed = node.type === 'orderedList' ? ['nodeId', 'start', 'type'] : ['nodeId'];
      const attrs = readAttrs(node.attrs, allowed, [...path, 'attrs'], context);
      if (node.type === 'orderedList') expectNullOperationalAttr(attrs, 'type', path, context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      const children = readContent(node.content, [...path, 'content'], context).map((child, index) => (
        parseListItem(child, [...path, 'content', index], context)
      )).filter((child): child is NonNullable<typeof child> => child !== undefined);
      if (nodeId === undefined) return undefined;
      if (node.type === 'bulletList') return { kind: 'bullet-list', nodeId, children };
      const start = attrs.start;
      if (start !== undefined && (!Number.isInteger(start) || typeof start !== 'number' || start < 1)) {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Ordered list start must be a positive integer.',
          [...path, 'attrs', 'start'],
        ));
        return undefined;
      }
      return { kind: 'ordered-list', nodeId, ...(start === undefined ? {} : { start }), children };
    }
    case 'image': {
      const attrs = readAttrs(
        node.attrs,
        ['nodeId', 'src', 'alt', 'title', 'width', 'height'],
        [...path, 'attrs'],
        context,
      );
      expectNullOperationalAttr(attrs, 'width', path, context);
      expectNullOperationalAttr(attrs, 'height', path, context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      if (typeof attrs.src !== 'string' || attrs.src.length === 0) {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Image src must be a non-empty string.',
          [...path, 'attrs', 'src'],
        ));
        return undefined;
      }
      if (!optionalString(attrs.alt) || !optionalString(attrs.title)) {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Image alt and title must be strings when present.',
          [...path, 'attrs'],
        ));
        return undefined;
      }
      return nodeId === undefined ? undefined : {
        kind: 'image',
        nodeId,
        src: attrs.src,
        ...optionalField('alt', attrs.alt),
        ...optionalField('title', attrs.title),
      };
    }
    case 'table': {
      const attrs = readAttrs(node.attrs, ['nodeId'], [...path, 'attrs'], context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      const children = readContent(node.content, [...path, 'content'], context).map((child, index) => (
        parseTableRow(child, [...path, 'content', index], context)
      )).filter((child): child is NonNullable<typeof child> => child !== undefined);
      return nodeId === undefined ? undefined : { kind: 'table', nodeId, children };
    }
    case 'codeBlock': {
      const attrs = readAttrs(node.attrs, ['nodeId', 'language'], [...path, 'attrs'], context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      if (!optionalString(attrs.language)) {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Code block language must be a string when present.',
          [...path, 'attrs', 'language'],
        ));
        return undefined;
      }
      const text = parseCodeText(node.content, [...path, 'content'], context);
      return nodeId === undefined ? undefined : {
        kind: 'code-block',
        nodeId,
        ...optionalField('language', attrs.language),
        text,
      };
    }
    case 'mermaid': {
      const attrs = readAttrs(node.attrs, ['nodeId', 'source'], [...path, 'attrs'], context);
      const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
      if (typeof attrs.source !== 'string') {
        context.diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Mermaid source must be a string.',
          [...path, 'attrs', 'source'],
        ));
        return undefined;
      }
      return nodeId === undefined ? undefined : { kind: 'mermaid', nodeId, source: attrs.source };
    }
    case 'componentEmbed':
    case 'capsuleEmbed':
      return parseEmbed(node, path, context);
  }
}

function parseListItem(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
) {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (node.type !== 'listItem') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `List content must use listItem, received "${node.type}".`,
      [...path, 'type'],
    ));
    return undefined;
  }
  const attrs = readAttrs(node.attrs, ['nodeId'], [...path, 'attrs'], context);
  const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
  const children = parseBlockContent(node.content, [...path, 'content'], context);
  return nodeId === undefined ? undefined : { kind: 'list-item' as const, nodeId, children };
}

function parseTableRow(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
) {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (node.type !== 'tableRow') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Table content must use tableRow, received "${node.type}".`,
      [...path, 'type'],
    ));
    return undefined;
  }
  const attrs = readAttrs(node.attrs, ['nodeId'], [...path, 'attrs'], context);
  const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
  const children = readContent(node.content, [...path, 'content'], context).map((child, index) => (
    parseTableCell(child, [...path, 'content', index], context)
  )).filter((child): child is NonNullable<typeof child> => child !== undefined);
  return nodeId === undefined ? undefined : { kind: 'table-row' as const, nodeId, children };
}

function parseTableCell(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): XnlRichDocumentTableCellNode | undefined {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (node.type !== 'tableCell' && node.type !== 'tableHeader') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Table row content must use tableCell or tableHeader, received "${node.type}".`,
      [...path, 'type'],
    ));
    return undefined;
  }
  const attrs = readAttrs(
    node.attrs,
    ['nodeId', 'colspan', 'rowspan', 'colwidth', 'align'],
    [...path, 'attrs'],
    context,
  );
  expectNullOperationalAttr(attrs, 'colwidth', path, context);
  expectNullOperationalAttr(attrs, 'align', path, context);
  const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
  const colspan = positiveInteger(attrs.colspan, 1, [...path, 'attrs', 'colspan'], context);
  const rowspan = positiveInteger(attrs.rowspan, 1, [...path, 'attrs', 'rowspan'], context);
  const children = parseBlockContent(node.content, [...path, 'content'], context);
  if (nodeId === undefined || colspan === undefined || rowspan === undefined) return undefined;
  const officialDefaultsMaterialized = Object.hasOwn(attrs, 'colwidth') || Object.hasOwn(attrs, 'align');
  const hasNonDefaultSpan = colspan !== 1 || rowspan !== 1;
  const hasColspan = attrs.colspan !== undefined
    && attrs.colspan !== null
    && (!officialDefaultsMaterialized || hasNonDefaultSpan);
  const hasRowspan = attrs.rowspan !== undefined
    && attrs.rowspan !== null
    && (!officialDefaultsMaterialized || hasNonDefaultSpan);
  return {
    kind: node.type === 'tableHeader' ? 'table-header' : 'table-cell',
    nodeId,
    ...(hasColspan ? { colspan } : {}),
    ...(hasRowspan ? { rowspan } : {}),
    children,
  };
}

function parseEmbed(
  node: SafeNode,
  path: Path,
  context: ParseContext,
): XnlRichDocumentBlockNode | undefined {
  const attrs = readAttrs(
    node.attrs,
    ['nodeId', 'ref', 'version', 'input'],
    [...path, 'attrs'],
    context,
  );
  const nodeId = readNodeId(attrs, [...path, 'attrs', 'nodeId'], context);
  if (typeof attrs.ref !== 'string' || attrs.ref.length === 0 || !optionalString(attrs.version)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Embed ref must be non-empty and version must be a string when present.',
      [...path, 'attrs'],
    ));
    return undefined;
  }
  const input = attrs.input;
  if (input !== undefined && input !== null && !isRecord(input)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Embed input must be a serializable record when present.',
      [...path, 'attrs', 'input'],
    ));
    return undefined;
  }
  if (nodeId === undefined) return undefined;
  const common = {
    nodeId,
    ...optionalField('input', input === null ? undefined : input as XnlRichDocumentGenericInputRecord),
  };
  return node.type === 'componentEmbed'
    ? {
        kind: 'component-embed',
        ...common,
        component: { ref: attrs.ref, ...optionalField('version', attrs.version) },
      }
    : {
        kind: 'capsule-embed',
        ...common,
        capsule: { ref: attrs.ref, ...optionalField('version', attrs.version) },
      };
}

function parseBlockContent(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): XnlRichDocumentBlockNode[] {
  return readContent(value, path, context).map((child, index) => parseBlock(
    child,
    [...path, index],
    context,
  )).filter((child): child is XnlRichDocumentBlockNode => child !== undefined);
}

function parseTextContent(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): XnlRichDocumentText[] {
  return readContent(value, path, context).map((child, index) => parseText(
    child,
    [...path, index],
    context,
  )).filter((child): child is XnlRichDocumentText => child !== undefined);
}

function parseText(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): XnlRichDocumentText | undefined {
  const node = readNode(value, path, context);
  if (node === undefined) return undefined;
  if (node.type !== 'text') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Inline content must use text, received "${node.type}".`,
      [...path, 'type'],
    ));
    return undefined;
  }
  if (typeof node.text !== 'string' || node.text.length === 0) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Tiptap text must be a non-empty string.',
      [...path, 'text'],
    ));
    return undefined;
  }
  const marks = readContent(node.marks, [...path, 'marks'], context).map((mark, index) => (
    parseMark(mark, [...path, 'marks', index], context)
  )).filter((mark): mark is XnlRichDocumentMark => mark !== undefined);
  return {
    kind: 'text',
    text: node.text,
    ...(marks.length === 0 ? {} : { marks }),
  };
}

function parseMark(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): XnlRichDocumentMark | undefined {
  const mark = readNode(value, path, context);
  if (mark === undefined) return undefined;
  if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'strike' || mark.type === 'code') {
    if (mark.attrs !== undefined) readAttrs(mark.attrs, [], [...path, 'attrs'], context);
    return { kind: mark.type };
  }
  if (mark.type !== 'link') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_MARK',
      `Tiptap mark type "${mark.type}" is not supported.`,
      [...path, 'type'],
    ));
    return undefined;
  }
  const attrs = readAttrs(
    mark.attrs,
    ['href', 'title', 'target', 'rel', 'class'],
    [...path, 'attrs'],
    context,
  );
  if (typeof attrs.href !== 'string' || attrs.href.length === 0 || !optionalString(attrs.title)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Link href must be non-empty and title must be a string when present.',
      [...path, 'attrs'],
    ));
    return undefined;
  }
  expectOperationalAttr(attrs, 'target', '_blank', path, context);
  expectOperationalAttr(attrs, 'rel', 'noopener noreferrer nofollow', path, context);
  expectNullOperationalAttr(attrs, 'class', path, context);
  return {
    kind: 'link',
    href: attrs.href,
    ...optionalField('title', attrs.title),
  };
}

function parseCodeText(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): string {
  if (value === undefined) return '';
  return readContent(value, path, context).map((child, index) => {
    const node = readNode(child, [...path, index], context);
    if (node === undefined) return '';
    if (node.type !== 'text' || typeof node.text !== 'string' || node.marks !== undefined) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        'Code block content must contain unmarked text nodes only.',
        [...path, index],
      ));
      return '';
    }
    return node.text;
  }).join('');
}

interface SafeNode extends XnlRichDocumentSerializableRecord {
  readonly type: string;
  readonly attrs?: XnlRichDocumentSerializableValue;
  readonly content?: XnlRichDocumentSerializableValue;
  readonly marks?: XnlRichDocumentSerializableValue;
  readonly text?: XnlRichDocumentSerializableValue;
}

function validateTiptapNodeShape(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  expectedType: string | undefined,
  context: ParseContext,
): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap node must be a plain record.',
      path,
    ));
    return;
  }
  if (typeof value.type !== 'string' || value.type.length === 0) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap node type must be a non-empty string.',
      [...path, 'type'],
    ));
    return;
  }

  const shape = TIPTAP_NODE_SHAPES[value.type];
  if (shape === undefined) {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_NODE',
      `Tiptap node type "${value.type}" is not registered.`,
      [...path, 'type'],
    ));
    return;
  }
  if (expectedType !== undefined && value.type !== expectedType) {
    return;
  }

  validateExactTiptapFields(value, shape, path, context);
  if (shape.contentRole !== undefined && value.content !== undefined) {
    validateTiptapContentShape(value.content, [...path, 'content'], shape.contentRole, context);
  }
  if (value.type === 'text' && value.marks !== undefined) {
    validateTiptapMarksShape(value.marks, [...path, 'marks'], context);
  }
}

function validateTiptapContentShape(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  role: TiptapContentRole,
  context: ParseContext,
): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap content must be a dense array.',
      path,
    ));
    return;
  }
  value.forEach((child, index) => {
    const childPath = [...path, index];
    if (!isRecord(child) || typeof child.type !== 'string') {
      validateTiptapNodeShape(child, childPath, undefined, context);
      return;
    }
    if (role === 'code-text') {
      validateTiptapNodeShape(child, childPath, 'text', context);
      if (isRecord(child)) {
        validateExactTiptapFields(
          child,
          { fields: ['type', 'text'], attrs: [] },
          childPath,
          context,
        );
      }
      return;
    }
    const expected = role === 'list-item'
      ? 'listItem'
      : role === 'table-row'
        ? 'tableRow'
        : undefined;
    if (expected !== undefined) {
      validateTiptapNodeShape(child, childPath, expected, context);
      return;
    }
    if (role === 'table-cell') {
      validateTiptapNodeShape(child, childPath, undefined, context);
      return;
    }
    validateTiptapNodeShape(child, childPath, role === 'text' ? 'text' : undefined, context);
  });
}

function validateTiptapMarksShape(
  value: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap marks must be a dense array.',
      path,
    ));
    return;
  }
  value.forEach((mark, index) => {
    const markPath = [...path, index];
    if (!isRecord(mark) || typeof mark.type !== 'string' || mark.type.length === 0) {
      context.diagnostics.push(diagnostic(
        'INVALID_TIPTAP_DOCUMENT',
        'Tiptap mark must be a record with a non-empty type.',
        markPath,
      ));
      return;
    }
    const shape = TIPTAP_MARK_SHAPES[mark.type];
    if (shape === undefined) {
      context.diagnostics.push(diagnostic(
        'UNSUPPORTED_TIPTAP_MARK',
        `Tiptap mark type "${mark.type}" is not registered.`,
        [...markPath, 'type'],
      ));
      return;
    }
    validateExactTiptapFields(mark, shape, markPath, context);
  });
}

function validateExactTiptapFields(
  value: XnlRichDocumentSerializableRecord,
  shape: TiptapNodeShape,
  path: Path,
  context: ParseContext,
): void {
  for (const key of Object.keys(value)) {
    if (!shape.fields.includes(key as TiptapNodeField)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        `Tiptap field "${key}" cannot be represented by this RichDocument kind.`,
        [...path, key],
      ));
    }
  }
  if (value.attrs === undefined || !shape.fields.includes('attrs')) return;
  if (!isRecord(value.attrs)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap attrs must be a plain record.',
      [...path, 'attrs'],
    ));
    return;
  }
  for (const key of Object.keys(value.attrs)) {
    if (!shape.attrs.includes(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        `Tiptap attribute "${key}" cannot be represented by this RichDocument kind.`,
        [...path, 'attrs', key],
      ));
    }
  }
}

function validateRegisteredSchema(
  document: XnlRichDocumentSerializableValue | JSONContent | undefined,
  path: Path,
): XnlRichDocumentTiptapDiagnostic[] {
  const schemaResult = createXnlRichDocumentTiptapSchema();
  if (schemaResult.status === 'rejected') return [...schemaResult.diagnostics];
  try {
    const node = schemaResult.schema.nodeFromJSON(document as JSONContent);
    node.check();
    return [];
  } catch {
    return [diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap document does not conform to the registered RichDocument schema.',
      path,
    )];
  }
}

function readNode(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): SafeNode | undefined {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap node or mark must be a plain record.',
      path,
    ));
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!['type', 'attrs', 'content', 'marks', 'text'].includes(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        `Tiptap field "${key}" cannot be represented by RichDocument.`,
        [...path, key],
      ));
    }
  }
  if (typeof value.type !== 'string' || value.type.length === 0) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap node or mark type must be a non-empty string.',
      [...path, 'type'],
    ));
    return undefined;
  }
  return value as SafeNode;
}

function readAttrs(
  value: XnlRichDocumentSerializableValue | undefined,
  allowedKeys: readonly string[],
  path: Path,
  context: ParseContext,
): XnlRichDocumentSerializableRecord {
  if (value === undefined) return Object.create(null) as XnlRichDocumentSerializableRecord;
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap attrs must be a plain record.',
      path,
    ));
    return Object.create(null) as XnlRichDocumentSerializableRecord;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_VALUE',
        `Tiptap attribute "${key}" cannot be represented by RichDocument.`,
        [...path, key],
      ));
    }
  }
  return value;
}

function readContent(
  value: XnlRichDocumentSerializableValue | undefined,
  path: Path,
  context: ParseContext,
): readonly XnlRichDocumentSerializableValue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_DOCUMENT',
      'Tiptap content and marks must be dense arrays.',
      path,
    ));
    return [];
  }
  return value;
}

function readNodeId(
  attrs: XnlRichDocumentSerializableRecord,
  path: Path,
  context: ParseContext,
) {
  if (typeof attrs.nodeId !== 'string' || attrs.nodeId.length === 0) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Persistent Tiptap nodes require a non-empty nodeId projected from Domain #id.',
      path,
    ));
    return undefined;
  }
  return attrs.nodeId as XnlRichDocument['nodeId'];
}

function positiveInteger(
  value: XnlRichDocumentSerializableValue | undefined,
  defaultValue: number,
  path: Path,
  context: ParseContext,
): number | undefined {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Table span must be a positive integer.',
      path,
    ));
    return undefined;
  }
  return value;
}

function expectOperationalAttr(
  attrs: XnlRichDocumentSerializableRecord,
  key: string,
  expected: XnlRichDocumentSerializableValue,
  path: Path,
  context: ParseContext,
): void {
  const value = attrs[key];
  if (value !== undefined && value !== null && value !== expected) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_VALUE',
      `Tiptap operational attribute "${key}" has unsupported semantic content.`,
      [...path, 'attrs', key],
    ));
  }
}

function expectNullOperationalAttr(
  attrs: XnlRichDocumentSerializableRecord,
  key: string,
  path: Path,
  context: ParseContext,
): void {
  expectOperationalAttr(attrs, key, null, path, context);
}

function optionalString(value: XnlRichDocumentSerializableValue | undefined): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function optionalField<TKey extends string, TValue>(key: TKey, value: TValue | null | undefined) {
  return value === undefined || value === null ? {} : { [key]: value } as Record<TKey, TValue>;
}

function compact<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function validateConfig(config: XnlRichDocumentTiptapConfig): XnlRichDocumentTiptapDiagnostic[] {
  const safeConfig = sanitize(config, ['config']);
  if (!safeConfig.ok) return [...safeConfig.diagnostics];
  if (!isRecord(safeConfig.value) || !hasExactKeys(safeConfig.value, ['schemaId', 'extensionIds'])) {
    return [diagnostic(
      'LOSSY_TIPTAP_VALUE',
      'Tiptap config must contain only schemaId and extensionIds.',
      ['config'],
    )];
  }
  const diagnostics: XnlRichDocumentTiptapDiagnostic[] = [];
  if (safeConfig.value.schemaId !== XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID) {
    diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_SCHEMA',
      `Tiptap schema "${String(safeConfig.value.schemaId)}" is not registered.`,
      ['config', 'schemaId'],
    ));
  }
  const extensions = safeConfig.value.extensionIds;
  if (!Array.isArray(extensions)) {
    diagnostics.push(diagnostic(
      'UNSUPPORTED_TIPTAP_EXTENSION',
      'Tiptap extensionIds must be a dense array.',
      ['config', 'extensionIds'],
    ));
    return diagnostics;
  }
  const seen = new Set<string>();
  extensions.forEach((extension, index) => {
    if (typeof extension !== 'string'
      || !XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.includes(extension as never)
      || seen.has(extension)) {
      diagnostics.push(diagnostic(
        'UNSUPPORTED_TIPTAP_EXTENSION',
        `Tiptap extension "${String(extension)}" is unknown or duplicated.`,
        ['config', 'extensionIds', index],
      ));
    } else {
      seen.add(extension);
    }
  });
  for (const required of XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS) {
    if (!seen.has(required)) {
      diagnostics.push(diagnostic(
        'UNSUPPORTED_TIPTAP_EXTENSION',
        `Required Tiptap extension "${required}" is not enabled.`,
        ['config', 'extensionIds'],
      ));
    }
  }
  return diagnostics;
}

function sanitize(value: unknown, path: Path): Sanitized | Unsafe {
  const diagnostics: XnlRichDocumentTiptapDiagnostic[] = [];
  const sanitized = sanitizeValue(value, path, diagnostics, new WeakSet<object>());
  return diagnostics.length > 0 || sanitized === undefined
    ? { ok: false, diagnostics: diagnostics.length > 0 ? diagnostics as [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]] : [diagnostic(
        'LOSSY_TIPTAP_VALUE',
        'Value cannot be represented as serializable Tiptap data.',
        path,
      )] }
    : { ok: true, value: sanitized };
}

function sanitizeValue(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentTiptapDiagnostic[],
  seen: WeakSet<object>,
): XnlRichDocumentSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Numbers must be finite and cannot be -0.', path));
    return undefined;
  }
  if (typeof value !== 'object') {
    diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Value is not serializable data.', path));
    return undefined;
  }
  if (seen.has(value)) {
    diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Cyclic data is not supported.', path));
    return undefined;
  }
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Array subclasses are not supported.', path));
        return undefined;
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key === 'symbol')) {
        diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Symbol array fields are not supported.', path));
        return undefined;
      }
      const result: XnlRichDocumentSerializableValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor === undefined || !('value' in descriptor)) {
          diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Arrays must be dense data arrays.', [...path, index]));
          continue;
        }
        const child = sanitizeValue(descriptor.value, [...path, index], diagnostics, seen);
        if (child !== undefined) result.push(child);
      }
      const allowed = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
      if (keys.some((key) => typeof key === 'string' && !allowed.has(key))) {
        diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Custom array fields are not supported.', path));
      }
      return result;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Runtime instances are not serializable Tiptap data.', path));
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null) as Record<string, XnlRichDocumentSerializableValue>;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') {
        diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Symbol record fields are not supported.', path));
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
        diagnostics.push(diagnostic(
          'LOSSY_TIPTAP_VALUE',
          'Only enumerable data properties with defined values are supported.',
          [...path, key],
        ));
        continue;
      }
      const child = sanitizeValue(descriptor.value, [...path, key], diagnostics, seen);
      if (child !== undefined) {
        Object.defineProperty(result, key, {
          value: child,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return result;
  } catch {
    diagnostics.push(diagnostic('LOSSY_TIPTAP_VALUE', 'Value could not be inspected safely.', path));
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function hasExactKeys(value: XnlRichDocumentSerializableRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isRecord(
  value: XnlRichDocumentSerializableValue | undefined,
): value is XnlRichDocumentSerializableRecord {
  return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function diagnostic(
  code: XnlRichDocumentTiptapDiagnostic['code'],
  message: string,
  path: Path,
): XnlRichDocumentTiptapDiagnostic {
  return { severity: 'error', code, message, path };
}

function rejected(
  diagnostics: readonly AdapterDiagnostic[],
): Extract<XnlRichDocumentTiptapProjectionResult, { status: 'rejected' }> {
  const nonEmpty = diagnostics.length > 0 ? diagnostics : [diagnostic(
    'INVALID_TIPTAP_DOCUMENT',
    'Tiptap adapter rejected the input.',
    [],
  )];
  return deepFreeze({
    status: 'rejected',
    diagnostics: nonEmpty as [AdapterDiagnostic, ...AdapterDiagnostic[]],
  });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
