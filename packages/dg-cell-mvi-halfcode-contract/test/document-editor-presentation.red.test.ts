import { describe, expect, it } from 'vitest';
import {
  validateDocumentEditorPresentation,
  validateDocumentEditorToolbarPlan,
  type DocumentEditorPresentation,
  type DocumentEditorToolbarPlan,
} from '../src';

const PRESENTATION = {
  kind: 'document-editor-presentation',
  id: 'document.standard',
  groups: [{
    id: 'inline',
    label: 'Inline',
    priority: 10,
    tools: [{
      id: 'text.bold',
      presenter: { id: 'toolbar.icon-button', options: { tone: 'default' } },
      visibleWhen: { id: 'document.editable' },
    }],
  }],
} satisfies DocumentEditorPresentation;

describe('DocumentEditorPresentation contract', () => {
  it('accepts serializable stable-id-only presentation data', () => {
    expect(validateDocumentEditorPresentation(PRESENTATION)).toEqual({ ok: true, issues: [] });
  });

  it.each([
    {
      name: 'duplicate group ids',
      value: { ...PRESENTATION, groups: [...PRESENTATION.groups, PRESENTATION.groups[0]] },
      code: 'DUPLICATE_GROUP_ID',
    },
    {
      name: 'duplicate tool ids across groups',
      value: {
        ...PRESENTATION,
        groups: [...PRESENTATION.groups, { id: 'more', tools: [{ id: 'text.bold' }] }],
      },
      code: 'DUPLICATE_TOOL_ID',
    },
    {
      name: 'executable options',
      value: {
        ...PRESENTATION,
        groups: [{ id: 'inline', tools: [{ id: 'text.bold', options: { run: () => true } }] }],
      },
      code: 'EXECUTABLE_VALUE',
    },
    {
      name: 'runtime ownership field',
      value: { ...PRESENTATION, metadata: { runtime: 'not-data' } },
      code: 'OWNERSHIP_FIELD',
    },
  ])('rejects $name', ({ value, code }) => {
    expect(validateDocumentEditorPresentation(value)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it('inspects accessors without invoking them', () => {
    let reads = 0;
    const value = { ...PRESENTATION } as Record<string, unknown>;
    Object.defineProperty(value, 'groups', {
      enumerable: true,
      get() {
        reads += 1;
        return [];
      },
    });

    expect(validateDocumentEditorPresentation(value)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'ACCESSOR_CONTRACT_FIELD' })]),
    });
    expect(reads).toBe(0);
  });

  it('accepts a recursively serializable toolbar plan and rejects renderer objects', () => {
    const plan = {
      kind: 'document-editor-toolbar-plan',
      id: 'document.standard',
      groups: [{
        id: 'inline',
        priority: 10,
        tools: [{
          id: 'text.bold',
          commandId: 'document.command.bold.toggle',
          label: 'Bold',
          icon: 'bold',
          presenter: { id: 'toolbar.icon-button' },
          visible: true,
          enabled: true,
        }],
      }],
      diagnostics: [],
    } satisfies DocumentEditorToolbarPlan;

    expect(validateDocumentEditorToolbarPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(validateDocumentEditorToolbarPlan({ ...plan, editor: new Date() })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'RUNTIME_INSTANCE' })]),
    });
  });
});

