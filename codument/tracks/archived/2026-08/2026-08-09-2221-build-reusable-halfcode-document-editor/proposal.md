# 变更：构建可复用 Halfcode 文档编辑器

## 背景和动机 (Context And Why)

RichDocument 已拥有传统在线文档所需的 renderer-neutral 语义，但当前 Tiptap adapter
仍主动关闭 underline、hard break、horizontal rule，并不认识 alignment、color/highlight、
task list。Workbench 也仍自行硬编码 Tiptap toolbar。必须先在 dg-cell-mvi 建立一套完整、
可复用且不拥有领域事实的文档 Presenter capsule，WorkBench 才能只做产品组合。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 扩展唯一 canonical Tiptap registry、projection/parser 与 transaction normalizer，
  无损支持 G2 的全部传统语义。
- 建立递归可序列化的 `DocumentEditorPresentation`、immutable `ToolbarPlan` 和纯
  data-to-data compiler。
- 由代码 registry 绑定 canonical tool command、presenter 与 visibility processor；
  Presentation 只携带 stable id 和 serializable options。
- 提供单一 Tiptap `EditorState` lineage 的可复用 Vue editor capsule，复用已有
  draft lifecycle，并通过 runtime 中的 host authoring effect 发出 revision-free interaction。
- 提供分组、contextual、container overflow、键盘可达的工具栏及 Presenter-only
  enhanced code behavior。
- 以 headless/jsdom 和真实浏览器宽窄容器验证 round-trip、authority 和 DX。

**非目标:**

- 不把 HTML、DOM、Tiptap JSON、toolbar state 或 accepted revision 变成事实源。
- 不在此 track 修改 Workbench，也不实现 Component/Capsule catalog、VCS 或 Agent UX。
- 不允许 Presenter override 更换 canonical tool command 语义。
- 不建立第二套 extension registry、draft store、authoring writer 或颜色校验器。

## 影响

- `dg-cell-mvi-halfcode-contract`：Document Editor Presentation/plan public contract。
- `dg-cell-mvi-halfcode-logic`：validation 与 Presentation compiler。
- `dg-cell-mvi-halfcode-tiptap-vue`：canonical adapter、tool bindings、Vue capsule、tests。
- Halfcode Tiptap 文档规范与 package-root exports。

