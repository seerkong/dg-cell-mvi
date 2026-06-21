# Runtime 域参考表

> L3 规范。Runtime 是独立 L2 family，可被 AppBundle / Page / Component 按需启用。

| 域名 | 归属层 | 文件 | scheme | 根节点 | 条目节点 | 语义要点 |
|---|---|---|---|---|---|---|
| `runtime` | app/page/component | `runtime.xnl` | `runtime://` | `<Runtime>` | `RuntimeInstance` | runtime object instance 的命名、创建、复用、派生 |

内建派生注册表：

| scheme | 来源 | 用途 |
|---|---|---|
| `scope-runtime://` | 当前 scope 链的 `Scope.runtime` 与可见 runtime binding | 引用当前可见 runtime instance 或其公开投影 |

没有 `runtime.event://`、`runtime.effects://`、`runtime.state://`、`state.def`、`state.seed` 域。事件闭环、store、effect handler 可以作为 runtime object 的内部实现细节存在，但不再进入 XNL 节点族。
