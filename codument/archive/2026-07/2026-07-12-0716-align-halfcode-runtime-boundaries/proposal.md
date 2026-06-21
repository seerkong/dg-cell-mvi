# 变更：校准 halfcode runtime 边界

## 背景和动机 (Context And Why)

RuntimeInstance foundation 已能加载、装配和执行 runtime-first 动态代码，但一次 DEPA/halfcode 扫描发现六项语义或可移植性偏差：workbench 的旧 runtime 行为仍指向 reducer store；scope-derived ref 的 loader 索引误把单元内声明当作 Scope 可见性；config host resolver 的异常未被诊断化；Runtime DSL 的代码/声明边界缺少可执行守护；FrontendApp API 与 loader representation 的版本关系未写清；包化 bundle 只能依赖 `readDir` 发现域文件。

这些问题共享同一根源：RuntimeInstance、Scope 和 loader 的边界尚未被端到端地固化。继续进入 G3 data graph binding 会把该边界误传播到 `scope.data.graph://`。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 将 workbench 行为登记表与 dg-cell-mvi RuntimeInstance DSL 对齐，并保留任何仍被证据支持的 legacy MVI-store 行为作为不同能力。
- 让 `scope.*://` 的“可见性”以 Scope 链为真源，不再由 unit-global id 集合冒充。
- 为 config resolver、包化 domain loading、版本兼容和 Runtime DSL 边界提供可执行的诊断与测试。
- 在进入 G3 前形成可验证的 runtime integration boundary。

**非目标:**

- 不设计或实现 data graph DSL/runtime binding。
- 不把 effect、data graph、intent 的具体能力树重写进 Runtime XNL。
- 不重新引入 `state.def`、`state.seed`、`StreamSignalStore` 或 reducer 节点作为 Runtime DSL。
- 不要求把 legacy MVI store 改造成 RuntimeInstance；仅澄清其是否仍为独立行为。

## 变更内容（What Changes）

- 修订 `eidolon-workbench/codument/behaviors/halfcode.runtime.xml`：将 RuntimeInstance 对象系统和任何 legacy MVI store 语义拆开或明确迁移。
- 将 loader 的 scope-derived reference 检查调整为 scope-aware，或把 unit-global collection 降级为不声称可见性的 declaration inventory。
- 将 injected config resolver 故障转成专属 runtime diagnostic。
- 支持没有 `readDir` 的显式 domain-file inventory loading。
- 在 DSL 文档和测试中说明 FrontendApp API version 与 loader representation version 的关系。
- 添加 guardrail 测试，防止 XNL 扩张为 imperative runtime capability DSL，并保持 runtime-first 动态代码协议。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode.runtime-boundaries`，以及 workbench 中现有 `halfcode.runtime`。
- 受影响的代码：`packages/dg-cell-mvi-halfcode-support/src/xnlUnitBundle.ts`、`runtimeAssembly.ts`、runtime contract diagnostics、support tests、`docs/halfcode/dsl-bundle/spec/runtime/`、`docs/halfcode/dsl-bundle/spec/frontend/`。
- 跨仓库影响：`eidolon-workbench/codument/behaviors/`。
