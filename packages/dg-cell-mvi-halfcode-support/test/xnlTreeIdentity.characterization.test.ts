import { describe, expect, it } from 'vitest';
import {
  applyMutations,
  diffNodes,
  parsePath,
  parseXnl,
  type XnlMutation,
} from 'xnl-core';

function parseRoot(source: string) {
  return parseXnl(source).nodes[0];
}

function targetsOrdinaryIdPayload(mutation: XnlMutation): boolean {
  if (mutation.type !== 'TREE_UPDATE' && mutation.type !== 'OBJECT_UPDATE') return false;
  const path = Array.isArray(mutation.path) ? mutation.path : parsePath(mutation.path);
  const last = path.at(-1);
  return last?.type === 'InstanceProperty' && last.value === 'id';
}

describe('xnl-core tree identity characterization', () => {
  it('aligns a moved node by #id while treating changed x-id as ordinary payload', () => {
    const before = parseRoot(`<Document #document [
      <Section #left [
        <Panel #moving { "x-id" = "runtime-before" tone = "neutral" }>
      ]>
      <Section #right>
    ]>`);
    const after = parseRoot(`<Document #document [
      <Section #left>
      <Section #right [
        <Panel #moving { "x-id" = "runtime-after" tone = "neutral" }>
      ]>
    ]>`);

    const mutations = diffNodes(before, after);
    const move = mutations.find((mutation) => mutation.type === 'TREE_MOVE_CROSS_LEVEL');

    expect(move).toMatchObject({
      targetUniqueName: 'moving',
      parentUniqueNameBefore: 'left',
      parentUniqueNameAfter: 'right',
    });
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'OBJECT_UPDATE',
        path: "#moving:attributes::'x-id'",
        valueAfter: 'runtime-after',
      }),
    ]));
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(mutations.some((mutation) =>
      mutation.targetUniqueName === 'runtime-before'
      || mutation.targetUniqueName === 'runtime-after',
    )).toBe(false);
    expect(applyMutations(structuredClone(before), mutations)).toEqual(after);
  });

  it('represents replacing #id at the same tree position as delete plus add', () => {
    const before = parseRoot(`<Document #document [
      <Section #identity-before { tone = "neutral" }>
    ]>`);
    const after = parseRoot(`<Document #document [
      <Section #identity-after { tone = "neutral" }>
    ]>`);

    const mutations = diffNodes(before, after);

    expect(mutations.map((mutation) => mutation.type)).toEqual([
      'TREE_DELETE',
      'TREE_ADD',
    ]);
    expect(mutations).toEqual([
      expect.objectContaining({
        type: 'TREE_DELETE',
        targetUniqueName: 'identity-before',
        parentUniqueNameBefore: 'document',
      }),
      expect.objectContaining({
        type: 'TREE_ADD',
        targetUniqueName: 'identity-after',
        parentUniqueNameAfter: 'document',
      }),
    ]);
    expect(mutations.some(targetsOrdinaryIdPayload)).toBe(false);
    expect(applyMutations(structuredClone(before), mutations)).toEqual(after);
  });
});
