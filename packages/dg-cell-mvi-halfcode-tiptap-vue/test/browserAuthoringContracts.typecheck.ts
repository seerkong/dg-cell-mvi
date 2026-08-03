import type {
  XnlRichDocumentHalfcodeNodeViewHostInput,
  XnlRichDocumentHalfcodeNodeViewHostRuntime,
  XnlRichDocumentMermaidDiagnostic,
  XnlRichDocumentMermaidDiagnosticEffect,
  XnlRichDocumentMermaidNodeViewRuntime,
  XnlRichDocumentMermaidRenderEffect,
  XnlRichDocumentMermaidRenderResult,
  XnlRichDocumentTiptapBrowserHostResult,
  XnlRichDocumentTiptapBrowserHostRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';
import { createXnlRichDocumentTiptapBrowserHost } from 'dg-cell-mvi-halfcode-tiptap-vue';

class OpaqueRendererRuntime<TCapability> {
  readonly renderPolicyId = 'safe-mermaid' as const;

  constructor(private readonly capability: TCapability) {}

  useCapability(): TCapability {
    return this.capability;
  }
}

class OpaqueDiagnosticRuntime<TCapability> {
  readonly channel = 'document-preview' as const;

  constructor(private readonly capability: TCapability) {}

  useCapability(): TCapability {
    return this.capability;
  }
}

type RenderRuntime = OpaqueRendererRuntime<{ render(source: string): void }>;
type DiagnosticRuntime = OpaqueDiagnosticRuntime<{ report(code: string): void }>;

declare const svg: SVGSVGElement;
declare const diagnostic: XnlRichDocumentMermaidDiagnostic;

const renderRuntime: RenderRuntime = new OpaqueRendererRuntime({
  render(source) {
    void source;
  },
});
const diagnosticRuntime: DiagnosticRuntime = new OpaqueDiagnosticRuntime({
  report(code) {
    void code;
  },
});

const renderEffect: XnlRichDocumentMermaidRenderEffect<RenderRuntime> = async (
  runtime,
  input,
  config,
) => {
  const policy: 'safe-mermaid' = runtime.renderPolicyId;
  const source: string = input.source;
  const requestId: typeof input.requestId = input.requestId;
  const theme: 'default' | 'dark' | 'neutral' = config.theme;
  runtime.useCapability().render(source);
  void policy;
  void theme;
  return { status: 'rendered', requestId, svg };
};

const diagnosticEffect: XnlRichDocumentMermaidDiagnosticEffect<DiagnosticRuntime> = (
  runtime,
  input,
  config,
) => {
  const channel: 'document-preview' = runtime.channel;
  const currentDiagnostic: XnlRichDocumentMermaidDiagnostic = input.diagnostic;
  runtime.useCapability().report(currentDiagnostic.code);
  void channel;
  void config;
};

function bindOpaqueRuntimes<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
>(
  rendererRuntime: TRenderRuntime,
  rendererEffect: XnlRichDocumentMermaidRenderEffect<TRenderRuntime>,
  diagnosticsRuntime: TDiagnosticRuntime,
  diagnosticsEffect: XnlRichDocumentMermaidDiagnosticEffect<TDiagnosticRuntime>,
): XnlRichDocumentMermaidNodeViewRuntime<TRenderRuntime, TDiagnosticRuntime> {
  return {
    renderer: { runtime: rendererRuntime, effect: rendererEffect },
    diagnostics: { runtime: diagnosticsRuntime, effect: diagnosticsEffect },
  };
}

const runtime = bindOpaqueRuntimes(
  renderRuntime,
  renderEffect,
  diagnosticRuntime,
  diagnosticEffect,
);

declare const halfcodeRuntime: XnlRichDocumentHalfcodeNodeViewHostRuntime<object, object>;
declare const browserInput: XnlRichDocumentHalfcodeNodeViewHostInput;
const browserRuntime: XnlRichDocumentTiptapBrowserHostRuntime<
  object,
  object,
  RenderRuntime,
  DiagnosticRuntime
> = {
  halfcode: halfcodeRuntime,
  mermaid: runtime,
};
const browserHostResult: XnlRichDocumentTiptapBrowserHostResult =
  createXnlRichDocumentTiptapBrowserHost(browserRuntime, browserInput, { theme: 'dark' });
if (browserHostResult.status === 'ready') {
  void browserHostResult.extensions;
  browserHostResult.readDiagnostics();
  browserHostResult.dispose();
  // @ts-expect-error The public composition result cannot expose raw NodeView renderers.
  void browserHostResult.nodeViews;
}

const browserRuntimeWithWriter: XnlRichDocumentTiptapBrowserHostRuntime<
  object,
  object,
  RenderRuntime,
  DiagnosticRuntime
> = {
  halfcode: halfcodeRuntime,
  mermaid: runtime,
  // @ts-expect-error The exact outer composition runtime has no writer authority.
  writer: {},
};

const renderPromise = renderEffect(
  runtime.renderer.runtime,
  { source: 'graph TD; A-->B', requestId: 'request-1' as const },
  { theme: 'default' },
);
const matchingResult: Promise<XnlRichDocumentMermaidRenderResult<'request-1'>> = renderPromise;
diagnosticEffect(runtime.diagnostics.runtime, { diagnostic }, {});

const correlatedRejectedResult: XnlRichDocumentMermaidRenderResult<'request-1'> = {
  status: 'rejected',
  requestId: 'request-1',
  diagnostics: [{
    severity: 'error',
    code: 'MERMAID_RENDER_REJECTED',
    message: 'renderer rejected source',
    // @ts-expect-error A rejected diagnostic must use its result's request identity.
    requestId: 'request-2',
  }],
};

const looseCallbackRuntime: XnlRichDocumentMermaidNodeViewRuntime<RenderRuntime, DiagnosticRuntime> = {
  // @ts-expect-error Loose render callbacks cannot replace isolated Effect bindings.
  renderer: renderEffect,
  // @ts-expect-error Loose diagnostic callbacks cannot replace isolated Effect bindings.
  diagnostics: diagnosticEffect,
};

const outerFacetWithWriter: XnlRichDocumentMermaidNodeViewRuntime<RenderRuntime, DiagnosticRuntime> = {
  renderer: { runtime: renderRuntime, effect: renderEffect },
  diagnostics: { runtime: diagnosticRuntime, effect: diagnosticEffect },
  // @ts-expect-error A fresh outer runtime fact cannot add writer authority.
  writer: {},
};

const rendererFacetWithAuthoring: XnlRichDocumentMermaidNodeViewRuntime<RenderRuntime, DiagnosticRuntime> = {
  renderer: {
    runtime: renderRuntime,
    effect: renderEffect,
    // @ts-expect-error A fresh renderer binding fact cannot add authoring authority.
    authoringSession: {},
  },
  diagnostics: { runtime: diagnosticRuntime, effect: diagnosticEffect },
};

// @ts-expect-error Renderer implementation cannot enter the outer NodeView surface.
runtime.renderer.rendererImpl;
// @ts-expect-error Domain AST cannot enter the outer NodeView surface.
runtime.domainAst;
// @ts-expect-error ValueHost cannot enter the outer NodeView surface.
runtime.valueHost;
// @ts-expect-error Authoring authority cannot enter the outer NodeView surface.
runtime.authoringSession;
// @ts-expect-error VFS authority cannot enter the outer NodeView surface.
runtime.vfs;
// @ts-expect-error VCS authority cannot enter the outer NodeView surface.
runtime.vcs;
// @ts-expect-error Writer authority cannot enter the outer NodeView surface.
runtime.writer;

// @ts-expect-error A fresh render input fact cannot carry Domain AST.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2', domainAst: {} }, { theme: 'dark' });
// @ts-expect-error A fresh render input fact cannot carry ValueHost authority.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2', valueHost: {} }, { theme: 'dark' });
// @ts-expect-error A fresh render input fact cannot carry authoring authority.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2', authoringSession: {} }, { theme: 'dark' });
// @ts-expect-error A fresh render config fact cannot carry renderer implementation.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2' }, { theme: 'dark', rendererImpl: {} });
// @ts-expect-error A fresh render config fact cannot carry VFS authority.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2' }, { theme: 'dark', vfs: {} });
// @ts-expect-error A fresh render config fact cannot carry VCS authority.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2' }, { theme: 'dark', vcs: {} });
// @ts-expect-error A fresh render config fact cannot carry writer authority.
renderEffect(runtime.renderer.runtime, { source: 'graph TD; A-->B', requestId: 'request-2' }, { theme: 'dark', writer: {} });
// @ts-expect-error A fresh diagnostic input fact cannot carry authoring authority.
diagnosticEffect(runtime.diagnostics.runtime, { diagnostic, authoringSession: {} }, {});
// @ts-expect-error A fresh diagnostic config fact cannot carry VFS authority.
diagnosticEffect(runtime.diagnostics.runtime, { diagnostic }, { vfs: {} });

// @ts-expect-error Render Effect cannot return raw HTML.
const rawHtmlEffect: XnlRichDocumentMermaidRenderEffect<RenderRuntime> = async () => '<svg />';

void looseCallbackRuntime;
void outerFacetWithWriter;
void rendererFacetWithAuthoring;
void matchingResult;
void correlatedRejectedResult;
void rawHtmlEffect;
void browserRuntimeWithWriter;
