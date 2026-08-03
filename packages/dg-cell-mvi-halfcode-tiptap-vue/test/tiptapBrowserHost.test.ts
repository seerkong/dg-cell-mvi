// @vitest-environment jsdom

import { createDocumentInstanceRegistry, type HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import {
  createXnlRichDocumentTiptapBrowserHost,
  type XnlRichDocumentMermaidNodeViewRuntime,
  type XnlRichDocumentTiptapBrowserHostRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';
import { describe, expect, it, vi } from 'vitest';

const EMPTY_INPUT = Object.freeze({ targets: [], occurrences: [] });
const CONFIG = Object.freeze({ theme: 'default' as const });

function halfcodeRuntime() {
  const appRuntime: HalfcodeAppRuntime = {
    bundle: {} as never,
    plans: {
      renderPlans: [],
      scopeRuntimePlans: [],
      messageDispatchPlan: [],
      routePlan: { routes: [] },
      documentPlans: [],
      flowPlans: [],
      diagnostics: [],
    } as never,
    assemblies: {},
    flows: {} as never,
    resolveScope: () => undefined,
    resolveFlow: () => undefined,
    resolveConfig: () => ({}),
    dispatchCommand: async () => ({ diagnostics: [] }),
    dispose: vi.fn(),
  };
  return {
    presenterFacet: {} as never,
    editIntentPort: () => ({ status: 'emitted' as const }),
    documentInstances: createDocumentInstanceRegistry(),
    halfcodeRuntime: appRuntime,
  };
}

function mermaidRuntime(): XnlRichDocumentMermaidNodeViewRuntime<object, object> {
  return {
    renderer: {
      runtime: Object.freeze({}),
      effect: async (_runtime, input) => ({
        status: 'rendered',
        requestId: input.requestId,
        svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      }),
    },
    diagnostics: {
      runtime: Object.freeze({}),
      effect: () => undefined,
    },
  };
}

function runtime() {
  return { halfcode: halfcodeRuntime(), mermaid: mermaidRuntime() };
}

describe('T4.3 combined Tiptap browser host contract', () => {
  it('is a three-argument package-root value with public runtime typing', () => {
    const typed: XnlRichDocumentTiptapBrowserHostRuntime<object, object, object, object> = runtime();
    expect(createXnlRichDocumentTiptapBrowserHost).toHaveLength(3);
    expect(createXnlRichDocumentTiptapBrowserHost(typed, EMPTY_INPUT, CONFIG).status).toBe('ready');
  });

  it('accepts a class carrier without reading its prototype getter', () => {
    const prototypeGetter = vi.fn(() => {
      throw new Error('prototype getters must stay opaque');
    });
    class BrowserRuntimeCarrier {
      constructor(
        readonly halfcode: ReturnType<typeof halfcodeRuntime>,
        readonly mermaid: ReturnType<typeof mermaidRuntime>,
      ) {}

      get writer(): never {
        return prototypeGetter();
      }
    }

    const result = createXnlRichDocumentTiptapBrowserHost(
      new BrowserRuntimeCarrier(halfcodeRuntime(), mermaidRuntime()),
      EMPTY_INPUT,
      CONFIG,
    );
    expect(result.status).toBe('ready');
    expect(prototypeGetter).not.toHaveBeenCalled();
  });

  it('fails closed for an extra own key or own accessor without invoking it', () => {
    const extra = { ...runtime(), writer: {} };
    expect(createXnlRichDocumentTiptapBrowserHost(extra as never, EMPTY_INPUT, CONFIG).status)
      .toBe('rejected');

    const getter = vi.fn(() => halfcodeRuntime());
    const accessor = Object.defineProperty({ mermaid: mermaidRuntime() }, 'halfcode', {
      enumerable: true,
      get: getter,
    });
    expect(createXnlRichDocumentTiptapBrowserHost(accessor as never, EMPTY_INPUT, CONFIG).status)
      .toBe('rejected');
    expect(getter).not.toHaveBeenCalled();
  });

  it('returns one canonical extension name each and an idempotent ready lifecycle', () => {
    const result = createXnlRichDocumentTiptapBrowserHost(runtime(), EMPTY_INPUT, CONFIG);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(Reflect.ownKeys(result).sort()).toEqual([
      'dispose',
      'extensions',
      'readDiagnostics',
      'status',
    ]);
    const names = result.extensions.map((extension) => extension.name);
    expect(new Set(names).size).toBe(names.length);
    expect(() => {
      result.dispose();
      result.dispose();
    }).not.toThrow();
    expect(result.readDiagnostics()).toEqual([]);
  });
});
