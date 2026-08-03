# 变更：建立 XNL Projection Editor 通用基座

## 背景和动机 (Context And Why)

现有 SchemaEditor 已经验证了“纯数据 Presentation + 代码侧 Dialect +
renderer adapter + 单向 authoring”的可行性，但它的结构语言专门服务
object/array/map/union 表单。富文档、领域 DSL、图和可编程区块不能被强制转换
为这套表单种类。

本 Track 在 `dg-cell-mvi` 建立 renderer-neutral 的 XNL Projection Editor
foundation，使同一份 Domain XNL 可以由不同业务 Dialect 与 Presentation
投影给不同 Presenter，同时保持 Domain XNL 为唯一权威事实。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 定义可序列化的 Presentation、ProjectionPlan、DomainRef、diagnostic、
  Interaction、Domain Command 与 Presenter adapter contracts。
- 实现 runtime-owned Dialect、开放 classification、transformer registry 和
  递归 compiler。
- 实现 Interaction 到 Domain Command/diagnostic 的纯翻译，不在 foundation
  中接受 mutation。
- 在 support 层提供真实 `XnlNode` traversal 与默认 XNL Dialect adapter。
- 用至少两种 renderer-neutral Presenter adapter 证明同一 ProjectionPlan
  可以有不同 surface，不引入 Vue、Element Plus、Tiptap 或 DOM。
- 通过依赖扫描证明 `contract <- logic <- support`，并固定
  SchemaEditor 只是消费方/适配器。

**非目标:**

- 不实现 Halfcode Document Unit、Tiptap、Vue renderer 或 Workbench 产品 UI。
- 不实现 revisioned ValueHost、XNL Mutation 接受、VFS/VCS persistence。
- 不把 SchemaEditor 的 group/field/collection/map/union 复制到通用 Plan。
- 不在 Presentation/config 中嵌入 transformer、component、callback、writer
  或其他实现对象。
- 不冻结最终 `x-id` URI；只保留 domain identity 与 projection role。

## 变更内容（What Changes）

- 在 `dg-cell-mvi-halfcode-contract` 增加 `xnl-projection` contracts 和 validator。
- 在 `dg-cell-mvi-halfcode-logic` 增加递归 compiler、Dialect composition、
  Presentation resolution 和 Interaction translation。
- 在 `dg-cell-mvi-halfcode-support` 增加 `xnl-core` AST adapter/default Dialect、
  Presenter registry composition 和中立 presentation runner。
- 增加 contract/logic/support tests、公共 exports、API 文档和依赖残留扫描。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`xnl-projection-editor-foundation`
- 受影响的代码：
  - `packages/dg-cell-mvi-halfcode-contract/src/xnl-projection/`
  - `packages/dg-cell-mvi-halfcode-logic/src/xnl-projection/`
  - `packages/dg-cell-mvi-halfcode-support/src/xnl-projection/`
  - 三个 package 的公开入口、测试与 Halfcode DSL 文档
