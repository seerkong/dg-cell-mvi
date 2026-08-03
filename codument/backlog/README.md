# codument/backlog —— 候选工作清单 + AI 自主度

> 目录职责 · holds: 跨 track 的候选工作项 + 优先级 + AI 自主度标签 · excludes: 需求(→track proposal)、owner 真源(→docs/behaviors)、执行计划(→track.xml) · tier: 活的工作面（就地改、不带日期，非真源） · ⬆from: 用户/复盘提出的下一步 · ⬇to: 选中后开 track

本目录是 codument 对 AGE `docs/backlog/` 的对应物：一份**活的、可变的**"下一步该做什么"清单。它**不替代** track 的 proposal/behavior_deltas（需求）、`docs/`+`behaviors/`（owner 真源）、`track.xml`（执行计划），只用来**选下一个 track**。

## 工作项表

| 优先级 | 工作项 | 关联 behavior/需求 | owner 文档 | track | 状态 | AI 自主度 | 阻塞 | 最后检查 |
|---|---|---|---|---|---|---|---|---|
| P1 | 建立可复用的领域 DSL onboarding/compiler 工具链，让新增 XNL DSL 主要提供 Dialect、classifier、transformer registry 与 Presentation，而不重写 Editor | `behaviors/xnl-projection-editor-foundation.xml` | `docs/halfcode/dsl-bundle/spec/frontend/xnl-projection/` | `<未开>` | `needs-track` | `plan-first` | 需要选择首批非 SystemDesign 领域 DSL，并冻结“接入而非专项开发 Editor”的验收标准 | `2026-08-03` |
| P1 | 将现有 Flow Editor 重构为 XnlProjectionEditor 的 Graph Presenter/领域 adapter，保留 CtrlFlowEditor 与 DAGFlowEditor 产品交互 | `behaviors/xnl-projection-editor-foundation.xml`、`behaviors/workbench-flow-schema-editor.xml`、`behaviors/workbench-flow-structure-authoring.xml` | `docs/halfcode/dsl-bundle/spec/frontend/xnl-projection/`、`docs/halfcode/dsl-bundle/spec/flow/` | `<未开>` | `needs-track` | `plan-first` | 需先盘点 Flow 专用 ValueHost、mutation、projection 与通用基座的重叠和迁移边界；应作为独立 Mission | `2026-08-03` |
| P1 | 把 Agent proposal/review 基座产品化为真实多 Agent 文档生成、修改、权限与调度体验 | `eidolon-workbench:behaviors/agent-assisted-xnl-authoring.xml`、`behaviors/xnl-document-authoring-session.xml` | `docs/halfcode/dsl-bundle/spec/frontend/authoring/` | `<未开>` | `needs-track` | `ask-first` | 需确认 Agent transport、身份认证、Runtime 接入、任务编排和用户交互边界 | `2026-08-03` |
| P2 | 为 Document Unit 设计直接 Route target 与 URL/open-context 契约 | `behaviors/dg-cell-mvi-halfcode-unit-dsl.xml` | `docs/halfcode/dsl-bundle/spec/frontend/document.md` | `<未开>` | `needs-track` | `research-only` | 当前 Page/Document host 已满足场景；缺少必须绕过 Page 的真实路由需求 | `2026-08-03` |
| P2 | 评估并设计 CRDT/OT、实时光标与离线并发合并能力 | `behaviors/xnl-document-authoring-session.xml` | `docs/halfcode/dsl-bundle/spec/frontend/authoring/` | `<未开>` | `needs-track` | `research-only` | 需要真实多人并发、离线编辑和冲突合并需求；当前 revision gate + VFS/VCS 已满足已知场景 | `2026-08-03` |
| P2 | 为 Workbench Flow Editor 新增 AICtrlWorkflow 产品 adapter | `behaviors/halfcode-profiled-flow-runtime.xml`、`eidolon-workbench:behaviors/workbench-flow-schema-editor.xml` | `docs/halfcode/dsl-bundle/spec/flow/` | `<未开>` | `needs-track` | `ask-first` | Workbench 历史上未支持 AIAgentWorkflow；需确认产品入口、节点 palette、配置与运行时需求 | `2026-08-03` |
| P2 | 清理 Workbench Flow Editor 对 `visual-graph/src` 的跨 package 深层导入，建立稳定 public exports | `<待补 package-boundary behavior>` | `<待补 visual-graph owner 文档>` | `<未开>` | `needs-track` | `plan-first` | 需先定义 visual-graph 公共 surface，并盘点所有现存 deep import 消费方 | `2026-08-03` |

## AI 自主度（沿用 codument 校验/审查语义）

- `implement` — 已读关联需求/owner 文档/校验命令后可直接开 track 并实现。
- `plan-first` — 可起草 track.xml，但实现前要过校验（cdt:GapLoop/HumanConfirm）或受保护区批准。
- `ask-first` — 改代码/用户可见行为前必须先问。
- `research-only` — 只能调研/总结/提选项，不改产品行为。
- `blocked` — 阻塞未解前不动。

## ready 不变量（可被选中执行的前提）

`ready` 当且仅当：
- 关联 behavior/需求已明确、有可测验收（或能在开 track 的澄清里立刻定清）；
- owner 文档存在且对该 slice 不是已知 stale（见 `knowledge-tiers.md` 新鲜度）；
- 不触发受保护区（破坏性/数据/权限/外部集成）或已有批准路径；
- 阻塞为空或显式标注非阻塞。

## 选择规则

用户让"继续"但没点名任务时：选**优先级最高、自主度=`implement`、无阻塞**的工作项开 track。无安全 `implement` 项时，总结最高优先级的 `blocked`/`plan-first`/`ask-first` 项并请用户定夺。AI 可凭证据把 `ready` 降级为 `needs-*`/`blocked`；**不得**在无人确认下把项升为 `ready`、把自主度调成 `implement`、或清除阻塞。

> 本文件是单一可变清单（就地改），不要按日期拆分；跨 track 复发的教训应进 `memory/`，稳定真源应进 `docs/`/`behaviors/`，都不留在这里。
