/**
 * createServerEventSource — the four-layer server-event intake, isomorphic to the backend pipeline:
 *
 *   raw payload (lexical) → normalize/validate (syntactic) → route to AppEvent per slice (semantic)
 *   → slice store dispatch (projection)
 *
 * The actorTeam-specific `coalesce` / `advanceFrameBuffer` / `isStreaming` helpers are
 * **injected options** (with no-op defaults), so this is reusable across slices. Built on a depa
 * `AppendOnlyEventLog` hot stream + xstream operators; `connect()` bridges a
 * depa backend stream (createSSEStream / createWebSocketStream) into the intake.
 */
import { AppendOnlyEventLog } from 'depa-data-graph-core';
import type { StopHandle, TimelineEntry } from 'depa-data-graph-core';

export interface ServerEnvelope<TPayload = any> {
  type: string;
  payload: TPayload;
}

export interface FrameScheduler {
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export interface FrameBufferResult<TPayload = any> {
  nextQueue: TPayload[];
  immediate: TPayload[];
}

export interface ServerEventSourceOptions {
  /** `{ 'server.x': (envelope) => store.dispatch(...) }`. */
  routeTable?: Record<string, (envelope: ServerEnvelope) => void>;
  /** raw payload → envelope (or null to drop). Default maps `{ kind }` → `server.<camelCase(kind)>`. */
  normalize?: (raw: any) => ServerEnvelope | null;
  /** Per-frame coalescing of buffered payloads. Default: identity. */
  coalesce?: (payloads: any[]) => any[];
  /** Decide buffer vs immediate routing for one payload. Default: everything immediate. */
  advanceFrameBuffer?: (queue: any[], payload: any) => FrameBufferResult;
  /** Streaming side-channel detector. Default: never. */
  isStreamingPayload?: (payload: any) => boolean;
  onStreamingEvent?: (payload: any) => void;
  scheduler?: FrameScheduler;
  onError?: (error: unknown) => void;
  onDroppedPayload?: (payload: any) => void;
}

export interface ServerEventSource {
  push(raw: any): void;
  /** Pipe a depa backend stream (SSE/WebSocket/Fetch) into this intake. Returns an unsubscribe. */
  connect(stream: { subscribe(o: { next: (v: any) => void; error?: (e: any) => void; complete?: () => void }): { unsubscribe(): void } }): StopHandle;
  drain(): void;
  dispose(): void;
}

function defaultOnDroppedPayload(payload: any): void {
  console.warn('serverEventSource dropped an unroutable server payload:', payload);
}

function camelizeServerEventKind(kind: string): string {
  return String(kind || '').replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** Default normalize: `{ kind, ... }` → `{ type: 'server.<camelCase(kind)>', payload: raw }`. */
export function normalizeServerEventPayload(raw: any): ServerEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').trim();
  if (!kind) return null;
  return { type: `server.${camelizeServerEventKind(kind)}`, payload: raw };
}

export function createAnimationFrameScheduler(): FrameScheduler {
  return {
    schedule(callback: () => void) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return { kind: 'raf', id: window.requestAnimationFrame(callback) };
      }
      return { kind: 'timeout', id: setTimeout(callback, 16) };
    },
    cancel(handle: any) {
      if (!handle) return;
      if (handle.kind === 'raf') {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(handle.id);
        }
        return;
      }
      clearTimeout(handle.id);
    },
  };
}

const everythingImmediate = (queue: any[], payload: any): FrameBufferResult => ({
  nextQueue: queue,
  immediate: [payload],
});

export function createServerEventSource(options: ServerEventSourceOptions = {}): ServerEventSource {
  const {
    routeTable = {},
    normalize = normalizeServerEventPayload,
    coalesce = (payloads: any[]) => payloads,
    advanceFrameBuffer = everythingImmediate,
    isStreamingPayload = () => false,
    onStreamingEvent = () => {},
    scheduler = createAnimationFrameScheduler(),
    onError = console.error,
    onDroppedPayload = defaultOnDroppedPayload,
  } = options;

  let disposed = false;
  let queuedPayloads: any[] = [];
  let pendingFrameHandle: unknown = null;
  const envelopeByPayload = new WeakMap<object, ServerEnvelope>();
  const connections = new Set<{ unsubscribe(): void }>();

  const log = new AppendOnlyEventLog<any>();

  function cancelPendingFrame(): void {
    if (pendingFrameHandle === null) return;
    scheduler.cancel(pendingFrameHandle);
    pendingFrameHandle = null;
  }

  function ensureFrameScheduled(): void {
    if (pendingFrameHandle !== null || !queuedPayloads.length) return;
    pendingFrameHandle = scheduler.schedule(() => {
      pendingFrameHandle = null;
      flushQueuedPayloads();
    });
  }

  function flushQueuedPayloads(): void {
    cancelPendingFrame();
    if (!queuedPayloads.length) return;
    const batch = coalesce(queuedPayloads);
    queuedPayloads = [];
    for (const payload of batch) routePayload(payload);
  }

  function routePayload(payload: any): void {
    const envelope = payload && typeof payload === 'object' ? envelopeByPayload.get(payload) : undefined;
    if (!envelope) {
      onDroppedPayload(payload);
      return;
    }
    const handler = routeTable[envelope.type];
    if (typeof handler !== 'function') {
      onDroppedPayload(payload);
      return;
    }
    try {
      handler(envelope);
    } catch (error) {
      onError(error);
    }
  }

  function handleEnvelope(envelope: ServerEnvelope): void {
    if (envelope.payload && typeof envelope.payload === 'object') {
      envelopeByPayload.set(envelope.payload, envelope);
    }
    if (isStreamingPayload(envelope.payload)) {
      onStreamingEvent(envelope.payload);
    }
    const { nextQueue, immediate } = advanceFrameBuffer(queuedPayloads, envelope.payload);
    queuedPayloads = nextQueue;
    if (immediate.length) {
      cancelPendingFrame();
      for (const payload of immediate) routePayload(payload);
      return;
    }
    ensureFrameScheduled();
  }

  const subscription = log
    .stream({ replay: false })
    .map((entry: TimelineEntry<any>) => {
      const envelope = normalize(entry.value);
      if (!envelope) {
        onDroppedPayload(entry.value);
        return null;
      }
      return envelope;
    })
    .filter((envelope): envelope is ServerEnvelope => Boolean(envelope))
    .subscribe({
      next: handleEnvelope,
      error: onError,
      complete() {},
    });

  return {
    push(raw: any) {
      if (disposed) {
        onDroppedPayload(raw);
        return;
      }
      log.append(raw);
    },
    connect(stream) {
      if (disposed) return () => {};
      const sub = stream.subscribe({
        next: (raw: any) => {
          if (!disposed) log.append(raw);
        },
        error: onError,
        complete: () => {},
      });
      connections.add(sub);
      return () => {
        connections.delete(sub);
        sub.unsubscribe();
      };
    },
    drain() {
      flushQueuedPayloads();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPendingFrame();
      queuedPayloads = [];
      for (const sub of connections) sub.unsubscribe();
      connections.clear();
      subscription?.unsubscribe?.();
    },
  };
}
