# Mission：实现 halfcode runtime 对象系统

## 背景和动机

`docs/halfcode/dsl-bundle/` 已经从 frontend-only DSL 扩展到 effect、data graph、runtime 的初版标准，并在 commit `e1fc301` 保存了一次新的设计基线。最新 runtime 设计不再把 Runtime 当成 XNL 可展开的 store/reducer 节点，而是改为：

- runtime 是代码实现的对象实例；
- Scope 绑定 RuntimeInstance，并像早期 Spring XML 一样把 effect、data graph、command/event、config 等装配输入注入 runtime；
- runtime 可通过 `src` 复用对象、`create` 创建新对象、`prototype + derive` 从已有实例派生；
- halfcode 动态代码以 `output = fn(runtime, input, config)` 为基本入口，复杂实例场景可扩展为 `fn(runtime, instanceRefs, input, config)`。

当前这些仍主要停留在 DSL 文档和 fixture 层。要让 halfcode app demo 真正运行，需要在 `dg-cell-mvi` 中补齐 runtime object protocol、XNL runtime domain loading、scope assembly、动态代码调用、effect/data graph 绑定和 demo 验证。

## 目标

- 将已讨论的 runtime、data graph、effect、command/event、config、contracts、frontend composition 三档写法和语法变动拆成可执行 tracks。
- 优先实现 runtime object protocol 与 RuntimeInstance 装配底座。
- 让 `runtime-counter` 这类 fixture 不只 parse，而能通过 support/runtime 层创建 scope runtime、调用 command handler、更新 runtime viewModel。
- 为 data graph 重新设计保留证据盘点与实现 track：先贴近 `depa-data-graph` 与 `dg-cell-mvi` 全代码用法，再把 graph module / node impl / scope binding 接到 runtime。
- 将 product/material、resource/backend flow、CRUD、workflow 作为后续 DSL family，挂在 runtime/data graph 底座之后推进。

## 非目标

- 不把 runtime 内部对象结构、泛型、继承、mixin、消息路由写进 XNL。
- 不恢复 `state.def`、`state.seed`、`StreamSignalStore` 作为 runtime DSL 节点。
- 不在本 mission 中一次性完成完整业务后端、ORM、真实 HTTP API 或生产级 UI renderer。
- 不把 data graph DSL 继续按旧错误设计实现；data graph track 必须先从 `depa-data-graph` 和 `dg-cell-mvi` 代码事实重新盘点。

## 成功判据

- 至少完成 runtime object foundation 的首批 tracks：contract/types、XNL RuntimeInstance loading、Scope runtime assembly、command handler execution。
- `runtime-counter` fixture 可以作为可执行 demo：加载 bundle -> 创建/派生 runtime -> dispatch command -> 读取 `scope.runtime://#counter/viewModel.*`。
- data graph 实现 track 不再使用旧猜测模型，必须有代码事实 evidence 和重新设计说明。
- mission.xml 中每个落地 track 都有清晰依赖：runtime object foundation 先行，data graph/effect/CRUD/workflow 后置。
- 所有实现改动通过 `packages/dg-cell-mvi-halfcode-support` 的测试，并为新增 runtime 能力补充聚焦测试。

## 为什么需要 mission 而不是单个 track

这项工作跨越 DSL 标准、contract package、support loader、runtime assembly、dynamic code execution、data graph binding、fixture demo 和后续 CRUD/workflow/resource 设计。单个 track 容易把 DSL 语法、运行器协议和 data graph 实现混成一团。

mission 负责控制面和跨 track 编排；真实代码、规范、测试和迁移由各个 codument track 承担。
