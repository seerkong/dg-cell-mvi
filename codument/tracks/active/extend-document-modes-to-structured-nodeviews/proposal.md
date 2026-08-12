# Proposal：补齐结构化 NodeView 的显示模式

## 背景

文档 base mode 与 Halfcode Component/Capsule occurrence overlay 已经建立，但 Insert 中另外两类拥有独立呈现器的结构化节点仍未接入：Mermaid 持续显示源码输入框，Enhanced Code Block 也没有 occurrence 级查看/编辑投影。结果是同一篇可编程文档中的动态区块交互不一致。

## 目标

- 让 Mermaid 与 Enhanced Code Block 复用现有 document base + occurrence overlay + policy session。
- Mermaid view 只投影图表，edit 投影图表与源码编辑器。
- Code Block view 保留 Fold/Copy 业务交互但禁止源码 authoring，edit 恢复源码 authoring。
- Component/Capsule 插入后立即选中 occurrence，使 contextual mode chrome 可发现。
- 所有 mode-only transition 不产生 Domain XNL mutation、revision 或 VFS write。

## 非目标

- 不给 Image、Table、Hard Break 制造没有独立 presenter 的空 occurrence 模式。
- 不把 `isEditing`、overlay 或 policy 结果写入 RichDocument XNL。
- 不复制 display-mode session、registration coordinator 或 mutation writer。

## 影响

主要修改 `dg-cell-mvi-halfcode-tiptap-vue` 的通用 NodeView mode adapter、Mermaid/Code presenter 与测试，并在 Workbench Insert/E2E 中验证真实产品交互。
