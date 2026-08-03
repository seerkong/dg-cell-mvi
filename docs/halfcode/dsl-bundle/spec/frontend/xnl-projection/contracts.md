# XNL Projection Contracts

## Data / Code 分离

| 纯数据 | 代码侧 |
|---|---|
| `XnlProjectionDomainRef` | `XnlProjectionDialect` |
| `XnlProjectionPresentation` / rule / match | children/classifier/transformer processors |
| `XnlProjectionPlan` / node / classification | compiler runtime 与 `runtime.compile` |
| `XnlProjectionPresenterRef` | `XnlProjectionPresenterAdapter.present` |
| `XnlProjectionInteraction` | Interaction translator |
| `XnlProjectionDomainCommand` / closed result | Presenter registry 与 assembly-created runtime facet |
| diagnostics、facts、data、metadata、provenance | 产品代码、renderer adapter 与 host capability assembly |

Presentation、Plan、Interaction、Domain Command 和 Presenter output 都必须是
plain、finite、无环、无 accessor 的可序列化数据。以下对象不属于这些数据：

- function、closure、class 或 component instance；
- runtime、registry、renderer implementation；
- mutation/VFS/ValueHost/persistence writer；
- callback、dispatch、signal setter 或 host effect。

完整 serializable-data ownership field guard 由
[`XNL_PROJECTION_OWNERSHIP_FIELD_NAMES`](../../../../../../packages/dg-cell-mvi-halfcode-contract/src/xnl-projection/serializable.ts)
拥有；它同时作用于 TypeScript contract 和 runtime validation。该 data-contract guard
不参与 Presenter capability 选择；Presenter authority 只由 support-owned positive grants
决定，不扫描 source keys。

## Public Root

消费者从 package root 读取 contract：

```ts
import {
  XNL_PROJECTION_RESOLUTION_PRECEDENCE,
  validateXnlProjectionCommandResult,
  validateXnlProjectionDiagnostics,
  validateXnlProjectionDialect,
  validateXnlProjectionInteraction,
  validateXnlProjectionPlan,
  validateXnlProjectionPresentation,
  type XnlProjectionDialect,
  type XnlProjectionDomainRef,
  type XnlProjectionInteraction,
  type XnlProjectionPlan,
  type XnlProjectionPresentation,
  type XnlProjectionPresenterAdapter,
} from 'dg-cell-mvi-halfcode-contract';
```

`dg-cell-mvi-halfcode-contract` 只发布 `"."`，不发布
`./xnl-projection` subpath。

## DomainRef

```ts
interface XnlProjectionDomainRef {
  path: readonly (string | number)[];
  nodeId?: string;
  tag?: string;
  sourceKind?: string;
  role?: string;
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
}
```

- `path` 是 authority domain tree 内的位置。
- `nodeId` 是 adapter 显式提供的领域身份，例如 XNL `#id`。
- `tag`、`sourceKind`、`role` 是解析与 provenance 所需的领域/投影事实。
- generic compiler 不读取任意 payload 的 `id` 或 `tag` 来猜这些字段。
- `nodeId` 不进入普通 editable `data`；身份细节见 [identity](identity.md)。

## Presentation

```ts
interface XnlProjectionPresentation {
  kind: 'xnl-projection-presentation';
  id: string;
  rules: readonly XnlProjectionPresentationRule[];
  metadata?: XnlProjectionSerializableRecord;
}
```

每条 rule 使用 `path`、`nodeId`、`tag`、`classification`、`role`、
`sourceKind` 的任意组合做 exact match。所有已声明字段都必须相等；空 match
匹配全部节点。

Rule 可以声明：

- stable `presenter.id` 与可序列化 `presenter.options`；
- `visible`；
- compiler 交给 transformer 的 `data`；
- 描述性 `metadata`。

它不能声明 Presenter implementation、transformer、component 或 writer。
多个匹配 rule 按声明顺序组成 overlay：最后一个带 Presenter 的 rule 获胜，
`data` 以 record 深合并、later-wins；数组和非 record 值整体替换。

当前 compiler 对 `visible: false` 保留 Plan node，并显式产生
`LOSSY_PRESENTATION_HIDDEN` warning；它不会在 compiler 内删除节点。
Rule `metadata` 当前只属于 Presentation contract，不参与 presenter/data
resolution，也不自动复制进 Plan provenance。

## ProjectionPlan

`ProjectionPlan` 是 renderer-neutral IR：

```ts
interface XnlProjectionPlanNode {
  id: string;
  domain: XnlProjectionDomainRef;
  classification: {
    id: string;
    traits?: readonly string[];
    facts?: XnlProjectionSerializableRecord;
  };
  presenter: {
    id: string;
    options?: XnlProjectionSerializableRecord;
  };
  facts?: XnlProjectionSerializableRecord;
  data?: XnlProjectionSerializableValue;
  children: readonly XnlProjectionPlanNode[];
  diagnostics?: readonly XnlProjectionDiagnostic[];
  provenance?: XnlProjectionSerializableRecord;
}
```

`classification.id` 与 traits 是开放词汇。Generic Plan 没有
`group | field | collection | map | union` 表单 kind，也不要求所有领域服从
SchemaEditor 结构。

Plan node `id` 在一份 Plan 内必须唯一。不同 Plan node 可以引用同一个
`domain.nodeId`，只要 Plan ids 不同；这是 contract 为未来多 role 实例保留的
空间，不表示当前 compiler 已实现多 role materialization。

## Interaction 与 Command

`XnlProjectionInteraction` 只描述：

- stable interaction type；
- 目标 `planNodeId`，可附 DomainRef/path；
- serializable payload/provenance。

translator 只能返回：

```text
translated  { command, diagnostics? }
rejected    { diagnostics }
unsupported { diagnostics }
```

`XnlProjectionDomainCommand` 是不可变请求数据，包含 type、DomainRef target、
payload/provenance/metadata。结果中没有 accepted snapshot、candidate XNL、
mutation batch、writer 或 persistence receipt。

## Presenter Contract

代码侧 Presenter 的精确调用形状是：

```ts
output = adapter.present(
  runtime,
  {
    node,
    childOutputs,
    surfaceState,
  },
  {
    surfaceId,
    options,
  },
);
```

`XnlProjectionPresenterRef` 只进入 Plan/Presentation；`XnlProjectionPresenterAdapter`
才拥有 `present` function。Registration `config` 是默认 options，调用期 Plan
options 以顶层浅合并方式覆盖同名默认值。

Presenter runtime contract 还区分三类形状：

| Shape | Meaning |
|---|---|
| `XnlProjectionPresenterCapabilityProtocol<THost, TView>` | support-owned snapshot/method positive grants |
| `XnlProjectionPresenterRuntimeFacet<TView>` | public provenance plus exact readonly facade view |
| `XnlProjectionPresenterContainedMethodValue<TSnapshot, TView>` | method 成功时直接返回的 immutable snapshot 或 same-protocol owned facade 类型；非法结果由 runtime 抛出 closed diagnostic |

Runtime factory 从 protocol grants 重新构造 frozen null-prototype facade。合法 host 可以有
任意额外 ungranted capability；`keyof TView` 与 facade own keys 保持精确，host-only keys
不进入 Presenter 类型或 runtime object。Brand 只表示 provenance，不能替代 positive-grant
projection。

Granted method wrapper 同时 containment 同步结果与 Promise resolved value，只把 immutable
serializable snapshot 或 same-protocol owned facade 交回 Presenter。该结果检查不回滚、
不阻止 method internal effect，也不证明 arbitrary closure purity。公开类型不声明 result
envelope：成功值直接返回，非法值抛出 closed diagnostic。Grant factory 与 protocol 会关联
host/view、source/facade key、参数列表及 contained host return；`unknown` host result 不能被
静态窄化成更具体的 facade result。

`XnlProjectionPresentationRunnerInput` 只允许 own data-property `plan` 与可选
`surfaceState`。任意额外 own key、input accessor 或 reflection failure 都会在读取 Plan 和调用
Presenter 前 fail closed；该边界是正向 allowlist，不枚举 authority 字段名。

`XnlProjectionPresenterOutput<TSurface>` 是正常 render 的 surface data contract。
`XnlProjectionPresenterEditIntent` 是独立 edit-intent data contract，只容纳 serializable
Interaction/Domain Command proposal，并在类型上排除 translator、session 与 submit authority。
它不提供 NodeView、Document consumer 或 submit bridge wiring。

## Public Symbol Families

| Family | Public symbols |
|---|---|
| Serializable | `XnlProjectionSerializablePrimitive`、`XnlProjectionSerializableValue`、`XnlProjectionSerializableRecord`、`XNL_PROJECTION_OWNERSHIP_FIELD_NAMES`、`XnlProjectionOwnershipFieldName` |
| Domain | `XnlProjectionDomainPathSegment`、`XnlProjectionDomainPath`、`XnlProjectionDomainRef` |
| Diagnostic | `XnlProjectionDiagnosticSeverity`、`XnlProjectionDiagnostic` |
| Presentation | `XnlProjectionPresenterRef`、`XnlProjectionPresentationRuleMatch`、`XnlProjectionPresentationRule`、`XnlProjectionPresentation` |
| Plan | `XnlProjectionClassification`、`XnlProjectionPlanNode`、`XnlProjectionPlan` |
| Dialect | `XNL_PROJECTION_RESOLUTION_PRECEDENCE`、`XnlProjectionResolutionStage`、`XnlProjectionCompileContext`、`XnlProjectionCompileRuntime`、`XnlProjectionCompileChild`、`XnlProjectionProcessorInput`、`XnlProjectionProcessor`、`XnlProjectionChildrenProcessor`、`XnlProjectionClassifier`、`XnlProjectionTransformer`、`XnlProjectionInteractionTranslator`、`XnlProjectionSemanticPresenterBinding`、`XnlProjectionDialect` |
| Interaction | `XnlProjectionInteractionTarget`、`XnlProjectionInteraction`、`XnlProjectionDomainCommand`、`XnlProjectionCommandResult` |
| Presenter | `XnlProjectionPresenterInput`、`XnlProjectionPresenterOutput`、`XnlProjectionPresenterInvocationConfig`、`XnlProjectionPresenterAdapter`、`XnlProjectionPresenterCapabilityGrant`、`XnlProjectionPresenterSnapshotGrant`、`XnlProjectionPresenterMethodGrant`、`XnlProjectionPresenterCapabilityProtocol`、`XnlProjectionPresenterReadonlyView`、`XnlProjectionPresenterRuntimeFacet`、`XnlProjectionPresenterContainedMethodValue`、`XnlProjectionPresenterSyncMethod`、`XnlProjectionPresenterAsyncMethod`、`XnlProjectionPresenterEditIntent` |
| Validation | `XnlProjectionValidationIssue`、`XnlProjectionValidationResult`、`validateXnlProjectionPresentation`、`validateXnlProjectionPlan`、`validateXnlProjectionDiagnostics`、`validateXnlProjectionDialect`、`validateXnlProjectionInteraction`、`validateXnlProjectionCommandResult` |

六个 validator 分别验证 Presentation、Plan、diagnostics、Dialect、Interaction
和 CommandResult；详细 issue code 见 [boundaries](boundaries.md)。
