# 设计：RuntimeInstance 集成边界收口

## 上下文

RuntimeInstance 是一个代码对象系统：Scope 把静态 bindings 作为装配输入，动态代码通过 `fn(runtime, input, config)` 使用结果。XNL 不拥有运行时对象内部结构。该模型与 DEPA 的显式 runtime/capability 边界一致，但必须避免 loader 将词汇声明、Scope 可见性、host 调用失败和 bundle discoverability 混为隐式全局机制。

## 方案概览

1. 统一跨仓库术语。
   - 将 workbench `halfcode.runtime` 的行为改为 RuntimeInstance 对象运行时，或把仍有效的 event/reducer store 行为移动到命名独立的 legacy/MVI capability。
   - 不以文档表述替代代码证据；实现时先盘点 workbench 是否仍有该 store 的真实入口和消费者。

2. 将 scope-derived URI 分成两个层次。
   - Loader 的全局 document scan 只可建立“声明 inventory”，不得结论化为 Scope 可见性。
   - 对 `scope.runtime://` 做基于引用位置和父 Scope 链的验证，复用与 `resolveScopeRuntimeRef` 同方向的语义；`scope.effects://` 与 `scope.data.graph://` 在其实现成熟前必须延迟至各自 scope-aware resolver，而不是接受全局误判。
   - 保持 projection suffix 运行时私有：loader 只验证 `#id` 的 Scope 可见性，不读取或解释 `viewModel.value`。

3. 固化宿主调用与 bundle 装载边界。
   - 所有注入的 resolver 都遵循“失败 -> 有定位的 diagnostic”规则。config resolver 失败不得直接中断整个 assembly。
   - Domain discovery 有两种等价入口：本地 authoring 可由 `readDir` 枚举；封装后 bundle 可由显式 domain-file inventory 提供。后者是运行/分发路径，不依赖目录 API。

4. 明确版本与声明边界。
   - `halfcode.dg-cell-mvi/v1` 是 FrontendApp DSL API compatibility family；loader v3 是 bundle representation/loader capability family。文档必须给出受支持组合、拒绝策略和升级入口；若代码不能维持该二轴模型，再统一版本名。
   - 用 fixture + negative tests 强制 Runtime XNL 仅接受 RuntimeInstance/Scope assembly vocabulary，动态 entry 始终 runtime-first。

## 影响范围与修改点（Impact）

- `eidolon-workbench/codument/behaviors/halfcode.runtime.xml` 及可能的新 legacy MVI behavior 文件。
- `dg-cell-mvi` runtime docs、contract diagnostics、unit loader、runtime assembler、fixtures and tests。
- Mission schedule：G3 等待 G2R，避免 scope semantics 未收口时实现 data graph binding。

## 决策摘要

- 本 track 不做 data graph 设计；只修复所有 scope-derived family 将共同依赖的可见性边界。
- 声明 inventory 和可见性是不同概念。前者可在 unit 级收集，后者必须具有引用位置和 Scope 链。
- legacy MVI store 是否保留取决于 workbench 代码证据，不能被 RuntimeInstance 文档悄然覆盖。

## 风险 / 权衡

- Scope-aware validation 需要 loader 保存或恢复引用的 lexical Scope。缓解：以 runtime family 先落地，其他 family 仅接入共享 resolver abstraction 后再启用严格验证。
- Explicit inventory 可能与文件系统 discover mode 产生重复路径。缓解：定义单一的 discovered document list，再由两个入口填充。
- 版本文档若与 loader 真实接受范围不一致会误导客户端。缓解：为 accepted/rejected combinations 添加 fixture tests。

## 迁移计划

1. 先添加测试和 diagnostics，再迁移 loader/assembly 语义。
2. 更新 Runtime/FrontendApp docs 和 workbench behavior registry。
3. 运行 package-local canonical test command；若 `xnl-core` 仍无法解析，先修复 workspace test invocation/fixture setup，再做语义回归判断。
4. 通过后由 mission reconciliation 解除 G3 的前置阻塞。
