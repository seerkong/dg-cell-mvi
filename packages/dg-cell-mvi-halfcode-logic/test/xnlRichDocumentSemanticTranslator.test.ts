import { describe, expect, it } from 'vitest';
import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
  type XnlProjectionInteraction,
  type XnlProjectionPlanNode,
  type XnlRichDocumentDomainNodeId,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlProjectionCompilerRuntime,
  createXnlRichDocumentSemanticDialect,
  translateXnlProjectionInteraction,
  translateXnlRichDocumentEditInteraction,
  type XnlRichDocumentEditTranslationConfig,
  type XnlRichDocumentEditTranslationRuntime,
} from '../src';

const EMPTY = Object.freeze({});
const DOCUMENT_ID = 'document.translator' as XnlRichDocumentDomainNodeId;
const PARAGRAPH_ID = 'paragraph.translator' as XnlRichDocumentDomainNodeId;

const PLAN_NODE: XnlProjectionPlanNode = {
  kind: 'xnl-projection-plan-node',
  id: 'plan:rich-document-translator',
  domain: { path: [], nodeId: DOCUMENT_ID, tag: 'Document', role: 'document' },
  classification: { id: 'xnl-rich-document.document' },
  presenter: { id: 'xnl-rich-document' },
  children: [],
};

function interaction(): XnlProjectionInteraction {
  return {
    id: 'interaction:translator',
    type: XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
    target: { planNodeId: PLAN_NODE.id },
    payload: {
      version: XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
      edits: [{
        kind: 'text',
        nodeId: PARAGRAPH_ID,
        before: 'before',
        after: 'after',
        beforeInlineRuns: [{ text: 'before', marks: [] }],
        afterInlineRuns: [{ text: 'after', marks: [] }],
      }],
    },
  };
}

describe('canonical RichDocument semantic translator', () => {
  it('hands the canonical dialect through the generic projection compiler runtime', () => {
    const runtime = createXnlProjectionCompilerRuntime({
      dialects: [createXnlRichDocumentSemanticDialect()],
    });

    const result = translateXnlProjectionInteraction(runtime, {
      planNode: PLAN_NODE,
      interaction: interaction(),
    });

    expect(result).toMatchObject({
      status: 'translated',
      command: {
        type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
        target: PLAN_NODE.domain,
      },
    });
  });

  it('returns unsupported for another interaction vocabulary', () => {
    const result = translateXnlRichDocumentEditInteraction(EMPTY, {
      planNode: PLAN_NODE,
      interaction: { ...interaction(), type: 'xnl.rich-document.unknown' },
    }, EMPTY);

    expect(result.status).toBe('unsupported');
    expect(result).not.toHaveProperty('command');
    if (result.status !== 'translated') expect(result.diagnostics[0]?.code).toBe('UNSUPPORTED_RICH_DOCUMENT_INTERACTION');
  });

  it('rejects unresolved domain facts and lossy inline payloads without a command', () => {
    const unresolved = translateXnlRichDocumentEditInteraction(EMPTY, {
      planNode: PLAN_NODE,
      interaction: {
        ...interaction(),
        target: { planNodeId: PLAN_NODE.id, domain: { path: [], nodeId: 'document.other' } },
      },
    }, EMPTY);
    const lossy = translateXnlRichDocumentEditInteraction(EMPTY, {
      planNode: PLAN_NODE,
      interaction: {
        ...interaction(),
        payload: {
          version: 1,
          edits: [{ kind: 'text', nodeId: PARAGRAPH_ID, before: 'before', after: 'after' }],
        },
      },
    }, EMPTY);

    expect(unresolved.status).toBe('rejected');
    expect(lossy.status).toBe('rejected');
    expect(unresolved).not.toHaveProperty('command');
    expect(lossy).not.toHaveProperty('command');
  });

  it('does not inspect authority-shaped runtime/config or invoke input accessors', () => {
    let authorityReads = 0;
    const authority = {} as Record<string, unknown>;
    Object.defineProperty(authority, 'writer', {
      enumerable: true,
      get() {
        authorityReads += 1;
        throw new Error('authority accessed');
      },
    });
    const accessorInteraction = interaction() as XnlProjectionInteraction;
    Object.defineProperty(accessorInteraction, 'payload', {
      enumerable: true,
      get() {
        authorityReads += 1;
        throw new Error('payload getter invoked');
      },
    });

    const result = translateXnlRichDocumentEditInteraction(
      authority as XnlRichDocumentEditTranslationRuntime,
      { planNode: PLAN_NODE, interaction: accessorInteraction },
      authority as XnlRichDocumentEditTranslationConfig,
    );

    expect(result.status).toBe('rejected');
    expect(result).not.toHaveProperty('command');
    expect(authorityReads).toBe(0);
  });

  it('returns a deeply frozen command snapshot without caller aliases', () => {
    const proposal = interaction();
    const result = translateXnlRichDocumentEditInteraction(EMPTY, {
      planNode: PLAN_NODE,
      interaction: proposal,
    }, EMPTY);

    expect(result.status).toBe('translated');
    if (result.status !== 'translated') return;
    expect(result.command.payload).not.toBe(proposal.payload);
    expectDeepFrozen(result);
  });
});

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ('value' in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}
