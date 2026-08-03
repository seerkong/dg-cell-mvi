# RichDocument 语义候选物化器设计

## 上下文

当前链路已经具备两端，但缺中间的 foundation 实现：

```text
Tiptap transaction
  -> revision-free xnl.rich-document.edit Interaction
  -> [缺 public canonical translator]
  -> canonical Domain Command
  -> [缺 public semantic candidate materializer]
  -> XnlRichDocumentCandidateMaterializationResult
  -> existing trusted host identity allocation
  -> existing authoring submit at submission-time live revision
```

现有 trusted host 已经负责：每次 edit intent 只调用一次 translator；translation 完成后读取
当时最新的 accepted RichDocument 作为 materialization baseline；调用一次 materializer，并对
new/copy/replacement 调用 host-owned allocator；把 RichDocument materialize 为 concrete XNL；
submission-time 再次读取 live revision。translation 期间 revision 改变不构成冲突，后续使用
最新 accepted baseline；baseline capture 之后到 submission-time second read 之间 revision
改变则 fail closed，不提交 replace-document proposal。本 track 不复制或搬走这些 owner 职责，
只补齐可注入的 canonical capabilities。

## 方案概览

### 1. Contract：建立 renderer-neutral semantic vocabulary

在 `dg-cell-mvi-halfcode-contract` 的 `xnl-rich-document` capsule 中定义 canonical
public types，名称在 contract/red phase 固定：

- `XnlRichDocumentSemanticNode`：支持 RichDocument blocks/inline text/marks 的中立树；
  persistent node 使用 stable `nodeId`，新节点使用 local identity，二者互斥。
- `XnlRichDocumentSemanticEdit`：封闭 union，kind 为 insert/delete/move/text/mark/
  table/code/mermaid-source。
- `XnlRichDocumentEditInteractionPayload`：版本化、深只读、可序列化 edits。
- `XnlRichDocumentEditCommand`：固定 command type、Domain target、版本化 payload 与
  serializable provenance。
- `XnlRichDocumentCandidateMaterializationResult` 与
  `XnlRichDocumentCandidateMaterializer`：从 support 内部定义提升到 contract owner，
  保持现有 public shape 并消除重复真源。

Tiptap package 的 `XnlRichDocumentTiptapSemantic*` 类型改为 canonical contract 的
别名或严格窄化，不把 ProseMirror/Tiptap 类型带入 command。现有 consumer 若使用公开
Tiptap 类型仍可编译；新增 canonical 名称允许非 Tiptap consumer 复用同一 command。

### 2. Lossless normalizer handoff

materializer 只能应用有足够语义的信息，不能从 Tiptap JSON、HTML 或字符串差异猜测。
因此 canonical payload 约束如下：

1. `text` 与 `mark` 都携带 accepted-before 和 final-after 的 exact inline-run snapshot；
   文本字符串可作为诊断摘要，但不能成为 mark 边界的唯一事实。
2. 同一节点同时出现 text 与 mark 时，两条 edit 的 final inline runs 必须一致；
   translator/materializer 将其合并为一次 inline content replacement。冲突则整条 command
   rejected。
3. 插入普通新节点时，adapter 丢弃其自带的任何 persistent `nodeId`，只发 local identity。
4. copy 仅在 after 中的 local node claim 可与 accepted-before 中真实 stable node 唯一对齐时
   携带 `sourceNodeId`；复制子树的每个 persistent descendant 都分别携带来源。任意未知、
   重复或歧义 claim 不得升级为 copy provenance。
5. `table` 携带 table root 的 before/after semantic subtree；root stable identity 保留，
   已存在且可对齐的 descendants 保留 identity，新/复制 descendants 使用 local identity。
6. `code` 和 `mermaid-source` 携带完整 before/after 值，作为 optimistic semantic
   precondition，而不是只携带最终 payload。

### 3. Canonical translator / dialect

仓库只有 generic `translateXnlProjectionInteraction` 与 dialect hook，没有 public
RichDocument dialect/translator。故本 track 一并提供：

- canonical RichDocument projection dialect 的 `translateInteraction`；
- trusted-host 可直接注入的 runtime-first translation processor；
- package-root value exports 与类型。

translator 只接受 `type = "xnl.rich-document.edit"`，以只读 projection plan/target
resolution capability 从 `planNodeId` 解析 canonical Domain target，验证 exact payload，
输出固定 `XnlRichDocumentEditCommand`。projection runtime/plan 属于只读 Data/Processor
能力；translator 不接触 authoring session、revision、submit、allocator、writer 或 VFS。

无法解析 plan node、target 不一致、额外字段、accessor/symbol、非 serializable 值、未知
edit kind、local/stable identity 冲突或 malformed before/after 都返回结构化 rejected/
unsupported result，不抛出半成品 command。

### 4. Materializer：accepted-baseline 两阶段原子应用

公开 processor 遵守：

```text
output = materializeXnlRichDocumentSemanticCandidate(runtime, input, config)
input  = { accepted, command }
config = data-only policy（默认 exact/fail-closed；不放 callback）
output = XnlRichDocumentCandidateMaterializationResult
```

默认实现是纯 processor；runtime 为空或只包含未来经 contract 明确的窄依赖，不包含
writer/VFS/session。实现不得 mutate accepted、command 或 caller-owned aliases，成功结果和
diagnostics 深冻结。

算法分两阶段：

1. **Snapshot / Validate / Plan**
   - descriptor-safe 深快照 accepted 与 command；
   - 用 existing `parseXnlRichDocumentCandidate` normalize accepted；
   - 建立 stable-id 与 local-id 索引；
   - 所有 before、from parent/index、target kind、parent containment、table snapshot、
     local dependency、copy source 和 edit conflict 都对同一 accepted baseline 校验；
   - 拒绝 duplicate edit、ancestor delete 与 descendant update、循环 move、把节点移入自身、
     多个 placement 占同一目标、未知 ref、越界 index 和稳定 identity 伪造。
2. **Assemble / Normalize / Return**
   - 以 identity-keyed structural plan 组装 final child order，不按 edits 数组逐条 splice；
   - delete 移除 subtree；move 搬运原节点对象语义并保留全部 stable `#id`；
   - insert/table local subtree 使用 collision-safe temporary candidate ids；
   - text+mark 合并为 exact final inline runs；code 与 Mermaid 更新对应 canonical fields；
   - 对每个 copy local persistent node 生成
     `{ candidateNodeId: temporaryId, sourceNodeId }`；
   - 调用 existing normalization/identity classification 做最终 invariant check；
   - 任一步失败返回 rejected，accepted 与任何外部 authority 均不改变。

### 5. 各 edit 的语义

| Edit | Materialization rule | Identity rule |
|---|---|---|
| insert | 在 final parent/index 放置 canonical local subtree；支持 parent 为先前插入的 local node | 所有 persistent local nodes 生成临时 id；copy nodes 同时生成 copyOrigins |
| delete | before parent/index 必须匹配 accepted；删除整个 subtree | 被删 stable ids 不复用 |
| move | from 必须匹配 accepted，to 进入 final structural plan | 原 subtree 全部 stable ids 保留 |
| text | before/final runs 校验并替换 inline content | container `#id` 保留，text leaf 无 persistent id |
| mark | 与 text coalesce 后替换 exact marked runs | container `#id` 保留 |
| table | root before snapshot exact-match，after subtree 原子替换 | root/可对齐 stable descendants 保留；local descendants 新分配 |
| code | exact before language/text 后替换 | code block `#id` 保留 |
| mermaid-source | exact before source 后替换 | Mermaid block `#id` 保留 |

若同一 transaction 的结构 edit 与内容 edit 可兼容，plan 在 accepted baseline 上统一应用；
若目标已被删除/替换、同一 stable node 多次冲突更新或 table edit 与其 descendant edit 重叠，
整条 command fail closed，不进行部分应用。

### 6. Identity 与 copy-origin 交接

materializer 不调用 allocator，也不产生最终 persistent identity。它只保证：

- accepted/moved stable identities 原样保留；
- new/copy/replacement 得到不与 accepted 或其他 candidate identity 冲突的临时 id；
- copy provenance 仅来自 normalizer 对 accepted identity 的唯一对齐；
- `copyOrigins` 精确覆盖每个 copied persistent candidate node；
- result 可被 existing `classifyXnlRichDocumentIdentity` 识别为
  unchanged/update/move/new/copy/delete/replacement。

trusted host 继续以 proposal-scoped request id 调用注入的
`XnlRichDocumentIdentityAllocator`，对 new/copy 分配 fresh id、拒绝 collision/unverified，
然后才 derive occurrence `x-id`。replacement 仍按 delete-and-add 分类，不能作为普通 id
field update。

### 7. Trusted host 组合

integration test 使用 public roots 完整连接：

```text
normalizer intent
  -> canonical translator（exactly once）
  -> canonical materializer（exactly once）
  -> existing identity allocator（仅 new/copy/replacement）
  -> existing createXnlRichDocumentTrustedAuthoringHost
  -> existing accepted-first authoring session
```

测试必须证明：

- translator/materializer 各只调用一次；
- translation 期间 live revision 改变时使用 translation 完成后的最新 accepted baseline；
- accepted baseline capture 后，在 materialization、identity allocation 或 concrete assembly 到
  submission-time second read 之间 live revision 改变时拒绝 concurrent-change，不提交；
- semantic before facts 由 materializer 对该次 captured accepted baseline 校验，不跨 baseline
  合并或静默 rebase；
- proposal 的 baseLiveRevision 来自 submission-time snapshot；
- stale/rejected/lossy 失败不推进 live/persisted truth；
- accepted candidate reproject 后满足 PutGet；
- post-accept persistence failure 仍遵循 existing dirty-failed 行为；
- adapter、canonical command、materializer result 和公开 composition runtime 都不暴露
  revision/writer/VFS/VCS/session/submit/allocator（allocator 只存在 trusted host runtime）。

### 8. Public capsule 与依赖方向

合法依赖保持：

```text
contract <- logic <- support <- tiptap-vue adapter
```

- contract：纯 types/constants/validators；无 Tiptap、Vue、DOM、xnl-core。
- logic：canonical translator/dialect 与 pure materializer core；无 Tiptap、Vue、DOM、
  xnl-core/VFS。
- support：public composition values、concrete XNL bridge 和 trusted host；可依赖 xnl-core，
  不依赖 Tiptap/Vue/DOM。
- tiptap-vue：唯一 Tiptap/ProseMirror owner，只负责 transaction -> canonical Interaction。

support package root 是 product composition 的稳定入口；logic package root 同时公开纯能力，
support 不复制 logic 实现。package-boundary tests 禁止 deep import 和依赖反向。

## 影响范围与修改点（Impact）

- Contract：semantic edit/command/result、validators、type-level exactness tests。
- Logic：RichDocument dialect/translator、semantic materializer、property/fixture tests。
- Support：bridge type owner 收敛、package-root re-export、trusted-host integration tests。
- Tiptap adapter：canonical aliases、lossless normalizer payload、copy provenance、public smoke。
- Docs：public API、projection-and-authoring、identity、boundaries、usage tiers。

## 决策摘要

- 详见 `decisions.xnl`。
- canonical semantic vocabulary 归 contract，算法归 logic，trusted composition/public convenience
  归 support，Tiptap 仅做 outer adapter。
- canonical translator 与 materializer 都是本 track 必交付 public implementation。
- materialization 使用 accepted-baseline 两阶段原子算法；不按 edit 顺序直接 mutate。
- copy provenance 由 normalizer 基于 accepted identity 对齐产生，最终 identity 仍由 existing
  trusted host allocator 分配。

## 风险 / 权衡

- **现有 Tiptap semantic types 已公开**：改为 canonical alias 并保留兼容名称；通过
  package-root typecheck/import smoke 防止无意破坏。
- **混合结构 edit 的 index 漂移**：使用 final placement plan 和 identity 索引，不用顺序
  splice；增加 permutation/property tests。
- **text/mark 信息不足**：先扩充 normalizer 的 exact inline-run snapshot，再实现 applier；
  不接受 lossy fallback。
- **copy 与恶意 nodeId claim 混淆**：只有 accepted-before 唯一匹配可成为 source provenance，
  其余一律视为 new 或 rejected。
- **table after subtree 体积较大**：表格拓扑变化按单一原子 snapshot 处理，避免复制官方
  ProseMirror table operation 算法。
- **public API owner 漂移**：contract 只定义一次类型，logic 实现一次算法，support 仅重导出/
  组合；package scans 阻止第二实现。

## 兼容性设计

- 保留现有 `XnlRichDocumentTiptapSemanticEdit` 等名称作为 canonical type alias，必要时用
  版本化 payload 明确新增的 lossless fields。
- 保持 `createXnlRichDocumentTrustedAuthoringHost` 当前 runtime injection 模式和结果语义；
  新 public values 是可直接注入的默认实现，不强迫已有 custom domain consumer 改用。
- `XnlRichDocumentCandidateMaterializationResult` public shape 不变，只把 owner 移至 contract
  并由 support 重导出。
- 旧 test-local custom translators/materializers 可继续用于非 canonical domain 场景；
  canonical RichDocument tests 改用 production public values。

## 迁移计划

1. 先新增 contract/types/validators 和明确失败的 public-root/type-level tests。
2. 实现 canonical translator/materializer，使 logic tests 转绿。
3. 将 Tiptap normalizer 输出对齐 canonical payload，保留公开别名。
4. 将 support bridge 改为 contract-owned result，并增加 public re-export/composition tests。
5. 把 canonical RichDocument PutGet tests 从 test-local implementation 迁到 production values。
6. 更新文档后运行完整 package verification、strict Codument validate、fresh verifier 与
   terminal GapLoop。

回滚时可移除新增 public values/aliases，并恢复 test-local fixtures；不得留下 contract 与
support 各自定义一份 materialization result，亦不得回退为 Workbench 私有 applier。

## 待解决问题

- 无阻塞问题。`QuestionSeverity=auto` 下采用以上保守 owner 与 fail-closed 默认；实现期若
  发现现有 normalizer 无法无损表达某一 edit，必须先修 canonical payload/红测，不得在
  materializer 内猜测或降级。
