# Mission：构建 Schema-driven Halfcode Editor 基座

## 背景和动机

当前 Workbench Flow Editor 虽然通过 canonical Halfcode runtime 与 renderer 展示节点配置，但其 schema 到界面的投影只完整递归 object 字段。array、map 和 free-form object 大多退化为 JSON textarea；reorderable array 只补了排序列表，没有形成 item 的增、删、改和递归字段编辑。这使 Flow 的 `If.branches`、EagerDataFlow inputs/waitFor、flow-level config 等结构无法通过可发现的产品交互完整 authoring。

本 mission 在 `dg-cell-mvi` 建立通用 Schema Editor 基座：语义结构 schema 与可视化 presentation 分离，业务分类与转换逻辑由 `SchemaEditorDialect` 的 TypeScript 实现提供，compiler 先生成 renderer-neutral `EditorPlan`，再 lowering 为 canonical Halfcode App Bundle。Workbench Flow Editor 只是第一个完整消费方。

## 已确认的承重决策

- `EditorPresentation` 是纯数据，只引用 stable presenter id，不嵌入组件或 transformer 实现。
- `SchemaEditorDialect` 的公开代码词汇只有 `classify` 与 `transformers`；同一 schema 可以在不同业务 Scope 中绑定不同实现，固定选择算法由 base compiler 拥有。
- 所有动态处理器继续遵循 `output = fn(runtime, input, config)`。
- 递归由 compiler runtime 的 `compile` 消息承载，不向 transformer 增加临时第四参数或把递归函数塞进输入数据。
- Schema Editor 输出先经过 `EditorPlan` IR，再 lowering 到 canonical Halfcode bundle；renderer 不直接消费 raw schema。
- 编辑器只发结构化 set/insert/remove/move 等 Command，真实写入由宿主 mutation adapter 负责。

## 目标

- 在 `dg-cell-mvi-halfcode-contract` 定义泛型 `StructureSchema<T>`、`EditorPresentation`、`SchemaEditorDialect` 协议、`EditorPlan` 与结构化编辑 Command。
- 在 logic 层实现递归 compiler、transformer 选择优先级、默认 dialect、业务 dialect 组合和 plan diagnostics。
- 在 support 中实现 pure `EditorPlan -> canonical shell App Bundle` lowering 与独立 ValueHost/session；在 Vue/Element Plus adapters 中实现动态 collection item template 和默认 presenters。
- 提供 schema-only、schema + presentation overlay、custom dialect/full editor 三档用法。
- 让 flow-level config 与 node-level config 使用同一基座，并通过可选预制 `EditorPresentation` 控制体验。
- 完整迁移 InstantCtrlFlow、WorkCtrlFlow、BPCtrlFlow、EagerDataFlow 配置编辑，消除默认 JSON textarea authoring。
- 用相同 `user.phone` 业务语义在业务 A/B 绑定不同 transformer/组件，证明业务定制与组件沉淀可复用。

## 非目标

- 不恢复已移除的旧 renderer。
- 不把业务组件、Vue props 或 transformer 函数写进语义 schema。
- 不让 `EditorPresentation` 成为新的业务事实源或持久化 owner。
- 不让通用 editor 直接写 XNL、数据库、signal 或 Vue state。
- 不在基础 kind 不匹配时静默回退到 JSON textarea；raw JSON 只能是显式选择的高级 presenter。
- 不在 mission 文件中直接实现代码；规范、代码、测试和迁移由真实 tracks 承担。

## 成功判据

- 任意嵌套 object/array/map/union schema 可生成稳定 `EditorPlan`，collection item 支持递归增删改移。
- presenter 解析遵循：显式 presentation > scoped business semantic transformer > format transformer > structural kind transformer > diagnostic。
- 业务 A/B 可对同一 semantic type 使用不同 transformer，且 shared property presenter 可跨多个 editor 重用。
- compiler/runtime/renderer 之间保持 Data、Processor、Effect、Actor 和事实源边界；所有写入经 ValueHost/mutation adapter。
- Flow Editor 的 flow-level 与 node-level 配置均可由预制 `EditorPresentation` 控制，并生成完整有效 canonical Flow XNL。
- `If.branches` 可新增、删除、修改 id/when/config、拖动排序；刷新后配置、画布端口和 XNL 一致。
- Workbench 不再把 array/map/object 的正常 authoring 默认显示为 JSON textarea。
- dg-cell-mvi、Workbench unit/typecheck/build、真实浏览器 E2E、chaos 与独立 DEPA gate 全部通过。
- 已完成但验收失真的 Flow authoring track 状态得到修订或由明确 corrective track 取代，不继续宣称 JSON round-trip 等于完整可视化 authoring。

## 为什么需要 mission 而不是单个 track

该目标跨越 contract、compiler IR、递归算法、Scope runtime、canonical bundle lowering、Vue/Element Plus presenter、通用 mutation protocol、Workbench Flow adapter 和多产品 E2E。执行中还可能暴露 canonical Halfcode 对动态 collection/template 的新需求，需要根据代码证据受控重规划。

mission 只负责控制面、DAG、观察和重规划；每一批规范、代码与测试都由独立 track 落地。
