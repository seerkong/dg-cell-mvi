# Effect 节点规范

## 三档写法

### Quick

```xnl
<Scope #users-page (
  <EffectBindings [
    <FuncEffect #users.query {
      impl = "vfs://./effects/mock-admin.effects.ts#queryUsers"
    }>
  ]>
)>
```

类型由实现 export 自持。

### Compact

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

也可以由 `EffectBindings.impls` 指向一个以 effect `#id` 为 key 的实现 bundle；该 bundle 只减少重复绑定，不产生 type catalog。

### Split/Public

```xnl
<Scope #users-page (
  <EffectBindings [
    <InterfaceEffect #users.repo {
      type = "vfs://./effects/users.repo.ts#UsersRepoEffect"
    }>
  ]>
)>
```

宿主 runtime 或外层 Scope 为同一 `#users.repo` 注入实现。节点 id 是 binding identity。

## 节点字段

| 节点 | 字段 | 说明 |
|---|---|---|
| `FuncEffect` | `type` | 可选的代码 type export |
| `FuncEffect` | `impl` | 函数实现 `fn(runtime,input,config)` |
| `InterfaceEffect` | `type` | 可选的 interface/factory type export |
| `InterfaceEffect` | `impl` | factory 实现 `fn(runtime,input,config)` |
| `EffectBindings` | `impls` | 按 stable id 映射实现的代码 bundle |

`FuncEffect` / `InterfaceEffect` 是能力形态，和 Quick/Compact/Split 三档正交。
