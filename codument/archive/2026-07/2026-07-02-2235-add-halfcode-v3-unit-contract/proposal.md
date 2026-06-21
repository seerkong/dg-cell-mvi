# 变更：halfcode v3 分层单元契约（App/Page/Component/Capsule + 统一 URI 引用）

## 背景和动机 (Context And Why)

mission `redesign-halfcode-hierarchical-unit-dsl`（`codument/missions/active/`）已收敛 16 项决策（mission `decisions.md` D1-D16）和 v3 规范草案（mission `analysis/v3-unit-dsl-spec-draft.md`）：halfcode DSL 从"单 app 层级、单文档单树"升级为分层单元体系——Capsule 是唯一内联封装原语；Page/Component 是其有名可复用发行形态（FQN 身份）；App 是组合根（路由树 + 单元注册）；引用统一为 `vfs://` 物理寻址 + 类别 scheme 逻辑寻址。

本 track 是该 mission 的 G2-T1：**只落地 contract 层**（`dg-cell-mvi-halfcode-contract`），为后续 loader（G3）与 compiler（G4）track 提供稳定类型底座。前置 `extend-xnl-core-dsl-syntax`（xnl.ts 仓库）已完成：点分 FQN tag 已获 xnl-core 支持。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- v3 单元类型：`HalfcodeAppSpec`（product+routes+units+wiring）、`HalfcodePageManifest`、`HalfcodeComponentManifest`、`UnitBundleRef`（file/folder 双形态）、FQN 类型与唯一性约束（D1/D10/D15）。
- 元素树 v3 实例节点类型：FQN tag 实例（component/page 引用）、`Capsule`（内联专属）、`Slot`；children 为数组段、具名 slots 在区段（D4/D11/D12）。
- 契约类型：`PageContract`（urlInputs+accepts/emits，无 props）、`ComponentContract`（props/slots/accepts/emits/exposes）、`ElementContract.Requires`（宿主 scope 链期望：state-def 字段路径/intents/config）（D2/D5/D9/D14）。
- 路由与接线：`RouteSpec`（#id、path、pageRef、menu/permission/title 覆盖）、`WireSpec`（route 实例寻址）（D3/D6/D13）。
- 统一 URI 引用类型与 scheme 注册：ref 字符串品牌类型 + 解析结构（scheme/path/#id/sub-path）+ **domain↔scheme↔单文件区段三列对照表**常量（D7/D8/D17）；单元私有性语义常量（D18）。
- validation 红线：canonical 禁函数/构造器/direct fetch 延续；Page 契约禁 props；scheme 引用必须引号字符串形态（类型层面即字符串）；frontend contract 禁 input/output 延续。
- diagnostics code 常量：`HALFCODE_UNIT_FQN_CONFLICT`、`HALFCODE_UNIT_NOT_FOUND`、`HALFCODE_UNIT_KIND_MISMATCH`、`HALFCODE_REF_PRIVACY_VIOLATION`、`HALFCODE_REF_UNRESOLVED`、`HALFCODE_ROUTE_URLINPUTS_MISMATCH`、`HALFCODE_PROPS_CONTRACT_MISMATCH`、`HALFCODE_CAPSULE_REQUIRES_UNMET`、`HALFCODE_INTENT_UNWIRED`。

**非目标:**

- 不实现 loader/解析器/scheme resolver（G3 track）。
- 不实现 compiler 投影与校验逻辑（G4 track）；contract 只定义类型与 diagnostics code。
- 不修改 v2 类型（document.ts/element.ts/material.ts 等保持原样）；v3 为新增分区，v2 按 quarantine 传统保留。
- 不迁移 fixtures（G3）。

## 变更内容（What Changes）

- `packages/dg-cell-mvi-halfcode-contract/src/unit/`：新增 v3 分区（unit.ts、routes.ts、contracts.ts、refs.ts、validation.ts、diagnostics.ts 或等价拆分）。
- `packages/dg-cell-mvi-halfcode-contract/src/index.ts`：导出 v3 分区。
- `packages/dg-cell-mvi-halfcode-contract/test/`：新增 v3 边界测试（红线、对照表完整性、类型可序列化）。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`dg-cell-mvi-halfcode-unit-dsl`（新增）
- 受影响的代码：仅 `packages/dg-cell-mvi-halfcode-contract`
- 下游：G3 `add-halfcode-unit-bundle-loader`、G4 `add-halfcode-v3-compiler-projection` 消费本 track 类型。
