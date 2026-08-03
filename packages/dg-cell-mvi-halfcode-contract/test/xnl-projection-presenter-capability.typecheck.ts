import type {
  XnlProjectionPresenterAsyncMethod,
  XnlProjectionPresenterCapabilityGrant,
  XnlProjectionPresenterCapabilityProtocol,
  XnlProjectionPresenterContainedMethodValue,
  XnlProjectionPresenterEditIntent,
  XnlProjectionPresenterMethodGrant,
  XnlProjectionPresenterMethodKey,
  XnlProjectionPresenterOutput,
  XnlProjectionPresenterReadonlyView,
  XnlProjectionPresenterRuntimeFacet,
  XnlProjectionPresenterRuntimeFacetConstructionConfig,
  XnlProjectionPresenterRuntimeFacetConstructionInput,
  XnlProjectionPresenterRuntimeFacetConstructionRuntime,
  XnlProjectionPresenterSnapshotGrant,
  XnlProjectionPresenterSnapshotKey,
  XnlProjectionPresenterSyncMethod,
} from 'dg-cell-mvi-halfcode-contract';

type Equal<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends
  (<TValue>() => TValue extends TRight ? 1 : 2)
    ? true
    : false;
type Expect<TValue extends true> = TValue;
type WritableKeys<TValue> = {
  [TKey in keyof TValue]-?: Equal<
    { [TCandidate in TKey]: TValue[TKey] },
    { -readonly [TCandidate in TKey]: TValue[TKey] }
  > extends true
    ? TKey
    : never;
}[keyof TValue];
type IsReadonlyArray<TValue> = TValue extends readonly unknown[]
  ? TValue extends unknown[]
    ? false
    : true
  : false;

interface PresenterHost {
  readonly title: string;
  readonly details: { readonly labels: readonly string[] };
  readPreview(id: string): { readonly title: string };
  translator: { translate(): void };
  authoringSession: { submit(): void };
  submit(): void;
}

interface RelatedView {
  readonly title: string;
}

interface PresenterView {
  readonly title: string;
  readonly details: { readonly labels: readonly string[] };
  readonly readPreview: XnlProjectionPresenterSyncMethod<
    readonly [id: string],
    { readonly title: string },
    RelatedView
  >;
}

type ReadonlyView = XnlProjectionPresenterReadonlyView<PresenterView>;
type Grant = XnlProjectionPresenterCapabilityGrant<PresenterHost, PresenterView>;
type SnapshotGrant = XnlProjectionPresenterSnapshotGrant<
  PresenterHost,
  PresenterView,
  'title',
  'title'
>;
type MethodGrant = XnlProjectionPresenterMethodGrant<
  PresenterHost,
  PresenterView,
  'readPreview',
  'readPreview'
>;

type CapabilityAssertions = [
  Expect<Equal<Grant['kind'], 'snapshot' | 'method'>>,
  Expect<Equal<SnapshotGrant['kind'], 'snapshot'>>,
  Expect<Equal<MethodGrant['kind'], 'method'>>,
  Expect<Equal<XnlProjectionPresenterSnapshotKey<PresenterHost>, 'title' | 'details'>>,
  Expect<Equal<XnlProjectionPresenterMethodKey<PresenterHost>, 'readPreview' | 'submit'>>,
  Expect<Equal<Extract<Grant['kind'], 'raw-object' | 'identity' | 'spread-source'>, never>>,
  Expect<Equal<keyof ReadonlyView, keyof PresenterView>>,
  Expect<Equal<WritableKeys<ReadonlyView>, never>>,
  Expect<Equal<WritableKeys<ReadonlyView['details']>, never>>,
  Expect<Equal<IsReadonlyArray<ReadonlyView['details']['labels']>, true>>,
];

declare const protocol: XnlProjectionPresenterCapabilityProtocol<PresenterHost, PresenterView>;
declare const host: PresenterHost;
declare const facet: XnlProjectionPresenterRuntimeFacet<PresenterView>;

const constructionRuntime: XnlProjectionPresenterRuntimeFacetConstructionRuntime<
  PresenterHost,
  PresenterView
> = { source: host, protocol };
const constructionInput: XnlProjectionPresenterRuntimeFacetConstructionInput = {};
const constructionConfig: XnlProjectionPresenterRuntimeFacetConstructionConfig = {};

facet.view.title;
facet.view.readPreview('node-1');
// @ts-expect-error The exact view does not expose ungranted host authority.
facet.view.translator;
// @ts-expect-error The exact view does not expose an authoring session.
facet.view.authoringSession;
// @ts-expect-error The exact view does not expose submit authority.
facet.view.submit;
// @ts-expect-error Projected snapshots are readonly.
facet.view.details.labels = [];

const invalidConstructionInput: XnlProjectionPresenterRuntimeFacetConstructionInput = {
  // @ts-expect-error Source authority belongs in the runtime argument.
  source: host,
};
const invalidConstructionConfig: XnlProjectionPresenterRuntimeFacetConstructionConfig = {
  // @ts-expect-error Protocol authority belongs in the runtime argument.
  protocol,
};

type PreviewValue = XnlProjectionPresenterContainedMethodValue<
  { readonly title: string },
  RelatedView
>;
type PreviewSync = XnlProjectionPresenterSyncMethod<
  readonly [id: string],
  { readonly title: string },
  RelatedView
>;
type PreviewAsync = XnlProjectionPresenterAsyncMethod<
  readonly [id: string],
  { readonly title: string },
  RelatedView
>;

declare const syncPreview: PreviewSync;
declare const asyncPreview: PreviewAsync;
const syncResult: PreviewValue = syncPreview('node-1');
const asyncResult: Promise<PreviewValue> = asyncPreview('node-1');

function consumeContainedValue(result: PreviewValue): string {
  return result.title;
}

// @ts-expect-error Method failures throw a closed diagnostic; no result envelope is returned.
syncResult.ok;

const interactionIntent: XnlProjectionPresenterEditIntent = {
  kind: 'interaction',
  proposal: {
    type: 'edit-title',
    target: { planNodeId: 'xnlp:node:doc' },
    payload: { title: 'Draft' },
  },
};
const commandIntent: XnlProjectionPresenterEditIntent = {
  kind: 'command',
  proposal: {
    type: 'domain.update-title',
    target: { path: ['Document'], nodeId: 'doc' },
    payload: { title: 'Draft' },
  },
};
const invalidSubmitIntent: XnlProjectionPresenterEditIntent = {
  kind: 'interaction',
  proposal: {
    type: 'edit-title',
    target: { planNodeId: 'xnlp:node:doc' },
    // @ts-expect-error Edit-intent proposal data cannot carry submit authority.
    submit: () => undefined,
  },
};
const invalidSessionIntent: XnlProjectionPresenterEditIntent = {
  kind: 'command',
  proposal: {
    type: 'domain.update-title',
    target: { path: ['Document'], nodeId: 'doc' },
    // @ts-expect-error Edit-intent proposal data cannot carry an authoring session.
    authoringSession: host.authoringSession,
  },
};

const surfaceOutput: XnlProjectionPresenterOutput<{ readonly title: string }> = {
  surfaceId: 'plain-record',
  value: { title: 'Rendered title' },
};

void [
  constructionRuntime,
  constructionInput,
  constructionConfig,
  invalidConstructionInput,
  invalidConstructionConfig,
  syncResult,
  asyncResult,
  consumeContainedValue,
  interactionIntent,
  commandIntent,
  invalidSubmitIntent,
  invalidSessionIntent,
  surfaceOutput,
];
void (undefined as unknown as CapabilityAssertions);
