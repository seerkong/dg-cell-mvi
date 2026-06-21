import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusSchemaEditorPresenterRegistry,
  type CreateElementPlusSchemaEditorPresenterRegistryConfig,
  type CreateElementPlusSchemaEditorPresenterRegistryInput,
  type CreateElementPlusSchemaEditorPresenterRegistryRuntime,
} from 'dg-cell-mvi-halfcode-element-plus';

type HasExactlyThreeParameters<T extends (...args: never[]) => unknown> =
  Parameters<T>['length'] extends 3 ? true : false;

const createHasThreeParameters:
  HasExactlyThreeParameters<typeof createElementPlusSchemaEditorPresenterRegistry> =
    true;
const composeHasThreeParameters:
  HasExactlyThreeParameters<typeof composeElementPlusSchemaEditorPresenterRegistries> =
    true;

type RuntimeOwnsEngines =
  'engines' extends keyof CreateElementPlusSchemaEditorPresenterRegistryRuntime
    ? true
    : false;

const runtimeOwnsEngines: RuntimeOwnsEngines = true;
const engines = Object.freeze({
  loadVisual: async () => undefined as never,
  loadJson: async () => undefined as never,
});
const input: CreateElementPlusSchemaEditorPresenterRegistryInput = {};
const config: CreateElementPlusSchemaEditorPresenterRegistryConfig = {};

createElementPlusSchemaEditorPresenterRegistry({ engines }, input, config);
// @ts-expect-error Engine Effects belong to runtime, never single-call input.
const invalidInput: CreateElementPlusSchemaEditorPresenterRegistryInput = { engines };
// @ts-expect-error Engine Effects belong to runtime, never serializable config.
const invalidConfig: CreateElementPlusSchemaEditorPresenterRegistryConfig = { engines };
composeElementPlusSchemaEditorPresenterRegistries(
  { registries: [] },
  {},
  { conflict: 'last-wins' },
);

void createHasThreeParameters;
void composeHasThreeParameters;
void runtimeOwnsEngines;
void invalidInput;
void invalidConfig;
