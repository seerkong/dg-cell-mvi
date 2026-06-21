# L2 Flow Halfcode 领域公理

> Flow 的语法、产品契约、加载、链接、物化与执行语义由 [`depa-flows.ts/docs/flow-dsl`](../../../../../depa-flows.ts/docs/flow-dsl/README.md) 唯一拥有。Halfcode 只负责 AppBundle 注册、VFS 上下文、Unit 身份、Scope 装配与诊断适配。

## W-1 · 四种产品保持独立

Halfcode 注册 `instant-flow`、`work-flow`、`biz-process` 与 `eager-data-flow`。它们分别投影上游 `InstantFlow`、`WorkFlow`、`BizProcess` 与 `EagerDataFlow` definition，不在 Halfcode 中复制 AST、节点规则、拓扑校验或生命周期算法。

## W-2 · 加载和物化委托上游

AppBundle loader 把具名 XNL source、base URI 与 eager subflow registry 交给上游 browser/source API。运行时把上游 spec/plan、注入的 VFS code resolver、snapshot/task store、clock 与 task lifecycle dependencies 交给上游 materializer/engine。

## W-3 · Flow 是 Scope 可见的领域对象

Flow handle 不进入 effect binding。`HalfcodeAppRuntime` 按 FQN 注册 handle factory；default runtime object 在每个 Scope 绑定 factory，父 Scope 的 factory 会继承并重新绑定到当前 runtime，同 FQN 的本地 factory 覆盖父绑定。

## W-4 · Handle API 与产品生命周期一致

| product | handle surface |
|---|---|
| InstantFlow | `invoke(input)` |
| EagerDataFlow | `invoke(input, options)` |
| WorkFlow | `start`、`resume`、`fireDueDeadlines`、`getOutcome` |
| BizProcess | `start`、`getOutcome`、`tasks`、`operateTask` |

动态代码统一由上游以 `output = fn(runtime, input, config)` 调用；这里的 `runtime` 是解析 handle 的 Scope runtime。
