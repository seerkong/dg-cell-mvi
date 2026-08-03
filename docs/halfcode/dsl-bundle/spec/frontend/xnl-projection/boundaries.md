# XNL Projection Boundaries

## Authority Boundary

| Data/capability | Foundation role | Authority |
|---|---|---|
| Domain XNL | compile input | 领域 authority |
| Presentation | pure-data projection policy | 非 authority |
| code-owned Dialect | projection/translation implementation | 不拥有 accepted Domain state |
| ProjectionPlan | rebuildable IR | 非 authority |
| Presenter output / surfaceState | replaceable surface data | 非 authority |
| Interaction / Domain Command | immutable proposal | 非 accepted fact |
| Presenter runtime facet | support-owned positive-grant facade | Presenter 只直接 possession grant-exact view，不 possession raw/ungranted host graph |

Contract、logic 与 support foundation 没有 mutation apply、Domain diff、
ValueHost accept、VFS/VCS persistence 或 writer API。Presenter runner input 也
不接收 AST/source node/ValueHost/mutation writer。

## Default XNL Adapter

真实 `XnlNode` 只在 support 层出现。默认 adapter 的 node-family 与输出如下：

| Family | Classification | Local `data` |
|---|---|---|
| DataElement | `xnl.data-element` | tag、metadata、attributes、body length、extend order；不含 `#id` |
| TextElement | `xnl.text-element` | tag、metadata、attributes、text、text marker |
| Word | `xnl.word` | namespace、name、string value |
| Comment | `xnl.comment` | comment value |
| Array | `xnl.array` | 仅 `{ kind, length }` |
| Plain record without own `kind` | `xnl.record` | 仅 `{ kind, entryCount, keys }` |
| string/number/boolean/null | `xnl.literal.*` | literal kind/value |
| unknown kind-bearing record | `xnl.unknown` | `{ kind: 'unknown' }` + diagnostic |

Array/record 的 recursive content 只存在于 Plan `children`，不会再嵌入 container
`data` 造成重复子树。Element metadata/attributes 是节点本地 facts，可以在
`data` 中序列化为 ordered key/value entries。

### Child Order

```text
DataElement:
  body source order
  then extend.order entries that exist, first occurrence only
  then unlisted extend keys in code-point order

Array:
  numeric index order

Record:
  key code-point order

TextElement / Word / Comment / literal:
  no children
```

每个 child 使用 structural relative path，例如 `["body", 0]`、
`["extend", "Header"]`、array index 或 record key。Root `sourceRef` 由 compiler
runtime 继承到所有 descendants。

Default classification/presenter maps 和每次生成的 transformer map 都是
readonly frozen snapshots。调用方可以在创建 default Dialect 时用 stable id
覆盖 classification/presenter map，但不能放入 implementation object。

## Diagnostic Contract

`XnlProjectionDiagnostic` 的 closed fields 是：

```ts
{
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: readonly (string | number)[];
  planNodeId?: string;
  details?: XnlProjectionSerializableRecord;
}
```

Code 是开放 stable id，业务 Dialect/Presenter 可以产生自己的 code；下面列出
foundation 当前会产生的全部内建 runtime diagnostic。

### Compiler 与 XNL Adapter

| Code | Trigger |
|---|---|
| `INVALID_CLASSIFICATION_OUTPUT` | classifier 返回非法 classification；compiler 改用 `unsupported` classification |
| `LOSSY_PRESENTATION_HIDDEN` | 匹配 rule 声明 `visible: false`；warning 显式记录 surface 信息损失 |
| `UNSUPPORTED_PROJECTION_NODE` | classification 没有 transformer |
| `INVALID_TRANSFORMER_OUTPUT` | transformer output 不是合法 Plan node；改成合法 unsupported node |
| `INVALID_INTERACTION` | Interaction preflight validation 失败 |
| `INVALID_INTERACTION_TARGET` | Interaction target Plan id 不等于当前 Plan node id |
| `UNSUPPORTED_INTERACTION` | runtime 无 translator、translator 不支持，或 translator output 非法 |
| `UNKNOWN_XNL_NODE_KIND` | 默认 XNL adapter 遇到无法识别的 own-`kind` record |

### Presenter Registry 与 Runner

| Code | Trigger |
|---|---|
| `INVALID_XNL_PROJECTION_PRESENTER_INPUT` | registry construction/composition input 或 conflict policy 非法 |
| `DUPLICATE_XNL_PROJECTION_PRESENTER` | registry/ordered composition 出现被 policy 拒绝的重复 id |
| `INVALID_XNL_PROJECTION_PRESENTER_REGISTRY` | composition 收到非本 support capsule 创建的 registry |
| `INVALID_XNL_PROJECTION_PRESENTER_ID` | adapter id 或 resolve id 不是 stable id |
| `UNKNOWN_XNL_PROJECTION_PRESENTER` | Plan PresenterRef 没有精确注册项 |
| `INVALID_XNL_PROJECTION_PRESENTER_ADAPTER` | adapter 不是允许字段的 plain code object，或缺少 `present` |
| `INVALID_XNL_PROJECTION_PRESENTER_SURFACE_ID` | adapter/runner surface id 非法 |
| `INVALID_XNL_PROJECTION_PRESENTER_CONFIG` | registration default options 不是纯数据 record |
| `INVALID_XNL_PROJECTION_PRESENTER_METADATA` | adapter metadata 不是纯数据 record |
| `INVALID_XNL_PROJECTION_PRESENTER_RUNTIME` | registry 非 owner registry，或 runtime facet 不是 assembly-created facet |
| `INVALID_XNL_PROJECTION_PLAN` | runner 收到非法或无法安全快照的 Plan |
| `INVALID_XNL_PROJECTION_SURFACE_STATE` | surfaceState 不是纯数据 record |
| `XNL_PROJECTION_PRESENTER_SURFACE_MISMATCH` | resolved adapter surface 与 requested surface 不同 |
| `XNL_PROJECTION_PRESENTER_FAILED` | adapter `present` throw/reject |
| `INVALID_XNL_PROJECTION_PRESENTER_OUTPUT` | output shape、surface、value、metadata 或 diagnostics 非法 |

### Presenter Capability Protocol 与 Method

Public capability diagnostic union 当前定义八个 code。Current support source 直接产生的
边界 code 是：

| Code | Current trigger |
|---|---|
| `INVALID_XNL_PROJECTION_PRESENTER_PROTOCOL` | protocol 不是可检查 object |
| `UNKNOWN_XNL_PROJECTION_PRESENTER_PROTOCOL` | protocol 不是当前 support capsule 拥有的实例 |
| `INVALID_XNL_PROJECTION_PRESENTER_GRANT` | grant/accessor/descriptor/reflection/capture 边界非法 |
| `INVALID_XNL_PROJECTION_PRESENTER_METHOD_RESULT` | sync/async return 不是 serializable snapshot 或 same-protocol owned facade |

`UNKNOWN_XNL_PROJECTION_PRESENTER_GRANT`、
`INVALID_XNL_PROJECTION_PRESENTER_RUNTIME_FACET`、
`INVALID_XNL_PROJECTION_PRESENTER_METHOD_ARGUMENT` 与
`XNL_PROJECTION_PRESENTER_METHOD_REJECTED` 当前存在于 public contract union，但 support
source 尚无 emission site。Facet provenance failure 由 runner 的
`INVALID_XNL_PROJECTION_PRESENTER_RUNTIME` 报告。

这些 code 描述 possession/return boundary，不宣称 rollback 或 method effect purity。
Granted method 的 internal effect 可能在 return containment 失败前已经发生。

### Contract Validation Issue Codes

Validator issue 与 runtime diagnostic 使用同一 `{ path, code?, message }`
报告形式，但它们是 contract validation detail，不是 Plan surface diagnostic。
当前完整 issue code 分组如下：

| Group | Codes |
|---|---|
| Presentation | `INVALID_PRESENTATION`、`INVALID_PRESENTATION_KIND`、`INVALID_PRESENTATION_RULE`、`INVALID_PRESENTATION_MATCH`、`INVALID_VISIBLE_FLAG` |
| Plan/domain/classification | `INVALID_PLAN`、`INVALID_PLAN_KIND`、`INVALID_PLAN_NODE`、`INVALID_PLAN_NODE_KIND`、`CYCLIC_PLAN_NODE`、`DUPLICATE_PLAN_NODE_ID`、`INVALID_DOMAIN_REF`、`INVALID_DOMAIN_PATH`、`INVALID_DOMAIN_PATH_SEGMENT`、`INVALID_CLASSIFICATION`、`INVALID_PRESENTER_REF` |
| Dialect | `INVALID_DIALECT`、`INVALID_TRANSFORMER_MAP`、`INVALID_PROCESSOR`、`INVALID_SEMANTIC_BINDING` |
| Interaction/command | `INVALID_INTERACTION`、`INVALID_INTERACTION_TARGET`、`INVALID_DOMAIN_COMMAND`、`INVALID_COMMAND_RESULT`、`INVALID_COMMAND_RESULT_STATUS` |
| Diagnostic | `INVALID_DIAGNOSTIC`、`INVALID_DIAGNOSTIC_SEVERITY` |
| Stable shape | `INVALID_ARRAY`、`INVALID_SERIALIZABLE_RECORD`、`INVALID_STABLE_ID`、`INVALID_STRING`、`UNKNOWN_FIELD` |
| Pure data safety | `NON_FINITE_NUMBER`、`EXECUTABLE_VALUE`、`NON_SERIALIZABLE_VALUE`、`RUNTIME_INSTANCE`、`CYCLIC_CONTRACT_VALUE`、`SPARSE_CONTRACT_ARRAY`、`ACCESSOR_CONTRACT_FIELD`、`OWNERSHIP_FIELD`、`UNSAFE_CONTRACT_DESCRIPTOR` |

`validateXnlProjectionDiagnostics` 使用完整 closed validator；Presenter output
diagnostics 不能用 malformed path、非法 Plan id、unknown field 或 own
`undefined` 绕过它。

## Fail-Closed Matrix

| Situation | Current result | No implicit fallback |
|---|---|---|
| unknown classification transformer | unsupported Plan node + error diagnostic | 不 lower 为 raw JSON/text |
| rule 请求 `visible: false` | 保留 Plan node，并产生 `LOSSY_PRESENTATION_HIDDEN` warning | 不静默删除 |
| unknown XNL kind | `xnl.unknown` + `UNKNOWN_XNL_NODE_KIND` | 不解释为普通 record |
| invalid transformer output | valid unsupported node + diagnostic | 不透传非法 output |
| unknown Presenter id | runner failure + actionable diagnostic | 不调用其他 adapter |
| Presenter surface/output failure | runner failure | 不切换 surface |
| raw host/raw-view、forged facet/protocol 或 owner mismatch | runner/factory failure before adapter | 不把 public `view` 字段当 authority |
| legal source with arbitrary extra ungranted capabilities | exact facade construction succeeds | 不枚举 source keys，不把 extra source fields 当非法 facet |
| granted method returns raw/foreign/unserializable object graph | sync/async wrapper failure | 不把该 object graph 交给 Presenter；不承诺回滚 method effect |
| unknown Interaction | closed `unsupported` result | 不生成 mutation |
| invalid/target-mismatched Interaction | closed `rejected` result | translator 不执行 |

Fail-closed 不等于所有 diagnostic 都抛异常。Compiler 可以返回带 diagnostic 的
合法 Plan；Presentation runner 和 Interaction translator 则返回各自的封闭
result union。共同点是不会悄悄选择另一种语义。

## SchemaEditor Boundary

SchemaEditor 是专用下游 adapter/consumer：

- 它拥有 object/array/map/union 表单结构、`EditorPlan`、
  `SchemaEditorCommand`、Session/ValueHost 与 Vue/Element Plus renderer。
- Generic XNL Projection 只拥有开放 classification、renderer-neutral Plan、
  stable PresenterRef 与 Domain Command proposal。
- Generic package 不能引用 SchemaEditor kind 来分类所有领域节点。
- 当前 Track 没有实现 `ProjectionPlan -> EditorPlan`、SchemaEditor Presenter
  或共享 authoring session；现有 SchemaEditor 继续独立工作。

因此“SchemaEditor 是下游”是 ownership/演进方向，不是已经交付的 bridge。

## CURRENT 与 FUTURE

| CURRENT | FUTURE / NOT IMPLEMENTED BY THIS TRACK |
|---|---|
| contracts、validators、compiler、Dialect composition | Tiptap/ProseMirror adapter |
| default XNL traversal/classification/data | Tiptap GetPut / HTML round-trip |
| stable Presenter registry/positive grants/exact facade/runner | Workbench product authoring UI |
| outline/inspection pure-data surfaces | Agent collaboration UI |
| normal render surface data + closed edit-intent proposal data | Tiptap/ProseMirror/Vue/DOM surface、NodeView/Document consumer 与 submit bridge wiring |
| Domain `#id` 与 current Plan identity | xnl-vcs checkpoint authority in browser-safe support core |
| Plan contract 对 shared domain identity 的表达空间 | multi-role materialization 与 role-aware runtime addressing |

Document Unit, Document `x-id` occurrence registry, generic revisioned authoring
session, Candidate/accepted mutation, Domain diff, ValueHost acceptance and
xnl-vfs persistence are implemented outside Projection foundation; see
[Document Unit](../document.md) and
[XNL Document authoring session](../authoring/README.md). Tiptap GetPut,
Workbench product UI and Agent collaboration remain future mission stages.
