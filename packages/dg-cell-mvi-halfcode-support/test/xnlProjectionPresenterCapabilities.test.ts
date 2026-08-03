import { describe, expect, it } from 'vitest';
import {
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterMethodGrant,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type XnlProjectionSerializableValue,
} from '../src';
import {
  captureXnlProjectionPresenterProtocolGrants,
  registerOwnedXnlProjectionPresenterFacet,
  resolveOwnedXnlProjectionPresenterFacet,
  resolveOwnedXnlProjectionPresenterProtocol,
} from '../src/xnl-projection/presenterCapabilityOwnership';

const EMPTY = Object.freeze({});

describe('XNL Projection Presenter positive grants', () => {
  it('creates frozen support-owned grants and an owned protocol from package-root factories', () => {
    type Host = {
      title: string;
      read(): XnlProjectionSerializableValue;
    };
    type View = {
      title: string;
      read(): XnlProjectionSerializableValue;
    };
    const title = createXnlProjectionPresenterSnapshotGrant<Host, View, 'title', 'title'>(
      EMPTY,
      { id: 'presenter.grant.title', sourceKey: 'title', facadeKey: 'title' },
      EMPTY,
    );
    const read = createXnlProjectionPresenterMethodGrant<Host, View, 'read', 'read'>(
      EMPTY,
      { id: 'presenter.grant.read', sourceKey: 'read', facadeKey: 'read' },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.owned', grants: [title, read] },
      EMPTY,
    );

    expect(Object.isFrozen(title)).toBe(true);
    expect(Object.isFrozen(read)).toBe(true);
    expect(Object.isFrozen(protocol)).toBe(true);
    expect(Object.isFrozen(protocol.grants)).toBe(true);
    expect(Reflect.ownKeys(title).sort()).toEqual([
      'facadeKey',
      'id',
      'kind',
      'sourceKey',
    ]);
    expect(Reflect.ownKeys(protocol).sort()).toEqual(['grants', 'id']);
    expect(resolveOwnedXnlProjectionPresenterProtocol(protocol)).toMatchObject({
      ok: true,
      record: { id: 'presenter.protocol.owned' },
    });
  });

  it('rejects forged, copied, duplicate, and already-owned grants', () => {
    type Host = { title: string };
    type View = { title: string };
    const grant = createXnlProjectionPresenterSnapshotGrant<Host, View, 'title', 'title'>(
      EMPTY,
      { id: 'presenter.grant.title', sourceKey: 'title', facadeKey: 'title' },
      EMPTY,
    );
    const forged = Object.freeze({ ...grant });

    expect(() => createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.forged', grants: [forged as typeof grant] },
      EMPTY,
    )).toThrow(/owned|grant/i);
    expect(() => createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.duplicate', grants: [grant, grant] },
      EMPTY,
    )).toThrow(/duplicate/i);

    createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.first-owner', grants: [grant] },
      EMPTY,
    );
    expect(() => createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.second-owner', grants: [grant] },
      EMPTY,
    )).toThrow(/owner|owned/i);
  });

  it('captures only explicit grants without enumerating unrelated source fields', () => {
    let unrelatedReads = 0;
    const source: {
      title: XnlProjectionSerializableValue;
      writer: string;
      valueHost: object;
      renamedEffectCapability(): void;
    } = {
      title: { label: 'plain serializable data', nested: ['safe'] },
      writer: 'ungranted field name',
      valueHost: { opaque: true },
      renamedEffectCapability: () => undefined,
    };
    Object.defineProperty(source, 'ungrantedAccessor', {
      enumerable: true,
      get() {
        unrelatedReads += 1;
        throw new Error('must not execute');
      },
    });
    const proxiedSource = new Proxy(source, {
      ownKeys() {
        throw new Error('source fields must not be scanned');
      },
    });
    type View = { summary: XnlProjectionSerializableValue };
    const grant = createXnlProjectionPresenterSnapshotGrant<
      typeof source,
      View,
      'title',
      'summary'
    >(
      EMPTY,
      { id: 'presenter.grant.snapshot', sourceKey: 'title', facadeKey: 'summary' },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<typeof source, View>(
      EMPTY,
      { id: 'presenter.protocol.positive-only', grants: [grant] },
      EMPTY,
    );

    const capture = captureXnlProjectionPresenterProtocolGrants(proxiedSource, protocol);

    expect(capture).toMatchObject({
      ok: true,
      captures: [{ kind: 'snapshot', facadeKey: 'summary' }],
    });
    if (!capture.ok || capture.captures[0]?.kind !== 'snapshot') {
      throw new Error('Expected one snapshot capture.');
    }
    expect(capture.captures[0].value).toEqual(source.title);
    expect(capture.captures[0].value).not.toBe(source.title);
    expect(Object.isFrozen(capture.captures[0].value)).toBe(true);
    expect(unrelatedReads).toBe(0);
  });

  it('captures only data-function descriptors and binds the discovered owner stably', () => {
    class Source {
      #prefix = 'owner';

      read(suffix: string): string {
        return `${this.#prefix}:${suffix}`;
      }
    }
    const source = new Source();
    type View = { readBound(suffix: string): string };
    const grant = createXnlProjectionPresenterMethodGrant<
      Source,
      View,
      'read',
      'readBound'
    >(
      EMPTY,
      { id: 'presenter.grant.read', sourceKey: 'read', facadeKey: 'readBound' },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<Source, View>(
      EMPTY,
      { id: 'presenter.protocol.bound-method', grants: [grant] },
      EMPTY,
    );

    const capture = captureXnlProjectionPresenterProtocolGrants(source, protocol);
    expect(capture).toMatchObject({
      ok: true,
      captures: [{ kind: 'method', facadeKey: 'readBound' }],
    });
    if (!capture.ok || capture.captures[0]?.kind !== 'method') {
      throw new Error('Expected one method capture.');
    }
    const bound = capture.captures[0].value as (suffix: string) => string;
    Source.prototype.read = () => 'replacement';
    expect(bound('value')).toBe('owner:value');
  });

  it('constructs an exact null-prototype facade that later source changes cannot expand', () => {
    interface Source {
      title: { label: string; nested: string[] };
      prefix: string;
      read(): XnlProjectionSerializableValue;
      addedLater?: () => void;
    }
    const prototype = {
      read(this: Source) {
        return { value: `${this.prefix}:original` };
      },
    };
    const source = Object.assign(Object.create(prototype) as Source, {
      title: { label: 'Document', nested: ['stable'] },
      prefix: 'owner',
    });
    type View = { summary: Source['title']; readPreview(): XnlProjectionSerializableValue };
    const title = createXnlProjectionPresenterSnapshotGrant<Source, View, 'title', 'summary'>(
      EMPTY,
      { id: 'presenter.grant.exact-title', sourceKey: 'title', facadeKey: 'summary' },
      EMPTY,
    );
    const read = createXnlProjectionPresenterMethodGrant<Source, View, 'read', 'readPreview'>(
      EMPTY,
      { id: 'presenter.grant.exact-read', sourceKey: 'read', facadeKey: 'readPreview' },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<
      Source,
      View
    >(
      EMPTY,
      { id: 'presenter.protocol.exact-facade', grants: [title, read] },
      EMPTY,
    );

    const facet = createXnlProjectionPresenterRuntimeFacet(
      { source, protocol },
      EMPTY,
      EMPTY,
    );
    const snapshot = facet.view.summary;

    expect(Object.getPrototypeOf(facet.view)).toBeNull();
    expect(Object.isFrozen(facet)).toBe(true);
    expect(Object.isFrozen(facet.view)).toBe(true);
    expect(Reflect.ownKeys(facet).sort()).toEqual(['protocolId', 'view']);
    expect(Reflect.ownKeys(facet.view).sort()).toEqual(['readPreview', 'summary']);
    expect(resolveOwnedXnlProjectionPresenterFacet(facet)).toMatchObject({
      protocol,
      protocolId: protocol.id,
      facade: facet.view,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);

    source.title.nested.push('source mutation');
    source.addedLater = () => undefined;
    prototype.read = () => ({ value: 'replacement' });

    expect(snapshot.nested).toEqual(['stable']);
    expect(Reflect.ownKeys(facet.view).sort()).toEqual(['readPreview', 'summary']);
    expect(facet.view.readPreview()).toEqual({ value: 'owner:original' });

    const otherFacet = createXnlProjectionPresenterRuntimeFacet(
      { source, protocol },
      EMPTY,
      EMPTY,
    );
    const mismatchedFacet = Object.freeze({
      protocolId: protocol.id,
      view: facet.view,
    });
    expect(() => registerOwnedXnlProjectionPresenterFacet(
      mismatchedFacet,
      protocol,
      otherFacet.view,
    )).toThrow(/owner record|match/i);
    expect(resolveOwnedXnlProjectionPresenterFacet(mismatchedFacet)).toBeUndefined();
  });

  it('fails closed for accessor targets and descriptor/prototype reflection failures', () => {
    let getterReads = 0;
    const accessorSource = {};
    Object.defineProperty(accessorSource, 'read', {
      get() {
        getterReads += 1;
        throw new Error('getter must not execute');
      },
    });
    type Host = Record<'read', () => XnlProjectionSerializableValue>;
    type View = Record<'read', () => XnlProjectionSerializableValue>;
    const grant = createXnlProjectionPresenterMethodGrant<Host, View, 'read', 'read'>(
      EMPTY,
      { id: 'presenter.grant.accessor', sourceKey: 'read', facadeKey: 'read' },
      EMPTY,
    );
    const protocol = createXnlProjectionPresenterCapabilityProtocol<Host, View>(
      EMPTY,
      { id: 'presenter.protocol.accessor', grants: [grant] },
      EMPTY,
    );

    const accessorCapture = captureXnlProjectionPresenterProtocolGrants(
      accessorSource as Host,
      protocol,
    );
    expect(accessorCapture).toMatchObject({
      ok: false,
      diagnostic: { code: 'INVALID_XNL_PROJECTION_PRESENTER_GRANT' },
    });
    expect(getterReads).toBe(0);

    const descriptorFailure = captureXnlProjectionPresenterProtocolGrants(
      new Proxy({ read() {} }, {
        getOwnPropertyDescriptor() {
          throw new Error('descriptor trap failure');
        },
      }) as Host,
      protocol,
    );
    expect(descriptorFailure).toMatchObject({
      ok: false,
      diagnostic: { code: 'INVALID_XNL_PROJECTION_PRESENTER_GRANT' },
    });

    const prototypeFailure = captureXnlProjectionPresenterProtocolGrants(
      new Proxy({}, {
        getPrototypeOf() {
          throw new Error('prototype trap failure');
        },
      }) as Host,
      protocol,
    );
    expect(prototypeFailure).toMatchObject({
      ok: false,
      diagnostic: { code: 'INVALID_XNL_PROJECTION_PRESENTER_GRANT' },
    });
  });
});
