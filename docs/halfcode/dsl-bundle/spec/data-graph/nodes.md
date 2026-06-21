# Data Graph 节点规范

## Quick

```xnl
<Scope #dashboard-page (
  <DataGraphBindings [
    <GraphExtension #dashboard-summary {
      src = "vfs://./graph-code/dashboard.quick.ts#installDashboardSummary"
    }>
  ]>
)>
```

## Compact

```xnl
<DataGraph #counter-graphs [
  <GraphModule #counter.core (
    <Slots (
      <State [ <SignalNode #count { initial = 0 }> ]>
      <Outputs [
        <ComputedNode #value {
          type = "vfs://./graph-code/counter.types.ts#CounterValueLogic"
          deps = ["state.count"]
        }>
      ]>
    )>
  )>
]>

<Scope #counter-page (
  <DataGraphBindings [
    <GraphMount #counter {
      module = "data-graph://#counter.core"
      impls = "vfs://./graph-code/counter.impl.ts#counterGraphImpls"
    }>
  ]>
)>
```

## Split/Public

```xnl
<Scope #users-page (
  <DataGraphBindings [
    <GraphObject #store {
      src = "vfs://./graph-code/users.target.ts#getUsersStoreGraph"
    }>
    <GraphMount #users-list {
      graph = "scope-data-graph://#store"
      module = "data-graph://#users.list"
      seed = "data-graph-seed://#users-list-demo"
    } (
      <NodeBindings [
        <ComputedBinding #filteredRows {
          impl = "vfs://./graph-code/users.impl.ts#computeFilteredRows"
        }>
      ]>
    )>
  ]>
)>
```

`ComputedBinding` / `ProcessorBinding` / `AsyncBinding` / `ConsumerBinding` 的 tag 表达目标节点类别，`#id` 是绑定 identity；不写 `logic` 字段。

## 字段

| 节点 | 关键字段 |
|---|---|
| `GraphModule` | `src`（可选代码 module/type export） |
| `SignalNode` | `slot`、`initial` |
| `ComputedNode` | `slot`、`deps`、可选 `type`、Quick/Compact 可选 `src` |
| `ProcessorNode` | `outputs`、`deps`、可选 `type`/`src` |
| `AsyncNode` | `deps`、`initial`、可选 `type`/`src`、`projections` |
| `ConsumerNode` | `deps`、可选 `type`/`src` |
| `GraphMount` | `graph`、`module`、`seed`、`impls` |
| `NodeBindings` 子项 | stable `#id` + `impl` |

动态代码从 `runtime.graph('<mount-id>')` 取得 `{ graph, refs }` 并完成写入；XNL 只声明结构和装配。
