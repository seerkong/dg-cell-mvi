# Flow 节点规范

Halfcode 不拥有 Flow 节点语义，也不维护节点清单。authoring 与 validation 必须直接使用 `depa-flows` 的 canonical 产品规范：

| product | canonical nodes |
|---|---|
| InstantCtrlFlow | [nodes](../../../../../depa-flows.ts/docs/flow-dsl/spec/instant-ctrl-flow/nodes.md) |
| WorkCtrlFlow | [nodes](../../../../../depa-flows.ts/docs/flow-dsl/spec/work-ctrl-flow/nodes.md) |
| BPCtrlFlow | [nodes](../../../../../depa-flows.ts/docs/flow-dsl/spec/bp-ctrl-flow/nodes.md) |
| EagerDataFlow | [nodes](../../../../../depa-flows.ts/docs/flow-dsl/spec/eager-data-flow/nodes.md) |

`xnlUnitBundle` 只调用上游 source loader；`flowMaterializer` 只调用上游 spec/plan materializer 与 lifecycle engine。任何新的节点、属性或校验都必须先落到 `depa-flows`，Halfcode 随上游公开 API 消费。
