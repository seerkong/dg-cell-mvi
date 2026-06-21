# Runtime 节点规范

> L3 规范。Runtime DSL 只描述 runtime object instance 的引用、创建、复用和派生；具体对象结构、类型、泛型、继承、mixin、消息路由和能力解析都在代码中。

## 1. 三档写法

### Quick Runtime · 直接指向代码对象

类型要求低、一次性 demo 或内部实验可以让 Scope 直接引用代码导出的 runtime 对象：

```xnl
<Scope #counter-page {
  runtime = "vfs://./runtime/counter.runtime.ts#counterRuntime"
  config = "config://#counter-page"
}>
```

该写法不创建公共 runtime identity；只适合局部场景。运行器解析到 `vfs://` 后直接把导出的 object 作为当前 scope runtime，或调用其协议方法完成 scope binding。

### Compact Runtime · runtime.xnl 声明实例，Scope 绑定实例

普通业务默认使用 `runtime.xnl` 命名 runtime instance，再在 Scope 上绑定：

```xnl
<Runtime #counter-runtime [
  <RuntimeInstance #counter {
    create = "vfs://./runtime/counter.runtime.ts#createCounterRuntime"
    config = "config://#counter-initial-state"
  }>
]>
```

```xnl
<Scope #counter-page {
  runtime = "runtime://#counter"
  config = "config://#counter-page"
  commands = "command://#counter-page-commands"
}>
```

`create` 指向代码工厂。工厂可以返回 object、class 实例或泛型 runtime 组合对象。

### Split / Public Runtime · 原型派生与强类型协议

跨 app/profile 复用，或需要强类型对象系统时，把 runtime interface、class、generic helper 都放进代码；XNL 只描述实例图：

```xnl
<Runtime #admin-runtime [
  <RuntimeInstance #admin-root {
    create = "vfs://./runtime/admin.runtime.ts#createAdminRuntime"
    config = "config://#admin-runtime-defaults"
  }>
  <RuntimeInstance #users-page {
    prototype = "runtime://#admin-root"
    derive = "vfs://./runtime/admin.runtime.ts#deriveAdminRuntime"
  }>
  <RuntimeInstance #orders-page {
    prototype = "runtime://#admin-root"
    derive = "vfs://./runtime/orders.runtime.ts#deriveOrdersRuntime"
  }>
]>
```

```xnl
<Scope #users-page {
  runtime = "runtime://#users-page"
  config = "config://#users-page"
} (
  <EffectBindings {
    impls = "vfs://./effects/mock-admin.effect-impls.ts#adminEffectImpls"
  }>
)>
```

这里 `#users-page` runtime 可以复用 `#admin-root` 的公共能力，并覆盖当前 scope 的 effect/data graph/command/event 装配。覆盖规则由 `deriveAdminRuntime` 或 runtime 协议对象实现。

## 2. RuntimeInstance 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `src` | 三选一 | 代码中导出的既有 runtime object 实例 |
| `create` | 三选一 | 代码工厂入口，创建全新 runtime object |
| `prototype` | derive 必填 | 作为原型的 runtime instance URI |
| `derive` | prototype 场景推荐 | 派生入口；省略时运行器可调用 prototype 对象上的标准 `deriveScope` 协议 |
| `config` | 可选 | 传给 `src/create/derive` 的静态配置 URI |

`src`、`create`、`prototype` 表示互斥的实例来源：

- `src` = use existing instance；
- `create` = create new instance；
- `prototype` = derive from existing instance。

**声明顺序无关**：`RuntimeInstance` 在 `runtime.xnl` 中的书写顺序不承载装配语义——derived 实例可以声明在其 prototype 之前，运行器多遍装配至收敛。prototype 链缺失或成环时按实例报 `HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED`（见 refs.md 诊断表）。

## 3. Scope.runtime 字段

`Scope.runtime` 绑定当前 scope 动态代码收到的 runtime object：

```xnl
<Scope #users-filter {
  runtime = "runtime://#users-filter"
  config = "config://#users-filter"
}>
```

当 Scope 同时声明了 `EffectBindings`、`DataGraphBindings`、`MessagePolicy`、`commands`、`events` 等装配节点，运行器应把它们作为 scope assembly input 交给 runtime object：

```ts
export interface RuntimeScopeAssembly {
  scopeId: string;
  parent?: unknown;
  config?: unknown;
  bindings: {
    effects?: unknown;
    dataGraphs?: unknown;
    commands?: unknown;
    events?: unknown;
    messagePolicy?: unknown;
  };
}
```

Scope 不声明 runtime 的字段或方法。runtime 如何把 bindings 注入自身、覆盖父级能力、隐藏私有能力，均由代码协议决定。

## 4. 代码协议伪代码

运行器至少需要识别一个 runtime object / factory protocol。项目可以用更强的泛型类型细化它：

```ts
export interface HalfcodeRuntimeObject {
  bindScope?(input: RuntimeScopeAssembly): HalfcodeRuntimeObject;
  deriveScope?(input: RuntimeScopeAssembly): HalfcodeRuntimeObject;
  call?<TInput, TOutput>(
    name: string,
    input: TInput,
    config?: unknown,
  ): Promise<TOutput> | TOutput;
  send?(message: RuntimeMessage): Promise<unknown> | unknown;
}

export type RuntimeCreate<TRuntime> = (
  runtime: unknown,
  input: RuntimeScopeAssembly,
  config: unknown,
) => TRuntime;

export type RuntimeDerive<TRuntime> = (
  prototype: TRuntime,
  input: RuntimeScopeAssembly,
  config: unknown,
) => TRuntime;
```

更强类型的业务代码可以直接使用项目自己的 runtime interface：

```ts
export interface AdminRuntime extends HalfcodeRuntimeObject {
  effects: {
    users: {
      query(input: UsersQueryInput, config?: UsersQueryConfig): Promise<UsersQueryOutput>;
    };
  };
}

export async function searchUsers(
  runtime: AdminRuntime,
  input: UsersQueryInput,
  config: UsersQueryConfig,
) {
  return runtime.effects.users.query(input, config);
}
```

## 5. instanceRefs 扩展

普通 handler/effect/processor 入口：

```ts
export async function run(runtime, input, config) {
  return runtime.call('users.query', input, config);
}
```

面向前端选中元素、ECS 批量 entity、画布对象等实例集合的入口：

```ts
export async function bulkUpdate(runtime, instanceRefs, input, config) {
  const instances = await runtime.instances.resolve(instanceRefs, config);
  return runtime.call('users.bulkUpdate', { instances, patch: input.patch }, config);
}
```

`instanceRefs` 是稳定引用集合；解析、权限、过滤和批处理策略属于 runtime object。

## 6. 禁止项

- 不在 XNL 中声明 runtime 字段、方法、message router、visibility rule。
- 不用 `StreamSignalStore` / reducer / runtime effect handler 节点来冒充 Runtime DSL。
- 不把 effect binding、`GraphModule`、`MessageRule` 的语义复制进 runtime 节点。
- 不恢复 `runtime.state`、`state.def`、`state.seed`。

运行器的 Runtime DSL guardrail 只允许 `<Runtime>` 根下的直接 `<RuntimeInstance>` 列表；每个 instance 只允许 `src`、`create`、`prototype`、`derive`、`config` 五个装配字段，且没有嵌套行为节点。`Methods`、`MessageRouter`、`Reducer`、`StreamSignalStore`、`StateDef` 等结构，以及任意额外 runtime 字段，都会报 `HALFCODE_RUNTIME_DSL_UNSUPPORTED`。这项检查保护的是声明/代码边界，不检查 runtime object 代码本身的类型设计。
