# Mission Design：XNL 可编程文档与投影编辑平台

## 1. 控制目标

Mission 要把当前分散的 SchemaEditor、Flow mutation、Tiptap 扩展、Halfcode
Runtime 和 XNL VFS/VCS 能力收敛为一套可复用平台：

```text
Domain XNL + Presentation + code-owned Dialect
                    |
                    v
            XnlProjectionEditor
                    |
       +------------+-------------+----------------+
       |                          |                |
       v                          v                v
SchemaEditor Presenter      Tiptap Presenter   Graph/Custom Presenter
       |                          |                |
       +------------- ProjectionPlan -------------+
                                  |
                                  v
                       Halfcode Document Unit
                                  |
                 Scope + Runtime + Capsule + Component
                                  |
                                  v
                     ValueHost + XNL Mutation owner
                                  |
                                  v
                           XNL VFS + VCS
```

Mission 负责跨 track 的期望态 DAG、证据观察和受控重规划。规范、代码、迁移、
测试与 demo 均由 `mission.xml` 中绑定的真实 track 承担。

## 2. 领域词汇

| 词汇 | 定义 |
|---|---|
| Domain XNL | 某领域的权威 XNL 数据，不包含不属于该领域的视图实现 |
| Document Unit | Capsule 能力的具名文档发布形态，可独立注册、嵌入并拥有 root Scope |
| RichDocument | 面向富文本/块文档的一种 Domain XNL Dialect |
| Dialect | 代码侧分类、投影转换和交互翻译策略，通过 Runtime/Scope 绑定 |
| Presentation | 纯数据的展示覆盖，只引用 stable presenter id，不嵌入组件实现 |
| ProjectionPlan | renderer-neutral、可重建的投影 IR |
| Presenter | 将 ProjectionPlan 节点呈现为 Tiptap、SchemaEditor、Graph 或组件的 adapter |
| Interaction | 用户、Agent 或嵌入区块产生的标准化编辑意图数据 |
| Domain Command | 由 Dialect 从 Interaction 翻译出的领域操作请求 |
| Candidate XNL | 在 accepted base 上应用 Domain Command 后得到的临时候选事实 |
| Accepted Snapshot | ValueHost 在特定 revision 接受的唯一 live 权威投影 |
| `#id` | XNL 领域节点的持久身份，服务 diff、move、mutation 和引用 |
| `x-id` | 某个投影实例在 Scope Runtime 中的地址，服务 Command/Invocation/Event 路由 |
| InstanceRef | 由 unit instance、projection role 与 `x-id` 组成的稳定运行时目标引用 |

## 3. Capsule、Page、Component 与 Document

现有前端公理继续保持 Capsule 是唯一内联封装原语。新增 Document 后，具名 Unit
关系调整为：

```text
Capsule
├── Component Unit：props/slots 边界
├── Page Unit：URL shape 边界
└── Document Unit：document source/revision/mode/parameters 边界
```

因此：

- Capsule 仍只内联出现在元素/文档树中，不进入 `Units` 注册表。
- Page、Component、Document 是可独立成文件或文件夹的 FQN Unit。
- AppBundle `Units` 新增 `kind="document"`，派生
  `document://<FQN>` 注册表。
- Document 不伪装成 Component，也不继承 Page 的 URL contract。
- Document root 自身形成 Scope 边界；嵌入的 Capsule 沿文档/元素树自然继承
  和覆盖 Runtime capability。

概念性 DSL 草案如下；正式语法由对应 track 在 DSL 文档与 fixture 中冻结：

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

Document 的 `[]` 是有序领域内容；`()` 只承载按子域唯一出现的 Contract、Scope、
Presentation 等概念：

```xnl
<Document #dg.docs.demo.SystemDesign (
  <DocumentContract {
    mode = "edit"
  }>
  <Scope #document-root {
    runtime = "runtime-instance://#document-runtime"
  }>
  <DocumentPresentation {
    ref = "document-presentation://#system-design"
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

该草案遵守 XNL 习惯：普通配置放 `{}`，有序内容放 `[]`，每种唯一子域概念在
`()` 中只出现一次。

## 4. 两种文档模式

### 4.1 可编程文档

当交互区块本身就是文档语义的一部分时，Domain XNL 可以显式包含 Halfcode
Component 或 Capsule：

```text
RichDocument
├── Heading
├── Paragraph
├── ArchitectureCanvas Component
├── Review Capsule
└── AgentStatus Component
```

这些区块跟随 Document root Scope 获取 Runtime、Effect、DataGraph 和消息能力。
区块本地 UI state 不是文档事实；只有通过 Document mutation port 接受的变化
才进入 Domain XNL。

### 4.2 纯领域 DSL 投影

当编辑对象是 BO、本体、系统设计、配置或其他领域 DSL 时，源文件必须保持
UI-free：

```xnl
<SystemDesign #order-system [
  <Service #orders {
    owner = "order-team"
  }>
  <Service #payments {
    owner = "payment-team"
  }>
  <Dependency #orders-to-payments {
    from = "orders"
    to = "payments"
  }>
]>
```

外部 Presentation 可以把同一份 Domain XNL 投影为：

- 描述和叙事字段：Tiptap Presenter；
- 服务属性：SchemaEditor Presenter；
- 依赖关系：Graph Presenter；
- 状态与操作：Halfcode Component Presenter；
- 领域专属视图：Custom Presenter。

领域 DSL 不引用 Vue 组件或 Presenter implementation。不同业务 Scope 可以对
相同领域节点绑定不同 Dialect 和 Presenter 实现。

## 5. XNL Projection Editor

### 5.1 分层

`XnlProjectionEditor` 是 SchemaEditor 的上层通用基座，而不是其重命名：

```text
XnlProjectionEditor
├── SchemaEditor
├── TiptapDocumentEditor
├── CtrlFlowEditor       # 后续可接入，不是本 Mission 的重写目标
├── DAGFlowEditor        # 后续可接入，不是本 Mission 的重写目标
└── CustomDomainEditor
```

SchemaEditor 继续拥有结构表单语义和
`value.set/collection.insert/map.rename-key/...` 命令。通用基座只定义：

- 领域节点分类和递归投影；
- stable presenter id 解析；
- Interaction 到 Domain Command 的翻译；
- Candidate、diff、diagnostic 和 provenance；
- revisioned ValueHost 接受协议。

它不预设所有领域都能表达成 object/array/map/union。

### 5.2 标准处理公式

所有动态处理器遵守：

```text
output = fn(runtime, input, config)
```

顶层链路为：

```text
plan =
  compileProjection(runtime, { domainXnl, presentation }, { dialectId })

view =
  renderProjection(runtime, { plan, acceptedSnapshot }, { surfaceId })

command =
  translateInteraction(runtime, { plan, interaction }, { dialectId })

candidate =
  materializeCandidate(runtime, { acceptedSnapshot, command }, { mode })

mutations =
  diffDomain(runtime, { base: acceptedSnapshot, candidate }, { identityMode })

result =
  submitProjectionEdit(runtime, { revision, command, mutations }, { validationMode })
```

交互式实例调用使用 DEPA 的目标扩展：

```text
output = fn(runtime, targets, invocation, config)
```

其中 `targets` 是由 `x-id` 解析出的稳定 InstanceRef 集合，`invocation` 只描述
“做什么”，Runtime 负责可见性、权限、批处理和消息投递。

### 5.3 递归投影

递归属于 compile runtime，不作为临时 callback 塞入 input/config：

```text
compile(node, context)
  = resolveTransformer(
      runtime.dialect,
      classify(runtime, { node, context }, classifierConfig),
      presentationFor(node)
    )(
      runtime.at(node),
      {
        node,
        context,
        children = node.children.map(child => runtime.compile(child))
      },
      resolvedTransformerConfig
    )
```

概念公式：

```text
P_R(node, context)
  = T_resolve(R, node, context)(
      R_at_node,
      node,
      map(P_R, children),
      presentation
    )
```

实际 TypeScript API 仍保持三参数 `fn(runtime, input, config)`；上式只是表达递归
数据关系，不新增第四参数。

### 5.4 双向规律

实现应以 property/round-trip 测试验证至少两条规律：

```text
GetPut：
没有发生编辑时，project -> lower/parse -> domain 不改变规范化后的 Domain XNL。

PutGet：
一个被接受的领域编辑重新投影后，呈现结果与该 Interaction 的语义一致。
```

对于无法无损投影的 Presenter，必须显式产生 lossy diagnostic，不能静默丢失
领域信息。

这两条规律按 owner 分阶段验收：

- Projection foundation 只验证确定性递归投影、身份、显式 lossy/unsupported
  diagnostics 和 Domain Command proposal；compile + proposal 不算
  GetPut/PutGet。
- Revisioned authoring session 在 accepted writer 链路上验证
  `Interaction -> Command -> Candidate -> diff/dry-run/validate -> accept ->
  reproject` 的 PutGet 语义一致性。
- Tiptap Presenter 同时具备 lower/parse、Presenter 与 accepted authoring
  链路后，再成对验证完整 GetPut 与 PutGet。

## 6. 身份与 `x-id` 实例寻址

### 6.1 身份分工

| 身份 | 生命周期 | Owner | 用途 |
|---|---|---|---|
| XNL `#id` | 跨保存稳定 | Domain XNL | diff、move、mutation、领域引用 |
| `x-id` | 运行实例稳定 | Document/Projection runtime | Command、Invocation、Event、选中与实例定位 |
| Unit FQN | 跨 bundle 稳定 | AppBundle registry | 类型/制品引用 |
| DOM `data-x-id` | 单次 render | Presenter | 调试、可访问性、事件回溯 |

规则：

- 可编辑结构节点必须有稳定 `#id`。
- 可交互实例必须有 `x-id`。
- 未显式声明时，单一投影角色使用 `x-id = #id`。
- 同一领域节点出现多个投影实例时，`x-id` 必须加入 projection role 或容器
  instance namespace。
- `x-id` 在一个 Document Unit instance 的地址空间内唯一；重复产生结构化
  diagnostic，不采用“最后一个 DOM 元素获胜”。
- DOM 属性只是映射，任何 dispatch 都先经过 Runtime instance registry。

### 6.2 InstanceRef

运行时将局部 `x-id` 提升为完整目标引用：

```ts
interface DocumentInstanceRef {
  unitInstanceId: string
  xId: string
  projectionRole?: string
}

interface AddressableInstance {
  ref: DocumentInstanceRef
  documentNodeId?: string
  unitFqn?: string
  scopeId: string
  runtimeInstanceRef: string
  presenterId: string
}
```

序列化 URI 的最终形式由 DSL/contract track 冻结；在此之前不让 DOM selector
或临时数组下标成为外部协议。

### 6.3 消息与 Mutation

- 入站同步请求使用 Command/Invocation；跨 Actor、需要排队或重试时使用
  Message。
- 出站事实使用 Event。
- `Action` 只可作为某 Presenter 内部交互词，不新增为与 Halfcode Command/Event
  竞争的全局消息原语。
- `x-id` 是消息目标和 mutation 来源身份；最终 XNL Mutation 必须落到 `#id`
  或规范 XNL path。
- 自定义区块只能调用注入的 `requestDocumentEdit` port，不能直接持有 AST、
  VFS client 或 ValueHost writer。

## 7. 单向 Authoring 与事实源

### 7.1 事实等级

| 数据 | 等级与角色 |
|---|---|
| ValueHost accepted Domain XNL + revision | 活跃编辑会话唯一 live authority |
| XNL VFS/VCS source | 可恢复的持久事实；由 accepted result 的持久化 effect 更新 |
| Candidate XNL | 可丢弃的事务候选 |
| XnlMutation proposal | 不可变操作数据，尚非 accepted fact |
| ProjectionPlan | 可由 Domain XNL + Presentation + Dialect 重建的 IR |
| ProseMirror/Tiptap state | Presenter local draft/projection |
| Vue state / DOM | 最低层视图和交互状态 |

VFS/VCS 与 live ValueHost 不是两个并行写入者。会话打开后，ValueHost 管理 revision
和接受；持久化 adapter 只将 accepted result 写入 VFS/VCS，并把成功/失败反馈
回会话。

### 7.2 唯一链路

```text
Human / Agent / Embedded Halfcode Block
  -> Interaction { sourceXId, actor, correlation, payload }
  -> Dialect.translate
  -> Domain Command
  -> Candidate XNL
  -> diff(base, candidate)
  -> XnlMutation[]
  -> dry-run apply
  -> syntax/schema/reference/policy validation
  -> ValueHost accept | reject | conflict
  -> accepted snapshot + next revision
  -> VFS persist + optional VCS commit
  -> reproject all affected presenters
```

约束：

- dry-run 与真实 apply 使用同一 mutation 引擎。
- 一次语义编辑产生一个原子 mutation batch。
- stale revision 必须返回 conflict，不能覆盖 accepted snapshot。
- persistence failure 不允许让 UI 假装已经持久化；session 明确区分 accepted-live
  与 persisted revision。
- Presenter local draft 可以为 IME、拖动、弹窗或组合输入暂存，但不能被其他
  Presenter 当作领域事实读取。

## 8. Tiptap Adapter

### 8.1 定位

Tiptap 是文档型 Projection Surface，负责：

- 将 RichDocument/Document ProjectionPlan 转为 ProseMirror schema 和 document；
- 将 Tiptap transaction 归一化为 Interaction；
- 为 marks、text blocks、tables、code blocks、Mermaid 和嵌入区块提供 adapter；
- 在 NodeView 中托管 Halfcode Component/Capsule projection；
- 保持选择、IME、undo/redo 和 local draft 的编辑体验。

它不负责：

- Domain XNL 的最终写入；
- VFS/VCS 持久化；
- Scope capability 的全局注册；
- Agent proposal 接受；
- 通过 HTML/DOM 反向推导权威 XNL。

### 8.2 数据转换

推荐直接转换：

```text
Domain XNL AST <-> RichDocument model <-> ProseMirror/Tiptap model
```

HTML 仅用于导入、导出或展示兼容，不是正常 authoring round-trip 的中间事实源。

- 块级结构节点保留 `#id`，支持 move/insert/delete 的可读 mutation。
- inline text/mark 不要求每个字符有 id；编辑可在最近稳定块边界内生成最小合理
  candidate diff。
- 嵌入 Halfcode 区块的 NodeView 获得只读 snapshot、InstanceRef、dispatch
  capability 和 requestDocumentEdit port。
- 旧实现中对 `table:not([x-id])` 的 DOM 查询式补 id 必须移除；id 在 model
  创建和 mutation 阶段产生并持久化。

## 9. Presenter 与 Presentation

Presentation 是纯数据：

- 匹配 domain tag/path/semantic type；
- 选择 stable presenter id；
- 配置布局、只读/编辑模式、折叠、分组和序列化 options；
- 定义一个领域节点可投影到哪些 role；
- 允许按 Scope overlay。

Presentation 不包含：

- Vue component constructor；
- Tiptap extension instance；
- transformer function；
- ValueHost/VFS writer；
- 业务 effect implementation。

Presenter implementation 通过 Scope Runtime registry 绑定：

```text
stable presenter id
  -> current Scope binding
  -> code-owned Presenter implementation
```

推荐解析优先级：

```text
explicit Presentation role binding
> scoped business semantic binding
> dialect default binding
> structural fallback binding
> unsupported diagnostic
```

不存在静默 raw JSON、HTML 或纯文本降级；任何通用 fallback 必须是显式选择的
Presenter。

## 10. Halfcode 微型应用

一个可运行 XNL bundle 可以包含：

```text
AppBundle
├── Page host / routes
├── Document Units
├── Component Units
├── Capsule scopes
├── Runtime instances
├── Effect/DataGraph bindings
├── Command/Event contracts
├── Projection Dialect/Presentation refs
├── Domain XNL sources
├── seed/config/resources
└── VFS/VCS persistence adapter bindings
```

Document 可以：

- 由 Page 或 Component 嵌入；
- 嵌入其他 Component/Capsule；
- 在同一 Document root Scope 中复用或覆盖上层 capability；
- 作为 bundle 的主要产品体验运行。

是否让 Route 直接指向 `document://` 不属于当前基线。Document 保持自己的
DocumentOpenContext；标准 Page host 可以把 URL 输入转换为该 context。

## 11. AI Agent 协作

Agent 与人类共享同一 authoring protocol：

```ts
interface EditProposal {
  actor: string
  baseRevision: number
  correlationId: string
  target?: DocumentInstanceRef
  command?: DomainCommand
  mutations?: XnlMutation[]
  rationale?: string
}
```

要求：

- Agent 不直接写 Tiptap JSON、DOM 或 Presenter local state。
- Proposal 必须基于明确 revision，可先 dry-run 和投影预览。
- Human/Policy Runtime 可以 accept、reject、request-change 或解决 conflict。
- accepted mutation metadata 保留 actor、correlation、source `x-id` 和理由。
- VCS commit 是 persistence effect，不作为 live session 是否接受的判断捷径。
- 不同 Agent 的工具权限、可见节点和允许命令由 Scope Runtime capability 控制。

第一阶段使用 revision gate 和显式 conflict；CRDT/OT 只有在真实并发需求证明
必要时才进入后续 track。

## 12. 历史模型映射

该设计综合而不照搬以下工程思想：

- Projectional/Structured Editor：编辑领域结构的投影，不把表层文本当事实。
- Bidirectional Transformation/Lens：投影与编辑回写满足 GetPut/PutGet 规律。
- Attribute Grammar：context/presentation 是 inherited attributes，
  ProjectionPlan/diagnostics 是 synthesized attributes。
- Compiler IR/Lowering：Domain XNL -> ProjectionPlan -> Presenter surface。
- Language Workbench：同一领域语言可配置多种投影和编辑方式。
- Notebook/Block Editor：文档中混合正文、计算和交互区块。
- MVI/DEPA：UI 只发 Command，单一 owner 接受，Effect 经 Runtime 注入。

## 13. 包和代码所有权

稳定所有权约束：

- `dg-cell-mvi` 拥有 XNL Projection contracts、logic、support、Halfcode Document
  DSL/runtime 和 renderer bridge。
- Tiptap 依赖必须隔离在专门的 Vue adapter capsule/package，不能进入
  renderer-neutral contract/logic/support。
- Workbench 拥有产品 Dialect、Presentation、demo bundle、Agent 交互和宿主
  VFS/VCS adapter，不拥有通用 compiler。
- `xnl.ts` 继续拥有 XNL parse/diff/apply/VFS/VCS 原语；本 Mission 优先适配其
  公共能力，不复制 mutation 或版本管理引擎。
- `#id` 是 identity-based diff 对齐节点与识别 move 的键，不是参与普通字段
  比较或更新的 payload。基线调查确认 authoring 所需的 clone-based dry-run、
  mutation precondition、move parity、identity uniqueness、节点类型变化语义，
  以及持久化 expected revision/CAS/receipt 尚未形成稳定公共契约。这些能力
  必须先由 `xnl.ts` corrective tracks 完成，不能在 dg-cell-mvi 或 Workbench
  adapter 中补做。

首个 foundation track 根据实际依赖图决定是：

```text
在现有 halfcode contract/logic/support 中增加 projection-editor capsule
```

还是：

```text
拆分 dg-cell-mvi-xnl-projection-* packages
```

无论物理包如何选择，都必须维持：

```text
contract <- logic <- support <- renderer adapter <- product integration
```

Tiptap adapter 倾向独立为 `dg-cell-mvi-halfcode-tiptap-vue`，最终名称以 track
中的依赖和发布面证据为准。

## 14. 三档使用

1. **标准 RichDocument**
   - 使用预制 RichDocument Dialect、Presentation 和 Tiptap Presenter。
   - 适合普通文档展示与编辑。
2. **可编程 Document App**
   - 文档显式嵌入 Halfcode Component/Capsule，配置 root/nested Scope。
   - 适合高度动态、富交互的展示和编辑平台。
3. **领域 DSL 工作台**
   - 提供自定义 Dialect、Presentation 和 Presenter registry。
   - 源 DSL 保持 UI-free，可组合 Tiptap、SchemaEditor、Graph 和业务组件。
   - 适合 BO/本体/系统设计/配置/其他 DSL 的通用查看编辑与 Agent 协作。

三档共用相同的 InstanceRef、Interaction、Domain Command、ValueHost、
XNL Mutation 和 VFS/VCS 边界。

## 15. 前置关系与反馈飞轮

`build-schema-driven-halfcode-editor` 已沉淀：

- serializable StructureSchema/EditorPresentation；
- renderer-neutral EditorPlan；
- runtime-first Dialect；
- ValueHost/SchemaEditorSession；
- presenter registry；
- Flow XNL mutation adapter 的真实反馈。

本 Mission 的首个基线动作必须验证这些公共边界是否稳定。新基座不能简单把
SchemaEditor 改名，也不能破坏前置 Mission 尚在完成的 structured-value 与
predicate authoring。

基线验证后的执行前置关系是：

```text
Projection foundation ─┐
Document Unit ──────────┼─> Revisioned XNL Authoring Session
XNL mutation + VFS/VCS ─┘
```

其中 XNL 分支由 `xnl.ts` 项目拥有，并拆分为 mutation correctness 与
revision-aware persistence 两个 tracks。三个前置分支可以并行，但 Authoring
不得绕过任一分支提前宣称 atomic、revisioned 或 recoverable。

反馈飞轮：

```text
foundation contract
  + XNL mutation/persistence primitives
  + Document DSL/runtime
  -> authoring session
  -> Tiptap adapter
  -> Workbench programmable document
  -> pure domain DSL editor
  -> Agent collaboration
  -> evidence 回流 foundation corrective track
```

## 16. 受控重规划

以下 evidence 可以触发 Mission 重规划：

- XNL 当前 diff/identity 无法稳定表达文档块 move 或局部文本变化；
- Document Unit 无法在不破坏 Capsule 公理的情况下复用现有 Unit loader；
- Tiptap transaction 无法可靠归一化为当前 Domain Command 契约；
- 多 Presenter 对同一 domain node 的编辑暴露新的 conflict/role identity；
- Workbench demo 证明 `#id` 与 `x-id` 默认映射不足；
- VFS/VCS adapter 的事务边界与 ValueHost revision 无法一致；
- Agent proposal 需要超出 revision gate 的真正并发合并；
- 当前 package 边界造成 Tiptap/Vue 依赖泄漏到 contract/logic。

每次重规划必须：

- 写 `reports/replan-*.md`；
- 记录触发 evidence、actual state、desired state 和 DAG diff；
- 递增 `mission.xml` Revision；
- 只新增或修订受影响的真实 track；
- 不以 DOM 直写、HTML round-trip、全量 JSON 替换或 renderer-owned writer
  作为赶进度的降级方案。

## 17. 风险与门禁

- **第二事实源**：测试确保 Tiptap/DOM/ProjectionPlan 不反写或绕过 ValueHost。
- **身份漂移**：duplicate `#id`/`x-id`、多 role 和复制粘贴都必须有显式策略。
- **抽象混合**：Domain XNL、Presentation、Dialect implementation 和 Presenter
  implementation 分包并做 dependency residue scan。
- **Document 变成 Page 别名**：DocumentContract 不拥有 URL shape。
- **SchemaEditor 绑架通用基座**：至少用一个非结构表单领域投影证明通用性。
- **Tiptap 绑架文档事实**：round-trip/property tests 从 Domain XNL 开始和结束。
- **嵌入区块越权**：NodeView 只拿 capability port，不拿 AST/VFS writer。
- **Agent 覆盖人工修改**：所有 proposal 强制 base revision 和 conflict 结果。
- **只做 demo 不形成标准**：每个产品 track 必须回指 contract/behavior 和 loader
  测试，不能只在 Workbench 私有代码中闭环。

## 18. 控制论模型

- desired state：`mission.xml` 中从基线、通用投影基座、Document Unit、
  authoring session、Tiptap adapter、Workbench 产品到 Agent/DSL 验证的 DAG。
- actual state：`dg-cell-mvi` contracts/logic/support/runtime/docs/tests，现有
  SchemaEditor Mission 状态，Workbench Tiptap/Flow mutation/VFS/VCS 代码和
  浏览器运行证据。
- actuation：创建、执行、验证和归档真实 track；证据表明边界失效时受控修订
  Mission DAG。
- feedback：contract/property/unit/typecheck/build/browser E2E、mutation residue
  scan、DEPA review、用户手动体验和 Agent conflict 场景。
