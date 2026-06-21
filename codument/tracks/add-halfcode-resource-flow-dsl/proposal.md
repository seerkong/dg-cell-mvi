# 变更：新增 halfcode resource/backend-flow DSL 标准

## 背景和动机 (Context And Why)

当前代码中已有 `ResourceSpec`、`ResourceOperationSpec`、`EffectSpec`，但权威 DSL 标准没有说明后端资源、HTTP operation、payload schema、port、auth、pagination、error mapping、server event stream 等如何声明。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义 resource/backend-flow DSL 的 L2 公理。
- 声明 Resource、Operation、Payload、Port、Adapter、RetryPolicy、ErrorMapping、Stream 等节点。
- 明确 resource operation 如何编译为 EffectRequest / EffectHandler。
- 明确 backend flow 与 runtime effect loop、后续投影 family 的关系。

**非目标:**
- 不内联 fetch 函数或 SDK client。
- 不把业务 workflow 状态机放进 resource DSL。
- 不实现真实后端服务。

## 变更内容（What Changes）

- 候选新增：
  - `docs/halfcode/dsl-bundle/std/resource/axioms.md`
  - `docs/halfcode/dsl-bundle/spec/resource/{domains,nodes,files,refs}.md`
- 候选域：`resources`、`resources.def`、`operations`、`payloads.def`、`ports`、`streams`。
- 候选 refs：`resources://#users/list`、`ports://#http`、`streams://#server-events`。

## 影响范围（Impact）

- 依赖：runtime DSL 的 EffectRequest/EffectHandler/ports vocabulary；投影 vocabulary 后续另行设计。
- 后续影响 CRUD list/get/create/update/delete 与 workflow effects。
- 当前状态：proposal-only 候选 track，执行前需补齐 behavior delta、design、track.xml。
