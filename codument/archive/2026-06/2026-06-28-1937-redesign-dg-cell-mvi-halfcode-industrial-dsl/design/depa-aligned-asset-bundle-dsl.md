# DEPA 对齐后的 Halfcode Asset Bundle DSL 设计

## 背景

P8 已实现 XNL-only bundle/folder loader，但当时的文件分域仍停留在“core + halfcodeExt + graphExt”三文件形态。后续讨论确认：这种设计只是机械借用了 `flow-editor-mvi` / `pipeline-debug` 的文件形态，没有严格落实 DEPA 的事实源边界、runtime 三参数归位和 adapter 处理器语义。

本设计作为 P9 的目标态，修正 P8 的 DSL 口径。

## DEPA 不变量

- 核心逻辑统一表达为 `output = fn(runtime, input, config)`。
- runtime 是数据载体：长生命周期依赖、effect 契约、actor 依赖进入 runtime；runtime 不写业务方法。
- input 是单次 payload；config 是静态枚举/开关。
- adapter 是 Processor，是显式数据转换处理器，不是万能上下文函数，也不是 service locator。
- editor/canvas/dev fixture 等低事实等级投影不参与 runtime compile，不反写 canonical core。
- state seed 只作为启动 seed；live state 由 MVI runtime/actor owner 持有并通过事件更新。

## 文件域划分

推荐 bundle 结构：

```text
app/
  bundle.xnl
  app.halfcode.xnl
  app.config.xnl
  app.state-seed.xnl
  app.runtime-profile.xnl
  editor.workspace.xnl
  editor.canvas.xnl
  dev.fixtures.xnl
  resources/
    crud-prefabs.xnl
  adapters/
    inner-input.ts
    resource-core.ts
    outer-output.ts
  schemas/
    app-config.xnl
    app-state-seed.xnl
```

各域含义：

| 文件 | domain | 消费者 | 事实源边界 |
|---|---|---|---|
| `app.halfcode.xnl` | `halfcode-core` | compiler/runtime projection | canonical runtime core，生成 admin/crud/render plans |
| `app.config.xnl` | `runtime-config` | runtime bootstrap | 静态应用配置，不是状态 |
| `app.state-seed.xnl` | `runtime-state-seed` | runtime bootstrap | 启动 seed，只读初值，不是 live state |
| `app.runtime-profile.xnl` | `runtime-profile` | runtime bootstrap / effect wiring | runtime ports 与 processing profile |
| `editor.workspace.xnl` | `editor-workspace` | halfcode editor | inspector、panel、collapse、draft 等 editor-only 数据 |
| `editor.canvas.xnl` | `editor-canvas` | visual canvas editor | positions、viewport、edge routing、pin order；没有 canvas editor 时不需要 |
| `dev.fixtures.xnl` | `dev-fixture` | test/e2e/demo harness | mock records、debug scenario，不被生产 runtime 默认消费 |
| `resources/*.xnl` | domain-specific resource | xnl import/loader | prefab/resource/schema 等可导入物料 |

`app.graphExt.xnl` 不再作为固定域。只有当存在真正的可视化画布编辑器时，才允许使用语义明确的 `editor.canvas.xnl`。

`app.halfcodeExt.xnl` 不再作为泛化扩展桶。其现有内容应拆到 `editor.workspace.xnl`、`editor.canvas.xnl`、`dev.fixtures.xnl` 或明确 runtime 文件。

## Bundle manifest

`bundle.xnl` 不再使用固定字段 `halfcodeExt` / `graphExt`。它应成为 domain/role registry：

```xnl
<HalfcodeBundle #basic-admin {
  entry = "vfs://./app.halfcode.xnl"
} (
  <Ports scope="bundle" [
    <MaterialBundle role="input" name="core" domain="halfcode-core" path="vfs://./app.halfcode.xnl">
    <MaterialBundle role="input" name="config" domain="runtime-config" path="vfs://./app.config.xnl">
    <MaterialBundle role="input" name="state-seed" domain="runtime-state-seed" path="vfs://./app.state-seed.xnl">
    <MaterialBundle role="input" name="profile" domain="runtime-profile" path="vfs://./app.runtime-profile.xnl">
    <MaterialBundle role="input" name="workspace" domain="editor-workspace" path="vfs://./editor.workspace.xnl">
    <MaterialBundle role="input" name="fixtures" domain="dev-fixture" path="vfs://./dev.fixtures.xnl">
  ]>
)>
```

规则：

- `halfcode-core` 必须且只能有一个。
- `runtime-config`、`runtime-state-seed`、`runtime-profile` 推荐成组存在；允许按场景缺省，但不得合并为一个 `runtime` 杂项域。
- `editor-workspace`、`editor-canvas`、`dev-fixture` 均为可选域。
- 所有 bundle 配置与 domain 文件必须是 XNL；不得新增 JSON/XML 配置入口。
- `vfs://@/`、`vfs://./`、`vfs://../` 继续沿用 xnl-core import/path 规范。

## RuntimeProfile

`app.runtime-profile.xnl` 描述 runtime wiring / processing profile，不是 service locator。

示例：

```xnl
<RuntimeProfile #local-mock {
  mode = "mock"
  target = "browser"
} (
  <Ports scope="runtime" [
    <Port name="config" type="vfs://./schemas/app-config.xnl" seed="vfs://./app.config.xnl">
    <Port name="stateSeed" type="vfs://./schemas/app-state-seed.xnl" seed="vfs://./app.state-seed.xnl">
    <Port name="resource" type="vfs://./schemas/resource-request.xnl">
  ]>

  <Processing [
    <Adapter #outer-derived stage="outer_derived" lang="typescript" src="vfs://./adapters/outer-derived.ts" entry="run">
    <Adapter #inner-runtime stage="inner_runtime" lang="typescript" src="vfs://./adapters/inner-runtime.ts" entry="run">
    <Adapter #inner-input stage="inner_input" lang="typescript" src="vfs://./adapters/inner-input.ts" entry="run">
    <Adapter #inner-config stage="inner_config" lang="typescript" src="vfs://./adapters/inner-config.ts" entry="run">
    <Adapter #resource-core stage="core_logic" lang="typescript" src="vfs://./adapters/resource-core.ts" entry="run">
    <Adapter #outer-output stage="output" lang="typescript" src="vfs://./adapters/outer-output.ts" entry="run">
  ]>
)>
```

Adapter 规则：

- 只允许 `src` 引用外部脚本文件或目录；不保留内联 `Body` / CDATA adapter。
- `src` 必须使用 `vfs://@/`、`vfs://./`、`vfs://../`。
- `entry` 可选；文件默认 `run`，目录默认 `main:run`。
- Adapter 脚本统一收敛到 `run(runtime, input, config) -> output`。
- Adapter 不声明数据类型；类型属于 `Port`。
- 不需要转换的阶段必须用显式 identity/null adapter 或内建标准 adapter 表达，不能压扁阶段概念。
- bundle loader 只解析和校验 adapter 引用，不执行脚本；执行属于 runtime/effect layer。

## Loader 结果

P9 后 loader 不应返回固定的 `halfcodeExt` / `graphExt`：

```ts
{
  manifest,
  core,
  document,
  domains: {
    "runtime-config": ...,
    "runtime-state-seed": ...,
    "runtime-profile": ...,
    "editor-workspace": ...,
    "editor-canvas": ...,
    "dev-fixture": ...
  }
}
```

`compileHalfcode` 只消费 `halfcode-core`。runtime bootstrap 才消费 runtime domains。editor 消费 editor domains。E2E/demo harness 可消费 `dev-fixture`。

## 验收要求

- P8 fixtures 迁移到新结构，不再依赖 `app.halfcodeExt.xnl` / `app.graphExt.xnl` 固定字段。
- 新 bundle E2E 验证 core 编译 admin shell + CRUD plans。
- 新 E2E 验证 runtime/config/state/profile/editor/dev domains 可加载且不参与 compiler。
- 新 E2E 验证 adapter src 可解析但不会在 bundle load 阶段执行。
- fixture 目录仍不得出现 JSON/XML 配置文件。
