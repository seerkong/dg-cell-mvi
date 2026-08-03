# 变更：增加 Revisioned XNL Document Authoring Session

## 背景和动机 (Context And Why)

Projection foundation 已能把 Domain XNL 编译为 renderer-neutral plan，并把 Interaction 翻译为 Domain Command；Document Unit 已提供具名定义、root Scope 和 occurrence runtime；xnl.ts 已补齐 identity-safe dry-run mutation 与 revision-aware VFS persistence。当前仍缺少唯一写入链把这些能力组合成可复用的 authoring session，因此 Presenter、Halfcode 区块或 Agent 尚不能在不越权的情况下提交、接受并持久化领域编辑。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 定义 renderer-neutral、XNL-library-neutral 的 authoring contract：accepted snapshot、revision、proposal、candidate、mutation batch、diagnostics、accept/reject/conflict 与 persistence feedback。
- 以 runtime-first capability 组合 Domain Command materialization、XNL diff、strict dry-run、validation、ValueHost acceptance、CAS persistence 和 reproject invalidation。
- 让 ValueHost 成为 live accepted Domain XNL 的唯一 authority；Presenter、NodeView、embedded block 与 Agent 只能提交不可变 proposal。
- 保持 live revision 与 persistence revision/receipt 分离，明确 accepted-live、persisted、dirty、failed 和 conflicted 状态。
- 在 support 层适配 xnl-core 与 xnl-vfs revisioned persistence；contract/logic 不依赖 xnl-core、xnl-vfs、UI、DOM 或 VCS implementation。
- 验证 stale revision、原子 mutation batch、失败不推进、single writer、reload recovery 与 Interaction -> Command -> Candidate -> diff/dry-run/validate -> accept -> reproject 的 PutGet 前置规律。

**非目标:**

- 不实现 Tiptap/ProseMirror Presenter、HTML round-trip、DOM 寻址或 Vue UI。
- 不实现 Workbench 产品 demo、Agent 协作 UI、CRDT/OT、实时光标或任意离线合并。
- 不把 authoring pipeline 声明为 XNL DSL；Scope 仅绑定实现了协议的 runtime object。
- 不在 dg-cell-mvi 复制 xnl-core mutation engine、xnl-vfs CAS authority 或 xnl-vcs repository engine。
- 不重构 SchemaEditorSession；本 Track 提供独立的通用 XNL authoring owner。

## 变更内容（What Changes）

- 新增通用 authoring contract 与 validation。
- 新增 runtime-first authoring coordinator 和 owner-local revisioned session。
- 新增 xnl-core mutation adapter 与 xnl-vfs persistence adapter。
- 将 authoring capability 通过 Document occurrence runtime/Scope 暴露，不放进 config、input、全局 map 或 renderer state。
- 新增 authoring DSL/runtime 文档、focused/property/integration tests 与 public-surface typecheck。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`xnl-document-authoring-session`、`halfcode-scope-runtime-assembly`。
- 受影响的代码：`dg-cell-mvi-halfcode-contract`、`dg-cell-mvi-halfcode-logic`、`dg-cell-mvi-halfcode-support`、Halfcode DSL 文档与 workspace dependency wiring。
