# Add Tiptap Halfcode Document Presenter

## 背景

Mission 已完成 renderer-neutral XNL Projection、Halfcode Document Unit、revisioned authoring session 与 Presenter authority facet。旧 Workbench Tiptap 封装提供 table、code、Mermaid 与 Vue NodeView 素材，但以 HTML/DOM 和编辑器 local state 为中心，无法承担 Domain XNL 事实源或单一 writer。

## 目标

- 建立独立 `dg-cell-mvi-halfcode-tiptap-vue` adapter capsule，隔离 Vue、Tiptap 与 ProseMirror 依赖。
- 建立 UI-free RichDocument contract 与面向 renderer-neutral Projection/Authoring data 的 pure lower/parse logic；只由 support adapter 处理 concrete `xnl-core XnlNode <-> neutral data`，整体形成 `Domain XNL -> RichDocument -> Tiptap JSON`，正常 authoring 不经过 HTML。
- 将 Tiptap transaction 归一化为不含 revision、且只能是 `kind: "interaction"` 的 serializable `XnlProjectionPresenterEditIntent`；可信宿主必须翻译 Interaction，并以提交当刻的 live revision 构造 `XnlAuthoringProposal`，再由既有 authoring session 接受、持久化并重新投影。
- 支持正文、marks、headings、lists、blockquote、link、image、table、code 与 Mermaid。
- 以受限 NodeView host 嵌入 Halfcode Component/Capsule，只暴露 Presenter facade、readonly snapshot、InstanceRef 与限定为 `XnlProjectionPresenterEditIntent` 的 `emitEditIntent` port；不暴露含 `state/submit` 的 `XnlAuthoringProposalPort`。
- 以 GetPut、PutGet、identity/move、lossy diagnostics、headless/jsdom mount 和依赖扫描证明边界。

## 非目标

- Workbench 产品页面、完整产品浏览器 E2E 与部署。
- 迁移或删除 `dg-cell-mvi-admin-element-plus` 现有 HTML-first `RichTextEditor`；它作为 legacy baseline 留存，不进入 Halfcode Document Presenter 主链。
- Agent/collaboration、CRDT/OT、多用户 merge。
- 把 HTML、DOM、Tiptap JSON 或 ProseMirror state 提升为领域事实源。
- 让 NodeView/Presenter 持有 AST、ValueHost、VFS/VCS 或 mutation writer。
- 让 Tiptap adapter/NodeView 读取 current revision、调用 authoring submit，或自行分配持久 `#id`。
- 将 Tiptap/Vue/ProseMirror 依赖引入 halfcode contract、logic 或 support。

## 成功判据

- `#id` 在 XNL/RichDocument/Tiptap node attrs 中稳定保留并驱动 tree alignment/move；不产生普通 `#id` field update。
- `x-id` 只作为 occurrence address 投影并在 mount/unmount lifecycle 中由 owner token 管理。
- Tiptap transaction 只产生 edit intent data；可信宿主才能翻译并补入 current revision，accepted XNL 只能由 authoring owner 推进。
- Tiptap transaction normalizer 不得产生 `kind: "command"`；公共 EditIntent 中的 command variant 只供其他已受信的 Domain Command producer 使用。
- 新建和复制/粘贴由 host/authoring-owned identity allocator 产生新 `#id`；move 保留 `#id`，replacement 表达为 delete+add，`x-id` 只从已确立的持久 identity 派生。
- 标准 RichDocument fixtures 满足 canonical GetPut；accepted edit 满足 PutGet；lossy/unsupported 显式诊断。
- adapter package 可 headless/jsdom mount，selection、IME transaction grouping、undo/redo 与 local draft 不成为第二事实源。
- dependency/residue/public-surface checks 和相关全量测试通过。
- Halfcode Document Presenter 依赖切片（contract/logic/support/halfcode-vue/tiptap-vue）内，只有新 adapter 依赖 Tiptap/ProseMirror/NodeView；本 track 不在其他 package 新增 Tiptap 依赖。
