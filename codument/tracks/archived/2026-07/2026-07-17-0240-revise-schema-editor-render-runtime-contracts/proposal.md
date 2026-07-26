# 变更：修订 Schema Editor 渲染与运行时前置契约

## 背景和动机 (Context And Why)

现有 compiler 已能递归生成六类 `EditorPlan` 节点，但计划会丢失 label、required、enum/const、constraints、union discriminator/alternative 描述、map key 和 collection 创建/identity 等后续渲染必需事实。若直接进入 Vue renderer，renderer 只能重新读取 raw schema 或写入类型特例，破坏 `StructureSchema -> EditorPlan -> renderer` 的 IR 边界。

同时，`EditorPresentation.overlays` 已进入公开 contract 却未被 compiler 消费，导致两种 presentation 写法语义不一致。本变更先修订中立 contract 与 compiler 输出，为后续 runtime、Vue renderer 和 Element Plus presenters 提供稳定输入。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义按 plan node kind 约束的 renderer-neutral metadata。
- 让 compiler 传播 schema、field、presentation 中渲染所需的 label、description、required/readOnly/visible、constraints、enum/const、collection/map/union/ref 等事实。
- 为 collection item creation 与 stable rendering 提供纯数据默认值和 identity hint，不嵌入 factory/function。
- 对 path-targeted `EditorPresentation.overlays` 做确定性 normalization，并与递归 overlay 使用同一编译路径。
- 以 contract/logic 测试证明 renderer 无需回读 raw schema 即可获得默认 presenter 所需信息。

**非目标:**
- 不实现 Vue renderer、presenter registry 或 Element Plus components。
- 不实现 canonical bundle lowering、Scope bridge、`ValueHost` 或 `SchemaEditorSession`。
- 不实现 XNL mutation、VFS、数据库或 Flow 特例。
- 不在 compiler 中展开当前 collection/map snapshot。
- 不增加隐式 raw JSON/code fallback。

## 变更内容（What Changes）

- **BREAKING**：细化实验期 `EditorPlan` node contract，增加强类型、可校验的 metadata，并按真实 renderer 需求调整默认 presenter 选择。
- 扩展 `StructureSchema` 的可序列化 default/collection identity 描述，并强化 validation。
- 实现 field-context metadata 传播、path overlay normalization 与确定性覆盖规则。
- 更新 schema-editor 文档、示例、package root exports 和 dependency boundary tests。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-schema-editor-render-contracts`
- 受影响的代码：`dg-cell-mvi-halfcode-contract`、`dg-cell-mvi-halfcode-logic`、schema-editor docs/tests
- 后续消费方：support lowering/session、Vue renderer、Element Plus presenters、Workbench Flow Editor
