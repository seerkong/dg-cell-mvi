import type { XnlProjectionDiagnostic } from './diagnostics';
import type { XnlProjectionPlanNode } from './plan';
import type { XnlProjectionProcessor } from './dialect';
import type {
  XnlProjectionDomainCommand,
  XnlProjectionInteraction,
} from './interaction';
import type { XnlProjectionSerializableRecord, XnlProjectionSerializableValue } from './serializable';

declare const XNL_PROJECTION_PRESENTER_GRANT_OWNER: unique symbol;
declare const XNL_PROJECTION_PRESENTER_PROTOCOL_OWNER: unique symbol;
declare const XNL_PROJECTION_PRESENTER_RUNTIME_FACET: unique symbol;

export type XnlProjectionPresenterDeepReadonly<TValue> =
  TValue extends (...args: infer TArgs) => infer TResult
    ? (...args: TArgs) => TResult
    : TValue extends readonly (infer TItem)[]
      ? readonly XnlProjectionPresenterDeepReadonly<TItem>[]
      : TValue extends object
        ? { readonly [TKey in keyof TValue]: XnlProjectionPresenterDeepReadonly<TValue[TKey]> }
        : TValue;

/** The projected key set is exactly TView's key set; runtime construction enforces the same shape. */
export type XnlProjectionPresenterReadonlyView<TView extends object> = {
  readonly [TKey in keyof TView]: XnlProjectionPresenterDeepReadonly<TView[TKey]>;
};

export type XnlProjectionPresenterSnapshotKey<TValue extends object> = {
  [TKey in keyof TValue]-?: TValue[TKey] extends XnlProjectionSerializableValue
    ? TKey
    : never;
}[keyof TValue];

export type XnlProjectionPresenterMethodKey<TValue extends object> = {
  [TKey in keyof TValue]-?: TValue[TKey] extends (...args: never[]) => unknown
    ? TKey
    : never;
}[keyof TValue];

export interface XnlProjectionPresenterSnapshotGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends
    XnlProjectionPresenterSnapshotKey<THost> = XnlProjectionPresenterSnapshotKey<THost>,
  TFacadeKey extends
    XnlProjectionPresenterSnapshotKey<TView> = XnlProjectionPresenterSnapshotKey<TView>,
> {
  readonly id: string;
  readonly kind: 'snapshot';
  readonly sourceKey: TSourceKey;
  readonly facadeKey: TFacadeKey;
  readonly [XNL_PROJECTION_PRESENTER_GRANT_OWNER]: Readonly<{
    host: THost;
    view: TView;
    sourceKey: TSourceKey;
    facadeKey: TFacadeKey;
  }>;
}

export interface XnlProjectionPresenterMethodGrant<
  THost extends object,
  TView extends object,
  TSourceKey extends
    XnlProjectionPresenterMethodKey<THost> = XnlProjectionPresenterMethodKey<THost>,
  TFacadeKey extends
    XnlProjectionPresenterMethodKey<TView> = XnlProjectionPresenterMethodKey<TView>,
> {
  readonly id: string;
  readonly kind: 'method';
  readonly sourceKey: TSourceKey;
  readonly facadeKey: TFacadeKey;
  readonly [XNL_PROJECTION_PRESENTER_GRANT_OWNER]: Readonly<{
    host: THost;
    view: TView;
    sourceKey: TSourceKey;
    facadeKey: TFacadeKey;
    sourceMethod: THost[TSourceKey];
    facadeMethod: TView[TFacadeKey];
  }>;
}

export type XnlProjectionPresenterCapabilityGrant<
  THost extends object,
  TView extends object,
> =
  | XnlProjectionPresenterSnapshotGrant<THost, TView>
  | XnlProjectionPresenterMethodGrant<THost, TView>;

/** Nominal protocol evidence returned by the support-owned protocol factory. */
export interface XnlProjectionPresenterCapabilityProtocol<
  THost extends object,
  TView extends object,
> {
  readonly id: string;
  readonly grants: readonly XnlProjectionPresenterCapabilityGrant<THost, TView>[];
  readonly [XNL_PROJECTION_PRESENTER_PROTOCOL_OWNER]: Readonly<{
    host: THost;
    view: TView;
  }>;
}

export type XnlProjectionPresenterCapabilityDiagnosticCode =
  | 'INVALID_XNL_PROJECTION_PRESENTER_PROTOCOL'
  | 'UNKNOWN_XNL_PROJECTION_PRESENTER_PROTOCOL'
  | 'INVALID_XNL_PROJECTION_PRESENTER_GRANT'
  | 'UNKNOWN_XNL_PROJECTION_PRESENTER_GRANT'
  | 'INVALID_XNL_PROJECTION_PRESENTER_RUNTIME_FACET'
  | 'INVALID_XNL_PROJECTION_PRESENTER_METHOD_ARGUMENT'
  | 'INVALID_XNL_PROJECTION_PRESENTER_METHOD_RESULT'
  | 'XNL_PROJECTION_PRESENTER_METHOD_REJECTED';

export type XnlProjectionPresenterCapabilityDiagnostic = Readonly<
  Omit<XnlProjectionDiagnostic, 'code'> & {
    code: XnlProjectionPresenterCapabilityDiagnosticCode;
  }
>;

export type XnlProjectionPresenterContainedMethodValue<
  TSnapshot extends XnlProjectionSerializableValue = XnlProjectionSerializableValue,
  TView extends object = Record<PropertyKey, never>,
> = XnlProjectionPresenterDeepReadonly<TSnapshot>
  | XnlProjectionPresenterReadonlyView<TView>;

export type XnlProjectionPresenterSyncMethod<
  TArgs extends readonly unknown[] = readonly unknown[],
  TSnapshot extends XnlProjectionSerializableValue = XnlProjectionSerializableValue,
  TView extends object = Record<PropertyKey, never>,
> = (...args: TArgs) => XnlProjectionPresenterContainedMethodValue<TSnapshot, TView>;

export type XnlProjectionPresenterAsyncMethod<
  TArgs extends readonly unknown[] = readonly unknown[],
  TSnapshot extends XnlProjectionSerializableValue = XnlProjectionSerializableValue,
  TView extends object = Record<PropertyKey, never>,
> = (...args: TArgs) => Promise<XnlProjectionPresenterContainedMethodValue<TSnapshot, TView>>;

/** Opaque evidence for an exact facade owned by its support protocol. */
export interface XnlProjectionPresenterRuntimeFacet<TView extends object> {
  readonly protocolId: string;
  readonly view: XnlProjectionPresenterReadonlyView<TView>;
  readonly [XNL_PROJECTION_PRESENTER_RUNTIME_FACET]: true;
}

/** Authority-bearing construction values live in runtime, not serializable input/config. */
export interface XnlProjectionPresenterRuntimeFacetConstructionRuntime<
  THost extends object,
  TView extends object,
> {
  readonly source: THost;
  readonly protocol: XnlProjectionPresenterCapabilityProtocol<THost, TView>;
}

export type XnlProjectionPresenterRuntimeFacetConstructionInput = Readonly<
  Record<PropertyKey, never>
>;

export type XnlProjectionPresenterRuntimeFacetConstructionConfig = Readonly<
  Record<PropertyKey, never>
>;

export type XnlProjectionPresenterRuntimeFacetConstructionResult<TView extends object> =
  | Readonly<{
      ok: true;
      facet: XnlProjectionPresenterRuntimeFacet<TView>;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      facet?: never;
      diagnostics: readonly [
        XnlProjectionPresenterCapabilityDiagnostic,
        ...XnlProjectionPresenterCapabilityDiagnostic[],
      ];
    }>;

type XnlProjectionPresenterEditIntentAuthorityExclusions = Readonly<{
  translator?: never;
  authoringSession?: never;
  session?: never;
  submit?: never;
  submitCallback?: never;
}>;

/** Data emitted by an edit-intent channel; translation and submission remain external. */
export type XnlProjectionPresenterEditIntent =
  | Readonly<{
      kind: 'interaction';
      proposal: XnlProjectionPresenterDeepReadonly<
        XnlProjectionInteraction & XnlProjectionPresenterEditIntentAuthorityExclusions
      >;
    }>
  | Readonly<{
      kind: 'command';
      proposal: XnlProjectionPresenterDeepReadonly<
        XnlProjectionDomainCommand & XnlProjectionPresenterEditIntentAuthorityExclusions
      >;
    }>;

export interface XnlProjectionPresenterInput<TChildOutput = unknown> {
  node: XnlProjectionPlanNode;
  childOutputs: readonly TChildOutput[];
  surfaceState?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPresenterOutput<TSurface = XnlProjectionSerializableValue> {
  surfaceId: string;
  value: TSurface;
  diagnostics?: readonly XnlProjectionDiagnostic[];
  metadata?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPresenterInvocationConfig<
  TOptions = XnlProjectionSerializableRecord,
> {
  surfaceId: string;
  options: TOptions;
}

export interface XnlProjectionPresenterAdapter<
  TSurface = XnlProjectionSerializableValue,
  TRuntime = unknown,
  TChildOutput = unknown,
  TOptions = XnlProjectionSerializableRecord,
> {
  id: string;
  surfaceId: string;
  present: XnlProjectionProcessor<
    TRuntime,
    XnlProjectionPresenterInput<TChildOutput>,
    XnlProjectionPresenterInvocationConfig<TOptions>,
    XnlProjectionPresenterOutput<TSurface>
  >;
  /** Registration-time defaults. Plan presenter options override these per invocation. */
  config?: TOptions;
  metadata?: XnlProjectionSerializableRecord;
}
