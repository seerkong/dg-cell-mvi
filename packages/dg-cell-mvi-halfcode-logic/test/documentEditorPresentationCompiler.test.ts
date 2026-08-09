import { describe, expect, it } from 'vitest';
import {
  compileDocumentEditorPresentation,
  createDefaultDocumentEditorPresentationCompilerRuntime,
  DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
  DEFAULT_DOCUMENT_EDITOR_TOOLS,
  type DocumentEditorPresentationCompilerRuntime,
} from '../src';

const runtime = (): DocumentEditorPresentationCompilerRuntime => ({
  tools: new Map([
    ['history.undo', {
      id: 'history.undo',
      commandId: 'document.command.history.undo',
      label: 'Undo',
      icon: 'undo-2',
      defaultPresenterId: 'toolbar.icon-button',
      defaultVisibleWhen: { id: 'document.editable' },
    }],
    ['table.row.add-after', {
      id: 'table.row.add-after',
      commandId: 'document.command.table.row.add-after',
      label: 'Add row',
      defaultPresenterId: 'toolbar.icon-button',
      defaultVisibleWhen: { id: 'document.table-active' },
      requiredGrant: 'document.table.write',
    }],
  ]),
  presenters: new Map([
    ['toolbar.icon-button', { id: 'toolbar.icon-button', kind: 'button' }],
    ['toolbar.compact-button', { id: 'toolbar.compact-button', kind: 'button' }],
  ]),
  conditions: new Map([
    ['document.editable', {
      runtime: Object.freeze({}),
      processor: (_runtime, input) => input.context.editable,
    }],
    ['document.table-active', {
      runtime: Object.freeze({}),
      processor: (_runtime, input) => input.context.activeNodeKinds.includes('table'),
    }],
  ]),
});

const presentation = {
  kind: 'document-editor-presentation' as const,
  id: 'document.standard',
  groups: [
    {
      id: 'history',
      label: 'History',
      priority: 0,
      tools: [{ id: 'history.undo', presenter: { id: 'toolbar.compact-button' } }],
    },
    {
      id: 'table',
      label: 'Table',
      priority: 20,
      tools: [{ id: 'table.row.add-after' }],
    },
  ],
};

const input = (activeNodeKinds: readonly string[] = ['paragraph']) => ({
  presentation,
  capabilities: {
    tools: ['history.undo', 'table.row.add-after'],
    presenters: ['toolbar.icon-button', 'toolbar.compact-button'],
    conditions: ['document.editable', 'document.table-active'],
    grants: [] as string[],
  },
  editorContext: {
    editable: true,
    selection: 'caret' as const,
    activeNodeKinds,
    activeMarks: [],
  },
});

describe('compileDocumentEditorPresentation', () => {
  it('ships one unique canonical definition for every default presentation tool', () => {
    const ids = DEFAULT_DOCUMENT_EDITOR_TOOLS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const defaultRuntime = createDefaultDocumentEditorPresentationCompilerRuntime();
    const result = compileDocumentEditorPresentation(defaultRuntime, {
      presentation: DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
      capabilities: {
        tools: ids,
        presenters: ['toolbar.icon-button', 'toolbar.menu-item', 'toolbar.select', 'toolbar.color'],
        conditions: [
          'editor.editable', 'editor.table-active', 'editor.code-active',
          'editor.link-active', 'editor.selection-active',
        ],
        grants: ['editor.table.write'],
      },
      editorContext: {
        editable: true,
        selection: 'caret',
        activeNodeKinds: ['paragraph'],
        activeMarks: [],
      },
    }, { unknownToolPolicy: 'reject' });

    expect(result).toMatchObject({ status: 'compiled', plan: { diagnostics: [] } });
  });

  it('compiles immutable serializable groups through code-owned registries', () => {
    const result = compileDocumentEditorPresentation(
      runtime(),
      input(),
      { unknownToolPolicy: 'diagnostic' },
    );

    expect(result).toMatchObject({
      status: 'compiled',
      plan: {
        id: 'document.standard',
        groups: [
          {
            id: 'history',
            priority: 0,
            tools: [{
              id: 'history.undo',
              commandId: 'document.command.history.undo',
              presenter: { id: 'toolbar.compact-button' },
              visible: true,
              enabled: true,
            }],
          },
          {
            id: 'table',
            priority: 20,
            tools: [{ visible: false, enabled: false }],
          },
        ],
        diagnostics: [expect.objectContaining({ code: 'MISSING_TOOL_GRANT' })],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== 'compiled') return;
    expect(Object.isFrozen(result.plan.groups)).toBe(true);
    expect(() => JSON.stringify(result.plan)).not.toThrow();
  });

  it('reacts to editor context and grants without embedding processors in the plan', () => {
    const next = input(['table']);
    next.capabilities.grants.push('document.table.write');
    const result = compileDocumentEditorPresentation(runtime(), next, {
      unknownToolPolicy: 'diagnostic',
    });

    expect(result).toMatchObject({
      status: 'compiled',
      plan: { groups: [{}, { tools: [{ visible: true, enabled: true }] }] },
    });
    if (result.status !== 'compiled') return;
    expect(JSON.stringify(result.plan)).not.toContain('processor');
    expect(JSON.stringify(result.plan)).not.toContain('runtime');
  });

  it('reports unknown tools deterministically or rejects by policy', () => {
    const unknown = {
      ...input(),
      presentation: {
        ...presentation,
        groups: [{ id: 'host', tools: [{ id: 'host.ai.ask' }] }],
      },
    };
    const diagnosticResult = compileDocumentEditorPresentation(runtime(), unknown, {
      unknownToolPolicy: 'diagnostic',
    });
    expect(diagnosticResult).toMatchObject({
      status: 'compiled',
      plan: {
        groups: [{ tools: [] }],
        diagnostics: [expect.objectContaining({ severity: 'warning', code: 'UNKNOWN_TOOL' })],
      },
    });
    expect(compileDocumentEditorPresentation(runtime(), unknown, {
      unknownToolPolicy: 'reject',
    })).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ severity: 'error', code: 'UNKNOWN_TOOL' })],
    });
  });

  it('fails closed for invalid presentation, capabilities and runtime registries', () => {
    const duplicate = {
      ...input(),
      presentation: {
        ...presentation,
        groups: [{ id: 'one', tools: [{ id: 'history.undo' }, { id: 'history.undo' }] }],
      },
    };
    expect(compileDocumentEditorPresentation(runtime(), duplicate, {
      unknownToolPolicy: 'diagnostic',
    })).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_TOOL_ID' })]),
    });

    expect(compileDocumentEditorPresentation(
      { ...runtime(), tools: {} as never },
      input(),
      { unknownToolPolicy: 'diagnostic' },
    )).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'INVALID_COMPILER_RUNTIME' })],
    });
  });

  it('turns condition exceptions into deterministic diagnostics', () => {
    const base = runtime();
    const conditions = new Map(base.conditions);
    conditions.set('document.editable', {
      runtime: Object.freeze({}),
      processor: () => {
        throw new Error('not leaked');
      },
    });
    const throwing = { ...base, conditions };

    expect(compileDocumentEditorPresentation(throwing, input(), {
      unknownToolPolicy: 'diagnostic',
    })).toMatchObject({
      status: 'rejected',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'CONDITION_EVALUATION_FAILED' }),
      ]),
    });
  });
});
