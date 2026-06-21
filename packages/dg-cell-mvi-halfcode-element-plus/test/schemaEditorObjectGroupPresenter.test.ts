// @vitest-environment jsdom

import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  SchemaEditorPresenterEvent,
  SchemaEditorPresenterProps,
} from 'dg-cell-mvi-halfcode-vue';
import { ObjectGroupPresenter } from '../src/schema-editor/object/objectGroupPresenter';
import {
  readAllowedPresenterOptions,
  readSchemaEditorPresentationState,
} from '../src/schema-editor/shared/presentationShell';

const mountedApps: App[] = [];

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

function groupProps(
  overrides: Partial<SchemaEditorPresenterProps> = {},
): SchemaEditorPresenterProps {
  return {
    node: {
      kind: 'group',
      id: 'profile',
      path: ['profile'],
      metadata: {
        display: {
          label: 'Profile',
          description: 'Public profile fields',
          visible: true,
          readOnly: true,
        },
        field: {
          key: 'profile',
          required: true,
        },
      },
      presenter: { id: 'object.group' },
      children: [],
    },
    value: Object.freeze({ name: 'Accepted name' }),
    path: ['profile'],
    presenterOptions: undefined,
    pending: true,
    diagnostics: Object.freeze([
      Object.freeze({
        severity: 'error' as const,
        code: 'PROFILE_REJECTED',
        message: 'Profile changes were rejected',
      }),
      Object.freeze({
        severity: 'warning' as const,
        code: 'PROFILE_WARNING',
        message: 'Profile requires review',
      }),
    ]),
    eventContext: Object.freeze({ wildcardBindings: Object.freeze([]) }),
    onSchemaEditorEvent: (_event: SchemaEditorPresenterEvent) => {},
    ...overrides,
  };
}

function mountGroup(
  props: SchemaEditorPresenterProps,
  slotText = 'SLOT_OWNED_CHILD',
): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        ObjectGroupPresenter,
        props,
        {
          default: () => h(
            'span',
            { 'data-slot-owned-child': 'true' },
            slotText,
          ),
        },
      );
    },
  }));
  app.mount(target);
  mountedApps.push(app);
  return target;
}

describe('Element Plus Schema Editor object.group T2.1', () => {
  it('reads diagnostics through own data descriptors and fails closed on hostile arrays', () => {
    const validDiagnostics = Object.freeze([
      Object.freeze({
        severity: 'error' as const,
        code: 'VALID_DIAGNOSTIC',
        message: 'A valid frozen diagnostic',
      }),
    ]);
    const validState = readSchemaEditorPresentationState(
      groupProps({ diagnostics: validDiagnostics }),
    );
    expect(validState.diagnostics).toEqual(validDiagnostics);

    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    expect(() => readSchemaEditorPresentationState(groupProps({
      diagnostics: revoked.proxy as SchemaEditorPresenterProps['diagnostics'],
    }))).not.toThrow();
    expect(readSchemaEditorPresentationState(groupProps({
      diagnostics: revoked.proxy as SchemaEditorPresenterProps['diagnostics'],
    })).diagnostics).toEqual([]);

    let accessorReads = 0;
    const accessorDiagnostics: unknown[] = [];
    Object.defineProperty(accessorDiagnostics, '0', {
      enumerable: true,
      configurable: true,
      get() {
        accessorReads += 1;
        throw new Error('diagnostic array index accessor must not run');
      },
    });
    accessorDiagnostics.length = 1;
    expect(readSchemaEditorPresentationState(groupProps({
      diagnostics: accessorDiagnostics as SchemaEditorPresenterProps['diagnostics'],
    })).diagnostics).toEqual([]);
    expect(accessorReads).toBe(0);

    const sparseDiagnostics = new Array(1);
    expect(readSchemaEditorPresentationState(groupProps({
      diagnostics: sparseDiagnostics as SchemaEditorPresenterProps['diagnostics'],
    })).diagnostics).toEqual([]);

    for (const hostileKey of ['length', '0']) {
      const hostileDiagnostics = new Proxy([...validDiagnostics], {
        getOwnPropertyDescriptor(target, key) {
          if (key === hostileKey) {
            throw new Error(`hostile ${hostileKey} descriptor`);
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      expect(() => readSchemaEditorPresentationState(groupProps({
        diagnostics: hostileDiagnostics,
      }))).not.toThrow();
      expect(readSchemaEditorPresentationState(groupProps({
        diagnostics: hostileDiagnostics,
      })).diagnostics).toEqual([]);
    }
  });

  it('renders metadata and session state through a real Element Plus form shell', async () => {
    const target = mountGroup(groupProps({
      presenterOptions: Object.freeze({
        labelPosition: 'top',
        labelWidth: '12rem',
        size: 'small',
      }),
    }));
    await nextTick();

    const group = target.querySelector<HTMLElement>(
      '[data-schema-editor-presenter="object.group"]',
    );
    expect(group).not.toBeNull();
    expect(group!.getAttribute('aria-busy')).toBe('true');
    expect(group!.getAttribute('aria-readonly')).toBe('true');
    expect(target.querySelector('.el-form')).not.toBeNull();
    expect(target.querySelector('.el-form-item')).not.toBeNull();
    expect(target.querySelector('.el-form-item.is-required')).not.toBeNull();
    expect(target.textContent).toContain('Profile');
    expect(target.textContent).toContain('Public profile fields');
    expect(target.textContent).toContain('Pending');
    expect(target.textContent).toContain('Profile changes were rejected');
    expect(target.textContent).toContain('Profile requires review');
    expect(target.querySelectorAll('.el-alert')).toHaveLength(2);
    expect(target.querySelectorAll('[data-slot-owned-child]')).toHaveLength(1);
  });

  it('renders nothing when plan display metadata marks the group invisible', async () => {
    const props = groupProps();
    const target = mountGroup(groupProps({
      node: {
        ...props.node,
        metadata: {
          ...props.node.metadata,
          display: {
            label: 'Hidden profile',
            visible: false,
            readOnly: false,
          },
        },
      } as SchemaEditorPresenterProps['node'],
    }));
    await nextTick();

    expect(target.textContent).toBe('');
    expect(target.querySelector('.el-form')).toBeNull();
    expect(target.querySelector('[data-slot-owned-child]')).toBeNull();
  });

  it('reads only allowlisted own serializable options and ignores hostile values', () => {
    let accessorReads = 0;
    const hostile = Object.defineProperties(
      {
        labelPosition: 'left',
        labelWidth: 160,
        size: 'small',
        inline: true,
        showMessage: false,
        statusIcon: true,
        value: 'FORBIDDEN_VALUE',
        disabled: false,
        onSchemaEditorEvent() {},
        default() {},
        runtime: Object.freeze({ dispatch() {} }),
        nested: Object.freeze({ unsafe: true }),
      },
      {
        hideRequiredAsterisk: {
          enumerable: true,
          get() {
            accessorReads += 1;
            return true;
          },
        },
      },
    );

    expect(readAllowedPresenterOptions(hostile, [
      'labelPosition',
      'labelWidth',
      'size',
      'inline',
      'hideRequiredAsterisk',
      'showMessage',
      'statusIcon',
    ])).toEqual({
      labelPosition: 'left',
      labelWidth: 160,
      size: 'small',
      inline: true,
      showMessage: false,
      statusIcon: true,
    });
    expect(accessorReads).toBe(0);

    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => readAllowedPresenterOptions(
      revoked.proxy,
      ['labelPosition'],
    )).not.toThrow();
    expect(readAllowedPresenterOptions(
      revoked.proxy,
      ['labelPosition'],
    )).toEqual({});
  });

  it('uses the default slot as its only child source and never emits or mutates accepted data', async () => {
    let childReads = 0;
    const events: SchemaEditorPresenterEvent[] = [];
    const accepted = Object.freeze({ name: 'Accepted name' });
    const props = groupProps({
      value: accepted,
      pending: false,
      onSchemaEditorEvent(event) {
        events.push(event);
      },
    });
    const node = Object.defineProperty(
      { ...props.node },
      'children',
      {
        enumerable: true,
        get() {
          childReads += 1;
          throw new Error('object.group must not read children');
        },
      },
    ) as SchemaEditorPresenterProps['node'];

    const target = mountGroup({ ...props, node });
    await nextTick();

    expect(target.textContent).toContain('SLOT_OWNED_CHILD');
    expect(target.querySelectorAll('[data-slot-owned-child]')).toHaveLength(1);
    expect(childReads).toBe(0);
    expect(events).toEqual([]);
    expect(accepted).toEqual({ name: 'Accepted name' });
  });

  it('accepts only the Vue public presenter contract as component props', () => {
    expect(Object.keys(ObjectGroupPresenter.props ?? {}).sort()).toEqual([
      'diagnostics',
      'eventContext',
      'node',
      'onSchemaEditorEvent',
      'path',
      'pending',
      'presenterOptions',
      'value',
    ]);
  });
});
