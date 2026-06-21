# Data Graph 文件组织

```text
pages/counter/
  manifest.xnl
  scopes.xnl
  data.graph.xnl
  data.graph.seed.xnl       # 仅需要启动覆盖时
  graph-code/
    counter.graph.types.ts
    counter.graph.impl.ts
    counter.command-handlers.ts
```

Quick 场景可以没有 `data.graph.xnl`，只在 Scope 写 `GraphExtension.src`。不使用 `data.graph.logic.types.xnl`、`graphs.xnl`、`graph.impls.xnl`、`state.def.xnl` 或 `state.seed.xnl`。

单文件单元把 `<DataGraph>` / `<DataGraphSeed>` 原样放进根 `()` 子域；多文件由根 tag 发现域。
