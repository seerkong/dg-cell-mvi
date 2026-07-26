# 设计

## Owner Boundary

```text
canonical XNL
  -> upstream depa-flows loader/spec
  -> Halfcode Unit registry
  -> Halfcode Scope-bound handle factory
  -> upstream engine
  -> upstream snapshot/task facts
```

Halfcode 不产生替代 AST 或内部 plan。

## Definition Linking

materializer 先为 bundle 内四类 Flow 建立 FQN 索引。`resolveFlow(ref, caller)`：

1. 解析单数 product scheme 与 FQN。
2. 在同一 AppBundle 的已加载 Flow units 中查找。
3. 返回目标 upstream spec 与使用目标 unit VFS 上下文的 code resolver。
4. 未找到、scheme/form 不一致或非 CtrlFlow target 时显式失败。

InstantFlow 同步 `CallFlow` 直接使用该 definition linking。

## Durable Child Lifecycle

Halfcode 的 lifecycle dependencies 增加显式 durable child adapter，或由 materializer 基于目标 unit 的已注入 stores 构造等价 adapter。adapter 只实现上游 `DurableChildFlowResolver`，不拥有 scheduler 语义：

```text
start(ref, childTreeId, input)
inspect(ref, childTreeId)
```

父与子仍由各自上游 engine 和 snapshot store 拥有事实。

## Scope Runtime

Flow factory 继续在绑定 Scope runtime 时创建 handle。相同 definition 可在多个 Scope 绑定为不同 runtime object；代码执行始终收到当前 Scope runtime。

## Public Handles

- InstantFlow：`invoke`
- WorkFlow：`start/resume/refresh/fireDueDeadlines/getOutcome`
- BizProcess：`start/refresh/getOutcome/tasks/operateTask`
- EagerDataFlow：保持 `invoke`

公开能力只转发上游 engine，不重写行为。
