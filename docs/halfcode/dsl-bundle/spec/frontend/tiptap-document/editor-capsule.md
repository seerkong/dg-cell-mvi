# 可复用编辑器 Capsule

`XnlDocumentEditor` 是 `dg-cell-mvi-halfcode-tiptap-vue` 提供的 Vue surface。它把
canonical RichDocument、Presentation compiler、Tiptap Editor 与 trusted authoring port
组合为一个可复用编辑器，但不取得 Domain XNL、revision 或 persistence authority。

## Processor boundary

```text
session = createXnlDocumentEditor(
  runtime,
  { document, acceptedObservation?, presentation, capabilities },
  { planNodeId, staleDraftPolicy, unknownToolPolicy, codeTheme? }
)
```

- `runtime.authoring`：发布 revision-free Interaction 的长期 Effect binding；
- `runtime.presentation`：tool/presenter/condition registries；
- `runtime.commands`：可选 host command bindings，仍使用 `output = fn(runtime,input,config)`；
- `runtime.clipboard/highlighter`：增强代码 Presenter 的 Effect bindings；
- `input.document`：当前 accepted RichDocument observation，不携 live revision；
- `input.presentation/capabilities`：本次工具投影数据；
- `config`：静态 policy 与 schema-adjacent 选项。

一个 session 只暴露 restricted command facade、只读 snapshot、accepted reproject、
subscribe 与 destroy。它不暴露 raw `Editor`、DOM、writer、VFS/VCS 或 persistence session。
Facade 只执行当前 compiled `ToolbarPlan` 中 enabled 的 command id。Host command 不能复用
`rich-text.command.*` canonical namespace，也不能用 Presenter override 替换 canonical command。

## State lineage

```text
Tiptap computes next EditorState
  -> adapter adopts that exact state object
  -> normalizes transaction
  -> runtime.authoring publishes Interaction
  -> host accepts Domain XNL
  -> session.update/reproject installs accepted EditorState
```

因此 Tiptap view 与 draft lifecycle 不各存一份文档。Selection transaction 静默；IME
intermediate transaction 缓冲；settle 最多发布一次。Undo/redo 使用同一 ProseMirror history
lineage，并把结果作为新 Interaction 提案，而不是回滚 accepted Domain XNL。

## Toolbar projection

`DocumentEditorPresentation` 只引用 stable tool/presenter/condition id 和 serializable options。
Compiler 输出 deep-frozen `ToolbarPlan`。Vue surface 按 group/priority 渲染；容器宽度不足时，
完整的低优先级 group 进入 keyboard-accessible overflow，不通过水平滚动藏掉工具。

默认 Presenter 提供 button、select 与 color control。`title`/`aria-label`、native focus、
pressed/disabled state 和 overflow menu 保证工具可发现、可键盘访问。产品可以更换
Presentation 或绑定新的 host tool，但实现仍留在代码 registry。

## Enhanced code

增强代码 NodeView 从 ProseMirror node 读取 `language/text`，本地维护 line numbers、fold、
copy feedback、theme 与 syntax decorations。高亮 token 与 clipboard write 只能由 runtime
Effect 产生；未知 language、非法 token 或 Effect 异常生成 deterministic diagnostic，
不得修改 durable code data。
