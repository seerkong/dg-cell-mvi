import { describe, expect, it } from 'vitest';
import { appEventToMessage } from 'dg-cell-mvi-core';
import {
  HALFCODE_APP_BUNDLE_API_VERSION,
  asHalfcodeRef,
  asUnitFqn,
  createHalfcodeAppRuntime,
  resolveUnitConfigRef,
  type LoadedHalfcodeUnitBundle,
  type UnitDomainNodeSpec,
} from '../src';

function domainDocument(domain: string, tag: string, nodes: UnitDomainNodeSpec[]) {
  return {
    domain,
    path: `/test/${domain}.xnl`,
    tag,
    data: {},
    nodes,
    xnlDocument: {} as never,
  };
}

function messageBridgeBundle(): LoadedHalfcodeUnitBundle {
  const unitFqn = asUnitFqn('test.MessageBridgePage');
  const command = asHalfcodeRef('command://#users.search');
  const child = (id: string, policyId?: string) => ({
    kind: 'capsule' as const,
    id,
    scope: {
      kind: 'inline' as const,
      scope: {
        scopeId: `${id}-scope`,
        ...(policyId ? { messagePolicy: { id: policyId, default: 'bubble' as const } } : {}),
      },
    },
    children: [{ kind: 'instance' as const, tag: 'button', id: `${id}-button`, command }],
  });
  const unit = {
    fqn: unitFqn,
    kind: 'page' as const,
    form: 'folder' as const,
    path: '/test/message-bridge',
    manifest: { kind: 'page' as const, fqn: unitFqn, version: '1.0.0', domains: [] },
    domains: {
      commands: domainDocument('commands', 'Commands', [{
        tag: 'Command',
        id: 'users.search',
        data: {
          payloadDef: 'command-def://#users.search',
          handler: 'vfs://./handlers.ts#searchUsers',
        },
      }]),
    },
    elements: {
      id: 'message-bridge-elements',
      scope: {
        kind: 'inline' as const,
        scope: {
          scopeId: 'root-scope',
          commands: asHalfcodeRef('command://#message-bridge-commands'),
          messagePolicy: { id: 'root-policy', default: 'bubble' as const },
        },
      },
      children: [
        { kind: 'instance' as const, tag: 'button', id: 'root-button', command },
        child('child', 'child-policy'),
        child('sibling'),
      ],
    },
    scopeRuntimeBindings: [],
  };
  return {
    manifest: {
      id: 'message-bridge',
      apiVersion: HALFCODE_APP_BUNDLE_API_VERSION,
      domains: [],
      units: [],
    },
    manifestPath: '/test/bundle.xnl',
    app: { routes: [], wiring: [], domains: {} },
    units: { [unitFqn]: unit },
    registry: {},
    diagnostics: [],
  } as LoadedHalfcodeUnitBundle;
}

function renderConfigBundle(): LoadedHalfcodeUnitBundle {
  const unitFqn = asUnitFqn('test.ConfigPage');
  const unit = {
    fqn: unitFqn,
    kind: 'page' as const,
    form: 'folder' as const,
    path: '/test/config-page',
    manifest: { kind: 'page' as const, fqn: unitFqn, version: '1.0.0', domains: [] },
    domains: {
      config: domainDocument('config', 'Config', [{
        tag: 'Config',
        id: 'config-page',
        data: {},
        children: [{
          tag: 'ConfigEntry',
          id: 'title',
          data: {
            props: {
              text: 'resolved title',
              tone: 'warm',
            },
          },
        }],
      }]),
    },
    elements: {
      id: 'config-page-elements',
      children: [{
        kind: 'instance' as const,
        tag: 'h1',
        id: 'title',
        props: asHalfcodeRef('config://#title/props'),
      }],
    },
    scopeRuntimeBindings: [],
  };
  return {
    manifest: {
      id: 'render-config',
      apiVersion: HALFCODE_APP_BUNDLE_API_VERSION,
      domains: [],
      units: [],
    },
    manifestPath: '/test/bundle.xnl',
    app: { routes: [], wiring: [], domains: {} },
    units: { [unitFqn]: unit },
    registry: {},
    diagnostics: [],
  } as LoadedHalfcodeUnitBundle;
}

describe('HalfcodeAppRuntime canonical message bridge', () => {
  it('dispatches compiled Commands with payloadDef and nearest Scope MessagePolicy identity', async () => {
    const calls: unknown[] = [];
    const runtime = await createHalfcodeAppRuntime(messageBridgeBundle(), {
      resolveSymbol: () => (scopeRuntime: unknown, input: unknown, config: unknown) => {
        calls.push({ scopeRuntime, input, config });
        return input;
      },
    });

    const dispatch = (elementId: string) => runtime.dispatchCommand({
      unitFqn: 'test.MessageBridgePage',
      elementId,
      input: { elementId },
    });
    const root = await dispatch('root-button');
    const child = await dispatch('child-button');
    const sibling = await dispatch('sibling-button');

    expect(appEventToMessage(root.commandEvent!)).toEqual({
      kind: 'command',
      type: 'users.search',
      payload: { elementId: 'root-button' },
      payloadDef: 'command-def://#users.search',
      policy: 'root-policy',
    });
    expect(appEventToMessage(child.commandEvent!)).toEqual(expect.objectContaining({
      kind: 'command',
      policy: 'child-policy',
    }));
    expect(appEventToMessage(sibling.commandEvent!)).toEqual(expect.objectContaining({
      kind: 'command',
      policy: 'root-policy',
    }));
    expect(calls.map((call) => (call as { input: unknown }).input)).toEqual([
      { elementId: 'root-button' },
      { elementId: 'child-button' },
      { elementId: 'sibling-button' },
    ]);
  });

  it('pre-resolves render config bindings for synchronous lookup', async () => {
    const runtime = await createHalfcodeAppRuntime(renderConfigBundle(), {
      resolveSymbol: () => undefined,
      resolveConfig: (ref, context) => resolveUnitConfigRef(context.unit, ref),
    });

    expect(runtime.resolveConfig('test.ConfigPage', 'config://#title/props')).toEqual({
      text: 'resolved title',
      tone: 'warm',
    });
  });
});
