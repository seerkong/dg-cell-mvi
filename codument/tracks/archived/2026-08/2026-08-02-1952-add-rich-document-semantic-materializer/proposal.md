# 变更：新增 RichDocument 语义候选物化器

## 背景和动机 (Context And Why)

Tiptap adapter 已能把真实 ProseMirror transaction 归一化为 revision-free 的
`xnl.rich-document.edit` Interaction，trusted authoring host 也已具备 exact-once
translation、accepted snapshot 读取、submission-time live revision、identity allocation
与 authoring submission 组合。但是 foundation 目前只公开
`XnlRichDocumentCandidateMaterializer` 契约，没有公开实现；现有 PutGet 与
bidirectional-law 测试通过 test-local translator/materializer 闭环。

这使首个跨仓产品 consumer 无法在不复制基础语义的前提下应用 normalizer 发出的
`insert`、`delete`、`move`、`text`、`mark`、`table`、`code` 和
`mermaid-source`。Workbench T2.2 已因此停止实现，避免用 Tiptap JSON、HTML 或产品私有
`edits -> RichDocument` applier 绕过 foundation owner。

本 track 在 foundation owner 中补齐 renderer-neutral canonical semantic command、
translator/dialect（当前没有 public RichDocument 实现时一并提供）和 package-root
runtime-first candidate materializer，使任何 consumer 都能复用同一条
Interaction -> canonical command -> RichDocument candidate -> identity allocation ->
trusted submission 链。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 在 contract/logic/support 的既有分层中定义并公开 renderer-neutral canonical
  RichDocument semantic edit/command/result 契约。
- 提供 public canonical translator/dialect，避免每个 consumer 重写
  `xnl.rich-document.edit` 的校验与 Domain Command 构造。
- 提供 support package-root runtime-first materializer，把 accepted
  `XnlRichDocument` 与 canonical translated command 原子应用为
  `XnlRichDocumentCandidateMaterializationResult`。
- 完整覆盖 normalizer 发出的 insert/delete/move/text/mark/table/code/
  mermaid-source，并对混合结构编辑、同节点 text+mark、表格整树替换和错误前置条件
  fail closed。
- 保留 stable `#id` 的结构 identity：move 保留、replacement 为 delete-and-add、
  new/copy 使用临时 candidate identity，并通过 `copyOrigins` 交给既有 host-owned
  identity allocator 分配 fresh persistent identity。
- 与现有 trusted authoring host 集成验证 exact-once translation、submission-time
  revision、concurrent-change 拒绝、accepted-first PutGet 与 authority containment。
- 从 package root 暴露类型和值，并同步 Tiptap Document public API/boundaries 文档。

**非目标:**

- 不在本 track 实现 Workbench 页面、产品 toolbar、产品 lifecycle 或浏览器 E2E。
- 不新增 writer、VFS/VCS、session、persistence、submit 或 revision authority。
- 不让 contract/logic/support 依赖 Tiptap、ProseMirror、Vue、DOM、HTML 或 Tiptap JSON。
- 不把 Tiptap JSON/HTML/DOM/local draft 提升为 Domain authority，也不新增 HTML
  round-trip 或 generic arbitrary-domain editor。
- 不替换既有 xnl-core mutation/dry-run、authoring session、identity classifier 或
  identity allocator。
- 不实现 collaboration、CRDT/OT、自动 rebase 或产品 merge UX。

## 变更内容（What Changes）

- 在 `dg-cell-mvi-halfcode-contract` 固定 canonical semantic node/edit/payload/command、
  materialization result 与 processor contracts；Tiptap adapter public types 只做该契约
  的兼容别名或窄化。
- 在 `dg-cell-mvi-halfcode-logic` 提供 RichDocument canonical translator/dialect 与纯
  semantic materialization core；使用 accepted-baseline 两阶段校验和 identity-keyed
  assembly，避免依赖 mutation 顺序或数组 index 漂移。
- 在 `dg-cell-mvi-halfcode-support` 从 package root 提供 trusted-host 可直接注入的
  runtime-first translator/materializer values，并让现有 bridge 复用 contract-owned
  `XnlRichDocumentCandidateMaterializationResult`。
- 调整 Tiptap normalizer 的 canonical payload，使 text/mark 组合具有无损 inline-run
  快照，copy subtree 具有仅来自 accepted stable identity 的 source provenance；不信任
  任意插入节点自带的 `nodeId`。
- 增加 contract/typecheck、logic unit/property、support trusted-host integration、
  adapter normalizer/package-boundary、public import smoke 与 PutGet 回归。
- 更新 Tiptap Document public API、projection/authoring、identity 与 current/future
  boundary 文档，移除“每个 consumer 自行实现 translator/materializer”的过时说明。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`xnl-document-tiptap-presenter`
- 受影响的代码：
  - `packages/dg-cell-mvi-halfcode-contract/src/xnl-rich-document/`
  - `packages/dg-cell-mvi-halfcode-logic/src/xnl-rich-document/`
  - `packages/dg-cell-mvi-halfcode-logic/src/xnl-projection/`
  - `packages/dg-cell-mvi-halfcode-support/src/xnl-rich-document/`
  - `packages/dg-cell-mvi-halfcode-tiptap-vue/src/types.ts`
  - `packages/dg-cell-mvi-halfcode-tiptap-vue/src/transactionNormalizer.ts`
  - 上述 packages 的 public roots、tests、typecheck 与 import-smoke fixtures
  - `docs/halfcode/dsl-bundle/spec/frontend/tiptap-document/`
- Modeling：`codument/config/modeling.xml` 显式 `enabled="false"`，不生成 modeling delta；
  仍运行 modeling validate 记录配置态。

