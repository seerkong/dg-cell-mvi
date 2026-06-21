# 变更：新增 halfcode CRUD DSL 标准

## 背景和动机 (Context And Why)

`dg-cell-mvi-crud` 已有完整 CRUD 领域能力：list/search/pagination/sort/form/remove/dict/editable/columns-filter 等 event vocabulary，以及 pageRequest/addRequest/editRequest/removeChain/dict/loadDraft 等 effect vocabulary。当前 halfcode DSL 还没有把这些能力提升为声明式 CRUD material。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义 CRUD DSL 的 L2 公理：CRUD 是领域物料，不是普通 component props。
- 声明 Entity、Field、Operation、Table、Search、Form、Dict、Editable、Draft、Permission 等节点。
- 将 CRUD operation 映射到 resource/backend-flow DSL。
- 将 CRUD state/view model 映射到 runtime 与后续投影 family。
- 将 CRUD UI projection 映射到 frontend view material。

**非目标:**
- 不把 Element Plus table/form props 作为 canonical CRUD DSL。
- 不内联 request functions、render hooks、valueChange functions。
- 不替代现有 `dg-cell-mvi-crud` 包；DSL 编译到其 options/plans/effects。

## 变更内容（What Changes）

- 候选新增：
  - `docs/halfcode/dsl-bundle/std/crud/axioms.md`
  - `docs/halfcode/dsl-bundle/spec/crud/{domains,nodes,files,refs}.md`
- 候选域：`entities`、`crud`、`fields`、`operations`、`dicts`、`permissions`、`crud.ui`。
- 候选 diagnostics：operation missing resource、field path mismatch、dict unresolved、editable persist mismatch。

## 影响范围（Impact）

- 依赖：product material、runtime、resource DSL；投影 family 后续另行设计。
- 后续影响 admin template、halfcode preview、Element Plus material adapter。
- 当前状态：proposal-only 候选 track，执行前需补齐 behavior delta、design、track.xml。
