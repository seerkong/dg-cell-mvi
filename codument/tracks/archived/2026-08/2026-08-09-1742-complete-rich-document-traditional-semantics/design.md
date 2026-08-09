# Design：RichDocument 传统语义扩展

## Canonical model

```text
marks
├── underline
├── text-color { color }
└── highlight { color? }

block/inline nodes
├── paragraph { align? }
├── heading { level, align? }
├── task-list [task-item...]
├── task-item { checked } [block...]
├── horizontal-rule
└── hard-break
```

`hard-break` 是 inline node，因此 paragraph/heading 的 inline content 从纯 text run 扩展为
`text | hard-break`。Marks 只附着 text；hard-break 自身不携带 marks。`task-item` 是稳定
persistent node，必须具有 `nodeId` 并参与 insert/delete/move/copy/replacement identity。

## Attribute policy

- `align` 规范值为 `start | center | end | justify`，不持久化 left/right 的书写方向假设。
- `color` 使用规范化 CSS color token。首版只接受受控 hex/rgb(a)/hsl(a)/named token
  的纯字符串，不接受 `url()`、`var()`、分号或任意 style declaration。
- `highlight.color` 可省略，表示产品默认高亮色。
- alignment 省略表示默认 `start`，规范化不主动补写默认值；输入 `left/right` 不做隐式转换。
- mark 按 `bold | italic | strike | underline | code | link | text-color | highlight` 的固定顺序规范化；同 kind 重复或冲突一律拒绝。
- `task-item.checked` 必须是 boolean。
- `horizontal-rule` 与 `hard-break` 不携带产品样式。
- enhanced code block 的 syntax highlight、fold、copy 是可重建 Presenter/local UI；领域事实
  继续只有 `language? + text`。

## Processing boundary

所有 processor 继续使用：

```text
output = fn(runtime, input, config)
```

Neutral logic 必须覆盖：

- model normalization 与 deep immutability；
- lower/parse；
- semantic node/run vocabulary；
- candidate insert/delete/move/text/mark/structure materialization；
- before/after baseline validation；
- identity allocation request/provenance。

`alignment`、`task checked` 使用闭合的 node-attribute semantic edit；`hard-break` 作为 inline atom
通过 inline replacement edit 创建、移动或删除。不得以通用 attrs/style bag 扩展编辑协议。

`hard-break` 的 local identity 分配必须与 accepted document 及同一 command 内其他新增节点
全局避碰。复制包含 hard-break 的 inline/subtree 时，copy provenance 必须逐个覆盖该 atom，
使后续 authority identity allocator 能区分 `new` 与 `copy`；inserted subtree 不得夹带伪造的
stable hard-break identity。

Concrete XNL tag/attribute/child mapping 只由 support 拥有。Contract/logic 不导入 xnl-core；
support 不导入 Tiptap/Vue/DOM。

## Compatibility

这是 additive canonical capability。既有文档保持相同规范化结果；未知 mark/node 继续 fail
closed。不得用 HTML fallback 兼容新增语义。
