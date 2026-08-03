import { describe, expect, it, vi } from 'vitest';
import {
  type XnlProjectionPresenterEditIntent,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type XnlProjectionPresenterRuntimeFacet,
} from 'dg-cell-mvi-halfcode-support/xnl-projection-presenter';
import {
  createXnlRichDocumentEmbeddedPresenterCapability,
  type XnlRichDocumentEmbeddedPresenterEditPort,
  type XnlRichDocumentEmbeddedPresenterEditPortInput,
  type XnlRichDocumentEmbeddedPresenterEditResult,
  type XnlRichDocumentEmbeddedPresenterHostRuntime,
} from '../src';

const EMPTY = Object.freeze({});
const INSTANCE_REF = Object.freeze({
  unitInstanceId: 'document-1',
  projectionRole: 'primary',
  xId: 'embedded-1',
});
const INTENT: XnlProjectionPresenterEditIntent = Object.freeze({
  kind: 'interaction',
  proposal: Object.freeze({
    type: 'xnl.rich-document.edit',
    target: Object.freeze({ planNodeId: 'xnlp:node:embedded-1' }),
    payload: Object.freeze({ action: 'activate' }),
  }),
});
const COMMAND_INTENT: XnlProjectionPresenterEditIntent = Object.freeze({
  kind: 'command',
  proposal: Object.freeze({
    type: 'document.activate',
    target: Object.freeze({ path: Object.freeze(['documents', 'embedded-1']) }),
    payload: Object.freeze({ action: 'activate' }),
  }),
});

type PresenterView = Readonly<{
  title: string;
}>;

function presenterFacet(): XnlProjectionPresenterRuntimeFacet<PresenterView> {
  type Source = { title: string; secret: string };
  const source: Source = { title: 'Embedded title', secret: 'host-only' };
  const grant = createXnlProjectionPresenterSnapshotGrant<
    Source,
    PresenterView,
    'title',
    'title'
  >(
    EMPTY,
    {
      id: 'presenter.grant.embedded-title',
      sourceKey: 'title',
      facadeKey: 'title',
    },
    EMPTY,
  );
  const protocol = createXnlProjectionPresenterCapabilityProtocol<Source, PresenterView>(
    EMPTY,
    {
      id: 'presenter.protocol.embedded-title',
      grants: [grant],
    },
    EMPTY,
  );
  return createXnlProjectionPresenterRuntimeFacet<Source, PresenterView>(
    { source, protocol },
    EMPTY,
    EMPTY,
  );
}

class PrototypeHost implements XnlRichDocumentEmbeddedPresenterHostRuntime<PresenterView, PrototypeHost> {
  readonly presenterFacet = presenterFacet();
  readonly calls: XnlProjectionPresenterEditIntent[] = [];
  readonly submit = () => {
    throw new Error('host authoring authority must never be exposed');
  };

  editIntentPort(
    runtime: PrototypeHost,
    input: XnlRichDocumentEmbeddedPresenterEditPortInput,
    config: Readonly<Record<PropertyKey, never>>,
  ): XnlRichDocumentEmbeddedPresenterEditResult {
    expect(runtime).toBe(this);
    expect(Object.keys(input)).toEqual(['intent']);
    expect(Object.keys(config)).toEqual([]);
    this.calls.push(input.intent);
    return { status: 'emitted' };
  }
}

function createCapability(runtime: PrototypeHost) {
  return createXnlRichDocumentEmbeddedPresenterCapability(
    runtime,
    {
      phase: 'mount',
      instanceRef: INSTANCE_REF,
      snapshot: {
        kind: 'component-embed',
        input: { label: 'Open' },
      },
    },
    EMPTY,
  );
}

describe('restricted Halfcode embedded Presenter capability', () => {
  it('projects a facet-proven view into an exact four-key immutable public input', () => {
    const host = new PrototypeHost();
    const snapshot = {
      kind: 'component-embed',
      input: { label: 'Open' },
    };
    const result = createXnlRichDocumentEmbeddedPresenterCapability(
      host,
      { phase: 'mount', instanceRef: INSTANCE_REF, snapshot },
      EMPTY,
    );

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.phase).toBe('mount');
    expect(Object.keys(result.embeddedInput)).toEqual([
      'view',
      'snapshot',
      'instanceRef',
      'emitEditIntent',
    ]);
    expect(result.embeddedInput.view).toBe(host.presenterFacet.view);
    expect(result.embeddedInput.view).toEqual({ title: 'Embedded title' });
    expect(result.embeddedInput.snapshot).toEqual(snapshot);
    expect(result.embeddedInput.snapshot).not.toBe(snapshot);
    expect(result.embeddedInput.instanceRef).toEqual(INSTANCE_REF);
    expect(result.embeddedInput.instanceRef).not.toBe(INSTANCE_REF);
    expect(Object.isFrozen(result.embeddedInput)).toBe(true);
    expect(Object.isFrozen(result.embeddedInput.snapshot)).toBe(true);
    expect(Object.isFrozen(result.embeddedInput.snapshot.input)).toBe(true);
    expect(Object.isFrozen(result.embeddedInput.instanceRef)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.embeddedInput.snapshot))).toEqual(snapshot);
    for (const forbidden of [
      'scope',
      'ast',
      'valueHost',
      'translator',
      'authoringSession',
      'vfs',
      'vcs',
      'writer',
      'registry',
      'registryToken',
      'ownerToken',
      'unregister',
      'state',
      'submit',
      'baseLiveRevision',
      'identityAllocator',
    ]) {
      expect(forbidden in result.embeddedInput, forbidden).toBe(false);
    }
  });

  it('preserves a class/prototype host while forwarding only edit intent data', async () => {
    const host = new PrototypeHost();
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const emitted = await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      { intent: INTENT },
      EMPTY,
    );

    expect(emitted).toEqual({ status: 'emitted' });
    expect(host.calls).toEqual([INTENT]);
    expect(host.calls[0]).not.toBe(INTENT);
    expect(Object.isFrozen(host.calls[0])).toBe(true);
  });

  it('accepts canonical command intent data through the existing command contract path', async () => {
    const host = new PrototypeHost();
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      { intent: COMMAND_INTENT },
      EMPTY,
    )).toEqual({ status: 'emitted' });
    expect(host.calls).toEqual([COMMAND_INTENT]);
    expect(host.calls[0]).not.toBe(COMMAND_INTENT);
  });

  it.each([
    ['interaction type', {
      kind: 'interaction',
      proposal: { type: 'bad type', target: { planNodeId: 'xnlp:node:embedded-1' } },
    }],
    ['interaction id', {
      kind: 'interaction',
      proposal: {
        id: 'bad id',
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:embedded-1' },
      },
    }],
    ['interaction plan node id', {
      kind: 'interaction',
      proposal: { type: 'xnl.rich-document.edit', target: { planNodeId: 'bad id' } },
    }],
    ['interaction domain ref', {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: {
          planNodeId: 'xnlp:node:embedded-1',
          domain: { path: ['documents'], nodeId: 'bad id' },
        },
      },
    }],
    ['interaction path', {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:embedded-1', path: ['content', {}] },
      },
    }],
    ['command type', {
      kind: 'command',
      proposal: { type: 'bad type', target: { path: ['documents'] } },
    }],
    ['command domain ref without path', {
      kind: 'command',
      proposal: { type: 'document.activate', target: { nodeId: 'embedded-1' } },
    }],
    ['command domain ref path', {
      kind: 'command',
      proposal: { type: 'document.activate', target: { path: ['documents', true] } },
    }],
    ['command domain ref stable id', {
      kind: 'command',
      proposal: {
        type: 'document.activate',
        target: { path: ['documents'], sourceRef: 'bad ref' },
      },
    }],
    ['translator authority', {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:embedded-1' },
        translator: 'must-not-cross',
      },
    }],
    ['submit authority', {
      kind: 'command',
      proposal: {
        type: 'document.activate',
        target: { path: ['documents'] },
        submit: 'must-not-cross',
      },
    }],
    ['revision authority', {
      kind: 'interaction',
      proposal: {
        type: 'xnl.rich-document.edit',
        target: { planNodeId: 'xnlp:node:embedded-1' },
        baseLiveRevision: 'revision-7',
      },
    }],
  ])('rejects malformed canonical %s data before the host edit port', async (_label, intent) => {
    const host = new PrototypeHost();
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const editResult = await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      { intent: intent as never },
      EMPTY,
    );

    expect(editResult.status).toBe('rejected');
    expect(host.calls).toEqual([]);
  });

  it('rejects an unknown host diagnostic code instead of widening the public result', async () => {
    const host = new PrototypeHost();
    Object.defineProperty(host, 'editIntentPort', {
      configurable: true,
      value: () => ({
        status: 'rejected',
        diagnostics: [{
          severity: 'error',
          code: 'UNKNOWN_EMBEDDED_DIAGNOSTIC',
          message: 'must not cross the boundary',
        }],
      }),
    });
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const editResult = await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      { intent: INTENT },
      EMPTY,
    );

    expect(editResult.status).toBe('rejected');
    if (editResult.status === 'rejected') {
      expect(editResult.diagnostics).toHaveLength(1);
      expect(editResult.diagnostics[0].code).toBe('EMBEDDED_PRESENTER_EDIT_PORT_REJECTED');
      expect(editResult.diagnostics[0].message).toMatch(/diagnostic is invalid/i);
    }
  });

  it('preserves explicit application mixin prototype capabilities', async () => {
    type MixinHost = XnlRichDocumentEmbeddedPresenterHostRuntime<PresenterView, MixinHost> & {
      readonly presenterFacet: XnlProjectionPresenterRuntimeFacet<PresenterView>;
      calls: XnlProjectionPresenterEditIntent[];
    };
    const mixin = {
      editIntentPort(
        runtime: MixinHost,
        input: XnlRichDocumentEmbeddedPresenterEditPortInput,
        config: Readonly<Record<PropertyKey, never>>,
      ): XnlRichDocumentEmbeddedPresenterEditResult {
        expect(runtime).toBe(this);
        expect(Object.keys(config)).toEqual([]);
        runtime.calls.push(input.intent);
        return { status: 'emitted' };
      },
    };
    const host = Object.assign(Object.create(mixin) as MixinHost, {
      presenterFacet: presenterFacet(),
      calls: [] as XnlProjectionPresenterEditIntent[],
    });
    const result = createXnlRichDocumentEmbeddedPresenterCapability(
      host,
      { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
      EMPTY,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect((await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      { intent: INTENT },
      EMPTY,
    )).status).toBe('emitted');
    expect(host.calls).toHaveLength(1);
  });

  it('rejects Object.prototype capability pollution before invoking it', () => {
    const previousFacet = Object.getOwnPropertyDescriptor(Object.prototype, 'presenterFacet');
    const previousPort = Object.getOwnPropertyDescriptor(Object.prototype, 'editIntentPort');
    let invoked = 0;
    try {
      Object.defineProperty(Object.prototype, 'presenterFacet', {
        configurable: true,
        value: presenterFacet(),
      });
      Object.defineProperty(Object.prototype, 'editIntentPort', {
        configurable: true,
        value: () => { invoked += 1; return { status: 'emitted' }; },
      });
      const result = createXnlRichDocumentEmbeddedPresenterCapability(
        {} as never,
        { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
        EMPTY,
      );
      expect(result.status).toBe('rejected');
      const ownFacetRuntime = Object.create(Object.prototype);
      Object.defineProperty(ownFacetRuntime, 'presenterFacet', {
        configurable: true,
        value: presenterFacet(),
      });
      const portPollution = createXnlRichDocumentEmbeddedPresenterCapability(
        ownFacetRuntime as never,
        { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
        EMPTY,
      );
      expect(portPollution.status).toBe('rejected');
      expect(invoked).toBe(0);
    } finally {
      if (previousFacet === undefined) delete (Object.prototype as Record<string, unknown>).presenterFacet;
      else Object.defineProperty(Object.prototype, 'presenterFacet', previousFacet);
      if (previousPort === undefined) delete (Object.prototype as Record<string, unknown>).editIntentPort;
      else Object.defineProperty(Object.prototype, 'editIntentPort', previousPort);
    }
  });

  it.each([
    ['Map', Map.prototype],
    ['URL', URL.prototype],
  ])('rejects %s platform prototype capability pollution', (_name, prototype) => {
    const previousFacet = Object.getOwnPropertyDescriptor(prototype, 'presenterFacet');
    const previousPort = Object.getOwnPropertyDescriptor(prototype, 'editIntentPort');
    let invoked = 0;
    try {
      Object.defineProperty(prototype, 'presenterFacet', {
        configurable: true,
        value: presenterFacet(),
      });
      Object.defineProperty(prototype, 'editIntentPort', {
        configurable: true,
        value: () => { invoked += 1; return { status: 'emitted' }; },
      });
      const runtime = Object.create(prototype);
      const result = createXnlRichDocumentEmbeddedPresenterCapability(
        runtime as never,
        { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
        EMPTY,
      );
      expect(result.status).toBe('rejected');
      expect(invoked).toBe(0);
    } finally {
      if (previousFacet === undefined) delete (prototype as unknown as Record<string, unknown>).presenterFacet;
      else Object.defineProperty(prototype, 'presenterFacet', previousFacet);
      if (previousPort === undefined) delete (prototype as unknown as Record<string, unknown>).editIntentPort;
      else Object.defineProperty(prototype, 'editIntentPort', previousPort);
    }
  });

  it('rejects capability pollution from a non-global platform prototype', () => {
    const iteratorPrototype = Object.getPrototypeOf(new Map()[Symbol.iterator]()) as object;
    const previousFacet = Object.getOwnPropertyDescriptor(iteratorPrototype, 'presenterFacet');
    const previousPort = Object.getOwnPropertyDescriptor(iteratorPrototype, 'editIntentPort');
    let invoked = 0;
    try {
      Object.defineProperty(iteratorPrototype, 'presenterFacet', {
        configurable: true,
        value: presenterFacet(),
      });
      Object.defineProperty(iteratorPrototype, 'editIntentPort', {
        configurable: true,
        value: () => { invoked += 1; return { status: 'emitted' }; },
      });
      const runtime = Object.create(iteratorPrototype);
      const result = createXnlRichDocumentEmbeddedPresenterCapability(
        runtime as never,
        { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
        EMPTY,
      );
      expect(result.status).toBe('rejected');
      expect(invoked).toBe(0);
    } finally {
      if (previousFacet === undefined) {
        delete (iteratorPrototype as unknown as Record<string, unknown>).presenterFacet;
      } else {
        Object.defineProperty(iteratorPrototype, 'presenterFacet', previousFacet);
      }
      if (previousPort === undefined) {
        delete (iteratorPrototype as unknown as Record<string, unknown>).editIntentPort;
      } else {
        Object.defineProperty(iteratorPrototype, 'editIntentPort', previousPort);
      }
    }
  });

  it('rejects cyclic and over-depth application prototype chains', () => {
    const facet = presenterFacet();
    let cycleProxy: object;
    cycleProxy = new Proxy({}, {
      getPrototypeOf: () => cycleProxy,
    });
    const cyclicRuntime = Object.assign(Object.create(cycleProxy), { presenterFacet: facet });
    const cyclic = createXnlRichDocumentEmbeddedPresenterCapability(
      cyclicRuntime as never,
      { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
      EMPTY,
    );
    expect(cyclic.status).toBe('rejected');
    if (cyclic.status === 'rejected') {
      expect(cyclic.diagnostics[0].message).toMatch(/cyclic prototype chain/i);
    }

    let prototype: object = {
      editIntentPort: () => ({ status: 'emitted' as const }),
    };
    for (let depth = 0; depth < 33; depth += 1) prototype = Object.create(prototype);
    const deepRuntime = Object.assign(Object.create(prototype), { presenterFacet: facet });
    const deep = createXnlRichDocumentEmbeddedPresenterCapability(
      deepRuntime as never,
      { phase: 'mount', instanceRef: INSTANCE_REF, snapshot: { kind: 'component-embed' } },
      EMPTY,
    );
    expect(deep.status).toBe('rejected');
    if (deep.status === 'rejected') {
      expect(deep.diagnostics[0].message).toMatch(/inspection limit/i);
    }
  });

  it('fails closed when the grant receives a view not proven by its captured facet', async () => {
    const host = new PrototypeHost();
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const rejected = await result.embeddedInput.emitEditIntent(
      { title: 'forged' },
      { intent: INTENT },
      EMPTY,
    );

    expect(rejected.status).toBe('rejected');
    expect(host.calls).toEqual([]);
  });

  it('contains thrown, malformed, accessor-backed, and revoked edit-port outcomes', async () => {
    for (const outcome of [
      () => { throw new Error('port failed'); },
      () => ({ status: 'emitted', submit: () => undefined }),
      () => {
        const value = {};
        Object.defineProperty(value, 'status', {
          get() {
            throw new Error('result getter must not run');
          },
        });
        return value;
      },
      () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        return proxy;
      },
    ]) {
      const host = new PrototypeHost();
      Object.defineProperty(host, 'editIntentPort', {
        configurable: true,
        value: outcome as unknown as XnlRichDocumentEmbeddedPresenterEditPort<PrototypeHost>,
      });
      const result = createCapability(host);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') continue;
      const editResult = await result.embeddedInput.emitEditIntent(
        result.embeddedInput.view,
        { intent: INTENT },
        EMPTY,
      );
      expect(editResult.status).toBe('rejected');
    }
  });

  it('rejects forged facets and malformed snapshots without executing accessors', () => {
    let accessorReads = 0;
    const snapshot = {};
    Object.defineProperty(snapshot, 'secret', {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error('snapshot getter must not run');
      },
    });
    const forgedHost = {
      presenterFacet: Object.freeze({
        protocolId: 'presenter.protocol.forged',
        view: Object.freeze({ title: 'forged' }),
      }) as XnlProjectionPresenterRuntimeFacet<PresenterView>,
      editIntentPort: vi.fn(),
    };

    expect(createXnlRichDocumentEmbeddedPresenterCapability(
      forgedHost,
      {
        phase: 'mount',
        instanceRef: INSTANCE_REF,
        snapshot: { kind: 'component-embed' },
      },
      EMPTY,
    ).status).toBe('rejected');
    const validHost = new PrototypeHost();
    const malformed = createXnlRichDocumentEmbeddedPresenterCapability(
      validHost,
      { phase: 'update', instanceRef: INSTANCE_REF, snapshot },
      EMPTY,
    );
    expect(malformed.status).toBe('rejected');
    const authoritySnapshot = createXnlRichDocumentEmbeddedPresenterCapability(
      validHost,
      {
        phase: 'update',
        instanceRef: INSTANCE_REF,
        snapshot: { kind: 'component-embed', writer: 'must-not-cross' } as never,
      },
      EMPTY,
    );
    expect(authoritySnapshot.status).toBe('rejected');
    expect(accessorReads).toBe(0);
  });

  it('fails closed for accessor-backed and revoked runtime/input values', () => {
    let runtimeAccessorReads = 0;
    const runtime = {};
    Object.defineProperty(runtime, 'presenterFacet', {
      get() {
        runtimeAccessorReads += 1;
        throw new Error('runtime getter must not run');
      },
    });
    Object.defineProperty(runtime, 'editIntentPort', {
      value: vi.fn(),
    });
    const { proxy: revokedRuntime, revoke: revokeRuntime } = Proxy.revocable({}, {});
    const { proxy: revokedInput, revoke: revokeInput } = Proxy.revocable({}, {});
    revokeRuntime();
    revokeInput();

    expect(createCapability(runtime as unknown as PrototypeHost).status)
      .toBe('rejected');
    expect(runtimeAccessorReads).toBe(0);
    expect(createCapability(revokedRuntime as unknown as PrototypeHost).status)
      .toBe('rejected');
    expect(createXnlRichDocumentEmbeddedPresenterCapability(
      new PrototypeHost(),
      revokedInput as never,
      EMPTY,
    ).status).toBe('rejected');
  });

  it('rejects malformed edit input without invoking getters or the host port', async () => {
    const host = new PrototypeHost();
    const result = createCapability(host);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    let accessorReads = 0;
    const malformed = {};
    Object.defineProperty(malformed, 'intent', {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error('intent getter must not run');
      },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect((await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      malformed as never,
      EMPTY,
    )).status).toBe('rejected');
    expect((await result.embeddedInput.emitEditIntent(
      result.embeddedInput.view,
      proxy as never,
      EMPTY,
    )).status).toBe('rejected');
    expect(accessorReads).toBe(0);
    expect(host.calls).toEqual([]);
  });
});
