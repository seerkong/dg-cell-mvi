# Mission：构建 XNL 可编程文档与投影编辑平台

## 背景和动机

Workbench 已有一套基于 Tiptap 的文档编辑封装，也已经在 Flow Editor
建设过程中形成 SchemaEditor、EditorPresentation、ValueHost、XNL Mutation
和 VFS/VCS 单向写入链路。但是两侧能力尚未形成统一产品：

- 旧 Tiptap 封装以编辑器内部状态和 DOM 为中心，`x-id` 主要残留为表格
  HTML 属性，没有继续承担自定义 Vue 区块的稳定实例寻址和消息路由职责。
- SchemaEditor 适合结构化表单，不应被扩张成所有 XNL 领域编辑器的唯一内部
  模型；Tiptap、图编辑器和领域自定义投影需要共享一个更一般的编译基座。
- 当前 Halfcode Unit 只正式覆盖 Page、Component 和 Flow 产品；尚无能够承载
  文档领域事实、Scope、Runtime、Capsule、Command/Event 与嵌入组件的
  Document Unit。
- 人类、AI Agent、Tiptap、SchemaEditor 和其他 Presenter 尚未共享同一个
  revision、dry-run、validation、XNL Mutation、VFS/VCS 接受协议。

本 Mission 将在 `dg-cell-mvi` 建立通用 `XnlProjectionEditor` 与 Halfcode
Document Unit，并在 `eidolon-workbench` 中迁移 Tiptap 能力、构建可编程文档
和领域 DSL 编辑示例。最终，一个 XNL bundle 可以作为微型应用运行：既能显示
和编辑语义文档，也能嵌入 Halfcode Component/Capsule，并能将任意领域 XNL
通过可替换 Presentation 投影为组合式编辑器。

## 已确认的承重决策

- `XnlProjectionEditor` 是比 SchemaEditor 更一般的基座；SchemaEditor、
  Tiptap、Graph Editor 和领域 Presenter 都是它的消费方或适配器。
- RichDocument 只是一种 Document Dialect，Tiptap 只是一种 Presenter；
  Tiptap JSON、ProseMirror state、HTML 和 DOM 均不是领域事实源。
- Capsule 仍是唯一内联封装原语；Document 是与 Page、Component 并列的具名
  Unit 发布形态，三者都由 Capsule 能力派生。
- XNL `#id` 表示领域节点的持久身份；`x-id` 表示投影实例的运行时地址。
  默认 `x-id = #id`，但多投影、多实例场景允许显式区分。
- 自定义 Vue/Halfcode 区块通过 `x-id` 解析到 Runtime instance 和 Scope，
  接收 Command/Invocation、发出 Event；不得通过 DOM 查询充当消息总线。
- 编辑器只产生标准交互或领域 Command。候选 XNL 经 diff、dry-run、校验和
  ValueHost revision gate 后才成为 accepted snapshot，并由宿主持久化到
  XNL VFS/VCS。
- 同时支持“显式嵌入 Halfcode 区块的可编程文档”和“保持领域 DSL 纯净、
  通过外部 Presentation 投影”的两种模式。
- AI Agent 不直接修改 DOM、Tiptap JSON 或衍生投影；它与人类使用相同的
  Command/XNL Mutation proposal、revision、预览、接受和冲突协议。

## 目标

- 在 `dg-cell-mvi` 定义 renderer-neutral 的 XNL Projection Dialect、
  Presentation、ProjectionPlan、Presenter binding、Interaction、Domain
  Command 和 diagnostics 契约。
- 建立递归投影、交互翻译、候选 XNL 生成、XNL diff 和 accepted-snapshot
  session，并保持 `output = fn(runtime, input, config)`。
- 扩展 Halfcode DSL、loader、compiler 和 runtime，使 AppBundle 支持
  `kind="document"`、`document://<FQN>`、DocumentContract、Document root
  Scope 和嵌入的 Component/Capsule。
- 建立 `x-id` 实例地址注册与解析机制，将自定义区块的消息路由和文档 mutation
  请求接入 Scope Runtime，而不是依赖 DOM。
- 将旧 Tiptap 扩展能力迁移为受边界约束的 Presenter Adapter，直接完成
  XNL domain model 与 ProseMirror/Tiptap model 的投影和回写，不以 HTML
  作为中间事实源。
- 在 Workbench 提供至少一个 RichDocument 微型应用、一个混合 Halfcode
  交互区块的可编程文档，以及一个纯领域 XNL DSL 的多 Presenter 编辑示例。
- 支持人类和多个 AI Agent 在同一 revisioned ValueHost 上提交、预览、接受、
  拒绝或解决冲突，并通过 XNL VFS/VCS 留下版本化事实。
- 用单元测试、契约测试、round-trip/property 测试和真实浏览器 E2E 证明事实源、
  Mutation owner、Scope Runtime、刷新恢复和多 Presenter 行为一致。

## 非目标

- Mission 本身不直接修改产品代码、DSL 规范或测试；所有落地由真实 track
  承担，Mission 只负责控制面、依赖、观察和受控重规划。
- 不把 SchemaEditor 的 object/array/map/union 结构命令模型强行作为所有领域
  编辑器的通用 IR。
- 不把 Tiptap JSON、HTML、DOM、Vue state、ProjectionPlan 或 Presenter local
  draft 提升为第二事实源。
- 不让 Presenter、NodeView、自定义 Vue 区块或 AI Agent 持有 XNL/VFS/VCS
  直接写入权。
- 不在 XNL 中声明 Runtime 对象内部字段或业务方法；Document Scope 仍只绑定
  代码实现的 Runtime instance 和各类 capability。
- 第一阶段不要求实现完整 CRDT、实时光标或任意离线合并算法；先以 revision
  gate、冲突结果和 VFS/VCS 版本管理形成可靠协作边界。
- 不在本 Mission 中整体重写现有 Flow Editor。它可在后续作为
  XnlProjectionEditor 的 Graph Presenter 消费方，但本 Mission 以文档和一个
  非 Flow 领域 DSL 证明通用性。
- Document 不继承 Page 的 URL 输入语义。独立访问先通过标准 Page/Document
  host 或 App entry 组合；是否泛化 Route target 必须由后续实际需求证明。

## 成功判据

- Halfcode AppBundle 可以声明、加载、编译并实例化 Document Unit；原有
  Page、Component、Capsule、Flow 行为不回归。
- Document root Scope 可装配 Runtime、Effect、DataGraph、Command/Event
  等既有 capability，并且内嵌 Component/Capsule 遵守已有可见性和覆盖规则。
- `#id` 与 `x-id` 的身份、默认映射、命名空间、重复检测和实例解析都有文档、
  类型、diagnostics 和测试；运行时路由不依赖 `querySelector`。
- RichDocument XNL 与 Tiptap model 可稳定 round-trip；结构节点移动产生可读
  的 XNL Mutation，普通文本编辑不会造成无关整树重写。
- 人类或 Agent 的一次编辑只沿
  `interaction -> domain command -> candidate -> diff -> dry-run -> validate
  -> accept/reject/conflict -> persist -> reproject` 链路推进。
- Workbench 可运行 demo 同时包含语义正文、Tiptap 富文本、Halfcode 交互组件、
  Capsule Scope 和版本化 XNL source。
- 一个保持 UI-free 的领域 XNL DSL 可以仅更换 Dialect/Presentation/Presenter
  组合，投影为 Tiptap、SchemaEditor、Graph 或 Halfcode 组件，并将编辑正确
  回写为领域 XNL Mutation。
- AI Agent proposal 带 actor、base revision、correlation 和 target identity；
  stale proposal 不覆盖新 revision，接受后的结果可从 VFS/VCS 重载复现。
- `dg-cell-mvi` 与 Workbench 的 package/typecheck/unit/build/browser E2E、
  mutation-owner residue scan 和独立 DEPA 检查通过。

## 与现有 Mission 的关系

`build-schema-driven-halfcode-editor` 是本 Mission 的前置基础：它已经建立
StructureSchema、EditorPresentation、EditorPlan、SchemaEditorSession 与
ValueHost 约束。本 Mission 不重复这些能力，而是在其稳定公共边界之上抽取
更通用的 XNL Projection Editor；若前置 Mission 尚未完成，首个基线任务先观察
其状态，只阻断直接依赖的不稳定接口，不阻断文档 DSL 设计等独立分支。

## 为什么需要 Mission 而不是单个 Track

该目标跨越 Halfcode DSL 标准、loader/compiler/runtime、XNL mutation、
revisioned authoring session、Vue/Tiptap adapter、Scope instance addressing、
Workbench 产品迁移、领域 DSL 投影、AI 协作和 VFS/VCS 验证。任何单个 track
都无法同时安全处理这些边界；而 Tiptap round-trip、交互区块和领域 DSL demo
还会反向暴露基础契约问题，需要在多个真实 track 之间形成反馈驱动的迭代飞轮。

