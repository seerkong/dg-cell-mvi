# 传统文档语义

本页定义可被不同 renderer 重建的传统在线文档能力。它们属于 renderer-neutral
`RichDocument`，最终由 Domain XNL authoring owner 接受；Tiptap extension、toolbar、
selection 和浮层不是领域事实。

## Canonical vocabulary

| 类别 | canonical 语义 |
|---|---|
| marks | `bold`、`italic`、`strike`、`underline`、`code`、`link`、`text-color`、`highlight` |
| text blocks | `paragraph { align? }`、`heading { level, align? }` |
| lists | `bullet-list/list-item`、`ordered-list/list-item`、`task-list/task-item { checked }` |
| inline | `text`、带 persistent `nodeId` 的 `hard-break` |
| separators | `horizontal-rule` |
| code | `code-block { language?, text }` |

`align` 只接受 `start | center | end | justify`。省略表示默认 `start`，normalizer
不会主动补写默认值，也不把物理方向 `left/right` 静默转换为逻辑方向。

文本颜色与高亮颜色接受 canonical hex、范围合法的 rgb(a)/hsl(a) 或标准 named color。
`url()`、`var()`、style declaration、未知 named color 和越界通道值 fail closed。
`highlight.color` 可省略，表示由 Presenter 选择默认高亮色；该默认颜色不回写领域模型。

Marks 规范顺序为：

```text
bold -> italic -> strike -> underline -> code -> link -> text-color -> highlight
```

同 kind 重复 mark 被视为冲突，不选择其中一个。`hard-break` 是独立 inline atom，不能携带
marks，也不能降级成 `"\n"` 或空 paragraph。`task-list` 只能包含 `task-item`；
`task-item` 的 `checked` 必须是 boolean，内容仍是普通 block children。

## Semantic edits

原有 `text`、`mark` edit 继续服务纯文本 inline container。含 hard break 的段落使用
`inline` edit，以一个 before/after snapshot 原子描述 text 与 hard-break 的顺序、增删和
marks。Paragraph/heading alignment 与 task checked 使用闭合的 `node-attributes` edit：

```ts
type NodeAttributes =
  | { kind: 'paragraph' | 'heading'; align?: 'start' | 'center' | 'end' | 'justify' }
  | { kind: 'task-item'; checked: boolean };
```

这不是通用 attrs/style bag。Materializer 对同一 accepted baseline 校验整个 command；
任一 before snapshot、identity、颜色、结构或字段非法时，整批 edit 拒绝，不部分修改
accepted document。

## Enhanced code boundary

Enhanced code block 的 durable data 始终只有 `language? + text`。以下能力由 Presenter
或 Editor local state 拥有，可重建且不得进入 RichDocument/Domain XNL：

- syntax highlighting 与主题；
- fold/collapse 状态；
- copy button 与复制反馈；
- line number、soft wrap、viewport、selection；
- filename、高亮行和其他产品装饰。

如果 concrete XNL 或 semantic edit 为 code block 携带上述额外字段，公共边界返回结构化
diagnostic，不静默丢弃。

Canonical Vue Presenter 已实现 language label、line numbers、fold/expand、copy feedback、
theme 与 token decorations。Clipboard/highlighter 通过 runtime Effect 注入；Presenter 不从
HTML/DOM 反向生成 RichDocument。未知 language 或非法 token 只生成 deterministic
diagnostic，不回写 `language/text`。
