# Flow 文件组织

Flow unit 可以是单文件 definition，也可以是以 `manifest.xnl` 为入口的目录 bundle。文件名、facet 拆分、具名 source collection 与 code ref 的解析规则完全遵循 [`depa-flows` 文件规范](../../../../../depa-flows.ts/docs/flow-dsl/spec/flow-core/files.md)以及各产品目录。

Halfcode 的额外职责只有两项：

1. `<AppBundle><Units>` 记录产品 kind、FQN 与 `vfs://` source。
2. loader 从 Unit source 所在目录收集 XNL 文件，保留 base URI，并把具名 source 交给上游 browser loader。

运行时不会读取本地目录；VFS code export 必须由 `MaterializeHalfcodeFlowsOptions.resolveCode` 注入。
