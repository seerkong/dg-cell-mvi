import {
  createDefaultHalfcodeRuntime,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterMethodGrant,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type XnlProjectionPresenterReadonlyView,
  type XnlProjectionPresenterRuntimeFacet,
} from 'dg-cell-mvi-halfcode-support';

const EMPTY = Object.freeze({});
const source = Object.freeze({ title: 'Document', hostOnly: 'excluded' });
type TitleView = { readonly title: string };
const titleGrant = createXnlProjectionPresenterSnapshotGrant<
  typeof source,
  TitleView,
  'title',
  'title'
>(
  EMPTY,
  {
    id: 'presenter.grant.package-root-type-smoke-title',
    sourceKey: 'title',
    facadeKey: 'title',
  },
  EMPTY,
);
const protocol = createXnlProjectionPresenterCapabilityProtocol<
  typeof source,
  TitleView
>(
  EMPTY,
  { id: 'presenter.protocol.package-root-type-smoke', grants: [titleGrant] },
  EMPTY,
);

createXnlProjectionPresenterSnapshotGrant<
  typeof source,
  { readonly title: number },
  // @ts-expect-error snapshot source and facade values must be compatible.
  'title',
  'title'
>(
  EMPTY,
  { id: 'presenter.grant.invalid-snapshot-shape', sourceKey: 'title', facadeKey: 'title' },
  EMPTY,
);

type MethodHost = Readonly<{
  loadPreview(input: { readonly id: string }): Promise<{ readonly title: string }>;
}>;
type DirectMethodView = Readonly<{
  readPreview(input: { readonly id: string }): Promise<{ readonly title: string }>;
}>;
const methodSource: MethodHost = {
  async loadPreview(input) {
    return { title: input.id };
  },
};
const methodGrant = createXnlProjectionPresenterMethodGrant<
  MethodHost,
  DirectMethodView,
  'loadPreview',
  'readPreview'
>(
  EMPTY,
  {
    id: 'presenter.grant.package-root-type-smoke-method',
    sourceKey: 'loadPreview',
    facadeKey: 'readPreview',
  },
  EMPTY,
);
const methodProtocol = createXnlProjectionPresenterCapabilityProtocol<MethodHost, DirectMethodView>(
  EMPTY,
  { id: 'presenter.protocol.direct-method-shape', grants: [methodGrant] },
  EMPTY,
);
const methodFacet = createXnlProjectionPresenterRuntimeFacet(
  { source: methodSource, protocol: methodProtocol },
  EMPTY,
  EMPTY,
);

async function consumeDirectMethodResult(): Promise<string> {
  const result = await methodFacet.view.readPreview({ id: 'node-1' });
  // @ts-expect-error Presenter methods return a contained value, not a result envelope.
  result.ok;
  return result.title;
}

type DifferentMethodView = Readonly<{
  inspectPreview(input: { readonly id: string }): Promise<{ readonly title: string }>;
}>;
createXnlProjectionPresenterCapabilityProtocol<MethodHost, DifferentMethodView>(
  EMPTY,
  {
    id: 'presenter.protocol.invalid-view-grant-pair',
    grants: [
      // @ts-expect-error a grant owned by DirectMethodView cannot enter another view protocol.
      methodGrant,
    ],
  },
  EMPTY,
);

type UnknownMethodHost = Readonly<{
  loadPreview(input: { readonly id: string }): Promise<unknown>;
}>;
createXnlProjectionPresenterMethodGrant<
  UnknownMethodHost,
  DirectMethodView,
  // @ts-expect-error unknown host results cannot be narrowed into a titled facade result.
  'loadPreview',
  'readPreview'
>(
  EMPTY,
  {
    id: 'presenter.grant.invalid-host-result-narrowing',
    sourceKey: 'loadPreview',
    facadeKey: 'readPreview',
  },
  EMPTY,
);

type SafeSnapshot = Readonly<{ title: string }>;
type AlternateSafeSnapshot = Readonly<{ count: number }>;
type AuthorityObject = Readonly<{
  mutate(): void;
}>;
type MixedAuthorityHost = Readonly<{
  load(): Promise<SafeSnapshot | AuthorityObject>;
}>;
type SafeSnapshotOnlyView = Readonly<{
  read(): Promise<SafeSnapshot>;
}>;
createXnlProjectionPresenterMethodGrant<
  MixedAuthorityHost,
  SafeSnapshotOnlyView,
  // @ts-expect-error an unsafe authority union member cannot be erased to narrow the facade result.
  'load',
  'read'
>(
  EMPTY,
  {
    id: 'presenter.grant.invalid-mixed-authority-result-narrowing',
    sourceKey: 'load',
    facadeKey: 'read',
  },
  EMPTY,
);

type ForeignView = Readonly<{
  execute(): void;
}>;
type MixedForeignViewHost = Readonly<{
  load(): Promise<SafeSnapshot | XnlProjectionPresenterReadonlyView<ForeignView>>;
}>;
createXnlProjectionPresenterMethodGrant<
  MixedForeignViewHost,
  SafeSnapshotOnlyView,
  // @ts-expect-error a foreign-view union member cannot be erased to narrow the facade result.
  'load',
  'read'
>(
  EMPTY,
  {
    id: 'presenter.grant.invalid-mixed-foreign-view-result-narrowing',
    sourceKey: 'load',
    facadeKey: 'read',
  },
  EMPTY,
);

type SafeUnionHost = Readonly<{
  load(): Promise<SafeSnapshot | AlternateSafeSnapshot>;
}>;
type SafeUnionView = Readonly<{
  read(): Promise<SafeSnapshot | AlternateSafeSnapshot>;
}>;
const safeUnionGrant = createXnlProjectionPresenterMethodGrant<
  SafeUnionHost,
  SafeUnionView,
  'load',
  'read'
>(
  EMPTY,
  {
    id: 'presenter.grant.safe-snapshot-union',
    sourceKey: 'load',
    facadeKey: 'read',
  },
  EMPTY,
);

interface SameViewResultView {
  readonly title: string;
  readonly read: () => Promise<SafeSnapshot | XnlProjectionPresenterReadonlyView<SameViewResultView>>;
}
type SameViewResultHost = Readonly<{
  load(): Promise<SafeSnapshot | XnlProjectionPresenterReadonlyView<SameViewResultView>>;
}>;
const sameViewResultGrant = createXnlProjectionPresenterMethodGrant<
  SameViewResultHost,
  SameViewResultView,
  'load',
  'read'
>(
  EMPTY,
  {
    id: 'presenter.grant.safe-snapshot-same-view-union',
    sourceKey: 'load',
    facadeKey: 'read',
  },
  EMPTY,
);

createXnlProjectionPresenterMethodGrant<
  MethodHost,
  {
    readonly readPreview: (
      input: { readonly id: string },
    ) => Promise<Readonly<{ ok: true; kind: 'snapshot'; value: { readonly title: string } }>>;
  },
  // @ts-expect-error Presenter methods return contained values directly, never a result envelope.
  'loadPreview',
  'readPreview'
>(
  EMPTY,
  {
    id: 'presenter.grant.invalid-envelope-method',
    sourceKey: 'loadPreview',
    facadeKey: 'readPreview',
  },
  EMPTY,
);

createXnlProjectionPresenterMethodGrant<
  MethodHost,
  {
    readonly readPreview: (input: { readonly index: number }) => Promise<{ readonly title: string }>;
  },
  // @ts-expect-error the facade method arguments must match the granted host method arguments.
  'loadPreview',
  'readPreview'
>(
  EMPTY,
  {
    id: 'presenter.grant.invalid-method-arguments',
    sourceKey: 'loadPreview',
    facadeKey: 'readPreview',
  },
  EMPTY,
);
const facet: XnlProjectionPresenterRuntimeFacet<{ readonly title: string }> =
  createXnlProjectionPresenterRuntimeFacet(
    { source, protocol },
    EMPTY,
    EMPTY,
  );

facet.view.title satisfies string;
// @ts-expect-error ungranted host fields are not part of the Presenter facade type.
facet.view.hostOnly;
// @ts-expect-error the legacy raw-object factory call has no public overload.
createXnlProjectionPresenterRuntimeFacet(source);

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type SafeUnionDirectResult = Expect<
  Equal<
    Awaited<ReturnType<XnlProjectionPresenterReadonlyView<SafeUnionView>['read']>>,
    SafeSnapshot | AlternateSafeSnapshot
  >
>;
type SameViewUnionDirectResult = Expect<
  Equal<
    Awaited<ReturnType<XnlProjectionPresenterReadonlyView<SameViewResultView>['read']>>,
    SafeSnapshot | XnlProjectionPresenterReadonlyView<SameViewResultView>
  >
>;

const safeUnionDirectResult: SafeUnionDirectResult = true;
const sameViewUnionDirectResult: SameViewUnionDirectResult = true;
void safeUnionGrant;
void sameViewResultGrant;
void safeUnionDirectResult;
void sameViewUnionDirectResult;

const hostScope = createDefaultHalfcodeRuntime('host');
const boundScope = hostScope.bindScope({
  scopeId: 'child',
  runtime: hostScope,
  bindings: {},
});
type ScopePresenterView = Readonly<{
  scopeId: string;
}>;
const scopeIdGrant = createXnlProjectionPresenterSnapshotGrant<
  typeof boundScope,
  ScopePresenterView,
  'scopeId',
  'scopeId'
>(
  EMPTY,
  {
    id: 'presenter.grant.scope-polymorphism-scope-id',
    sourceKey: 'scopeId',
    facadeKey: 'scopeId',
  },
  EMPTY,
);
const scopeProtocol = createXnlProjectionPresenterCapabilityProtocol<
  typeof boundScope,
  ScopePresenterView
>(
  EMPTY,
  {
    id: 'presenter.protocol.scope-polymorphism',
    grants: [scopeIdGrant],
  },
  EMPTY,
);
const scopeFacet = createXnlProjectionPresenterRuntimeFacet(
  { source: boundScope, protocol: scopeProtocol },
  EMPTY,
  EMPTY,
);

scopeFacet.view.scopeId satisfies string;
// @ts-expect-error the projected Scope facade is readonly.
scopeFacet.view.scopeId = 'other';
// @ts-expect-error ungranted Scope parent identity is excluded.
scopeFacet.view.parent;
// @ts-expect-error ungranted Scope binding authority is excluded.
scopeFacet.view.localBindings;
// @ts-expect-error Scope derivation authority is not part of the Presenter facade.
scopeFacet.view.deriveScope;
// @ts-expect-error unrelated Scope graph capability is not part of the Presenter facade.
scopeFacet.view.graph;

type ScopeFacadeHasExactKeys = Expect<
  Equal<keyof typeof scopeFacet.view, 'scopeId'>
>;

const scopeFacadeHasExactKeys: ScopeFacadeHasExactKeys = true;
void scopeFacadeHasExactKeys;
void consumeDirectMethodResult;
