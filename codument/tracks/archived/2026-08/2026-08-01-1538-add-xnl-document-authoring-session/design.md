# Revisioned XNL Document Authoring Session 设计

## 1. 边界与事实源

本 Track 建立 Projection 与 Presenter 之间缺失的写入 owner，但不实现 Presenter。事实等级固定为：

1. `acceptedSnapshot + liveRevision`：当前 session 唯一 live authority。
2. `persistedRevision + receipt`：VFS/VCS persistence evidence，不等同于 live revision。
3. `candidateSnapshot`：一次请求内的可丢弃候选。
4. `mutationBatch`：不可变 proposal data，不是 accepted fact。
5. ProjectionPlan、Presenter draft、Vue state、DOM：可重建或局部状态，无写入 authority。

Revision token 必须携带其 equality scope：live revision 是 `{ sessionId, value }`，只在同一 owner session 内比较；persisted revision 是 `{ authorityId, value }`，与 xnl-vfs `VfsRevision` 无损同构。两类 token 的相等判断都必须同时比较 scope 与 value，不能仅比较 value。

Applied persistence receipt 无损保留 xnl-vfs 的 previous/current revision、`persistedAt` 与 `durability`；result 的 `persistedRevision` 必须精确等于 receipt current revision，且 previous/current 必须属于同一 authority。`unchanged` 继续保持无 receipt。

XNL `#id` 是 tree alignment/move identity，不是普通 payload 更新字段；identity replacement 只能由 delete+add 表达。`x-id` 只标记 authoring proposal 的来源 occurrence，最终 mutation 仍以 `#id` 或 canonical XNL path 定位。

## 2. 分层

```text
contract
  AuthoringSnapshot/Revision/Proposal/Result/RuntimePort/PersistencePort
    <- logic
       pure validation + coordinator state transitions
         <- support
            xnl-core diff/dry-run adapter
            xnl-vfs revisioned persistence adapter
            owner-local session runtime
```

`contract` 与 `logic` 使用泛型 `TDocument/TCommand/TMutation`，不导入 xnl-core/xnl-vfs。support 才把泛型收窄到 canonical XNL AST 与 mutation batch。

## 3. Runtime-first 协议

公开 processors 保持：

```text
output = fn(runtime, input, config)
```

runtime 持有稳定 capability：

```ts
interface XnlAuthoringRuntime<TDocument, TCommand, TMutation> {
  readonly domain: {
    materializeCandidate: Processor<MaterializeInput<TDocument, TCommand>, Candidate<TDocument>>
    validateCandidate: Processor<ValidateInput<TDocument, TCommand>, ValidationResult>
  }
  readonly mutations: {
    diff: Processor<DiffInput<TDocument>, readonly TMutation[]>
    dryRun: Processor<DryRunInput<TDocument, TMutation>, DryRunResult<TDocument>>
  }
  readonly persistence: XnlAuthoringPersistencePort<TDocument>
  readonly revision: XnlAuthoringRevisionPort
  readonly invalidation: XnlAuthoringInvalidationPort
}
```

Runtime capability 分成三种可见面：

- `XnlAuthoringSessionFactoryPort`：host/assembly-only，创建 owner session，绝不下发给 Scope 或 Presenter。
- `XnlAuthoringProposalPort`：edit Scope-visible，只暴露 immutable state、subscribe 和 submit proposal；不暴露 persistence、revision allocator、raw mutable AST 或 session lifecycle control。
- `XnlAuthoringControlPort`：host-only，负责 retry persistence、显式 discard/reload 和 dispose。

input 只携带 request/command/baseRevision/source identity；config 只携带本次调用的 serializable policy 值。任何 processor、registry、writer、persistence client、validator function 都不得进入 input/config。

## 4. 唯一写入链

```text
Projection Interaction
  -> translated Domain Command
  -> submitAuthoringEdit(runtime, request, config)
  -> baseRevision gate
  -> runtime.domain.materializeCandidate
  -> runtime.mutations.diff
  -> runtime.mutations.dryRun(metadataIdMode=identity)
  -> runtime.domain.validateCandidate
  -> ValueHost accept + next liveRevision
  -> runtime.invalidation.publish(accepted revision + affected identities)
  -> runtime.persistence.persist(expected persisted revision, accepted snapshot)
  -> persistence receipt / dirty / conflict
```

同一 session 内请求串行化。stale base revision 在 candidate 生成前返回 conflict；reject/conflict 不推进 accepted snapshot。no-op 不生成新 live revision。

## 5. Accept 与 persistence

ValueHost acceptance 和外部 persistence 无法形成跨系统原子事务，因此采用明确的 accept-first 状态机：

```text
ready -> evaluating -> accepted-persisting -> ready
                                  |-> dirty-failed
                                  |-> persistence-conflicted
```

- dry-run/validation 通过后，ValueHost 原子接受 candidate 并推进 live revision。
- live acceptance 后立即发布 domain invalidation，使所有 projection 以 accepted fact 重投影；persistence 结果只更新 save-state subscription，不决定领域事实是否可见。
- persistence `applied` 更新 persisted revision 和真实 receipt；`unchanged` 只更新/确认 persisted revision，receipt 保持 absent，adapter MUST NOT 伪造 receipt。
- persistence failure 不回滚已接受 live fact；状态明确为 `dirty-failed`，保留诊断和 retry capability。
- persistence conflict 明确为 `persistence-conflicted`，保留 actual persisted revision；在显式恢复前拒绝新 edit。
- `dirty-failed` 与 `persistence-conflicted` 都不能被 UI 表述为“已保存”。
- Authoring facts 采用 JSON/XNL 语义：optional absence 合法，显式 `undefined` 在静态 contract 与 runtime validation 均被拒绝。
- retry 只持久化当前 accepted snapshot；不得重新执行 Domain Command 或 mutation materialization。
- `dirty-failed` 可以 `retryPersistence(expectedLiveRevision)`；success/unchanged 回到 ready，failure 保持 dirty，conflict 进入 persistence-conflicted。
- 本 Track 不实现自动 rebase。`reloadDiscardingAccepted({ expectedLiveRevision })` 是显式破坏性恢复：读取 persistence snapshot，替换 accepted live fact，分配新的 live revision，发布 invalidation，并在结果中返回被丢弃的 live revision。expected live revision 不匹配则 conflict，不能覆盖更新的 live fact。
- `reloadDiscardingAccepted` 可用于 dirty-failed 或 persistence-conflicted；调用方在执行前可从 readonly state 取得当前 accepted snapshot，用后续新 proposal 表达人工 rebase。不存在静默丢弃。

## 6. Session 与 Document runtime

Authoring session 是 owner-local actor/capability，不是全局 registry。Document `mode=edit` occurrence 可由 host runtime 的 factory 创建 session，并只把 proposal port 装配进 root/Capsule/Component Scope runtime。control port 由 host 保留。多个 edit Scope 可共享同一 session instance；是否共享由 runtime object binding 决定。

Document `mode=view` 是绝对无 writer 模式：即使 host runtime 拥有 factory，也不得调用或暴露它；assembly 若返回 proposal/control/session binding 必须报错并完整回滚。view root/Capsule/Component/Presenter runtime facet 均不包含 submit capability。

不新增 `<Authoring>` XNL 套层。简单场景使用预制 runtime factory；复杂场景指向实现强类型 interface 的代码对象。

## 7. xnl-core / xnl-vfs adapter

- support 的 mutation adapter 调用 `diffNodes` 与 `dryRunMutations`，强制 `metadataIdMode: "identity"`。
- mutation batch 为 immutable snapshot；dry-run 使用 clone，不修改 accepted base。
- support 的 persistence adapter 绑定 `xnl-vfs/revisioned-persistence` 的 `RevisionedVfsAuthority`，使用 full accepted snapshot CAS；不复制 authority 的 freshness/no-op/failure逻辑，且不得为 `unchanged` 伪造 receipt。
- xnl-vcs checkpoint 是可选 host effect/receipt，不进入 browser-safe support 核心；Workbench 后续绑定真实 repository adapter。

workspace 以相对 workspace package 引用本地 xnl.ts 的 core/collab-core/vfs，以消费已验证的当前公共 API；不得写绝对路径依赖。验证必须检查 root/support 的 package resolution realpath 指向本地 workspace、lockfile 使用 workspace resolution、依赖图只有一个 xnl-core 0.1.9 instance，并从 support package 实跑 ESM/CJS/type import smoke。

## 8. 验证

- contract/type tests：serializable facts、readonly public surface、runtime/config/input authority。
- pure pipeline：stale/reject/no-op/accepted、strict dry-run、validator ordering、immutable snapshots。
- state machine：serialized concurrent requests、accepted-live vs persisted、retry、persistence conflict、dispose。
- integration：真实 xnl-core move/identity replacement/duplicate id diagnostics；真实 xnl-vfs CAS、reload 与 failed write。
- PutGet 前置：提供真实 renderer-neutral Dialect、Interaction translator、materializer 和语义 oracle，实跑 compile -> translate -> candidate -> diff/dry-run/validate -> accept -> recompile，并比较投影语义；不以调用轨迹或报告代替规律，不在本 Track 宣称 Tiptap GetPut。
- residue：contract/logic 无 xnl-core/xnl-vfs/UI/DOM/writer implementation；support 无 Tiptap/Vue/HTML/querySelector/global authoring authority。

## 9. 风险与缓解

- accept 后 persist 失败形成 live/persisted 分叉：显式状态、暂停编辑、retry/reload/rebase，不伪装成功。
- callback 偷渡：public-surface typecheck 和 dependency/residue scan 禁止 function object 进入 config/input。
- adapter 重做底层引擎：integration tests 必须调用 xnl-core/xnl-vfs 公共 API。
- revision 混同：live revision、VFS revision、可选 VCS receipt 使用不同类型与字段。

## 10. 后续边界

Tiptap Presenter、Workbench host、领域 DSL demo 和 Agent collaboration 由 Mission 后续 tracks 使用本 session。当前 Track 不提前拥有这些产品实现。
