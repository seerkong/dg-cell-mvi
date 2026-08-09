# Mission：构建分层的可编程文档编辑器

## 背景和动机

现有 XNL Programmable Document 已经证明 Domain XNL、Tiptap Presenter、
Halfcode Document Unit、Component/Capsule NodeView、revision-aware VFS/VCS 与
单向 mutation authoring 可以协同工作。但当前产品仍然是一个 canonical MVP：

- RichDocument 只覆盖 paragraph、heading、list、blockquote、bold/italic/strike、
  inline code、link、image、table、code block 和 Mermaid 等首批语义。
- 下划线、文本对齐、字体颜色、高亮、任务列表、分割线、hard break 和 enhanced
  code block 尚未成为可无损 round-trip 的领域能力。
- Workbench 工具栏直接在 Vue render 函数中硬编码，既不能按 Presentation 配置，
  也不能被常规文档产品复用。
- Component/Capsule 插入、VCS checkout、显式 Undo/Redo、AI Agent 协作入口等
  高级能力尚未形成完整产品投影。

这导致“传统在线文档组件”和“可编程文档平台”仍然混在同一 demo 外壳中：底层
通用能力不足，上层动态能力也缺乏可发现的交互。本 Mission 将先补齐可复用的传统
文档基座，再在其上完成可编程文档工作台。

## 目标

- 扩展 renderer-neutral RichDocument 领域模型，使 underline、text alignment、
  text color、highlight、task list、horizontal rule、hard break 和 enhanced code
  block 都有明确、可序列化、可校验、可 mutation、可 round-trip 的语义。
- 在 `dg-cell-mvi-halfcode-tiptap-vue` 建立完整 Tiptap adapter 与可复用文档编辑
  组件，不以 HTML、DOM 或 Tiptap JSON 作为事实源。
- 建立文档编辑器专用的 Presentation/ToolbarPlan：配置只引用 stable tool /
  presenter id，具体 Vue/Tiptap 实现由代码 registry 和 Scope runtime 绑定。
- 让普通产品可直接复用一套传统文档编辑器，并可按业务 Presentation 裁剪、分组、
  覆盖工具和交互。
- 将 Workbench Programmable Document 改为消费通用组件和 Presentation，不再
  硬编码一整套工具栏。
- 在上层提供 Component/Capsule 插入面板、VCS 历史 checkout、显式 Undo/Redo、
  AI Agent proposal/review 入口，并保持全部修改经过单向 authoring/mutation 链路。
- 用 unit、typecheck、round-trip/property、browser E2E、窄视口和固定 seed chaos
  验证底层复用与上层组合都可用。

## 非目标

- Mission 本身不直接拥有产品代码；规范、实现、迁移和测试由真实 track 承担。
- 不恢复旧的 HTML-first Tiptap capsule，也不通过 DOM query、HTML diff 或
  `v-model<string>` 回写领域事实。
- 不把 Workbench 的按钮布局提升为底层协议；底层只拥有语义、capability、plan、
  registry 和可复用组件。
- 不在本 Mission 实现多人 CRDT、实时光标或离线自动合并。
- 不允许 Component/Capsule、toolbar tool 或 Agent 直接写 VFS/VCS、ValueHost 或
  Domain XNL。

## 成功判据

- 所列传统文档能力全部进入 canonical RichDocument，并通过 XNL <-> model <->
  Tiptap 的 GetPut/PutGet、mutation 和 unsupported/lossy diagnostics 测试。
- 通用文档组件在不依赖 Workbench 的情况下可挂载、编辑、撤销/重做、配置工具栏，
  并将 accepted changes 交给宿主 authoring port。
- Toolbar/command surface 由 serializable Presentation + stable id registry 编译，
  Workbench 不再硬编码全部 Tiptap command。
- Workbench 可插入和配置允许的 Component/Capsule，能显式 checkout VCS revision，
  能从 UI Undo/Redo，并能打开 Agent proposal/review 流程。
- 所有上层交互继续遵守 `interaction -> semantic intent/command -> candidate ->
  diff/dry-run/validate -> accept/reject/conflict -> persist -> reproject`。
- 两个仓库相关 package tests、typecheck、build、真实浏览器 E2E 与 chaos 全绿；
  新产品入口无 legacy capsule、HTML authority、DOM writer 或 direct persistence writer。

## 为什么需要 Mission 而不是单个 Track

该目标横跨 RichDocument contract/logic/support、Tiptap schema/extensions、通用 Vue
组件、Presentation compiler/registry、Workbench 产品迁移、动态区块目录、VFS/VCS
历史交互和 Agent 协作。底层语义与上层产品会形成反馈迭代，必须由 Mission 编排
多个真实 track、观察实际态并在发现通用缺口时受控重规划。

