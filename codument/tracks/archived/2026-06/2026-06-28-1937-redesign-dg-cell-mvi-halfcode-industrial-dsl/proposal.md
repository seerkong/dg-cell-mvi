# 变更：重设计 dg-cell-mvi-halfcode 工业化 DSL

## 背景和动机 (Context And Why)

`dg-cell-mvi-halfcode-*` 已经从 legacy el-halfcode 迁移到 `dg-cell-mvi` 包族，并且 runtime 已接入 `dg-cell-mvi-core` 的 MVI 环路。但当前 DSL 仍主要是 legacy-compatible render schema：`HalfcodeSchema` 同时混合渲染节点、初始状态、数据源、插件、CSS 和设计器元数据；Vue renderer 直接解释 raw node；Halfcode 到 CRUD 的适配仍在 Element Plus adapter 中构造 direct fetch 和 hook closure。

这会让低代码继续停留在“运行时渲染器外壳”，而不是成为 dg-cell-mvi 产品线的物料与编译层。按照 DEPA 思想，新的低代码部分应当明确事实源、派生投影、support ports、runtime owner，并复用 `dg-cell-mvi-core`、`dg-cell-mvi-crud`、`dg-cell-mvi-admin-*` 与 XNL/VFS 生态。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 新增 canonical `HalfcodeDocument` 与产品线 material 契约，隔离 legacy `HalfcodeSchema`。
- 建立 compiler pipeline：legacy/raw input -> canonical document -> typed plans。
- 明确 runtime ownership：schema seed 是 checkpoint snapshot，live runtime state 只由 MVI events 写入。
- 把 CRUD/admin/view/workflow 物料编译到现有 dg-cell-mvi 能力，而不是重造 runtime。
- 把 request/dict/hook/expression/artifact IO 收敛到 support ports。
- 引入 authoring artifact pipeline，允许后续接入 XNL/VFS/codument artifact。
- 保留 legacy 兼容路径，但隔离在 compatibility adapter 中。

**非目标:**

- 第一阶段不删除旧 demo、legacy renderer、Halfcode 兼容路径。
- 不把 Element Plus 设计成 canonical halfcode model。
- 不把所有 data-source/plugin/resource 默认 actor 化。
- 不要求 canonical v1 一次覆盖 Halfcode 的全部边缘能力。
- 不在本 track 中重写 `dg-cell-mvi-core`、`dg-cell-mvi-crud` 或 `dg-cell-mvi-admin-*` 的基础 runtime。

## 变更内容（What Changes）

- **BREAKING-internal**：在 halfcode contract 内部引入 canonical/legacy 类型边界，新代码应使用 canonical `HalfcodeDocument`，legacy schema 只作为 compatibility input。
- 新增 `document/`、`material/`、`compiler/`、`legacy/` 等 contract 分区。
- 新增 `compiler/`、`projectors/`、`migrations/` 的 logic 分区，输出 `RenderPlan`、`CrudPlan`、`AdminShellPlan`、`EffectPlan` 与 diagnostics。
- 收窄 Vue renderer 输入，使 canonical 路径消费 `RenderPlan`，不直接解释 canonical document。
- 重构 CRUD/Halfcode 适配，把 request/hook construction 从 Element Plus adapter 移到 compiler/support boundary。
- 新增 artifact port 边界，为 memory/browser storage/xnl-vfs/server storage 预留实现位。
- 更新 demo/test，使新路径使用 canonical document，旧路径继续通过 legacy adapter 验证。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`dg-cell-mvi-halfcode-industrial-dsl`
- 受影响的代码：
  - `packages/dg-cell-mvi-halfcode-contract/src/*`
  - `packages/dg-cell-mvi-halfcode-logic/src/*`
  - `packages/dg-cell-mvi-halfcode-support/src/*`
  - `packages/dg-cell-mvi-halfcode-vue/src/*`
  - `packages/dg-cell-mvi-halfcode-element-plus/src/*`
  - `packages/dg-cell-mvi-halfcode-web/src/*`
  - 相关 tests 与 demos
- 复用边界：
  - `packages/dg-cell-mvi-core`
  - `packages/dg-cell-mvi-crud`
  - `packages/dg-cell-mvi-admin-*`
  - `xnl.ts/packages/core` 的 path/mutation/import/loader 能力
