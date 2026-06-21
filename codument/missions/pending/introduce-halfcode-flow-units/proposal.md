# Mission：引入 Halfcode Flow Units

## 背景和动机

当前 Halfcode bundle 只把 `page` 与 `component` 注册为一等单元；Workbench Flow Editor 则在自己的 VFS 中维护孤立的 `*.CtrlFlow.xnl`、`*.DataFlow.xnl` 及 JSON sidecar。结果是 flow DSL、bundle loader、编辑器投影和未来执行 runtime 没有共同契约，简单 Welcome 样例与原有复杂 CtrlFlow/DataFlow 样例也分裂为不同事实源。

Flow 不是前端组件，也不是 `depa-data-graph` 的响应式事实图。它是可被 bundle 注册、引用、编辑，并在未来由 scope runtime 执行的 Processor 定义。这个目标跨越 Halfcode contract/support/docs、canonical fixtures 和 Workbench 编辑器，而且执行语义需要在 DSL 稳定后分批实现，因此需要 mission 编排多个真实 track。

## 目标

- 把 bundle 根收敛为可容纳异构单元的 `<AppBundle>`，新增 `ctrl-flow` 与 `data-flow` 两种一等 `Unit kind`。
- 定义 `<CtrlFlow>` / `<DataFlow>` 的文件、节点、引用、诊断和三档作者体验，并让 loader/compiler 产出不执行代码的可序列化 authoring plan。
- 建立 canonical `flow-showcase` bundle，保留简单 Welcome CtrlFlow/DataFlow，同时迁移原有复杂 CtrlFlow、DataFlow main 与 DataFlow subflow 场景。
- 让 Workbench Flow Editor 从 canonical bundle/plan 投影和编辑 flow；语义 XNL、持久化 `flow.authoring` XNL 与运行期 UI state 各有单一 owner。
- 在后续 tracks 中定义 scope/runtime 执行契约，分别实现 CtrlFlow、DataFlow 与跨 flow composition runtime。

## 非目标

- mission 本身不直接修改产品代码、规范或测试；所有落地工作必须由真实 track 承担。
- 首个 track 不执行 flow，不解析或调用动态代码模块，不实现 scheduler、控制流解释器、数据流调度器或 subflow invocation。
- 不把 DataFlow 混同为 `depa-data-graph`，也不借 DataGraph mount/compute 机制实现 flow execution。
- 不在 Workbench 复制一份 Halfcode flow schema、fixture 或 parser 作为第二事实源。

## 成功判据

- `AppBundle` 可注册 page、component、ctrl-flow、data-flow，kind、根 tag、FQN 与 typed registry ref 均有一致校验和诊断。
- canonical `flow-showcase` 同时包含 Welcome、复杂 CtrlFlow、复杂 DataFlow main/subflow，并能被 loader/compiler 与 Workbench 编辑器完整投影。
- Workbench 不再以硬编码 XNL seed、`*.graph.json`、`*.halfcode.json` 或重复 `formModel` 保存 flow 的第二份语义事实；布局数据使用独立 `flow.authoring` XNL owner。
- 后续 runtime tracks 只消费稳定 flow contract/plan，并遵循 `output = fn(runtime, input, config)` 与 scope runtime assembly 边界。
- 所有 mission 节点最终为 DONE 或有证据地 SUPERSEDED，跨仓测试、类型检查、构建与浏览器 E2E 有可审计报告。

## 为什么是 Mission

第一阶段已经能由一个 track 闭环 DSL 与编辑器，但完整能力还包含执行 ABI、两类不同调度模型、subflow 组合和 scope/runtime 装配。它们依赖顺序明确、风险不同，也可能根据第一阶段的实际 DX 反馈重规划。Mission 只维护期望态 DAG、观察实际态并编排这些真实 tracks；代码、规范、fixtures 和测试不直接落在 mission task 中。
