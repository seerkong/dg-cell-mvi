# 变更：v3 单元 compiler 投影与 preview 闭环

## 背景和动机

mission `redesign-halfcode-hierarchical-unit-dsl` 的 G4-T1。前置已完成：contract v3（类型/诊断码/对照表）、loader（`loadHalfcodeUnitBundle`，分层 fixtures，44 tests 绿）。本 track 把分层单元 bundle 接入编译投影：路由树 → admin shell、单元树 → render plans、契约编译期校验（urlInputs/props/Requires）、跨页 wiring 编译，并让 admin-element-plus preview 页消费分层 bundle，形成 v3 端到端闭环。

## 目标

- **plan 契约（contract 包 unit 分区追加，additive）**：`UnitCompilePlans`——`AdminShellPlanV3`（或复用 v2 AdminShellPlan，实现者按结构适配度决策并记录）、`UnitRenderPlan`（每单元元素树投影）、`WiringPlan`（Wire → typed binding，含投递端点 route 实例）、`UnitCompileDiagnostic` 复用九码。
- **compiler（logic 包新模块，不 import support）**：`compileHalfcodeUnitBundle(input)`，input 用 contract v3 类型结构（与 loader 返回同型）：
  1. RouteTree 展开 → admin shell plan：menu/permission/title（Route 覆盖 page manifest 默认 title）。
  2. Route path 模式 ↔ 目标 page PageContract.urlInputs 匹配（path 变量缺失/多余 → `HALFCODE_ROUTE_URLINPUTS_MISMATCH`）。
  3. 嵌入 page 实例（urlInputsRef）：编译期校验目标 page urlInputs 可满足性（ref 可解析性已由 loader 保证；此处校验变量集）。
  4. component 实例内联 props + propsRef ↔ ComponentContract.props 匹配（未知 prop/必填缺失 → `HALFCODE_PROPS_CONTRACT_MISMATCH`）。
  5. Capsule Requires 沿 scope 链核验（config/intents/effects 需求可达）→ `HALFCODE_CAPSULE_REQUIRES_UNMET`。
  6. wiring 编译：Wire from/to 对照 route 注册表 + emit/accept 对照 PageContract → WiringPlan；page emit 未接线 → `HALFCODE_INTENT_UNWIRED` warning；不静默丢弃。
  7. elements → UnitRenderPlan（renderer 不解释 raw XNL；沿 v2 RenderPlan 的投影思想）。
- **e2e（support 包）**：basic-admin folder load → compile → admin shell/render/wiring plans 断言；broken-requires → `HALFCODE_CAPSULE_REQUIRES_UNMET`；构造 urlInputs 不匹配与未知 props 的负例（测试内联 fixture 即可）。
- **preview（admin-element-plus）**：`/halfcode-bundles` 页新增（或并列新增页）消费 `xnl-unit-bundles/basic-admin`，展示 admin shell plan 驱动的路由/菜单与至少一个单元 render plan；build 通过。
- **v2 隔离**：v2 `compileHalfcode` 及其输入路径零修改；v3 为新入口。

## 非目标

- 不实现 runtime 执行（effects/adapter 执行、MVI 装配增强）；plan 是编译产物。
- 不做 CRUD 投影建模（CrudTable 仍按 component 单元 + contract 编译，不展开 CrudPlan 深化）。
- 不迁移 workbench。

## 影响范围

- behaviors：`dg-cell-mvi-halfcode-unit-compile`（新增）
- 代码：`dg-cell-mvi-halfcode-contract/src/unit/`（plans 追加）、`dg-cell-mvi-halfcode-logic/src/`（新模块）、`dg-cell-mvi-halfcode-support/test/`（e2e）、`dg-cell-mvi-admin-element-plus`（preview 页）
