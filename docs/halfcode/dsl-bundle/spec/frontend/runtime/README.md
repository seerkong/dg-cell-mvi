# Frontend Runtime 装配

> 本目录记录前端视角的 runtime 使用方式。Canonical 节点规范仍在 `spec/runtime/`；这里强调 Scope 如何把前端 family 的绑定装配到 runtime object instance。

## 1. 分工

```text
runtime code
  定义 object / class / factory / generic protocol

runtime.xnl
  命名 RuntimeInstance，并声明 src / create / prototype / derive

Scope
  绑定 runtime instance，并把 config/effect/data graph/commands/events/message policy 等装配输入交给 runtime

dynamic code
  只接收当前 scope runtime，然后调用它的强类型 API 或 message API
```

## 2. Scope 像 XML 注入配置

Scope 不声明 runtime 内部结构，但它是装配边界：

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

运行器把这些 sibling bindings 汇成 assembly input，交给 `RuntimeInstance` 对应的代码入口或 runtime protocol 对象。

## 3. 对象实例语义

```xnl
<Runtime #admin-runtime [
  <RuntimeInstance #admin-root {
    create = "vfs://./runtime/admin.runtime.ts#createAdminRuntime"
  }>
  <RuntimeInstance #users-page {
    prototype = "runtime://#admin-root"
    derive = "vfs://./runtime/admin.runtime.ts#deriveAdminRuntime"
  }>
]>
```

- `#admin-root` 是全新创建的 root runtime。
- `#users-page` 以 root 为 prototype，结合 users-page scope assembly 派生。
- 多个 Scope 可以绑定同一个 `RuntimeInstance`；是否共享状态由 runtime object 自己决定。

## 4. 动态代码

简单入口：

```ts
export async function searchUsers(runtime: AdminRuntime, input, config) {
  return runtime.callEffect('users.query', input, config);
}
```

消息式入口：

```ts
export async function refreshUsers(runtime: AdminRuntime, input, config) {
  return runtime.call('users.refresh', input, config);
}
```

实例集合入口：

```ts
export async function bulkEdit(runtime: AdminRuntime, instanceRefs, input, config) {
  const rows = await runtime.instances.resolve(instanceRefs, config);
  return runtime.call('users.bulkEdit', { rows, patch: input.patch }, config);
}
```

## 5. 设计红线

- Runtime 复杂度留在代码与类型系统里，不用 XNL 模拟 class/generic/mixin。
- Scope 只做装配，不在 XNL 中写覆盖算法、查找算法或消息路由。
- Effect/DataGraph/Command/Event 保持各自 family 的 DSL；runtime 只接收它们的装配结果。
- `StreamSignalStore` 可以在 runtime 代码里使用，但不作为 runtime DSL 节点。

## 6. Canonical App Runtime actor

应用宿主不再分别调用 loader、compiler、scope assembler 和 handler executor，而创建一个 `HalfcodeAppRuntime`：

```ts
const app = await loadHalfcodeAppRuntime(resolver, bundleSrc, loadOptions, {
  resolveSymbol,
  resolveConfig,
});

await app.dispatchCommand({
  unitFqn: 'dg.demo.counter.CounterPage',
  elementId: 'increment-button',
  input: {},
});

app.dispose();
```

该 actor 拥有 load、compile、parent-first Scope assembly、Command dispatch、Scope resolve 与 dispose。renderer 只消费 `app.plans.renderPlans` 和 `app.resolveScope(...)`，不得重新读取 raw XNL domain。
