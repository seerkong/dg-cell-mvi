# Schema Editor 规范

本目录记录 schema-driven Halfcode editor 的中立 contract、compiler、support runtime、toolkit-neutral Vue renderer 与 Element Plus 默认 presenter capsule，以及已经落地的 Workbench Flow consumer 组合方式。当前链路已经从 schema/presentation 编译到 renderer-neutral `EditorPlan`，再通过 Scope 中的 accepted-state session 驱动 canonical Halfcode shell 和 product-ready presenter。

## 入口

1. [contracts](contracts.md)：`StructureSchema<T>`、typed `EditorPlan.metadata`、`EditorPresentation` normalization、compiler runtime/dialect、event-time `SchemaEditorCommandTemplate` 与 concrete `SchemaEditorCommand` 的边界。
2. [runtime](runtime.md)：command resolver、ValueHost/session、Scope capability、canonical lowering、Vue renderer lifecycle 与 runtime 三档集成。
3. [usage tiers](usage-tiers.md)：compiler 三档和对应的 direct/session/canonical renderer 装配层级。
4. [Element Plus presenters](element-plus.md)：26 项 presenter matrix、format aliases、normalized payload、业务 later-wins、canonical bootstrap、shared kitchen-sink 与 ownership。
5. [examples](examples.md)：defaults/identity、递归默认编译、path overlay precedence、toolkit-neutral presenter registry、normalized event 与 canonical registry 示例。
6. [boundaries](boundaries.md)：package、runtime、renderer、Element Plus、host mutation 与 raw JSON fallback 边界。

## Workbench G4 Status

截至 2026-07-17，Workbench Flow Editor 的 G4 consumer migration 已完成并成为这套基座的真实下游样板：

- `StructureSchema` 和可选 `EditorPresentation` 由 Workbench `flow-schema-editor` capsule 里的 product adapters 投影，generic packages 不知道 Flow 领域。
- `SchemaEditorDialect`、business presenter registry 和 raw/code presenter 选择都由 Workbench capsule owner，raw/code 只能通过显式 stable presenter id 进入，绝不是 fallback。
- `FlowSchemaEditorTarget` 统一覆盖 `flow` 与 `node` 两类 target：两者都带 stable identity、title、schema、optional presentation、accepted snapshot 和只读 product facts。
- `FlowSchemaEditorValueHost` 只做 command 到 Workbench semantic edit port 的翻译；XNL mutation、dry-run、canonical reload、VFS commit 和 authoritative revision 仍由既有 Flow capsule/semantic writer owner。
- right panel 只有一个 canonical Schema Editor runtime。它只消费 accepted snapshot，不维护第二份 form truth，也不会把 layout、viewport、selection 或 writer capability 交给 renderer/presenter。

对应 consumer 代码在：

- `eidolon-workbench/frontend/packages/bastard/src/flow-editor-domains/capsules/flow-schema-editor/`
- `eidolon-workbench/frontend/packages/bastard/src/flow-editor-layout/flow-schema-editor-panel/`
- `eidolon-workbench/frontend/packages/bastard/tests/e2e/README.md`

## Business Dialect Demo

`packages/dg-cell-mvi-halfcode-element-plus/demo/schema-editor-business-dialect/`
给出当前最完整的三层代码装配示例：

1. `sharedCapsule.ts`：共享业务属性 capsule，只暴露 stable semantic id、
   stable presenter id、以及 `fn(runtime, input, config)` 形状的 dialect /
   presenter registry factory。
2. `boundedContext.ts`：业务 A / B 的 bounded-context layer。同一份
   `BUSINESS_DIALECT_SHARED_SCHEMA` 在这里被绑定到不同的 phone
   transformer、presenter 和 host outcome。
3. `boundedContext.ts` 中的 editor-instance layer：只覆盖一个 mounted
   editor，不污染 sibling Scope。

`fixture.ts` 里的 `StructureSchema` 和 `EditorPresentation` 仍是纯数据：
schema 只描述 `user.phone` / `address` / `manager` / `status`，presentation
只引用 stable presenter id 和 serializable options，不嵌组件、函数、runtime、
writer 或 host callback。

runtime / mounted demo 入口在 `runtime.ts`：

- `createSchemaEditorBusinessDialectDemoRuntime`：创建 canonical runtime proof，
  但不挂载 DOM；
- `mountSchemaEditorBusinessDialectDemo`：挂载三个真实 editor
  (`businessA` / `businessB` / `businessAOverride`) 并暴露 host harness，
  用来验证 accepted、pending、rejected、conflict、stale、malformed 与
  `resolvePending()` replay。

## 当前实现状态

- 已实现：schema-editor contracts、递归 compiler、event-time command templates、command resolver、revision-gated `SchemaEditorSession`/`ValueHost`、typed Scope capability bridge、canonical source lowering、`SchemaEditorPresenterRegistry`、六类节点递归 Vue renderer、collection/map wildcard 动态物化、normalized presenter event dispatch、renderer-local identity projection、`SchemaEditorSessionRenderer`、context-aware canonical registry，以及覆盖 26 个稳定 id/alias 的 Element Plus 默认 presenters 与显式 composition helper。
- 真实 canonical lifecycle 已覆盖 `lowerEditorPlan -> resolver -> loader/compiler/app runtime -> CanonicalHalfcodeRenderer -> schemaEditor.Editor -> Scope session -> presenter`。Renderer 只展示 accepted snapshot，不做 optimistic mutation。
- Element Plus kitchen-sink 与 integration test 共享同一 fixture，覆盖 normalized value/item/entry/alternative operations，并证明 pending/rejected/conflict/stale 不推进 DOM，只有 accepted snapshot 推进。
- business dialect demo 进一步证明：同一 schema 可以通过 shared property
  capsule、bounded-context A/B layer 与 editor-instance override 三层代码装配，
  在 sibling Scope 中渲染成不同的真实控件；accepted-only outcome/replay 仍保持
  同一套 canonical lifecycle，不引入隐式 raw/JSON fallback。
- 当前 compiler 的终点是 `EditorPlan`。未知结构、显式 unsupported 或非法 classification 进入 diagnostics；绝无隐式 raw JSON/code fallback。
- Schema Editor 基座只使用 neutral XNL source API 生成 canonical shell，不拥有 XNL mutation。它不包含 Flow/BizProcess/WorkFlow 特例；Workbench consumer 已在 G4 中拥有自己的 Flow schema/presentation/dialect 与 XNL mutation adapter。

## T4.2 Verification Commands

以下命令是当前 business dialect demo 的 owner 验证入口：

```bash
cd dg-cell-mvi
bun run --filter dg-cell-mvi-halfcode-element-plus test
bun run --filter dg-cell-mvi-halfcode-contract test
bun run --filter dg-cell-mvi-halfcode-support test
bun run --filter dg-cell-mvi-halfcode-vue test
```

Schema Editor 相关包当前没有单独的 `build` script。仓库可用的 build 验证是根目录
workspace build：

```bash
cd dg-cell-mvi
bun run build
```

专用 business demo typecheck / canonical tests：

```bash
cd dg-cell-mvi/packages/dg-cell-mvi-halfcode-element-plus
bun x tsc -p tsconfig.business-dialect-demo-test.json --noEmit
bun x tsc -p tsconfig.business-dialect-shared-capsule-test.json --noEmit
bun x vitest run \
  test/schemaEditorBusinessDialectDemo.red.test.ts \
  test/schemaEditorBusinessDialectSharedCapsule.test.ts \
  test/schemaEditorBusinessDialectScopeAssembly.test.ts \
  test/schemaEditorBusinessDialectBoundary.test.ts
```

Strict track validation 仍是：

```bash
cd dg-cell-mvi
codument validate add-schema-editor-business-dialect-demo --strict
```
