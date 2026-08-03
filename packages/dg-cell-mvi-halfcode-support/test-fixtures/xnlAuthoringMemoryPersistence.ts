import type { DataElementNode, XnlNode } from 'xnl-core';
import { MemoryRevisionedVfsAuthority } from 'xnl-vfs/revisioned-persistence';
import { createXnlVfsAuthoringPersistencePort } from '../src/xnl-authoring';

export function createXnlAuthoringMemoryPersistenceFixture(initial: XnlNode) {
  if (!isDataElement(initial)) {
    throw new TypeError('Memory authoring persistence requires a DataElement root.');
  }
  const authority = new MemoryRevisionedVfsAuthority(initial, {
    authorityId: 'authority:t4-1-laws',
    clock: () => '2026-08-02T00:00:00.000Z',
    revisionFactory: (sequence) => `vfs:${sequence}`,
  });
  return Object.freeze({
    persistence: createXnlVfsAuthoringPersistencePort(authority),
    read: () => authority.read(),
    failNextFlush: (code: string, message: string) => {
      authority.failNextFlush({ code, message });
    },
  });
}

function isDataElement(value: XnlNode): value is DataElementNode {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'kind' in value
    && value.kind === 'DataElement';
}
