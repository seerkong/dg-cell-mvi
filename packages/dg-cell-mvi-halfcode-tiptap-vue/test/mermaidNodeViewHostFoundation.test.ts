// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXnlRichDocumentMermaidNodeViewHost } from '../src/mermaidNodeViewHost';
import type {
  XnlRichDocumentMermaidDiagnosticEffect,
  XnlRichDocumentMermaidNodeViewRuntime,
  XnlRichDocumentMermaidRenderEffect,
} from '../src/types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

class RendererRuntime<TDependency> {
  readonly policy = 'safe-mermaid';

  constructor(private readonly dependency: TDependency) {}

  useDependency(): TDependency {
    return this.dependency;
  }
}

class DiagnosticRuntime<TDependency> {
  readonly channel = 'document-preview';

  constructor(private readonly dependency: TDependency) {}

  useDependency(): TDependency {
    return this.dependency;
  }
}

type TestRendererRuntime = RendererRuntime<{ render(source: string): void }>;
type TestDiagnosticRuntime = DiagnosticRuntime<{ report(code: string): void }>;

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createFixture() {
  const renderRuntime = new RendererRuntime({ render: vi.fn() });
  const diagnosticRuntime = new DiagnosticRuntime({ report: vi.fn() });
  const renderEffect = vi.fn(async (_runtime, input) => ({
    status: 'rendered' as const,
    requestId: input.requestId,
    svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  })) as XnlRichDocumentMermaidRenderEffect<TestRendererRuntime>;
  const diagnosticEffect = vi.fn() as XnlRichDocumentMermaidDiagnosticEffect<
    TestDiagnosticRuntime
  >;
  const runtime: XnlRichDocumentMermaidNodeViewRuntime<
    TestRendererRuntime,
    TestDiagnosticRuntime
  > = {
    renderer: { runtime: renderRuntime, effect: renderEffect },
    diagnostics: { runtime: diagnosticRuntime, effect: diagnosticEffect },
  };
  return {
    runtime,
    renderRuntime,
    diagnosticRuntime,
    renderEffect,
    diagnosticEffect,
  };
}

function expectRejected(value: unknown) {
  const result = createXnlRichDocumentMermaidNodeViewHost(
    value as never,
    EMPTY,
    { theme: 'default' },
  );
  expect(result.status).toBe('rejected');
}

describe('T3.1 Mermaid NodeView host foundation', () => {
  it('accepts a class outer runtime and keeps both carrier prototypes and inner runtimes opaque', () => {
    const fixture = createFixture();
    const rendererGetter = vi.fn();
    const diagnosticGetter = vi.fn();
    const prototypeGetter = vi.fn(() => {
      throw new Error('prototype getters must stay opaque');
    });
    class OuterRuntimeCarrier {
      constructor(
        readonly renderer: typeof fixture.runtime.renderer,
        readonly diagnostics: typeof fixture.runtime.diagnostics,
      ) {}

      hostMethod(): string {
        return 'class-runtime';
      }

      get inheritedAuthority(): never {
        return prototypeGetter();
      }
    }
    Object.defineProperty(fixture.renderRuntime, 'privateDependency', {
      configurable: true,
      get: rendererGetter,
    });
    Object.defineProperty(fixture.diagnosticRuntime, 'privateDependency', {
      configurable: true,
      get: diagnosticGetter,
    });

    const runtime = new OuterRuntimeCarrier(
      fixture.runtime.renderer,
      fixture.runtime.diagnostics,
    );
    expect(createXnlRichDocumentMermaidNodeViewHost).toHaveLength(3);
    const result = createXnlRichDocumentMermaidNodeViewHost(
      runtime,
      EMPTY,
      { theme: 'dark' },
    );

    expect(result.status).toBe('ready');
    expect(runtime.hostMethod()).toBe('class-runtime');
    expect(prototypeGetter).not.toHaveBeenCalled();
    expect(rendererGetter).not.toHaveBeenCalled();
    expect(diagnosticGetter).not.toHaveBeenCalled();
    expect(Object.isFrozen(fixture.renderRuntime)).toBe(false);
    expect(Object.isFrozen(fixture.diagnosticRuntime)).toBe(false);
    expect(fixture.renderRuntime.useDependency()).toBeTypeOf('object');
    expect(fixture.diagnosticRuntime.useDependency()).toBeTypeOf('object');
    expect(fixture.renderEffect).not.toHaveBeenCalled();
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();

    const runtimeWithWriter = new OuterRuntimeCarrier(
      fixture.runtime.renderer,
      fixture.runtime.diagnostics,
    );
    Object.defineProperty(runtimeWithWriter, 'writer', {
      enumerable: true,
      value: {},
    });
    expectRejected(runtimeWithWriter);

    const ownAccessor = vi.fn(() => fixture.runtime.renderer);
    const runtimeWithAccessor = new OuterRuntimeCarrier(
      fixture.runtime.renderer,
      fixture.runtime.diagnostics,
    );
    Object.defineProperty(runtimeWithAccessor, 'renderer', {
      enumerable: true,
      get: ownAccessor,
    });
    expectRejected(runtimeWithAccessor);
    expect(ownAccessor).not.toHaveBeenCalled();
    expect(prototypeGetter).not.toHaveBeenCalled();
  });

  it('rejects extra own keys and loose or non-function Effect bindings', () => {
    const fixture = createFixture();
    const validRenderer = fixture.runtime.renderer;
    const validDiagnostics = fixture.runtime.diagnostics;

    for (const runtime of [
      { ...fixture.runtime, writer: {} },
      { renderer: fixture.renderEffect, diagnostics: validDiagnostics },
      { renderer: validRenderer, diagnostics: fixture.diagnosticEffect },
      { renderer: { ...validRenderer, authoringSession: {} }, diagnostics: validDiagnostics },
      { renderer: validRenderer, diagnostics: { ...validDiagnostics, vfs: {} } },
      { renderer: { runtime: fixture.renderRuntime, effect: {} }, diagnostics: validDiagnostics },
      { renderer: validRenderer, diagnostics: { runtime: fixture.diagnosticRuntime, effect: null } },
    ]) {
      expectRejected(runtime);
    }

    expect(createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      { domainAst: {} } as never,
      { theme: 'default' },
    ).status).toBe('rejected');
    expect(createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      EMPTY,
      { theme: 'neutral', valueHost: {} } as never,
    ).status).toBe('rejected');
    expect(createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      EMPTY,
      { theme: 'loose' } as never,
    ).status).toBe('rejected');
    expect(fixture.renderEffect).not.toHaveBeenCalled();
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
  });

  it('rejects accessors at every outer boundary without invoking getters or DOM', () => {
    const fixture = createFixture();
    let getterCalls = 0;
    const createElement = vi.spyOn(document, 'createElement');
    const createElementNS = vi.spyOn(document, 'createElementNS');
    const accessor = (key: string, value: unknown) => Object.defineProperty({}, key, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return value;
      },
    });

    const outerAccessor = accessor('renderer', fixture.runtime.renderer);
    Object.defineProperty(outerAccessor, 'diagnostics', {
      enumerable: true,
      value: fixture.runtime.diagnostics,
    });
    expectRejected(outerAccessor);
    expectRejected({
      renderer: accessor('runtime', fixture.renderRuntime),
      diagnostics: fixture.runtime.diagnostics,
    });
    expect(createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      accessor('valueHost', {}) as never,
      { theme: 'default' },
    ).status).toBe('rejected');
    expect(createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      EMPTY,
      accessor('theme', 'default') as never,
    ).status).toBe('rejected');

    expect(getterCalls).toBe(0);
    expect(fixture.renderEffect).not.toHaveBeenCalled();
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(createElementNS).not.toHaveBeenCalled();
  });

  it('returns only the ready host surface and registers a reachable Mermaid NodeView', () => {
    const fixture = createFixture();
    const result = createXnlRichDocumentMermaidNodeViewHost(
      fixture.runtime,
      EMPTY,
      { theme: 'neutral' },
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(Reflect.ownKeys(result).sort()).toEqual(['dispose', 'extensions', 'status']);
    const editor = new Editor({
      element: document.body.appendChild(document.createElement('div')),
      extensions: result.extensions,
      content: {
        type: 'doc',
        attrs: { nodeId: 'document.mermaid-host' },
        content: [{
          type: 'mermaid',
          attrs: { nodeId: 'mermaid.foundation', source: 'graph TD; A-->B' },
        }],
      },
    });
    editors.push(editor);

    expect(editor.extensionManager.nodeViews.mermaid).toBeTypeOf('function');
    expect(fixture.renderEffect).not.toHaveBeenCalled();
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
    result.dispose();
    result.dispose();
  });
});
