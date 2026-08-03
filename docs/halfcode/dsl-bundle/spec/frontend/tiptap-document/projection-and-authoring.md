# 投影与 Authoring 主链

## 正常模型路径

```text
Domain XNL
  -> support: concrete XnlNode -> neutral Projection data
  -> logic: lower + normalize -> RichDocument
  -> adapter: RichDocument -> schema-checked Tiptap JSON
  -> ProseMirror EditorState / local draft

accepted Domain XNL
  <- authoring session: accept validated proposal
  <- trusted host: allocated RichDocument candidate -> concrete XnlNode
  <- logic: accepted-baseline semantic materializer -> pre-authority candidate
  <- logic/support binding: canonical command <- revision-free Interaction
```

两个方向都直接经过 RichDocument，不把 HTML/DOM 当中间事实。Adapter 的
`projectTiptapDocument` 和 `parseTiptapDocument` 只接收 RichDocument/Tiptap JSON；
unknown extension、unsupported node/mark、额外不可表示字段、schema-invalid 或
lossy 输入都 fail closed。

HTML 只允许存在于显式 compatibility/import-export adapter 的边缘，而且必须声明
来源、损失与 diagnostic。当前 track **没有交付通用 HTML import/export adapter**；
旧 admin HTML-first RichTextEditor 是切片外 legacy baseline。正常 authoring 禁止
HTML round-trip，也没有 HTML fallback。

## 官方 Table Browser Authoring

Table 的 browser behavior 由 `@tiptap/extension-table` 的 `Table`、`TableRow`、
`TableCell`、`TableHeader` 唯一拥有。Adapter 只用 `.extend()` 叠加 canonical
`nodeId`，不并存第二套同名 schema，也不复制 ProseMirror table topology 算法。
因此真实 `Editor` 直接获得官方 `TableView`、table editing plugin 和 command surface：

- insert/delete table，row/column add-delete；
- merge/split cell，header row/column/cell toggle；
- cell selection/navigation、`setCellAttribute` 与 `fixTables`。

RichDocument 的 canonical cell fields 是 `nodeId`、可选正整数 `colspan/rowspan`。
官方 schema 还会为 cell/header 物化 `colspan=1`、`rowspan=1`、`colwidth=null`、
`align=null`。其中 `colwidth/align` 只属于 Tiptap command/NodeView 的 operational
state：parser 只接受当前官方 `null` 默认值，不把它们提升为 RichDocument 字段；
非 `null` 值 fail closed。未显式声明的默认 span 在 parse 时重新省略，显式 span
和稳定 `nodeId` 则保持 canonical round-trip。

官方结构命令创建的新 row/cell/paragraph 在 Interaction 内只取得 adapter-local
`local:n` address。最终 persistent `nodeId` 仍由 trusted authoring host 在 candidate
materialization 时分配；table command、Table NodeView 和 transaction normalizer
都没有 allocator 或 writer authority。

## 从 Transaction 到新事实

```text
1. Tiptap/ProseMirror document-changing transaction
2. normalizeTiptapTransaction -> revision-free kind="interaction"
3. trusted host -> exact-once canonical translator binding -> Domain Command
4. host reads accepted RichDocument baseline -> canonical semantic candidate materializer
5. materializer returns pre-authority candidate + copyOrigins; host classifies identity
6. host-owned allocator replaces temporary ids for new/copy/replacement; move keeps stable ids
7. host re-reads submission-time live revision; changed baseline -> reject without submit
8. stable baseline -> build XnlAuthoringProposal with that submission-time revision
9. existing authoring session -> candidate -> XNL diff/mutation -> dry-run -> validate
10. accept -> advance live revision -> persist -> advance persisted revision/receipt
11. reproject accepted Domain XNL -> RichDocument -> Tiptap
```

Transaction output不含 `baseLiveRevision`、session、submit、translator、allocator、
AST、ValueHost、VFS 或 writer。Selection-only、metadata-only、unchanged transaction
和 intermediate IME transaction 保持静默；selection/history 只能作为真实 edit 的
serializable provenance。

Trusted host 持有 translator binding、candidate materializer、identity allocator 和
proposal port。Foundation package roots 已提供 `xnl.rich-document.edit` 的 production
canonical translator/materializer values；host 对一个 Tiptap Interaction 各调用恰好一次。
Materializer 对 accepted baseline 做完整校验与两阶段 planning/assembly，不按 edit 数组顺序
逐条修改 accepted tree。若 materialization 期间 accepted revision 改变，host fail closed；
否则用提交当刻的 live revision 构造 proposal。Interaction、translator binding 与
materializer surface 都不携带 revision，Adapter/NodeView 也从不读取该 revision。

Candidate 是 pre-authority data，不是 reverse-authored Domain truth。Tiptap JSON 只服务
projection/local editor state；HTML 也不参与本链。只有 allocator handoff、concrete XNL
materialization、authoring validation 与 accept 完成后，结果才成为 accepted Domain XNL。

Table 结构/cell 内容修改和 Mermaid source 编辑都遵守同一条链。Mermaid source
editor 只调用 ProseMirror `setNodeMarkup` 并 dispatch Tiptap transaction；normalizer
只输出 revision-free `kind: "interaction"`，其中 source edit 是
`kind: "mermaid-source"`。Table/Mermaid NodeView 和 render/diagnostic Effect 都不修改
RichDocument 或 Domain XNL。Domain XNL 的单一 writer 始终是 trusted authoring
session；diagnostic 只报告观察事实，不推进 revision、accept 或 persistence。

## 成功与失败

| 时点 | 结果 |
|---|---|
| unsupported/command/stale/lossy/rejected，发生在 accept 前 | live 与 persisted facts 都不推进 |
| no-op diff | 返回 unchanged，不分配新 live revision |
| accept + persist success | live 与 persisted facts 分别推进，随后重投影 |
| accept 后 persistence failure | live fact 保持已推进并可重投影；persisted fact 不变；session 进入 `dirty-failed` |
| `dirty-failed` 后继续 edit | fail closed，直到 `retryPersistence` 或 explicit reload |
| persistence conflict | 保留 accepted live divergence，等待 explicit reload 或产品层 rebase |

因此“保存失败”不等于“编辑未接受”。UI 必须分别呈现 live acceptance 与 durability，
不能用一个布尔 `saved` 覆盖两种 authority。
