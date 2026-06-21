# L2 Runtime halfcode 领域公理

> Runtime family 基于 DEPA `output = fn(runtime, input, config)`。编号 `R-*`。
> 本层只规定 halfcode 如何引用、创建、复用和派生 runtime 对象实例；runtime 对象内部结构必须在代码与类型系统中表达，不在 XNL 中展开。

## R-1 · Runtime 是代码实现的对象实例，不是 XNL 能力树

`Runtime` 是 halfcode 动态代码收到的第一个参数。它可以是简单 object、class 实例、泛型组合对象、mixin 产物、actor-like proxy，或项目预制 runtime。XNL 不能声明它有哪些字段、方法、继承层次、message router、visibility rule 或 data graph/effect lookup 细节。

XNL 只允许引用一个 runtime 对象实例入口：

```xnl
<Runtime #admin-runtime [
  <RuntimeInstance #admin {
    src = "vfs://./runtime/admin.runtime.ts#adminRuntime"
  }>
]>
```

代码侧才定义类型与协议：

```ts
export interface AdminRuntime extends HalfcodeRuntimeObject {
  effects: {
    users: {
      query(input: UsersQueryInput, config?: UsersQueryConfig): Promise<UsersQueryOutput>;
    };
  };
}

export const adminRuntime: AdminRuntime = createAdminRuntime();
```

## R-2 · RuntimeInstance 是 Scope 绑定的真实对象实例

Scope 绑定的是 runtime instance，而不是 runtime type。多个 scope 可以指向同一个实例；也可以为某个 scope 创建全新实例；还可以基于已有实例派生一个覆盖后的新实例。

三种基本装配语义：

| 语义 | 用途 | XNL 字段 |
|---|---|---|
| use | 使用代码中导出的既有对象实例 | `src` |
| create | 调用代码工厂创建新实例 | `create` |
| derive | 以已有实例为 prototype，叠加当前 scope bindings 后派生新实例 | `prototype` + `derive` |

```xnl
<Runtime #app-runtime [
  <RuntimeInstance #root {
    create = "vfs://./runtime/app.runtime.ts#createRootRuntime"
  }>
  <RuntimeInstance #users-page {
    prototype = "runtime://#root"
    derive = "vfs://./runtime/app.runtime.ts#deriveScopeRuntime"
  }>
]>
```

## R-3 · Scope 是 runtime instance 的装配边界

Scope 像早期 Spring XML 一样负责装配：声明本 scope 使用哪个 runtime instance，并把同一个 scope 中的 config、effect bindings、data graph bindings、commands、events、message policy 等绑定作为 assembly input 交给 runtime 协议对象。

```xnl
<Scope #users-page {
  runtime = "runtime://#users-page"
  config = "config://#users-page"
  commands = "command://#users-page-commands"
  events = "event://#users-page-events"
} (
  <EffectBindings {
    impls = "vfs://./effects/mock-admin.effect-impls.ts#adminEffectImpls"
  }>
  <DataGraphBindings [
    <GraphMount #users-list {
      module = "data-graph://#users.list"
      impls = "vfs://./graph-code/users.graph.impl.ts#usersGraphImpls"
    }>
  ]>
  <MessagePolicy #boundary { default = "bubble" } [
    <MessageRule message="command://#users.search" action="consume">
  ]>
)>
```

XNL 不规定这些 binding 如何进入 runtime 对象；它只提供装配数据。`create` / `derive` / runtime 协议方法负责决定覆盖、隐藏、继承、消息发送和可见性。

## R-4 · Runtime object 是一种对象系统与 actor 边界

halfcode runtime 可以承载：

- scope 链上的能力解析与覆盖；
- effect、data graph、command、event、config 的运行时装配结果；
- 前端元素实例选择、ECS query、host bridge、外部预置数据；
- parent/child runtime 间的 request/reply 或 message routing；
- 全代码与 halfcode 动态代码之间的通信。

这些能力属于 runtime object 的代码协议，不属于 XNL 节点族。XNL 只关心"这个 scope 绑定了哪个 runtime instance，以及有哪些 bindings 需要交给它"。

## R-5 · 动态代码入口以 runtime 为首参，可扩展 instanceRefs

普通动态代码仍遵守：

```ts
output = fn(runtime, input, config)
```

需要面向当前选中元素、批量 UI 实例、游戏 ECS entity 等场景时，可使用 instance-aware 入口：

```ts
output = fn(runtime, instanceRefs, input, config)
```

`instanceRefs` 是引用集合，不是直接对象。如何解析引用、筛选实例、映射成强类型对象，仍由 runtime object 的代码协议负责。

## R-6 · 三档写法按 runtime 复用程度递进

| 层级 | 适用场景 | 主要写法 |
|---|---|---|
| Quick Runtime | demo、内部实验、类型要求低 | Scope 直接 `runtime = "vfs://...#runtimeObject"` 或引用一个 `src` 实例 |
| Compact Runtime | 普通业务默认 | `runtime.xnl` 声明少量 `RuntimeInstance`，Scope 用 `runtime = "runtime://#..."` 绑定 |
| Split / Public Runtime | 多 app 复用、强类型、复杂对象系统 | 代码中定义 interface/class/generic runtime protocol；XNL 只声明 `src/create/prototype/derive` 实例图 |

三档的差别是实例复用和类型复杂度，不是 XNL 能力越来越多。runtime 内部结构越复杂，越应该留在 TypeScript 代码里。

## R-7 · Runtime 与 Effect / DataGraph / Command / Event 正交

- Effect DSL 定义能力类型与实现绑定；runtime object 决定如何暴露、查找、调用这些 effect。
- Data Graph DSL 定义 graph module 与 node logic binding；runtime object 决定如何持有、传递、扩展 graph 对象。
- Command DSL 定义请求与 handler 入口；Event DSL 定义事实协议；handler 的第一个参数是当前 scope runtime。
- Scope DSL 负责把这些 binding 聚到同一个装配边界。

Runtime family 不恢复旧版 `state.def/state.seed`，也不把 `StreamSignalStore`、reducer、effect handler 拆成 XNL 节点。MVI store 可以是某个 runtime object 内部使用的实现细节或能力之一。
