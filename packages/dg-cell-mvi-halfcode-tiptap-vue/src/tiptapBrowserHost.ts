import {
  prepareXnlRichDocumentHalfcodeNodeViewCapability,
} from './halfcodeNodeViewHost';
import {
  prepareXnlRichDocumentMermaidNodeViewCapability,
} from './mermaidNodeViewHost';
import { createXnlRichDocumentTiptapHostExtensions } from './internalTiptapExtensionRegistry';
import type {
  XnlRichDocumentHalfcodeNodeViewHostRuntime,
  XnlRichDocumentMermaidNodeViewRuntime,
  XnlRichDocumentTiptapBrowserHostConfig,
  XnlRichDocumentTiptapBrowserHostDiagnostic,
  XnlRichDocumentTiptapBrowserHostInput,
  XnlRichDocumentTiptapBrowserHostResult,
  XnlRichDocumentTiptapBrowserHostRuntime,
} from './types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

export function createXnlRichDocumentTiptapBrowserHost<
  TView extends object,
  THost extends object,
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
>(
  runtime: XnlRichDocumentTiptapBrowserHostRuntime<
    TView,
    THost,
    TRenderRuntime,
    TDiagnosticRuntime
  >,
  input: XnlRichDocumentTiptapBrowserHostInput,
  config: XnlRichDocumentTiptapBrowserHostConfig,
): XnlRichDocumentTiptapBrowserHostResult {
  type HalfcodeRuntime = THost & XnlRichDocumentHalfcodeNodeViewHostRuntime<TView, THost>;
  type MermaidRuntime = XnlRichDocumentMermaidNodeViewRuntime<
    TRenderRuntime,
    TDiagnosticRuntime
  >;

  const outer = readExactDataCarrier(runtime, ['halfcode', 'mermaid']);
  if (!outer.ok) return rejected('INVALID_TIPTAP_BROWSER_HOST_RUNTIME', outer.message);

  const halfcode = prepareXnlRichDocumentHalfcodeNodeViewCapability(
    outer.value.halfcode as HalfcodeRuntime,
    input,
    EMPTY,
  );
  if (halfcode.status !== 'ready') return halfcode;

  const mermaid = prepareXnlRichDocumentMermaidNodeViewCapability(
    outer.value.mermaid as MermaidRuntime,
    EMPTY,
    config,
  );
  if (mermaid.status !== 'ready') {
    halfcode.dispose();
    return mermaid;
  }

  let extensions;
  try {
    extensions = createXnlRichDocumentTiptapHostExtensions({
      mermaid: mermaid.nodeView,
      componentEmbed: halfcode.nodeViews.componentEmbed,
      capsuleEmbed: halfcode.nodeViews.capsuleEmbed,
    });
  } catch {
    halfcode.dispose();
    mermaid.dispose();
    return rejected(
      'TIPTAP_BROWSER_HOST_ASSEMBLY_FAILED',
      'The canonical Tiptap browser extension registry could not be assembled.',
    );
  }

  let disposed = false;
  return Object.freeze({
    status: 'ready' as const,
    extensions,
    readDiagnostics: halfcode.readDiagnostics,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      halfcode.dispose();
      mermaid.dispose();
    },
  });
}

function readExactDataCarrier(
  value: unknown,
  keys: readonly string[],
): ReadResult<Record<string, unknown>> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return { ok: false, message: 'Tiptap browser host runtime must be an object or function.' };
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length
      || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
    ) {
      return {
        ok: false,
        message: `Tiptap browser host runtime must contain only ${keys.join(', ')}.`,
      };
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        return {
          ok: false,
          message: `Tiptap browser host runtime.${key} must be an own data property.`,
        };
      }
      result[key] = descriptor.value;
    }
    return { ok: true, value: result };
  } catch {
    return { ok: false, message: 'Tiptap browser host runtime could not be inspected safely.' };
  }
}

function rejected(
  code: XnlRichDocumentTiptapBrowserHostDiagnostic['code'],
  message: string,
): XnlRichDocumentTiptapBrowserHostResult {
  const diagnostic: XnlRichDocumentTiptapBrowserHostDiagnostic = Object.freeze({
    severity: 'error',
    code,
    message,
  });
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [
      XnlRichDocumentTiptapBrowserHostDiagnostic,
    ],
  });
}

type ReadResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; message: string }>;
