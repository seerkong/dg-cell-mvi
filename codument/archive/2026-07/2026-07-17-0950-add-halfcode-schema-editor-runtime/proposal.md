# 变更：新增 Halfcode Schema Editor Runtime

## 背景和动机 (Context And Why)

Schema Editor contract/compiler 已能产生 renderer-complete `EditorPlan`，但当前仍缺少 event-time command 求值、host-owned accepted snapshot session、Scope runtime capability bridge 和真实 canonical shell lowering。若直接进入 Vue renderer，renderer 会被迫承担 command、并发和 host mutation 语义，重新混合 Data、Effect、Processor 与 Actor。

本变更在 support package 建立中立 runtime：纯 Processor 把 command template 解析为 concrete Command；session Actor 只投影 host 接受的快照；ValueHost Effect port 保持真实 mutation owner；lowering 只生成 deterministic canonical sources，并通过真实 loader/compiler/app-runtime 验证。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义 dispatch snapshot、wildcard materialization、optional argument 与结构化 resolver diagnostics。
- 定义 revision-gated `ValueHost`/session envelopes、subscription、pending、stale response 和 dispose 语义。
- 将 ValueHost capability 通过 typed Scope runtime bridge 绑定，使用 stable runtime config id，不读取 plan provenance。
- 实现 pure `EditorPlan -> canonical shell source bundle` lowering。
- 真实通过 source resolver、loader、unit compiler、app runtime 获得单个 `schemaEditor.Editor` atom 和 plan/runtime bindings。

**非目标:**
- 不实现 Vue renderer、presenter registry 或 Element Plus components。
- 不实现 Flow/XNL mutation adapter、VFS/database persistence 或 host-specific writer。
- 不让 session 乐观修改 snapshot，不让 rejected/conflict/stale response 推进 projection。
- 不在 lowering 中读取 `StructureSchema`、捕获 `ValueHost` 或伪造 loaded bundle。
- 不使用 plan provenance 充当 service locator。

## 变更内容（What Changes）

- 新增 support `schema-editor` capsule 及 package-root public APIs。
- 新增 command resolver result/diagnostics、revisioned snapshot/apply envelopes、ValueHost/Session/Scope bridge protocols。
- 新增 deterministic canonical-shell lowering 与 memory-source real-runtime E2E。
- 更新 schema-editor docs，准确区分 runtime 已实现与 renderer/presenters 未实现。

## 影响范围（Impact）

- 受影响的能力：`halfcode-schema-editor-runtime`
- 受影响代码：`dg-cell-mvi-halfcode-support` schema-editor capsule、support tests、schema-editor docs
- 输入依赖：contract `EditorPlan`/commands、logic compiler output、canonical loader/compiler/runtime
- 后续消费方：Vue renderer、Element Plus presenters、Workbench Flow Editor

