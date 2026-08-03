import {
  closeDocument,
  openDocument,
  type AssembleDocumentOccurrenceInput,
  type DiagnosticResult,
  type DocumentAddressDescriptor,
  type DocumentAuthoringHostPort,
  type DocumentEmbeddedUnitPlan,
  type DocumentInstanceHandle,
  type DocumentInstanceRef,
  type DocumentInstanceRegistry,
  type DocumentOccurrenceAssembly,
  type DocumentOccurrenceParentLease,
  type DocumentOccurrenceRecord,
  type DocumentOccurrenceRegistryPort,
  type DocumentOccurrenceRuntime,
  type DocumentScopeRuntime,
  type DocumentOpenContext,
  type DocumentRuntimeConfig,
  type DocumentRuntimePort,
  type DocumentUnitPlan,
  type HalfcodeRef,
  type SerializableRecord,
  type UnitFqn,
} from 'dg-cell-mvi-halfcode-support';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type Assignable<Actual, Expected> = [Actual] extends [Expected] ? true : false;
type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsUnknown<T> = IsAny<T> extends true
  ? false
  : unknown extends T
    ? [keyof T] extends [never]
      ? true
      : false
    : false;
type IsAnyOrUnknown<T> = IsAny<T> extends true ? true : IsUnknown<T>;
type RequiredKeys<T> = {
  [Key in keyof T]-?: {} extends Pick<T, Key> ? never : Key;
}[keyof T];
type HasRequiredKeys<T, Keys extends PropertyKey> = Exclude<
  Keys,
  RequiredKeys<T>
> extends never
  ? true
  : false;
type HasOptionalKeys<T, Keys extends PropertyKey> = Exclude<
  Keys,
  keyof T
> extends never
  ? Extract<Keys, RequiredKeys<T>> extends never
    ? true
    : false
  : false;
type Property<T, Key extends PropertyKey> = T extends unknown
  ? Key extends keyof T
    ? T[Key]
    : never
  : never;
type MethodParameters<T, Key extends PropertyKey> = IsAny<T> extends true
  ? never
  : Key extends keyof T
    ? T[Key] extends (...args: infer Parameters) => unknown
      ? Parameters
      : never
    : never;
type MethodReturn<T, Key extends PropertyKey> = IsAny<T> extends true
  ? never
  : Key extends keyof T
    ? T[Key] extends (...args: never[]) => infer Result
      ? Result
      : never
    : never;
type FunctionParameters<T> = IsAny<T> extends true
  ? never
  : T extends (...args: infer Parameters) => unknown
    ? Parameters
    : never;
type FunctionReturn<T> = IsAny<T> extends true
  ? never
  : T extends (...args: never[]) => infer Result
    ? Result
    : never;
type WritableKeys<T> = {
  [Key in keyof T]-?: Equal<
    { [Candidate in Key]: T[Key] },
    { -readonly [Candidate in Key]: T[Key] }
  > extends true
    ? Key
    : never;
}[keyof T];
type AllReadonly<T> = Equal<WritableKeys<T>, never>;
type IsReadonlyArray<T> = T extends readonly unknown[]
  ? T extends unknown[]
    ? false
    : true
  : false;
type ArrayElement<T> = T extends readonly (infer Element)[] ? Element : never;
type IsCallable<T> = T extends (...args: never[]) => unknown ? true : false;
type IsNonEmptyObject<T> = IsAnyOrUnknown<T> extends true
  ? false
  : T extends object
    ? [keyof T] extends [never]
      ? false
      : true
    : false;
type ContainsFunction<T, Depth extends readonly unknown[] = []> = T extends
  | string
  | number
  | boolean
  | null
  ? false
  : T extends (...args: never[]) => unknown
    ? true
  : Depth['length'] extends 8
    ? false
    : T extends readonly (infer Element)[]
      ? ContainsFunction<Element, [...Depth, unknown]>
      : T extends object
        ? true extends {
            [Key in keyof T]-?: ContainsFunction<T[Key], [...Depth, unknown]>
          }[keyof T]
          ? true
          : false
        : false;

declare class ClassDocumentRuntimePort implements DocumentRuntimePort {
  resolveDefinition(definitionFqn: UnitFqn): DocumentUnitPlan | undefined;
  createRegistry(): DocumentInstanceRegistry;
  assembleOccurrence(
    runtime: DocumentScopeRuntime,
    input: AssembleDocumentOccurrenceInput,
    config: DocumentRuntimeConfig,
  ): DocumentOccurrenceAssembly;
}

declare class ClassViewRuntime implements DocumentOccurrenceRuntime {
  readonly documentOccurrences: DocumentOccurrenceRegistryPort;
  readonly documentRuntime: ClassDocumentRuntimePort;
}

type RuntimeDiagnostic = ArrayElement<Property<DiagnosticResult, 'diagnostics'>>;
type RegistryEntry<TTarget> = Readonly<{
  ref: DocumentInstanceRef;
  descriptor: DocumentAddressDescriptor;
  target: TTarget;
}>;
type RegisterResult = Readonly<{
  ok: boolean;
  ownerToken?: string;
  diagnostics?: readonly RuntimeDiagnostic[];
}>;
type ResolveResult<TTarget> = Readonly<{
  ok: boolean;
  value?: RegistryEntry<TTarget>;
  diagnostics?: readonly RuntimeDiagnostic[];
}>;
type MutationResult = Readonly<{
  ok: boolean;
  diagnostics?: readonly RuntimeDiagnostic[];
}>;
type BeginCloseResult = Readonly<{
  diagnostics: readonly RuntimeDiagnostic[];
  record?: DocumentOccurrenceRecord;
  descendants?: readonly DocumentOccurrenceRecord[];
}>;

type DocumentAddressDescriptorMustNotBeAny = Expect<
  Equal<IsAny<DocumentAddressDescriptor>, false>
>;
type DocumentEmbeddedUnitPlanMustNotBeAny = Expect<
  Equal<IsAny<DocumentEmbeddedUnitPlan>, false>
>;
type DocumentInstanceHandleMustNotBeAny = Expect<
  Equal<IsAny<DocumentInstanceHandle>, false>
>;
type DocumentInstanceRefMustNotBeAny = Expect<
  Equal<IsAny<DocumentInstanceRef>, false>
>;
type DocumentInstanceRegistryMustNotBeAny = Expect<
  Equal<IsAny<DocumentInstanceRegistry>, false>
>;
type DocumentOccurrenceAssemblyMustNotBeAny = Expect<
  Equal<IsAny<DocumentOccurrenceAssembly>, false>
>;
type DocumentOccurrenceRecordMustNotBeAny = Expect<
  Equal<IsAny<DocumentOccurrenceRecord>, false>
>;
type DocumentOccurrenceParentLeaseMustNotBeAny = Expect<
  Equal<IsAny<DocumentOccurrenceParentLease>, false>
>;
type DocumentOccurrenceRegistryPortMustNotBeAny = Expect<
  Equal<IsAny<DocumentOccurrenceRegistryPort>, false>
>;
type DocumentOccurrenceRuntimeMustNotBeAny = Expect<
  Equal<IsAny<DocumentOccurrenceRuntime>, false>
>;
type DocumentOpenContextMustNotBeAny = Expect<
  Equal<IsAny<DocumentOpenContext>, false>
>;
type DocumentRuntimeConfigMustNotBeAny = Expect<
  Equal<IsAny<DocumentRuntimeConfig>, false>
>;
type DocumentRuntimePortMustNotBeAny = Expect<
  Equal<IsAny<DocumentRuntimePort>, false>
>;
type DocumentUnitPlanMustNotBeAny = Expect<Equal<IsAny<DocumentUnitPlan>, false>>;
type DiagnosticResultMustNotBeAny = Expect<Equal<IsAny<DiagnosticResult>, false>>;
type OpenDocumentMustNotBeAny = Expect<Equal<IsAny<typeof openDocument>, false>>;
type CloseDocumentMustNotBeAny = Expect<Equal<IsAny<typeof closeDocument>, false>>;

type PlanAssertions = [
  HasRequiredKeys<
    DocumentUnitPlan,
    | 'id'
    | 'unitFqn'
    | 'source'
    | 'rootNodeId'
    | 'mode'
    | 'presentationId'
    | 'rootScopeId'
    | 'embeddedUnits'
    | 'addressableInstances'
  >,
  HasKey<DocumentUnitPlan, 'parameters'>,
  Equal<Property<DocumentUnitPlan, 'id'>, string>,
  Equal<Property<DocumentUnitPlan, 'unitFqn'>, UnitFqn>,
  Equal<Property<Property<DocumentUnitPlan, 'source'>, 'kind'>, 'inline' | 'external'>,
  Equal<
    Property<Extract<Property<DocumentUnitPlan, 'source'>, { kind: 'inline' }>, 'unitSourceRef'>,
    HalfcodeRef
  >,
  Equal<
    Property<Extract<Property<DocumentUnitPlan, 'source'>, { kind: 'inline' }>, 'region'>,
    'body'
  >,
  Equal<
    Property<Extract<Property<DocumentUnitPlan, 'source'>, { kind: 'external' }>, 'ref'>,
    HalfcodeRef
  >,
  Equal<Property<DocumentUnitPlan, 'rootNodeId'>, string>,
  Equal<Property<DocumentUnitPlan, 'mode'>, 'view' | 'edit'>,
  Equal<Property<DocumentUnitPlan, 'presentationId'>, string>,
  Equal<Property<DocumentUnitPlan, 'rootScopeId'>, string>,
  Equal<IsAnyOrUnknown<Property<DocumentUnitPlan, 'parameters'>>, false>,
  Assignable<
    Exclude<Property<DocumentUnitPlan, 'parameters'>, undefined>,
    Readonly<Record<string, string>>
  >,
  Equal<
    Property<DocumentUnitPlan, 'embeddedUnits'>,
    readonly DocumentEmbeddedUnitPlan[]
  >,
  Equal<
    ArrayElement<Property<DocumentUnitPlan, 'embeddedUnits'>>,
    DocumentEmbeddedUnitPlan
  >,
  Equal<
    Property<DocumentUnitPlan, 'addressableInstances'>,
    readonly DocumentAddressDescriptor[]
  >,
  Equal<
    ArrayElement<Property<DocumentUnitPlan, 'addressableInstances'>>,
    DocumentAddressDescriptor
  >,
  IsReadonlyArray<Property<DocumentUnitPlan, 'embeddedUnits'>>,
  IsReadonlyArray<Property<DocumentUnitPlan, 'addressableInstances'>>,
  AllReadonly<DocumentUnitPlan>,
  Equal<HasKey<DocumentUnitPlan, 'unitInstanceId'>, false>,
  Equal<HasKey<DocumentUnitPlan, 'target'>, false>,
];

type EmbeddedPlanAssertions = [
  HasRequiredKeys<DocumentEmbeddedUnitPlan, 'kind' | 'id' | 'unitFqn' | 'scopeId'>,
  Equal<
    Property<DocumentEmbeddedUnitPlan, 'kind'>,
    'component-embed' | 'document-embed'
  >,
  Equal<Property<DocumentEmbeddedUnitPlan, 'id'>, string>,
  Equal<Property<DocumentEmbeddedUnitPlan, 'unitFqn'>, UnitFqn>,
  Equal<Property<DocumentEmbeddedUnitPlan, 'scopeId'>, string>,
  AllReadonly<DocumentEmbeddedUnitPlan>,
];

type AddressDescriptorAssertions = [
  HasRequiredKeys<
    DocumentAddressDescriptor,
    'projectionRole' | 'xId' | 'scopeId'
  >,
  Equal<Property<DocumentAddressDescriptor, 'projectionRole'>, string>,
  Equal<Property<DocumentAddressDescriptor, 'xId'>, string>,
  Equal<Property<DocumentAddressDescriptor, 'documentNodeId'>, string | undefined>,
  Equal<Property<DocumentAddressDescriptor, 'unitFqn'>, UnitFqn | undefined>,
  Equal<Property<DocumentAddressDescriptor, 'scopeId'>, string>,
  Equal<Property<DocumentAddressDescriptor, 'metadata'>, SerializableRecord | undefined>,
  AllReadonly<DocumentAddressDescriptor>,
  Equal<HasKey<DocumentAddressDescriptor, 'unitInstanceId'>, false>,
  Equal<HasKey<DocumentAddressDescriptor, 'target'>, false>,
];

type OpenContextAssertions = [
  HasRequiredKeys<DocumentOpenContext, 'unitInstanceId' | 'mode'>,
  HasKey<DocumentOpenContext, 'externalSourceRef'>,
  HasKey<DocumentOpenContext, 'revision'>,
  HasKey<DocumentOpenContext, 'parameters'>,
  Equal<HasKey<DocumentOpenContext, 'authoringSessionId'>, false>,
  Equal<Property<DocumentOpenContext, 'unitInstanceId'>, string>,
  Equal<Property<DocumentOpenContext, 'mode'>, 'view' | 'edit'>,
  Equal<Property<DocumentOpenContext, 'externalSourceRef'>, HalfcodeRef | undefined>,
  Equal<Property<DocumentOpenContext, 'revision'>, string | undefined>,
  Equal<Property<DocumentOpenContext, 'parameters'>, SerializableRecord | undefined>,
  AllReadonly<DocumentOpenContext>,
];

type InstanceRefAssertions = [
  Equal<keyof DocumentInstanceRef, 'unitInstanceId' | 'projectionRole' | 'xId'>,
  HasRequiredKeys<DocumentInstanceRef, 'unitInstanceId' | 'projectionRole' | 'xId'>,
  Equal<Property<DocumentInstanceRef, 'unitInstanceId'>, string>,
  Equal<Property<DocumentInstanceRef, 'projectionRole'>, string>,
  Equal<Property<DocumentInstanceRef, 'xId'>, string>,
  AllReadonly<DocumentInstanceRef>,
];

type InstanceHandleAssertions = [
  Equal<keyof DocumentInstanceHandle, 'unitInstanceId' | 'lease' | 'rootScopeId' | 'addresses'>,
  HasRequiredKeys<
    DocumentInstanceHandle,
    'unitInstanceId' | 'lease' | 'rootScopeId' | 'addresses'
  >,
  Equal<Property<DocumentInstanceHandle, 'unitInstanceId'>, string>,
  Equal<Property<DocumentInstanceHandle, 'lease'>, string>,
  Equal<Property<DocumentInstanceHandle, 'rootScopeId'>, string>,
  Equal<Property<DocumentInstanceHandle, 'addresses'>, readonly DocumentInstanceRef[]>,
  Equal<ArrayElement<Property<DocumentInstanceHandle, 'addresses'>>, DocumentInstanceRef>,
  IsReadonlyArray<Property<DocumentInstanceHandle, 'addresses'>>,
  AllReadonly<DocumentInstanceHandle>,
];

type DiagnosticAssertions = [
  HasRequiredKeys<DiagnosticResult, 'diagnostics'>,
  Equal<IsAnyOrUnknown<Property<DiagnosticResult, 'diagnostics'>>, false>,
  IsReadonlyArray<Property<DiagnosticResult, 'diagnostics'>>,
  Equal<IsAnyOrUnknown<RuntimeDiagnostic>, false>,
  HasRequiredKeys<RuntimeDiagnostic, 'severity' | 'code' | 'message'>,
  Equal<Property<RuntimeDiagnostic, 'severity'>, 'warning' | 'error'>,
  Equal<Property<RuntimeDiagnostic, 'code'>, string>,
  Equal<Property<RuntimeDiagnostic, 'message'>, string>,
  Equal<Property<RuntimeDiagnostic, 'path'>, string | undefined>,
];

type RegisterMethod = Property<DocumentInstanceRegistry, 'register'>;
type ResolveMethod = Property<DocumentInstanceRegistry, 'resolve'>;
type RegisterInput = Property<MethodParameters<DocumentInstanceRegistry, 'register'>, 0>;
type RegisterOutput = MethodReturn<DocumentInstanceRegistry, 'register'>;
type ResolveOutput = MethodReturn<DocumentInstanceRegistry, 'resolve'>;
type ResolvedEntry = NonNullable<Property<ResolveOutput, 'value'>>;
type UnregisterInput = Property<MethodParameters<DocumentInstanceRegistry, 'unregister'>, 0>;
type UnregisterOutput = MethodReturn<DocumentInstanceRegistry, 'unregister'>;
type DisposeNamespaceOutput = MethodReturn<
  DocumentInstanceRegistry,
  'disposeNamespace'
>;

type InstanceRegistryAssertions = [
  HasRequiredKeys<
    DocumentInstanceRegistry,
    'register' | 'resolve' | 'unregister' | 'disposeNamespace'
  >,
  IsCallable<RegisterMethod>,
  IsCallable<ResolveMethod>,
  IsCallable<Property<DocumentInstanceRegistry, 'unregister'>>,
  IsCallable<Property<DocumentInstanceRegistry, 'disposeNamespace'>>,
  Equal<IsAnyOrUnknown<RegisterInput>, false>,
  HasRequiredKeys<RegisterInput, 'ref' | 'descriptor' | 'target'>,
  Equal<Property<RegisterInput, 'ref'>, DocumentInstanceRef>,
  Equal<Property<RegisterInput, 'descriptor'>, DocumentAddressDescriptor>,
  Equal<IsAny<Property<RegisterInput, 'target'>>, false>,
  Assignable<
    RegisterMethod,
    <TTarget>(input: Readonly<{
      ref: DocumentInstanceRef;
      descriptor: DocumentAddressDescriptor;
      target: TTarget;
    }>) => RegisterResult
  >,
  Equal<IsAnyOrUnknown<RegisterOutput>, false>,
  HasRequiredKeys<RegisterOutput, 'ok'>,
  Equal<Property<RegisterOutput, 'ok'>, boolean>,
  Equal<Property<RegisterOutput, 'ownerToken'>, string | undefined>,
  Equal<Property<RegisterOutput, 'diagnostics'>, readonly RuntimeDiagnostic[] | undefined>,
  Equal<Property<MethodParameters<DocumentInstanceRegistry, 'resolve'>, 0>, DocumentInstanceRef>,
  Assignable<
    ResolveMethod,
    <TTarget>(ref: DocumentInstanceRef) => ResolveResult<TTarget>
  >,
  Equal<IsAnyOrUnknown<ResolveOutput>, false>,
  HasRequiredKeys<ResolvedEntry, 'ref' | 'descriptor' | 'target'>,
  Equal<Property<ResolvedEntry, 'ref'>, DocumentInstanceRef>,
  Equal<Property<ResolvedEntry, 'descriptor'>, DocumentAddressDescriptor>,
  Equal<IsAny<Property<ResolvedEntry, 'target'>>, false>,
  AllReadonly<ResolvedEntry>,
  HasRequiredKeys<UnregisterInput, 'ref' | 'ownerToken'>,
  Equal<Property<UnregisterInput, 'ref'>, DocumentInstanceRef>,
  Equal<Property<UnregisterInput, 'ownerToken'>, string>,
  Equal<IsAnyOrUnknown<UnregisterOutput>, false>,
  Equal<UnregisterOutput, MutationResult>,
  AllReadonly<UnregisterOutput>,
  Equal<
    Property<MethodParameters<DocumentInstanceRegistry, 'disposeNamespace'>, 0>,
    string
  >,
  Equal<IsAnyOrUnknown<DisposeNamespaceOutput>, false>,
  Equal<DisposeNamespaceOutput, MutationResult>,
  AllReadonly<DisposeNamespaceOutput>,
];

type OccurrenceReserveInput = Property<
  MethodParameters<DocumentOccurrenceRegistryPort, 'reserve'>,
  0
>;
type OccurrenceReserveOutput = MethodReturn<DocumentOccurrenceRegistryPort, 'reserve'>;
type OccurrenceCommitInput = Property<
  MethodParameters<DocumentOccurrenceRegistryPort, 'commit'>,
  0
>;
type OccurrenceBeginCloseInput = Property<
  MethodParameters<DocumentOccurrenceRegistryPort, 'beginClose'>,
  0
>;
type OccurrenceReleaseInput = Property<
  MethodParameters<DocumentOccurrenceRegistryPort, 'release'>,
  0
>;
type OccurrenceGetOutput = MethodReturn<DocumentOccurrenceRegistryPort, 'get'>;
type OccurrenceBeginCloseOutput = MethodReturn<
  DocumentOccurrenceRegistryPort,
  'beginClose'
>;
type OccurrenceCommitOutput = MethodReturn<DocumentOccurrenceRegistryPort, 'commit'>;
type OccurrenceReleaseOutput = MethodReturn<DocumentOccurrenceRegistryPort, 'release'>;
type OccurrenceResolveHostOutput = MethodReturn<
  DocumentOccurrenceRegistryPort,
  'resolveHost'
>;
type OccurrenceListOutput = MethodReturn<DocumentOccurrenceRegistryPort, 'list'>;

type AssemblyChildOccurrence = ArrayElement<
  Exclude<Property<DocumentOccurrenceAssembly, 'childOccurrences'>, undefined>
>;

type OccurrenceParentLeaseAssertions = [
  HasRequiredKeys<DocumentOccurrenceParentLease, 'unitInstanceId' | 'lease'>,
  Equal<Property<DocumentOccurrenceParentLease, 'unitInstanceId'>, string>,
  Equal<Property<DocumentOccurrenceParentLease, 'lease'>, string>,
  AllReadonly<DocumentOccurrenceParentLease>,
];

type OccurrenceAssemblyAssertions = [
  HasRequiredKeys<
    DocumentOccurrenceAssembly,
    'rootScopeId' | 'rootRuntime' | 'dispose'
  >,
  HasKey<DocumentOccurrenceAssembly, 'capsuleScopeRuntimes'>,
  HasKey<DocumentOccurrenceAssembly, 'componentScopeRuntimes'>,
  HasKey<DocumentOccurrenceAssembly, 'childOccurrences'>,
  HasKey<DocumentOccurrenceAssembly, 'diagnostics'>,
  HasOptionalKeys<
    DocumentOccurrenceAssembly,
    | 'capsuleScopeRuntimes'
    | 'componentScopeRuntimes'
    | 'childOccurrences'
    | 'diagnostics'
  >,
  Equal<Property<DocumentOccurrenceAssembly, 'rootScopeId'>, string>,
  Equal<
    Property<DocumentOccurrenceAssembly, 'rootRuntime'>,
    DocumentScopeRuntime
  >,
  Equal<
    Property<DocumentOccurrenceAssembly, 'capsuleScopeRuntimes'>,
    readonly DocumentScopeRuntime[] | undefined
  >,
  Equal<
    Property<DocumentOccurrenceAssembly, 'componentScopeRuntimes'>,
    readonly DocumentScopeRuntime[] | undefined
  >,
  IsReadonlyArray<
    Exclude<
      Property<DocumentOccurrenceAssembly, 'childOccurrences'>,
      undefined
    >
  >,
  Equal<IsAnyOrUnknown<AssemblyChildOccurrence>, false>,
  HasRequiredKeys<AssemblyChildOccurrence, 'dispose'>,
  IsCallable<Property<AssemblyChildOccurrence, 'dispose'>>,
  Equal<
    MethodReturn<AssemblyChildOccurrence, 'dispose'>,
    void | Promise<void>
  >,
  Equal<
    Property<DocumentOccurrenceAssembly, 'diagnostics'>,
    readonly RuntimeDiagnostic[] | undefined
  >,
  IsCallable<Property<DocumentOccurrenceAssembly, 'dispose'>>,
  Equal<
    Property<MethodParameters<DocumentOccurrenceAssembly, 'dispose'>, 'length'>,
    0
  >,
  Equal<
    MethodReturn<DocumentOccurrenceAssembly, 'dispose'>,
    void | Promise<void>
  >,
  AllReadonly<DocumentOccurrenceAssembly>,
];

type OccurrenceRecordAssertions = [
  HasRequiredKeys<
    DocumentOccurrenceRecord,
    'unitInstanceId' | 'lease' | 'rootScopeId' | 'addresses' | 'registry' | 'assembly'
  >,
  HasOptionalKeys<DocumentOccurrenceRecord, 'parent'>,
  Equal<Property<DocumentOccurrenceRecord, 'unitInstanceId'>, string>,
  Equal<Property<DocumentOccurrenceRecord, 'lease'>, string>,
  Equal<
    Property<DocumentOccurrenceRecord, 'parent'>,
    DocumentOccurrenceParentLease | undefined
  >,
  Equal<Property<DocumentOccurrenceRecord, 'rootScopeId'>, string>,
  Equal<Property<DocumentOccurrenceRecord, 'addresses'>, readonly DocumentInstanceRef[]>,
  Equal<Property<DocumentOccurrenceRecord, 'registry'>, DocumentInstanceRegistry>,
  Equal<Property<DocumentOccurrenceRecord, 'assembly'>, DocumentOccurrenceAssembly>,
  AllReadonly<DocumentOccurrenceRecord>,
];

type OccurrenceRegistryAssertions = [
  HasRequiredKeys<
    DocumentOccurrenceRegistryPort,
    'reserve' | 'get' | 'beginClose' | 'commit' | 'release' | 'resolveHost' | 'list'
  >,
  HasRequiredKeys<OccurrenceReserveInput, 'unitInstanceId'>,
  HasOptionalKeys<OccurrenceReserveInput, 'parent'>,
  Equal<Property<OccurrenceReserveInput, 'unitInstanceId'>, string>,
  Equal<
    Property<OccurrenceReserveInput, 'parent'>,
    DocumentOccurrenceParentLease | undefined
  >,
  Equal<IsAnyOrUnknown<OccurrenceReserveOutput>, false>,
  HasRequiredKeys<OccurrenceReserveOutput, 'diagnostics'>,
  Equal<Property<OccurrenceReserveOutput, 'lease'>, string | undefined>,
  Equal<
    Property<OccurrenceReserveOutput, 'diagnostics'>,
    readonly RuntimeDiagnostic[]
  >,
  Equal<Property<MethodParameters<DocumentOccurrenceRegistryPort, 'get'>, 0>, string>,
  Equal<IsAny<OccurrenceGetOutput>, false>,
  Equal<OccurrenceGetOutput, DocumentOccurrenceRecord | undefined>,
  HasRequiredKeys<OccurrenceBeginCloseInput, 'unitInstanceId' | 'lease'>,
  Equal<Property<OccurrenceBeginCloseInput, 'unitInstanceId'>, string>,
  Equal<Property<OccurrenceBeginCloseInput, 'lease'>, string>,
  Equal<IsAny<OccurrenceBeginCloseOutput>, false>,
  Equal<OccurrenceBeginCloseOutput, BeginCloseResult>,
  Equal<
    Property<OccurrenceBeginCloseOutput, 'record'>,
    DocumentOccurrenceRecord | undefined
  >,
  Equal<
    Property<OccurrenceBeginCloseOutput, 'descendants'>,
    readonly DocumentOccurrenceRecord[] | undefined
  >,
  HasRequiredKeys<OccurrenceCommitInput, 'unitInstanceId' | 'lease' | 'record'>,
  Equal<Property<OccurrenceCommitInput, 'unitInstanceId'>, string>,
  Equal<Property<OccurrenceCommitInput, 'lease'>, string>,
  Equal<Property<OccurrenceCommitInput, 'record'>, DocumentOccurrenceRecord>,
  Equal<IsAny<OccurrenceCommitOutput>, false>,
  Equal<OccurrenceCommitOutput, DiagnosticResult>,
  HasRequiredKeys<OccurrenceReleaseInput, 'unitInstanceId' | 'lease'>,
  Equal<Property<OccurrenceReleaseInput, 'unitInstanceId'>, string>,
  Equal<Property<OccurrenceReleaseInput, 'lease'>, string>,
  Equal<IsAny<OccurrenceReleaseOutput>, false>,
  Equal<OccurrenceReleaseOutput, DiagnosticResult>,
  Equal<
    Property<MethodParameters<DocumentOccurrenceRegistryPort, 'resolveHost'>, 0>,
    DocumentInstanceRef
  >,
  Equal<IsAny<OccurrenceResolveHostOutput>, false>,
  Equal<OccurrenceResolveHostOutput, unknown>,
  Equal<Property<MethodParameters<DocumentOccurrenceRegistryPort, 'list'>, 'length'>, 0>,
  Equal<IsAny<OccurrenceListOutput>, false>,
  Equal<OccurrenceListOutput, readonly DocumentOccurrenceRecord[]>,
  IsReadonlyArray<OccurrenceListOutput>,
];

type OccurrenceRuntimeAssertions = [
  HasRequiredKeys<
    DocumentOccurrenceRuntime,
    'documentOccurrences' | 'documentRuntime'
  >,
  HasOptionalKeys<DocumentOccurrenceRuntime, 'documentAuthoring'>,
  Equal<
    Property<DocumentOccurrenceRuntime, 'documentOccurrences'>,
    DocumentOccurrenceRegistryPort
  >,
  Equal<Property<DocumentOccurrenceRuntime, 'documentRuntime'>, DocumentRuntimePort>,
  Equal<
    Property<DocumentOccurrenceRuntime, 'documentAuthoring'>,
    DocumentAuthoringHostPort | undefined
  >,
  Equal<keyof DocumentAuthoringHostPort, 'factory' | 'runtime'>,
  HasRequiredKeys<DocumentAuthoringHostPort, 'factory' | 'runtime'>,
  Equal<HasKey<DocumentOccurrenceRuntime, 'authoring'>, false>,
  Assignable<ClassViewRuntime, DocumentOccurrenceRuntime>,
  Assignable<ClassDocumentRuntimePort, DocumentRuntimePort>,
  AllReadonly<DocumentOccurrenceRuntime>,
];

type AuthoringAssemblyAssertions = [
  HasRequiredKeys<
    DocumentScopeRuntime,
    'documentOccurrences' | 'documentRuntime' | 'documentInstances' | 'authoring'
  >,
  Equal<Property<DocumentScopeRuntime, 'documentInstances'>, DocumentInstanceRegistry>,
  Equal<HasKey<DocumentScopeRuntime, 'documentAuthoring'>, false>,
  Equal<HasKey<Property<DocumentScopeRuntime, 'authoring'>, 'factory'>, false>,
  Equal<HasKey<Property<DocumentScopeRuntime, 'authoring'>, 'control'>, false>,
  AllReadonly<DocumentAuthoringHostPort>,
  AllReadonly<DocumentScopeRuntime>,
];

type OpenParameters = FunctionParameters<typeof openDocument>;
type CloseParameters = FunctionParameters<typeof closeDocument>;
type OpenInput = Property<OpenParameters, 1>;
type CloseInput = Property<CloseParameters, 1>;
type OpenConfig = Property<OpenParameters, 2>;
type CloseConfig = Property<CloseParameters, 2>;
type AssembleInput = Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 1>;
type AssemblyOutput = MethodReturn<DocumentRuntimePort, 'assembleOccurrence'>;
type AssemblyResult = Awaited<AssemblyOutput>;

type OpenCloseAssertions = [
  Equal<Property<OpenParameters, 'length'>, 3>,
  Equal<Property<CloseParameters, 'length'>, 3>,
  Equal<Property<OpenParameters, 0>, DocumentOccurrenceRuntime>,
  Equal<Property<CloseParameters, 0>, DocumentOccurrenceRuntime>,
  Equal<keyof OpenInput, 'definitionFqn' | 'context' | 'hostOccurrenceRef'>,
  HasRequiredKeys<OpenInput, 'definitionFqn' | 'context'>,
  Equal<Property<OpenInput, 'definitionFqn'>, UnitFqn>,
  Equal<Property<OpenInput, 'context'>, DocumentOpenContext>,
  Equal<Property<OpenInput, 'hostOccurrenceRef'>, DocumentInstanceRef | undefined>,
  AllReadonly<OpenInput>,
  Equal<keyof CloseInput, 'unitInstanceId' | 'lease'>,
  HasRequiredKeys<CloseInput, 'unitInstanceId' | 'lease'>,
  Equal<Property<CloseInput, 'unitInstanceId'>, string>,
  Equal<Property<CloseInput, 'lease'>, string>,
  AllReadonly<CloseInput>,
  Equal<OpenConfig, DocumentRuntimeConfig>,
  Equal<CloseConfig, DocumentRuntimeConfig>,
  Equal<OpenConfig, CloseConfig>,
  Equal<OpenConfig, Readonly<Record<string, never>>>,
  Equal<
    FunctionReturn<typeof openDocument>,
    Promise<DocumentInstanceHandle | DiagnosticResult>
  >,
  Equal<FunctionReturn<typeof closeDocument>, Promise<DiagnosticResult>>,
];

type RuntimePortAssertions = [
  HasRequiredKeys<
    DocumentRuntimePort,
    'resolveDefinition' | 'createRegistry' | 'assembleOccurrence'
  >,
  Equal<
    Property<MethodParameters<DocumentRuntimePort, 'resolveDefinition'>, 'length'>,
    1
  >,
  Equal<
    Property<MethodParameters<DocumentRuntimePort, 'resolveDefinition'>, 0>,
    UnitFqn
  >,
  Equal<
    MethodReturn<DocumentRuntimePort, 'resolveDefinition'>,
    DocumentUnitPlan | undefined
  >,
  Equal<Property<MethodParameters<DocumentRuntimePort, 'createRegistry'>, 'length'>, 0>,
  Equal<MethodReturn<DocumentRuntimePort, 'createRegistry'>, DocumentInstanceRegistry>,
  Equal<Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 'length'>, 3>,
  Equal<IsAny<Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 0>>, false>,
  Equal<
    Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 0>,
    DocumentScopeRuntime
  >,
  Equal<Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 2>, DocumentRuntimeConfig>,
  Equal<IsAnyOrUnknown<AssembleInput>, false>,
  HasRequiredKeys<
    AssembleInput,
    'plan' | 'effectiveSource' | 'context' | 'addresses'
  >,
  Equal<Property<AssembleInput, 'plan'>, DocumentUnitPlan>,
  Equal<Property<AssembleInput, 'effectiveSource'>, Property<DocumentUnitPlan, 'source'>>,
  Equal<Property<AssembleInput, 'context'>, DocumentOpenContext>,
  Equal<Property<AssembleInput, 'addresses'>, readonly DocumentInstanceRef[]>,
  Equal<HasKey<AssembleInput, 'registry'>, false>,
  Equal<HasKey<AssembleInput, 'authoring'>, false>,
  Equal<HasKey<AssembleInput, 'proposal'>, false>,
  Equal<HasKey<AssembleInput, 'control'>, false>,
  Equal<ContainsFunction<AssembleInput>, false>,
  Equal<IsAnyOrUnknown<AssemblyOutput>, false>,
  Equal<
    AssemblyOutput,
    DocumentOccurrenceAssembly | Promise<DocumentOccurrenceAssembly>
  >,
  Equal<IsAnyOrUnknown<AssemblyResult>, false>,
  Equal<AssemblyResult, DocumentOccurrenceAssembly>,
  AllReadonly<DocumentRuntimePort>,
];

type RuntimeConfigAssertions = [
  Equal<DocumentRuntimeConfig, Readonly<Record<string, never>>>,
  Equal<keyof DocumentRuntimeConfig, string>,
  Equal<Property<DocumentRuntimeConfig, 'definitions'>, never>,
  Equal<Property<DocumentRuntimeConfig, 'createRegistry'>, never>,
  Equal<Property<DocumentRuntimeConfig, 'assembleOccurrence'>, never>,
];

type PublicSurfaceAssertions = [
  ...PlanAssertions,
  ...EmbeddedPlanAssertions,
  ...AddressDescriptorAssertions,
  ...OpenContextAssertions,
  ...InstanceRefAssertions,
  ...InstanceHandleAssertions,
  ...DiagnosticAssertions,
  ...InstanceRegistryAssertions,
  ...OccurrenceAssemblyAssertions,
  ...OccurrenceRecordAssertions,
  ...OccurrenceRegistryAssertions,
  ...OccurrenceRuntimeAssertions,
  ...AuthoringAssemblyAssertions,
  ...OpenCloseAssertions,
  ...RuntimePortAssertions,
  ...RuntimeConfigAssertions,
];

type PublicSurfaceAssertionsPass = PublicSurfaceAssertions extends readonly true[]
  ? true
  : false;
type OpenContextMustConform = Expect<OpenContextAssertions extends readonly true[] ? true : false>;
type OccurrenceRuntimeMustConform = Expect<
  OccurrenceRuntimeAssertions extends readonly true[] ? true : false
>;
type OccurrenceParentLeaseMustConform = Expect<
  OccurrenceParentLeaseAssertions extends readonly true[] ? true : false
>;
type AuthoringAssemblyMustConform = Expect<
  AuthoringAssemblyAssertions extends readonly true[] ? true : false
>;
type RuntimePortMustConform = Expect<RuntimePortAssertions extends readonly true[] ? true : false>;
type AssembleRuntimeParameterMustConform = Expect<Equal<
  Property<MethodParameters<DocumentRuntimePort, 'assembleOccurrence'>, 0>,
  DocumentScopeRuntime
>>;
type AssembleInputMustContainNoFunction = Expect<Equal<ContainsFunction<AssembleInput>, false>>;
type PublicSurfaceMustConform = Expect<PublicSurfaceAssertionsPass>;

void [openDocument, closeDocument];
void (undefined as unknown as PublicSurfaceAssertions);
void (undefined as unknown as PublicSurfaceMustConform);
void (undefined as unknown as OpenContextMustConform);
void (undefined as unknown as OccurrenceRuntimeMustConform);
void (undefined as unknown as OccurrenceParentLeaseMustConform);
void (undefined as unknown as AuthoringAssemblyMustConform);
void (undefined as unknown as RuntimePortMustConform);
void (undefined as unknown as AssembleRuntimeParameterMustConform);
void (undefined as unknown as AssembleInputMustContainNoFunction);
void (undefined as unknown as DocumentAddressDescriptorMustNotBeAny);
void (undefined as unknown as DocumentEmbeddedUnitPlanMustNotBeAny);
void (undefined as unknown as DocumentInstanceHandleMustNotBeAny);
void (undefined as unknown as DocumentInstanceRefMustNotBeAny);
void (undefined as unknown as DocumentInstanceRegistryMustNotBeAny);
void (undefined as unknown as DocumentOccurrenceAssemblyMustNotBeAny);
void (undefined as unknown as DocumentOccurrenceParentLeaseMustNotBeAny);
void (undefined as unknown as DocumentOccurrenceRecordMustNotBeAny);
void (undefined as unknown as DocumentOccurrenceRegistryPortMustNotBeAny);
void (undefined as unknown as DocumentOccurrenceRuntimeMustNotBeAny);
void (undefined as unknown as DocumentOpenContextMustNotBeAny);
void (undefined as unknown as DocumentRuntimeConfigMustNotBeAny);
void (undefined as unknown as DocumentRuntimePortMustNotBeAny);
void (undefined as unknown as DocumentUnitPlanMustNotBeAny);
void (undefined as unknown as DiagnosticResultMustNotBeAny);
void (undefined as unknown as OpenDocumentMustNotBeAny);
void (undefined as unknown as CloseDocumentMustNotBeAny);
