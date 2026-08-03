import { describe, expect, it, vi } from 'vitest';
import type {
  XnlProjectionInteraction,
  XnlProjectionPlanNode,
} from 'dg-cell-mvi-halfcode-contract';
import { translateXnlRichDocumentEditInteraction } from 'dg-cell-mvi-halfcode-logic';
import { bindXnlRichDocumentEditTranslator } from 'dg-cell-mvi-halfcode-support';

const PLAN_NODE: XnlProjectionPlanNode = Object.freeze({
  kind: 'xnl-projection-plan-node',
  id: 'xnlp:node:binding',
  domain: Object.freeze({ path: Object.freeze([]), nodeId: 'document.binding' }),
  classification: Object.freeze({ id: 'xnl.rich-document:document' }),
  presenter: Object.freeze({ id: 'xnl.rich-document.presenter:document' }),
  children: Object.freeze([]),
});

const INTERACTION: XnlProjectionInteraction = Object.freeze({
  type: 'xnl.rich-document.edit',
  target: Object.freeze({ planNodeId: PLAN_NODE.id }),
  payload: Object.freeze({
    version: 1,
    edits: Object.freeze([Object.freeze({
      kind: 'text',
      nodeId: 'paragraph.alpha',
      before: 'Alpha',
      after: 'Alpha!',
      beforeInlineRuns: Object.freeze([Object.freeze({ text: 'Alpha', marks: Object.freeze([]) })]),
      afterInlineRuns: Object.freeze([Object.freeze({ text: 'Alpha!', marks: Object.freeze([]) })]),
    })]),
  }),
});

describe('RichDocument canonical translator binding authority surface', () => {
  it('forwards only plan data and an empty runtime/config to the production translator', async () => {
    const translator = vi.fn(translateXnlRichDocumentEditInteraction);
    const bound = bindXnlRichDocumentEditTranslator(
      { translateInteraction: translator },
      { planNode: PLAN_NODE },
      {},
    );
    const hostAuthority = Object.freeze({
      proposal: Object.freeze({ state: () => undefined, submit: () => undefined }),
      identityAllocator: () => undefined,
      writer: Object.freeze({}),
      revision: Object.freeze({}),
      vfs: Object.freeze({}),
    });

    const result = await bound(hostAuthority, { interaction: INTERACTION }, {});

    expect(result.status).toBe('translated');
    expect(translator).toHaveBeenCalledTimes(1);
    const [runtime, input, config] = translator.mock.calls[0]!;
    expect(runtime).toEqual({});
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(input).toEqual({ planNode: PLAN_NODE, interaction: INTERACTION });
    expect(Reflect.ownKeys(input)).toEqual(['planNode', 'interaction']);
    expect(Object.isFrozen(input.planNode)).toBe(true);
    expect(Object.isFrozen(input.planNode.domain)).toBe(true);
    expect(config).toEqual({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(JSON.stringify([runtime, input, config])).not.toMatch(
      /writer|revision|session|submit|allocator|vfs|vcs|persistence/i,
    );
    expect(Reflect.ownKeys(bound)).toEqual(['length', 'name']);
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it('snapshots the plan at bind time instead of retaining caller aliases', async () => {
    const mutablePlan = structuredClone(PLAN_NODE) as XnlProjectionPlanNode;
    const bound = bindXnlRichDocumentEditTranslator(
      { translateInteraction: translateXnlRichDocumentEditInteraction },
      { planNode: mutablePlan },
      {},
    );
    const originalDomain = structuredClone(mutablePlan.domain);

    (mutablePlan.domain as { nodeId: string }).nodeId = 'document.mutated';
    mutablePlan.id = 'xnlp:node:mutated';
    const result = await bound({}, { interaction: INTERACTION }, {});

    expect(result).toMatchObject({
      status: 'translated',
      command: { target: originalDomain },
    });
  });

  it('rejects accessor-backed bindings without executing getters', () => {
    let runtimeGetterCalls = 0;
    let inputGetterCalls = 0;
    const runtime = Object.defineProperty({}, 'translateInteraction', {
      enumerable: true,
      get() {
        runtimeGetterCalls += 1;
        return translateXnlRichDocumentEditInteraction;
      },
    });
    const input = Object.defineProperty({}, 'planNode', {
      enumerable: true,
      get() {
        inputGetterCalls += 1;
        return PLAN_NODE;
      },
    });

    expect(() => bindXnlRichDocumentEditTranslator(
      runtime as never,
      { planNode: PLAN_NODE },
      {},
    )).toThrow(TypeError);
    expect(() => bindXnlRichDocumentEditTranslator(
      { translateInteraction: translateXnlRichDocumentEditInteraction },
      input as never,
      {},
    )).toThrow(TypeError);
    expect(runtimeGetterCalls).toBe(0);
    expect(inputGetterCalls).toBe(0);
  });

  it.each([
    ['runtime extra field', { translateInteraction: translateXnlRichDocumentEditInteraction, writer: {} }, { planNode: PLAN_NODE }],
    ['runtime symbol field', { translateInteraction: translateXnlRichDocumentEditInteraction, [Symbol('writer')]: {} }, { planNode: PLAN_NODE }],
    ['runtime custom prototype', Object.assign(Object.create({ inherited: true }), { translateInteraction: translateXnlRichDocumentEditInteraction }), { planNode: PLAN_NODE }],
    ['input extra field', { translateInteraction: translateXnlRichDocumentEditInteraction }, { planNode: PLAN_NODE, revision: 'live:1' }],
    ['input symbol field', { translateInteraction: translateXnlRichDocumentEditInteraction }, { planNode: PLAN_NODE, [Symbol('revision')]: 'live:1' }],
    ['input custom prototype', { translateInteraction: translateXnlRichDocumentEditInteraction }, Object.assign(Object.create({ inherited: true }), { planNode: PLAN_NODE })],
  ] as const)('rejects non-exact plain binding shapes: %s', (_caseName, runtime, input) => {
    expect(() => bindXnlRichDocumentEditTranslator(
      runtime as never,
      input as never,
      {},
    )).toThrow(TypeError);
  });

  it('rejects an accessor inside planNode without executing it', () => {
    let getterCalls = 0;
    const planNode = {
      ...structuredClone(PLAN_NODE),
      domain: Object.defineProperty({}, 'path', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return [];
        },
      }),
    };

    expect(() => bindXnlRichDocumentEditTranslator(
      { translateInteraction: translateXnlRichDocumentEditInteraction },
      { planNode: planNode as never },
      {},
    )).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });
});
