# Effect 引用规则

| 引用 | 用途 |
|---|---|
| `vfs://...#export` | binding 的 `type`、`impl` 或 `impls` 代码入口 |
| `scope-effect://#id` | 当前 scope 链可见的 effect binding |

没有 effect type URI。type 只在 binding 节点本地出现，不能被另一节点以 URI 再寻址。

```xnl
<Scope #users-page (
  <EffectBindings [
    <FuncEffect #users.query {
      type = "vfs://./effects/users.effects.ts#UsersQueryEffect"
      impl = "vfs://./effects/mock-admin.effects.ts#queryUsers"
    }>
  ]>
)>
```

Split/Public 场景可只在 binding 上保留 `type`，让宿主 Scope/runtime 按 `#users.query` 注入具体实现。业务代码仍使用 `runtime.callEffect('users.query', input, config)`。
