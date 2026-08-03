# XNL Projection Identity

## 身份分工

| Identity | 当前 owner | 当前用途 | 是否已实现 |
|---|---|---|---|
| XNL `#id` / `domain.nodeId` | Domain XNL / source adapter | 领域身份、tree alignment、move 与未来 diff/mutation target | 是 |
| `domain.path` | compiler recursion | authority tree 内当前位置与 provenance | 是 |
| `domain.role` | source/Dialect adapter | 当前投影 occurrence 的角色；无显式身份时参与 fallback Plan id | 是 |
| `ProjectionPlanNode.id` | transformer/compiler | 一份 Plan 内的 projection instance identity、Interaction target | 是 |
| `x-id` | Document occurrence runtime | runtime instance addressing inside one Document Unit instance | 是 |

`ProjectionPlanNode.id` 与 `x-id` 不是同一个 contract。Projection foundation
does not allocate Document occurrence addresses and consumers must not treat an
`xnlp:*` Plan id as a `unit-instance://...` runtime URI. Document occurrence
runtime owns the `x-id` registry; authoring mutation identity remains XNL `#id`
or canonical path.

## 显式 Domain Identity

默认 XNL adapter 只从 Element 的显式 `#id` 读取 `domain.nodeId`：

```text
XNL Element #id
  -> createXnlProjectionRootInput / child adapter
  -> DomainRef.nodeId
  -> path-independent Plan id
```

`createXnlProjectionPlanNodeId(domain)` 在 `nodeId` 存在时只编码显式 identity，
不编码 path 或 role。因此同一个 `#id` 从 body 移到 extend 后：

- `domain.path` 与 `domain.role` 会反映新位置；
- Plan node id 保持不变；
- tree alignment 可以把它识别为 move，而不是 delete + insert。

生成的 `xnlp:*` 字符串是 opaque encoding。消费者只比较它，不解析或拼接它。

## `#id` 不是普通 Payload

默认 adapter 把显式 `#id` 放在：

- `domain.nodeId`；
- `provenance.xnl.explicitId`。

它不会复制进 Plan node 的普通 `data`。Projection foundation does not own
mutation/diff and therefore does not emit `#id` field updates. The implemented
[authoring session](../authoring/identity.md) keeps `#id` as alignment and move
identity rather than comparing it with title, owner or other payload fields.

## 无 `#id` Fallback

当 adapter 没有显式提供 `nodeId` 时，Plan id 由 role 和完整 path 注入式生成：

```text
fallback Plan id = framed(role presence/value, path length, segment type/value)
```

编码会区分：

- role 缺失与显式 role；
- `["a", "b"]` 与 `["a.b"]`；
- `[0]` 与 `["0"]`；
- 空字符串、分隔符、Unicode 与包含 `/`、`:`、`.` 的 key；
- string 与 IEEE-754 number segment。

因此 fallback 对同一 domain path/role 是确定的，也不会依赖 locale 排序或
`path.join(...)`。节点移动后 path 改变，fallback id 也会改变；需要跨 move
稳定身份的可编辑结构应由领域 source 提供显式 `#id`。

## Generic Compiler 不猜 Identity

Generic compiler 只复制显式 compiler input/child ref 中的 `nodeId` 与 `tag`。
它不会读取任意对象的：

```ts
{ id: 'same', tag: 'payload' }
```

来构造 `DomainRef`。普通 record 中的 `id`/`tag` 仍是普通 payload，由领域
transformer 或默认 XNL record traversal 投影；它们不会触发 identity conflict，
也不会匹配按 Domain tag 声明的 Presentation rule。

真实 XNL adapter 则明确知道 Element 的 `#id` 与 tag 语义，因此只在 support
层把它们传给 generic compiler。这个边界防止 compiler 猜测不同领域的 record
convention。

## Duplicate 与 Multi-Role

必须同时区分 contract 能表达什么与当前 compiler 会物化什么：

1. `validateXnlProjectionPlan` 要求 Plan node `id` 在整棵 Plan 内唯一。
2. Generic Plan contract 允许多个不同 Plan ids 引用相同
   `domain.nodeId`。这为未来同一领域节点的 summary/graph 等多 role 实例保留
   了表达空间。
3. 当前 `createXnlProjectionPlanNodeId` 对显式 `nodeId` 忽略 path/role。
   因而当前单 role compiler 遇到重复 source `#id` 时会产生重复 Plan id，并由
   final Plan validation 以 `DUPLICATE_PLAN_NODE_ID` 拒绝。
4. Projection foundation does not allocate multi-role Plan instances for one
   `domain.nodeId`; Document occurrence runtime owns `x-id` address namespace
   separately.

所以：

```text
Generic Plan can represent shared domain identity with distinct Plan ids.
Current compiler rejects duplicate explicit source identity.
Future multi-role materialization must allocate distinct Plan/runtime ids explicitly.
```

不要通过把 path 混入显式 `#id` 来掩盖重复 source identity；那会破坏 move
identity。
