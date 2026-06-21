import {
  createDefaultSchemaEditorDialect,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
  type EditorPlanNode,
  type SchemaEditorClassification,
  type SchemaEditorTransformer,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createSchemaEditorPresenterRegistry,
  type SchemaEditorPresenterAdapter,
  type SchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import type {
  Component,
} from 'vue';

import {
  SharedAddressPresenter,
  SharedEntityRefPresenter,
  SharedEnumPresenter,
  SharedPhonePresenter,
} from './presenters';

export const SHARED_BUSINESS_PROPERTY_IDS = Object.freeze({
  phone: Object.freeze({
    semantic: 'business.user.phone',
    presenter: 'business.shared.phone',
  }),
  address: Object.freeze({
    semantic: 'business.address',
    presenter: 'business.shared.address',
  }),
  entityRef: Object.freeze({
    semantic: 'business.entity-ref',
    presenter: 'business.shared.entity-ref',
  }),
  enum: Object.freeze({
    semantic: 'business.enum',
    presenter: 'business.shared.enum',
  }),
});

export type SharedBusinessPropertyKind =
  keyof typeof SHARED_BUSINESS_PROPERTY_IDS;
export type SharedBusinessPropertyFactoryArgument =
  Readonly<Record<string, never>>;
export type SharedBusinessPropertyPresenterAdapter =
  SchemaEditorPresenterAdapter<Component>;
export type SharedBusinessPropertyPresenterRegistry =
  SchemaEditorPresenterRegistry<SharedBusinessPropertyPresenterAdapter>;
export type SharedBusinessPropertyTransformer = SchemaEditorTransformer<
  EditorCompilerRuntime,
  EditorCompilerInput,
  EditorCompilerConfig,
  EditorPlanNode
>;

export interface SharedBusinessPropertyCapability {
  readonly semanticId: string;
  readonly presenterId: string;
  readonly classifier: typeof classifySharedBusinessProperty;
  readonly transformer: SharedBusinessPropertyTransformer;
  readonly presenter: Component;
}

export interface SharedBusinessPropertyFactories {
  readonly capsule: typeof createSharedBusinessPropertyCapsule;
  readonly dialect: typeof createSharedBusinessPropertyDialect;
  readonly presenterRegistry:
    typeof createSharedBusinessPropertyPresenterRegistry;
}

export interface SharedBusinessPropertyCapsule {
  readonly ids: typeof SHARED_BUSINESS_PROPERTY_IDS;
  readonly dialect: EditorCompilerDialect;
  readonly presenterRegistry: SharedBusinessPropertyPresenterRegistry;
  readonly capabilities: Readonly<Record<
    SharedBusinessPropertyKind,
    SharedBusinessPropertyCapability
  >>;
  readonly factories: SharedBusinessPropertyFactories;
}

const EMPTY_CLASSIFICATION = Object.freeze({});
const DEFAULT_DIALECT = createDefaultSchemaEditorDialect();
const DEFAULT_SCALAR_TRANSFORMER = requireDefaultTransformer(
  'structural:scalar',
);
const DEFAULT_OBJECT_TRANSFORMER = requireDefaultTransformer(
  'structural:object',
);
const DEFAULT_REF_TRANSFORMER = requireDefaultTransformer(
  'structural:ref',
);
Object.freeze(DEFAULT_DIALECT.transformers);
Object.freeze(DEFAULT_DIALECT);

function classifySharedBusinessProperty(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): SchemaEditorClassification {
  const semanticType = input.fieldContext?.annotations?.semanticType
    ?? input.schema.annotations?.semanticType;
  return isSharedSemanticId(semanticType)
    ? Object.freeze({ semanticType })
    : EMPTY_CLASSIFICATION;
}

function transformSharedPhone(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformWithPresenter(
    DEFAULT_SCALAR_TRANSFORMER,
    SHARED_BUSINESS_PROPERTY_IDS.phone.presenter,
    runtime,
    input,
    config,
  );
}

function transformSharedAddress(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformWithPresenter(
    DEFAULT_OBJECT_TRANSFORMER,
    SHARED_BUSINESS_PROPERTY_IDS.address.presenter,
    runtime,
    input,
    config,
  );
}

function transformSharedEntityRef(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformWithPresenter(
    DEFAULT_REF_TRANSFORMER,
    SHARED_BUSINESS_PROPERTY_IDS.entityRef.presenter,
    runtime,
    input,
    config,
  );
}

function transformSharedEnum(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  return transformWithPresenter(
    DEFAULT_SCALAR_TRANSFORMER,
    SHARED_BUSINESS_PROPERTY_IDS.enum.presenter,
    runtime,
    input,
    config,
  );
}

export const SHARED_BUSINESS_PROPERTY_CAPABILITIES = Object.freeze({
  phone: capability(
    'phone',
    transformSharedPhone,
    SharedPhonePresenter,
  ),
  address: capability(
    'address',
    transformSharedAddress,
    SharedAddressPresenter,
  ),
  entityRef: capability(
    'entityRef',
    transformSharedEntityRef,
    SharedEntityRefPresenter,
  ),
  enum: capability(
    'enum',
    transformSharedEnum,
    SharedEnumPresenter,
  ),
});

export function createSharedBusinessPropertyDialect(
  _runtime: SharedBusinessPropertyFactoryArgument,
  _input: SharedBusinessPropertyFactoryArgument,
  _config: SharedBusinessPropertyFactoryArgument,
): EditorCompilerDialect {
  return Object.freeze({
    id: 'business.shared-properties',
    classify: classifySharedBusinessProperty,
    transformers: Object.freeze(Object.fromEntries(
      sharedPropertyKinds().map((kind) => {
        const current = SHARED_BUSINESS_PROPERTY_CAPABILITIES[kind];
        return [`semantic:${current.semanticId}`, current.transformer];
      }),
    )),
    metadata: Object.freeze({
      owner: 'schema-editor-business-dialect-demo',
      layer: 'shared-property',
    }),
  });
}

export function createSharedBusinessPropertyPresenterRegistry(
  _runtime: SharedBusinessPropertyFactoryArgument,
  _input: SharedBusinessPropertyFactoryArgument,
  _config: SharedBusinessPropertyFactoryArgument,
): SharedBusinessPropertyPresenterRegistry {
  const entries = Object.freeze(sharedPropertyKinds().map((kind) => {
    const current = SHARED_BUSINESS_PROPERTY_CAPABILITIES[kind];
    return Object.freeze({
      id: current.presenterId,
      adapter: Object.freeze({ component: current.presenter }),
    });
  }));
  const created = createSchemaEditorPresenterRegistry<
    SharedBusinessPropertyPresenterAdapter
  >(
    Object.freeze({}),
    Object.freeze({ entries }),
    Object.freeze({ duplicate: 'reject' }),
  );
  if (!created.ok) {
    throw new Error(created.diagnostics.map(({ message }) => message).join('; '));
  }
  return created.registry;
}

export function createSharedBusinessPropertyCapsule(
  runtime: SharedBusinessPropertyFactoryArgument,
  input: SharedBusinessPropertyFactoryArgument,
  config: SharedBusinessPropertyFactoryArgument,
): SharedBusinessPropertyCapsule {
  return Object.freeze({
    ids: SHARED_BUSINESS_PROPERTY_IDS,
    dialect: createSharedBusinessPropertyDialect(runtime, input, config),
    presenterRegistry: createSharedBusinessPropertyPresenterRegistry(
      runtime,
      input,
      config,
    ),
    capabilities: SHARED_BUSINESS_PROPERTY_CAPABILITIES,
    factories: SHARED_BUSINESS_PROPERTY_FACTORIES,
  });
}

export const SHARED_BUSINESS_PROPERTY_FACTORIES = Object.freeze({
  capsule: createSharedBusinessPropertyCapsule,
  dialect: createSharedBusinessPropertyDialect,
  presenterRegistry: createSharedBusinessPropertyPresenterRegistry,
});

function capability(
  kind: SharedBusinessPropertyKind,
  transformer: SharedBusinessPropertyTransformer,
  presenter: Component,
): SharedBusinessPropertyCapability {
  const ids = SHARED_BUSINESS_PROPERTY_IDS[kind];
  return Object.freeze({
    semanticId: ids.semantic,
    presenterId: ids.presenter,
    classifier: classifySharedBusinessProperty,
    transformer,
    presenter,
  });
}

function transformWithPresenter(
  transformer: SharedBusinessPropertyTransformer,
  presenterId: string,
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const transformed = transformer(runtime, input, config);
  if (isPromiseLike(transformed)) {
    throw new Error('Shared business property compilation must stay synchronous.');
  }
  return {
    ...transformed,
    presenter: input.presentation?.presenter
      ?? Object.freeze({ id: presenterId }),
  };
}

function requireDefaultTransformer(
  id: 'structural:scalar' | 'structural:object' | 'structural:ref',
): SharedBusinessPropertyTransformer {
  const transformer = DEFAULT_DIALECT.transformers?.[id];
  if (!transformer) {
    throw new Error(`Default Schema Editor transformer "${id}" is unavailable.`);
  }
  return transformer;
}

function isSharedSemanticId(value: unknown): value is string {
  return typeof value === 'string'
    && sharedPropertyKinds().some(
      (kind) => SHARED_BUSINESS_PROPERTY_IDS[kind].semantic === value,
    );
}

function sharedPropertyKinds(): readonly SharedBusinessPropertyKind[] {
  return Object.freeze([
    'phone',
    'address',
    'entityRef',
    'enum',
  ]);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null)
    || typeof value === 'function'
  ) && typeof (value as { then?: unknown }).then === 'function';
}
