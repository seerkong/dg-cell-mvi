// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { EditorState, Transaction } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXnlRichDocumentMermaidNodeViewHost } from '../src/mermaidNodeViewHost';
import { normalizeTiptapTransaction } from '../src/transactionNormalizer';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentMermaidDiagnosticEffect,
  type XnlRichDocumentMermaidNodeViewRuntime,
  type XnlRichDocumentMermaidRenderEffect,
  type XnlRichDocumentMermaidRenderResult,
} from '../src/types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const CONFIG = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  planNodeId: 'xnlp:node:document.mermaid-lifecycle',
} as const;

const mountedEditors: Editor[] = [];

afterEach(() => {
  for (const editor of mountedEditors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function svgWith(...children: Element[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  for (const child of children) svg.appendChild(child);
  return svg;
}

function svgChild(name: string): Element {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function svgLinkWith(attributeName: 'href' | 'xlink:href', value: string): SVGSVGElement {
  expect(new URL(value, 'https://example.test/').protocol).toBe('javascript:');
  const anchor = svgChild('a');
  if (attributeName === 'xlink:href') {
    anchor.setAttributeNS('http://www.w3.org/1999/xlink', attributeName, value);
  } else {
    anchor.setAttribute(attributeName, value);
  }
  return svgWith(anchor);
}

function untrustedRenderEffect(
  createResult: (requestId: string) => unknown,
): XnlRichDocumentMermaidRenderEffect<object> {
  return vi.fn(async (_runtime, input) => createResult(input.requestId)) as unknown as (
    XnlRichDocumentMermaidRenderEffect<object>
  );
}

function renderRejectedDiagnostic(requestId: string) {
  return {
    severity: 'error' as const,
    code: 'MERMAID_RENDER_REJECTED' as const,
    message: 'renderer rejected source',
    requestId,
  };
}

function createFixture(
  renderEffect: XnlRichDocumentMermaidRenderEffect<object>,
  options: Readonly<{
    diagnosticEffect?: XnlRichDocumentMermaidDiagnosticEffect<object>;
  }> = {},
) {
  const renderRuntime = {};
  const diagnosticRuntime = { channel: 'mermaid-diagnostics' };
  const diagnosticEffect = options.diagnosticEffect
    ?? vi.fn() as XnlRichDocumentMermaidDiagnosticEffect<object>;
  const runtime: XnlRichDocumentMermaidNodeViewRuntime<object, object> = {
    renderer: { runtime: renderRuntime, effect: renderEffect },
    diagnostics: { runtime: diagnosticRuntime, effect: diagnosticEffect },
  };
  const host = createXnlRichDocumentMermaidNodeViewHost(runtime, EMPTY, { theme: 'default' });
  expect(host.status).toBe('ready');
  if (host.status !== 'ready') throw new Error(host.diagnostics[0].message);
  const target = document.body.appendChild(document.createElement('div'));
  const editor = new Editor({
    element: target,
    extensions: host.extensions,
    content: {
      type: 'doc',
      attrs: { nodeId: 'document.mermaid-lifecycle' },
      content: [{
        type: 'mermaid',
        attrs: { nodeId: 'mermaid.lifecycle', source: 'graph TD; A-->B' },
      }],
    },
  });
  mountedEditors.push(editor);
  const container = target.querySelector('[data-mermaid-render-container]');
  const sourceEditor = target.querySelector('[data-mermaid-source-editor]') as HTMLTextAreaElement | null;
  expect(container).toBeInstanceOf(HTMLElement);
  expect(sourceEditor).toBeInstanceOf(HTMLTextAreaElement);
  return {
    host,
    editor,
    target,
    container: container as HTMLElement,
    sourceEditor: sourceEditor!,
    diagnosticRuntime,
    diagnosticEffect,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function firstRequest(
  renderEffect: ReturnType<typeof vi.fn>,
): Readonly<{ source: string; requestId: string }> {
  expect(renderEffect).toHaveBeenCalled();
  return renderEffect.mock.calls[0][1] as Readonly<{ source: string; requestId: string }>;
}

function expectDiagnostic(
  fixture: ReturnType<typeof createFixture>,
  callIndex: number,
  code: string,
  requestId?: string,
) {
  const diagnosticEffect = fixture.diagnosticEffect as ReturnType<typeof vi.fn>;
  expect(diagnosticEffect).toHaveBeenCalled();
  const call = diagnosticEffect.mock.calls[callIndex];
  expect(call?.[0]).toBe(fixture.diagnosticRuntime);
  expect(call?.[1]).toMatchObject({
    diagnostic: {
      severity: 'error',
      code,
      ...(requestId === undefined ? {} : { requestId }),
    },
  });
  expect(call?.[2]).toEqual({});
  expect(Reflect.ownKeys(call?.[2] ?? {})).toEqual([]);
  return call?.[1].diagnostic;
}

describe('T3.2 Mermaid NodeView lifecycle', () => {
  it.each([
    ['script element', () => svgWith(svgChild('script'))],
    ['foreignObject element', () => svgWith(svgChild('foreignObject'))],
    ['on* attribute', () => {
      const rect = svgChild('rect');
      rect.setAttribute('onclick', 'alert(1)');
      return svgWith(rect);
    }],
    ['namespaced on* attribute', () => {
      const rect = svgChild('rect');
      rect.setAttributeNS('urn:xnl:test', 'x:onload', 'alert(1)');
      return svgWith(rect);
    }],
    ['javascript href', () => {
      const anchor = svgChild('a');
      anchor.setAttribute('href', 'javascript:alert(1)');
      return svgWith(anchor);
    }],
    ['javascript xlink:href', () => {
      const anchor = svgChild('a');
      anchor.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', 'javascript:alert(1)');
      return svgWith(anchor);
    }],
    ['href with LF inside javascript scheme', () => svgLinkWith('href', 'java\nscript:alert(1)')],
    ['xlink:href with CR inside javascript scheme', () => (
      svgLinkWith('xlink:href', 'java\rscript:alert(1)')
    )],
    ['href with TAB inside javascript scheme', () => svgLinkWith('href', 'java\tscript:alert(1)')],
    ['xlink:href with a leading C0 control', () => (
      svgLinkWith('xlink:href', '\u0001javascript:alert(1)')
    )],
  ])('rejects unsafe SVG output: %s', async (_label, makeSvg) => {
    const renderEffect = vi.fn(async (_runtime, input) => ({
      status: 'rendered' as const,
      requestId: input.requestId,
      svg: makeSvg(),
    })) as XnlRichDocumentMermaidRenderEffect<object>;
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'UNSAFE_MERMAID_RENDER_OUTPUT', request.requestId);
    expect(fixture.host.status).toBe('ready');
  });

  it.each([
    ['root own children getter hides a real script child', () => {
      const svg = svgWith(svgChild('script'));
      Object.defineProperty(svg, 'children', {
        configurable: true,
        get: () => [],
      });
      return svg;
    }],
    ['descendant own localName disguises a script element', () => {
      const script = svgChild('script');
      Object.defineProperty(script, 'localName', {
        configurable: true,
        value: 'g',
      });
      return svgWith(script);
    }],
    ['element own attributes hides an onclick attribute', () => {
      const rect = svgChild('rect');
      rect.setAttribute('onclick', 'alert(1)');
      Object.defineProperty(rect, 'attributes', {
        configurable: true,
        get: () => [],
      });
      return svgWith(rect);
    }],
    ['Attr own value hides a javascript href', () => {
      const anchor = svgChild('a');
      anchor.setAttribute('href', 'javascript:alert(1)');
      Object.defineProperty(anchor.getAttributeNode('href'), 'value', {
        configurable: true,
        value: 'https://example.test/safe',
      });
      return svgWith(anchor);
    }],
  ])('rejects renderer-owned WebIDL shadowed SVG output: %s', async (_label, makeSvg) => {
    const renderEffect = vi.fn(async (_runtime, input) => ({
      status: 'rendered' as const,
      requestId: input.requestId,
      svg: makeSvg(),
    })) as XnlRichDocumentMermaidRenderEffect<object>;
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'UNSAFE_MERMAID_RENDER_OUTPUT', request.requestId);
    expect(fixture.host.status).toBe('ready');
  });

  it('fails closed for an unknown render status even when it carries a safe SVG', async () => {
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'malformed-status',
      requestId,
      svg: svgWith(),
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it.each([
    ['rendered', (requestId: string) => ({
      status: 'rendered',
      requestId,
      svg: svgWith(),
      writer: {},
    })],
    ['rejected', (requestId: string) => ({
      status: 'rejected',
      requestId,
      diagnostics: [renderRejectedDiagnostic(requestId)],
      writer: {},
    })],
  ])('fails closed for an exact-shape violation on %s results', async (_label, makeResult) => {
    const renderEffect = untrustedRenderEffect(makeResult);
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('does not read own or prototype accessors while rejecting malformed results', async () => {
    let ownAccessorReads = 0;
    const ownAccessorEffect = untrustedRenderEffect(() => {
      const result = { status: 'rendered', svg: svgWith() } as Record<string, unknown>;
      Object.defineProperty(result, 'requestId', {
        enumerable: true,
        get: () => {
          ownAccessorReads += 1;
          return 'mermaid.lifecycle:1';
        },
      });
      return result;
    });
    const ownAccessorFixture = createFixture(ownAccessorEffect);

    await flush();

    const ownAccessorRequest = firstRequest(ownAccessorEffect as ReturnType<typeof vi.fn>);
    expect(ownAccessorReads).toBe(0);
    expect(ownAccessorFixture.container.childElementCount).toBe(0);
    expectDiagnostic(
      ownAccessorFixture,
      0,
      'INVALID_MERMAID_RENDER_RESULT',
      ownAccessorRequest.requestId,
    );

    let prototypeAccessorReads = 0;
    const prototypeAccessorEffect = untrustedRenderEffect((requestId) => {
      const prototype = Object.create(null, {
        status: {
          get: () => {
            prototypeAccessorReads += 1;
            return 'rendered';
          },
        },
      });
      return Object.assign(Object.create(prototype), { requestId, svg: svgWith() });
    });
    const prototypeAccessorFixture = createFixture(prototypeAccessorEffect);

    await flush();

    const prototypeRequest = firstRequest(prototypeAccessorEffect as ReturnType<typeof vi.fn>);
    expect(prototypeAccessorReads).toBe(0);
    expect(prototypeAccessorFixture.container.childElementCount).toBe(0);
    expectDiagnostic(
      prototypeAccessorFixture,
      0,
      'INVALID_MERMAID_RENDER_RESULT',
      prototypeRequest.requestId,
    );
  });

  it('rejects a rendered result whose svg is not an SVGSVGElement', async () => {
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'rendered',
      requestId,
      svg: document.createElement('div'),
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it.each([
    ['empty diagnostics', (_requestId: string) => []],
    ['non-array diagnostics', (requestId: string) => renderRejectedDiagnostic(requestId)],
    ['malformed diagnostic item', (_requestId: string) => [null]],
    ['diagnostic item with an extra own key', (requestId: string) => [{
      ...renderRejectedDiagnostic(requestId),
      writer: {},
    }]],
    ['diagnostic item with an unknown code', (requestId: string) => [{
      ...renderRejectedDiagnostic(requestId),
      code: 'UNKNOWN_MERMAID_DIAGNOSTIC',
    }]],
  ])('fails closed for rejected results with %s', async (_label, makeDiagnostics) => {
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'rejected',
      requestId,
      diagnostics: makeDiagnostics(requestId),
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('does not read a diagnostic item accessor while rejecting it', async () => {
    let accessorReads = 0;
    const renderEffect = untrustedRenderEffect((requestId) => {
      const diagnostic = {
        severity: 'error',
        code: 'MERMAID_RENDER_REJECTED',
        requestId,
      } as Record<string, unknown>;
      Object.defineProperty(diagnostic, 'message', {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          return 'hidden diagnostic message';
        },
      });
      return { status: 'rejected', requestId, diagnostics: [diagnostic] };
    });
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(accessorReads).toBe(0);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('does not read a diagnostics collection iterator accessor while rejecting it', async () => {
    let accessorReads = 0;
    const renderEffect = untrustedRenderEffect((requestId) => {
      const diagnostics = [renderRejectedDiagnostic(requestId)];
      Object.defineProperty(diagnostics, Symbol.iterator, {
        configurable: true,
        get: () => {
          accessorReads += 1;
          return Array.prototype[Symbol.iterator];
        },
      });
      return { status: 'rejected', requestId, diagnostics };
    });
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(accessorReads).toBe(0);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it.each([
    [
      'rendered branch then rejected descriptor',
      (requestId: string, statusReads: { count: number }) => new Proxy({
        status: 'rendered',
        requestId,
        svg: svgWith(),
      }, {
        ownKeys(target) {
          target.status = 'rejected';
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          if (key !== 'status') return Reflect.getOwnPropertyDescriptor(target, key);
          statusReads.count += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: target.status,
          };
        },
      }),
    ],
    [
      'rejected branch then rendered descriptor',
      (requestId: string, statusReads: { count: number }) => new Proxy({
        status: 'rejected',
        requestId,
        diagnostics: [renderRejectedDiagnostic(requestId)],
      }, {
        ownKeys(target) {
          target.status = 'rendered';
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          if (key !== 'status') return Reflect.getOwnPropertyDescriptor(target, key);
          statusReads.count += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: target.status,
          };
        },
      }),
    ],
  ])('fails closed for stateful Proxy status descriptor drift: %s', async (_label, makeResult) => {
    const statusReads = { count: 0 };
    const renderEffect = untrustedRenderEffect((requestId) => makeResult(requestId, statusReads));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(statusReads.count).toBe(1);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).toHaveBeenCalledTimes(1);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('fails closed when result key inspection traps instead of committing DOM', async () => {
    let ownKeysReads = 0;
    const renderEffect = untrustedRenderEffect((requestId) => new Proxy({
      status: 'rendered',
      requestId,
      svg: svgWith(),
    }, {
      ownKeys() {
        ownKeysReads += 1;
        throw new Error('unstable ownKeys');
      },
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(ownKeysReads).toBe(1);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('fails closed when diagnostics item descriptor inspection traps', async () => {
    let itemDescriptorReads = 0;
    const renderEffect = untrustedRenderEffect((requestId) => {
      const diagnostic = new Proxy(renderRejectedDiagnostic(requestId), {
        getOwnPropertyDescriptor(target, key: string | symbol) {
          itemDescriptorReads += 1;
          if (key === 'message') throw new Error(`unstable descriptor ${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      return { status: 'rejected', requestId, diagnostics: [diagnostic] };
    });
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(itemDescriptorReads).toBeGreaterThan(0);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('does not commit when result descriptor inspection synchronously disposes the host', async () => {
    let disposeHost: () => void = () => undefined;
    let descriptorReads = 0;
    const renderEffect = untrustedRenderEffect((requestId) => new Proxy({
      status: 'rendered',
      requestId,
      svg: svgWith(),
    }, {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1;
        disposeHost();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    }));
    const fixture = createFixture(renderEffect);
    disposeHost = fixture.host.dispose;

    await flush();

    expect(descriptorReads).toBeGreaterThan(0);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
  });

  it('does not report malformed output after result inspection synchronously disposes the host', async () => {
    let disposeHost: () => void = () => undefined;
    const renderEffect = untrustedRenderEffect((requestId) => new Proxy({
      status: 'malformed-status',
      requestId,
      svg: svgWith(),
    }, {
      getOwnPropertyDescriptor(target, key) {
        disposeHost();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    }));
    const fixture = createFixture(renderEffect);
    disposeHost = fixture.host.dispose;

    await flush();

    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
  });

  it('does not forward renderer diagnostics after their inspection disposes the host', async () => {
    let disposeHost: () => void = () => undefined;
    const renderEffect = untrustedRenderEffect((requestId) => {
      const diagnostic = new Proxy(renderRejectedDiagnostic(requestId), {
        getOwnPropertyDescriptor(target, key) {
          disposeHost();
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      return { status: 'rejected', requestId, diagnostics: [diagnostic] };
    });
    const fixture = createFixture(renderEffect);
    disposeHost = fixture.host.dispose;

    await flush();

    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
  });

  it('rechecks the live request immediately before committing the validated clone', async () => {
    let disposeHost: () => void = () => undefined;
    const nativeImportNode = document.importNode.bind(document);
    const importNode = vi.spyOn(document, 'importNode').mockImplementation(
      (node, options) => {
        disposeHost();
        return nativeImportNode(node, options);
      },
    );
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'rendered',
      requestId,
      svg: svgWith(),
    }));
    const fixture = createFixture(renderEffect);
    disposeHost = fixture.host.dispose;

    await flush();

    expect(importNode).toHaveBeenCalledTimes(1);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).not.toHaveBeenCalled();
  });

  it('does not forward a rejected diagnostic whose requestId is stale', async () => {
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'rejected',
      requestId,
      diagnostics: [renderRejectedDiagnostic(`${requestId}:stale`)],
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).toHaveBeenCalledTimes(1);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it.each([
    ['one mixed requestId', (requestId: string) => [
      renderRejectedDiagnostic(requestId),
      renderRejectedDiagnostic(`${requestId}:stale`),
    ]],
    ['multiple mixed requestIds', (requestId: string) => [
      renderRejectedDiagnostic(`${requestId}:stale-1`),
      renderRejectedDiagnostic(requestId),
      renderRejectedDiagnostic(`${requestId}:stale-2`),
    ]],
  ])('does not partially forward rejected diagnostics with %s', async (_label, makeDiagnostics) => {
    const renderEffect = untrustedRenderEffect((requestId) => ({
      status: 'rejected',
      requestId,
      diagnostics: makeDiagnostics(requestId),
    }));
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).toHaveBeenCalledTimes(1);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('does not forward diagnostics when the rejected result requestId is not live', async () => {
    const renderEffect = untrustedRenderEffect((requestId) => {
      const rejectedRequestId = `${requestId}:stale`;
      return {
        status: 'rejected',
        requestId: rejectedRequestId,
        diagnostics: [renderRejectedDiagnostic(rejectedRequestId)],
      };
    });
    const fixture = createFixture(renderEffect);

    await flush();

    const request = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expect(fixture.diagnosticEffect).toHaveBeenCalledTimes(1);
    expectDiagnostic(fixture, 0, 'INVALID_MERMAID_RENDER_RESULT', request.requestId);
  });

  it('rejects mismatched requestId and structured rejected results without committing DOM', async () => {
    const renderEffect = vi.fn(async (_runtime, input) => (
      input.source.includes('reject')
        ? {
            status: 'rejected' as const,
            requestId: input.requestId,
            diagnostics: [{
              severity: 'error' as const,
              code: 'MERMAID_RENDER_REJECTED' as const,
              message: 'renderer rejected source',
              requestId: input.requestId,
            }],
          }
        : {
            status: 'rendered' as const,
            requestId: `${input.requestId}:wrong`,
            svg: svgWith(),
          }
    )) as XnlRichDocumentMermaidRenderEffect<object>;
    const fixture = createFixture(renderEffect);
    await flush();
    const mismatchRequest = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 0, 'MERMAID_RENDER_RESULT_MISMATCH', mismatchRequest.requestId);

    fixture.editor.view.dispatch(fixture.editor.state.tr.setNodeMarkup(0, undefined, {
      ...fixture.editor.state.doc.firstChild?.attrs,
      source: 'graph TD; reject',
    }));
    await Promise.resolve();
    const rejectedRequest = (renderEffect as ReturnType<typeof vi.fn>).mock.calls[1][1] as Readonly<{
      requestId: string;
    }>;
    await flush();

    expect(fixture.container.childElementCount).toBe(0);
    expectDiagnostic(fixture, 1, 'MERMAID_RENDER_REJECTED', rejectedRequest.requestId);
    expect(fixture.host.status).toBe('ready');
  });

  it('commits only the newest live matching request and ignores stale results', async () => {
    const first = deferred<XnlRichDocumentMermaidRenderResult>();
    const second = deferred<XnlRichDocumentMermaidRenderResult>();
    let renderCalls = 0;
    const renderMock = vi.fn((_runtime, _input) => (
      ++renderCalls === 1 ? first.promise : second.promise
    ));
    const renderEffect = renderMock as unknown as XnlRichDocumentMermaidRenderEffect<object>;
    const { editor, container } = createFixture(renderEffect);
    await flush();
    const firstInput = firstRequest(renderEffect as ReturnType<typeof vi.fn>);

    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, {
      ...editor.state.doc.firstChild?.attrs,
      source: 'graph LR; B-->C',
    }));
    await Promise.resolve();
    const secondInput = (renderEffect as ReturnType<typeof vi.fn>).mock.calls[1][1] as Readonly<{
      source: string;
      requestId: string;
    }>;

    const staleSvg = svgWith();
    first.resolve({ status: 'rendered', requestId: firstInput.requestId, svg: staleSvg });
    await flush();
    expect(container.childElementCount).toBe(0);

    const liveSvg = svgWith();
    second.resolve({ status: 'rendered', requestId: secondInput.requestId, svg: liveSvg });
    await flush();
    expect(container.firstElementChild).not.toBe(liveSvg);
    expect(container.firstElementChild?.localName).toBe('svg');
    expect(container.childElementCount).toBe(1);
    liveSvg.appendChild(svgChild('script'));
    liveSvg.appendChild(svgChild('circle'));
    expect(container.firstElementChild?.children).toHaveLength(0);
  });

  it('prevents async DOM writes after NodeView destroy or host dispose', async () => {
    const pending: Deferred<XnlRichDocumentMermaidRenderResult>[] = [];
    const renderEffect = vi.fn((_runtime, _input) => {
      const item = deferred<XnlRichDocumentMermaidRenderResult>();
      pending.push(item);
      return item.promise;
    }) as unknown as XnlRichDocumentMermaidRenderEffect<object>;
    const destroyedCase = createFixture(renderEffect);
    await flush();
    const destroyedRequest = firstRequest(renderEffect as ReturnType<typeof vi.fn>);
    destroyedCase.editor.destroy();
    const destroyedSvg = svgWith();
    pending[0].resolve({
      status: 'rendered',
      requestId: destroyedRequest.requestId,
      svg: destroyedSvg,
    });
    await flush();
    expect(destroyedCase.container.childElementCount).toBe(0);

    const disposedCase = createFixture(renderEffect);
    await Promise.resolve();
    const disposedInput = (renderEffect as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as Readonly<{
      requestId: string;
    }>;
    disposedCase.host.dispose();
    const disposedSvg = svgWith();
    pending[1].resolve({
      status: 'rendered',
      requestId: disposedInput.requestId,
      svg: disposedSvg,
    });
    await flush();
    expect(disposedCase.container.childElementCount).toBe(0);
  });

  it('reports thrown and rejected renders through the diagnostic Effect without changing source truth', async () => {
    const renderEffect = vi.fn(async (_runtime, input) => {
      if (input.source.includes('throw')) throw new Error('render exploded');
      return {
        status: 'rejected' as const,
        requestId: input.requestId,
        diagnostics: [{
          severity: 'error' as const,
          code: 'MERMAID_RENDER_REJECTED' as const,
          message: 'structured renderer rejection',
          requestId: input.requestId,
        }] as const,
      };
    }) as unknown as XnlRichDocumentMermaidRenderEffect<object>;
    const fixture = createFixture(renderEffect);
    await flush();
    const rejectedRequest = firstRequest(renderEffect as ReturnType<typeof vi.fn>);

    expectDiagnostic(fixture, 0, 'MERMAID_RENDER_REJECTED', rejectedRequest.requestId);
    expect(fixture.editor.getJSON().content?.[0]?.attrs?.source).toBe('graph TD; A-->B');
    expect(fixture.sourceEditor.value).toBe('graph TD; A-->B');
    fixture.editor.view.dispatch(fixture.editor.state.tr.setNodeMarkup(0, undefined, {
      ...fixture.editor.state.doc.firstChild?.attrs,
      source: 'graph TD; throw',
    }));
    await Promise.resolve();
    const thrownRequest = (renderEffect as ReturnType<typeof vi.fn>).mock.calls[1][1] as Readonly<{
      requestId: string;
    }>;
    await flush();

    expectDiagnostic(fixture, 1, 'MERMAID_RENDER_FAILED', thrownRequest.requestId);
    expect(fixture.editor.getJSON().content?.[0]?.attrs?.source).toBe('graph TD; throw');
    expect(fixture.sourceEditor.value).toBe('graph TD; throw');
    expect(fixture.host.status).toBe('ready');
  });

  it('reports synchronous render throws and swallows diagnostic sink failures', async () => {
    const syncThrowRender = vi.fn(() => {
      throw new Error('sync render exploded');
    }) as unknown as XnlRichDocumentMermaidRenderEffect<object>;
    const throwingDiagnostic = vi.fn(() => {
      throw new Error('diagnostic sink exploded');
    }) as unknown as XnlRichDocumentMermaidDiagnosticEffect<object>;
    const syncFixture = createFixture(syncThrowRender, { diagnosticEffect: throwingDiagnostic });

    await flush();

    const syncRequest = firstRequest(syncThrowRender as ReturnType<typeof vi.fn>);
    expect(syncFixture.container.childElementCount).toBe(0);
    expectDiagnostic(syncFixture, 0, 'MERMAID_RENDER_FAILED', syncRequest.requestId);

    const rejectedDiagnostic = (
      vi.fn(() => Promise.reject(new Error('diagnostic sink rejected'))) as unknown
    );
    const rejectedDiagnosticEffect = (
      rejectedDiagnostic as XnlRichDocumentMermaidDiagnosticEffect<object>
    );
    const unsafeRender = vi.fn(async (_runtime, input) => ({
      status: 'rendered' as const,
      requestId: input.requestId,
      svg: svgWith(svgChild('script')),
    })) as XnlRichDocumentMermaidRenderEffect<object>;
    const rejectedFixture = createFixture(unsafeRender, {
      diagnosticEffect: rejectedDiagnosticEffect,
    });

    await flush();

    const unsafeRequest = firstRequest(unsafeRender as ReturnType<typeof vi.fn>);
    expect(rejectedFixture.container.childElementCount).toBe(0);
    expectDiagnostic(rejectedFixture, 0, 'UNSAFE_MERMAID_RENDER_OUTPUT', unsafeRequest.requestId);
  });

  it('source editor dispatches a Tiptap transaction normalized as Mermaid source Interaction', () => {
    let captured: Transaction | undefined;
    const renderEffect = vi.fn(async (_runtime, input) => ({
      status: 'rendered' as const,
      requestId: input.requestId,
      svg: svgWith(),
    })) as XnlRichDocumentMermaidRenderEffect<object>;
    const { editor, sourceEditor } = createFixture(renderEffect);
    const originalDispatch = editor.view.dispatch.bind(editor.view);
    vi.spyOn(editor.view, 'dispatch').mockImplementation((transaction) => {
      captured = transaction;
      originalDispatch(transaction);
    });

    sourceEditor.value = 'graph LR; C-->D';
    sourceEditor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

    expect(captured).toBeInstanceOf(Transaction);
    expect(editor.getJSON().content?.[0]?.attrs?.source).toBe('graph LR; C-->D');
    expect(normalizeTiptapTransaction(EMPTY, { transaction: captured! }, CONFIG)).toMatchObject({
      status: 'normalized',
      intent: {
        kind: 'interaction',
        proposal: {
          type: 'xnl.rich-document.edit',
          payload: {
            edits: [{
              kind: 'mermaid-source',
              nodeId: 'mermaid.lifecycle',
              before: 'graph TD; A-->B',
              after: 'graph LR; C-->D',
            }],
          },
        },
      },
    });
  });
});
