# Mission Design · redesign-halfcode-hierarchical-unit-dsl

## 控制论模型

- **desired state**：`mission.xml` 的 TaskGroup DAG（G1 证据与规范收敛 → G2 契约 track → G3 loader/fixtures track → G4 compiler/preview track → VERIFY 收口），叶子 Task 上的 `cdt:TrackLink`，以及 `decisions.md` 的 16 项已锁定决策。
- **actual state**：dg-cell-mvi halfcode 包与 xnl.ts 的代码现状、tracks/archive 状态、测试结果、`analysis/`/`reports/` 证据、用户新约束。
- **actuation**：创建/执行/归档 track；写 evidence 报告；受控修订 mission.xml。
- **feedback / drift**：xnl-core 验证报告揭示语法缺口、track gap-loop 报告、fixture 自验证暴露的 DSL 设计矛盾、用户介入。

## Mission Actors

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| `MissionPlanner` | 期望态产出者 | Processor + Actor | 产出/修订 desired mission graph；依据 xnl-core evidence 决定是否插入 xnl.ts 扩展 track 节点 |
| `MissionObserver` | 传感器 | Data + Actor | 读取 track 状态、测试矩阵、analysis/reports、decisions.md、xnl.ts 能力现状 |
| `MissionReconciler` | 控制器 | Processor + Actor | 比较 desired vs actual，判定 drift / ready / blocked / done；判断 pending decision 是否阻塞 DAG |
| `MissionApplier` | 执行器 | Effect + Actor | 执行一个 bounded action：创建/续跑 track、写报告、light 模式下必要时一次有界提问 |

## plan vs track 区分

- mission 只做：证据盘点（xnl-core 语法能力验证）、DSL 规范文档收敛、track 切片与编排、批间验证、最终 verify。
- 代码/类型/loader/compiler/fixtures/测试全部由真实 track 落地（G2/G3/G4 的 TrackLink 叶子任务）。
- **显式例外**：G1-T1（xnl-core 语法验证）在 mission 内直接执行而不建 track——它只产出 `analysis/xnl-core-capability-report.md` evidence，不修改任何代码；正因为它的结论决定是否需要 `extend-xnl-core-dsl-syntax` track，必须先于 track 切片完成。若结论是"需要扩展"，由 G1-T3 把该 candidate track 转正（受控重规划，Revision+1）。

## 候选 track 切片（依据 decisions.md 决策编号）

| candidate track id | 范围 | 覆盖决策 |
|---|---|---|
| `extend-xnl-core-dsl-syntax`（条件性） | xnl.ts：tag 含 `.`、`(...)`+`[...]` 并存、属性值 `://` 等语法扩展与测试 | D16 |
| `add-halfcode-v3-unit-contract` | contract 层：v3 单元类型（HalfcodeApp/Page/Component/Capsule）、PageContract/ComponentContract、Requires、scheme↔domain↔单文件区段三列对照表、URI ref 类型、validation 红线 | D1,D2,D4,D5,D7,D8,D9,D11,D12,D13,D14 |
| `add-halfcode-unit-bundle-loader` | support 层：Units 注册、单/多文件单元加载、FQN 注册表、scheme 解析器、单元私有性 diagnostics、分层 fixtures 迁移 | D3,D7,D10,D15 + fixture 自验证 |
| `add-halfcode-v3-compiler-projection` | logic/preview：RouteTree→AdminShellPlan、URL/props/Requires 编译校验、app wiring→plan、v2 legacy quarantine、preview 页闭环 | D2,D3,D5,D6,D14 |

切片纪律沿用上一 mission 级 track 的经验：contract 先稳定 → loader/fixtures → compiler/preview；每个 track 的 proposal 必须回指 decisions.md 决策编号。

## 受控重规划

active 后允许增删改节点与 DAG，但必须有 evidence 或 human decision，写 `reports/replan-XXX.md`，`Metadata.Revision` 递增。可预见的重规划触发点：

1. **G1 xnl-core 验证结论**：决定 `extend-xnl-core-dsl-syntax` track 转正或移除（G1-T3 即为此设计的显式重规划节点）。
2. **fixture 自验证暴露 DSL 矛盾**：G3 中分层 fixture 重写是对 16 项决策的第一次全量纸面/代码验证；若暴露决策间冲突（如 scheme 解析歧义），回写 `decisions.md` 修订记录并调整后续 track 边界。
3. **decisions.md 是决策真源**：mission 执行期不得静默推翻 D1-D16；变更必须走 human decision + report。

## 人工介入

- QuestionSeverity=light：规划期已无 P0 未决问题；执行期仅当 fixture 自验证暴露决策冲突、或 xnl-core 扩展成本远超预期（例如需要重写 parser）时提问。
- 每个 track 的 gap-loop `on-exhausted="block"` 沿用项目默认，block 即人工介入点。

## 风险

| 风险 | 缓解 |
|---|---|
| xnl-core 语法扩展比预期大（parser 级改动） | G1 先出 evidence 报告再定 track；成本超预期时人工介入决定降级语法（如 tag 用 `-` 代 `.`） |
| v3 契约一次定过宽，重蹈 P1-P12 三次口径修正 | contract track 只覆盖 D1-D15 已拍板项，悬空项（表达式三分类落地、-def 类型 DSL 深化、CRUD data graph）显式留 backlog |
| 分层 loader 递归/私有性边界实现复杂 | fixtures 先行设计（loader track 内 fixture 与 loader 同步演进），负例（私有性违规、Requires 不满足）纳入验收 |
| legacy v2 兼容面扩大 | 沿用 quarantine 传统：v2 单文档入口只在 compat adapter，新增结构扫描测试守 v3 fixture 纯净性 |
| 跨仓库（xnl.ts）变更的联调 | dg-cell-mvi 侧 track 以 xnl.ts 发布/本地 link 版本为前置门禁，G3 gate 显式检查 |
