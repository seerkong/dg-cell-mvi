import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contractRoot from 'dg-cell-mvi-halfcode-contract';
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  XNL_RICH_DOCUMENT_MARK_KINDS,
  XNL_RICH_DOCUMENT_NODE_KINDS,
  type XnlRichDocumentMarkKind,
  type XnlRichDocumentNode,
  type XnlRichDocumentNodeKind,
} from '../src';

const PACKAGE_ROOT = resolve(__dirname, '..');

function visit(
  node: XnlRichDocumentNode,
  nodeKinds: Set<XnlRichDocumentNodeKind>,
  markKinds: Set<XnlRichDocumentMarkKind>,
): void {
  nodeKinds.add(node.kind);
  if (node.kind === 'text') {
    for (const mark of node.marks ?? []) markKinds.add(mark.kind);
    return;
  }
  if (node.kind === 'paragraph' || node.kind === 'heading') {
    for (const child of node.content) visit(child, nodeKinds, markKinds);
    return;
  }
  if ('children' in node) {
    for (const child of node.children) visit(child, nodeKinds, markKinds);
  }
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

describe('XNL RichDocument canonical test fixture public subpath', () => {
  it('covers every supported node and mark family with unique persistent identities', () => {
    const nodeKinds = new Set<XnlRichDocumentNodeKind>();
    const markKinds = new Set<XnlRichDocumentMarkKind>();
    const nodeIds: string[] = [];
    visit(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE, nodeKinds, markKinds);

    const collectIds = (node: XnlRichDocumentNode): void => {
      if (node.kind !== 'text') nodeIds.push(node.nodeId);
      if (node.kind === 'paragraph' || node.kind === 'heading') {
        node.content.forEach(collectIds);
      } else if (node.kind !== 'text' && 'children' in node) {
        node.children.forEach(collectIds);
      }
    };
    collectIds(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);

    expect([...nodeKinds].sort()).toEqual([...XNL_RICH_DOCUMENT_NODE_KINDS].sort());
    expect([...markKinds].sort()).toEqual([...XNL_RICH_DOCUMENT_MARK_KINDS].sort());
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(nodeIds.every((id) => /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/.test(id))).toBe(true);
    expect(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'blockquote' }),
      expect.objectContaining({ kind: 'bullet-list' }),
      expect.objectContaining({ kind: 'ordered-list' }),
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'component-embed' }),
      expect.objectContaining({ kind: 'capsule-embed' }),
    ]));
  });

  it('is deeply frozen, serializable, and absent from the production root', () => {
    expectDeepFrozen(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect(JSON.parse(JSON.stringify(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE)))
      .toEqual(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE);
    expect('XNL_RICH_DOCUMENT_CANONICAL_FIXTURE' in contractRoot).toBe(false);
    expect(readFileSync(resolve(PACKAGE_ROOT, 'src/index.ts'), 'utf8'))
      .not.toContain('test-fixtures/xnl-rich-document');
  });

  it.each(['mjs', 'cjs'] as const)('loads the fixture through the public %s import smoke', (mode) => {
    const output = execFileSync('bun', [
      resolve(PACKAGE_ROOT, `../dg-cell-mvi-halfcode-support/test/fixtures/xnl-rich-document-import-smoke.${mode}`),
    ], { encoding: 'utf8' });
    expect(output.trim()).toBe('document.canonical');
  });
});
