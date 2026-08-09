# 事实与模型

## 事实等级

| 层 | 地位 | 可否直接成为领域事实 |
|---|---|---|
| Domain XNL | 领域结构与内容的权威表示 | 是，由 authoring owner 接受 |
| accepted live XNL snapshot + live revision | 当前 session 已接受的实时事实 | 是，属于 owner-local live authority |
| persisted XNL snapshot + persisted revision/receipt | persistence authority 已保存的事实与证据 | 是，但与 live authority 分离 |
| RichDocument | renderer-neutral、serializable、normalized projection model | 否，可从 Domain XNL 重建 |
| Tiptap JSON | RichDocument 的 schema-checked adapter projection | 否 |
| ProseMirror `EditorState`、selection、composition、history、local draft | Presenter local state | 否 |
| revision-free Interaction、canonical Domain Command | 提案的标准语义描述 | 否，只描述请求与目标 |
| semantic candidate（含 temporary ids、`copyOrigins`） | accepted baseline 上的 pre-authority data | 否，allocator 与 accept 前都不是事实 |
| final candidate、mutation batch | trusted host/authoring session 的评估中间态 | 否，accept 前都不是事实 |

“Domain XNL 是权威”不等于“live 与 persisted revision 是同一个事实”。当前
authoring session 采用 accepted-first 语义：candidate 通过后，accepted live XNL
可以先推进；persist 成功后 persisted XNL 才推进。两个 revision 由不同 authority
分配，不能相互代替或直接比较。

Canonical materializer 只读取 accepted `XnlRichDocument` 与 translated command，按同一
accepted baseline 原子地产生 candidate。它不读取 revision，也不拥有 allocator、writer、
VFS/VCS、session、submit 或 persistence。Candidate 中的 `xnl-temporary:*` identity 只是
分配前地址；`copyOrigins` 只是逐节点来源证明。两者都由 trusted host 交给 allocator 后
才能换成 fresh persistent `#id`，再作为 proposal 进入 authoring acceptance。

## RichDocument 的职责

RichDocument 只承担 renderer-neutral projection contract：

- 保存可序列化的 document/block/inline/mark/embed 语义；
- 保留来自 Domain `#id` 的 persistent `nodeId`；
- 为纯 lower、parse、canonical normalization 和 identity classification 提供共同模型；
- 隔离 Tiptap、ProseMirror、Vue、DOM 与 concrete `xnl-core` 类型。

它不是平行 AST、parser 或 mutation engine。Contract 与 logic 只处理 neutral
Projection/Authoring data；只有 support package 适配 concrete `XnlNode`，并复用
既有 XNL parser、formatter、diff、dry-run 与 mutation 能力。

当前支持的模型族包括 paragraph、heading、blockquote、bullet/ordered/task list、
horizontal rule、hard break、image、table、code block、Mermaid、Component/Capsule embed，
以及 bold、italic、strike、underline、code、link、text-color、highlight marks。输入若包含
未知 node/mark、不可表达字段、非法 schema shape、
duplicate/missing required identity 或不可序列化/authority-bearing 值，处理器返回
结构化 diagnostic，不静默降级为 HTML、raw JSON 或 plain text。

## Local Draft 不升级为事实

Tiptap/ProseMirror 可以维护 selection、IME composition、undo/redo 和 pending draft，
但只能把真实 document change 归一化为 Interaction。它不能：

- 写 Domain XNL 或 persistence；
- 自己推进 accepted revision；
- 把 undo/redo 解释为回滚 accepted XNL；
- 用 editor attrs 分配最终 persistent `#id`。

matching accepted projection 是 acknowledge：可保留现有 `EditorState`、selection
和 history。外部不同 accepted projection 必须按 `conflict | replace` 明确处理；
`replace` 重建 state 并清空旧 history，避免旧 transaction 重放到新事实。

Detached draft 自建 canonical schema/state，只能消费同一份 detached state lineage 产生的
transaction。真实 Tiptap Editor 必须通过 dedicated adapter 的 package-root binding 直接交出
当前 `EditorState`；binding 保留 state/doc/schema/plugins，但不会取得 Editor、DOM、NodeView、
session、revision、VFS 或 writer。Selection 保持 local 且静默；composition intermediate
只缓冲，settle 至多发布一次；undo/redo 只产生新的 Interaction proposal。以上 state 都不因
绑定真实 Editor 而升级为 accepted 或 persisted fact。

可复用 `XnlDocumentEditor` 进一步使用 `adoptXnlRichDocumentTiptapEditorState` 接纳 Tiptap
为一次 transaction 已计算出的**同一个** next `EditorState`。Adapter wrapper 只保留 accepted/
pending/composition metadata，不复制 document store，也不 replay transaction 生成第二条 state
lineage。Accepted reproject 后，Tiptap view 直接安装 lifecycle 返回的 state。
