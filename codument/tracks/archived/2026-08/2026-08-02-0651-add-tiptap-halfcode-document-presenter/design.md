# Tiptap Halfcode Document Presenter Design

## 1. 所有权与依赖

```text
Domain XNL (authority)
  -> support-owned xnl-core adapter
  -> renderer-neutral Projection/Authoring data
  -> RichDocument contract/model
  -> pure lower/parse logic
  -> dg-cell-mvi-halfcode-tiptap-vue adapter
  -> ProseMirror/Tiptap local projection
```

依赖保持：

```text
halfcode-contract <- halfcode-logic <- halfcode-support <- halfcode-tiptap-vue
                                      halfcode-support <- halfcode-vue <- halfcode-tiptap-vue
```

箭头从 consumer 指向 dependency：`halfcode-tiptap-vue` 同时依赖 `halfcode-vue` 和 `halfcode-support`，`halfcode-vue` 依赖 `halfcode-support`；既有 renderer 不得反向依赖新 adapter。

`dg-cell-mvi-halfcode-tiptap-vue` 是 Tiptap adapter capsule 的唯一公开入口。在 Halfcode Document Presenter 依赖切片（`halfcode-contract/logic/support/halfcode-vue/halfcode-tiptap-vue`）内，Tiptap、ProseMirror 和 NodeView 依赖只存在新 adapter；Vue 依赖可存在既有 `dg-cell-mvi-halfcode-vue` 和新 adapter。contract、logic、support 保持无 Vue/Tiptap/ProseMirror/DOM 依赖，所有 renderer 类型都不反向进入这些 neutral packages。

`dg-cell-mvi-admin-element-plus` 现有 HTML-first `RichTextEditor` 已经使用 Tiptap，是本 track 的 legacy input baseline，不属于上述 Halfcode Document Presenter 切片，本 track 不迁移、删除或扩展它，也不在其他 package 新增 Tiptap 依赖。

## 2. RichDocument 模型

RichDocument 是可序列化、UI-free 的中间模型，不是第二事实源。块节点保留稳定 `nodeId`（来自 Domain `#id`）和语义 kind；inline text/mark 不要求逐字符 id。首版节点族：document、paragraph、heading、blockquote、bullet/ordered list、list item、image、table/row/cell/header、code block、Mermaid、Component/Capsule embed。marks 支持 bold、italic、strike、code、link。

转换公式：

```text
neutral = adaptXnlNodeToProjectionData(runtime, domainXnlInput, supportConfig)
rich = lowerRichDocument(runtime, neutral, dialectConfig)
tiptap = projectTiptapDocument(runtime, rich, adapterConfig)
proposal = normalizeTiptapTransaction(runtimeFacet, transactionInput, config)
```

HTML 仅是显式 import/export compatibility adapter，不进入 normal edit path。

## 3. 双向边界

`parseTiptapDocument` 只把受支持的 Tiptap JSON 转成 RichDocument candidate；它不接受 HTML 或 DOM。只有真实改变 document 的 transaction 才使用 affected stable block ids 和 steps 生成不含 revision 的 serializable `XnlProjectionInteraction`，selection/history metadata 此时仅可作为 serializable provenance 附带。Selection-only、metadata-only 和 intermediate composition transaction 不发布 edit intent，也不调用 trusted bridge。

revision 属于 authoring authority，不属于 editor intent。可信宿主调用 `translateXnlProjectionInteraction`，然后以 authoring session 当前的 `baseLiveRevision` 和翻译后的 Domain Command 构造 `XnlAuthoringProposal`。NodeView 和 adapter 既不持有 current revision，也不获得或调用 authoring `submit`。

```text
Tiptap transaction
  -> XnlProjectionPresenterEditIntent { kind: "interaction" } (revision-free)
  -> trusted host translateXnlProjectionInteraction
  -> host reads submission-time live revision
  -> host creates XnlAuthoringProposal(submission-time baseLiveRevision, command, source)
  -> authoring session candidate/dry-run/validate/accept
  -> accepted XNL + persisted revision
  -> fresh projection
```

`XnlProjectionPresenterEditIntent` 的公共 contract 可以继续包含 `kind: "command"` 以支持其他已受信 Domain Command producer，但 Tiptap transaction normalizer 的输出类型和 runtime validation 必须收窄为 `kind: "interaction"`。任何从 Tiptap transaction 直接产生 command 的路径都 fail closed。

## 4. 身份

- `#id`: persistent Domain identity；用于 diff 对齐与 move detection，不是普通字段更新。
- `x-id`: Document occurrence 内 projection instance address；单 role 可默认 `x-id=#id`，多 role 必须命名空间化。
- `data-x-id`: DOM 调试/事件回溯投影，不拥有 identity。
- 新建与复制/粘贴不相信 Tiptap 本地 attrs 里的候选 id；一个 host/authoring-owned `XnlRichDocumentIdentityAllocator` effect 在构造 candidate 时为新领域节点分配 fresh `#id`。
- move 保留原 `#id`；copy/paste 为复制出的每个持久节点分配 fresh `#id`；identity replacement 只表达为 delete+add。
- `x-id` 只能在 persistent `#id` 已建立后根据 Document occurrence role 派生；多 role 对同一 `#id` 产生不同 namespaced occurrence address。
- duplicate/missing persistent identity、allocator collision 与 unsupported identity replacement fail closed。

## 5. NodeView capability

NodeView host assembly 内部持有 `XnlProjectionPresenterRuntimeFacet<TView>` 与 `DocumentInstanceRegistry` 的 owner token。它从 facet 取出 exact code-owned readonly view，只向 embedded Presenter 提供：

- `XnlProjectionPresenterRuntimeFacet<TView>` 所证明的 exact readonly facade view；
- readonly serializable occurrence snapshot；
- `DocumentInstanceRef` data；
- 只接受 `XnlProjectionPresenterEditIntent` 的 `emitEditIntent` function grant。

registry `register/unregister`、owner token 和 cleanup authority 始终留在 host adapter 内部，embedded code 不可见。Embedded Presenter 也不接收 raw Scope runtime、Domain AST、ValueHost、VFS/VCS、translator、authoring session 或 mutation writer。Component/Capsule 的具体 Vue 实现由 existing Halfcode renderer/registry 解析，NodeView adapter 只负责 occurrence mount、update、selection boundary 与 tokenized cleanup。

NodeView target descriptor 额外携带 code-owned `presenterIdentity`。它不是第二套 component registry，而是要求 canonical renderer 在 host-input 投影路径上必须恰好到达该 identity，并且必须由 existing `CanonicalComponentRegistry` 解析为代码组件。缺 registry、resolve 未命中、raw custom-element 结果、空 Capsule、错误 sibling 或 identity 不匹配都显式失败；通用 Halfcode renderer 在没有 strict host identity 时仍保留既有原生 tag 与动态组件行为。

Capsule 本身只承载子域边界，不接收四项 embedded input 作为 DOM props。严格路径把 input 递归传到第一个非空内容域的第一个根；多层 Capsule 保持这一规则，其他 sibling 只获得自身 DSL props。NodeView wrapper 自身仍交给 ProseMirror 做 NodeSelection 与删除/拖拽，wrapper 内部 Vue 控件的鼠标和键盘事件由 embedded Presenter 消费，避免污染编辑器 selection/key handling。

T3.2 不建立任何同地址 mount handoff。每个 NodeView 只注册自己的 registry owner token，并只用该 token 清理自己；两个活跃节点即使携带相同 `nodeId`，只要竞争同一 occurrence address，第二次注册就 fail closed。跨 kind 原子 replacement 与 canonical x-id 派生仍属于 T3.3，不得通过放宽 duplicate 规则提前实现。

T3.1 将 capability projection 固定为 runtime-first 的 headless protocol：

```text
capability = createEmbeddedPresenterCapability(
  hostRuntimeWithFacetAndEditPort,
  { phase: mount | update, instanceRef, snapshot },
  {},
)

editResult = capability.embeddedInput.emitEditIntent(
  capability.embeddedInput.view,
  { intent: XnlProjectionPresenterEditIntent },
  {},
)
```

`embeddedInput` 精确只有 `view / snapshot / instanceRef / emitEditIntent` 四项。`view` 是 support-owned `XnlProjectionPresenterRuntimeFacet<TView>` 证明的 exact readonly facade；`snapshot` 与 `instanceRef` 都在边界上复制并冻结。Host runtime 可以是 class、inheritance 或 mixin 组成的复杂对象，但 facet/edit port 只能通过 descriptor-only 的 application capability resolver 取得：合法 application prototype 可见，Object/native/platform prototype、accessor、revoked/cyclic/over-depth chain 均 fail closed。该 resolver 不执行 getter 或 constructor，并由 support 与 adapter 共享，避免两套原型 authority 规则漂移。

`mount | update` 只表示 headless input projection 的生命周期时点；Vue mount、NodeView update/unmount、registry owner token 与 cleanup 仍分别属于 T3.2/T3.3。T3.1 不创建 registry lease，也不把 unmount capability 交给 embedded code。

## 6. Package DAG 与 support bridge

Track 不只通过文字声明依赖方向，而以显式任务 DAG 实施：

```text
contract -> logic -> support bridge/host assembly -> tiptap-vue adapter -> NodeView -> laws
```

support bridge 复用既有 Projection compiler、Presenter facet、Document occurrence registry 和 authoring proposal port；它是 concrete `xnl-core XnlNode <-> renderer-neutral data` 和 final candidate materialization 的唯一 adapter owner，复用现有 parser/mutation engine，不建立平行 AST、parser 或 mutation engine。contract/logic 不引入 `xnl-core`/`xnl-vfs`，也不引入 Tiptap/Vue/DOM。adapter 依赖 support 公开组装面，不反向泄漏 renderer 类型。

`XnlRichDocumentIdentityAllocator` 的 contract 定义 request/result/collision diagnostic，logic 定义 new/copy/move/replacement 分类和 `#id -> namespaced x-id` 纯派生规则，support runtime 持有 allocator effect 并在 `materializeCandidate` 链路中调用。adapter 只发布 identity-neutral semantic intent，不依赖 allocator closure，也不确定最终 persistent `#id`。

## 7. Local draft 与历史

ProseMirror state、selection、composition state 和 undo/redo history 都是 Presenter local projection。IME/composition 期间可聚合 transaction；intermediate composition transaction 保持静默，composition end 且 document 真实变更后才产生一个语义 proposal。Undo/redo 只在改变 document 时产生新 proposal，不直接回滚 accepted XNL。外部 accepted revision 更新时，adapter 用 stable block identity 重投影并明确处理 stale local draft/conflict。

当外部 accepted projection 与当前 pending draft 在同一 schema 下完全一致时，该更新是 acknowledge，而不是 replace：adapter 保留现有 `EditorState`、selection 与 ProseMirror history，仅更新 accepted projection 基线、opaque observation 和 pending 状态。因此确认后的 undo/redo 仍会从本地 history 产生新的 revision-free Interaction。外部不同文档按显式 `conflict | replace` policy 处理；`replace` 重建 `EditorState` 并清空旧 history，避免把旧 projection 的 transaction 重放到新事实上。

Authoring 沿用已有 accepted-first 语义：stale/rejected/lossy 等 acceptance 之前失败不推进 live/persisted revision；accept 后 persistence 失败时，accepted live revision 已推进并可重投影，persisted revision 不变，session 进入 `dirty-failed`，后续 edit 在 retry 或 explicit reload 前 fail closed。

## 8. 验证层级

- pure contract/logic tests：neutral plan/candidate lower/parse、canonical normalization、unsupported diagnostics，无 `xnl-core`/`xnl-vfs`。
- support XNL adapter tests：concrete XnlNode adaptation、candidate materialization，复用现有 parser/mutation engine。
- Tiptap headless tests：schema/node/mark、steps、selection、history、transaction proposal。
- jsdom Vue mount tests：editor lifecycle、NodeView mount/update/unmount、owner token cleanup、IME event grouping。
- authoring integration：Interaction 不含 revision，host 构造 proposal，accepted PutGet、reproject、reject/conflict 不推进。
- identity integration：new/copy 分配 fresh `#id`、move 保留 `#id`、replacement delete+add、multi-role occurrence 派生不同 `x-id`。
- dependency/residue：在 Halfcode Document Presenter 切片内，contract/logic/support 无 Tiptap/ProseMirror/Vue/DOM，Tiptap/ProseMirror/NodeView 只存在新 adapter，Vue 可存在既有 Halfcode Vue renderer 与新 adapter；adapter 正常 authoring 无 HTML/querySelector/writer；admin legacy editor 不在切片内且不被本 track 扩展。

Workbench 产品 E2E 留给后续 `integrate-programmable-document-workbench` Track。
