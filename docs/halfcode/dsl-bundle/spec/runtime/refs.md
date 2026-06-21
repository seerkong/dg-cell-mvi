# Runtime 引用规则

> L3 规范。统一 URI 规则见 L1 M-N4；本文件只规定 runtime 领域落点。

| scheme | 来源 | 用途 |
|---|---|---|
| `runtime://` | `runtime.xnl` | 引用 `RuntimeInstance` |
| `scope-runtime://` | 当前 scope 链派生注册表 | 引用当前 scope 可见 runtime instance 或其公开投影 |
| `vfs://` | 文件系统 | 引用 runtime object、factory、derive、handler 代码入口 |

## RuntimeInstance 解析

```xnl
<Runtime #counter-runtime [
  <RuntimeInstance #counter-base {
    create = "vfs://./runtime/counter.runtime.ts#createCounterRuntime"
  }>
  <RuntimeInstance #counter {
    prototype = "runtime://#counter-base"
    derive = "vfs://./runtime/counter.runtime.ts#deriveCounterRuntime"
  }>
]>
```

`runtime://#counter` 在当前容器的 runtime 域内解析。`prototype` 只能指向同一容器可见的 runtime instance；跨单元复用应通过共享代码入口或 app 级公共 runtime instance 完成，不偷穿别的 page/component 内部 runtime 域。

## Scope 派生解析

`scope-runtime://#counter` 沿当前元素所在 scope 链由内向外查找最近绑定到 `RuntimeInstance #counter` 的 Scope。

```xnl
<Scope #counter-page {
  runtime = "runtime://#counter"
  config = "config://#counter-page"
}>
```

当引用带路径时，路径含义由 runtime object 的公开投影协议决定：

```xnl
<elementPlus.Statistic #counter-value {
  value = "scope-runtime://#counter/viewModel.value"
  title = "scope-runtime://#counter/viewModel.label"
}>
```

通用 bundle loader 只校验 `scope-runtime://` 的 URI 语法，不把“本单元某处声明过 id”误当作可见性：它尚未持有引用位置的元素 Scope 链。运行时集成层必须把当前 Scope（或由内向外的 Scope 链）交给 `resolveScopeRuntimeRef` 之类的 scope-aware resolver，再判定 `#counter` 是否可见；`scope-effect://`、`scope-data-graph://` 同理由各自 family 的 scope-aware resolver 接管。

`viewModel.value` 如何读取、是否响应式、是否只读，都由 runtime object 和运行器协议决定。

## 诊断码

| code | 触发 |
|---|---|
| `HALFCODE_RUNTIME_REF_UNRESOLVED` | `runtime://` 或 `scope-runtime://` 解析失败；执行期代码入口符号解析失败 |
| `HALFCODE_RUNTIME_SOURCE_AMBIGUOUS` | `RuntimeInstance` 同时声明多个互斥来源，如 `src` 与 `create` |
| `HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED` | `prototype` 指向不存在的 runtime instance，或 prototype 链成环 |
| `HALFCODE_RUNTIME_PROTOCOL_MISMATCH` | 代码导出的对象/工厂不满足运行器要求的 runtime protocol |
| `HALFCODE_RUNTIME_SCOPE_BINDING_FAILED` | runtime object 的 `bindScope`/`deriveScope` 无法接受当前 Scope assembly |
| `HALFCODE_RUNTIME_EXECUTION_FAILED` | `create`/`derive` 工厂或动态代码入口执行时抛错 |
| `HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED` | 注入的宿主 config resolver 在装配 RuntimeInstance 或 Scope 时抛错；运行器保留其它可独立诊断 |
| `HALFCODE_RUNTIME_DSL_UNSUPPORTED` | Runtime XNL 声明了字段、嵌套行为节点、store/reducer/state 等 code-owned runtime 结构 |
