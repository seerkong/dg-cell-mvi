import { Extension, type NodeViewRenderer } from '@tiptap/core';
import { Decoration, DecorationSet, type NodeView } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
  XnlDocumentEditorClipboardBinding,
  XnlDocumentEditorDiagnosticSinkBinding,
  XnlDocumentEditorHighlightBinding,
} from './documentEditorTypes';
import {
  createModeAwareStructuredNodeViewRenderer,
  type XnlRichDocumentStructuredNodeViewModeRuntime,
} from './structuredNodeViewMode';

export type EnhancedCodeBlockPresenterDiagnostic = Readonly<{
  severity: 'warning';
  code: 'UNSUPPORTED_CODE_LANGUAGE' | 'INVALID_HIGHLIGHT_TOKEN';
  message: string;
  path: string;
}>;

export type EnhancedCodeBlockPresenterRuntime = Readonly<{
  clipboard?: XnlDocumentEditorClipboardBinding;
  highlighter?: XnlDocumentEditorHighlightBinding;
  diagnostics?: XnlDocumentEditorDiagnosticSinkBinding<EnhancedCodeBlockPresenterDiagnostic>;
  displayMode?: XnlRichDocumentStructuredNodeViewModeRuntime;
}>;

export type EnhancedCodeBlockPresenterConfig = Readonly<{
  theme: string;
}>;

export type EnhancedCodeBlockPresenterCapability = Readonly<{
  nodeView: NodeViewRenderer;
  highlighting: Extension;
  isFolded(nodeId: string): boolean;
  toggle(nodeId: string): void;
  refresh(): void;
  dispose(): void;
}>;

export function createEnhancedCodeBlockPresenter(
  runtime: EnhancedCodeBlockPresenterRuntime,
  _input: Readonly<Record<PropertyKey, never>>,
  config: EnhancedCodeBlockPresenterConfig,
): EnhancedCodeBlockPresenterCapability {
  const folded = new Set<string>();
  const views = new Set<CodeNodeView>();
  let disposed = false;

  const baseNodeView: NodeViewRenderer = (props) => {
    const ownerDocument = (props.editor.options.element as Element | null)?.ownerDocument;
    if (ownerDocument === undefined) {
      throw new Error('Enhanced code presenter requires a mounted DOM owner document.');
    }
    const view = new CodeNodeView(
      props.node,
      ownerDocument,
      runtime,
      config.theme,
      () => {
        const nodeId = nodeIdentity(props.node);
        if (nodeId === undefined) return;
        if (folded.has(nodeId)) folded.delete(nodeId);
        else folded.add(nodeId);
        views.forEach((entry) => entry.refreshFold(folded));
      },
      () => views.delete(view),
    );
    views.add(view);
    view.refreshFold(folded);
    return view;
  };
  const nodeView = runtime.displayMode === undefined
    ? baseNodeView
    : createModeAwareStructuredNodeViewRenderer({
        ...runtime.displayMode,
        innerRenderer: baseNodeView,
        projection: {
          title: (node) => typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : 'Code block',
          applyMode: (nodeView, mode) => {
            const content = nodeView.contentDOM;
            const HTMLElementConstructor = nodeView.dom.ownerDocument.defaultView?.HTMLElement;
            if (HTMLElementConstructor === undefined || !(content instanceof HTMLElementConstructor)) return;
            if (mode.mode === 'view') content.setAttribute('contenteditable', 'false');
            else content.removeAttribute('contenteditable');
            nodeView.dom.setAttribute('data-display-mode', mode.mode);
          },
        },
      }, {
        projectionRole: 'code-block',
        kindLabel: 'Code',
      });

  const highlighting = Extension.create({
    name: 'xnlEnhancedCodeHighlighting',
    addProseMirrorPlugins() {
      return [new Plugin({
        key: new PluginKey('xnlEnhancedCodeHighlighting'),
        props: {
          decorations(state) {
            if (runtime.highlighter === undefined) return null;
            const decorations: Decoration[] = [];
            const diagnostics: EnhancedCodeBlockPresenterDiagnostic[] = [];
            state.doc.descendants((node, position) => {
              if (node.type.name !== 'codeBlock') return true;
              const language = typeof node.attrs.language === 'string'
                ? node.attrs.language
                : undefined;
              let result;
              try {
                result = runtime.highlighter!.effect(
                  runtime.highlighter!.runtime,
                  { source: node.textContent, ...(language === undefined ? {} : { language }) },
                  { theme: config.theme },
                );
              } catch {
                diagnostics.push({
                  severity: 'warning',
                  code: 'UNSUPPORTED_CODE_LANGUAGE',
                  message: `Highlighter rejected language "${language ?? 'plaintext'}".`,
                  path: `$.codeBlock.${nodeIdentity(node) ?? position}.language`,
                });
                return false;
              }
              if (result.status === 'unsupported') {
                diagnostics.push({
                  severity: 'warning',
                  code: 'UNSUPPORTED_CODE_LANGUAGE',
                  message: result.reason,
                  path: `$.codeBlock.${nodeIdentity(node) ?? position}.language`,
                });
                return false;
              }
              result.tokens.forEach((token, index) => {
                if (!Number.isInteger(token.from) || !Number.isInteger(token.to)
                  || token.from < 0 || token.to <= token.from
                  || token.to > node.textContent.length
                  || !/^[a-z][a-z0-9_-]*$/i.test(token.className)) {
                  diagnostics.push({
                    severity: 'warning',
                    code: 'INVALID_HIGHLIGHT_TOKEN',
                    message: `Highlighter returned an invalid token at index ${index}.`,
                    path: `$.codeBlock.${nodeIdentity(node) ?? position}.tokens[${index}]`,
                  });
                  return;
                }
                decorations.push(Decoration.inline(
                  position + 1 + token.from,
                  position + 1 + token.to,
                  { class: `xnl-code-token ${token.className}` },
                ));
              });
              return false;
            });
            runtime.diagnostics?.effect(
              runtime.diagnostics.runtime,
              { diagnostics: Object.freeze(diagnostics) },
              Object.freeze({}),
            );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      })];
    },
  });

  return Object.freeze({
    nodeView,
    highlighting,
    isFolded: (nodeId: string) => folded.has(nodeId),
    toggle: (nodeId: string) => {
      if (folded.has(nodeId)) folded.delete(nodeId);
      else folded.add(nodeId);
      views.forEach((entry) => entry.refreshFold(folded));
    },
    refresh: () => views.forEach((entry) => entry.refreshFold(folded)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      views.forEach((entry) => entry.destroy());
      views.clear();
      folded.clear();
    },
  });
}

class CodeNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private node: ProseMirrorNode;
  private readonly language: HTMLElement;
  private readonly header: HTMLElement;
  private readonly gutter: HTMLElement;
  private readonly foldButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor(
    node: ProseMirrorNode,
    domDocument: Document,
    private readonly runtime: EnhancedCodeBlockPresenterRuntime,
    theme: string,
    toggle: () => void,
    private readonly onDestroy: () => void,
  ) {
    this.node = node;
    this.dom = domDocument.createElement('figure');
    this.dom.className = 'xnl-enhanced-code';
    this.dom.dataset.theme = theme;
    this.header = this.dom.appendChild(domDocument.createElement('figcaption'));
    this.header.className = 'xnl-enhanced-code__header';
    this.language = this.header.appendChild(domDocument.createElement('span'));
    this.language.className = 'xnl-enhanced-code__language';
    const actions = this.header.appendChild(domDocument.createElement('span'));
    actions.className = 'xnl-enhanced-code__actions';
    this.foldButton = button(domDocument, actions, 'Fold code', 'Fold', toggle);
    this.copyButton = button(domDocument, actions, 'Copy code', 'Copy', () => void this.copy());
    const body = this.dom.appendChild(domDocument.createElement('div'));
    body.className = 'xnl-enhanced-code__body';
    this.gutter = body.appendChild(domDocument.createElement('span'));
    this.gutter.className = 'xnl-enhanced-code__gutter';
    this.gutter.setAttribute('aria-hidden', 'true');
    const pre = body.appendChild(domDocument.createElement('pre'));
    this.contentDOM = pre.appendChild(domDocument.createElement('code'));
    this.refreshNode();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== 'codeBlock') return false;
    this.node = node;
    this.refreshNode();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.header.contains(event.target as Node);
  }

  refreshFold(folded: ReadonlySet<string>): void {
    const value = nodeIdentity(this.node) !== undefined && folded.has(nodeIdentity(this.node)!);
    this.dom.classList.toggle('is-folded', value);
    this.foldButton.textContent = value ? 'Expand' : 'Fold';
    this.foldButton.setAttribute('aria-expanded', String(!value));
  }

  destroy(): void {
    if (this.copyTimer !== undefined) clearTimeout(this.copyTimer);
    this.onDestroy();
  }

  private refreshNode(): void {
    const language = typeof this.node.attrs.language === 'string' && this.node.attrs.language.length > 0
      ? this.node.attrs.language
      : 'plaintext';
    this.language.textContent = language;
    const lines = Math.max(1, this.node.textContent.split('\n').length);
    this.gutter.replaceChildren(...Array.from({ length: lines }, (_, index) => {
      const line = this.dom.ownerDocument.createElement('span');
      line.textContent = String(index + 1);
      return line;
    }));
  }

  private async copy(): Promise<void> {
    if (this.runtime.clipboard === undefined) return;
    const result = await this.runtime.clipboard.effect(
      this.runtime.clipboard.runtime,
      { text: this.node.textContent },
      Object.freeze({}),
    );
    this.copyButton.textContent = result.status === 'written' ? 'Copied' : 'Copy failed';
    if (this.copyTimer !== undefined) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => { this.copyButton.textContent = 'Copy'; }, 1200);
  }
}

function button(
  domDocument: Document,
  parent: HTMLElement,
  label: string,
  text: string,
  action: () => void,
): HTMLButtonElement {
  const value = parent.appendChild(domDocument.createElement('button'));
  value.type = 'button';
  value.setAttribute('aria-label', label);
  value.title = label;
  value.textContent = text;
  value.addEventListener('click', action);
  return value;
}

function nodeIdentity(node: ProseMirrorNode): string | undefined {
  return typeof node.attrs.nodeId === 'string' && node.attrs.nodeId.length > 0
    ? node.attrs.nodeId
    : undefined;
}
