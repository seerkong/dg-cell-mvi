# Data Graph 引用规则

| 引用 | 用途 |
|---|---|
| `data-graph://#id` | 当前容器的 GraphModule |
| `data-graph-seed://#id` | 当前容器的启动 seed |
| `scope-data-graph://#id` | 当前 scope 链可见的 graph binding |
| `vfs://...#export` | module type、node type、实现、graph target、installer |

module 内的依赖是 local slot ref，不是 URI：`state.rows`、`inputs.query`、`outputs.filteredRows`。节点 `type` 只引用代码 export；implementation binding 以节点 `#id` 为 key。

```xnl
<ComputedNode #filteredRows {
  type = "vfs://./graph-code/users.graph.types.ts#UsersFilteredRowsLogic"
  deps = ["state.rows" "inputs.query"]
}>

<ComputedBinding #filteredRows {
  impl = "vfs://./graph-code/mock-users.graph.impl.ts#computeFilteredRows"
}>
```

跨容器只能通过公开 unit、显式 `vfs://` shared import 或把 module 编入当前容器；逻辑 URI 不穿透另一单元内部。
