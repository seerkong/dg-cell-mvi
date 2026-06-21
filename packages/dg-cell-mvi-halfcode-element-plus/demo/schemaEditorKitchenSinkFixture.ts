import {
  type EditorPlan,
  type EditorPresentation,
  type SchemaEditorCommand,
  type SchemaEditorContractRecord,
  type SchemaEditorContractValue,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultHalfcodeRuntime,
  createSchemaEditorSession,
  loadHalfcodeAppRuntime,
  lowerEditorPlan,
  resolveUnitConfigRef,
  type HalfcodeAppRuntime,
  type HalfcodeUnitBundleResolver,
  type LoweredEditorPlanSourceBundle,
  type SchemaEditorApplyRequest,
  type SchemaEditorApplyResult,
  type SchemaEditorSession,
  type SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';
import {
  CanonicalHalfcodeRenderer,
  type CanonicalComponentRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import {
  createApp,
  nextTick,
  type App,
} from 'vue';

import {
  createElementPlusSchemaEditorCanonicalRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';

export const KITCHEN_SINK_PRESENTER_IDS = Object.freeze([
  'object.group',
  'scalar.text',
  'scalar.number',
  'scalar.boolean',
  'scalar.null',
  'scalar.enum',
  'scalar.const',
  'collection.list',
  'map.entries',
  'structured-value.modal',
  'union.select',
  'schema.ref',
  'unsupported',
  'scalar.email',
  'scalar.password',
  'scalar.textarea',
  'scalar.multiline',
  'scalar.url',
  'scalar.uri',
  'scalar.tel',
  'scalar.phone',
  'scalar.date',
  'scalar.time',
  'scalar.datetime',
  'scalar.date-time',
  'scalar.color',
  'scalar.currency',
] as const);

export type KitchenSinkPresenterId =
  (typeof KITCHEN_SINK_PRESENTER_IDS)[number];

export const SCHEMA_EDITOR_KITCHEN_SINK_SCHEMA = deepFreeze<StructureSchema>({
  kind: 'object',
  id: 'kitchen',
  label: 'Schema Editor Kitchen Sink',
  description: 'Canonical accepted-only presenter integration fixture.',
  required: ['title', 'email'],
  fields: [
    field('title', scalar('kitchen.title', 'string', {
      label: 'Title',
      description: 'Accepted-only title used by the host outcome harness.',
      constraints: { minLength: 2, maxLength: 80 },
    })),
    field('count', scalar('kitchen.count', 'integer', {
      label: 'Count',
      constraints: { minimum: 0, maximum: 20, multipleOf: 1 },
    })),
    field('enabled', scalar('kitchen.enabled', 'boolean', {
      label: 'Enabled',
    })),
    field('empty', scalar('kitchen.empty', 'null', {
      label: 'Null value',
    })),
    field('status', {
      ...scalar('kitchen.status', 'string', { label: 'Status' }),
      enum: ['draft', 'published'],
      default: 'draft',
    }),
    field('tenant', {
      ...scalar('kitchen.tenant', 'string', { label: 'Tenant' }),
      const: 'tenant-a',
      default: 'tenant-a',
    }),
    field('owner', {
      kind: 'ref',
      id: 'kitchen.owner',
      label: 'Owner reference',
      ref: 'schema://business/user',
    }),
    formatField('email', 'email', 'Email'),
    formatField('password', 'password', 'Password'),
    formatField('textarea', 'textarea', 'Textarea'),
    formatField('multiline', 'multiline', 'Multiline'),
    formatField('url', 'url', 'URL'),
    formatField('uri', 'uri', 'URI'),
    formatField('tel', 'tel', 'Telephone'),
    formatField('phone', 'phone', 'Phone'),
    formatField('date', 'date', 'Date'),
    formatField('time', 'time', 'Time'),
    formatField('datetime', 'datetime', 'Datetime'),
    formatField('dateTime', 'date-time', 'Date time'),
    formatField('color', 'color', 'Color'),
    field('currency', {
      ...scalar('kitchen.currency', 'number', {
        label: 'Currency',
        constraints: { minimum: 0, maximum: 10000, multipleOf: 0.01 },
      }),
      annotations: { format: 'currency' },
    }),
    field('structuredSettings', {
      kind: 'object',
      id: 'kitchen.structured-settings',
      label: 'Structured settings',
      description: 'Explicit dual-mode structured-value presenter fixture.',
      fields: [
        field('theme', scalar(
          'kitchen.structured-settings.theme',
          'string',
          { label: 'Theme' },
        )),
        field('notifications', scalar(
          'kitchen.structured-settings.notifications',
          'boolean',
          { label: 'Notifications' },
        )),
      ],
    }),
    field('members', {
      kind: 'array',
      id: 'kitchen.members',
      label: 'Members',
      description: 'Nested collection item objects.',
      identity: {
        strategy: 'property',
        path: ['id'],
        fallback: 'ephemeral',
      },
      itemDefault: { id: 'new-member', name: 'New member' },
      item: {
        kind: 'object',
        id: 'kitchen.member',
        label: 'Member',
        required: ['id', 'name'],
        fields: [
          field('id', scalar('kitchen.member.id', 'string', {
            label: 'Member id',
          })),
          field('name', scalar('kitchen.member.name', 'string', {
            label: 'Member name',
          })),
        ],
      },
    }),
    field('labels', {
      kind: 'map',
      id: 'kitchen.labels',
      label: 'Labels',
      description: 'Nested map value objects.',
      key: {
        kind: 'scalar',
        scalar: 'string',
        constraints: {
          minLength: 2,
          maxLength: 20,
          pattern: '^[a-z][a-z0-9-]*$',
        },
      },
      valueDefault: { label: 'New label', active: true },
      value: {
        kind: 'object',
        id: 'kitchen.label',
        label: 'Label entry',
        fields: [
          field('label', scalar('kitchen.label.text', 'string', {
            label: 'Label text',
          })),
          field('active', scalar('kitchen.label.active', 'boolean', {
            label: 'Label active',
          })),
        ],
      },
    }),
    field('channel', {
      kind: 'union',
      id: 'kitchen.channel',
      label: 'Channel',
      discriminator: 'kind',
      alternatives: [
        {
          id: 'basic',
          label: 'Basic',
          description: 'Basic text channel.',
          initialValue: { kind: 'basic', name: 'Basic channel' },
          schema: {
            kind: 'object',
            id: 'kitchen.channel.basic',
            fields: [
              field('kind', {
                ...scalar('kitchen.channel.basic.kind', 'string'),
                const: 'basic',
                default: 'basic',
              }),
              field('name', scalar('kitchen.channel.basic.name', 'string', {
                label: 'Basic channel name',
              })),
            ],
          },
        },
        {
          id: 'advanced',
          label: 'Advanced',
          description: 'Advanced retry channel.',
          initialValue: { kind: 'advanced', retries: 3 },
          schema: {
            kind: 'object',
            id: 'kitchen.channel.advanced',
            fields: [
              field('kind', {
                ...scalar('kitchen.channel.advanced.kind', 'string'),
                const: 'advanced',
                default: 'advanced',
              }),
              field('retries', scalar(
                'kitchen.channel.advanced.retries',
                'integer',
                { label: 'Retries' },
              )),
            ],
          },
        },
      ],
    }),
    field('diagnosticField', scalar('kitchen.diagnostic', 'string', {
      label: 'Diagnostic field',
      description: 'Carries a compiler-produced warning diagnostic.',
    })),
    field('readOnlyField', scalar('kitchen.readonly', 'string', {
      label: 'Read only field',
    })),
    field('hiddenField', scalar('kitchen.hidden', 'string', {
      label: 'Hidden field',
    })),
    field('opaque', {
      kind: 'future-opaque',
      id: 'kitchen.opaque',
      label: 'Unsupported opaque value',
    } as unknown as StructureSchema),
  ],
});

export const SCHEMA_EDITOR_KITCHEN_SINK_PRESENTATION =
  deepFreeze<EditorPresentation>({
    kind: 'presentation',
    id: 'kitchen.presentation',
    schemaId: 'kitchen',
    children: {
      title: {
        options: {
          placeholder: 'Kitchen title',
          clearable: true,
          maxlength: 80,
        },
      },
      count: {
        options: {
          controls: true,
          controlsPosition: 'right',
        },
      },
      email: {
        options: {
          placeholder: 'name@example.com',
          clearable: true,
        },
      },
      textarea: {
        options: {
          placeholder: 'Long text',
        },
      },
      members: {
        item: {
          children: {
            name: {
              options: {
                placeholder: 'Member name',
              },
            },
          },
        },
      },
      labels: {
        value: {
          children: {
            label: {
              options: {
                placeholder: 'Label text',
              },
            },
          },
        },
      },
      structuredSettings: {
        presenter: {
          id: 'structured-value.modal',
          explicit: true,
          reason: 'Exercise explicit Visual and JSON structured-value editing.',
          options: {
            defaultMode: 'visual',
            allowedModes: 'visual,json',
            rootKind: 'object',
          },
        },
      },
      readOnlyField: {
        readOnly: true,
        options: {
          placeholder: 'Cannot edit',
        },
      },
      hiddenField: {
        visible: false,
      },
    },
  });

export const SCHEMA_EDITOR_KITCHEN_SINK_INITIAL_VALUE =
  deepFreeze<SchemaEditorContractRecord>({
    title: 'Before',
    count: 2,
    enabled: true,
    empty: null,
    status: 'draft',
    tenant: 'tenant-a',
    owner: 'user:ada',
    email: 'ada@example.com',
    password: 'secret',
    textarea: 'Long text',
    multiline: 'Line one\nLine two',
    url: 'https://example.com',
    uri: 'urn:example:kitchen',
    tel: '+1-555-0100',
    phone: '+1-555-0101',
    date: '2026-07-17',
    time: '09:30:00',
    datetime: '2026-07-17T09:30:00',
    dateTime: '2026-07-18T10:45:00',
    color: '#409eff',
    currency: 125.5,
    structuredSettings: {
      theme: 'system',
      notifications: true,
    },
    members: [
      { id: 'ada', name: 'Ada' },
      { id: 'grace', name: 'Grace' },
    ],
    labels: {
      alpha: { label: 'Alpha', active: true },
    },
    channel: {
      kind: 'basic',
      name: 'General',
    },
    diagnosticField: 'Diagnostic value',
    readOnlyField: 'Locked',
    hiddenField: 'Classified',
    opaque: {
      accepted: 'opaque',
    },
  });

export type KitchenSinkHostOutcome =
  | 'accepted'
  | 'pending'
  | 'rejected'
  | 'conflict'
  | 'stale';

export interface SchemaEditorKitchenSinkHostHarness {
  readonly valueHost: SchemaEditorValueHost;
  readonly requests: readonly SchemaEditorApplyRequest[];
  setNextOutcome(outcome: KitchenSinkHostOutcome): void;
  resolvePending(): void;
}

export interface SchemaEditorKitchenSinkRuntime {
  readonly plan: EditorPlan;
  readonly session: SchemaEditorSession;
  readonly host: SchemaEditorKitchenSinkHostHarness;
  readonly sourceBundle: LoweredEditorPlanSourceBundle;
  readonly appRuntime: HalfcodeAppRuntime;
  readonly canonicalRegistry: CanonicalComponentRegistry;
  readonly renderPlan: HalfcodeAppRuntime['plans']['renderPlans'][number];
  readonly diagnostics: readonly string[];
  dispose(): void;
}

export interface MountedSchemaEditorKitchenSinkDemo
  extends SchemaEditorKitchenSinkRuntime {
  readonly app: App;
  readonly target: Element;
}

export function createSchemaEditorKitchenSinkCompilerRuntime():
EditorCompilerRuntime {
  return createSchemaEditorCompilerRuntime({
    dialects: [
      createDefaultSchemaEditorDialect(),
      {
        id: 'schema-editor.kitchen-sink-diagnostics',
        classify: (_runtime, input, _config) => (
          input.schema.id === 'kitchen.diagnostic'
            ? {
                diagnostics: [{
                  severity: 'warning',
                  code: 'KITCHEN_SINK_WARNING',
                  message: 'Kitchen-sink diagnostic is visible.',
                  path: input.path ?? [],
                }],
              }
            : {}
        ),
      },
    ],
  });
}

export function createSchemaEditorKitchenSinkPlan(): EditorPlan {
  return compileEditorPlan(
    createSchemaEditorKitchenSinkCompilerRuntime(),
    {
      schema: SCHEMA_EDITOR_KITCHEN_SINK_SCHEMA,
      presentation: SCHEMA_EDITOR_KITCHEN_SINK_PRESENTATION,
    },
    {
      planId: 'kitchen.editor',
    },
  );
}

export function createSchemaEditorKitchenSinkHostHarness(
  initialValue: SchemaEditorContractValue =
    SCHEMA_EDITOR_KITCHEN_SINK_INITIAL_VALUE,
): SchemaEditorKitchenSinkHostHarness {
  let acceptedValue = cloneContractValue(initialValue);
  let revision = 1;
  let nextOutcome: KitchenSinkHostOutcome = 'accepted';
  let pending:
    | {
        request: SchemaEditorApplyRequest;
        candidate: SchemaEditorContractValue;
        resolve: (result: SchemaEditorApplyResult) => void;
      }
    | undefined;
  const requests: SchemaEditorApplyRequest[] = [];

  const valueHost: SchemaEditorValueHost = function kitchenSinkValueHost(
    _runtime,
    request,
    _config,
  ) {
    requests.push(request);
    const outcome = nextOutcome;
    nextOutcome = 'accepted';
    const candidate = applySchemaEditorCommand(acceptedValue, request.command);

    if (outcome === 'rejected') {
      return {
        status: 'rejected',
        baseRevision: request.expectedRevision,
        issues: [{
          path: '$.fixture',
          code: 'KITCHEN_SINK_REJECTED',
          message: 'Kitchen-sink host rejected the command.',
        }],
      };
    }
    if (outcome === 'conflict') {
      return {
        status: 'conflict',
        baseRevision: request.expectedRevision,
        actualSnapshot: {
          value: cloneContractValue(acceptedValue),
          revision: `host-r${revision}`,
        },
        issues: [{
          path: '$.fixture',
          code: 'KITCHEN_SINK_CONFLICT',
          message: 'Kitchen-sink host reported a conflict.',
        }],
      };
    }
    if (outcome === 'stale') {
      return {
        status: 'accepted',
        baseRevision: request.expectedRevision,
        snapshot: {
          value: candidate,
          revision: request.expectedRevision,
        },
      };
    }
    if (outcome === 'pending') {
      if (pending) {
        throw new Error('Kitchen-sink host supports one controlled pending request.');
      }
      return new Promise<SchemaEditorApplyResult>((resolve) => {
        pending = { request, candidate, resolve };
      });
    }

    revision += 1;
    acceptedValue = cloneContractValue(candidate);
    return acceptedResult(
      request.expectedRevision,
      `r${revision}`,
      acceptedValue,
    );
  };

  return Object.freeze({
    valueHost,
    get requests() {
      return Object.freeze([...requests]);
    },
    setNextOutcome(outcome: KitchenSinkHostOutcome) {
      if (pending) {
        throw new Error('Cannot change outcome while a request is pending.');
      }
      nextOutcome = outcome;
    },
    resolvePending() {
      if (!pending) {
        throw new Error('No kitchen-sink request is pending.');
      }
      const current = pending;
      pending = undefined;
      revision += 1;
      acceptedValue = cloneContractValue(current.candidate);
      current.resolve(acceptedResult(
        current.request.expectedRevision,
        `r${revision}`,
        acceptedValue,
      ));
    },
  });
}

export async function createSchemaEditorKitchenSinkRuntime():
Promise<SchemaEditorKitchenSinkRuntime> {
  const plan = createSchemaEditorKitchenSinkPlan();
  const host = createSchemaEditorKitchenSinkHostHarness();
  const session = createSchemaEditorSession(
    Object.freeze({ fixture: 'schema-editor-kitchen-sink' }),
    {
      initialSnapshot: {
        value: SCHEMA_EDITOR_KITCHEN_SINK_INITIAL_VALUE,
        revision: 'r1',
      },
      valueHost: host.valueHost,
    },
    {
      sessionId: 'kitchen-session',
      valueHostId: 'kitchen-host',
    },
  );
  const hostRuntime = createDefaultHalfcodeRuntime(
    'schema-editor:kitchen-host',
    undefined,
    {
      schemaEditor: {
        valueHosts: {
          'kitchen-host': host.valueHost,
        },
        sessions: {
          'kitchen-session': session,
        },
      },
    },
  );
  const lowered = lowerEditorPlan(
    Object.freeze({}),
    { plan },
    {
      target: 'halfcode',
      unitFqn: 'dg.schemaEditor.$KitchenSink',
      scopeId: 'kitchen-editor-scope',
      valueHostId: 'kitchen-host',
      sessionId: 'kitchen-session',
      uiLibrary: 'schemaEditor',
    },
  );
  const appRuntime = await loadHalfcodeAppRuntime(
    createMemoryResolver(lowered.sourceMap),
    lowered.manifestUri,
    {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: [lowered.uiLibrary],
    },
    {
      hostRuntime,
      resolveSymbol: () => undefined,
      resolveConfig: (ref, context) => resolveUnitConfigRef(
        context.unit,
        ref,
      ),
    },
  );
  const renderPlan = appRuntime.plans.renderPlans.find(
    (candidate) => String(candidate.unitFqn) === lowered.runtimeUnitFqn,
  );
  const canonical = createElementPlusSchemaEditorCanonicalRegistry(
    Object.freeze({}),
    Object.freeze({}),
    Object.freeze({
      presenterConflict: 'last-wins',
      componentIdentity: 'Editor',
    }),
  );
  const diagnostics = collectRuntimeErrors(appRuntime);
  if (!renderPlan) {
    diagnostics.push('RUNTIME: Kitchen-sink render plan is missing.');
  }
  if (!canonical.ok) {
    diagnostics.push(...canonical.diagnostics.map(
      (diagnostic) => `CANONICAL: ${diagnostic.code}: ${diagnostic.message}`,
    ));
  }
  const frozenDiagnostics = Object.freeze(diagnostics);
  let disposed = false;

  return {
    plan,
    session,
    host,
    sourceBundle: lowered,
    appRuntime,
    canonicalRegistry: canonical.ok
      ? canonical.registry
      : Object.freeze({ resolve: () => undefined }),
    renderPlan: renderPlan ?? appRuntime.plans.renderPlans[0]!,
    diagnostics: frozenDiagnostics,
    dispose() {
      if (disposed) return;
      disposed = true;
      appRuntime.dispose();
      hostRuntime.dispose?.();
      session.dispose();
    },
  };
}

export async function mountSchemaEditorKitchenSinkDemo(
  target: Element,
): Promise<MountedSchemaEditorKitchenSinkDemo> {
  const runtime = await createSchemaEditorKitchenSinkRuntime();
  const app = createApp(CanonicalHalfcodeRenderer, {
    plan: runtime.renderPlan,
    runtime: runtime.appRuntime,
    registry: runtime.canonicalRegistry,
  });
  let disposed = false;
  try {
    app.mount(target);
    await nextTick();
  } catch (error) {
    app.unmount();
    runtime.dispose();
    throw error;
  }

  return {
    ...runtime,
    app,
    target,
    dispose() {
      if (disposed) return;
      disposed = true;
      app.unmount();
      runtime.dispose();
    },
  };
}

function field(
  key: string,
  schema: StructureSchema,
): Extract<StructureSchema, { kind: 'object' }>['fields'][number] {
  return { key, schema };
}

function scalar(
  id: string,
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'null',
  options: Readonly<{
    label?: string;
    description?: string;
    constraints?: SchemaEditorContractRecord;
  }> = {},
): Extract<StructureSchema, { kind: 'scalar' }> {
  return {
    kind: 'scalar',
    id,
    scalar: kind,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    ...(options.constraints === undefined
      ? {}
      : { constraints: options.constraints }),
  };
}

function formatField(
  key: string,
  format: string,
  label: string,
): Extract<StructureSchema, { kind: 'object' }>['fields'][number] {
  return field(key, {
    ...scalar(`kitchen.${key}`, 'string', { label }),
    annotations: { format },
  });
}

function createMemoryResolver(
  sourceMap: Readonly<Record<string, string>>,
): HalfcodeUnitBundleResolver {
  const directories = new Set<string>(['/']);
  for (const path of Object.keys(sourceMap)) {
    const parts = path.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`/${parts.slice(0, index).join('/')}`);
    }
  }
  return {
    readFile: (path) => sourceMap[path] ?? null,
    isDir: (path) => directories.has(path.replace(/\/$/, '') || '/'),
    readDir: (path) => {
      const prefix = `${path.replace(/\/$/, '')}/`;
      const entries = new Set<string>();
      for (const file of Object.keys(sourceMap)) {
        if (file.startsWith(prefix)) {
          entries.add(file.slice(prefix.length).split('/')[0]);
        }
      }
      return entries.size > 0 ? [...entries] : null;
    },
  };
}

function collectRuntimeErrors(runtime: HalfcodeAppRuntime): string[] {
  return [
    ...runtime.bundle.diagnostics
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `LOADER: ${code}: ${message}`),
    ...runtime.plans.diagnostics
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `COMPILER: ${code}: ${message}`),
    ...Object.values(runtime.assemblies)
      .flatMap(({ diagnostics }) => diagnostics)
      .filter(({ severity }) => severity === 'error')
      .map(({ code, message }) => `RUNTIME: ${code}: ${message}`),
  ];
}

function acceptedResult(
  baseRevision: string | number,
  revision: string | number,
  value: SchemaEditorContractValue,
): SchemaEditorApplyResult {
  return {
    status: 'accepted',
    baseRevision,
    snapshot: {
      value: cloneContractValue(value),
      revision,
    },
  };
}

function applySchemaEditorCommand(
  accepted: SchemaEditorContractValue,
  command: SchemaEditorCommand,
): SchemaEditorContractValue {
  const next = cloneContractValue(accepted);
  switch (command.kind) {
    case 'value.set':
      return writeValue(next, command.target, cloneContractValue(command.value));
    case 'collection.insert': {
      const collection = readArrayAt(next, command.target);
      const index = command.index ?? collection.length;
      collection.splice(index, 0, cloneContractValue(command.value ?? null));
      return next;
    }
    case 'collection.remove': {
      readArrayAt(next, command.target).splice(command.index, 1);
      return next;
    }
    case 'collection.move': {
      const collection = readArrayAt(next, command.target);
      const [item] = collection.splice(command.from, 1);
      if (item !== undefined) collection.splice(command.to, 0, item);
      return next;
    }
    case 'map.set': {
      readRecordAt(next, command.target)[command.key] =
        cloneContractValue(command.value);
      return next;
    }
    case 'map.remove': {
      delete readRecordAt(next, command.target)[command.key];
      return next;
    }
    case 'map.rename-key': {
      const record = readRecordAt(next, command.target);
      const value = record[command.from];
      delete record[command.from];
      if (value !== undefined) record[command.to] = value;
      return next;
    }
    case 'union.select':
      return writeValue(
        next,
        command.target,
        cloneContractValue(command.initialValue ?? command.alternativeId),
      );
  }
}

function writeValue(
  root: SchemaEditorContractValue,
  path: readonly (string | number | '*')[],
  value: SchemaEditorContractValue,
): SchemaEditorContractValue {
  if (path.length === 0) return value;
  const parent = readContainerAt(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (key === '*') throw new Error('Host received an unresolved wildcard path.');
  if (Array.isArray(parent) && typeof key === 'number') {
    parent[key] = value;
    return root;
  }
  if (isMutableContractRecord(parent) && typeof key === 'string') {
    parent[key] = value;
    return root;
  }
  throw new Error('Host command target does not match the accepted value.');
}

function readArrayAt(
  root: SchemaEditorContractValue,
  path: readonly (string | number | '*')[],
): SchemaEditorContractValue[] {
  const value = readContainerAt(root, path);
  if (!Array.isArray(value)) {
    throw new Error('Host command target is not an array.');
  }
  return value;
}

function readRecordAt(
  root: SchemaEditorContractValue,
  path: readonly (string | number | '*')[],
): Record<string, SchemaEditorContractValue> {
  const value = readContainerAt(root, path);
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error('Host command target is not a record.');
  }
  return value as Record<string, SchemaEditorContractValue>;
}

function readContainerAt(
  root: SchemaEditorContractValue,
  path: readonly (string | number | '*')[],
): SchemaEditorContractValue {
  let current = root;
  for (const segment of path) {
    if (segment === '*') {
      throw new Error('Host received an unresolved wildcard path.');
    }
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment]!;
      continue;
    }
    if (
      current !== null
      && typeof current === 'object'
      && !Array.isArray(current)
      && typeof segment === 'string'
    ) {
      current = current[segment]!;
      continue;
    }
    throw new Error('Host command path does not exist.');
  }
  return current;
}

function isMutableContractRecord(
  value: SchemaEditorContractValue,
): value is Record<string, SchemaEditorContractValue> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value);
}

function cloneContractValue<T extends SchemaEditorContractValue>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneContractValue(item)) as T;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      cloneContractValue(child as SchemaEditorContractValue),
    ]),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (
    value === null
    || typeof value !== 'object'
    || Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
