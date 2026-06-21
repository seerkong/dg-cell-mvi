# Decisions

## Usage

- 本文件记录本 track 已确认的承重决策；执行期若出现改变这些结论的新问题，继续追加到本文件。

### 1. 【P0】Canonical bundle 根

- 最终决策：使用 `<AppBundle>`，迁移仓内 `<FrontendApp>` canonical inputs，不保留 compatibility branch。
- 决策理由：bundle 新增非 frontend unit，根名称必须表达异构 registry。
- 状态：decided

### 2. 【P0】首个 track 的执行边界

- 最终决策：compiler 只产出 serializable authoring plans；任何 module resolve/call 与 flow execution 均禁止。
- 决策理由：用户明确要求先以 DSL 和编辑器检验设计，runtime 属于 mission 后续 tracks。
- 状态：decided

### 3. 【P0】复杂样例保留范围

- 最终决策：保留两个 Welcome units，并迁移原 `CtrlFlowDemo1`、`DataFlowDemo1` main、`DataFlowDemo2` subflow。
- 决策理由：简单与复杂样例共同构成 DSL 验收 corpus。
- 状态：decided

### 4. 【P0】Flow XNL 槽位与直接子节点

- 最终决策：所有节点遵循 `<Tag #id metadata {attributes} (unique child domains) [direct/repeated children]>`；CtrlFlow 语句与 DataFlow 图节点直接放 Flow 根 `[]`，禁止无语义根 `Block` / `Nodes` wrapper；`()` 每类子域最多一次，多项用唯一 `<XXXs [...]>` 复数容器。
- 决策理由：这些语义由 XNL 槽位本身提供，额外 wrapper 会制造虚假领域层级，并使 parser/editor 产生第二套结构规则。
- 状态：decided

### 5. 【P0】DataFlow topology 与引用

- 最终决策：DataFlow 根 `[]` 直接承载且恰好包含一个 EntryNode 和一个 ReturnNode；同 Flow 数据连接使用私有 `flow-port://#node/port` registry，显式完成依赖使用 `waitFor = ["flow-node://#node"]`；authoring plan 分列 `dataEdges` 与 `waitForEdges`，完整依赖图是两者的并集；SubFlow 只用 `data-flow://FQN`，端口从目标 FlowContract 派生。
- 决策理由：旧 DataFlow 已把 `connectedInputs` 和 `waitNodeKeys` 作为两类独立拓扑事实。独立 scheme 让引用类型在 URI 协议层可判定，不需要根据 fragment 路径形状猜测 node fact 或 port data；node tag、FlowContract 和 URI 已能表达 identity/ports/dependencies，无需重复 entry/exit key、GraphConfig、connectedInputs 对象层或 SubFlow outputs；显式 `waitFor` 即使与数据边重合也必须保留，不能被 compiler 静默归一化。
- 状态：decided

### 6. 【P1】Editor facts 与 projection ownership

- 最终决策：semantic XNL、独立 `flow.authoring` XNL、runtime UI state 三分；由前两者派生只读 editor view model；移除 JSON sidecar 与重复 formModel 真源。`flow.authoring` 是领域数据，不占用 XNL metadata slot。
- 决策理由：用户布局不可由 topology 无损重建，因此它是独立事实而不是投影；每类事实仍保持单一写入者，衍生 view 不反写。
- 状态：decided

### 7. 【P0】AppBundle URI scheme 使用单数 kebab-case 实体名

- 最终决策：所有 canonical URI scheme 使用所引用实体的单数 kebab-case 名，scheme 禁止 `.`。复数 XNL 容器、dotted domain key 和文件名可以继续表达集合/facet，但不再机械决定 scheme；现有复数/dotted scheme 与新增 Flow scheme 全部一次性迁移，不提供 alias、双读或自动改写。
- 决策理由：URI 每次解析的是一个 Page、Command、Event、Scope、Flow 或 logic type。单数 kebab-case scheme 让协议直接表达目标实体类型，并避免 `.` 同时承担 domain facet、FQN 和 scheme 分段三种职责。`HALFCODE_SCHEME_TABLE` 是 domain/container 到 entry scheme 的显式映射真源。
- 状态：decided

### 8. 【P0】类型信息归实际节点

- 最终决策：不建立 EffectType、GraphLogicType、FlowLogicType catalog 或对应 URI scheme。领域/执行类别由实际 node tag 表达；TS 签名作为节点 `type = "vfs://...#Type"` 配置；Quick 实现直接使用节点 `src`/`impl`；Split/Public 由 Scope 按稳定节点 identity 绑定实现；少量闭集选项使用裸 enum。
- 决策理由：类型信息属于被执行/绑定的实际节点，TS export 已是代码类型真源。额外 Type catalog 会制造一层 XNL 间接寻址与第二 identity，也削弱 Halfcode 以代码承载强类型的方向。
- 状态：decided

### 9. 【P0】DataFlow 节点命名与 DataGraph 正交

- 最终决策：DataGraph 保留与底层 API 一致的 `ComputedNode` / `ConsumerNode`；DataFlow 使用 `TransformNode` / `SinkNode`，不使用旧设计中的 `ComputeNode` / `ConsumeNode`。DataFlow canonical 节点集为 `EntryNode`、`TransformNode`、`SinkNode`、`SubFlowNode`、`ReturnNode`。
- 决策理由：两组节点语义不同，但 `Compute`/`Computed` 与 `Consume`/`Consumer` 在同一 AppBundle 中难以快速区分。保留 DataGraph 命名可维持对 `depa-data-graph` kind/API 的一对一映射；DataFlow 用端口行为命名后，`TransformNode` 明确产生输出，`SinkNode` 明确无数据输出而只产生完成事实。`TransformNode` 名称不额外承诺实现为纯函数、同步函数或无副作用。
- 状态：decided
