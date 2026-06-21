import { describe, expect, it } from 'vitest';
import {
  validateEditorPlan,
  validateSchemaEditorCommand,
  type EditorCommandBinding,
  type EditorPlan,
} from '../src';

function withObjectPrototypeProperty<T>(property: string, value: unknown, run: () => T): T {
  Object.defineProperty(Object.prototype, property, { configurable: true, value });
  try {
    return run();
  } finally {
    Reflect.deleteProperty(Object.prototype, property);
  }
}

describe('schema-editor command template contract feedback', () => {
  it('proves concrete collection remove and move commands need fake pre-event indices today', () => {
    const eventSourcedRemove = validateSchemaEditorCommand({
      kind: 'collection.remove',
      target: ['items'],
      index: { source: 'event', path: ['index'] },
    });
    const eventSourcedMove = validateSchemaEditorCommand({
      kind: 'collection.move',
      target: ['items'],
      from: { source: 'event', path: ['fromIndex'] },
      to: { source: 'event', path: ['toIndex'] },
    });

    expect(eventSourcedRemove.ok).toBe(false);
    expect(eventSourcedRemove.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.index', code: 'INVALID_INDEX' }),
      ]),
    );
    expect(eventSourcedMove.ok).toBe(false);
    expect(eventSourcedMove.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.from', code: 'INVALID_INDEX' }),
        expect.objectContaining({ path: '$.to', code: 'INVALID_INDEX' }),
      ]),
    );

    const fakePreEventRemove = validateSchemaEditorCommand({
      kind: 'collection.remove',
      target: ['items'],
      index: 0,
    });
    const fakePreEventMove = validateSchemaEditorCommand({
      kind: 'collection.move',
      target: ['items'],
      from: 0,
      to: 1,
    });

    expect(fakePreEventRemove).toEqual({ ok: true, issues: [] });
    expect(fakePreEventMove).toEqual({ ok: true, issues: [] });
  });

  it('accepts the T1.2 neutral event/value/literal argument template shape without callbacks or host writers', () => {
    const commandBindings = [
      {
        event: 'item.insert',
        commandTemplate: {
          kind: 'collection.insert',
          target: { source: 'literal', value: ['items'] },
          arguments: {
            index: { source: 'event', path: ['index'] },
            value: { source: 'value', path: ['draftItem'] },
          },
        },
      },
      {
        event: 'item.remove',
        commandTemplate: {
          kind: 'collection.remove',
          target: { source: 'literal', value: ['items'] },
          arguments: {
            index: { source: 'event', path: ['index'] },
          },
        },
      },
      {
        event: 'item.move',
        commandTemplate: {
          kind: 'collection.move',
          target: { source: 'literal', value: ['items'] },
          arguments: {
            from: { source: 'event', path: ['fromIndex'] },
            to: { source: 'event', path: ['toIndex'] },
          },
        },
      },
      {
        event: 'title.commit',
        commandTemplate: {
          kind: 'value.set',
          target: { source: 'literal', value: ['title'] },
          arguments: {
            value: { source: 'event', path: ['value'] },
          },
        },
      },
      {
        event: 'status.select',
        commandTemplate: {
          kind: 'union.select',
          target: { source: 'literal', value: ['status'] },
          arguments: {
            alternativeId: { source: 'event', path: ['alternativeId'] },
            initialValue: { source: 'literal', value: { kind: 'draft' } },
          },
        },
      },
      {
        event: 'metadata.set',
        commandTemplate: {
          kind: 'map.set',
          target: { source: 'literal', value: ['metadata'] },
          arguments: {
            key: { source: 'event', path: ['key'] },
            value: { source: 'event', path: ['value'] },
          },
        },
      },
      {
        event: 'metadata.remove',
        commandTemplate: {
          kind: 'map.remove',
          target: { source: 'value', path: ['metadataPath'] },
          arguments: {
            key: { source: 'event', path: ['key'] },
          },
        },
      },
      {
        event: 'metadata.rename',
        commandTemplate: {
          kind: 'map.rename-key',
          target: { source: 'event', path: ['target'] },
          arguments: {
            from: { source: 'event', path: ['from'] },
            to: { source: 'event', path: ['to'] },
          },
        },
      },
    ] satisfies EditorCommandBinding[];
    const plan: EditorPlan = {
      kind: 'editor-plan',
      id: 'collection-template-contract',
      root: {
        kind: 'collection',
        id: 'items',
        path: ['items'],
        metadata: {
          display: { label: 'Items', visible: true, readOnly: false },
          identity: { strategy: 'ephemeral' },
        },
        itemTemplate: {
          kind: 'field',
          id: 'items.item',
          path: ['items', '*'],
          metadata: {
            display: { label: 'Item', visible: true, readOnly: false },
            scalar: { kind: 'string' },
          },
        },
        commandBindings,
      },
    };

    const result = validateEditorPlan(plan);

    expect(result).toEqual({ ok: true, issues: [] });
    expect(JSON.parse(JSON.stringify(commandBindings))).toEqual(commandBindings);
    expect(JSON.stringify(commandBindings)).not.toMatch(/callback|renderer|component|ValueHost|hostWriter|persist|function/i);
  });

  it('rejects legacy concrete bindings, unknown argument bags, and executable or host-owned fields', () => {
    const invalidBindings = [
      {
        event: 'legacy',
        command: { kind: 'value.set', target: ['title'], value: 'legacy' },
      },
      {
        event: 'unknown-argument',
        commandTemplate: {
          kind: 'collection.remove',
          target: { source: 'literal', value: ['items'] },
          arguments: {
            index: { source: 'event', path: ['index'] },
            callback: () => undefined,
          },
        },
      },
      {
        event: 'renderer-event-object',
        commandTemplate: {
          kind: 'value.set',
          target: { source: 'literal', value: ['title'] },
          arguments: { value: { source: 'event', path: ['value'], rendererEvent: new Event('input') } },
        },
      },
      {
        event: 'host-writer',
        commandTemplate: {
          kind: 'value.set',
          target: { source: 'literal', value: ['title'] },
          arguments: { value: { source: 'event', path: ['value'], hostWriter: 'forbidden' } },
        },
      },
      {
        event: 'effect',
        commandTemplate: {
          kind: 'value.set',
          target: { source: 'literal', value: ['title'] },
          arguments: { value: { source: 'effect', path: ['value'] } },
        },
      },
    ];

    for (const binding of invalidBindings) {
      const result = validateEditorPlan({
        kind: 'editor-plan',
        id: 'invalid-template-contract',
        root: {
          kind: 'field',
          id: 'title',
          path: ['title'],
          commandBindings: [binding],
        },
      });

      expect(result.ok).toBe(false);
    }
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects unsafe concrete and literal-template target segment %s',
    (segment) => {
      const concrete = validateSchemaEditorCommand({
        kind: 'value.set',
        target: ['records', segment, 'name'],
        value: 'Ada',
      });
      const template = validateEditorPlan({
        kind: 'editor-plan',
        id: 'unsafe-target-template',
        root: {
          kind: 'field',
          id: 'name',
          path: ['name'],
          commandBindings: [
            {
              event: 'name.commit',
              commandTemplate: {
                kind: 'value.set',
                target: { source: 'literal', value: ['records', segment, 'name'] },
                arguments: { value: { source: 'event', path: ['value'] } },
              },
            },
          ],
        },
      });

      expect(concrete).toEqual({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'UNSAFE_VALUE_PATH_SEGMENT', path: '$.target[1]' }),
        ]),
      });
      expect(template).toEqual({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'UNSAFE_VALUE_PATH_SEGMENT',
            path: '$.root.commandBindings[0].commandTemplate.target.value[1]',
          }),
        ]),
      });
    },
  );

  it('rejects inherited command and template payload fields under prototype pollution', () => {
    Object.defineProperties(Object.prototype, {
      value: {
        configurable: true,
        value: { source: 'literal', value: 'polluted' },
      },
      index: {
        configurable: true,
        value: { source: 'literal', value: 0 },
      },
    });

    try {
      const command = validateSchemaEditorCommand({
        kind: 'value.set',
        target: ['name'],
      });
      const template = validateEditorPlan({
        kind: 'editor-plan',
        id: 'inherited-template-payload',
        root: {
          kind: 'field',
          id: 'name',
          path: ['name'],
          commandBindings: [
            {
              event: 'name.commit',
              commandTemplate: {
                kind: 'value.set',
                target: { source: 'literal', value: ['name'] },
                arguments: {},
              },
            },
            {
              event: 'item.remove',
              commandTemplate: {
                kind: 'collection.remove',
                target: { source: 'literal', value: ['items'] },
                arguments: {},
              },
            },
          ],
        },
      });

      expect(command).toEqual({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'MISSING_COMMAND_PAYLOAD', path: '$.value' }),
        ]),
      });
      expect(template).toEqual({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'MISSING_COMMAND_ARGUMENT',
            path: '$.root.commandBindings[0].commandTemplate.arguments.value',
          }),
          expect.objectContaining({
            code: 'MISSING_COMMAND_ARGUMENT',
            path: '$.root.commandBindings[1].commandTemplate.arguments.index',
          }),
        ]),
      });
    } finally {
      Reflect.deleteProperty(Object.prototype, 'value');
      Reflect.deleteProperty(Object.prototype, 'index');
    }
  });

  it('requires every command, template, and binding field to be an own property', () => {
    const planWithBinding = (binding: Record<string, unknown>) => ({
      kind: 'editor-plan',
      id: 'own-property-command-fields',
      root: {
        kind: 'field',
        id: 'name',
        path: ['name'],
        commandBindings: [binding],
      },
    });
    const validTemplate = {
      kind: 'value.set',
      target: { source: 'literal', value: ['name'] },
      arguments: { value: { source: 'literal', value: 'Ada' } },
    };

    const cases = [
      {
        property: 'event',
        polluted: 'name.commit',
        result: () => validateEditorPlan(planWithBinding({ commandTemplate: validTemplate })),
        code: 'INVALID_COMMAND_EVENT',
      },
      {
        property: 'commandTemplate',
        polluted: validTemplate,
        result: () => validateEditorPlan(planWithBinding({ event: 'name.commit' })),
        code: 'INVALID_COMMAND_TEMPLATE',
      },
      {
        property: 'source',
        polluted: 'literal',
        result: () => validateEditorPlan(planWithBinding({
          event: 'name.commit',
          commandTemplate: { ...validTemplate, target: { value: ['name'] } },
        })),
        code: 'INVALID_COMMAND_ARGUMENT_SOURCE',
      },
      {
        property: 'path',
        polluted: ['value'],
        result: () => validateEditorPlan(planWithBinding({
          event: 'name.commit',
          commandTemplate: {
            ...validTemplate,
            arguments: { value: { source: 'event' } },
          },
        })),
        code: 'INVALID_VALUE_PATH',
      },
      {
        property: 'value',
        polluted: 'polluted',
        result: () => validateEditorPlan(planWithBinding({
          event: 'name.commit',
          commandTemplate: {
            ...validTemplate,
            arguments: { value: { source: 'literal' } },
          },
        })),
        code: 'MISSING_COMMAND_ARGUMENT_VALUE',
      },
      {
        property: 'kind',
        polluted: 'value.set',
        result: () => validateSchemaEditorCommand({ target: ['name'], value: 'Ada' }),
        code: 'UNKNOWN_COMMAND_KIND',
      },
      {
        property: 'target',
        polluted: ['name'],
        result: () => validateSchemaEditorCommand({ kind: 'value.set', value: 'Ada' }),
        code: 'MISSING_COMMAND_PAYLOAD',
      },
      {
        property: 'arguments',
        polluted: validTemplate.arguments,
        result: () => validateEditorPlan(planWithBinding({
          event: 'name.commit',
          commandTemplate: { kind: 'value.set', target: validTemplate.target },
        })),
        code: 'MISSING_COMMAND_ARGUMENTS',
      },
      {
        property: 'source',
        polluted: 'value',
        result: () => validateEditorPlan({
          kind: 'editor-plan',
          id: 'own-property-editor-binding',
          root: { kind: 'field', id: 'name', path: ['name'], value: {} },
        }),
        code: 'INVALID_BINDING_SOURCE',
      },
    ];

    for (const testCase of cases) {
      const result = withObjectPrototypeProperty(testCase.property, testCase.polluted, testCase.result);
      expect(result.ok, testCase.property).toBe(false);
      expect(result.issues, testCase.property).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: testCase.code })]),
      );
    }
  });

  it.each(['kind', 'target', 'value'] as const)(
    'rejects an own command %s accessor without executing it',
    (property) => {
      let reads = 0;
      const command: Record<string, unknown> = {
        kind: 'value.set',
        target: ['name'],
        value: 'Ada',
      };
      Object.defineProperty(command, property, {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          return property === 'kind' ? 'value.set' : property === 'target' ? ['name'] : 'Ada';
        },
      });

      const result = validateSchemaEditorCommand(command);

      expect(result.ok).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ACCESSOR_CONTRACT_FIELD', path: `$.${property}` }),
        ]),
      );
      expect(reads).toBe(0);
    },
  );

  it.each(['getPrototypeOf', 'getOwnPropertyDescriptor'] as const)(
    'returns a structured issue when a command Proxy throws from %s',
    (trap) => {
      const command = new Proxy(
        { kind: 'value.set', target: ['name'], value: 'Ada' },
        trap === 'getPrototypeOf'
          ? {
              getPrototypeOf() {
                throw new Error('prototype denied');
              },
            }
          : {
              getOwnPropertyDescriptor() {
                throw new Error('descriptor denied');
              },
            },
      );

      expect(() => validateSchemaEditorCommand(command)).not.toThrow();
      expect(validateSchemaEditorCommand(command)).toEqual({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'UNSAFE_CONTRACT_DESCRIPTOR', path: expect.any(String) }),
        ]),
      });
    },
  );
});
