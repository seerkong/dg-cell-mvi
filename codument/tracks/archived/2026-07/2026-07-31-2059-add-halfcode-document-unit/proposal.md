# 变更：增加 Halfcode Document Unit 与实例寻址

## 背景和动机

现有 Halfcode v3 只有 Page、Component 与 Flow 等具名 Unit，Capsule 是唯一的
内联封装原语。XNL Projection foundation 已经可以把领域树编译为
renderer-neutral plan，但 AppBundle 还没有一种具名 Unit 来表达“文档源 +
展示配置 + root Scope + 可编程区块”。

本 Track 增加 Document Unit，并冻结 `#id` 与 `x-id` 的不同职责：

- `#id` 是 XNL 节点身份，供 tree diff 对齐、move、mutation 与领域引用使用；
  它不是普通 payload 字段，不产生普通的 id 字段更新。
- `x-id` 是某个投影运行实例的局部地址，供 Runtime 中的 Command、
  Invocation 与 Event 路由使用。

Document Unit 使文档可以复用 Scope、Runtime、Component 与 Capsule，同时避免
把文档伪装成 Page 或 Component。

## 目标

- 将 `document` 加入 AppBundle 的具名 Unit registry，并支持 `<Document>` 根。
- 定义独立的 `DocumentContract`：source/revision 类型、mode、parameters 与
  message boundary；不继承 Page URL 或 Component props/slots。
- 定义 Document compile plan、root Scope、Presentation ref 与嵌入
  Component/Capsule 的结构计划。
- 同时支持根 `[]` 的内联正文，以及 `DocumentSource.ref` 指向的 UI-free 外部
  Domain XNL；两者互斥且都保留完整 XNL 顺序与节点家族。
- 冻结 `unit-instance://<unit-instance-id>/<projection-role>/<x-id>` 的规范地址。
- 将 `unit-instance://` 明确为 runtime target protocol，由专用 resolver 处理；
  它不伪装成静态 file/domain scheme。
- 提供每个 Document Unit instance 独立的 instance registry，并通过 Scope
  Runtime 装配与继承。
- 将 Document runtime 从“按 FQN 一份”提升为“按实际挂载实例一份”，同一
  Document FQN 的多次挂载不得共享 Scope/state/address namespace。
- 提供 tokenized `openDocument`/`closeDocument` occurrence 生命周期，拒绝重复
  `unitInstanceId`，异步失败时回滚，关闭时级联清理 child occurrences。
- 静态 plan 只保存 role/x-id/node/scope address descriptor；完整
  `DocumentInstanceRef` 只能在 open 时绑定 `unitInstanceId`。
- 重复 `x-id` 失败关闭，不采用 last-wins，也不通过 DOM/querySelector 寻址。
- 增加 XNL-only fixture、DSL 文档、contract/loader/compiler/runtime tests。
- 保持 Page、Component、Flow、v2 compiler 与既有 runtime 行为不回归。
- 以 canonical UnitKind constants 和 exhaustive dispatch 检查防止未来新增 kind
  时再次遗漏 loader/compiler 分支。

## 非目标

- 不实现 Tiptap、Vue renderer、NodeView 或 Workbench UI。
- 不实现 authoring session、XNL Mutation 接受、ValueHost revision owner、
  VFS/VCS persistence 或 accepted snapshot。
- 不把 Presentation、Presenter、effect 或 runtime implementation 写入 XNL。
- 不让 Document 获得路由 URL contract，也不新增 Capsule manifest。
- 不把 `x-id` 当作 XNL tree diff identity；不改变 xnl-core diff/move 语义。
- 不用 DOM `data-x-id`、数组下标或 querySelector 充当运行时 registry。
- 不重命名旧 v2 `HalfcodeDocument`；新 API 使用 `DocumentUnit*` 命名隔离。

## 变更内容

- `dg-cell-mvi-halfcode-contract`
  - 扩展 Unit kind、manifest、contract、scheme table、diagnostics 与 compile plans。
  - 增加 Document instance ref、地址 parser/formatter 与 registry port contracts。
- `dg-cell-mvi-halfcode-support`
  - 加载 Document 单元、保留 Domain XNL source，并建立可寻址实例结构投影。
  - 实现实例 registry、`DocumentOpenContext` 与 occurrence-level runtime
    assembly 接入。
- `dg-cell-mvi-halfcode-logic`
  - 编译 Document plan、root/Capsule Scope 与嵌入 Unit 计划。
  - 编译期检查 `#id`/`x-id`、Presentation ref 与重复地址。
- `docs/halfcode/dsl-bundle`
  - 记录 Document DSL、双身份、实例 URI、Scope 可见性和非目标。
- `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-unit-bundles`
  - 增加最小可编程文档 bundle 与负例。

## 影响

- 修改 behaviors：
  - `dg-cell-mvi-halfcode-unit-dsl`
  - `dg-cell-mvi-halfcode-unit-bundle`
  - `dg-cell-mvi-halfcode-unit-compile`
  - `halfcode-scope-runtime-assembly`
- 新增公共类型是 additive；`UnitKind` 扩展可能暴露下游 exhaustive switch，
  因此 typecheck 与 residue scan 必须覆盖全部消费者。
