# 节点体系

> L3 规范。上层依据：M-S1/M-S2（段形态）、M-S3（tag 分档）、L2 F-1~F-6（前端模型）。冲突时以上层公理为准。

XNL 节点完整形态：`<Tag #id { 属性 } ( 单一区段 ) [ 列表段 ]>`。

## 0. 段语义（元设计规则，先读）

一个节点有三种段，语义固定，按**基数**选段：

| 段 | 承载 | 何时用 |
|---|---|---|
| `{ ... }` | 属性（键值对） | 本节点的标量/内联数据 |
| `( ... )` | 每种唯一的子域概念 | 一个 Scope、一个 PageContract、一组 Accepts |
| `[ ... ]` | 直接/可重复子节点 | 多个 Route、多个元素 |

三段可共存：`<node { … } ( … ) [ … ]>`。选段只看一件事——**这类子节点会不会重复出现**：会重复 → `[]`；每类只应有一个 → `()`。这条规则消除所有"该用哪个括号"的歧义。

**节点二相（M-N7，贯穿全文）**：本规范里**任何**节点都有两种可互换写法——**内联定义**（属性/子节点写在原地）或 **`ref` 引用**（空壳 + `ref` 采用别处同类定义）。类别永远由 **tag** 表达，引用属性名永远是 **`ref`**（不是 `scopeRef`/`commandRef`），也**不套** `<XxxRef>` 包装节点。下文各节的 `<Scope ref="…">`、`<Command ref="…">` 都是这条规则的实例。`ref` 值两形态：同域按名 `ref="users-page"`，跨域按 URI `ref="scope://#users-page"`。

## 1. tag 决定解析域

| tag 形态 | 含义 | 解析 |
|---|---|---|
| 小写裸 tag（`h1`、`div`、`span`） | HTML 原生原子元素 | 不查注册表 |
| PascalCase 保留字（§9 枚举） | DSL 结构节点 | codec 白名单 |
| 点分 FQN（`dg.materials.CrudTable`、`elementPlus.ElInput`） | 实例化引用 | 单元注册表（Page/Component 实例）或 UI 库 registry（原子渲染件） |

`#id` 语义按位置定：**单元根上是 FQN**（全局唯一身份）；**其他一切节点上是局部 id**（所在域内唯一）。

## 2. 容器根节点（三种）

### AppBundle（组合根，自身无 UI）

```xnl
<AppBundle #dg.admin.basic apiVersion="halfcode.dg-cell-mvi/v1" version="2.0.0" {
  name = "基础 Admin Bundle"
  settings = { layout = "side" }
} (
  <Units [
    <Unit kind="page" fqn="dg.admin.basic.UsersPage" src="vfs://./pages/users/manifest.xnl">
    <Unit kind="component" fqn="dg.materials.StatusBadge" src="vfs://./components/status-badge.xnl">
    <Unit kind="document" fqn="dg.docs.SystemDesign" src="vfs://./documents/system-design.xnl">
  ]>
)>
```

- `apiVersion`/`version` 是**系统级元数据 → 元数据位**（tag/`#id` 之后、`{ }` 之前，M-S1）；产品身份（name/settings）内联在 `{ }` 业务属性上（M-N8 数据自持），不设独立 product 域。
- `apiVersion="halfcode.dg-cell-mvi/v1"` 表示 **AppBundle 词汇 API**；AppBundle 是唯一 canonical bundle 根。
- 启用哪些域由**内容发现**（多文件按各 `<域名>.xnl` 根 tag，单文件按 `( )` 内联区段，M-N1/M-N6）；App 无元素树，无 `[...]` 段。
- `( <Units [...]> )`：Units 是单一区段 → `()`；其内 Unit 是列表 → `[]`。`kind` 声明意图，`fqn` 是注册表身份，`src` 指向目标 manifest 或单文件单元；**kind 真源是目标根节点 tag**，不符报 `HALFCODE_UNIT_KIND_MISMATCH`。
- 单文件 App：`(...)` 内并列内联各域区段（`<Routes>`、`<Wiring>`、`<Config>`…）+ `<Units>`，与域文件根节点同型（M-N6）。

### Page / Component / Document 的**定义**（单元根）

> 这里是单元的**定义**（`<Page>` / `<Component>` 根节点，声明一个 FQN 单元长什么样）。单元的**使用**是另一回事——在别的元素树里用 FQN tag 实例化（`<dg.materials.CrudTable #t>`，见 §3）。定义一次、使用多次。

多文件形态（薄清单，无内联域）：

```xnl
<Page #dg.admin.basic.UsersPage version="1.0.0" {
  title = "用户"                      # 默认 title，Route 可覆盖
}>
```

单文件形态（域内联为 `()` 区段，元素树为 `[]` 段）：

```xnl
<Component #dg.materials.StatusBadge version="1.0.0" (
  <Contracts ( <ComponentContract #dg.materials.StatusBadge ( <Props { status = "string" }> )> )>
  <Events [ <Event #badge.clicked> ]>
  <Config [ <ConfigEntry #badge { statusClass = { info = "badge-info" } }> ]>
) [
  <span #badge { class = "config://#badge/statusClass" }>
]>
```

同一个根 tag（`Page`/`Component`）覆盖单/多文件两形态；靠**内容**区分（M-N1）：有内联域区段 = 单文件；无内联域 = 多文件薄清单（域按目录中各 `<域名>.xnl` 的根 tag 发现）。manifest 是薄清单：FQN + version（元数据位）+ 默认 title。**没有** route/mount/props——路由归 App，输入契约归 contracts。

`Document` 是同级具名 Unit，但它的边界是 source/revision type/mode/parameters。
Document 根 `[]` 是 ordered Domain XNL source，不是 Page/Component `elements`
域；外部 source 用唯一 `DocumentSource.ref`。Document 的完整规则见
[Document Unit](document.md)。

## 3. 元素树节点（elements 域）

元素树 = `[...]` 列表段。**scope 随元素树自然形成层级**（见 §5）：能承载 scope 的节点（Elements 根、Capsule）在 `(...)` 里放**一个** `<Scope>`，在 `[...]` 里放子元素。

```xnl
<Elements #users-page-elements (
  <Scope ref="users-page">                 # 本单元根 scope（单一 → ()）
) [
  <h1 #users-title { text = "用户管理" }>

  <Capsule #users-filter (                       # 内联封装原语，只出现在树里
    <Scope ref="users-filter">             # 子 scope，沿树自然嵌套（无 parentRef）
  ) [
    <elementPlus.ElInput #keyword-input { props = "config://#users-filter/keywordInput" }>
  ]>

  <dg.materials.CrudTable #users-table {         # component 实例：FQN tag
    entity = "users"  pageSize = 20              # 内联字面量 props（静态可序列化值）
    props = "config://#users-table"              # 绑定/批量 props 走 URI
  } (
    <Slot #toolbar [ <dg.materials.StatusBadge #badge { status = "info" }> ]>
  )>

  <dg.admin.basic.ReportDetailPage #report-embed {   # 嵌入 page 实例：合成 URL 输入
    urlInputs = "config://#report-embed/url"
  }>
]>
```

规则：
- 实例节点允许**内联字面量 props**；绑定/计算走 URI 值；**禁止内联函数**（M-D3）。
- 元素契约**按 id 隐式关联**（M-N7 第三种手法）：契约域里的 `<ElementContract #users-filter>` 自动作用于树中 `#users-filter` 元素，连 `ref` 都不必写。组件/页面实例的契约来自其 FQN 定义（→ ComponentContract/PageContract），也无需在使用处声明。
- **scope 只出现在 Capsule 与 Elements 根**（内联封装边界）；component/page 实例自带 scope（定义在单元内部），使用处不再挂 scope，只传 props。
- 单个具名 slot 直写 `( <Slot #name [...]> )`；多个具名 slot 用 `( <Slots [ <Slot #a [...]> <Slot #b [...]> ]> )`（`()` 按 tag 去重，直写多个 `<Slot>` 会互相覆盖 → 用 `<Slots>` 列表容器）。

## 4. 契约节点（contracts 域）

一个单元有**一个**公共契约（`()`）+ **若干**内部元素契约（`[]`），共存：

```xnl
<Contracts #users-page-contracts (
  <PageContract #dg.admin.basic.UsersPage {
    urlInputs = { query = { keyword = "string?" } }   # path/query/hash 变量类型
  } (
    <Accepts [ <Command ref="command://#users.refresh"> ]>
    <Sends   [ <Event ref="event://#users.selected"> ]>
  )>
) [
  <ElementContract #users-filter (                    # 按 id 关联树中 #users-filter
      <Requires {
        commands = [ "command://#users.search" ]
        config  = [ "config://#users-filter" ]
        effects = [ "scope-effect://#users.query" ]
      }>
    <Sends [ <Command ref="command://#users.search"> ]>
  )>
]>
```

- `( <PageContract> )`：公共契约单一 → `()`。`[ <ElementContract> … ]`：内部元素契约成列 → `[]`。
- Accepts/Sends 里用 **`<Command ref="…">`** 或 **`<Event ref="…">`** 引用消息定义（M-N7：tag 表类别、`ref` 表引用，不套 `<MessageRef>` 包装）。
- **PageContract**：`urlInputs` + Accepts/Sends（各单一 → `()`；其内消息 ref 成列 → `[]`）。无 props/slots/exposes（Page 不开 props）。
- **ComponentContract**：`( <Props {…}> <Slots [SlotDef]> <Accepts […]> <Sends […]> <Exposes {…}> )`。
- **ElementContract**：`( <Requires {…}> <Accepts […]> <Sends […]> )`；Requires 是对宿主 scope 链的期望，编译期沿链核验。
- 类型描述用字符串：`"string"`、`"number?"`（`?`=可选）、`"string[]"`。
- 红线：frontend 契约禁止 `input`/`output` 字段（那是 adapter 的四边界词汇，见 M-D3 与 F-6）。

Contracts 三档写法：

| 层级 | 适用场景 | 写法 |
|---|---|---|
| Quick | 内部页面、demo | 只写公共 `PageContract` / `ComponentContract`，少量或不写 `ElementContract` |
| Compact | 普通业务默认 | 公共契约 + 关键元素 `Requires/Sends` |
| Split/Public | 可复用组件/页面协议 | `contracts.def` + 完整 Props/Slots/Accepts/Sends/Requires/Exposes |

## 5. 作用域节点（scopes 域）

Scope 是作用域边界的**域绑定集与实现装配点**：声明该边界使用哪个 runtime instance、拥有哪些 config/commands/events，并在 `()` 中内联 effect bindings、data graph bindings 与必要的 MessagePolicy。**scope 层级不靠 parentRef，而是随元素树的 Elements/Capsule 嵌套自然形成**——树里外层 Capsule 的 scope 是内层的父。Component/Page 实例使用处不挂 scope；目标单元在自己的 Elements 根声明其 root scope。

字段用**裸名**（不带 `Ref` 后缀），值是 `<scheme>://` URI。`runtime` 字段绑定代码实现的 RuntimeInstance；Scope 内其它 bindings 会作为 assembly input 交给 runtime object：

```xnl
<Scopes #users-page-scopes [
  <Scope #users-page {
    runtime   = "runtime://#users-page"
    config    = "config://#users-page"
    commands  = "command://#users-page-commands"
    events    = "event://#users-page-events"
  } (
    <EffectBindings {
      impls = "vfs://./effects/mock-admin.effect-impls.ts#adminEffectImpls"
    }>
    <DataGraphBindings [
      <GraphMount #users-list {
        module = "data-graph://#users.list"
        seed = "data-graph-seed://#users-list-demo"
        impls = "vfs://./graph-code/users.graph.impl.ts#usersGraphImpls"
      }>
    ]>
    <MessagePolicy #boundary { default = "bubble" } [
      <MessageRule message="command://#users.search" action="consume">
    ]>
  )>
  <Scope #users-filter { config = "config://#users-filter" }>
]>
```

两种用法（元素树里，这正是 M-N7 的节点二相）：
- **`ref` 引用**（复用预定义 scope）：`<Scope ref="users-page">` 采用同域预定义的 `<Scope #users-page>`；跨域用 URI 形态 `<Scope ref="scope://#users-page">`。
- **直接内联**（一次性）：把 `config=…` 等属性与 `<EffectBindings>` 直接写进元素树的 `<Scope>` 里，不进 scopes 域。

`<Scopes [ … ]>`：预定义 scope 成列 → `[]`。scope 之间**没有** parentRef——谁是谁的父由元素树位置决定。

## 6. 路由与接线节点（routes / wiring 域，App 专属）

```xnl
<Routes #basic-admin-routes [
  <Route #users-route {
    path = "/users"
    page = "page://dg.admin.basic.UsersPage"
    menu = { icon = "user" order = 1 }              # app 视角元数据内联（M-N8）
    permission = "config://#permissions/users"
    title = "用户管理（运营）"                        # 覆盖 page 默认 title
  } [
    <Route #user-detail-route { path = ":id" page = "page://dg.admin.basic.UserDetailPage" }>
  ]>
]>
```

```xnl
<Wiring #basic-admin-wiring [
  <Wire from="route://#reports-route" message="event://#report.saved"
        to="route://#home-route">
]>
```

- `[ <Route> ]`/`Route [ <Route> ]`：路由/子路由成列 → `[]`。
- Route path 模式必须满足目标 page 的 `urlInputs.path` 变量（`/users/:id` ↔ `path = { id = "string" }`）。
- Wire 寻址 **route 实例**（`route://#id` 优先），不寻址 page 定义——同一 page 可挂多路由。
- 跨页通信类 postMessage：app 投递，page 互不引用。Wire 保持 `message` URI 身份，不做转换；未接线 Sends message → `HALFCODE_MESSAGE_UNWIRED` 警告。

## 7. Effect 与 Scope 绑定

Effect 的完整规范见 `spec/effect/`。Frontend 只承认三件事：

- Quick 场景可在 Scope 中直接绑定 `impl`。
- type 与实现都归实际 binding 节点；实现绑定内联在 Scope 的 `<EffectBindings>` 中。

```xnl
<Scope #users-page { config = "config://#users-page" } (
  <EffectBindings [
    <FuncEffect #users.query {
      type = "vfs://./effects/users.effects.ts#UsersQueryEffect"
      impl = "vfs://./effects/mock-admin.effects.ts#queryUsers"
    }>
  ]>
)>
```

XNL 不描述 HTTP、CRUD、request/response schema 或 success/failure event。实现函数必须遵守 DEPA：`output = fn(runtime, input, config)`。

## 7.1 Data Graph 类型与 Scope 绑定

Data Graph 的完整规范见 `spec/data-graph/`。Frontend 只承认三件事：

- GraphModule 在 `data.graph` 域；`data.graph.seed` 仅在需要启动覆盖时启用。
- runtime graph object、module mount、node impl bundle 绑定内联在 Scope 的 `<DataGraphBindings>` 中。
- Command handler 若要写 graph，直接指向代码入口；handler 代码通过 runtime/scope 能力访问 graph。
- Quick 模式用 `<GraphExtension src="vfs://...#install">`，仍由 Scope 显式装配。

```xnl
<DataGraph #users-data-graphs [
  <GraphModule #users.list (
    <Slots (
      <Inputs [ <GraphSlot #query> ]>
      <State [ <SignalNode #rows { initial = [] }> ]>
      <Outputs [
        <ComputedNode #filteredRows { deps = ["state.rows" "inputs.query"] }>
      ]>
    )>
  )>
]>
```

```xnl
<Scope #users-page (
  <DataGraphBindings [
    <GraphMount #users-list {
      module = "data-graph://#users.list"
      impls = "vfs://./graph-code/users.graph.impl.ts#usersGraphImpls"
    }>
  ]>
)>
```

## 7.2 Runtime instance 与 Scope 绑定

Runtime 的完整规范见 `spec/runtime/`，前端装配说明见 `spec/frontend/runtime/`。Frontend 只承认三件事：

- `runtime.xnl` 中的 `<RuntimeInstance>` 指向代码对象、工厂或 prototype 派生入口。
- Scope 用 `runtime = "runtime://#..."` 绑定当前动态代码收到的 runtime object。
- Scope 内的 `EffectBindings`、`DataGraphBindings`、`MessagePolicy`、`commands`、`events`、`config` 等 sibling bindings 会作为装配输入交给 runtime object；XNL 不描述 runtime 的字段、继承、覆盖或消息路由。

```xnl
<Runtime #users-runtime [
  <RuntimeInstance #admin-root {
    create = "vfs://./runtime/admin.runtime.ts#createAdminRuntime"
  }>
  <RuntimeInstance #users-page {
    prototype = "runtime://#admin-root"
    derive = "vfs://./runtime/admin.runtime.ts#deriveAdminRuntime"
  }>
]>
```

```xnl
<Scope #users-page {
  runtime = "runtime://#users-page"
  config = "config://#users-page"
} (
  <EffectBindings {
    impls = "vfs://./effects/mock-admin.effect-impls.ts#adminEffectImpls"
  }>
)>
```

动态代码使用强类型 runtime：

```ts
export async function searchUsers(runtime: AdminRuntime, input, config) {
  return runtime.callEffect('users.query', input, config);
}
```

Runtime 三档写法：

| 层级 | 适用场景 | 写法 |
|---|---|---|
| Quick | demo、类型要求低 | Scope `runtime` 直接指向 `vfs://...#runtimeObject` |
| Compact | 普通业务默认 | `runtime.xnl` 定义 `RuntimeInstance`，Scope 绑定 `runtime://#...` |
| Split/Public | 强类型、复用、复杂对象系统 | 代码定义 interface/class/generic；XNL 只写 `src/create/prototype/derive` |

## 8. Command / Event / Message 节点

`Command` 表示面向未来的请求；`Event` 表示已经发生的事实。两者的 `#id` 就是协议身份，**不再写重复的 `type`**。`Message` 只是在 policy、contract 与 wiring 中对二者的抽象统称，不存在 `<Message>` 定义节点。

```xnl
<Commands #users-page-commands [
  <Command #counter.increment {
    handler = "vfs://./graph-code/counter.command-handlers.ts#incrementCounter"
    config = "config://#counter-actions"
  }>
  <Command #users.search {
    payloadDef = "command-def://#users.search"
    handler = "vfs://./command-handlers/users.command-handlers.ts#searchUsers"
  }>
]>

<Events #users-page-events [
  <Event #users.selected>
]>
```

`Command.handler` 是普通业务最短的半代码绑定：它直接指向 `output = fn(runtime, input, config)` 的代码入口。若要修改 data graph，handler 代码经 runtime/scope 能力读取 graph 并调用 `graph.set/batch`。`Event` 不能有 `handler`、`config` 或 `type` 字段；对 Event 的反应属于接收方 runtime 代码。

`MessagePolicy` 不属于 Commands/Events 域，而是挂在 `Scope` 的 `()` 装配区。它只描述边界传播策略；默认传播足够时不应声明它：

```xnl
<Scope #users-table { config = "config://#users-table" } (
  <MessagePolicy #boundary { default = "bubble" } [
    <MessageRule message="command://#users.search" action="consume">
    <MessageRule message="command://#danger.delete" action="reject">
  ]>
)>
```

`MessageRule` 只允许 `message` 与 `action`，不允许 `handler` / `impl` / `effect` / `config`。MVP `action` 取值：`consume | bubble | reject`。未来如需转换职责，可在本节点族扩展；当前 `<Wire>` 只做 identity-preserving delivery。

Message 三档写法：

| 层级 | 适用场景 | 写法 |
|---|---|---|
| Quick | 局部、无需代码入口的事实 | `<Event #x>` |
| Compact | 普通业务默认 | `<Command #x { handler = "vfs://...#fn" }>`，可带 config |
| Split/Public | 公共协议和跨页边界 | `commands.def` / `events.def` + contracts `Accepts`/`Sends` + 必要时 Scope `MessagePolicy` |

## 8.1 Config 三档写法

```xnl
<Config #users-page-config [
  <ConfigEntry #users-table {
    rowKey = "id"
    pageSize = 20
  }>
]>
```

| 层级 | 适用场景 | 写法 |
|---|---|---|
| Quick | 局部静态值 | 元素/节点属性中直接写字面量 |
| Compact | 普通业务默认 | `config.xnl` 中集中 `ConfigEntry`，元素用 `config://#...` 引用 |
| Split/Public | 公共组件、可校验配置 | `config.def.xnl` + `config.xnl`，必要时按环境覆盖 |

Config 仍是纯静态数据：不放函数、effect 实现、graph 对象或 runtime object。

## 8.2 Frontend Composition 三档写法

| 层级 | 适用场景 | 写法 |
|---|---|---|
| Quick | 小页面、局部 UI | raw elements + inline `Capsule` |
| Compact | 普通业务默认 | 抽出本 app 内 Page/Component 单元，使用 FQN tag 组合 |
| Split/Public | 跨 app/package 复用 | 公共 Component/Page 包 + 完整 contract + slots/exposes/version/FQN |

## 9. 保留字清单

结构词（codec 白名单）：`AppBundle` `Page` `Component` `Document` `Units` `Unit` `Elements` `Capsule` `Slot` `Slots` `Contracts` `PageContract` `ComponentContract` `DocumentContract` `DocumentSource` `DocumentPresentation` `ElementContract` `Props` `Exposes` `Accepts` `Sends` `Requires` `SlotDef` `Scopes` `Scope` `MessagePolicy` `MessageRule` `Commands` `Command` `CommandsDef` `CommandDef` `Events` `Event` `EventsDef` `EventDef` `EffectBindings` `FuncEffect` `InterfaceEffect` `DataGraphBindings` `GraphObject` `GraphMount` `NodeBindings` `ComputedBinding` `ProcessorBinding` `AsyncBinding` `ConsumerBinding` `GraphExtension` `DataGraph` `GraphModule` `Inputs` `State` `Outputs` `Internals` `GraphSlot` `GraphNodes` `SignalNode` `ComputedNode` `ProcessorNode` `AsyncNode` `ConsumerNode` `DataGraphSeed` `GraphSeed` `Runtime` `RuntimeInstance` `Routes` `Route` `Wiring` `Wire` `Config` `ConfigEntry` `Imports` `Import` `Prefabs` + 各域根节点。

本规范只定义当前 canonical 标签与字段。已删除的历史标签不属于输入协议，也不会进入 loader、compiler 或 fixture 的兼容分支。
