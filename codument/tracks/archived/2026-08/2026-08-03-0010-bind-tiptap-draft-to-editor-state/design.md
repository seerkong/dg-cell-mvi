# 设计：EditorState-bound local draft

## 决策

新增最小 adapter processor：

```ts
bindXnlRichDocumentTiptapDraftToEditorState(
  runtime,
  { editorState, acceptedObservation? },
  config,
): XnlRichDocumentTiptapDraftResult
```

选择 binding 而非更高层 browser authoring host。前者只解决 schema/state lineage；后者还会
拥有 Editor、DOM、NodeView host、toolbar 和 controller 生命周期，超出 foundation local-draft
边界。

## Data / Effect / Processor / Actor

- **Data**：`EditorState` 是 adapter-local immutable projection state，不是 Domain truth；
  `acceptedDocument` 直接取 `editorState.doc`。
- **Effect**：仅复用 runtime 的 `emitInteraction`，output 仍是 revision-free intent；binding
  不持有 submit/persistence。
- **Processor**：binding、apply、normalize、reproject 均为 adapter package 的代码函数，遵循
  `output = fn(runtime, input, config)`。
- **Actor**：产品 controller 仍串行接收真实 Editor transaction；foundation draft state 不成为
  第二 writer，accepted owner 仍通过 trusted host/VFS 链反馈。

## Validation

Input 只含 `editorState` 与可选 opaque accepted observation。禁止并列 `document`，避免调用方
声称两个起点。必须验证：

- input exact own data fields；
- value 是真实 `EditorState`；
- state doc/schema 满足 canonical schema/extension contract；
- doc 可通过 canonical parse semantics；
- malformed/accessor/noncanonical state 在调用 Effect 前拒绝。

## Lifecycle

- 初始 bind 保留 EditorState schema、selection 与 plugins/history lineage。
- 每个真实 transaction 继续交给 existing apply/normalizer；不重放、不读取 editor.getJSON/DOM。
- matching accepted reproject 保留当前 EditorState/selection/plugins 并清除 pending。
- replace accepted reproject 复用 bound schema 和原 plugin configuration，创建新 state 并重置旧
  history，避免跨 accepted branch 使用过期 undo entries。
- composition buffer/settle、selection-only silent、undo/redo 复用既有实现。

## Authority

Public API 可出现 adapter-local ProseMirror `EditorState` 类型，但不得暴露 `Editor`、DOM、
NodeView renderer、authoring proposal/session、revision、identity allocator、VFS/VCS、mutation
writer 或 persistence。

