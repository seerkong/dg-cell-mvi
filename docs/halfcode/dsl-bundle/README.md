# Halfcode DSL Bundle 规范

本目录是 `dg-cell-mvi` halfcode bundle 的权威规范。Halfcode 保留 XNL 的结构声明，但把类型、逻辑和复杂对象实现留在动态代码中；Scope 负责把可见的依赖装配到 runtime。

## 层次

```text
L1 foundation/       XNL 语法、命名、URI、DEPA 边界
L2 std/frontend/     UI unit、Capsule、Command/Event
L2 std/effect/       Scope 的通用副作用依赖
L2 std/data-graph/   graph topology、代码逻辑、Scope 装配
L2 std/runtime/      runtime object instance、prototype/derive、Scope assembly
L2 std/flow/         四种 canonical Flow 产品的 Halfcode 集成边界
L3 spec/<family>/    节点、文件、domain 与引用的可查规则
```

## 先读

1. [XNL 语法公理](foundation/syntax-axioms.md)：`{}` 是属性，`()` 是唯一子域，`[]` 是直接/重复条目。
2. [命名与引用公理](foundation/naming-axioms.md)：domain/file/root tag 与单数 kebab-case entry scheme 分投影。
3. [DEPA 公理](foundation/depa-axioms.md)：动态代码遵守 `output = fn(runtime, input, config)`。
4. 选择需要的 L2 family，再读对应的 `spec/`。

## Canonical 协议速查

- bundle 根只有 `<AppBundle>`；`<Unit kind="page|component|document|instant-ctrl-flow|work-ctrl-flow|bp-ctrl-flow|eager-data-flow">` 注册可见 unit。
- URI scheme 一律小写单数 kebab-case；`page://`、`command://`、`data-graph://`、`scope-runtime://`、`eager-data-flow://` 是典型例子。
- type catalog 不进入 XNL。Effect/DataGraph/Flow 的类别由 node tag 表达，类型是节点本地 `type = "vfs://...#Type"`，实现是 `src`/`impl` 或 Scope 按 stable id 的 binding。
- Scope 是 runtime 的装配边界，沿嵌套关系提供可见性和覆盖。
- `MessagePolicy` 只处理必要边界的 `consume` / `bubble` / `reject` 传播策略。
- Flow 语法与执行语义由 [`depa-flows.ts/docs/flow-dsl`](../../../../depa-flows.ts/docs/flow-dsl/README.md) 统一定义；Halfcode 不复制节点语义。
- Flow Unit 物化为 product-discriminated handle，并按 Scope runtime 继承或覆盖；Flow 不进入 effect binding。

## 规范入口

| family | L2 | L3 |
|---|---|---|
| Frontend | [axioms](std/frontend/axioms.md) | [nodes](spec/frontend/nodes.md) · [files](spec/frontend/files.md) · [refs](spec/frontend/refs.md) · [domains](spec/frontend/domains.md) · [Document Unit](spec/frontend/document.md) · [XNL Projection foundation](spec/frontend/xnl-projection/README.md) · [XNL Document authoring session](spec/frontend/authoring/README.md) · [Tiptap Document Presenter](spec/frontend/tiptap-document/README.md) · [schema editor contracts + compiler + runtime](spec/frontend/schema-editor/README.md) |
| Effect | [axioms](std/effect/axioms.md) | [nodes](spec/effect/nodes.md) · [files](spec/effect/files.md) · [refs](spec/effect/refs.md) · [domains](spec/effect/domains.md) |
| Data Graph | [axioms](std/data-graph/axioms.md) | [nodes](spec/data-graph/nodes.md) · [files](spec/data-graph/files.md) · [refs](spec/data-graph/refs.md) · [domains](spec/data-graph/domains.md) |
| Runtime | [axioms](std/runtime/axioms.md) | [nodes](spec/runtime/nodes.md) · [files](spec/runtime/files.md) · [refs](spec/runtime/refs.md) · [domains](spec/runtime/domains.md) |
| Flow | [axioms](std/flow/axioms.md) | [nodes](spec/flow/nodes.md) · [files](spec/flow/files.md) · [refs](spec/flow/refs.md) · [domains](spec/flow/domains.md) |
