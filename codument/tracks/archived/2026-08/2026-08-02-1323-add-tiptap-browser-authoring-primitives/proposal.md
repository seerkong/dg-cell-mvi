# 变更：补齐 Tiptap 浏览器 Authoring 原语

## 背景和动机 (Context And Why)

Workbench 以包公共入口构造真实 Tiptap Editor 后，已经证明 Component/Capsule NodeView lifecycle 可用，但 canonical table 只有 schema、没有可调用的编辑命令和浏览器视图，Mermaid 只有数据节点、没有 NodeView，也没有可由产品代码绑定的安全 render Effect。若产品自行补齐这些能力，会形成第二套 adapter 和 Workbench 特例，破坏 capsule owner 边界。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 在 `dg-cell-mvi-halfcode-tiptap-vue` 公共入口提供可组合的 table browser authoring primitives。
- 提供 Mermaid NodeView，并以 runtime-first Effect contract 注入安全渲染实现。
- 保持 Domain XNL、accepted authoring session 和 VFS/VCS 为既有唯一事实与写入边界。
- 保持 Tiptap transaction 只产生 revision-free Interaction，不从 HTML/DOM 反推 Domain XNL。

**非目标:**
- 不在 config、DSL 或 NodeView 中嵌入 Mermaid 实现。
- 不引入 Workbench 路径、组件或产品特例。
- 不实现第二套 AST、diff、mutation、authoring session 或持久化入口。
- 不扩大 Halfcode Component/Capsule NodeView 的 authority。

## 变更内容（What Changes）

- 以 Tiptap 官方 table extension/commands 为基础，组成保留 RichDocument identity/attrs 的 canonical table extensions 与 commands。
- 新增 runtime-first Mermaid render Effect contract、NodeView host 与可组合 extension assembly。
- 覆盖表格结构编辑、cell 内容编辑、Mermaid 异步渲染、更新、过期结果丢弃、失败诊断与销毁。
- 从包根导出稳定 API，并以仓内真实 Editor consumer probe 验证；跨仓 Workbench alias probe 由 Mission 的后继验证任务承担。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`xnl-document-tiptap-presenter`
- 受影响的代码：`packages/dg-cell-mvi-halfcode-tiptap-vue/`
- 受影响的文档：`docs/halfcode/dsl-bundle/spec/frontend/tiptap-document/`
