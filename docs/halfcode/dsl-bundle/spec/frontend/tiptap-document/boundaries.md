# 当前与未来边界

## 当前已实现并验证

- renderer-neutral RichDocument contract/logic 与 support-owned concrete XNL adapter；
- Domain XNL `<->` RichDocument `<->` Tiptap JSON direct model path；
- paragraph/heading/list/blockquote/link/image/table/code/Mermaid 与
  Component/Capsule embed 的 schema-checked headless projection；
- real ProseMirror transaction 到 revision-free Interaction 的 normalization；
- renderer-neutral canonical semantic contract、八类 edit vocabulary、Domain Command、
  production dialect/translator 与 accepted-baseline candidate materializer；
- support package-root translator binding 与 trusted-host production composition：translator/
  materializer exact once、temporary identity/`copyOrigins` allocator handoff、submission-time
  revision 与 concurrent-change rejection；
- detached create 与 real `EditorState`-bound local draft，以及 selection 静默、IME settle-once、
  proposal-producing undo/redo、matching acknowledge、conflict/replace lifecycle；
- trusted-host exact-once translation、submission-time revision、identity allocation、
  existing authoring session、xnl-core mutation/dry-run 与 revisioned persistence；
- canonical GetPut、accepted PutGet、pre/post-accept failure semantics；
- 官方 Tiptap table extensions/commands/default `TableView`，以及 canonical
  `nodeId/colspan/rowspan` 与 operational `colwidth/align` 的 projection boundary；
- restricted Component/Capsule Vue NodeView mount/update/unmount、registry token cleanup、
  occurrence identity 与 interaction event containment；
- runtime-bound Mermaid NodeView 的 exact outer Effect facet、untrusted result snapshot、
  requestId correlation、clone-first SVG safe sink、stale/destroy/dispose 与 source
  transaction lifecycle；
- package tests/typechecks、ESM/CJS public import、dependency/residue scan、headless 与
  jsdom verification；仓内 package-root consumer 已在同一个真实 `Editor` 验证 official
  table、Mermaid 与 Component/Capsule 共存。

“已验证”覆盖 repository package/headless/jsdom boundary，以及已完成的 package
tests/typecheck、ESM/CJS smoke 与仓内 package-root 单 Editor consumer probe。它不等于
Workbench 产品集成、真实产品浏览器 E2E 或 persistence/save UX 已经完成。

## 当前未完成

- Workbench 产品页面集成与产品浏览器 E2E；
- 跨仓 Workbench package alias、真实产品 renderer binding、路由/主题/销毁链和
  save UX 的端到端验证；
- 面向任意领域 command vocabulary 的 generic arbitrary-domain DSL editor；
- Agent authoring、多人 collaboration、CRDT/OT、实时 cursor、offline merge；
- broad product migration，包括迁移/删除旧 admin HTML-first RichTextEditor；
- 通用 HTML import/export compatibility adapter 与 HTML round-trip 保真承诺；
- 同一 Tiptap editor 内同一 persistent node 的 simultaneous multi-role projection；
- persistence conflict 后的自动 rebase 或产品级 merge UX。

后续简单 RichDocument consumer 可以直接使用 foundation package chain 中预制的 production
canonical translator/materializer；复杂领域可替换或 bind 自己的实现。产品 lifecycle、
Workbench 页面与真实产品浏览器 E2E 仍由 consumer/product active track 拥有，不得把
foundation package 完成误写成 Workbench 产品集成完成。

## 依赖与 Residue

Halfcode Document Presenter 切片是 contract、logic、support、existing Halfcode Vue
renderer 与 Tiptap Vue adapter。在该切片内：

- Tiptap/ProseMirror/NodeView 只属于 `dg-cell-mvi-halfcode-tiptap-vue`；
- Vue 只属于 existing Halfcode Vue renderer 和新 adapter；
- concrete `xnl-core`/`xnl-vfs` 只由 support 持有；
- adapter normal authoring path 不含 HTML、DOM lookup、querySelector 或 writer path；
- EditorState binding input 不含并列 document、Editor、DOM、NodeView、authoring session、
  revision、VFS/VCS、persistence 或 writer authority；
- Mermaid renderer implementation 只在产品 composition root 的代码/runtime binding，
  不进入 XNL DSL、Presentation data 或 config；
- 旧 admin-element-plus editor 在切片外，本 track 不新增其他 Tiptap owner。

这些是持续边界，不只是当前测试结果。新 consumer 若需要 HTML compatibility、
浏览器 DOM 或产品 persistence，必须在自己的 adapter/host 层显式拥有并验证。
