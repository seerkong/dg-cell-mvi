import {
  FLOW_UNIT_KINDS,
  FRONTEND_UNIT_KINDS,
  UNIT_KINDS,
  asHalfcodeRef,
  asUnitFqn,
  formatDocumentInstanceRef,
  parseDocumentInstanceRef,
  type AppBundleUnitRef,
  type DocumentAddressDescriptor,
  type DocumentContractSpec,
  type DocumentInstanceRef,
  type DocumentSourceDescriptor,
  type DocumentUnitManifest,
  type HalfcodeDocument,
  type HalfcodeUnitManifest,
  type UnitContractSpec,
  type UnitKind,
  type UnitLayer,
} from 'dg-cell-mvi-halfcode-contract';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

type CanonicalFrontendKinds = Expect<
  Equal<(typeof FRONTEND_UNIT_KINDS)[number], 'page' | 'component' | 'document'>
>;
type CanonicalFlowKinds = Expect<
  Equal<
    (typeof FLOW_UNIT_KINDS)[number],
    'instant-ctrl-flow' | 'work-ctrl-flow' | 'bp-ctrl-flow' | 'eager-data-flow'
  >
>;
type CanonicalUnitKinds = Expect<Equal<(typeof UNIT_KINDS)[number], UnitKind>>;
type CanonicalUnitLayer = Expect<Equal<UnitLayer, UnitKind | 'app'>>;

type DocumentRejectsUrlInputs = Expect<Equal<HasKey<DocumentContractSpec, 'urlInputs'>, false>>;
type DocumentRejectsProps = Expect<Equal<HasKey<DocumentContractSpec, 'props'>, false>>;
type DocumentRejectsSlots = Expect<Equal<HasKey<DocumentContractSpec, 'slots'>, false>>;
type DocumentRejectsExposes = Expect<Equal<HasKey<DocumentContractSpec, 'exposes'>, false>>;
type DocumentModeIsClosed = Expect<Equal<DocumentContractSpec['mode'], 'view' | 'edit'>>;
type DocumentSourceIsTypeDescriptor = Expect<
  Equal<DocumentContractSpec['source'], string | undefined>
>;
type DocumentRevisionIsTypeDescriptor = Expect<
  Equal<DocumentContractSpec['revision'], string | undefined>
>;
type DocumentSourceKindsAreClosed = Expect<
  Equal<DocumentSourceDescriptor['kind'], 'inline' | 'external'>
>;
type StaticAddressRejectsInstanceId = Expect<
  Equal<HasKey<DocumentAddressDescriptor, 'unitInstanceId'>, false>
>;
type StaticAddressRejectsRuntimeTarget = Expect<
  Equal<HasKey<DocumentAddressDescriptor, 'target'>, false>
>;

const documentManifest = {
  kind: 'document',
  fqn: asUnitFqn('dg.docs.SystemDesign'),
  version: '1',
  description: 'Architecture document',
} satisfies DocumentUnitManifest;

const genericManifest: HalfcodeUnitManifest = documentManifest;
const bundleRef: AppBundleUnitRef = {
  kind: 'document',
  fqn: documentManifest.fqn,
  src: asHalfcodeRef('vfs://./documents/system-design.xnl'),
};

const documentContract = {
  kind: 'document-contract',
  fqn: documentManifest.fqn,
  mode: 'edit',
  source: 'xnl-source-ref',
  revision: 'string?',
  parameters: { locale: 'string?', audience: 'string?' },
  accepts: [{ ref: asHalfcodeRef('command://#document.refresh') }],
  sends: [{ ref: asHalfcodeRef('event://#document.changed') }],
  elementContracts: [{ id: 'review-panel' }],
  metadata: { owner: 'architecture' },
} satisfies DocumentContractSpec;

const genericContract: UnitContractSpec = documentContract;

const invalidUrlInputs = {
  ...documentContract,
  // @ts-expect-error Document does not inherit the Page URL channel.
  urlInputs: { path: { id: 'string' } },
} satisfies DocumentContractSpec;
const invalidProps = {
  ...documentContract,
  // @ts-expect-error Document does not inherit Component props.
  props: { title: 'string' },
} satisfies DocumentContractSpec;
const invalidSlots = {
  ...documentContract,
  // @ts-expect-error Document does not inherit Component slots.
  slots: [{ id: 'toolbar' }],
} satisfies DocumentContractSpec;
const invalidExposes = {
  ...documentContract,
  // @ts-expect-error Document does not inherit Component exposes.
  exposes: { selection: 'string[]' },
} satisfies DocumentContractSpec;

const inlineSource = {
  kind: 'inline',
  unitSourceRef: bundleRef.src,
  region: 'body',
} satisfies DocumentSourceDescriptor;
const externalSource = {
  kind: 'external',
  ref: asHalfcodeRef('vfs://./domain/system-design.xnl'),
} satisfies DocumentSourceDescriptor;

const invalidInlineSource: DocumentSourceDescriptor = {
  kind: 'inline',
  // @ts-expect-error Inline source requires its Unit source ref and body region.
  ref: asHalfcodeRef('vfs://./domain/system-design.xnl'),
};
const invalidExternalSource: DocumentSourceDescriptor = {
  kind: 'external',
  // @ts-expect-error External source carries only the external ref.
  unitSourceRef: bundleRef.src,
  region: 'body',
};

const staticAddress = {
  projectionRole: 'main',
  xId: 'heading-editor',
  documentNodeId: 'heading-tree-node',
  scopeId: 'document-root',
  metadata: { source: 'xnl' },
} satisfies DocumentAddressDescriptor;
const runtimeAddress = {
  unitInstanceId: 'system-design-01',
  projectionRole: staticAddress.projectionRole,
  xId: staticAddress.xId,
} satisfies DocumentInstanceRef;

const runtimeUri = formatDocumentInstanceRef(runtimeAddress);
const parsedRuntimeAddress: DocumentInstanceRef = parseDocumentInstanceRef(runtimeUri);

const treeIdentityIsNotRuntimeIdentity: DocumentInstanceRef = {
  // @ts-expect-error #id tree identity cannot stand in for a runtime DocumentInstanceRef.
  documentNodeId: staticAddress.documentNodeId,
};
const staticAddressWithInstance: DocumentAddressDescriptor = {
  ...staticAddress,
  // @ts-expect-error Static definition addresses cannot bind an occurrence id.
  unitInstanceId: runtimeAddress.unitInstanceId,
};

const legacyDocument: HalfcodeDocument = {
  kind: 'HalfcodeDocument',
  apiVersion: 'halfcode.dg-cell-mvi/v1',
  product: { id: 'legacy.product', version: '1' },
  modules: [],
  materials: [],
};

// @ts-expect-error Legacy HalfcodeDocument is not a v3 Document Unit manifest.
const legacyAsDocumentManifest: DocumentUnitManifest = legacyDocument;
// @ts-expect-error A v3 Document Unit manifest is not the legacy canonical document artifact.
const documentManifestAsLegacy: HalfcodeDocument = documentManifest;

void [
  genericManifest,
  bundleRef,
  genericContract,
  invalidUrlInputs,
  invalidProps,
  invalidSlots,
  invalidExposes,
  inlineSource,
  externalSource,
  invalidInlineSource,
  invalidExternalSource,
  staticAddress,
  runtimeAddress,
  parsedRuntimeAddress,
  treeIdentityIsNotRuntimeIdentity,
  staticAddressWithInstance,
  legacyAsDocumentManifest,
  documentManifestAsLegacy,
];

type ContractAssertions = [
  CanonicalFrontendKinds,
  CanonicalFlowKinds,
  CanonicalUnitKinds,
  CanonicalUnitLayer,
  DocumentRejectsUrlInputs,
  DocumentRejectsProps,
  DocumentRejectsSlots,
  DocumentRejectsExposes,
  DocumentModeIsClosed,
  DocumentSourceIsTypeDescriptor,
  DocumentRevisionIsTypeDescriptor,
  DocumentSourceKindsAreClosed,
  StaticAddressRejectsInstanceId,
  StaticAddressRejectsRuntimeTarget,
];

void (undefined as unknown as ContractAssertions);
