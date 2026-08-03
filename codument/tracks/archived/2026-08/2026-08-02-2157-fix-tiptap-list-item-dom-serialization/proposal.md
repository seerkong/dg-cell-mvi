# 变更：修复 Tiptap list item 浏览器序列化

## 背景和动机 (Context And Why)

Workbench 在真实 `Editor` 中打开 canonical RichDocument 列表时稳定抛出
`node.type.spec.toDOM is not a function`。`dg-cell-mvi-halfcode-tiptap-vue`
自定义 `listItem` 保留了领域所需的 `block+` content contract，却没有提供浏览器
Presenter 所需的 DOM serializer。Headless schema 检查无法发现这个缺口。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 在 canonical extension registry owner 中为 `listItem` 提供受控 `<li>` serializer。
- 保留 `content: "block+"`、schema id、identity 和 transaction normalizer 语义。
- 用 package-root 真实 Editor 覆盖 bullet list、ordered list 和 blockquote-first list item。
- 区分 Presenter DOM 输出与被禁止的 HTML/DOM reverse-authoring authority。

**非目标:**

- 不修改 RichDocument、authoring、identity、VFS/VCS 或 Workbench 产品代码。
- 不新增 raw NodeView、HTML parser、DOM-to-XNL 写入或公共 API。
- 不改变列表命令、列表数据模型或现有 schema id。

## 变更内容（What Changes）

- 修正 canonical `RichDocumentListItem` 的 browser DOM serializer。
- 收窄 package boundary 测试：允许 adapter owner 的 serializer，继续禁止 HTML/DOM
  反向 authoring 与 DOM lookup writer。
- 增加 package-root 真实 Editor 列表渲染和语义/identity 回归。

## 影响范围（Impact）

- 受影响的能力：`xnl-document-tiptap-presenter`
- 受影响的代码：`packages/dg-cell-mvi-halfcode-tiptap-vue`
- 下游验证：Workbench `integrate-programmable-document-workbench` T2.2 红测

