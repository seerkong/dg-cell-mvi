# 变更：新增 halfcode workflow / business-flow DSL 标准

## 背景和动机 (Context And Why)

代码侧已有 `WorkflowMaterial` 草图，但 DSL 标准没有业务流或状态机规范。业务流需要表达 state、transition、guard、command、effect、entry/exit action，并映射到 MVI event/effect loop，而不是写成前端按钮回调。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义 workflow/business-flow DSL 的 L2 公理。
- 声明 Workflow、State、Transition、Guard、Command、Event、Effect、Entry/Exit 等节点。
- 将 guard 映射到 processor/guard 实现，将 command/effect 映射到 runtime event/effect。
- 明确何时需要 actor：只有存在 identity/lifecycle/mailbox/cancellation 或无法 DAG 化的协作时才引入。

**非目标:**
- 不做通用 BPMN 全量替代。
- 不把 workflow guard/effect 写成内联函数。
- 不让 UI state 直接驱动业务流状态。

## 变更内容（What Changes）

- 候选新增：
  - `docs/halfcode/dsl-bundle/std/workflow/axioms.md`
  - `docs/halfcode/dsl-bundle/spec/workflow/{domains,nodes,files,refs}.md`
- 候选域：`workflows`、`commands`、`guards`、`events`、`effects`。
- 候选 diagnostics：transition target missing、guard unresolved、command event mismatch、effect feedback unhandled、cycle requires actor boundary。

## 影响范围（Impact）

- 依赖：runtime DSL、resource/backend-flow DSL；投影 family 后续另行设计。
- 后续影响 product material 的 WorkflowMaterial 与 frontend intent wiring。
- 当前状态：proposal-only 候选 track，执行前需补齐 behavior delta、design、track.xml。
