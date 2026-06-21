import type {
  EditorCompilerConfig,
  EditorCompilerFieldContext,
  EditorCompilerInput,
} from 'dg-cell-mvi-halfcode-logic';

const businessConfig: EditorCompilerConfig = {
  planId: 'invoice.editor',
  business: {
    boundedContext: 'billing',
    featureFlags: ['compact-money'],
    limits: { decimals: 2 },
  },
};
void businessConfig;

const fieldContext: EditorCompilerFieldContext = {
  key: 'amount',
  required: true,
  label: 'Amount',
  description: 'Invoice total',
  annotations: { semanticType: 'Money' },
};
const inheritedInput: EditorCompilerInput = {
  schema: { kind: 'scalar', scalar: 'number' },
  fieldContext,
  identityScope: ['alternative', 'invoice'],
};
void inheritedInput;

const extendedIdentityInput: EditorCompilerInput = {
  ...inheritedInput,
  identityScope: [...(inheritedInput.identityScope ?? []), 'custom-object'],
};
void extendedIdentityInput;

const callbackIdentityInput: EditorCompilerInput = {
  schema: { kind: 'scalar', scalar: 'number' },
  identityScope: [
    // @ts-expect-error identity scope is serializable string data, not a callback channel.
    () => undefined,
  ],
};
void callbackIdentityInput;

const callbackFieldContext: EditorCompilerFieldContext = {
  key: 'amount',
  required: true,
  // @ts-expect-error inherited field context is pure data, not a callback channel.
  callback: () => undefined,
};
const callbackAnnotationFieldContext: EditorCompilerFieldContext = {
  key: 'amount',
  required: true,
  annotations: {
    // @ts-expect-error inherited annotations remain closed serializable contract data.
    callback: () => undefined,
  },
};

// @ts-expect-error dialect ownership belongs to EditorCompilerRuntime.
const dialectConfig: EditorCompilerConfig = { dialect: {} };
// @ts-expect-error dialect composition belongs to EditorCompilerRuntime.
const dialectsConfig: EditorCompilerConfig = { dialects: [] };
// @ts-expect-error classification processors belong to the runtime dialect.
const classifyConfig: EditorCompilerConfig = { classify: 'business' };
// @ts-expect-error classifier aliases are not compile config.
const classifierConfig: EditorCompilerConfig = { classifier: 'business' };
// @ts-expect-error transformers belong to the runtime dialect.
const transformersConfig: EditorCompilerConfig = { transformers: {} };
// @ts-expect-error resolver policy is internal to the compiler runtime.
const resolverConfig: EditorCompilerConfig = { resolver: 'schema-resolver' };
// @ts-expect-error registries are not compiler config dependencies.
const registryConfig: EditorCompilerConfig = { registry: {} };
// @ts-expect-error transformer precedence is fixed by the compiler.
const precedenceConfig: EditorCompilerConfig = { precedence: ['semantic', 'structural'] };
// @ts-expect-error resolution precedence is not caller-owned.
const resolutionPrecedenceConfig: EditorCompilerConfig = { resolutionPrecedence: ['local', 'shared'] };
// @ts-expect-error selection order is fixed by the compiler.
const selectionOrderConfig: EditorCompilerConfig = { selectionOrder: ['presenter', 'semantic'] };
// @ts-expect-error functions are not serializable business options.
const functionConfig: EditorCompilerConfig = { business: { callback: () => undefined } };
// @ts-expect-error class instances are not serializable business options.
const classInstanceConfig: EditorCompilerConfig = { business: { createdAt: new Date() } };

void [
  dialectConfig,
  dialectsConfig,
  classifyConfig,
  classifierConfig,
  transformersConfig,
  resolverConfig,
  registryConfig,
  precedenceConfig,
  resolutionPrecedenceConfig,
  selectionOrderConfig,
  functionConfig,
  classInstanceConfig,
  callbackFieldContext,
  callbackAnnotationFieldContext,
];
