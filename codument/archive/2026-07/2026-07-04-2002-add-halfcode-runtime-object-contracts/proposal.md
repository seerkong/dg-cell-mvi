# 变更：新增 halfcode runtime object contract

## 背景和动机 (Context And Why)

最新 halfcode runtime 设计已经从 XNL 声明 store/reducer，调整为代码实现的 runtime object instance。Scope 通过 `runtime = "runtime://#..."` 绑定 RuntimeInstance，并把 effect/data graph/intent/config 等 sibling bindings 作为 assembly input 交给 runtime object。

当前 contract/support 代码仍使用旧 v3 domain vocabulary，例如 `runtime-config`、`runtime-state-seed`、`runtime-effects`，且没有 RuntimeInstance / RuntimeScopeAssembly / HalfcodeRuntimeObject 等纯 contract 类型。后续 loader 和 runtime assembly 缺少稳定输入输出契约。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 新增 runtime object contract 类型。
- 增加 runtime 相关诊断码。
- 将 unit scheme table 补齐到当前 canonical DSL 域名：`config`、`effect.types`、`data.graph`、`data.graph.logic.types`、`data.graph.seed`、`runtime`。
- 保持 contract 层纯声明：无 IO、无 dynamic import、无运行时执行。

**非目标:**
- 不实现 runtime assembly。
- 不执行 `src/create/derive`。
- 不 materialize data graph。
- 不改 production renderer。

## 变更内容（What Changes）

- 新增 `packages/dg-cell-mvi-halfcode-contract/src/unit/runtime.ts`。
- 更新 unit contract exports。
- 更新 `unit/diagnostics.ts` 增加 runtime diagnostic codes。
- 更新 `unit/refs.ts` 的 canonical domain/scheme/section table。
- 增加聚焦测试覆盖 runtime spec validation 和 scheme table。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-runtime-object-contracts`
- 受影响的代码：
  - `packages/dg-cell-mvi-halfcode-contract/src/unit/*`
  - contract package tests
  - downstream support loader 类型输入
