# Mission：halfcode 分层单元 DSL（App/Page/Component/Capsule + 统一 URI 引用）

## 背景和动机

上一个 track `redesign-dg-cell-mvi-halfcode-industrial-dsl`（P1-P12，已完成）把 halfcode 建成了 canonical `HalfcodeDocument` + XNL-only bundle domain registry + Element/Scope/Contract/Intent DSL + compiler plans 的工业化底座。但当前 bundle 仍是**单 app 层级**：一个 `app.halfcode.xnl` 里一棵 ElementTree 从 PageElement 写到叶子，Page/Component/Capsule 只是树上的节点类型，不是可独立存放、独立复用的制品单元。后果：

- 复用只有 shared prefab（`proto` 继承）一条路，复用的是节点模板，不是带 scope/contract/intents 的完整封装单元。
- 路由长在 PageElement 上（`route`/`mount="both"`），页面自我声明挂载位置，无法跨 app、跨路由位置复用。
- 单元的 domain 文件在 app 级平铺，单元边界在文件系统上不可见。
- 引用系统是 `<类别>:<名称>` 点分形态，与 `vfs://` 路径两套规范并存。

2026-07-02 的设计讨论已收敛出完整的目标模型（16 项决策，见 `decisions.md`）：**Capsule 是唯一封装原语（仅内联）；Page/Component 是其有名可复用发行形态；App 是组合根（路由树 + 单元注册）；全部引用统一为 `<scheme>://` URI 形态**。

## 目标

1. 把 16 项已拍板决策转化为 contract 层类型与 DSL 规范：单元层级模型、PageContract（urlInputs+accepts/emits）/ComponentContract、统一 URI scheme 映射表、Requires 宿主期望契约、单/多文件双形态、`v3` apiVersion。
2. 验证并（如需要）扩展 xnl-core（`xnl.ts`）以支持新语法：tag 名含 `.`、同节点 `(...)`+`[...]` 并存、属性值 `://` 等。
3. 重构 bundle loader：Units 单元注册（文件/文件夹双形态）、递归单元加载、FQN 注册表、scheme 解析器、单元私有性边界。
4. 迁移 fixtures 为分层结构（app/pages/components 目录、路由树上移、单文件+多文件形态混合覆盖），并作为设计的自验证。
5. compiler/preview 升级：RouteTree→AdminShellPlan、URL 输入校验、props↔Contract 校验、Requires 校验、page 间 wiring 编译、intent diagnostics 延续。
6. legacy（v2 单文档形态）按既有 quarantine 传统保留兼容入口。

## 非目标

- mission 本身不直接改代码；代码、规范、测试落地由真实 track 承担（例外见 design.md：xnl-core 语法验证任务只产出 evidence 报告，不改代码）。
- 不迁移 eidolon-workbench 侧消费（仍走 legacy 路径）；只保证 dg-cell-mvi 内 preview 页闭环。
- 不在本 mission 展开真实 CRUD data graph / depa-data-graph 数据建模（延续上一 track 的边界）。
- 不删除 v2 legacy 路径与既有 demo。
- 不设计可视化编辑器（`editor.canvas` 域继续按需缺省）。

## 成功判据

- contract 层存在 v3 单元体系类型与 scheme 映射表，且有边界测试（禁止函数/直接 fetch 等红线延续）。
- xnl-core 语法能力有明确 evidence 报告；若做了扩展，xnl.ts 测试通过。
- bundle loader 能加载分层 fixture：Units 注册 → 递归单元加载 → FQN 注册表 → scheme 解析；单元私有性违规产出 diagnostics。
- 至少一套分层 fixture 覆盖：多文件 page、单文件 component、component 单元被两个 page 复用、embedded page（合成 URL 输入）、app wiring、Requires 校验（含一个故意不满足的负例）。
- compileHalfcode（或 v3 compiler path）从分层 bundle 产出 renderPlans/adminShellPlans/intentBindingPlans/wiringPlans，URL/props/Requires 不匹配均有 diagnostics。
- 每个落地 track 回指 decisions.md 的决策编号；所有 mission 节点 DONE 或 SUPERSEDED；最终 verify 报告确认收敛。

## 为什么需要 mission 而不是单个 track

- 跨仓库不确定性：xnl-core 语法支持情况未知，可能需要修改 `xnl.ts`（另一个仓库）——是否需要、改多少，要先出 evidence 才能定 track 边界。
- 变更面横跨 contract/loader/compiler/fixtures/preview 五层，上一个同量级重设计（P1-P12）经历了三次口径修正；一次性 track 无法安全闭环，需要"契约先行 → loader/fixtures → compiler/preview"分批落地并在批间验证。
- DSL 规范类工作（scheme 映射表、单文件区段对照表）需要设计收敛节点在 track 之外持续观察实际态并允许受控重规划。
