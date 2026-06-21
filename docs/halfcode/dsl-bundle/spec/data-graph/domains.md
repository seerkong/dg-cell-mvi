# Data Graph 域参考表

| 域名 | 文件 | entry scheme | 根节点 | 条目 | 语义 |
|---|---|---|---|---|---|
| `data.graph` | `data.graph.xnl` | `data-graph://` | `<DataGraph>` | `<GraphModule>` | module identity、slots、节点拓扑 |
| `data.graph.seed` | `data.graph.seed.xnl` | `data-graph-seed://` | `<DataGraphSeed>` | `<GraphSeed>` | 启动覆盖快照 |

`DataGraphBindings` 是 Scope 子域；`scope-data-graph://#id` 从 scope 链解析 `GraphObject`、`GraphMount` 或 `GraphExtension`。没有 `data.graph.logic.types` 域。
