# Design：可复用 Halfcode 文档编辑器

## 1. 分层与 authority

```text
accepted RichDocument XNL (host authority)
  -> canonical Tiptap projection
  -> one Editor / EditorState lineage
  -> transaction normalizer
  -> revision-free interaction
  -> runtime.hostAuthoring effect
  -> host candidate / validate / accept / persist / reproject
```

Editor、toolbar、NodeView 和 tool implementation 都不是 writer。host authoring port、
tool/presenter registries、clipboard/highlighter effects 是长生命周期能力，必须放在
`runtime`；`input` 只放 accepted observation 与 Presentation，`config` 只放 schema id、
stale draft policy 等静态开关。host 在处理 interaction 时自行读取 live revision。

## 2. Canonical Tiptap adapter

只扩展现有 `internalTiptapExtensionRegistry.ts`、`projection.ts` 和
`transactionNormalizer.ts`：

- paragraph/heading `textAlign` 精确映射 `start|center|end|justify`，不存在时保持 absent；
- underline、text-color、highlight 映射 marks，颜色继续由 canonical logic 唯一校验；
- taskList/taskItem 是独立节点族，不能伪装为 bullet list metadata；
- horizontalRule 是 persistent block，hardBreak 是带 nodeId 的 inline atom；
- code durable data 仍只有 language/text。

GetPut/PutGet、paste、IME、undo/redo、copy/move、invalid value、identity collision 均须覆盖。

## 3. Presentation compiler

```text
ToolbarPlan = compileDocumentEditorPresentation(
  runtime,
  { presentation, capabilities, editorContext },
  { unknownToolPolicy: "diagnostic" }
)
```

`DocumentEditorPresentation`、`ToolbarPlan` 和 diagnostics 必须 recursively serializable、
deep frozen、无 accessor。Presentation 的 `visibleWhen` 仅引用 stable predicate id 和
serializable options，不能嵌 closure。Compiler 拒绝重复 group/tool id、unknown tool、
unknown presenter、unsafe record。Plan 不能包含 Vue component、Tiptap command、Editor、
DOM 或 effect。

Canonical tool semantics 由不可覆盖的 command registry 拥有。Scope 可以用相同
presenter id 替换呈现，但不能替换 command；host extension tool 必须使用独立 id 和
capability grant。Presenter 只得到受限 editor-command facade。

## 4. Editor capsule

```text
result = createXnlDocumentEditor(
  runtime,
  { acceptedObservation, presentation },
  { schemaId, staleDraftPolicy }
)
```

一个实例只创建一条 Tiptap state lineage，并复用现有 create/bind/apply/settle/
undo/redo/reproject lifecycle。matching acceptance 保留历史；replacement 清理 stale
history；conflict 保留本地 draft。`XnlDocumentEditor` Vue surface 只渲染 plan、editor
和 diagnostics，不创建 parallel model。

## 5. Toolbar 与 enhanced code

- 按 group/order 输出工具；container 宽度不足时低优先级组进入可键盘操作的 overflow。
- 所有隐藏工具可达，contextual tool 仅在匹配 editor context 时出现；不以横向滚动隐藏。
- 图标/tooltip/active/disabled 状态来自 plan + code presenter registry。
- code language 变更走普通 Tiptap transaction；syntax highlight、fold、copy feedback、
  line numbers、theme 只属于本地 Presenter state。
- clipboard/highlighter 只能经 runtime 注入 effect；未知 language 给确定性 diagnostic，
  不改 durable data。

## 6. 公共边界

只从 package root 导出 contract、compiler、registry factory、restricted facade、editor
factory 与 Vue surface。raw extension/NodeView implementation 保留 internal。Workbench
代码和产品按钮不得进入本 track。

## 7. 验证

- contract/logic/tiptap-vue package tests 与 typecheck；public-root ESM/CJS smoke；
- Tiptap schema/projection/normalizer/lifecycle property and negative tests；
- jsdom mount/update/unmount、composition、undo/redo、focus/keyboard；
- real browser 宽/窄 container：group ordering、overflow reachability、contextual visibility、
  tooltip、无横向滚动隐藏；
- phase-after GapLoop 与 track-after coding AttractorCheck。

