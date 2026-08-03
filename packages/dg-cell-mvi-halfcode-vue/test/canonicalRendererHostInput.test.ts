import { createApp, defineComponent, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CapsuleNodePlan,
  HalfcodeRef,
  RenderNodePlan,
  UnitFqn,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';
import type { HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import {
  CanonicalHalfcodeRenderer,
  type CanonicalComponentRegistry,
} from '../src';
import { CanonicalHalfcodeHostPresenterResolutionError } from '../src/canonicalRenderer';

const mounted: Array<ReturnType<typeof createApp>> = [];

afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function runtime(plan: UnitRenderPlan, configProps: Record<string, unknown>): HalfcodeAppRuntime {
  return {
    bundle: {} as never,
    plans: {
      renderPlans: [plan],
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
    resolveConfig: () => configProps,
    dispatchCommand: async () => ({ diagnostics: [] }),
    dispose: vi.fn(),
  };
}

function probeNode(): RenderNodePlan {
  return {
    id: 'probe',
    kind: 'atom',
    tag: 'HostInputProbe',
    propsBinding: 'config://#forged' as HalfcodeRef,
    inlineProps: {
      view: { title: 'inline-forged' },
      snapshot: { source: 'inline-forged' },
      instanceRef: { xId: 'inline-forged' },
      emitEditIntent: 'inline-forged',
    },
  };
}

describe('canonical renderer host-input projection', () => {
  it.each([
    ['unit root', () => [probeNode()]],
    ['inline Capsule root', () => [{
      id: 'inline-capsule',
      kind: 'capsule',
      children: [probeNode()],
    } satisfies CapsuleNodePlan]],
  ])('keeps host capabilities authoritative through a %s', async (_label, root) => {
    const trusted = {
      view: Object.freeze({ title: 'trusted' }),
      snapshot: Object.freeze({ source: 'trusted' }),
      instanceRef: Object.freeze({ xId: 'trusted' }),
      emitEditIntent: vi.fn(),
    };
    const observed: Record<string, unknown>[] = [];
    const Probe = defineComponent({
      name: 'HostInputProbe',
      props: ['view', 'snapshot', 'instanceRef', 'emitEditIntent'],
      setup(props) {
        return () => {
          observed.push({
            view: props.view,
            snapshot: props.snapshot,
            instanceRef: props.instanceRef,
            emitEditIntent: props.emitEditIntent,
          });
          return h('output', { 'data-testid': 'host-input-probe' }, String((props.view as any).title));
        };
      },
    });
    const plan: UnitRenderPlan = {
      id: 'host-input-owner',
      unitFqn: 'dg.docs.HostInputOwner' as UnitFqn,
      unitKind: 'document',
      root: root(),
    };
    const canonicalRegistry: CanonicalComponentRegistry = {
      resolve: (identity) => identity === 'HostInputProbe' ? Probe : undefined,
    };
    const target = document.body.appendChild(document.createElement('div'));
    const app = createApp(CanonicalHalfcodeRenderer, {
      plan,
      runtime: runtime(plan, {
        view: { title: 'config-forged' },
        snapshot: { source: 'config-forged' },
        instanceRef: { xId: 'config-forged' },
        emitEditIntent: 'config-forged',
      }),
      registry: canonicalRegistry,
      hostProps: trusted,
      hostPresenterIdentity: 'HostInputProbe',
    });
    mounted.push(app);

    app.mount(target);
    await nextTick();

    expect(target.querySelector('[data-testid="host-input-probe"]')?.textContent).toBe('trusted');
    expect(observed.at(-1)).toEqual(trusted);
  });

  it('routes strict host input through nested Capsules to only the first content root', async () => {
    const trusted = {
      view: Object.freeze({ title: 'trusted' }),
      snapshot: Object.freeze({ source: 'trusted' }),
      instanceRef: Object.freeze({ xId: 'trusted' }),
      emitEditIntent: vi.fn(),
    };
    const observed: string[] = [];
    const Probe = defineComponent({
      props: ['view'],
      setup: (props) => () => {
        observed.push((props.view as any)?.title ?? 'none');
        return h('output', String((props.view as any)?.title ?? 'none'));
      },
    });
    const plan: UnitRenderPlan = {
      id: 'nested-capsule-owner',
      unitFqn: 'dg.docs.NestedCapsuleOwner' as UnitFqn,
      unitKind: 'document',
      root: [{
        id: 'outer',
        kind: 'capsule',
        slots: [
          { id: 'empty', children: [] },
          { id: 'content', children: [{
            id: 'inner',
            kind: 'capsule',
            children: [probeNode(), { ...probeNode(), id: 'sibling' }],
          }] },
        ],
      }],
    };
    const target = document.body.appendChild(document.createElement('div'));
    const app = createApp(CanonicalHalfcodeRenderer, {
      plan,
      runtime: runtime(plan, {}),
      registry: { resolve: (identity: unknown) => identity === 'HostInputProbe' ? Probe : undefined },
      hostProps: trusted,
      hostPresenterIdentity: 'HostInputProbe',
    });
    mounted.push(app);
    app.mount(target);
    await nextTick();
    expect(observed).toEqual(['trusted', 'inline-forged']);
  });

  it.each([
    ['empty Capsule', [{ id: 'empty', kind: 'capsule' } satisfies CapsuleNodePlan]],
    ['wrong first sibling', [{
      id: 'outer',
      kind: 'capsule',
      children: [{ id: 'wrong', kind: 'atom', tag: 'WrongProbe' }, probeNode()],
    } satisfies CapsuleNodePlan]],
  ])('fails closed instead of losing strict host input through an %s', (_label, root) => {
    const plan: UnitRenderPlan = {
      id: 'invalid-host-path',
      unitFqn: 'dg.docs.InvalidHostPath' as UnitFqn,
      unitKind: 'document',
      root,
    };
    const target = document.body.appendChild(document.createElement('div'));
    const app = createApp(CanonicalHalfcodeRenderer, {
      plan,
      runtime: runtime(plan, {}),
      registry: { resolve: () => undefined },
      hostProps: { view: {}, snapshot: {}, instanceRef: {}, emitEditIntent: vi.fn() },
      hostPresenterIdentity: 'HostInputProbe',
    });
    mounted.push(app);
    let failure: unknown;
    app.config.errorHandler = (error) => {
      failure = error;
    };
    app.mount(target);
    expect(failure).toBeInstanceOf(CanonicalHalfcodeHostPresenterResolutionError);
    expect(target.querySelector('wrongprobe')).toBeNull();
    expect(target.querySelector('hostinputprobe')).toBeNull();
  });
});
