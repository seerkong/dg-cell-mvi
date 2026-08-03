# Design: XNL Projection Editor Foundation

## 上下文

该 foundation 位于 Domain XNL 与具体 renderer 之间。它编译可重建投影并翻译
交互，但不接受 mutation、不持久化、不拥有 UI state。

```text
Domain XNL + Presentation + code-owned Dialect
                    |
                    v
       recursive XNL Projection compiler
                    |
                    v
              ProjectionPlan
              /      |      \
        Presenter A  B   SchemaEditor/Tiptap later
                    |
                 Interaction
                    |
                    v
             Domain Command proposal
```

事实等级：

```text
Domain XNL                         authority input
ProjectionPlan                    rebuildable projection
Presenter output/local draft      surface projection
Interaction/Domain Command        immutable proposal, not accepted fact
```

## 方案概览

### 1. 三层 capsule

```text
dg-cell-mvi-halfcode-contract/xnl-projection
  - serializable Presentation / Plan / diagnostics
  - Dialect processor types
  - Interaction / DomainCommand
  - PresenterAdapter contract

dg-cell-mvi-halfcode-logic/xnl-projection
  - recursive compile
  - presentation rule resolution
  - dialect composition
  - interaction translation

dg-cell-mvi-halfcode-support/xnl-projection
  - XnlNode traversal and DomainRef extraction
  - default XNL classification/transformers
  - Presenter registry composition and neutral presentation runner
  - runtime assembly over code-owned dialect/presenter registries
```

依赖只允许：

```text
contract <- logic <- support
```

`xnl-core` 只进入 support；Vue、DOM、Element Plus、Tiptap、VFS/VCS writer 和
Workbench 不进入三层 foundation。

### 2. 通用 Plan 不使用表单结构 kind

概念 contract：

```ts
interface ProjectionPlanNode {
  id: string
  domain: {
    path: readonly (string | number)[]
    nodeId?: string
    tag?: string
    sourceKind?: string
    role?: string
  }
  classification: {
    id: string
    traits?: readonly string[]
  }
  presenter: {
    id: string
    options?: SerializableRecord
  }
  data?: SerializableValue
  children: readonly ProjectionPlanNode[]
  diagnostics?: readonly ProjectionDiagnostic[]
  provenance?: SerializableRecord
}
```

这里没有 `group | field | collection | map | union`。SchemaEditor 可以把某个
ProjectionPlan 或 Domain subtree 再适配为自己的 `EditorPlan`，但不能反过来
定义通用基座。

### 3. Presentation 是纯数据

Presentation 由稳定规则组成：

```ts
interface ProjectionPresentation {
  id: string
  rules: readonly ProjectionPresentationRule[]
}

interface ProjectionPresentationRule {
  id: string
  match: {
    path?: readonly (string | number)[]
    nodeId?: string
    tag?: string
    classification?: string
    role?: string
  }
  presenter?: {
    id: string
    options?: SerializableRecord
  }
  visible?: boolean
  data?: SerializableRecord
}
```

规则只选择 stable presenter id 和可序列化展示数据。函数、component、
transformer、writer、runtime instance 均非法。

Presenter 解析顺序固定为：

```text
最后一个匹配的 explicit Presentation rule
> 当前 Dialect layers 的 semantic presenter binding
> classification 的 dialect default presenter
> source-kind structural fallback binding
> unsupported diagnostic
```

Scope overlay 的最终组合由后续 Runtime/Document Track 接入；本 Track 的
composition helper 只处理调用方已按 Scope 可见性排好序的 Presentation/Dialect
layers，later layer wins。

### 4. Dialect 与递归 compiler

Dialect 是代码对象：

```ts
interface ProjectionDialect<TNode> {
  id: string
  children: ProjectionChildrenProcessor<TNode>
  classify: ProjectionClassifier<TNode>
  transformers: Readonly<Record<string, ProjectionTransformer<TNode>>>
  translateInteraction?: ProjectionInteractionTranslator<TNode>
  config?: SerializableRecord
}
```

所有 processor 采用：

```text
output = fn(runtime, input, config)
```

递归属于 compiler runtime：

```text
compile(node, context)
  -> dialect.children(runtime, { node, context }, dialect.config)
  -> runtime.compile(each child)
  -> dialect.classify(runtime, { node, context }, dialect.config)
  -> resolve transformer by classification.id
  -> transformer(runtime, { node, context, classification, children,
                             presentation }, dialect.config)
  -> validate ProjectionPlanNode
```

`runtime.compile` 是 compiler factory 注入、委托给外置 compiler processor 的
递归 capability，不把临时 callback 放入 input/config，也不在 runtime class
中实现业务 transformer。业务 transformer 始终是外置三参数 processor；
runtime 只携带 Dialect、只读 registry 与该 framework recursion capability。

### 5. XNL support adapter

Support 层直接适配 `xnl-core` 的公开 `XnlNode`：

- DataElement/TextElement 的显式 `#id` 转为 `domain.nodeId`；
- `#id` 只用于 identity/provenance，不复制为可编辑普通属性；
- element body、extend、array 和 record 保持确定顺序递归；
- metadata/attributes/text/word/comment/literal 等作为可序列化 plan data；
- 默认 classification 使用开放 id，如 `xnl.data-element`、
  `xnl.text-element`、`xnl.word`、`xnl.comment`、`xnl.array`、
  `xnl.record`、`xnl.literal`；
- 默认 presenter id 只是 XNL AST 的中立 fallback，不引用 UI implementation。

### 6. Interaction 翻译

```ts
const result = translateXnlProjectionInteraction(
  runtime,
  { planNode, interaction, sourceNode },
  invocationConfig,
)
```

`sourceNode` 是可选的领域 adapter 输入；没有 source node 时省略。`invocationConfig`
只承载本次调用的 plain serializable policy，不重复 runtime-owned Dialect identity，
也不携带 translator implementation。Dialect translator 作为代码侧 processor，实际
收到的 processor config 来自 `runtime.dialect.config`。

Interaction 只包含 target plan node、type、payload 与 provenance。translator 返回
封闭结果：

```text
translated { command }
rejected   { diagnostics }
unsupported { diagnostics }
```

它不返回 accepted snapshot，不调用 mutation/VFS/ValueHost writer。后续
authoring session 将 Domain Command materialize 为 candidate XNL 并执行
diff/dry-run/accept。

### 7. Presenter adapter

Presenter implementation 是代码侧三参数 processor：

```ts
output = presenter.present(
  runtime,
  { node, childOutputs, surfaceState },
  { surfaceId, options }
)
```

可选 `surfaceState` 只是可替换、可序列化的 surface 投影数据，不是 accepted Domain
authority。accepted Domain revision、Candidate XNL、diff/apply、accept 与
GetPut/PutGet 都留给后续 authoring owner。

Support 层 Presenter registry 只做 stable id 到 adapter 的受控分发；未知 id 显式返回
diagnostic，不静默降级为 JSON/text。测试至少提供两个无 UI adapter：

- outline adapter：产出只读层次 outline；
- inspection adapter：产出含 domain ref/classification 的 record。

同一 ProjectionPlan 经两个 registry/surface 得到不同输出，且两者都无法取得
Domain XNL writer。

## 影响范围与修改点（Impact）

- `packages/dg-cell-mvi-halfcode-contract/src/xnl-projection/`
- `packages/dg-cell-mvi-halfcode-logic/src/xnl-projection/`
- `packages/dg-cell-mvi-halfcode-support/src/xnl-projection/`
- 三个 package 的 root exports 与 tests
- `docs/halfcode/dsl-bundle/spec/frontend/` 下的 projection foundation 文档

## 决策摘要

- 详见 `decisions.xnl`。
- 使用现有 Halfcode 三层，不立即拆新 package family。
- Generic Plan 使用开放 classification，不使用 SchemaEditor kinds。
- Presentation 只引用 stable ids；实现全部由 runtime/code registry 提供。
- XNL AST dependency 保持在 support。

## 风险 / 权衡

- **Runtime 被塞入业务逻辑**：factory 只注入递归/registry capability，transformer
  与递归算法仍是外置三参数 processor；dependency scan 和 DEPA review 验证。
- **默认 XNL adapter 变成领域规范**：classification id 明确是 fallback，可由
  业务 Dialect overlay；Plan contract 不枚举这些 id。
- **Presentation 规则成为 selector 语言黑洞**：首版只支持确定性 exact match，
  不引入表达式执行或 callback。
- **隐式 raw fallback**：未知 transformer/presenter 必须 diagnostic。
- **第二事实源**：Plan、Presenter output 和 Interaction 均不暴露 writer。

## 兼容性设计

- SchemaEditor 既有 contracts/compiler/runtime 不改名、不降级，也不被替换。
- 新 API 通过 package root 导出；不要求消费者 deep import。
- 现有 Halfcode runtime/fixtures 在后续 Document/authoring Track 接入。

## 迁移计划

1. 先用 contract/logic 红测试固定通用边界。
2. 实现 contracts/validator 与 compiler。
3. 增加 XNL support adapter 和两个中立 Presenter tests。
4. 补公共导出、文档、全量测试与依赖扫描。
5. 由 Mission 的 `PROJECTION-T2` 独立验证 GetPut/PutGet、lossy diagnostics 和
   DEPA 边界，再进入 Document Unit。

## 待解决问题

- 最终 Document runtime 如何把 Scope overlay 组装进 Projection runtime。
- SchemaEditor/Tiptap/Graph 的具体 adapter API 在各自产品 Track 中细化。
