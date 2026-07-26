# 设计：Canonical Admin Showcase 与 Legacy 删除

## 1. 执行主链

```text
admin fixture XNL + TS modules
  -> generic Workbench VFS resolver
  -> loadHalfcodeUnitBundle
  -> compileHalfcodeUnitBundle
  -> parent-first Scope assembly
  -> AdminShellPlan route selection
  -> UnitRenderPlan recursive composition
  -> CanonicalComponentRegistry
  -> Vue DOM
```

Workbench 只提供 host、fixture module resolution 和 UI registry，不解释 raw XNL。
`dg-cell-mvi-halfcode-support` 与 Workbench 必须共同声明 `xnl-core >=0.1.9`，确保 browser/Node 解析 qualified material types 与 import/prefab 语义一致。

## 2. Runtime-owned config bindings

`HalfcodeAppRuntime` 在 create 阶段收集 render plans 的 `propsBinding` / `urlInputsBinding`，通过现有 `resolveConfig(ref, context)` 预解析并缓存：

```ts
runtime.resolveConfig(unitFqn, ref): unknown
```

renderer 同步合并：

```text
resolved config props <- inlineProps override
```

通用 unit config resolver 支持 `config://#entry/path.to.value` 和 `/` path，不让 Workbench 复制 Config domain 遍历。

## 3. Unit composition

- `component` node 通过 `fqn` 查找目标 `UnitRenderPlan` 并使用目标 unit 的 Scope runtime 渲染。
- `page-embed` node 通过 `pageFqn` 同样切换到目标 Page plan。
- composition stack 检测递归环并产生明确错误。
- instance inline/config props 作为目标 unit 根部的 host props，不改变目标 unit Scope identity。

## 4. Workbench showcase

一个生产页面包含：

- app tabs：Basic / Embedded / Import / Data Graph。
- route tabs：来自对应 `AdminShellPlanV3.routes`。
- 当前 app 的 canonical render view。
- 加载/装配错误状态；切换 app 时 dispose 前一个 runtime。

Element Plus canonical registry 解析全部 Element Plus exports，并提供 DataTable / StatisticGroup 等 fixture material adapters。`dg.materials.CrudTable` 通过 Unit composition，不由 registry 伪造。

## 5. E2E 验收分工

- basic-admin：DOM 出现用户页、配置化输入和 CrudTable component；真实 Command 调用 mock Effect，返回 Ada row。
- embedded-admin：Home route 递归嵌入 Reports Page，再递归渲染 embedded CrudTable。
- import-admin：Orders Page 与 imported prefab/proto 编译结果可渲染，配置 props 可见。
- data-graph-admin：Users route 显示 seed/filter projection；Dashboard route 显示 Quick Graph extension cards。

测试必须用真实 fixture XNL/TS module glob，不允许 cast fake runtime/plan。

## 6. Legacy 删除边界

删除：

- HalfcodeSchema/HalfcodeStore/reducer/compiler compatibility path。
- Vue `Render`、`RenderWithState`、`createRender`、renderer context/processProps/useHalfcode。
- package `/legacy` exports 和 `dg-cell-mvi-halfcode-web` 旧 renderer registry。
- `DgHalfcodeCrud` 对象 DSL bridge、其 adapter、fixture/demo/test。
- Workbench Tiptap Halfcode object-schema demo、Web legacy demos、CRUD Halfcode demo、legacy preview consumer。

与 Halfcode 无关的 Element Plus/CRUD 基础插件可以保留，但不得再导入 DgHalfcodeCrud 或 legacy renderer。

## 7. 删除门禁

源码与测试中以下符号/路径必须为零（Codument 历史记录除外）：

```text
dg-cell-mvi-halfcode-*/legacy
RenderWithState
createRender
HalfcodeSchema
HalfcodeStore
DgHalfcodeCrud
```

最终运行受影响 package tests/typecheck、Workbench E2E/typecheck/build、fixture corpus 和 `git diff --check`。
