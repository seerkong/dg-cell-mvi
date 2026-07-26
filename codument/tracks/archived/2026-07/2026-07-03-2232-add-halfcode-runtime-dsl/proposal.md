# 变更：新增 halfcode runtime DSL MVP 标准

## 背景和动机 (Context And Why)

当前 halfcode DSL 已有 frontend 与 effect 规范，但 runtime family 仍只应保留稳定边界。上一版“初始状态快照 -> live state -> 投影 -> frontend”的 MVP 过早固化了尚未确认的状态与投影 vocabulary，本 track 当前只负责把 runtime 暂缓边界写清楚。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 保留 `std/runtime/axioms.md` 与 `spec/runtime/` 作为 runtime family 的占位规范。
- 明确 frontend Scope 不声明 live state def/seed 绑定。
- 明确 `dg-cell-mvi-core` 的 `EffectHandler(runtime, request)` 与 halfcode scope effect 的 `output = fn(runtime, input, config)` 是不同层级；后续通过 adapter 设计桥接。
- 移除上一版 runtime MVP 的状态/投影示例，避免污染后续设计。

**非目标:**
- 不设计 live state、reducer、events、ports、resources、CRUD、workflow 的完整语义。
- 不改 `dg-cell-mvi-core` runtime 实现。
- 不在 XNL 内联函数、fetch、constructor、callback 或业务执行方法。

## 变更内容（What Changes）

- 增加 runtime DSL 文档：
  - `docs/halfcode/dsl-bundle/std/runtime/axioms.md`
  - `docs/halfcode/dsl-bundle/spec/runtime/domains.md`
  - `docs/halfcode/dsl-bundle/spec/runtime/nodes.md`
  - `docs/halfcode/dsl-bundle/spec/runtime/files.md`
  - `docs/halfcode/dsl-bundle/spec/runtime/refs.md`
- 更新 `docs/halfcode/dsl-bundle/README.md` 与 frontend refs，说明当前 runtime 只提供暂缓边界，不提供可生成示例。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-runtime-dsl`
- 受影响的文档：`docs/halfcode/dsl-bundle/`
- 受影响的 fixture：无；上一版 `mvp-runtime-demo` 不再作为规范样本。
