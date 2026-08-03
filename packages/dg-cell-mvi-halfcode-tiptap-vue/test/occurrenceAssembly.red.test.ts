import { describe, expect, it, vi } from 'vitest';
import {
  formatDocumentInstanceRef,
  type XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import { deriveXnlRichDocumentOccurrenceXId } from 'dg-cell-mvi-halfcode-logic';
import {
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
} from '../src';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

function nodeId(value: string): XnlRichDocumentDomainNodeId {
  return value as XnlRichDocumentDomainNodeId;
}

function assemble(
  id: string,
  role: string,
  roleCardinality: 'single' | 'multiple',
  metadata?: Record<string, unknown>,
) {
  return assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, {
    nodeId: nodeId(id),
    unitInstanceId: 'document-1',
    role,
    roleCardinality,
    descriptor: {
      scopeId: 'document-root',
      unitFqn: 'dg.docs.SystemDesign' as never,
      ...(metadata === undefined ? {} : { metadata: metadata as never }),
    },
  }, EMPTY);
}

describe('T3.3 canonical NodeView occurrence assembly', () => {
  it('assembles single and multi-role refs from the logic-owned canonical x-id', () => {
    const single = assemble('component.counter-card', 'main', 'single');
    const multiMain = assemble('component.counter-card', 'main', 'multiple');
    const multiSummary = assemble('component.counter-card', 'summary', 'multiple');
    expect(single.status).toBe('assembled');
    expect(multiMain.status).toBe('assembled');
    expect(multiSummary.status).toBe('assembled');
    if (
      single.status !== 'assembled'
      || multiMain.status !== 'assembled'
      || multiSummary.status !== 'assembled'
    ) return;

    const canonicalMulti = deriveXnlRichDocumentOccurrenceXId(EMPTY, {
      nodeId: nodeId('component.counter-card'),
      role: 'main',
      roleCardinality: 'multiple',
    }, EMPTY);
    expect(canonicalMulti.status).toBe('derived');
    if (canonicalMulti.status !== 'derived') return;
    expect(single.occurrence.instanceRef.xId).toBe('component.counter-card');
    expect(multiMain.occurrence.instanceRef.xId).toBe(canonicalMulti.xId);
    expect(multiMain.occurrence.instanceRef.xId).toMatch(/^[A-Za-z0-9._~-]+$/);
    expect(multiMain.occurrence.instanceRef.xId).not.toBe(single.occurrence.instanceRef.xId);
    expect(multiMain.occurrence.instanceRef.xId).not.toBe(multiSummary.occurrence.instanceRef.xId);
    expect(() => formatDocumentInstanceRef(multiMain.occurrence.instanceRef)).not.toThrow();
    expect(multiMain.occurrence.descriptor).toMatchObject({
      projectionRole: 'main',
      xId: multiMain.occurrence.instanceRef.xId,
      documentNodeId: 'component.counter-card',
      scopeId: 'document-root',
    });
    expect(Object.isFrozen(multiMain.occurrence)).toBe(true);
    expect(Object.isFrozen(multiMain.occurrence.instanceRef)).toBe(true);
    expect(Object.isFrozen(multiMain.occurrence.descriptor)).toBe(true);

    const reservedSingle = assemble(multiMain.occurrence.instanceRef.xId, 'main', 'single');
    expect(reservedSingle.status).toBe('assembled');
    if (reservedSingle.status === 'assembled') {
      expect(reservedSingle.occurrence.instanceRef.xId).toMatch(/^xrd-s-/);
      expect(reservedSingle.occurrence.instanceRef.xId)
        .not.toBe(multiMain.occurrence.instanceRef.xId);
    }

    const encodedSingle = assemble('component:counter-card', 'main', 'single');
    expect(encodedSingle.status).toBe('assembled');
    if (encodedSingle.status === 'assembled') {
      expect(encodedSingle.occurrence.instanceRef.xId).toMatch(/^xrd-s-/);
      expect(() => formatDocumentInstanceRef(encodedSingle.occurrence.instanceRef)).not.toThrow();
    }
  });

  it('keeps the canonical identity and address stable when only projection path facts move', () => {
    const before = assemble('component.counter-card', 'main', 'multiple', { path: [0, 1] });
    const after = assemble('component.counter-card', 'main', 'multiple', { path: [4, 2] });
    expect(before.status).toBe('assembled');
    expect(after.status).toBe('assembled');
    if (before.status !== 'assembled' || after.status !== 'assembled') return;
    expect(after.occurrence.nodeId).toBe(before.occurrence.nodeId);
    expect(after.occurrence.instanceRef).toEqual(before.occurrence.instanceRef);
    expect(after.occurrence.descriptor.metadata).not.toEqual(before.occurrence.descriptor.metadata);
  });

  it('fails closed for missing, candidate, malformed and authority-bearing identity input', () => {
    const invalid = [
      { nodeId: '', unitInstanceId: 'document-1', role: 'main', roleCardinality: 'single', descriptor: { scopeId: 'root' } },
      { nodeId: 'node', unitInstanceId: 'document/1', role: 'main', roleCardinality: 'single', descriptor: { scopeId: 'root' } },
      { nodeId: 'node', unitInstanceId: 'document-1', role: 'Main', roleCardinality: 'single', descriptor: { scopeId: 'root' } },
      { nodeId: 'node', unitInstanceId: 'document-1', role: 'main', roleCardinality: 'candidate', descriptor: { scopeId: 'root' } },
      { nodeId: 'node', candidateId: 'candidate', unitInstanceId: 'document-1', role: 'main', roleCardinality: 'single', descriptor: { scopeId: 'root' } },
      { nodeId: 'node', unitInstanceId: 'document-1', role: 'main', roleCardinality: 'single', descriptor: { scopeId: 'root' }, identityAllocator: {} },
    ];
    for (const input of invalid) {
      const result = assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, input as never, EMPTY);
      expect(result).toMatchObject({
        status: 'rejected',
        diagnostics: [{ code: 'INVALID_HALFCODE_NODEVIEW_OCCURRENCE' }],
      });
    }
  });

  it('rejects accessors, revoked proxies and cycles without executing application code', () => {
    const getter = vi.fn(() => 'node');
    const accessor = {
      unitInstanceId: 'document-1',
      role: 'main',
      roleCardinality: 'single',
      descriptor: { scopeId: 'root' },
    } as Record<string, unknown>;
    Object.defineProperty(accessor, 'nodeId', { enumerable: true, get: getter });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const cyclicMetadata: Record<string, unknown> = {};
    cyclicMetadata.self = cyclicMetadata;
    const cyclic = {
      nodeId: 'node',
      unitInstanceId: 'document-1',
      role: 'main',
      roleCardinality: 'single',
      descriptor: { scopeId: 'root', metadata: cyclicMetadata },
    };

    for (const input of [accessor, revoked.proxy, cyclic]) {
      expect(() => assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, input as never, EMPTY))
        .not.toThrow();
      expect(assembleXnlRichDocumentHalfcodeNodeViewOccurrence(EMPTY, input as never, EMPTY).status)
        .toBe('rejected');
    }
    expect(getter).not.toHaveBeenCalled();
  });
});
