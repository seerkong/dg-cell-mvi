import type {
  EditorPlan,
  EditorPlanNode,
  EditorPresentation,
  RuntimeScopeAssembly,
  SchemaEditorClassification,
  SchemaEditorContractRecord,
  StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
  type SchemaEditorTransformer,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultHalfcodeRuntime,
  createSchemaEditorSession,
  type DefaultHalfcodeRuntimeObject,
  type SchemaEditorApplyRequest,
  type SchemaEditorApplyResult,
  type SchemaEditorSession,
  type SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';
import {
  createSchemaEditorPresenterRegistry,
  type SchemaEditorPresenterAdapter,
  type SchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';
import type {
  Component,
} from 'vue';

import {
  BUSINESS_DIALECT_PHONE_PRESENTER_COMPONENTS,
} from './boundedContextPresenters';
import {
  BUSINESS_DIALECT_INITIAL_VALUE,
  BUSINESS_DIALECT_PRESENTATIONS,
  BUSINESS_DIALECT_PRESENTER_IDS,
  BUSINESS_DIALECT_SHARED_SCHEMA,
} from './fixture';
import {
  SHARED_BUSINESS_PROPERTY_CAPABILITIES,
  SHARED_BUSINESS_PROPERTY_IDS,
  createSharedBusinessPropertyCapsule,
  type SharedBusinessPropertyCapsule,
  type SharedBusinessPropertyFactoryArgument,
  type SharedBusinessPropertyKind,
} from './sharedCapsule';

export type BusinessDialectEditorId =
  | 'business-a'
  | 'business-b'
  | 'business-a-override';
export type BusinessDialectHostOutcome =
  | 'accepted'
  | 'pending'
  | 'rejected'
  | 'conflict'
  | 'stale'
  | 'malformed';
export type BusinessDialectFactoryArgument =
  Readonly<Record<string, never>>;
export type BusinessDialectPresenterRegistry =
  SchemaEditorPresenterRegistry<SchemaEditorPresenterAdapter<Component>>;
export type BusinessDialectPhoneTransformer = SchemaEditorTransformer<
  EditorCompilerRuntime,
  EditorCompilerInput,
  EditorCompilerConfig,
  EditorPlanNode
>;
export type BusinessDialectValue = Readonly<{
  user: SchemaEditorContractRecord;
}>;

export interface BusinessDialectSessionRuntimeIdentity {
  readonly kind: 'business-dialect-session-runtime';
  readonly scopeId: string;
}

export interface BusinessDialectEditorAssembly {
  readonly id: BusinessDialectEditorId;
  readonly scopeId: string;
  readonly schema: StructureSchema;
  readonly presentation: EditorPresentation;
  readonly compiler: EditorCompilerRuntime;
  readonly plan: EditorPlan;
  readonly phoneNode: EditorPlanNode;
  readonly phonePresenterId: string;
  readonly presenterRegistry: BusinessDialectPresenterRegistry;
  readonly sharedCapsule: SharedBusinessPropertyCapsule;
  readonly sessionRuntime: BusinessDialectSessionRuntimeIdentity;
  readonly session: SchemaEditorSession;
  readonly valueHost: BusinessDialectHostHarness;
  readonly scopeRuntime: DefaultHalfcodeRuntimeObject;
}

export interface BusinessDialectHostHarness
  extends SchemaEditorValueHost<BusinessDialectValue> {
  readonly requests: readonly SchemaEditorApplyRequest[];
  setNextOutcome(outcome: BusinessDialectHostOutcome): void;
  resolvePending(): void;
}

export interface BusinessDialectScopeAssembly {
  readonly rootRuntime: DefaultHalfcodeRuntimeObject;
  readonly schema: StructureSchema;
  readonly presentations: typeof BUSINESS_DIALECT_PRESENTATIONS;
  readonly sharedCapabilities:
    typeof SHARED_BUSINESS_PROPERTY_CAPABILITIES;
  readonly editors: Readonly<{
    businessA: BusinessDialectEditorAssembly;
    businessB: BusinessDialectEditorAssembly;
    businessAOverride: BusinessDialectEditorAssembly;
  }>;
}

interface CreateBusinessDialectEditorRuntime {
  readonly rootRuntime: DefaultHalfcodeRuntimeObject;
}

interface CreateBusinessDialectEditorInput {
  readonly id: BusinessDialectEditorId;
  readonly presentation: EditorPresentation;
  readonly boundedDialectFactory: BusinessDialectDialectFactory;
  readonly boundedPresenterRegistryFactory:
    BusinessDialectPresenterRegistryFactory;
}

interface CreateBusinessDialectEditorConfig {
  readonly instanceDialectFactory?: BusinessDialectDialectFactory;
  readonly instancePresenterRegistryFactory?:
    BusinessDialectPresenterRegistryFactory;
}

type BusinessDialectDialectFactory = (
  runtime: BusinessDialectFactoryArgument,
  input: BusinessDialectFactoryArgument,
  config: BusinessDialectFactoryArgument,
) => EditorCompilerDialect;

type BusinessDialectPresenterRegistryFactory = (
  runtime: BusinessDialectFactoryArgument,
  input: BusinessDialectFactoryArgument,
  config: BusinessDialectFactoryArgument,
) => BusinessDialectPresenterRegistry;

const EMPTY = Object.freeze({});
const EMPTY_CLASSIFICATION = Object.freeze({});
const PHONE_SEMANTIC_ID =
  SHARED_BUSINESS_PROPERTY_IDS.phone.semantic;

export function classifyBusinessAPhone(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): SchemaEditorClassification {
  return isBusinessPhone(input)
    ? Object.freeze({
        presenterId:
          BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
      })
    : EMPTY_CLASSIFICATION;
}

export function classifyBusinessBPhone(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): SchemaEditorClassification {
  return isBusinessPhone(input)
    ? Object.freeze({
        presenterId:
          BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
      })
    : EMPTY_CLASSIFICATION;
}

export function classifyBusinessAOverridePhone(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): SchemaEditorClassification {
  return isBusinessPhone(input)
    ? Object.freeze({
        presenterId:
          BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
      })
    : EMPTY_CLASSIFICATION;
}

export function transformBusinessAPhone(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformPhoneWithPresenter(
    BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    runtime,
    input,
    config,
  );
}

export function transformBusinessBPhone(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformPhoneWithPresenter(
    BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    runtime,
    input,
    config,
  );
}

export function transformBusinessAOverridePhone(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformPhoneWithPresenter(
    BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    runtime,
    input,
    config,
  );
}

export function createBusinessADialect(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): EditorCompilerDialect {
  return createPhoneDialect(
    'business.a',
    classifyBusinessAPhone,
    BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    transformBusinessAPhone,
    'bounded-context',
  );
}

export function createBusinessBDialect(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): EditorCompilerDialect {
  return createPhoneDialect(
    'business.b',
    classifyBusinessBPhone,
    BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    transformBusinessBPhone,
    'bounded-context',
  );
}

export function createBusinessAInstanceOverrideDialect(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): EditorCompilerDialect {
  return createPhoneDialect(
    'business.a.instance-override',
    classifyBusinessAOverridePhone,
    BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    transformBusinessAOverridePhone,
    'editor-instance',
  );
}

export function createBusinessAPresenterRegistry(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): BusinessDialectPresenterRegistry {
  return createPhonePresenterRegistry(
    BUSINESS_DIALECT_PRESENTER_IDS.businessAPhone,
    BUSINESS_DIALECT_PHONE_PRESENTER_COMPONENTS.businessA,
  );
}

export function createBusinessBPresenterRegistry(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): BusinessDialectPresenterRegistry {
  return createPhonePresenterRegistry(
    BUSINESS_DIALECT_PRESENTER_IDS.businessBPhone,
    BUSINESS_DIALECT_PHONE_PRESENTER_COMPONENTS.businessB,
  );
}

export function createBusinessAInstanceOverridePresenterRegistry(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): BusinessDialectPresenterRegistry {
  return createPhonePresenterRegistry(
    BUSINESS_DIALECT_PRESENTER_IDS.businessAOverridePhone,
    BUSINESS_DIALECT_PHONE_PRESENTER_COMPONENTS.businessAOverride,
  );
}

export function createBusinessDialectValueHost(
  _runtime: BusinessDialectFactoryArgument,
  input: Readonly<{ editorId: BusinessDialectEditorId }>,
  _config: BusinessDialectFactoryArgument,
): BusinessDialectHostHarness {
  const editorId = input.editorId;
  const requests: SchemaEditorApplyRequest[] = [];
  let nextOutcome: BusinessDialectHostOutcome = 'accepted';
  let revision = 0;
  let acceptedValue: BusinessDialectValue = cloneContractValue(
    Object.freeze({ user: BUSINESS_DIALECT_INITIAL_VALUE }),
  );
  let pending:
    | {
        request: SchemaEditorApplyRequest;
        candidate: BusinessDialectValue;
        resolve: (result: SchemaEditorApplyResult<BusinessDialectValue>) => void;
      }
    | undefined;
  const valueHost = function businessDialectValueHost(
    _hostRuntime: unknown,
    request: SchemaEditorApplyRequest,
    _hostConfig: Readonly<Record<string, unknown>>,
  ): SchemaEditorApplyResult<BusinessDialectValue>
    | Promise<SchemaEditorApplyResult<BusinessDialectValue>> {
    requests.push(request);
    const outcome = nextOutcome;
    nextOutcome = 'accepted';
    const candidate = applyValueSet(acceptedValue, request);
    if (outcome === 'rejected') {
      return Object.freeze({
        status: 'rejected' as const,
        baseRevision: request.expectedRevision,
        issues: Object.freeze([
          Object.freeze({
            path: '$',
            code: 'BUSINESS_DIALECT_REJECTED',
            message: `Editor "${editorId}" rejected the command.`,
          }),
        ]),
      });
    }
    if (outcome === 'conflict') {
      return Object.freeze({
        status: 'conflict' as const,
        baseRevision: request.expectedRevision,
        actualSnapshot: Object.freeze({
          value: cloneContractValue(acceptedValue),
          revision: `${editorId}.revision.${revision}`,
        }),
        issues: Object.freeze([
          Object.freeze({
            path: '$',
            code: 'BUSINESS_DIALECT_CONFLICT',
            message: `Editor "${editorId}" reported a conflict.`,
          }),
        ]),
      });
    }
    if (outcome === 'stale') {
      return Object.freeze({
        status: 'accepted' as const,
        baseRevision: request.expectedRevision,
        snapshot: Object.freeze({
          value: cloneContractValue(candidate),
          revision: request.expectedRevision,
        }),
      });
    }
    if (outcome === 'malformed') {
      return Object.freeze({
        status: 'accepted' as const,
        baseRevision: request.expectedRevision,
      }) as SchemaEditorApplyResult<BusinessDialectValue>;
    }
    if (outcome === 'pending') {
      if (pending) {
        throw new Error(
          `Editor "${editorId}" already has one controlled pending request.`,
        );
      }
      return new Promise<SchemaEditorApplyResult<BusinessDialectValue>>(
        (resolve) => {
          pending = {
            request,
            candidate,
            resolve,
          };
        },
      );
    }
    acceptedValue = candidate;
    revision += 1;
    return Object.freeze({
      status: 'accepted' as const,
      baseRevision: request.expectedRevision,
      snapshot: Object.freeze({
        value: cloneContractValue(acceptedValue),
        revision: `${editorId}.revision.${revision}`,
      }),
    });
  };
  Object.defineProperties(valueHost, {
    requests: {
      enumerable: true,
      get: () => Object.freeze([...requests]),
    },
    setNextOutcome: {
      enumerable: true,
      value(outcome: BusinessDialectHostOutcome) {
        if (pending) {
          throw new Error(
            `Cannot change outcome for "${editorId}" while a request is pending.`,
          );
        }
        nextOutcome = outcome;
      },
    },
    resolvePending: {
      enumerable: true,
      value() {
        if (!pending) {
          throw new Error(`Editor "${editorId}" has no pending request.`);
        }
        const current = pending;
        pending = undefined;
        acceptedValue = cloneContractValue(current.candidate);
        revision += 1;
        current.resolve(
          Object.freeze({
            status: 'accepted' as const,
            baseRevision: current.request.expectedRevision,
            snapshot: Object.freeze({
              value: cloneContractValue(acceptedValue),
              revision: `${editorId}.revision.${revision}`,
            }),
          }),
        );
      },
    },
  });
  return valueHost as BusinessDialectHostHarness;
}

export function createBusinessDialectEditorAssembly(
  runtime: CreateBusinessDialectEditorRuntime,
  input: CreateBusinessDialectEditorInput,
  config: CreateBusinessDialectEditorConfig,
): BusinessDialectEditorAssembly {
  const sharedCapsule = createSharedBusinessPropertyCapsule(
    EMPTY,
    EMPTY,
    EMPTY,
  );
  const dialects = [
    createDefaultSchemaEditorDialect(),
    sharedCapsule.dialect,
    input.boundedDialectFactory(EMPTY, EMPTY, EMPTY),
    ...(config.instanceDialectFactory
      ? [config.instanceDialectFactory(EMPTY, EMPTY, EMPTY)]
      : []),
  ];
  const compiler = createSchemaEditorCompilerRuntime({ dialects });
  const plan = compileEditorPlan(
    compiler,
    {
      schema: BUSINESS_DIALECT_SHARED_SCHEMA,
      presentation: input.presentation,
      path: ['user'],
    },
    {},
  );
  const phoneNode = requirePlanNode(plan.root, ['user', 'phone']);
  const phonePresenterId = phoneNode.presenter?.id;
  if (!phonePresenterId) {
    throw new Error(`Editor "${input.id}" did not select a phone presenter.`);
  }

  const presenterRegistries = [
    requireDefaultPresenterRegistry(),
    sharedCapsule.presenterRegistry,
    input.boundedPresenterRegistryFactory(EMPTY, EMPTY, EMPTY),
    ...(config.instancePresenterRegistryFactory
      ? [config.instancePresenterRegistryFactory(EMPTY, EMPTY, EMPTY)]
      : []),
  ];
  const composed = composeElementPlusSchemaEditorPresenterRegistries(
    Object.freeze({
      registries: Object.freeze(presenterRegistries),
    }),
    EMPTY,
    Object.freeze({ conflict: 'last-wins' }),
  );
  if (!composed.ok) {
    throw new Error(
      composed.diagnostics.map(({ message }) => message).join('; '),
    );
  }

  const scopeId = `${input.id}-scope`;
  const sessionRuntime = Object.freeze({
    kind: 'business-dialect-session-runtime' as const,
    scopeId,
  });
  const valueHost = createBusinessDialectValueHost(
    EMPTY,
    Object.freeze({ editorId: input.id }),
    EMPTY,
  );
  const valueHostId = `${input.id}.value-host`;
  const sessionId = `${input.id}.session`;
  const session = createSchemaEditorSession(
    sessionRuntime,
    {
      initialSnapshot: {
        value: Object.freeze({
          user: BUSINESS_DIALECT_INITIAL_VALUE,
        }),
        revision: `${input.id}.revision.0`,
      },
      valueHost,
    },
    {
      sessionId,
      valueHostId,
    },
  );
  const bindings = Object.freeze({
    config: Object.freeze({
      editorId: input.id,
      phonePresenterId,
    }),
    schemaEditor: Object.freeze({
      valueHosts: Object.freeze({ [valueHostId]: valueHost }),
      sessions: Object.freeze({ [sessionId]: session }),
    }),
    schemaEditorCompiler: compiler,
    schemaEditorPresenterRegistry: composed.registry,
  });
  const scopeRuntime = bindScope(runtime.rootRuntime, {
    scopeId,
    runtime: runtime.rootRuntime,
    bindings,
  });

  return Object.freeze({
    id: input.id,
    scopeId,
    schema: BUSINESS_DIALECT_SHARED_SCHEMA,
    presentation: input.presentation,
    compiler,
    plan,
    phoneNode,
    phonePresenterId,
    presenterRegistry: composed.registry,
    sharedCapsule,
    sessionRuntime,
    session,
    valueHost,
    scopeRuntime,
  });
}

export function createBusinessDialectScopeAssembly(
  _runtime: BusinessDialectFactoryArgument,
  _input: BusinessDialectFactoryArgument,
  _config: BusinessDialectFactoryArgument,
): BusinessDialectScopeAssembly {
  const rootRuntime = createDefaultHalfcodeRuntime(
    'business-dialect-demo-root',
  );
  const businessA = createBusinessDialectEditorAssembly(
    Object.freeze({ rootRuntime }),
    Object.freeze({
      id: 'business-a',
      presentation: BUSINESS_DIALECT_PRESENTATIONS.businessA,
      boundedDialectFactory: createBusinessADialect,
      boundedPresenterRegistryFactory:
        createBusinessAPresenterRegistry,
    }),
    EMPTY,
  );
  const businessB = createBusinessDialectEditorAssembly(
    Object.freeze({ rootRuntime }),
    Object.freeze({
      id: 'business-b',
      presentation: BUSINESS_DIALECT_PRESENTATIONS.businessB,
      boundedDialectFactory: createBusinessBDialect,
      boundedPresenterRegistryFactory:
        createBusinessBPresenterRegistry,
    }),
    EMPTY,
  );
  const businessAOverride = createBusinessDialectEditorAssembly(
    Object.freeze({ rootRuntime }),
    Object.freeze({
      id: 'business-a-override',
      presentation:
        BUSINESS_DIALECT_PRESENTATIONS.businessAOverride,
      boundedDialectFactory: createBusinessADialect,
      boundedPresenterRegistryFactory:
        createBusinessAPresenterRegistry,
    }),
    Object.freeze({
      instanceDialectFactory:
        createBusinessAInstanceOverrideDialect,
      instancePresenterRegistryFactory:
        createBusinessAInstanceOverridePresenterRegistry,
    }),
  );

  return Object.freeze({
    rootRuntime,
    schema: BUSINESS_DIALECT_SHARED_SCHEMA,
    presentations: BUSINESS_DIALECT_PRESENTATIONS,
    sharedCapabilities: SHARED_BUSINESS_PROPERTY_CAPABILITIES,
    editors: Object.freeze({
      businessA,
      businessB,
      businessAOverride,
    }),
  });
}

export const BUSINESS_DIALECT_FACTORIES = Object.freeze({
  scopeAssembly: createBusinessDialectScopeAssembly,
  editorAssembly: createBusinessDialectEditorAssembly,
  valueHost: createBusinessDialectValueHost,
  businessADialect: createBusinessADialect,
  businessBDialect: createBusinessBDialect,
  businessAInstanceOverrideDialect:
    createBusinessAInstanceOverrideDialect,
  businessAPresenterRegistry: createBusinessAPresenterRegistry,
  businessBPresenterRegistry: createBusinessBPresenterRegistry,
  businessAInstanceOverridePresenterRegistry:
    createBusinessAInstanceOverridePresenterRegistry,
});

export const BUSINESS_DIALECT_SHARED_CAPABILITY_KINDS =
  Object.freeze([
    'address',
    'entityRef',
    'enum',
  ] as const satisfies readonly SharedBusinessPropertyKind[]);

function createPhoneDialect(
  id: string,
  classify: NonNullable<EditorCompilerDialect['classify']>,
  presenterId: string,
  transformer: BusinessDialectPhoneTransformer,
  layer: 'bounded-context' | 'editor-instance',
): EditorCompilerDialect {
  return Object.freeze({
    id,
    classify,
    transformers: Object.freeze({
      [`presenter:${presenterId}`]: transformer,
    }),
    metadata: Object.freeze({
      owner: 'schema-editor-business-dialect-demo',
      layer,
    }),
  });
}

function createPhonePresenterRegistry(
  id: string,
  component: Component,
): BusinessDialectPresenterRegistry {
  const result = createSchemaEditorPresenterRegistry<
    SchemaEditorPresenterAdapter<Component>
  >(
    EMPTY,
    Object.freeze({
      entries: Object.freeze([
        Object.freeze({
          id,
          adapter: Object.freeze({ component }),
        }),
      ]),
    }),
    Object.freeze({ duplicate: 'reject' }),
  );
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map(({ message }) => message).join('; '),
    );
  }
  return result.registry;
}

function requireDefaultPresenterRegistry():
BusinessDialectPresenterRegistry {
  const result = createElementPlusSchemaEditorPresenterRegistry(
    EMPTY,
    EMPTY,
    EMPTY,
  );
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map(({ message }) => message).join('; '),
    );
  }
  return result.registry;
}

function transformPhoneWithPresenter(
  presenterId: string,
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const transformed =
    SHARED_BUSINESS_PROPERTY_CAPABILITIES.phone.transformer(
      runtime,
      input,
      config,
    );
  if (isPromiseLike(transformed)) {
    throw new Error('Business phone compilation must stay synchronous.');
  }
  return Object.freeze({
    ...transformed,
    presenter: Object.freeze({ id: presenterId }),
  });
}

function isBusinessPhone(input: EditorCompilerInput): boolean {
  return (
    input.fieldContext?.annotations?.semanticType
    ?? input.schema.annotations?.semanticType
  ) === PHONE_SEMANTIC_ID;
}

function requirePlanNode(
  node: EditorPlanNode,
  path: readonly (string | number)[],
): EditorPlanNode {
  if (samePath(node.path, path)) return node;
  if (node.kind === 'group') {
    for (const child of node.children) {
      const found = findPlanNode(child, path);
      if (found) return found;
    }
  }
  throw new Error(`Editor plan node "${path.join('.')}" is unavailable.`);
}

function findPlanNode(
  node: EditorPlanNode,
  path: readonly (string | number)[],
): EditorPlanNode | undefined {
  if (samePath(node.path, path)) return node;
  if (node.kind === 'group') {
    for (const child of node.children) {
      const found = findPlanNode(child, path);
      if (found) return found;
    }
  }
  return undefined;
}

function samePath(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): boolean {
  return left.length === right.length
    && left.every((segment, index) => segment === right[index]);
}

function bindScope(
  runtime: DefaultHalfcodeRuntimeObject,
  input: RuntimeScopeAssembly<DefaultHalfcodeRuntimeObject>,
): DefaultHalfcodeRuntimeObject {
  const scope = runtime.bindScope?.(input);
  if (!scope) throw new Error(`Scope "${input.scopeId}" was not assembled.`);
  return scope as DefaultHalfcodeRuntimeObject;
}

function isPromiseLike(
  value: unknown,
): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null)
    || typeof value === 'function'
  ) && typeof (value as { then?: unknown }).then === 'function';
}

function applyValueSet(
  accepted: BusinessDialectValue,
  request: SchemaEditorApplyRequest,
): BusinessDialectValue {
  if (request.command.kind !== 'value.set') {
    throw new Error(
      `Business dialect host does not support "${request.command.kind}" yet.`,
    );
  }
  const next = cloneContractValue(accepted) as Record<string, unknown>;
  let current: Record<string, unknown> = next;
  const target = request.command.target;
  for (let index = 0; index < target.length - 1; index += 1) {
    const segment = target[index];
    if (typeof segment !== 'string') {
      throw new Error('Business dialect host requires object field paths.');
    }
    const child = current[segment];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      throw new Error('Business dialect host command path is unavailable.');
    }
    current = child as Record<string, unknown>;
  }
  const field = target[target.length - 1];
  if (typeof field !== 'string') {
    throw new Error('Business dialect host requires an object field target.');
  }
  current[field] = cloneContractValue(request.command.value);
  return next as BusinessDialectValue;
}

function cloneContractValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneContractValue(item)) as T;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      cloneContractValue(child),
    ]),
  ) as T;
}
