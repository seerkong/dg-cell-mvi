# Mission Design

## 期望态

运行时只存在一个统一 `DataGraph` 拓扑：普通输入/派生值使用 Signal；历史和异步事件使用 Stream；跨协议转换必须登记为显式 graph node。状态投影由与输入协议匹配的 state node 建立，状态 node 的 output 只读；命名 mutation/action 是状态写入的可追踪边界。`AppendOnlyEventLog` 继续是可重放历史，而 state 输出只表示当前状态或当前值加实时提交。

`dg-cell-mvi` 保持其 DEPA 边界：事件、状态和 graph topology 是 Data；reducer/project 是纯 Processor；外部 I/O 只在 `runEffects` 等 Effect 边界执行；store、scope runtime 与 UI adapter 是 Actor。升级不得让 reducer 获得环境 I/O，亦不得在 UI/fixture 引入第二事实源。

## 迁移架构

1. **证据层**：以目标提交、其导出面和 migration guide 为 authority；以当前 import、manifest、lockfile、测试和 active mission 状态为 actual state。
2. **Core 层**：先建立 1.0.1 解析和最小 public contract；将 event log 作为 stream source 接入 graph，并把 reducer state 建模为显式 stream-driven state signal 或经设计确认的等价边界。Effects 保留在 action/effect actor，异步结果以事件回流。
3. **Halfcode 层**：迁移 GraphModule/NodeRef/mount/materializer 所需 API，不混入新的 DSL 语义；与 `evolve-halfcode-non-frontend-dsl` 只通过事实报告和必要的边界修订协调。
4. **Consumer 层**：迁移 Vue `useGraphSignal` 的 signal-output 输入及所有直接依赖声明；CRUD/admin/uhtml 只经 core/Vue public capsule 消费运行时。
5. **验证层**：锁定实际解析版本，按包运行 type/test/build，并单独验证事件历史 vs 当前 state、feedback、dispose、Vue read/update 和 Halfcode scope graph。

## 已收敛的 Core Store 映射

`StreamSignalStore` 保留 `dispatch/state/viewModel/dispose` facade，但不再将可变 `AppendOnlyEventLog` 或完整 `DataGraph` 直接交给普通消费者。内部按一个 graph-owned 数据流实现：`AppendOnlyEventLog<AppEvent>` 是唯一 history owner；`graph.addSource('events', log.stream())` 将 timeline entry 注册为 stream input；`addStreamDrivenStateSignalNode` 以纯 reducer 投影当前 state，外部读 state 必须经 `stateHandle.output`。`viewModel` 继续是依赖该 output 的 computed signal。

普通 `store.eventLog` 是仅含 `entries()` 的只读 history view，`store.graph` 是只含 `get()`/`snapshot()` 的 graph-observation view；两者都不含 append、set、add* 或 dispose。需要取得真实 `DataGraph` 的 composition root 使用单独的 runtime-owner construction API；该 capability 不向 Vue、CRUD 或业务消费者透传，且 store 保留 `events/state/viewModel/effects` 保留节点的写入语义。

同一 event source 由在 state node 后注册的 graph sink 消费。state reducer 为每个 timeline entry 缓存一次经校验的 `{ state, effects, feedbackMeta }` 结果，sink 只消费该缓存来运行 tap 和 `runEffects`；因此 reducer 不会为 effect 再执行一次，且 effect 回传继续通过 append-only log 进入同一 source。reducer 错误在 reducer boundary 报给 `onError` 并保持原 state；sink、state node 和 graph 的 dispose 统一由 graph lifecycle 回收。

## 已收敛的 Halfcode 模块边界

当前 Halfcode `DataGraphNodePlan` 只声明普通 signal/computed/processor/async/consumer 节点，没有把 stream 或 state node 作为 DSL 词汇。升级 track 保持此领域边界：静态 fixture GraphModule 改为显式 signal slot helpers，动态 materializer 以 plan 约束验证它仅向 signal refs 调用 `get/set/addComputed/addAsync/addProcessor`；若 upstream runtime graph 暴露 stream ref，materializer 必须给出诊断而非以 `GraphNodeIdLike` 强制写入。目标版本新增的 state/stream helpers 只用于 upstream type compatibility 和未来扩展，不隐式改变现有 Halfcode DSL。

## Mission Actors

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| `MissionPlanner` | 期望态产出者 | Processor + Actor | 维护迁移 DAG、真实 track 切片和跨 mission 依赖。 |
| `MissionObserver` | 传感器 | Data + Actor | 读取目标提交、解析版本、代码/API inventory、track 状态和验证报告。 |
| `MissionReconciler` | 控制器 | Processor + Actor | 比较升级目标和实际行为，识别 API/lockfile/语义漂移与重复 Halfcode 工作。 |
| `MissionApplier` | 执行器 | Effect + Actor | 每轮只创建、执行、验证或修订一个 bounded track，并回写状态与证据。 |

## Track 边界

- `upgrade-depa-data-graph-core-unified-runtime`：升级依赖解析与 core 运行时，包含 lockfile、store/server source/core exports、只读 facade、显式 runtime-owner capability 和核心测试。
- `migrate-halfcode-data-graph-unified-api`：仅处理 1.0.1 对 Halfcode graph runtime、fixtures、codegen 的兼容影响；开始前须检查既有 active mission 状态。
- `migrate-depa-data-graph-workspace-consumers`：迁移 Vue adapter 与其余直接 consumer；不得重新实现 core graph 语义。
- 最终验证不再创建重复实现 track；若发现不可局部修复的设计偏差，先报告并修订 mission。

## 受控重规划与人工介入

以下证据允许修订 DAG：目标发布物与指定提交不可解析；0.1.1 与 1.0.1 的实际类型/行为差异要求改变公开 `StreamSignalStore` contract；Halfcode active mission 有未完成、冲突的 graph scope 变更；双 lockfile 的生成策略无法同时稳定。

若需要破坏 `StreamSignalStore` 或 Halfcode DSL 的公开语义、改用目标提交以外的版本、删除消费者功能，或需要改变既有 active mission 的目标，必须暂停并请求用户决策。用户已明确批准将 `eventLog/graph` 收紧为只读 facade，并将真实 graph 改为 composition-root-only capability；此已批准边界不再需要重复确认。

## 风险与缓解

- **历史/状态混淆**：以 event log 为唯一 replay 事实，对 state output 与 event stream 分别测试。
- **过早全仓替换**：先完成 core track，Halfcode 和 consumer tracks 仅依赖稳定 public contract。
- **锁文件漂移**：G1 明确 Bun/Pnpm 的权威生成策略和 CI 检查；G3 只按该策略写锁文件。
- **Halfcode 重复改造**：G1-T3 是强制协调门；新 track 只迁移 upstream API 兼容性。
- **Store reducer 被重复执行**：core track 以 timeline entry 到 reduction result 的一次性关联验证 state node 与 effect sink 的顺序、错误和 feedback 语义。
