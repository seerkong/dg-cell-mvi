# Track：升级 Core 至统一 DataGraph 运行时

## 目标

将工作区的直接 `depa-data-graph-core` / `depa-data-graph-vue` 依赖从 0.1.1 升级到 1.0.1，并让 `dg-cell-mvi-core` 采用统一 DataGraph 的显式 Stream source、state node 和 sink，而不是直接写 store-owned signal。

## 变更范围

- 更新所有直接依赖声明和保留 lockfile 的解析结果。
- 将 `StreamSignalStore` 的 event log、state、view model、effect feedback、tap 与 dispose 拓扑迁移到目标 API。
- 验证 `serverEventSource` 和 core re-export 的目标版本兼容性。
- 为状态历史、current projection、一次 reducer 和生命周期增加 characterization/regression coverage。

## 非目标

- 保留 `dispatch/state/viewModel/dispose/eventLog/graph` 字段名，但将 `eventLog/graph` 从可变具体对象收紧为只读 history/graph-observation facade；新增仅供 composition root 使用的显式 runtime-owner API 返回真实 graph。该 breaking type change 已获用户批准。
- 不迁移 Halfcode GraphModule/materializer、Vue adapter 或 CRUD/admin consumer 源码；它们分别由后续 tracks 负责。
- 不修复已记录的 command URI、TypeScript 配置或 Halfcode 类型基线失败，除非本 track 直接导致其行为变化。

## 成功判据

- 所有直接依赖和 lockfile 解析到目标 1.0.1 发布面，不存在混合的直接 0.1.1 解析。
- store 以 append-only event log 为唯一历史，通过 stream-driven signal state 暴露当前状态，effect feedback 和 tap 行为保持。
- reducer 对每个输入 entry 只执行一次；state output 不被当作历史，dispose 后不再改变 state。
- 普通 store 不得暴露 event append、graph mutation 或 graph dispose；需要真实 graph 的调用方必须显式选择 runtime-owner capability。
- server event source 与 core public exports 在目标依赖下通过相关测试和解析检查。

## 风险

目标状态节点将 state output 设为不可任意写入，而当前 store 使用 `graph.set`。track 以 graph-owned stream-driven state node 和 effect sink 保留单一事件写入者，避免在 facade 中引入第二个可写状态事实源。
