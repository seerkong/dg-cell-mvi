import { describe, expect, it } from 'vitest';
import {
  validateSchemaEditorCommand,
  type SchemaEditorCommand,
  type SchemaEditorCommandTemplate,
  type SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  resolveSchemaEditorCommand,
  type ResolveSchemaEditorCommandConfig,
  type ResolveSchemaEditorCommandInput,
  type ResolveSchemaEditorCommandResult,
  type SchemaEditorWildcardBinding,
} from '../src';

const EMPTY_CONFIG: ResolveSchemaEditorCommandConfig = Object.freeze({});

function resolve(
  input: ResolveSchemaEditorCommandInput,
  runtime: unknown = Object.freeze({}),
): ResolveSchemaEditorCommandResult {
  return resolveSchemaEditorCommand(runtime, input, EMPTY_CONFIG);
}

function expectResolved(
  result: ResolveSchemaEditorCommandResult,
  expected: SchemaEditorCommand,
): void {
  expect(result).toEqual({ ok: true, command: expected, diagnostics: [] });
  expect(validateSchemaEditorCommand(expected)).toEqual({ ok: true, issues: [] });
}

function expectRejected(
  result: ResolveSchemaEditorCommandResult,
  code: string,
): void {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('command');
  if (result.ok) return;
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        path: expect.any(String),
        message: expect.any(String),
      }),
    ]),
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function withObjectPrototypeProperty<T>(property: string, value: unknown, run: () => T): T {
  Object.defineProperty(Object.prototype, property, { configurable: true, value });
  try {
    return run();
  } finally {
    Reflect.deleteProperty(Object.prototype, property);
  }
}

describe('resolveSchemaEditorCommand T1.1 red contract', () => {
  it('is a public support Processor with exactly runtime, input, config parameters', () => {
    expect(
      resolveSchemaEditorCommand,
      'support must expose the command-template runtime API before resolver semantics can pass',
    ).toBeTypeOf('function');
    expect(resolveSchemaEditorCommand).toHaveLength(3);
  });

  it('resolves every command kind from event, value, and literal sources', () => {
    const cases: Array<{
      name: string;
      template: SchemaEditorCommandTemplate;
      event: SchemaEditorContractValue;
      snapshot: SchemaEditorContractValue;
      expected: SchemaEditorCommand;
    }> = [
      {
        name: 'value.set',
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['profile', 'name'] },
          arguments: { value: { source: 'event', path: ['payload', 'value'] } },
        },
        event: { payload: { value: 'Ada' } },
        snapshot: {},
        expected: { kind: 'value.set', target: ['profile', 'name'], value: 'Ada' },
      },
      {
        name: 'collection.insert',
        template: {
          kind: 'collection.insert',
          target: { source: 'value', path: ['paths', 'items'] },
          arguments: {
            index: { source: 'event', path: ['index'] },
            value: { source: 'literal', value: { id: 'item-2' } },
          },
        },
        event: { index: 1 },
        snapshot: { paths: { items: ['items'] } },
        expected: {
          kind: 'collection.insert',
          target: ['items'],
          index: 1,
          value: { id: 'item-2' },
        },
      },
      {
        name: 'collection.remove',
        template: {
          kind: 'collection.remove',
          target: { source: 'event', path: ['target'] },
          arguments: { index: { source: 'value', path: ['selection', 'index'] } },
        },
        event: { target: ['items'] },
        snapshot: { selection: { index: 2 } },
        expected: { kind: 'collection.remove', target: ['items'], index: 2 },
      },
      {
        name: 'collection.move',
        template: {
          kind: 'collection.move',
          target: { source: 'literal', value: ['items'] },
          arguments: {
            from: { source: 'event', path: ['from'] },
            to: { source: 'value', path: ['drop', 'index'] },
          },
        },
        event: { from: 3 },
        snapshot: { drop: { index: 1 } },
        expected: { kind: 'collection.move', target: ['items'], from: 3, to: 1 },
      },
      {
        name: 'map.set',
        template: {
          kind: 'map.set',
          target: { source: 'literal', value: ['metadata'] },
          arguments: {
            key: { source: 'event', path: ['key'] },
            value: { source: 'value', path: ['draftMetadata'] },
          },
        },
        event: { key: 'owner' },
        snapshot: { draftMetadata: { name: 'Ada' } },
        expected: {
          kind: 'map.set',
          target: ['metadata'],
          key: 'owner',
          value: { name: 'Ada' },
        },
      },
      {
        name: 'map.remove',
        template: {
          kind: 'map.remove',
          target: { source: 'value', path: ['metadataPath'] },
          arguments: { key: { source: 'literal', value: 'obsolete' } },
        },
        event: {},
        snapshot: { metadataPath: ['metadata'] },
        expected: { kind: 'map.remove', target: ['metadata'], key: 'obsolete' },
      },
      {
        name: 'map.rename-key',
        template: {
          kind: 'map.rename-key',
          target: { source: 'event', path: ['target'] },
          arguments: {
            from: { source: 'literal', value: 'oldName' },
            to: { source: 'value', path: ['renameTo'] },
          },
        },
        event: { target: ['metadata'] },
        snapshot: { renameTo: 'newName' },
        expected: {
          kind: 'map.rename-key',
          target: ['metadata'],
          from: 'oldName',
          to: 'newName',
        },
      },
      {
        name: 'union.select',
        template: {
          kind: 'union.select',
          target: { source: 'literal', value: ['status'] },
          arguments: {
            alternativeId: { source: 'event', path: ['alternativeId'] },
            initialValue: { source: 'literal', value: { kind: 'draft' } },
          },
        },
        event: { alternativeId: 'draft' },
        snapshot: {},
        expected: {
          kind: 'union.select',
          target: ['status'],
          alternativeId: 'draft',
          initialValue: { kind: 'draft' },
        },
      },
    ];

    for (const commandCase of cases) {
      const result = resolve({
        template: commandCase.template,
        event: commandCase.event,
        snapshot: commandCase.snapshot,
      });
      expectResolved(result, commandCase.expected);
    }
  });

  it('resolves every value binding from the same plain dispatch snapshot', () => {
    const snapshot = {
      movement: { target: ['items'], from: 1, to: 2 },
      ignoredLaterState: { target: ['changed'], from: 8, to: 9 },
    } satisfies SchemaEditorContractValue;
    const template: SchemaEditorCommandTemplate = {
      kind: 'collection.move',
      target: { source: 'value', path: ['movement', 'target'] },
      arguments: {
        from: { source: 'value', path: ['movement', 'from'] },
        to: { source: 'value', path: ['movement', 'to'] },
      },
    };

    const result = resolve({ template, event: {}, snapshot });

    expectResolved(result, {
      kind: 'collection.move',
      target: ['items'],
      from: 1,
      to: 2,
    });
  });

  it.each(['snapshot', 'event', 'literal'] as const)(
    'rejects a %s accessor without invoking it during clone or traversal',
    (sourceKind) => {
      let accessorReads = 0;
      const accessorValue = Object.defineProperty({}, 'secret', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return 'host-owned';
        },
      }) as SchemaEditorContractValue;
      const input: ResolveSchemaEditorCommandInput = {
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['safe'] },
          arguments: {
            value:
              sourceKind === 'literal'
                ? { source: 'literal', value: accessorValue }
                : { source: sourceKind === 'snapshot' ? 'value' : 'event', path: ['payload'] },
          },
        },
        event: sourceKind === 'event' ? { payload: accessorValue } : {},
        snapshot: sourceKind === 'snapshot' ? { payload: accessorValue } : {},
      };

      const result = resolve(input);

      expectRejected(result, 'UNSAFE_SOURCE_ACCESSOR');
      expect(accessorReads).toBe(0);
    },
  );

  it('looks up only array entries and own properties of plain or null-prototype objects', () => {
    const event = Object.assign(Object.create(null), {
      payload: { rows: [{ key: 'ignored' }, { key: 'owner', value: 'Ada' }] },
    }) as SchemaEditorContractValue;
    const template: SchemaEditorCommandTemplate = {
      kind: 'map.set',
      target: { source: 'value', path: ['targets', 0] },
      arguments: {
        key: { source: 'event', path: ['payload', 'rows', 1, 'key'] },
        value: { source: 'event', path: ['payload', 'rows', 1, 'value'] },
      },
    };

    const result = resolve({
      template,
      event,
      snapshot: { targets: [['metadata']] },
    });

    expectResolved(result, {
      kind: 'map.set',
      target: ['metadata'],
      key: 'owner',
      value: 'Ada',
    });
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects unsafe path segment %s before source traversal',
    (unsafeSegment) => {
      const result = resolve({
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['safe'] },
          arguments: { value: { source: 'event', path: [unsafeSegment] } },
        },
        event: {},
        snapshot: {},
      });

      expectRejected(result, 'UNSAFE_PATH_SEGMENT');
    },
  );

  it.each(
    ['literal', 'event', 'value'].flatMap((source) =>
      ['__proto__', 'prototype', 'constructor'].map((segment) => ({ source, segment })),
    ) as Array<{ source: 'literal' | 'event' | 'value'; segment: string }>,
  )('rejects $segment in a concrete $source command target', ({ source, segment }) => {
    const unsafeTarget = ['records', segment, 'name'];
    const result = resolve({
      template: {
        kind: 'value.set',
        target:
          source === 'literal'
            ? { source, value: unsafeTarget }
            : { source, path: ['target'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: source === 'event' ? { target: unsafeTarget } : {},
      snapshot: source === 'value' ? { target: unsafeTarget } : {},
    });

    expectRejected(result, 'UNSAFE_PATH_SEGMENT');
  });

  it('rejects inherited values and class instances instead of traversing prototypes', () => {
    class HostEvent {
      value = 'host-owned';
    }
    const sources = [Object.create({ value: 'inherited' }), new HostEvent()];

    for (const event of sources) {
      const result = resolve({
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['safe'] },
          arguments: { value: { source: 'event', path: ['value'] } },
        },
        event: event as SchemaEditorContractValue,
        snapshot: {},
      });

      expectRejected(result, 'UNSAFE_SOURCE_OBJECT');
    }
  });

  it('fails closed when resolver input, template, or binding requirements come from Object.prototype', () => {
    const validInput = {
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: {},
      snapshot: {},
    };
    const cases: Array<{ property: string; polluted: unknown; input: unknown; code?: string }> = [
      { property: 'template', polluted: validInput.template, input: { event: {}, snapshot: {} } },
      { property: 'event', polluted: {}, input: { template: validInput.template, snapshot: {} } },
      { property: 'snapshot', polluted: {}, input: { template: validInput.template, event: {} } },
      {
        property: 'kind',
        polluted: 'value.set',
        input: { ...validInput, template: { target: validInput.template.target, arguments: validInput.template.arguments } },
      },
      {
        property: 'target',
        polluted: validInput.template.target,
        input: { ...validInput, template: { kind: 'value.set', arguments: validInput.template.arguments } },
      },
      {
        property: 'arguments',
        polluted: validInput.template.arguments,
        input: { ...validInput, template: { kind: 'value.set', target: validInput.template.target } },
        code: 'MISSING_COMMAND_ARGUMENTS',
      },
      {
        property: 'source',
        polluted: 'literal',
        input: { ...validInput, template: { ...validInput.template, target: { value: ['name'] } } },
      },
      {
        property: 'path',
        polluted: ['value'],
        input: {
          ...validInput,
          template: { ...validInput.template, arguments: { value: { source: 'event' } } },
        },
      },
      {
        property: 'value',
        polluted: 'polluted',
        input: {
          ...validInput,
          template: { ...validInput.template, arguments: { value: { source: 'literal' } } },
        },
      },
      {
        property: 'value',
        polluted: validInput.template.arguments.value,
        input: { ...validInput, template: { ...validInput.template, arguments: {} } },
        code: 'MISSING_COMMAND_ARGUMENT',
      },
    ];

    for (const testCase of cases) {
      const result = withObjectPrototypeProperty(testCase.property, testCase.polluted, () =>
        resolve(testCase.input as ResolveSchemaEditorCommandInput),
      );
      expectRejected(result, testCase.code ?? 'MISSING_OWN_PROPERTY');
    }
  });

  it('rejects own accessors without invoking them during event traversal', () => {
    let accessorReads = 0;
    const event = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'host-owned';
      },
    }) as SchemaEditorContractValue;

    const result = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['safe'] },
        arguments: { value: { source: 'event', path: ['value'] } },
      },
      event,
      snapshot: {},
    });

    expectRejected(result, 'UNSAFE_SOURCE_ACCESSOR');
    expect(accessorReads).toBe(0);
  });

  it('rejects a binding path index accessor without executing it', () => {
    let reads = 0;
    const path = ['value'];
    Object.defineProperty(path, 0, {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        return 'value';
      },
    });

    const result = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['safe'] },
        arguments: { value: { source: 'event', path } },
      },
      event: { value: 'Ada' },
      snapshot: {},
    });

    expectRejected(result, 'UNSAFE_SOURCE_ACCESSOR');
    expect(reads).toBe(0);
  });

  it('rejects a wildcard binding index accessor without executing it', () => {
    let reads = 0;
    const wildcardBindings: SchemaEditorWildcardBinding[] = ['primary'];
    Object.defineProperty(wildcardBindings, 0, {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        return 'primary';
      },
    });

    const result = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['selected', '*'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: {},
      snapshot: {},
      wildcardBindings,
    });

    expectRejected(result, 'UNSAFE_SOURCE_ACCESSOR');
    expect(reads).toBe(0);
  });

  it('rejects object and symbol path segments without coercing them', () => {
    let coercionReads = 0;
    const objectSegment = {
      [Symbol.toPrimitive]() {
        coercionReads += 1;
        return 'value';
      },
      toString() {
        coercionReads += 1;
        return 'value';
      },
    };

    for (const segment of [objectSegment, Symbol('value')]) {
      const result = resolve({
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['safe'] },
          arguments: { value: { source: 'event', path: [segment] as unknown as string[] } },
        },
        event: { value: 'Ada' },
        snapshot: {},
      });

      expectRejected(result, 'INVALID_VALUE_PATH_SEGMENT');
      expect(coercionReads).toBe(0);
    }
  });

  it('fails closed for sparse binding paths and wildcard binding arrays', () => {
    const sparsePath = new Array<string>(1);
    const sparseBindings = new Array<SchemaEditorWildcardBinding>(1);
    const pathResult = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['safe'] },
        arguments: { value: { source: 'event', path: sparsePath } },
      },
      event: { value: 'Ada' },
      snapshot: {},
    });
    const bindingResult = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['selected', '*'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: {},
      snapshot: {},
      wildcardBindings: sparseBindings,
    });

    expectRejected(pathResult, 'SPARSE_ARRAY_INPUT');
    expectRejected(bindingResult, 'SPARSE_ARRAY_INPUT');
  });

  it('fails closed when path or wildcard array descriptors cannot be inspected', () => {
    const hostileArray = <T>(entry: T): T[] => new Proxy([entry], {
      getOwnPropertyDescriptor() {
        throw new Error('descriptor denied');
      },
    });
    const pathResult = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['safe'] },
        arguments: { value: { source: 'event', path: hostileArray('value') } },
      },
      event: { value: 'Ada' },
      snapshot: {},
    });
    const bindingResult = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['selected', '*'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: {},
      snapshot: {},
      wildcardBindings: hostileArray<SchemaEditorWildcardBinding>('primary'),
    });

    expectRejected(pathResult, 'UNSAFE_SOURCE_OBJECT');
    expectRejected(bindingResult, 'UNSAFE_SOURCE_OBJECT');
  });

  it.each(['getPrototypeOf', 'getOwnPropertyDescriptor'] as const)(
    'catches a Proxy event %s trap and returns diagnostics',
    (trap) => {
      const event = new Proxy(
        { value: 'Ada' },
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
      ) as SchemaEditorContractValue;
      const input: ResolveSchemaEditorCommandInput = {
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['safe'] },
          arguments: { value: { source: 'event', path: ['value'] } },
        },
        event,
        snapshot: {},
      };

      expect(() => resolve(input)).not.toThrow();
      expectRejected(resolve(input), 'UNSAFE_SOURCE_OBJECT');
    },
  );

  it('does not probe an absent optional wildcardBindings property on the original input', () => {
    let wildcardDescriptorReads = 0;
    const input = new Proxy(
      {
        template: {
          kind: 'value.set' as const,
          target: { source: 'literal' as const, value: ['name'] },
          arguments: { value: { source: 'literal' as const, value: 'Ada' } },
        },
        event: {},
        snapshot: {},
      },
      {
        getOwnPropertyDescriptor(target, property) {
          if (property === 'wildcardBindings') {
            wildcardDescriptorReads += 1;
            throw new Error('optional descriptor denied');
          }
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      },
    );

    expectResolved(resolve(input), { kind: 'value.set', target: ['name'], value: 'Ada' });
    expect(wildcardDescriptorReads).toBe(0);
  });

  it('uses one stable snapshot when a Proxy kind descriptor changes between reads', () => {
    let kindDescriptorReads = 0;
    const template = new Proxy(
      {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      {
        getOwnPropertyDescriptor(target, property) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
          if (property !== 'kind' || !descriptor || !('value' in descriptor)) return descriptor;
          kindDescriptorReads += 1;
          return { ...descriptor, value: kindDescriptorReads === 1 ? 'value.set' : 'map.remove' };
        },
      },
    ) as unknown as SchemaEditorCommandTemplate;

    expectResolved(resolve({ template, event: {}, snapshot: {} }), {
      kind: 'value.set',
      target: ['name'],
      value: 'Ada',
    });
    expect(kindDescriptorReads).toBe(1);
  });

  it('reflects a valid Proxy event exactly once and executes only against its snapshot', () => {
    const traps = { getPrototypeOf: 0, ownKeys: 0, valueDescriptor: 0 };
    const event = new Proxy(
      { value: 'Ada' },
      {
        getPrototypeOf(target) {
          traps.getPrototypeOf += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          traps.ownKeys += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, property) {
          if (property === 'value') traps.valueDescriptor += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      },
    ) as SchemaEditorContractValue;

    expectResolved(resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'event', path: ['value'] } },
      },
      event,
      snapshot: {},
    }), { kind: 'value.set', target: ['name'], value: 'Ada' });
    expect(traps).toEqual({ getPrototypeOf: 1, ownKeys: 1, valueDescriptor: 1 });
  });

  it.each([
    { binding: 2, snapshot: { rows: [{ name: 'zero' }, { name: 'one' }, { name: 'two' }] } },
    { binding: 'primary', snapshot: { rows: { primary: { name: 'Ada' } } } },
  ] satisfies Array<{
    binding: SchemaEditorWildcardBinding;
    snapshot: SchemaEditorContractValue;
  }>)(
    'materializes explicit $binding wildcard bindings as string or number',
    ({ binding, snapshot }) => {
      const result = resolve({
        template: {
          kind: 'value.set',
          target: { source: 'literal', value: ['selected', '*', 'name'] },
          arguments: { value: { source: 'value', path: ['rows', '*', 'name'] } },
        },
        event: {},
        snapshot,
        wildcardBindings: [binding],
      });

      expectResolved(result, {
        kind: 'value.set',
        target: ['selected', binding, 'name'],
        value: binding === 2 ? 'two' : 'Ada',
      });
    },
  );

  it('rejects an unbound wildcard without returning a partial command', () => {
    const result = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['items', '*', 'name'] },
        arguments: { value: { source: 'event', path: ['value'] } },
      },
      event: { value: 'Ada' },
      snapshot: {},
    });

    expectRejected(result, 'UNBOUND_WILDCARD');
  });

  it('omits optional collection sources and union initialValue when their paths are absent', () => {
    const insert = resolve({
      template: {
        kind: 'collection.insert',
        target: { source: 'literal', value: ['items'] },
        arguments: {
          index: { source: 'event', path: ['missingIndex'] },
          value: { source: 'value', path: ['missingValue'] },
        },
      },
      event: {},
      snapshot: {},
    });
    const select = resolve({
      template: {
        kind: 'union.select',
        target: { source: 'literal', value: ['status'] },
        arguments: {
          alternativeId: { source: 'literal', value: 'draft' },
          initialValue: { source: 'event', path: ['missingInitialValue'] },
        },
      },
      event: {},
      snapshot: {},
    });

    expectResolved(insert, { kind: 'collection.insert', target: ['items'] });
    expectResolved(select, {
      kind: 'union.select',
      target: ['status'],
      alternativeId: 'draft',
    });
    if (insert.ok) {
      expect(insert.command).not.toHaveProperty('index');
      expect(insert.command).not.toHaveProperty('value');
    }
    if (select.ok) expect(select.command).not.toHaveProperty('initialValue');
  });

  it('returns structured diagnostics for required, source-shape, and resolved-type failures', () => {
    const required = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'event', path: ['missing'] } },
      },
      event: {},
      snapshot: {},
    });
    const sourceShape = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['name'] },
        arguments: { value: { source: 'value', path: ['profile', 'name'] } },
      },
      event: {},
      snapshot: { profile: 'not-an-object' },
    });
    const resolvedType = resolve({
      template: {
        kind: 'collection.remove',
        target: { source: 'literal', value: ['items'] },
        arguments: { index: { source: 'event', path: ['index'] } },
      },
      event: { index: 'first' },
      snapshot: {},
    });

    expectRejected(required, 'MISSING_REQUIRED_SOURCE');
    expectRejected(sourceShape, 'INVALID_SOURCE_TYPE');
    expectRejected(resolvedType, 'INVALID_INDEX');
  });

  it('runs final concrete-command validation and suppresses invalid output', () => {
    const result = resolve({
      template: {
        kind: 'value.set',
        target: { source: 'event', path: ['target'] },
        arguments: { value: { source: 'literal', value: 'Ada' } },
      },
      event: { target: 'not-a-value-path' },
      snapshot: {},
    });

    expectRejected(result, 'INVALID_VALUE_PATH');
  });

  it('does not mutate inputs, alias literal output, read runtime hosts, or consult globals', () => {
    const literal = { nested: { tags: ['one'] } };
    const input: ResolveSchemaEditorCommandInput = {
      template: {
        kind: 'value.set',
        target: { source: 'literal', value: ['draft'] },
        arguments: { value: { source: 'literal', value: literal } },
      },
      event: { ignored: true },
      snapshot: { accepted: true },
      wildcardBindings: [],
    };
    const before = structuredClone(input);
    deepFreeze(input);
    const runtime = new Proxy(Object.create(null), {
      get() {
        throw new Error('pure resolver must not read runtime host capabilities');
      },
      has() {
        throw new Error('pure resolver must not inspect runtime host capabilities');
      },
    });
    const globalKey = '__DG_CELL_MVI_SCHEMA_EDITOR_VALUE_HOST__';
    let globalReads = 0;
    Object.defineProperty(globalThis, globalKey, {
      configurable: true,
      get() {
        globalReads += 1;
        throw new Error('pure resolver must not read a global ValueHost registry');
      },
    });

    try {
      const result = resolve(input, runtime);

      expectResolved(result, { kind: 'value.set', target: ['draft'], value: literal });
      expect(input).toEqual(before);
      expect(globalReads).toBe(0);
      if (result.ok && result.command.kind === 'value.set') {
        expect(result.command.value).not.toBe(literal);
      }
    } finally {
      Reflect.deleteProperty(globalThis, globalKey);
    }
  });
});
