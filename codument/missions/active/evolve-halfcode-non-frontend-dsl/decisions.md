# Decisions

## Usage

- 本文件记录 mission 规划期的稳定决策和后续执行期新增决策。
- 当前 severity 为 `light`；本次无 P0 阻塞问题，采用保守默认并把假设写明。

### 1. 【P1】mission 与 track 的关系

- 背景：用户要求用 `codument-plan-mission`，并为 6 个缺口创建 track。
- 最终决策：创建一个 pending mission 作为总控；runtime 创建完整可执行 track；其余四个创建 proposal-only 候选 track。旧投影 track 已撤销，等待重新设计。
- 决策理由：runtime 具备当前可执行粒度；产品物料、resource/backend-flow、CRUD、workflow 需要等待 runtime 基础层收敛后再补齐可执行计划。旧投影设计不符合实际使用习惯，不能作为本 mission 的可执行前驱。
- 状态：revised

### 2. 【P1】L1 foundation 是否继续扩大

- 背景：runtime/CRUD/workflow 都会复用 URI、ref、def/seed、DEPA 四边界。
- 最终决策：不把领域规则塞进 L1；L1 只保留跨 DSL 通则，新增能力通过 `std/<domain>/` 与 `spec/<domain>/` 表达。
- 决策理由：避免 foundation 变成总规范垃圾桶；保持“上层公理推导，领域层特化”的结构。
- 状态：accepted

### 3. 【P1】runtime DSL 与投影 DSL 的先后关系

- 背景：旧投影 DSL 过早固化运行时组合 vocabulary，已被撤销。
- 最终决策：本 mission 当前只保留 runtime 可执行 track；投影 DSL 从本轮 DAG 移除，后续以新的 track 重新讨论。
- 决策理由：继续保留旧并行关系会把已否决的 vocabulary 当作事实源，污染后续重设计。
- 状态：revised

### 4. 【P1】Runtime 不通过 XNL 展开声明

- 背景：2026-07-04 讨论确认 runtime 过于复杂，必须利用 TypeScript object/class/generic/mixin 等类型编程能力表达。
- 最终决策：Runtime DSL 只声明 `RuntimeInstance` 的 `src/create/prototype/derive`；runtime 内部结构、继承、可见性、消息路由、effect/data graph lookup 都由代码实现。
- 决策理由：halfcode 的本质是“半代码”，DSL 负责装配，强类型行为留给代码；否则会把复杂对象系统错误地塞进 XNL。
- 状态：accepted

### 5. 【P1】Scope 是 runtime instance 的装配边界

- 背景：Scope 需要把 effect、data graph、command/event、config 等前面几个 DSL family 动态覆盖装配到 runtime 中，类似早期 Spring XML 注入。
- 最终决策：Scope 通过 `runtime = "runtime://#..."` 绑定真实 runtime instance；Scope sibling bindings 作为 assembly input 交给 runtime protocol。
- 决策理由：这样既保留 DSL 的声明式装配价值，又不牺牲 runtime 对象系统和强类型扩展能力。
- 状态：accepted

### 6. 【P1】Data graph 实现前必须重新做代码事实盘点

- 背景：前一版 graph 设计被确认不符合 `depa-data-graph` 和 `dg-cell-mvi` 的实际使用习惯。
- 最终决策：data graph runtime binding track 依赖一个普通 mission evidence 任务，先盘点全代码使用模式，再创建/执行实现 track。
- 决策理由：避免把错误 graph 抽象编译进 runtime 底座。
- 状态：accepted

### 7. 【P0】Data graph 启动前先收口 runtime integration boundary

- 背景：2026-07-11 的 DEPA/halfcode review 发现 scope-derived ref 的 loader semantics 与 runtime resolver 不一致，且这套语义将被 `scope.data.graph://` 复用；同时存在跨仓库 runtime 行为冲突、host diagnostic 与 portable loading 缺口。
- 最终决策：新增 G2R-T3 `align-halfcode-runtime-boundaries`，并让 G3 同时依赖 G2 与 G2R；该 track 只修复 shared runtime integration boundary，不设计 data graph binding。
- 决策理由：data graph 的独立设计仍必须来自 G3-T1 的全代码 evidence。先统一 Scope visibility 和 runtime boundary，能避免把错误的 unit-global registry semantics 固化到 graph DSL。
- 状态：accepted

### 8. 【P1】以 Command / Event / Message 替代 canonical Intent

- 背景：用户希望 frontend、backend、BO 与本体模型共用行为协议；现有 `Intent` 同时承担请求和已发生事实，带有 MVI 局部语义。
- 最终决策：canonical FrontendApp 用 `Command` 表示请求、`Event` 表示事实，`Message` 仅用于二者共同的传播/策略抽象。`Action` 不采用，因为它和 UI、Redux/MVI、graph、业务操作等已有词汇冲突。对应 track `migrate-halfcode-intent-to-command-event` 作为 G2C 独立分支执行。
- 迁移决策：这是破坏性清理，不保留旧消息 codec、旧 domain、旧 fixture 或旧 full-code API。Wire 只传递同一 Message，event-to-command 反应留给 runtime code；Codument 历史记录仅作为审计事实保留。
- 决策理由：用清晰的 request/fact 边界统一前后端，同时保持 halfcode 的代码优先原则，避免在 XNL 中重新引入转换逻辑图。
- 状态：accepted
