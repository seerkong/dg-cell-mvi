# Runtime 文件组织

> L3 规范。Runtime 域遵守 M-N2：`runtime` → `runtime.xnl` → `runtime://` → `<Runtime>`。

Compact Runtime 推荐结构：

```text
pages/counter/
  manifest.xnl
  elements.xnl
  contracts.xnl
  scopes.xnl
  commands.xnl
  events.xnl
  config.xnl
  runtime.xnl
  runtime/
    counter.runtime.ts          # runtime object / factory / derive code
    counter.command-handlers.ts # 使用 runtime 的动态代码入口
```

Split / Public Runtime 可把强类型协议拆出独立文件：

```text
runtime/
  admin.runtime.types.ts        # interface / generic / protocol types
  admin.runtime.ts              # object / class / factory / derive implementation
  users.command-handlers.ts
```

不使用：

- `runtime.state.xnl`
- `runtime.events.xnl`
- `runtime.effects.xnl`
- `state.def.xnl`
- `state.seed.xnl`

MVI store、stream signal store、event/effect loop 如果需要，应作为 runtime object 代码内部的实现细节或能力字段，而不是拆成 runtime DSL 节点。
