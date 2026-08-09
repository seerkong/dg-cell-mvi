import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
  XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS,
  isXnlRichDocumentSemanticEditKind,
  type XnlRichDocumentCandidateMaterializationResult,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentEditCommand,
  type XnlRichDocumentEditInteractionPayload,
  type XnlRichDocumentSemanticNode,
} from '../src';

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function files(root: string): readonly string[] {
  return readdirSync(root).flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('XNL RichDocument canonical semantic contract', () => {
  it('freezes the versioned interaction, command, and closed edit vocabulary', () => {
    expect(XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION).toBe(1);
    expect(XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE).toBe('xnl.rich-document.edit');
    expect(XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE).toBe('xnl.rich-document.apply-interaction');
    expect(XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS).toEqual([
      'insert',
      'delete',
      'move',
      'text',
      'mark',
      'inline',
      'node-attributes',
      'table',
      'code',
      'mermaid-source',
    ]);
    expect(Object.isFrozen(XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS)).toBe(true);
    expect(XNL_RICH_DOCUMENT_SEMANTIC_EDIT_KINDS.every(
      isXnlRichDocumentSemanticEditKind,
    )).toBe(true);
    expect(isXnlRichDocumentSemanticEditKind('replace')).toBe(false);
  });

  it('round-trips exact inline snapshots, local copy provenance, and the command as JSON', () => {
    const sourceNodeId = nodeId('paragraph:accepted');
    const payload = {
      version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
      edits: [{
        kind: 'insert',
        localNodeId: 'local:copy-root',
        parent: { kind: 'stable', nodeId: nodeId('document:accepted') },
        index: 1,
        node: {
          kind: 'paragraph',
          localNodeId: 'local:copy-root',
          sourceNodeId,
          content: [{
            kind: 'text',
            text: 'Copied',
            marks: [{ kind: 'link', href: '/accepted' }],
          }],
        },
      }, {
        kind: 'text',
        nodeId: nodeId('paragraph:accepted'),
        before: 'Copy',
        after: 'Copied',
        beforeInlineRuns: [{ text: 'Copy', marks: [{ kind: 'bold' }] }],
        afterInlineRuns: [{ text: 'Copied', marks: [{ kind: 'bold' }] }],
      }],
    } as const satisfies XnlRichDocumentEditInteractionPayload;
    const command = {
      type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
      target: {
        path: [],
        nodeId: nodeId('document:accepted'),
        role: 'document',
      },
      payload,
      provenance: {
        interactionType: XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
        interactionId: 'interaction:1',
      },
    } as const satisfies XnlRichDocumentEditCommand;

    expect(JSON.parse(JSON.stringify(command))).toEqual(command);
  });

  it('preserves the existing candidate materialization result shape as contract-owned data', () => {
    const result = {
      status: 'materialized',
      candidate: {
        kind: 'document',
        nodeId: nodeId('document:accepted'),
        children: [],
      },
      copyOrigins: [{
        candidateNodeId: nodeId('candidate:copy-root'),
        sourceNodeId: nodeId('paragraph:accepted'),
      }],
    } as const satisfies XnlRichDocumentCandidateMaterializationResult;

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('declares the materialization result and processor once across all packages', () => {
    const packagesRoot = resolve(__dirname, '../..');
    const declarations = files(packagesRoot)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return [
          ...source.matchAll(/^(?:export\s+)?(?:type|interface)\s+(XnlRichDocumentCandidateMaterializationResult|XnlRichDocumentCandidateMaterializer)\b/gm),
        ].map((match) => `${relative(packagesRoot, file)}:${match[1]}`);
      });

    expect(declarations).toEqual([
      'dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentCandidateMaterializationResult',
      'dg-cell-mvi-halfcode-contract/src/xnl-rich-document/semantic.ts:XnlRichDocumentCandidateMaterializer',
    ]);
  });

  it('uses the canonical RichDocument domain vocabulary instead of adapter node spelling', () => {
    const node = {
      kind: 'table-cell',
      nodeId: nodeId('table-cell:accepted'),
      colspan: 2,
      rowspan: 1,
      children: [{
        kind: 'paragraph',
        localNodeId: 'local:paragraph',
        content: [{ kind: 'text', text: 'Canonical' }],
      }],
    } as const satisfies XnlRichDocumentSemanticNode;
    const semanticSource = readFileSync(
      resolve(__dirname, '../src/xnl-rich-document/semantic.ts'),
      'utf8',
    );

    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
    expect(semanticSource).not.toMatch(/\btype:\s*string\b|\battrs\??:/);
  });

  it('keeps the public contract renderer-neutral and authority-free', () => {
    const root = resolve(__dirname, '../src/xnl-rich-document');
    const source = files(root)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
      .join('\n');
    const semanticSource = readFileSync(join(root, 'semantic.ts'), 'utf8');

    expect(source).not.toMatch(/from ['"](?:@tiptap\/|prosemirror-|vue|xnl-core|xnl-vfs)/i);
    expect(semanticSource).not.toMatch(/\b(?:Tiptap|ProseMirror|Vue|DOM|HTML|xnl-core|VFS|VCS|session|writer|submit)\b/i);
  });
});
