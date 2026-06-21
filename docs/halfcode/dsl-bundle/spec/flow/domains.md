# Flow 域参考表

Halfcode 不定义 Flow domain。四种产品的 definition、可选 facet、authoring facts 与 runtime facts 均以 [`depa-flows` canonical domain 规范](../../../../../depa-flows.ts/docs/flow-dsl/README.md)为准：

| product | canonical domains |
|---|---|
| InstantFlow | [domains](../../../../../depa-flows.ts/docs/flow-dsl/spec/instant-flow/domains.md) |
| WorkFlow | [domains](../../../../../depa-flows.ts/docs/flow-dsl/spec/work-flow/domains.md) |
| BizProcess | [domains](../../../../../depa-flows.ts/docs/flow-dsl/spec/biz-process/domains.md) |
| EagerDataFlow | [domains](../../../../../depa-flows.ts/docs/flow-dsl/spec/eager-data-flow/domains.md) |

Halfcode loader 只保存上游 `FlowBundleSpec` 或 `EagerDataFlowAuthoringPlan` 投影，并把上游 diagnostics 适配为 Unit diagnostics。
