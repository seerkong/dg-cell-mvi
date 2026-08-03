import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  XNL_RICH_DOCUMENT_DIAGNOSTIC_CODES,
  XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES,
  XNL_RICH_DOCUMENT_IDENTITY_RULES,
  XNL_RICH_DOCUMENT_MARK_KINDS,
  XNL_RICH_DOCUMENT_NODE_KINDS,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentIdentityAllocationRequest,
  type XnlRichDocumentIdentityAllocationResult,
  type XnlRichDocumentNormalizedResult,
} from '../src';

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

const documentFixture = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE;

function files(root: string): readonly string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('XNL RichDocument public contract', () => {
  it('freezes every first-version node and mark family as renderer-neutral data', () => {
    expect(XNL_RICH_DOCUMENT_NODE_KINDS).toEqual([
      'document',
      'paragraph',
      'heading',
      'blockquote',
      'bullet-list',
      'ordered-list',
      'list-item',
      'image',
      'table',
      'table-row',
      'table-cell',
      'table-header',
      'code-block',
      'mermaid',
      'component-embed',
      'capsule-embed',
      'text',
    ]);
    expect(XNL_RICH_DOCUMENT_MARK_KINDS).toEqual([
      'bold',
      'italic',
      'strike',
      'code',
      'link',
    ]);
    expect(JSON.parse(JSON.stringify(documentFixture))).toEqual(documentFixture);
  });

  it('freezes fail-closed duplicate, missing identity, and unsupported diagnostics', () => {
    const diagnostics = [
      {
        severity: 'error',
        code: 'DUPLICATE_DOMAIN_NODE_ID',
        message: 'Persistent Domain #id is duplicated.',
        path: ['children', 1, 'nodeId'],
        nodeId: nodeId('paragraph:intro'),
        details: { firstPath: ['children', 0, 'nodeId'] },
      },
      {
        severity: 'error',
        code: 'MISSING_DOMAIN_NODE_ID',
        message: 'A persistent RichDocument node has no Domain #id.',
        path: ['children', 2],
      },
      {
        severity: 'error',
        code: 'UNSUPPORTED_CONSTRUCT',
        message: 'The source construct has no RichDocument representation.',
        path: ['children', 3],
        details: { sourceKind: 'xnl.unknown-widget' },
      },
    ] as const satisfies readonly XnlRichDocumentDiagnostic[];
    const result = {
      status: 'rejected',
      diagnostics,
    } satisfies XnlRichDocumentNormalizedResult;

    expect(XNL_RICH_DOCUMENT_DIAGNOSTIC_CODES).toEqual(expect.arrayContaining([
      'DUPLICATE_DOMAIN_NODE_ID',
      'MISSING_DOMAIN_NODE_ID',
      'UNSUPPORTED_CONSTRUCT',
    ]));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.status).toBe('rejected');
  });

  it('freezes serializable fresh allocation and collision outcomes', () => {
    const request = {
      kind: 'xnl-rich-document-identity-allocation-request',
      requestId: 'allocation:copy-payment',
      reason: 'copy',
      nodeKind: 'paragraph',
      sourceNodeId: nodeId('paragraph:payment'),
      reservedNodeIds: [nodeId('paragraph:payment'), nodeId('paragraph:intro')],
      provenance: { operation: 'paste' },
    } satisfies XnlRichDocumentIdentityAllocationRequest;
    const allocated = {
      status: 'allocated',
      requestId: request.requestId,
      nodeId: nodeId('paragraph:payment-copy'),
      freshness: 'fresh',
    } satisfies XnlRichDocumentIdentityAllocationResult;
    const collision = {
      status: 'rejected',
      requestId: request.requestId,
      freshness: 'collision',
      diagnostics: [{
        severity: 'error',
        code: 'IDENTITY_ALLOCATOR_COLLISION',
        message: 'Allocated Domain #id already exists.',
        nodeId: nodeId('paragraph:payment'),
        details: { requestId: request.requestId },
      }],
    } satisfies XnlRichDocumentIdentityAllocationResult;

    expect(JSON.parse(JSON.stringify({ request, allocated, collision }))).toEqual({
      request,
      allocated,
      collision,
    });
    expect(allocated.freshness).toBe('fresh');
    expect(collision.diagnostics[0]?.code).toBe('IDENTITY_ALLOCATOR_COLLISION');
  });

  it('keeps the contract source free of renderer, DOM, and concrete XNL implementations', () => {
    const root = resolve(__dirname, '../src/xnl-rich-document');
    const source = files(root)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
      .join('\n');

    expect(source).not.toMatch(/from ['"](?:@tiptap\/|prosemirror-|vue|xnl-core|xnl-vfs)/);
    expect(source).not.toMatch(
      /\b(?:HTMLElement|NodeView|EditorState|Transaction)\b|(?<![\w.-])(?:document|window)\./,
    );
  });

  it('states that persistent identity aligns moves and replacement is delete plus add', () => {
    expect(XNL_RICH_DOCUMENT_IDENTITY_RULES).toEqual({
      persistentIdentity: 'domain-#id',
      alignment: 'tree-alignment-and-move',
      ordinaryPayloadUpdate: false,
      replacement: 'delete-and-add',
      occurrenceIdentity: 'derived-after-persistent-identity',
      adapterPosition: 'local-only',
    });
  });

  it('keeps generic embed input free of host and structural ownership fields', () => {
    expect(XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES).toEqual(expect.arrayContaining([
      'runtime',
      'writer',
      'session',
      'submit',
      'identityAllocator',
      'component',
      'capsule',
    ]));
  });
});
