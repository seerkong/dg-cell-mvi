# Mission Design

## 期望态

Halfcode bundle 是异构 typed unit registry。`page`、`component`、`ctrl-flow`、`data-flow` 共享物理寻址、FQN 注册、可见性和诊断基础设施，但各自拥有独立根 tag、contract/plan 与消费端。Flow Editor 是 flow authoring plan 的投影和命令发送端，不拥有另一套 flow DSL；未来 runtime 则通过 scope 中已装配的 runtime object 执行 flow。

## 分阶段架构

1. **DSL 与编辑器**：冻结 `AppBundle`、flow unit、typed refs、authoring plan 与 semantic/flow.authoring ownership；迁移五个 showcase units；不执行。
2. **Runtime contracts**：定义 flow invocation、node logic、结果/错误、取消和 scope visibility 的强类型协议；动态逻辑遵循 `output = fn(runtime, input, config)`。
3. **两类执行器**：CtrlFlow 负责结构化控制语义，DataFlow 负责依赖 DAG 与端口数据血缘；两者不共享一个含糊的通用解释器。
4. **组合 runtime**：实现 typed cross-flow invocation、main/subflow、scope runtime 继承/覆盖和宿主通信。

## Mission Actors

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| `MissionPlanner` | 期望态产出者 | Processor + Actor | 维护 mission DAG、真实 track 切片及依赖，确保 DSL/authoring 先于 execution。 |
| `MissionObserver` | 传感器 | Data + Actor | 读取 mission/track 状态、Halfcode contracts、fixtures、Workbench 投影、测试与 E2E 报告。 |
| `MissionReconciler` | 控制器 | Processor + Actor | 比较期望态与实际态，识别 DSL 漂移、双事实源、runtime 越界和跨仓回归。 |
| `MissionApplier` | 执行器 | Effect + Actor | 每轮只创建、执行、验证或归档一个 bounded track action，并回写状态和报告。 |

## Desired / Actual / Actuation / Feedback

- **desired state**：`mission.xml` 的 DAG、绑定的真实 tracks、本文的边界与 `proposal.md` 成功判据。
- **actual state**：两个仓库的代码、XNL、contract/plan 类型、VFS 持久化、track 状态和验证结果。
- **actuation**：创建/续跑/修订/归档真实 track；禁止 mission 绕过 track 直接实现功能。
- **feedback**：track reports、diagnostics 快照、fixture round-trip、Workbench browser E2E 与用户对 DSL/DX 的反馈。

## Track 边界

- `add-halfcode-flow-unit-dsl-and-editor` 已创建并绑定，只做 DSL、loader/compiler authoring plan、canonical fixtures 与编辑器。
- `add-halfcode-flow-runtime-contracts` 在第一阶段证据稳定后创建，负责执行 ABI 与 scope/runtime 边界，不实现完整执行器。
- `add-halfcode-ctrl-flow-runtime` 与 `add-halfcode-data-flow-runtime` 分别实现不同语义，可在 contracts 稳定后并行。
- `add-halfcode-flow-composition-runtime` 最后实现 typed flow refs、main/subflow 与 scope 继承/覆盖。

## DEPA 边界

- Flow 定义属于 Processor 数据；authoring plan 是可序列化 projection，不持有业务逻辑。
- 动态逻辑是代码引用，未来由 scope runtime 提供依赖；XNL 不内嵌表达式/语句代码，也不写 `clazz + methodName` 反射调用。
- Editor 只发 command 修改 semantic owner 或独立的 `flow.authoring` owner，不直接维护第二份 live truth；editor view model 才是从两类事实派生的只读 projection。
- DataFlow 表达一次执行的数据血缘；`depa-data-graph` 表达响应式数据/事实图，两者类型、registry 与 runtime 必须分离。

## 受控重规划

只有以下 evidence 可改变 DAG 或 candidate track 边界：第一阶段 DSL round-trip 暴露结构矛盾；复杂样例无法无损表达；scope/runtime contract 与现有 `RuntimeObject` 冲突；CtrlFlow/DataFlow 共享层导致不必要耦合；浏览器 E2E 证明 projection ownership 不成立。重规划必须写 `reports/replan-XXX.md`，说明 trigger、actual、desired、diff 和 decision，并递增 `Metadata.Revision`。

## 人工介入

以下情况暂停自动收敛并请求用户决策：需要改变已确认的 `CtrlFlow`/`DataFlow` 领域语义；需要把 Flow 与 DataGraph 合并；需要引入第二种 bundle 根或历史兼容方言；需要改变 scope/runtime 对象系统的既有不变量。

## 风险与缓解

- **DSL 先行但过早锁死 runtime**：首个 track 只冻结 authoring contract 和 opaque code refs，执行 ABI 留给 runtime-contract track。
- **AppBundle 迁移影响既有 admin**：第一阶段要求现有 canonical fixtures 全量迁移并保持 admin E2E。
- **编辑器反向成为 schema owner**：parser、diagnostics 与 plan 由 `dg-cell-mvi` 输出，Workbench 只消费并向 semantic/flow.authoring owner 发送 mutation command。
- **复杂旧样例被简化丢语义**：Welcome 与旧 CtrlFlow/DataFlow main/subflow 同时作为验收 corpus。
