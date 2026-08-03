# Halfcode Document Unit 设计

## 1. 边界与术语

Document 是 Capsule 能力的具名发行形态，不是 Page/Component 的别名：

```text
Capsule
├── Component Unit：props / slots boundary
├── Page Unit：URL shape boundary
└── Document Unit：source / revision type / mode / parameters boundary
```

- Capsule 仍只存在于树内，不进入 AppBundle `Units`。
- Page、Component、Document 都有 FQN，可注册、加载和嵌入。
- Document root 自身拥有 Scope；内部 Capsule 可以继承并覆盖 Runtime capability。
- 旧 v2 `HalfcodeDocument` 是历史 canonical artifact。本 Track 的新 API 一律使用
  `DocumentUnitManifest`、`DocumentContractSpec`、`DocumentUnitPlan` 等名称。

## 2. DSL

### 2.1 AppBundle 注册

```xnl
<AppBundle #dg.docs.demo (
  <Units [
    <Unit {
      kind = "page"
      fqn = "dg.docs.demo.DocumentPage"
      src = "vfs://./pages/document-page.xnl"
    }>
    <Unit {
      kind = "document"
      fqn = "dg.docs.demo.SystemDesign"
      src = "vfs://./documents/system-design.xnl"
    }>
    <Unit {
      kind = "component"
      fqn = "dg.docs.ReviewPanel"
      src = "vfs://./components/review-panel.xnl"
    }>
  ]>
)>
```

`document://dg.docs.demo.SystemDesign` 是定义引用；它不是某次挂载后的实例地址。

### 2.2 Document 根

```xnl
<Document #dg.docs.demo.SystemDesign (
  <DocumentContract {
    mode = "edit"
    source = "xnl-source-ref"
    revision = "string?"
    parameters = {
      locale = "string?"
    }
  }>
  <Scope #document-root {
    runtime = "runtime-instance://#document-runtime"
  }>
  <DocumentPresentation {
    id = "system-design"
  }>
) [
  <Heading #title {
    level = 1
  } [
    "系统设计"
  ]>
  <Paragraph #overview [
    "这是领域文档正文。"
  ]>
  <dg.docs.ReviewPanel #review-panel {
    "x-id" = "review-panel"
  }>
  <Capsule #architecture {
    "x-id" = "architecture"
  } (
    <Scope #architecture-scope {
      runtime = "runtime-instance://#architecture-runtime"
    }>
  ) [
    <dg.docs.ArchitectureCanvas #architecture-canvas>
  ]>
]>
```

纯领域 XNL 使用外部 source，并与根 `[]` 互斥：

```xnl
<Document #dg.docs.demo.SystemDesignView (
  <DocumentContract {
    mode = "view"
    source = "xnl-source-ref"
    revision = "string?"
  }>
  <DocumentSource {
    ref = "vfs://./domain/system-design.xnl"
  }>
  <Scope #document-root {
    runtime = "runtime-instance://#document-runtime"
  }>
  <DocumentPresentation {
    id = "system-design"
  }>
)>
```

XNL 结构约束：

- `{}` 只放普通配置。
- `[]` 是有序文档内容。
- `()` 放每种最多出现一次的 `DocumentContract`、`DocumentSource`、`Scope`、
  `DocumentPresentation` 子域。
- 根 `[]` 与 `DocumentSource` 是互斥 source 形式；两者都以真实 XNL 为事实，
  不经过 HTML、DOM 或 Tiptap JSON round-trip。
- source/revision 在 Contract 中是边界类型描述，不是 live accepted state；
  后续 authoring session 才拥有 revision 与 accepted snapshot。
- Presentation 只保存稳定引用，不嵌入 transformer、component 或 callback。

### 2.3 两种内容模式

1. 可编程文档可以显式嵌入已注册 Component 或内联 Capsule。
2. 纯领域 XNL 保持 UI-free，由外部 Document Unit/Presentation 引用并投影。

本 Track 只建立 Unit/Scope/addressing 基座，不实现具体 Presenter。

## 3. Contract 模型

```ts
type DocumentMode = 'view' | 'edit'

interface DocumentContractSpec {
  kind: 'document-contract'
  fqn: UnitFqn
  mode: DocumentMode
  source?: string
  revision?: string
  parameters?: Record<string, string>
  accepts?: MessageRefSpec[]
  sends?: MessageRefSpec[]
  elementContracts?: UnitElementContractSpec[]
  metadata?: SerializableRecord
}

interface DocumentPresentationSpec {
  id: string
}

interface DocumentSourceSpec {
  ref: HalfcodeRef
}

type DocumentSourceDescriptor =
  | {
      kind: 'inline'
      unitSourceRef: HalfcodeRef
      region: 'body'
    }
  | {
      kind: 'external'
      ref: HalfcodeRef
    }

interface DocumentOpenContext {
  unitInstanceId: string
  /** Only valid when the definition source is external. */
  externalSourceRef?: HalfcodeRef
  revision?: string
  mode: DocumentMode
  parameters?: SerializableRecord
}
```

- `source`、`revision` 与 `parameters` 的值是类型描述；它们不保存当前文档内容、
  当前 revision 或 writer。
- `DocumentSourceSpec` 只提供静态默认 external source；根 `[]` 编译为
  `{ kind: 'inline', unitSourceRef, region: 'body' }`。二者统一成为
  `DocumentSourceDescriptor`，不会出现没有 ref 语义的隐式 inline source。
- 内联可编程正文是 Unit definition 的结构，不能在 open 时替换。
- 只有 definition source 为 external 时，实际挂载才可以用
  `DocumentOpenContext.externalSourceRef` 覆盖外部 UI-free Domain XNL；外部
  source 不提供 Capsule/Component/Scope 结构，因此不复用或污染 definition 的
  address/scope plan。该外部 domain 的递归投影属于 Presenter 阶段。
- revision/parameter values 不写回静态 Contract。
- DocumentContract 没有 `urlInputs`、`props`、`slots`、`exposes`。
- `DocumentPresentation.id` 是 XNL Projection Runtime 内的 stable data key，不是
  文件/domain locator，也不是 Presenter implementation ref。本 Track 不发明一个
  没有 owner 的 `document-presentation://` 协议。

## 4. Loader 与 compile plan

Loader 必须：

1. 识别 `kind="document"` 与 `<Document #FQN>`，交叉校验 kind/FQN。
2. 保留内联或外部真实 XNL source document 的全部节点家族、文本、注释与顺序；
   不得先转成 HTML、DOM 或 Tiptap JSON。
3. 解析唯一子域 Contract/Source/Scope/Presentation，并拒绝同时声明内联正文和
   外部 Source。
4. 保留有序正文，并抽取显式 Halfcode Component/Capsule/Document embed 与
   addressable node skeleton；不得把所有领域 tag 误判成 UI atom。
5. 使用 `HALFCODE_SCHEME_TABLE` 注册 `document://<FQN>` definition registry。
   `unit-instance://` 是 runtime target 协议，使用专用 parser/runtime resolver，
   不进入静态 domain resolver；Presentation 使用 runtime-owned stable id。

Compiler 产生：

```ts
interface DocumentUnitPlan {
  id: string
  unitFqn: UnitFqn
  source: DocumentSourceDescriptor
  rootNodeId: string
  mode: DocumentMode
  presentationId: string
  rootScopeId: string
  parameters?: Record<string, string>
  embeddedUnits: readonly DocumentEmbeddedUnitPlan[]
  addressableInstances: readonly AddressableInstancePlan[]
}
```

`DocumentUnitPlan` 只保存装配信息与 source ref，不复制 accepted XNL，也不成为
第二事实源。Document body 的领域投影继续由 XNL Projection foundation 处理。

Page/Component 元素树引用已注册 Document FQN 时，compiler 产生独立的
`document-embed` plan；Document 不接受 Page URL inputs 或 Component props。

## 5. `#id` 与 `x-id`

| 身份 | Owner | 用途 |
|---|---|---|
| XNL `#id` | Domain XNL | tree diff 对齐、move、mutation、领域引用 |
| `x-id` | Document/Projection runtime | 运行实例 Command/Invocation/Event 目标 |
| Unit FQN | AppBundle registry | Unit 类型/制品身份 |
| DOM `data-x-id` | Presenter | 单次 render 映射与调试 |

硬规则：

- `#id` 参与 XNL tree 的身份匹配和 move 检测，但不作为普通 payload 字段比较；
  身份替换由 delete+add 表达。
- `x-id` 不参与 XNL tree diff，也不能代替 `#id`；loader 必须把它解析为结构
  地址字段，不能混入 Component 的 inline props。
- addressable 且只有 `main` role 的节点，未显式设置时使用 `x-id = #id`。
- 多 role 或多实例必须显式设置不同 `x-id`；同一 Document Unit instance 内
  `x-id` 全局唯一，即使 role 不同也不能重复。
- 重复 `#id` 或 `x-id` 产生结构化 error diagnostic；禁止 last-wins。

## 6. InstanceRef 与 URI

公开值对象：

```ts
interface DocumentInstanceRef {
  unitInstanceId: string
  projectionRole: string
  xId: string
}

interface DocumentAddressDescriptor {
  projectionRole: string
  xId: string
  documentNodeId?: string
  unitFqn?: string
  scopeId: string
  metadata?: SerializableRecord
}

interface AddressableInstance<TTarget = unknown> {
  ref: DocumentInstanceRef
  descriptor: DocumentAddressDescriptor
  target: TTarget
}
```

`DocumentUnitPlan` 只能保存不含 `unitInstanceId` 的
`DocumentAddressDescriptor`。`unitInstanceId` 只在 `openDocument` 成功后绑定为
`DocumentInstanceRef`；definition compile 不得提前制造 runtime identity。

规范序列化：

```text
unit-instance://<unit-instance-id>/<projection-role>/<x-id>
```

- 三段都必须是非空 URI-safe segment，不允许 `/`、`#`、`?` 或空白。
- 局部声明省略 role 时，compiler 规范化为 `main`；序列化 URI 永远包含 role。
- parser 与 formatter 必须互为逆，非法或非规范地址失败关闭。
- `document://<FQN>` 定位 Unit 定义，`runtime-instance://#<id>` 定位 Runtime
  对象，`unit-instance://...` 定位某次 Document 挂载里的可交互实例；三者
  不可互换。

## 7. Runtime instance registry

每个 Document Unit instance 拥有独立 registry：

```text
Document mount
  -> create unit instance namespace
  -> bind registry capability into root Scope Runtime
  -> child Capsule scopes inherit/override runtime normally
  -> Presenter registers mounted addressable instances
  -> Command/Invocation resolves target through registry
  -> unmount disposes its registration
```

Registry 要求：

- `register` 对重复 active `x-id` 返回 diagnostic，且不覆盖旧值。
- 注册返回 owner token/disposer；`unregister` 必须校验 token，旧 unmount
  不能删除已重挂的新实例。
- `resolve` 返回不可变 snapshot 或 not-found diagnostic。
- unit unmount 清理本 namespace；两个 Document instances 允许使用相同局部
  `x-id`。
- registry 通过 Runtime capability 暴露，Component/Capsule 不直接持有全局
  mutable map。
- 不扫描 DOM，不调用 querySelector，不让 `data-x-id` 成为事实 owner。
- contract/compile plan 只保存 `DocumentAddressDescriptor`。support registry
  在 open 时绑定 `unitInstanceId`，并用泛型保存 runtime-only opaque target/port；
  不得把 target 序列化回 plan，也不要求每个地址都有 Presenter 或独立
  runtime-instance ref。

现有 App runtime 以 Unit FQN 为装配 key，不能直接复用为 Document occurrence
模型。本 Track 必须新增显式实例生命周期：

```ts
interface OpenDocumentInput {
  definitionFqn: UnitFqn
  context: DocumentOpenContext
  hostOccurrenceRef?: DocumentInstanceRef
}

interface DocumentInstanceHandle {
  unitInstanceId: string
  lease: string
  rootScopeId: string
  addresses: readonly DocumentInstanceRef[]
}

interface DocumentOccurrenceRuntime {
  /** Owner-local occurrence/address registry capability. */
  documentOccurrences: DocumentOccurrenceRegistryPort
  /** Stable definition/registry/assembly capabilities supplied by runtime. */
  documentRuntime: DocumentRuntimePort
}

interface DocumentRuntimePort {
  resolveDefinition(definitionFqn: UnitFqn): DocumentUnitPlan | undefined
  createRegistry(): DocumentInstanceRegistry
  assembleOccurrence(
    runtime: DocumentOccurrenceRuntime,
    input: AssembleDocumentOccurrenceInput,
    config: DocumentRuntimeConfig,
  ): DocumentOccurrenceAssembly | Promise<DocumentOccurrenceAssembly>
}

interface DocumentOccurrenceRegistryPort {
  reserve(input: { unitInstanceId: string }): ReserveResult
  get(unitInstanceId: string): DocumentOccurrenceRecord | undefined
  commit(input: { unitInstanceId: string; lease: string; record: DocumentOccurrenceRecord }): DiagnosticResult
  release(input: { unitInstanceId: string; lease: string }): DiagnosticResult
  resolveHost(ref: DocumentInstanceRef): unknown | undefined
  list(): readonly DocumentOccurrenceRecord[]
}

type DocumentRuntimeConfig = Readonly<Record<string, never>>

// Processor/actor boundary remains runtime-first.
openDocument(runtime: DocumentOccurrenceRuntime, input, config): Promise<DocumentInstanceHandle | DiagnosticResult>
closeDocument(runtime: DocumentOccurrenceRuntime, { unitInstanceId, lease }, config): Promise<DiagnosticResult>
```

装配过程：

```text
unit definition FQN
  -> DocumentOpenContext(unitInstanceId, externalSourceRef?, revision, mode, parameters)
  -> UnitRuntimeInstanceAssembly
  -> root Scope Runtime(parent = host occurrence runtime)
  -> nested Capsule/Component occurrence runtime
```

- FQN 只定位定义，不得充当 `unitInstanceId`。
- definition lookup、instance registry creation 与 occurrence assembly 是首参
  runtime 的显式 `documentRuntime` capability；`DocumentRuntimeConfig` 只承载单次
  调用静态数据，不包含 definitions/registry/function object 等稳定依赖。依赖不得
  移入 input，也不得由 global/DOM/WeakMap 提供。
- active occurrence/address registry 是 runtime owner 的显式 capability，不得使用
  module-level mutable singleton/WeakMap。open/close 必须调用 runtime 所携 port 的
  reserve/get/commit/release/resolveHost；两个 runtime owners 可以分别打开同名
  `unitInstanceId`，hostOccurrenceRef 不得跨 owner 解析。
- active occurrence registry 拒绝重复 `unitInstanceId`，不覆盖旧 handle。
- `openDocument` 对 inline definition 禁止 source override；对 external definition
  只允许 `externalSourceRef` 替换 UI-free domain source。
- input 只允许携带 `hostOccurrenceRef`。存在时必须由首参 runtime 的 occurrence
  registry 解析 parent；not-found/kind mismatch 失败关闭。缺失时，首参 runtime
  是唯一 top-level parent authority，不再接受第二份 raw hostRuntime。
- 同一 FQN 的两个 Document instances 必须拥有不同 Scope/runtime/registry
  namespace。
- open 在 assembly 前将静态 `DocumentAddressDescriptor` 纯绑定为
  `DocumentInstanceRef(unitInstanceId, role, xId)`，通过 handle/assembly input
  暴露；不得修改 definition plan，也不在此阶段制造 Presenter/DOM/writer 或
  opaque mounted target。
- 嵌入 Component 的 root runtime parent 是当前 Document occurrence Scope，
  不是全局 host runtime；child occurrence id 由专用 formatter 根据 parent
  InstanceRef 与 compile descriptor 派生，不使用裸字符串拼接。
- lifecycle 只有 `closeDocument` 一个关闭入口，handle 不携带可执行 callback。
- open/close 都是异步 processor。open 的任一步失败都必须逆序回滚已创建的
  occurrence record、child occurrences、Scope runtime 与 registry namespace；
  不返回半成品 handle。
- close 校验 lease 并级联 dispose child occurrences、Scope assembly 与 registry
  namespace；旧 close 不能关闭后续重开的 occurrence。
- occurrence assembly 返回的 root、Capsule 与 Component Scope runtime 必须实现
  `DocumentOccurrenceRuntime` 并可见同一个 owner-local
  `documentOccurrences` port；mismatch 导致 open 失败并回滚。
- close 完成后，该 occurrence 的 instance registry namespace 必须为空；不能只删
  occurrence record 而泄漏 address target entries。

Runtime 动态处理仍遵守：

```text
output = fn(runtime, input, config)
output = fn(runtime, instanceRefs, input, config)
```

## 8. Package ownership

```text
dg-cell-mvi-halfcode-contract
  Unit/Document contracts + refs + plans + diagnostics
            |
            v
dg-cell-mvi-halfcode-logic
  Document compile plan + identity/scope checks
            |
            v
dg-cell-mvi-halfcode-support
  XNL loader + instance registry + runtime assembly
```

- contract/logic 不依赖 xnl-core、Vue、DOM、Tiptap 或 persistence。
- support 可以适配真实 XNL source，但不接受 mutation。
- renderer/Workbench 接入属于后续 Track。

## 9. 验证矩阵

- Contract/type tests：Document 独立 boundary、URI round-trip、非法 segment、
  legacy `HalfcodeDocument` 命名隔离。
- Loader tests：注册、kind/FQN mismatch、子域唯一性、原始 XNL 保留、
  Component/Capsule 抽取、未知领域 tag 不被误判为 UI atom。
- Compiler tests：Document plan、root/Capsule Scope、document embed、默认/显式
  `x-id`、multi-role、duplicate diagnostic。
- Runtime tests：同一 FQN 的两个 occurrence assembly、两个 unit namespaces、
  duplicate、unmount/remount stale token、inherited Scope runtime、嵌入
  Component parent、not-found。
- Authority tests：不同 runtime owners 可复用 unitInstanceId 且 host ref 不跨
  owner；open 绑定静态 descriptors；inline override 拒绝、external override 只
  改 effective source，不改 definition Scope/address plan。
- XNL identity characterization：使用真实 xnl-core diff 验证相同 #id 的节点移动
  被识别为 move，#id 不产生普通 payload 更新；x-id 属性变化不改变 tree
  identity，也不参与节点对齐。
- Exhaustive tests：公开 `FRONTEND_UNIT_KINDS`、`FLOW_UNIT_KINDS`、`UNIT_KINDS`
  为 UnitKind 单一常量源；root-tag/manifest/scheme/loader dispatch 使用
  `satisfies Record<...>` 或 `assertNever`，逐项覆盖 Page、Component、Document
  与四类 Flow。
- Regression：Page/Component/四类 Flow、v2 compiler、现有 fixture 和所有三个
  package typecheck。
- Residue：contract/logic 无 xnl-core/UI/DOM/Tiptap/VFS writer；实现中无
  `querySelector`/`getElementById` instance dispatch。

## 10. 风险

- 把 Document 当 Page：由无 URL contract、路由只接受 Page 的负测试约束。
- 把任意领域节点当 UI element：由专用 Document skeleton 与未知 tag 测试约束。
- 双身份混淆：由 `#id` move identity 和 `x-id` registry 两套独立测试约束。
- 第二事实源：DocumentUnitPlan 只引用 source，不保存 accepted copy。
- stale unmount：由 owner token/generation 测试约束。
- concurrent open/close：active occurrence id reservation 必须先于异步装配，失败
  回滚 reservation；同 id 并发 open 只能有一个成功。
- exhaustive switch 漏改：由全仓 typecheck 与 UnitKind residue scan 约束。
