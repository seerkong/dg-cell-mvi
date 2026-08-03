# 变更：绑定 Tiptap local draft 到真实 EditorState

## 背景和动机 (Context And Why)

Workbench 的真实 Tiptap `Editor` 与现有 local-draft factory 分别组装 canonical schema，
产生不同的 ProseMirror type identity。真实 transaction 因此不能应用到 detached draft state，
返回 `INVALID_TIPTAP_DRAFT`，Interaction 不发布，accepted revision 不推进。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 提供 package-root、adapter-owned 的 EditorState binding factory。
- 直接复用真实 Editor 的 schema/doc/state lineage，不重建并列 document/schema。
- 保持 transaction normalize、revision-free Interaction、composition/history/reproject 语义。
- 与 canonical table、Mermaid、Component/Capsule NodeView extensions 共存。

**非目标:**

- 不新增 Editor factory/controller 或接管产品 DOM 生命周期。
- 不接收 `Editor`、DOM、raw NodeView、authoring session、revision、VFS/VCS 或 writer。
- 不修改 contract/logic/support、Workbench 产品代码或 detached draft 既有 API。

## 变更内容（What Changes）

- 新增 `bindXnlRichDocumentTiptapDraftToEditorState` 和 exact input type。
- 校验真实 EditorState 使用 canonical schema surface，并 fail closed 处理 malformed state。
- 让 bound draft 的 accepted document 直接引用 `editorState.doc`。
- 更新 public API 文档和 package-root real Editor tests。

## 影响范围（Impact）

- 行为：`xnl-document-tiptap-presenter`
- 代码：`packages/dg-cell-mvi-halfcode-tiptap-vue`
- 文档：`docs/halfcode/dsl-bundle/spec/frontend/tiptap-document`
- 下游：Workbench programmable-document T2.2

