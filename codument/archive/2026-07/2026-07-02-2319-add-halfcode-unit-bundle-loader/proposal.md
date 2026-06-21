# 变更：v3 单元 bundle loader 与分层 fixtures

## 背景和动机

mission `redesign-halfcode-hierarchical-unit-dsl` 的 G3-T1。前置已完成：xnl-core 支持点分 FQN tag（xnl.ts track `extend-xnl-core-dsl-syntax`，support 的 vitest alias 直连本地 src，能力即刻可见）；contract v3 分区已落地（track `add-halfcode-v3-unit-contract`：HALFCODE_SCHEME_TABLE、parseHalfcodeRef、单元/契约/路由类型、九个诊断码）。

本 track 在 `dg-cell-mvi-halfcode-support` 落地 v3 单元 bundle loader，并把 fixtures 迁移为分层结构，作为 16 项决策（mission decisions.md）的第一次代码级全量自验证。

## 目标

- 新增 v3 loader（新模块，**不改 v2 `xnlAssetBundle.ts`**）：bundle.xnl 解析（Ports domains + Units 单元注册）→ app domains 加载 → 单元递归加载（文件夹=manifest+domain 文件；单文件=区段按 HALFCODE_SCHEME_TABLE 映射 domain）→ FQN 注册表（冲突/kind 校验）→ elements（点分 tag）与 contracts 解析 → 单元级 ref 索引与诊断。
- 诊断语义：ref 在本单元 domain 解析失败 → `HALFCODE_REF_UNRESOLVED`；若能在其他单元 domain 解析到 → 升级为 `HALFCODE_REF_PRIVACY_VIOLATION`（帮助定位越权）；FQN 冲突 → `HALFCODE_UNIT_FQN_CONFLICT`；Units 条目 kind 与 manifest 根类型不符 → `HALFCODE_UNIT_KIND_MISMATCH`；pageRef/tag FQN 无注册 → `HALFCODE_UNIT_NOT_FOUND`。loader 不做 Requires/urlInputs 编译期核验（G4）。
- fixtures：新增 `test/fixtures/xnl-unit-bundles/`——`basic-admin`（按 mission 规范 §9：多文件 users page、多文件 report-detail page、多文件 crud-table component、单文件 status-badge component、app.routes/product/wiring、嵌入 page 实例、Slot 区段）；负例 `fqn-conflict`、`privacy-violation`；`broken-requires`（数据就位，REQUIRES_UNMET 核验在 G4 track 生效）。
- E2E：folder load → FQN 注册表 → 单元 domains → elements/contracts 结构断言 → 诊断断言（正例零 error 诊断，负例产出预期诊断码）；XNL-only 结构扫描延续（无 JSON/XML）。

## 非目标

- 不做 compiler 投影与 Requires/urlInputs/props 编译校验（G4）。
- 不改 v2 loader、v2 fixtures 与既有测试。
- 不实现 adapter 执行（沿 v2 口径：只解析引用）。

## 影响范围

- behaviors：`dg-cell-mvi-halfcode-unit-bundle`（新增）
- 代码：仅 `packages/dg-cell-mvi-halfcode-support`（src 新模块 + test fixtures/tests）
- 下游：G4 compiler track 消费 loader 返回结构。
