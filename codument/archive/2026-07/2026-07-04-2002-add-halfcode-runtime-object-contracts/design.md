# Design：halfcode runtime object contracts

## 上下文

Runtime object 是 halfcode 动态代码的第一个参数。它必须能承载 scope 可见能力、对象派生、消息调用、instanceRefs 等复杂行为，但这些行为不能进入 XNL。contract 层只定义可序列化的 plan/assembly 输入类型和最小 protocol 类型。

## 方案概览

1. 新增 runtime contract 文件
   - `RuntimeInstanceSpec`：`id` + `src/create/prototype/derive/config`。
   - `RuntimeScopeAssembly`：scope id、parent runtime、config、bindings。
   - `HalfcodeRuntimeObject`：可选 `bindScope`、`deriveScope`、`call`、`send`。
   - `RuntimeCreate` / `RuntimeDerive` 函数类型。

2. source exclusivity
   - `src`、`create`、`prototype` 三类来源互斥。
   - `prototype` 场景允许 `derive`，也允许后续 assembly 调用 prototype 的标准 `deriveScope`。

3. canonical domain table
   - 新 canonical domains 使用文档中的 domain names：`config` 而非 `runtime-config`，`effect.types` 而非 `runtime-effects-def`。
   - 暂不删除旧类型兼容函数，但 scheme table 的 canonical 行先对齐新 DSL。

4. diagnostics
   - runtime ref/source/prototype/protocol/scope binding 诊断进入 unit diagnostic code union，供 loader/assembly 后续复用。

## 影响范围与修改点（Impact）

- `packages/dg-cell-mvi-halfcode-contract/src/unit/runtime.ts`
- `packages/dg-cell-mvi-halfcode-contract/src/unit/index.ts`
- `packages/dg-cell-mvi-halfcode-contract/src/unit/diagnostics.ts`
- `packages/dg-cell-mvi-halfcode-contract/src/unit/refs.ts`
- `packages/dg-cell-mvi-halfcode-contract/test/*`

## 风险 / 权衡

- 更新 scheme table 可能影响旧 v3 loader 测试；本 track 只做 contract 层最小兼容，若 loader 仍依赖旧 tag，后续 loader track 负责迁移。
- `HalfcodeRuntimeObject` 只给最小 protocol，不尝试表达业务强类型 runtime；业务 runtime interface 由 app 代码定义。

## 验收

- Contract package 能导出 runtime types。
- RuntimeInstance source exclusivity 有测试。
- Canonical domain/scheme table 含 runtime/effect/data graph 新域。
- 现有 support test 仍通过。
