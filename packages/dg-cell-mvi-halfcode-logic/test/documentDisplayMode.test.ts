import { describe, expect, it } from 'vitest';
import {
  allowDocumentDisplayModePolicy,
  createDocumentDisplayModeState,
  projectDocumentDisplayMode,
  reduceDocumentDisplayMode,
  registerDocumentDisplayModeOccurrence,
  unregisterDocumentDisplayModeOccurrence,
} from '../src';

const ref = { unitInstanceId: 'doc-1', projectionRole: 'component-embed', xId: 'counter-1' } as const;
const runtime = {};
const config = {};

describe('document display mode', () => {
  it('derives inherited and overridden occurrence modes without persisting inherit', async () => {
    const initial = createDocumentDisplayModeState('doc-1', 'edit');
    const registered = registerDocumentDisplayModeOccurrence(initial, ref, 'lease-1');
    expect(registered.ok).toBe(true);
    expect(await projectDocumentDisplayMode(registered.state, { kind: 'occurrence', ref }, runtime, config, allowDocumentDisplayModePolicy)).toMatchObject({ overlay: 'inherit', effectiveMode: 'edit' });

    const viewed = await reduceDocumentDisplayMode(registered.state, { type: 'set-overlay', correlationId: 'c1', ref, lease: 'lease-1', mode: 'view' }, runtime, config, allowDocumentDisplayModePolicy);
    expect(viewed.ok).toBe(true);
    expect(viewed.projection).toMatchObject({ overlay: 'view', effectiveMode: 'view' });

    const inherited = await reduceDocumentDisplayMode(viewed.state, { type: 'clear-overlay', correlationId: 'c2', ref, lease: 'lease-1' }, runtime, config, allowDocumentDisplayModePolicy);
    expect(inherited.state.occurrences[0]).not.toHaveProperty('overlay');
  });

  it('rejects stale leases atomically and unregister removes overlays', async () => {
    const registered = registerDocumentDisplayModeOccurrence(createDocumentDisplayModeState('doc-1', 'edit'), ref, 'lease-1');
    const before = registered.state;
    const stale = await reduceDocumentDisplayMode(before, { type: 'set-overlay', correlationId: 'c3', ref, lease: 'old', mode: 'view' }, runtime, config, allowDocumentDisplayModePolicy);
    expect(stale).toMatchObject({ ok: false, changed: false, state: before });
    expect(stale.diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_STALE_LEASE');

    const removed = unregisterDocumentDisplayModeOccurrence(before, ref, 'lease-1');
    expect(removed.ok).toBe(true);
    expect(removed.state.occurrences).toEqual([]);
  });

  it('fails closed when policy is absent or inconsistent', async () => {
    const state = createDocumentDisplayModeState('doc-1', 'edit');
    expect(await projectDocumentDisplayMode(state, { kind: 'document', unitInstanceId: 'doc-1' }, runtime, config)).toMatchObject({ effectiveMode: 'view', canSwitch: false });
    const inconsistent = () => ({ allowed: true, allowedModes: ['view'] as const });
    const result = await reduceDocumentDisplayMode(state, { type: 'set-base', correlationId: 'c4', mode: 'edit' }, runtime, config, inconsistent);
    expect(result.diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_POLICY_INCONSISTENT');
    expect(result.state).toBe(state);
  });

  it('fails closed for unknown targets and exact-copies caller-owned identities', async () => {
    const state = createDocumentDisplayModeState('doc-1', 'edit');
    const hostile = { ...ref, authoring: () => undefined } as typeof ref;
    const registered = registerDocumentDisplayModeOccurrence(state, hostile, 'lease-1');
    expect(registered.state.occurrences[0]!.ref).toEqual(ref);
    expect('authoring' in registered.state.occurrences[0]!.ref).toBe(false);
    const unknown = await projectDocumentDisplayMode(state, { kind: 'occurrence', ref }, runtime, config, allowDocumentDisplayModePolicy);
    expect(unknown).toMatchObject({ valid: false, effectiveMode: 'view', canSwitch: false });
    expect(unknown.diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_UNKNOWN_TARGET');
    const malformed = await projectDocumentDisplayMode(state, null as never, runtime, config, allowDocumentDisplayModePolicy);
    expect(malformed.diagnostics[0].code).toBe('DOCUMENT_DISPLAY_MODE_INVALID_TARGET');
    expect(malformed.effectiveMode).toBe('view');
  });

  it('supports asynchronous policy and evaluates a transition only once', async () => {
    let calls = 0;
    const policy = async () => {
      calls += 1;
      return { allowed: true, allowedModes: ['view', 'edit'] as const };
    };
    const state = createDocumentDisplayModeState('doc-1', 'view');
    const result = await reduceDocumentDisplayMode(state, { type: 'set-base', correlationId: 'c5', mode: 'edit' }, runtime, config, policy);
    expect(result).toMatchObject({ ok: true, changed: true, projection: { effectiveMode: 'edit' } });
    expect(calls).toBe(1);
  });

  it('strips target and policy authority-shaped extra fields from projections', async () => {
    const hostileRef = { ...ref, renderer: { mount: () => undefined } } as typeof ref;
    const registered = registerDocumentDisplayModeOccurrence(createDocumentDisplayModeState('doc-1', 'view'), hostileRef, 'lease-1');
    const result = await projectDocumentDisplayMode(
      registered.state,
      { kind: 'occurrence', ref: hostileRef } as never,
      runtime,
      config,
      () => ({ allowed: true, allowedModes: ['view', 'edit'], acl: { admin: true } } as never),
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect('renderer' in (result.target.kind === 'occurrence' ? result.target.ref : {})).toBe(false);
    expect('acl' in result).toBe(false);
  });
});
