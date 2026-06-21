# Mission Design

## 控制论模型

- desired state：`mission.xml` 中的 runtime/data graph/DSL runtime implementation DAG；每个实现 track 都有明确前置证据、验收和依赖。
- actual state：`docs/halfcode/dsl-bundle/` 最新规范、`packages/dg-cell-mvi-halfcode-contract`、`packages/dg-cell-mvi-halfcode-support`、`packages/dg-cell-mvi-core`、`depa-data-graph` 代码事实、当前 fixtures 与测试结果。
- actuation：创建/修订/执行/验证 codument tracks；必要时修订 mission.xml 与 reports。
- feedback：测试结果、track reports、用户新约束、DSL 与代码事实不一致的 evidence。

## Mission Actors

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| MissionPlanner | 期望态产出者 | Processor + Actor | 维护 runtime/data graph/DSL implementation DAG 与 track 边界 |
| MissionObserver | 传感器 | Data + Actor | 读取 docs、fixtures、contract/support/core/data-graph 代码和 track 状态 |
| MissionReconciler | 控制器 | Processor + Actor | 比较 desired vs actual，判断 ready / drift / blocked / done |
| MissionApplier | 执行器 | Effect + Actor | 执行一个有界动作：写 evidence、创建 track、执行 track、验证或重规划 |

## 当前设计切片

### A. Runtime object foundation

先实现最小但真实的 runtime 对象系统：

- contract/types：`RuntimeInstance`、`RuntimeScopeAssembly`、`HalfcodeRuntimeObject`、create/derive protocol、diagnostics。
- loader/projection：从 `runtime.xnl` 和 `Scope.runtime` 读出 RuntimeInstance graph 与 scope binding。
- assembly：解析 `src/create/prototype/derive`，把 config/effect/data graph/command policy bindings 汇成 assembly input，创建/派生 scope runtime。
- execution：command handler / effect impl / graph impl 统一以 runtime 为首参调用。

### B. Data graph binding

data graph 不能沿用旧猜测模型。执行前必须完成 evidence：

- 盘点 `depa-data-graph` 里 GraphModule、NodeRef、computed/processor/action/builder 的全代码用法。
- 盘点 `dg-cell-mvi` 如何把 data graph 接进 MVI/signal/runtime。
- 再决定 halfcode DSL 的 `GraphModule`、`GraphMount`、`NodeBindings` 如何 materialize 到 runtime object。

### C. 其他 DSL family

effect、command/event、config、contracts、frontend composition 的三档写法已经进入文档；后续实现时要将它们作为 runtime assembly 的输入，而不是各自另造隐式全局 registry。

product/material、resource/backend flow、CRUD、workflow 依赖 runtime/data graph 底座，保持候选 track，等待底座验证后再补齐可执行设计。

## 计划与 track 的关系

mission 只负责编排、观察和重规划。真实代码修改必须由 track 承担。只有证据盘点、切片报告、mission 启动报告这类控制面动作可直接写在 mission 的 `analysis/` / `reports/` 中。

## 受控重规划

允许基于 evidence 或 human decision：

- 拆分或合并 runtime tracks；
- 把 data graph track 前移或后移；
- 将候选 DSL family 降级为 proposal-only；
- 新增验证/迁移 track。

每次重规划必须写 `reports/replan-XXX.md`，更新 `mission.xml` Revision/UpdatedAt，并在 `decisions.md` 记录稳定决策。

## 风险

- **DSL 过度解释 runtime**：Runtime 内部结构必须留在 TS 类型系统与代码对象中。
- **Scope assembly 变成隐式 service locator**：Scope 只给 assembly data，查找、覆盖、消息路由必须由明确 runtime protocol 承担。
- **data graph 过早实现错误抽象**：必须先做代码事实盘点，再落地 binding。
- **mission 绕过 track 改代码**：实现任务必须通过真实 track，TrackLink 从 candidate 绑定到实际 track 后再执行。
