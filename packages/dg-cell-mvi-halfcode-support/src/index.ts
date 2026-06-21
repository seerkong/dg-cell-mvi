export { createBrowserArtifactPort, createMemoryArtifactPort } from './artifactPorts';
export type {
  ArtifactMutationApplier,
  BrowserArtifactStorageLike,
  CreateBrowserArtifactPortOptions,
  CreateMemoryArtifactPortOptions,
} from './artifactPorts';

export {
  applyHalfcodeDocumentMutationToXnl,
  createXnlArtifactPort,
  diffHalfcodeXnlDocuments,
  loadHalfcodeXnlDocument,
  parseHalfcodeDocumentFromXnl,
  parseHalfcodeXnlArtifact,
  resolveHalfcodeXnlImports,
  serializeHalfcodeDocumentToXnl,
  serializeHalfcodeXnlArtifact,
} from './xnlArtifact';
export type {
  HalfcodeXnlArtifact,
  HalfcodeXnlArtifactSnapshot,
  HalfcodeXnlCodecResult,
  HalfcodeXnlLoadResult,
  XnlArtifactStorage,
} from './xnlArtifact';

export {
  HALFCODE_APP_BUNDLE_API_VERSION,
  loadHalfcodeUnitBundle,
  resolveUnitConfigRef,
} from './xnlUnitBundle';
export type {
  HalfcodeDomainFileInventory,
  LoadHalfcodeUnitBundleOptions,
  LoadedHalfcodeUnit,
  LoadedHalfcodeUnitBundle,
  LoadedHalfcodeUnitBundleApp,
  HalfcodeUnitBundleDiagnostic,
  HalfcodeUnitBundleManifest,
  HalfcodeUnitBundleResolver,
  HalfcodeUnitDomainDocument,
  HalfcodeUnitForm,
  HalfcodeUnitRegistry,
  HalfcodeUnitRegistryEntry,
} from './xnlUnitBundle';

export { assembleHalfcodeRuntimeUnit } from './runtimeAssembly';
export type {
  AssembleHalfcodeRuntimeUnitOptions,
  HalfcodeRuntimeAssemblyDiagnostic,
  HalfcodeRuntimeUnitAssembly,
  RuntimeConfigResolveContext,
  RuntimeConfigResolver,
  RuntimeSymbolResolveContext,
  RuntimeSymbolResolver,
} from './runtimeAssembly';

export { resolveScopeRuntimeRef } from './scopeRuntimeRefs';
export type {
  ResolveScopeRuntimeRefResult,
  ResolvedScopeRuntimeRef,
} from './scopeRuntimeRefs';

export { executeHalfcodeRuntimeCode } from './runtimeExecution';
export type {
  ExecuteHalfcodeRuntimeCodeOptions,
  ExecuteHalfcodeRuntimeCodeResult,
  HalfcodeRuntimeExecutionDiagnostic,
  RuntimeCodeResolveContext,
  RuntimeCodeResolver,
} from './runtimeExecution';

export { createHalfcodeAppRuntime, loadHalfcodeAppRuntime } from './halfcodeAppRuntime';
export type {
  CreateHalfcodeAppRuntimeOptions,
  DispatchHalfcodeCommandOptions,
  HalfcodeAppConfigResolveContext,
  HalfcodeAppRuntime,
  HalfcodeAppSymbolResolveContext,
  HalfcodeAppSymbolRole,
} from './halfcodeAppRuntime';

export { createDefaultHalfcodeRuntime } from './defaultRuntime';
export type { DefaultHalfcodeRuntimeObject } from './defaultRuntime';

export { bindHalfcodeFlows, materializeHalfcodeFlows } from './flowMaterializer';
export type {
  BizProcessHandle,
  BizProcessLifecycleDependencies,
  EagerDataFlowHandle,
  HalfcodeFlowCode,
  HalfcodeFlowCodeResolutionRequest,
  HalfcodeFlowCodeResolver,
  HalfcodeFlowHandle,
  HalfcodeFlowHandleFactory,
  HalfcodeFlowHandleFactoryRegistry,
  HalfcodeFlowHandleRegistry,
  HalfcodeFlowKind,
  InstantFlowHandle,
  MaterializeHalfcodeFlowsOptions,
  ResolveHalfcodeFlowOptions,
  WorkFlowHandle,
  WorkFlowLifecycleDependencies,
} from './flowHandles';

export { adaptCallableEffectToMviHandler } from './callableEffectAdapter';
export type { CallableEffectFeedbackMapper } from './callableEffectAdapter';

export { materializeDataGraphScope } from './dataGraphMaterializer';
export type {
  DataGraphSymbolRole,
  MaterializeDataGraphScopeOptions,
  MountedHalfcodeDataGraph,
  MountedHalfcodeDataGraphRegistry,
} from './dataGraphMaterializer';

export {
  createSchemaEditorSession,
  lowerEditorPlan,
  resolveSchemaEditorCommand,
  resolveSchemaEditorScopeBridge,
} from './schema-editor';
export type {
  CreateSchemaEditorSessionConfig,
  CreateSchemaEditorSessionInput,
  LowerEditorPlanConfig,
  LowerEditorPlanInput,
  LoweredEditorPlanSourceBundle,
  ResolveSchemaEditorCommandConfig,
  ResolveSchemaEditorCommandInput,
  ResolveSchemaEditorCommandResult,
  ResolveSchemaEditorScopeBridgeConfig,
  ResolveSchemaEditorScopeBridgeInput,
  ResolveSchemaEditorScopeBridgeResult,
  ResolvedSchemaEditorScopeBridge,
  SchemaEditorApplyRequest,
  SchemaEditorApplyResult,
  SchemaEditorCommandResolutionDiagnostic,
  SchemaEditorRevision,
  SchemaEditorScopeBridgeDiagnostic,
  SchemaEditorScopeBridgeDiagnosticCode,
  SchemaEditorScopeBridgeRuntime,
  SchemaEditorScopeCapabilities,
  SchemaEditorSession,
  SchemaEditorSessionDiagnostic,
  SchemaEditorSessionDispatchInput,
  SchemaEditorSessionPendingRequest,
  SchemaEditorSessionState,
  SchemaEditorSnapshot,
  SchemaEditorValueHost,
  SchemaEditorValueHostConfig,
  SchemaEditorWildcardBinding,
} from './schema-editor';

export * from 'dg-cell-mvi-halfcode-contract';
