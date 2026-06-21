# Flow 引用规则

Flow 内部引用、code ref 与 eager subflow 引用由 [`depa-flows` canonical refs](../../../../../depa-flows.ts/docs/flow-dsl/spec/flow-core/refs.md)定义。Halfcode 不增加 Flow 私有 scheme，也不解释节点内部引用。

Halfcode 只处理两类外围解析：

| reference | Halfcode responsibility |
|---|---|
| AppBundle Unit `src="vfs://..."` | 收集具名 XNL source，并把 base URI 传给上游 loader |
| Flow code `vfs://...#export` | 调用注入的 `resolveCode(request, { unit })`，由上游 engine 以 Scope runtime 执行 |

Eager subflow 使用上游 `eager-data-flow://<FQN>` registry/linker；Halfcode 只负责把已加载 Unit 投影组成完整 registry。
