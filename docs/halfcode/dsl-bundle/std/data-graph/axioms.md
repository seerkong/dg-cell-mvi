# L2 Data Graph halfcode 领域公理

> Data Graph 的结构定义、代码逻辑和 Scope 装配可分离；底层对象仍是 depa-data-graph/runtime 的事实，编号 `G-*`。

## G-1 · Graph 是 runtime fact，DSL 是可传递 authoring data

XNL 描述 module identity、拓扑、slot 与可选代码 ref；它不内嵌 DataGraph instance 或函数。loader 输出纯 serializable plan，runtime 再 materialize 到真实 graph。

## G-2 · 节点 tag 给出 graph 类别

`SignalNode`、`ComputedNode`、`ProcessorNode`、`AsyncNode`、`ConsumerNode` 直接对应底层 graph 的结构类别。保留 `ComputedNode` 和 `ConsumerNode` 这两个既有名称，避免再发明 `ComputeNode` / `ConsumeNode` 近义别名。

## G-3 · Type/implementation 归节点和 Scope

节点 `type = "vfs://...#Type"` 是可选代码签名；Quick/Compact 的 `src`/`impl` 在节点或 mount 上；Split/Public 的实现由 Scope 的 `NodeBindings` 按稳定 node id 注入。没有 GraphLogicType catalog，也没有 graph logic type URI。

## G-4 · Scope 是 graph 装配点

`DataGraphBindings` 挂载 module、选择 graph object、注入 node implementations 或扩展已有 graph。外层 Scope 的 binding 对内层可见，运行时决定覆盖与隐藏。

## G-5 · 动态代码通过 runtime 操作 graph

Command handler、effect 或 flow code 的首参是 runtime；它经稳定 graph accessor 取得 graph 和 refs，再执行写入/批量操作。XNL 不声明“某个 command 修改哪个 signal”。

## G-6 · 三档共用 module/node identity

| 层级 | 写法 | 适用 |
|---|---|---|
| Quick | Scope `GraphExtension.src` 直接安装/扩展 | 局部 demo |
| Compact | `GraphModule` 拓扑 + node-local `type`/`src` 或 mount `impls` | 普通页面 |
| Split/Public | module topology + node `type`；Scope `NodeBindings` 注入实现 | 跨包/可替换逻辑 |

## G-7 · seed 是启动快照

`data.graph.seed` 只覆盖 module initial 值，不是 live state domain。
