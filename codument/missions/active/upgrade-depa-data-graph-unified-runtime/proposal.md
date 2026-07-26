# Mission：升级至统一 DataGraph 运行时

## 背景和动机

工作区目前直接依赖 `depa-data-graph-core` 与 `depa-data-graph-vue` 0.1.1。指定目标提交发布 1.0.1，并将原本分离的 Signal/Stream 图统一为同一个 `DataGraph`：事件 source、operator、sink、显式 Signal↔Stream 边界和四类 state node 共享身份、生命周期、拓扑和快照模型。

这不是仅替换 semver。`dg-cell-mvi-core` 的 `StreamSignalStore` 同时使用 append-only event log、普通 signal state 和 computed view model；Halfcode support 还直接 materialize GraphModule/NodeRef；Vue 及多个 admin/CRUD 包声明或消费这些运行时。因此需要先验证状态、历史、effect、dispose 和引用协议，再分批迁移。

## 目标

- 将所有工作区直接依赖升级为目标发布物的 core/Vue 1.0.1，并使受支持的 lockfile 可重复解析。
- 用目标统一图的显式 source、state node、adapter 与 state handle 语义实现 core 的事件—状态—视图闭环。
- 保留 append-only event log 作为历史/诊断事实，不将当前 state output 误用为重放历史。
- 对齐 Halfcode graph materialization、typed module/NodeRef、Vue adapter 和全部直接消费者的运行时与类型契约。
- 以独立验证证明事件顺序、reducer/effect feedback、状态读取、订阅、dispose、scope graph 和消费端 UI 语义均未发生未批准漂移。

## 非目标

- mission 不直接修改依赖、代码、测试或 lockfile；所有实现由真实 track 承担。
- 不借本次升级重设计 Halfcode DSL、CRUD 领域行为或 admin 产品功能。
- 不以兼容 shim 掩盖目标版本已移除的旧 split graph/bridge 机制；若公开兼容 API 确有必要，必须有明确边界和测试。
- 不浮动到未指定的将来版本；目标是指定提交对应的 1.0.1 发布面。

## 成功判据

- 所有受影响 workspace package 都解析到 1.0.1，清单和 lockfile 不再保留直接的 0.1.1 解析路径。
- `StreamSignalStore` 的事件历史、同步状态读取、投影、反馈深度限制、effect 重分发和 dispose 行为均有迁移后的回归测试。
- 所有 state projection 的输入、输出与写入均符合 target 的 Signal/Stream protocol；state 只能经命名 mutation/action 或批准的显式兼容边界改变。
- Halfcode graph target、mount、extension、fixtures 与 runtime tests 通过，且不重复既有 Halfcode mission 已完成的 DSL 工作。
- Vue 与所有直接 consumer 的 typecheck/test/build 通过，且独立验证报告可追溯到目标提交与实际解析版本。

## 为什么是 Mission

升级同时涉及依赖解析、核心闭环、Halfcode runtime、框架 adapter 和多个 consumer。它们可拆成有明确门控的真实 tracks，其中 Halfcode 切片还须和一个 active mission 协调。mission 仅持有目标 DAG、观察证据和受控重规划规则；实现落在后续 tracks。
