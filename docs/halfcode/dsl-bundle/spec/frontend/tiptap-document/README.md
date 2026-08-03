# Tiptap Document Presenter

> 目录职责 · holds: Domain XNL 经 RichDocument 直接投影到 Tiptap、受限 Halfcode NodeView 与 trusted authoring host 的当前实现规范 · excludes: Workbench 产品集成、通用领域 DSL 编辑器、Agent 协作与 HTML-first 编辑器迁移 · tier: stable · ⬆from: `add-tiptap-halfcode-document-presenter` Track 的源码、测试与验证报告 · ⬇to: Workbench/Agent consumer 与后续产品浏览器 E2E

本目录记录 Halfcode Document 的 Tiptap Presenter adapter。它是一个代码侧
adapter capsule，不是新的 XNL DSL，也不改变事实源：**Domain XNL 始终是领域
权威；RichDocument 是中立、可归一化、可重建的投影模型；Tiptap JSON、
ProseMirror `EditorState`、selection、history 与 local draft 都是派生状态。**

```text
Domain XNL authority
  <-> support-owned concrete XNL adapter
  <-> renderer-neutral RichDocument
  <-> Tiptap JSON
  -> ProseMirror EditorState / local draft
```

正常 authoring 不经过 HTML。编辑器只发布 revision-free Interaction；foundation 提供
canonical semantic contract、dialect、translator、accepted-baseline candidate materializer
与 translator binding，trusted host 再完成 identity allocation，并仅在提交时读取 live
revision，随后调用既有 authoring session 完成 XNL mutation/dry-run/validate、accept、
persist 与 reproject。

## 阅读顺序

1. [事实与模型](authority-and-model.md)：权威事实、accepted live 与 persisted
   facts、RichDocument 和 local draft 的等级。
2. [三档用法](usage-tiers.md)：预建直用、配置组合、自定义代码 adapter/capability。
3. [投影与 authoring 主链](projection-and-authoring.md)：无 HTML 的双向路径、
   transaction 到 persist/reproject 的完整顺序和失败状态。
4. [身份](identity.md)：`#id`、adapter-local address、`x-id`、move/copy/replacement
   和当前 multi-role 边界。
5. [受限 NodeView](restricted-nodeview.md)：Component/Capsule capability，以及
   runtime-bound Mermaid Effect、safe sink 与 lifecycle ownership。
6. [公共 API](public-api.md)：workspace package entrypoints 与最小 TypeScript 示例。
7. [当前与未来](boundaries.md)：已经验证的 headless/jsdom/package 能力和明确非目标。

## 当前结论

- supported blocks/marks、table、code、Mermaid 与 Component/Capsule embed 已有
  renderer-neutral model 和 Tiptap schema/JSON direct adapter；table 由官方 Tiptap
  extensions/commands/`TableView` 唯一拥有 browser behavior。
- canonical GetPut 与 accepted PutGet 已通过真实 ProseMirror transaction、既有
  authoring session、xnl-core mutation 和 revisioned persistence 集成验证。
- contract/logic/support package roots 已提供 canonical semantic contract、dialect、
  translator、candidate materializer、translator binding 与 trusted host；生产链覆盖
  normalizer 的 insert/delete/move/text/mark/table/code/mermaid-source 八类 edit。
- Component/Capsule NodeView 已在 jsdom 覆盖 mount/update/unmount、owner-token
  cleanup、selection/deletion 和交互事件隔离。
- Mermaid NodeView 已在 jsdom 覆盖 runtime-first render/diagnostic Effect、exact untrusted
  result、request correlation、clone-first safe sink、stale/destroy/dispose 与 source
  transaction。
- package tests/typecheck、ESM/CJS public import 与仓内 package-root consumer probe 已完成；
  consumer 已在同一个真实 `Editor` 验证 official table、Mermaid 与 Component/Capsule
  共存；local draft 同时提供 detached create 与真实 package-root `EditorState` binding，
  后者保留 schema/plugin lineage 并继续只发布 revision-free Interaction。
  **Workbench 产品集成、真实产品浏览器 E2E 与 persistence/save UX 尚未完成**。

本文档不把旧 `dg-cell-mvi-admin-element-plus` HTML-first editor 视为本链路的一部分；
它是切片外 legacy baseline，本 track 没有迁移或扩展它。
