// @vitest-environment jsdom

import { Editor, type NodeViewRenderer } from '@tiptap/core';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentDisplayModeSession } from 'dg-cell-mvi-halfcode-support';
import {
  createModeAwareStructuredNodeViewRenderer,
  createXnlRichDocumentModeRegistrationCoordinator,
} from '../src';
import { createXnlRichDocumentTiptapHostExtensions } from '../src/internalTiptapExtensionRegistry';

const mounted: Editor[] = [];

afterEach(() => {
  for (const editor of mounted.splice(0)) if (!editor.isDestroyed) editor.destroy();
  document.body.replaceChildren();
});

describe('mode-aware structured NodeView adapter', () => {
  it('projects one occurrence without changing document content', async () => {
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-structured-mode',
      initialBaseMode: 'edit',
      policy: {
        runtime: Object.freeze({}),
        processor: () => Object.freeze({
          allowed: true,
          allowedModes: Object.freeze(['view', 'edit'] as const),
        }),
        config: Object.freeze({}),
      },
    });
    const registrations = createXnlRichDocumentModeRegistrationCoordinator(session);
    const base: NodeViewRenderer = ({ view }) => {
      const dom = view.dom.ownerDocument.createElement('div');
      dom.setAttribute('data-structured-probe-content', '');
      return { dom, update: () => true };
    };
    const nodeView = createModeAwareStructuredNodeViewRenderer({
      unitInstanceId: 'document-structured-mode',
      session,
      registrations,
      innerRenderer: base,
      projection: {
        title: () => 'diagram.mode-probe',
        applyMode: (view, mode) => view.dom.setAttribute('data-projected-mode', mode.mode),
      },
    }, {
      projectionRole: 'mermaid',
      kindLabel: 'Mermaid',
    });
    const target = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element: target,
      extensions: createXnlRichDocumentTiptapHostExtensions({ mermaid: nodeView }),
      content: {
        type: 'doc',
        content: [{
          type: 'mermaid',
          attrs: { nodeId: 'diagram.mode-probe', source: 'flowchart LR; A-->B' },
        }],
      },
    });
    mounted.push(editor);
    const accepted = editor.getJSON();

    await settleMode();
    const structured = target.querySelector<HTMLElement>('[data-structured-nodeview="mermaid"]');
    const shell = structured?.querySelector<HTMLElement>('[data-testid="xnl-mode-shell"]');
    expect(structured?.dataset.displayMode).toBe('edit');
    expect(shell?.dataset.displayMode).toBe('edit');
    expect(structured?.querySelector('[data-structured-probe-content]')?.getAttribute('data-projected-mode'))
      .toBe('edit');

    shell?.querySelector<HTMLButtonElement>('[data-testid="xnl-mode-shell-trigger"]')?.click();
    await nextTick();
    shell?.querySelector<HTMLButtonElement>('[data-mode-option="view"]')?.click();
    await settleMode();

    await vi.waitFor(() => {
      expect(structured?.dataset.displayMode).toBe('view');
      expect(shell?.dataset.modeOverlay).toBe('view');
    });
    expect(editor.getJSON()).toEqual(accepted);

    editor.destroy();
    registrations.dispose();
    session.destroy();
  });

  it('remounts with a fresh registration when stable node identity changes', async () => {
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-structured-remount',
      initialBaseMode: 'edit',
      policy: {
        runtime: Object.freeze({}),
        processor: () => Object.freeze({
          allowed: true,
          allowedModes: Object.freeze(['view', 'edit'] as const),
        }),
        config: Object.freeze({}),
      },
    });
    const registrations = createXnlRichDocumentModeRegistrationCoordinator(session);
    const destroyed = vi.fn();
    const base: NodeViewRenderer = ({ view }) => {
      const dom = view.dom.ownerDocument.createElement('div');
      return { dom, update: () => true, destroy: destroyed };
    };
    const nodeView = createModeAwareStructuredNodeViewRenderer({
      unitInstanceId: 'document-structured-remount',
      session,
      registrations,
      innerRenderer: base,
      projection: {
        title: (node) => String(node.attrs.nodeId),
        applyMode: () => undefined,
      },
    }, {
      projectionRole: 'code-block',
      kindLabel: 'Code',
    });
    const target = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element: target,
      extensions: createXnlRichDocumentTiptapHostExtensions({ codeBlock: nodeView }),
      content: {
        type: 'doc',
        content: [{
          type: 'codeBlock',
          attrs: { nodeId: 'code.before', language: 'typescript' },
          content: [{ type: 'text', text: 'const before = true;' }],
        }],
      },
    });
    mounted.push(editor);

    await settleMode();
    const before = target.querySelector<HTMLElement>('[data-structured-nodeview="code-block"]');
    const beforeXId = before?.dataset.xId;
    expect(beforeXId).toBeTruthy();
    expect(session.snapshot().projections.filter(({ target: projectionTarget }) => (
      projectionTarget.kind === 'occurrence'
    ))).toHaveLength(1);

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { nodeId: 'code.after', language: 'typescript' });
      return true;
    });
    await settleMode();

    const after = target.querySelector<HTMLElement>('[data-structured-nodeview="code-block"]');
    expect(after?.dataset.xId).toBeTruthy();
    expect(after?.dataset.xId).not.toBe(beforeXId);
    expect(destroyed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      const occurrences = session.snapshot().projections.filter(({ target: projectionTarget }) => (
        projectionTarget.kind === 'occurrence'
      ));
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.target.kind === 'occurrence'
        ? occurrences[0].target.ref.xId
        : undefined).toBe(after?.dataset.xId);
    });

    editor.destroy();
    registrations.dispose();
    session.destroy();
  });

  it('upgrades a provisional structured NodeView after authority assigns stable identity', async () => {
    const session = createDocumentDisplayModeSession({
      unitInstanceId: 'document-structured-provisional',
      initialBaseMode: 'edit',
      policy: {
        runtime: Object.freeze({}),
        processor: () => Object.freeze({
          allowed: true,
          allowedModes: Object.freeze(['view', 'edit'] as const),
        }),
        config: Object.freeze({}),
      },
    });
    const registrations = createXnlRichDocumentModeRegistrationCoordinator(session);
    const destroyed = vi.fn();
    const base: NodeViewRenderer = ({ view }) => {
      const dom = view.dom.ownerDocument.createElement('div');
      dom.setAttribute('data-provisional-structured-content', '');
      return { dom, update: () => true, destroy: destroyed };
    };
    const nodeView = createModeAwareStructuredNodeViewRenderer({
      unitInstanceId: 'document-structured-provisional',
      session,
      registrations,
      innerRenderer: base,
      projection: {
        title: (node) => String(node.attrs.nodeId ?? 'pending'),
        applyMode: () => undefined,
      },
    }, {
      projectionRole: 'mermaid',
      kindLabel: 'Mermaid',
    });
    const target = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element: target,
      extensions: createXnlRichDocumentTiptapHostExtensions({ mermaid: nodeView }),
      content: {
        type: 'doc',
        content: [{
          type: 'mermaid',
          attrs: { nodeId: null, source: 'flowchart LR; A-->B' },
        }],
      },
    });
    mounted.push(editor);
    expect(target.querySelector('[data-structured-nodeview="mermaid"]')).toBeNull();

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { nodeId: 'diagram.allocated', source: 'flowchart LR; A-->B' });
      return true;
    });
    await settleMode();

    const structured = target.querySelector<HTMLElement>('[data-structured-nodeview="mermaid"]');
    expect(structured?.dataset.xId).toBeTruthy();
    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(session.snapshot().projections.filter(({ target: projectionTarget }) => (
      projectionTarget.kind === 'occurrence'
    ))).toHaveLength(1);

    editor.destroy();
    registrations.dispose();
    session.destroy();
  });
});

async function settleMode(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}
