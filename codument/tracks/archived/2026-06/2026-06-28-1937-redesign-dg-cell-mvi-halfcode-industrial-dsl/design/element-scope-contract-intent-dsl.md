# Element / Scope / Contract / Intent 低代码 DSL 设计

## 背景

P9 已经把 asset bundle 从固定 `halfcodeExt/graphExt` 改为 XNL-only domain registry，并拆出了 `app.config.xnl`、`app.state-seed.xnl`、`app.runtime-profile.xnl` 等 runtime 相关文件。但继续审查后发现，当前 `app.halfcode.xnl` 仍更像“物料列表 + CRUD 描述”，没有表达低代码系统最核心的组件树、嵌套作用域和事件处理机制。

本设计修正这一层 DSL：主 DSL 文件应主要表达 Element 树和引用关系；Scope、Contract、state/config/effects/intents 等定义进入独立 XNL domain；frontend 场景中的 Contract 不使用 `input/output` 概念。

## DEPA 约束

- `output = fn(runtime, input, config)` 适用于 runtime processor / adapter / effect handler，不适用于 UI Element Contract。
- runtime 是数据载体，不写业务逻辑；长生命周期依赖、effect 契约、actor 依赖进入 runtime profile 或 runtime bootstrap。
- config 是静态配置；state seed 是启动快照；live state 由 MVI runtime/actor owner 持有，并通过 event/intent/reducer 更新。
- effect 契约与 effect 实现分离；effect 定义不应留在 `app.halfcode.xnl`。
- 主 halfcode DSL 不应成为万能桶；它只表达语义树、复合关系、引用和少量 identity metadata。
- editor/canvas/dev fixture 是低事实等级投影，不参与 runtime compile，不反写 `halfcode-core`。

## 术语修正

`page`、`component`、`capsule` 都是 Element。它们不是和 Element 并列的另一套概念，而是复合 Element。

Element 分两大类：

- 原子 Element：HTML 原始节点、UI 组件库节点、低代码 runtime 提供的基础节点。
- 复合 Element：PageElement、ComponentElement、CapsuleElement 等，可包含 children/slots，并形成树。

Capsule 的语义是作用域边界：它封装一组 runtime/config/state/effects/intents 依赖与可见性。Component 是一种可复用 Capsule。Page 是一种可路由、可独立挂载、也可内嵌到 admin shell 的 Capsule。

一个 Page 或 Component 的实现内部仍然是一棵 Element 树；这棵树中可以嵌套多层 Capsule，形成多层 Scope。

## 主 DSL：只表达树和引用

`app.halfcode.xnl` 应收敛为低代码语义树，而不是运行时配置桶。示例形态：

```xnl
<HalfcodeDocument #basic-admin {
  kind = "HalfcodeDocument"
  apiVersion = "halfcode.dg-cell-mvi/v2"
} (
  <ElementTree { root = "users-page" } [
    <PageElement #users-page {
      route = "/users"
      title = "用户"
      scopeRef = "scopes:users-page"
      contractRef = "contracts:users-page"
    } (
      <Children [
        <h1 #page-title {
          tag = "h1"
          text = "用户管理"
          contractRef = "contracts:static-text"
        }>

        <CapsuleElement #users-filter {
          scopeRef = "scopes:users-filter"
          contractRef = "contracts:users-filter"
        } (
          <Children [
            <ElInput #keyword-input {
              ui = "element-plus:ElInput"
              propsRef = "config:users-filter.keywordInput"
              contractRef = "contracts:keyword-input"
            }>
            <ElSelect #status-select {
              ui = "element-plus:ElSelect"
              propsRef = "config:users-filter.statusSelect"
              contractRef = "contracts:status-select"
            }>
          ]>
        )>

        <ComponentElement #users-table {
          componentRef = "components:CrudTable"
          scopeRef = "scopes:users-table"
          contractRef = "contracts:users-table"
        }>
      ]>
    )>
  ]>
)>
```

规则：

- `HalfcodeDocument` 必须有且只有一个 `ElementTree` root。
- `PageElement`、`ComponentElement`、`CapsuleElement` 和原子节点都属于 Element 族；原子节点在 XNL 中直接使用自身标签名，如 `<h1>`、`<ElInput>`，不要再包一层 `<AtomicElement>`。
- 节点 `#id` 是唯一标识；节点属性中不重复写 `id = "..."`。
- `Children` 表达默认 children；命名插槽使用 `Slots`。
- Element 可引用 `scopeRef`、`contractRef`、`propsRef` 等外部 XNL domain 条目，但不内联 runtime/effect/state 定义。
- UI 库 adapter 信息属于 material registry 或 render adapter profile；主 DSL 可写稳定的 `ui` id，但不保存 Vue constructor、函数 hook 或 direct fetch。

## Scope：作用域边界

Scope 表达 Capsule/Page/Component 的封装边界。Scope 不写逻辑，只引用外部 domain：

```xnl
<Scopes (
  <Scope #users-page {
    runtimeProfileRef = "runtime:browser-local"
    configRef = "config:users-page"
    configDefRef = "config-def:users-page"
    stateSeedRef = "state-seed:users-page"
    stateDefRef = "state-def:users-page"
    effectsRef = "effects:users-page"
    effectsDefRef = "effects-def:users-page"
    intentsRef = "intents:users-page"
    intentsDefRef = "intents-def:users-page"
  }>

  <Scope #users-filter {
    parentRef = "scopes:users-page"
    configRef = "config:users-filter"
    stateSeedRef = "state-seed:users-filter"
    intentsRef = "intents:users-filter"
  }>
)>
```

推荐文件拆分：

- `app.scopes.xnl`：Scope registry。
- `app.config.xnl` / `app.config-def.xnl`：静态配置与配置定义。
- `app.state-seed.xnl` / `app.state-def.xnl`：启动状态快照与状态定义。
- `app.runtime-profile.xnl`：runtime profile、ports、外部 adapter 脚本引用。
- `app.effects.xnl` / `app.effects-def.xnl`：effect 契约引用和定义。
- `app.intents.xnl` / `app.intents-def.xnl`：intent registry 与定义。
- `app.contracts.xnl` / `app.contracts-def.xnl`：Element Contract registry 与定义。

`app.halfcode.xnl` 只保存这些 ref，不保存这些 domain 的具体内容。

## Contract：前端元素契约

frontend halfcode 的 Contract 不应包含 `input` / `output`。`input/output` 是 DEPA processor 三参数流程中的数据血缘概念，用在 adapter / processor / effect handler 上；UI Element Contract 应描述组件边界能力：

```xnl
<ElementContracts (
  <ElementContract #users-table {
    propsDefRef = "contracts-def:users-table.props"
    slotsDefRef = "contracts-def:users-table.slots"
    acceptsRef = "intents:users-table.accepts"
    emitsRef = "intents:users-table.emits"
    exposesRef = "contracts-def:users-table.exposes"
  }>
)>
```

Contract 的字段含义：

- `propsDefRef`：可传入属性定义。
- `slotsDefRef`：children / named slots 的结构定义。
- `acceptsRef`：本 Element 可接收并尝试消费的 intent。
- `emitsRef`：本 Element 可产生的 intent。
- `exposesRef`：对父层或 editor 暴露的可调用能力、引用或测量信息。

Contract 不直接写 effect handler，不写 runtime adapter，不保存 `output = fn(...)` 的 processor 签名。

## Intent 与冒泡

所有 Element 都具备接收 intent 的能力。处理流程：

1. intent 从触发 Element 开始进入当前 Element 的 intent handler。
2. 当前 Element 若能消费，则将其编译为 MVI command/event/effect request，或触发 scope 内的 reducer/effect。
3. 当前 Element 若不能消费，则按 Element tree 向父 Element 冒泡。
4. 冒泡到 Capsule/Page 边界时，Scope 可以决定消费、转换、继续上抛或拒绝。
5. 未被消费的 intent 必须形成 diagnostics，不能静默丢弃。

示例：

```xnl
<Intents (
  <Intent #search-users {
    type = "users.search"
    payloadDefRef = "intents-def:users.search.payload"
  }>

  <IntentPolicy #users-filter-policy {
    default = "bubble"
  } (
    <OnIntent intentRef="intents:search-users" action="consume" handlerRef="effects:users.search">
    <OnIntent intentRef="intents:reset-filter" action="consume" eventRef="events:users.filter.reset">
  )>
)>
```

编译规则：

- `OnIntent` 不执行逻辑，只形成 typed intent binding plan。
- effect handler 属于 effects/runtime domain；主 DSL 和 Contract 只引用。
- intent handler 的 processor/adapters 才使用 `run(runtime, input, config) -> output`。

## Bundle domain registry

`bundle.xnl` 需要显式登记这些 domain，禁止恢复固定 `halfcodeExt/graphExt` 万能扩展桶：

```xnl
<HalfcodeBundle #basic-admin {
  entry = "vfs://./app.halfcode.xnl"
} (
  <Ports scope="bundle" [
    <MaterialBundle role="input" name="core" domain="halfcode-core" path="vfs://./app.halfcode.xnl">
    <MaterialBundle role="input" name="scopes" domain="halfcode-scopes" path="vfs://./app.scopes.xnl">
    <MaterialBundle role="input" name="contracts" domain="halfcode-contracts" path="vfs://./app.contracts.xnl">
    <MaterialBundle role="input" name="contracts-def" domain="halfcode-contract-defs" path="vfs://./app.contracts-def.xnl">
    <MaterialBundle role="input" name="config" domain="runtime-config" path="vfs://./app.config.xnl">
    <MaterialBundle role="input" name="config-def" domain="runtime-config-def" path="vfs://./app.config-def.xnl">
    <MaterialBundle role="input" name="state-seed" domain="runtime-state-seed" path="vfs://./app.state-seed.xnl">
    <MaterialBundle role="input" name="state-def" domain="runtime-state-def" path="vfs://./app.state-def.xnl">
    <MaterialBundle role="input" name="runtime-profile" domain="runtime-profile" path="vfs://./app.runtime-profile.xnl">
    <MaterialBundle role="input" name="effects" domain="runtime-effects" path="vfs://./app.effects.xnl">
    <MaterialBundle role="input" name="effects-def" domain="runtime-effects-def" path="vfs://./app.effects-def.xnl">
    <MaterialBundle role="input" name="intents" domain="halfcode-intents" path="vfs://./app.intents.xnl">
    <MaterialBundle role="input" name="intents-def" domain="halfcode-intent-defs" path="vfs://./app.intents-def.xnl">
    <MaterialBundle role="input" name="workspace" domain="editor-workspace" path="vfs://./editor.workspace.xnl">
  ]>
)>
```

## 与 flow editor / pipeline debug 思想的关系

此前参考 `flow-editor-mvi.html` / `pipeline-debug.html` 的重点不是照搬 `graphExt` 文件名，而是采用“核心语义 DSL 与编辑器专用投影分离”的思想：

- `halfcode-core`：运行时语义真源，包含 Element tree 和引用。
- `runtime-*` / `halfcode-scopes` / `halfcode-contracts` / `halfcode-intents`：运行时或编译必需的显式 domain。
- `editor-workspace` / `editor-canvas`：编辑器视图状态、画布坐标、选中态、折叠态、panel 状态等，属于投影。
- `dev-fixture`：测试数据和 demo mock，不参与生产 runtime 默认加载。

这保持了“核心 DSL 可独立运行，扩展 DSL 可被编辑器消费但不反写核心”的分离。

## 验收标准

- `app.halfcode.xnl` 不再包含 `effects`、HTTP method/path、resource request 实现、editor workspace 或 dev fixture。
- 低代码 fixtures 至少包含一个 Page + nested Capsule + Component + 原子节点的 Element tree；原子节点必须用真实标签名表达。
- Scope/Contract/Intents/Effects/Config/State seed 均为独立 XNL domain，并由 `bundle.xnl` 通过 MaterialBundle 注册。
- Contract 类型和 fixtures 中不出现 frontend `input` / `output` 字段。
- intent bubbling 至少有 compiler/loader 层结构测试，覆盖 consume、bubble、unhandled diagnostics。
- bundle loader 保持 XNL-only，不引入 JSON/XML 配置入口。
