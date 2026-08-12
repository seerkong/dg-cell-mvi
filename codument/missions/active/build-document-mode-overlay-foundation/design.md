# Mission Design：文档 Base Mode 与内嵌 Overlay

## 1. 控制目标

Mission 要把早期 Tiptap 封装中有价值的 edit/view 产品体验，重建为当前 Halfcode 体系中的
分层能力：

```text
L1 mode contracts and projection rules
   base mode + occurrence overlay + policy decision + diagnostics
                            |
                            v
L2 mode session actor and editor integration
   commands + subscriptions + Tiptap editable/context + lifecycle
                            |
                            v
L3 mode-aware Halfcode NodeView shell
   common chrome + restricted mode facade + nested inheritance
                            |
                            v
L4 Workbench programmable-document product
   document switch + per-embed switch + denied policy + E2E
```

Mission 负责期望态 DAG、跨仓观察和受控重规划。真实实现由四个 track 承担。

## 2. 术语与状态模型

### 2.1 三个彼此独立的概念

| 概念 | 含义 | owner |
|---|---|---|
| display mode | 当前投影以 `view` 或 `edit` 形态显示 | mode session actor |
| authoring permission | 是否允许进入 edit、修改配置、删除或提交内容 | runtime policy binding |
| application interaction | 微应用自身的查询、按钮、导航、业务 command/effect | Component/Capsule 自身 Scope/runtime |

`view` 不是“整个组件 disabled”。它只撤销 authoring surface。一个仪表盘、审批卡片或游戏
区块在查看态仍可响应业务交互，只要对应业务 capability 本身被授权。

### 2.2 Base 与 Overlay

```ts
type DocumentDisplayMode = 'view' | 'edit'
type EmbeddedDisplayModeOverlay = 'inherit' | 'view' | 'edit'

requestedMode(target) =
  target.overlay === 'inherit' ? document.baseMode : target.overlay
```

- `DocumentContract.mode`/open context 提供初始 base；打开后的动态 base 由 mode session 拥有。
- overlay 以 `DocumentInstanceRef.xId` 对应的 occurrence identity 为 key，不以 DOM、数组位置、
  component ref 或不稳定 Vue instance 为 key。
- 节点 move 保留 occurrence identity 和 overlay；replacement/copy 使用新 identity；unregister
  释放 overlay。
- 嵌套 Document/Capsule 以父 occurrence 的 effective mode 作为自己的 inherited base，内部
  occurrence 可以继续 overlay，形成递归但单向的 mode projection。

### 2.3 Policy 不是另一种 Mode

模式请求必须经过代码绑定的 policy：

```text
ModeDecision = evaluateDocumentDisplayMode(
  runtime,
  {
    documentRef,
    targetRef,          // document 或 occurrence
    inheritedMode,
    requestedMode,
    transition,         // observe | switch | clear-overlay
    capabilityContext
  },
  config
)
```

输出至少包含 `effectiveMode`、`allowedModes`、`canSwitch` 和可选拒绝原因。base/overlay 是 Data，
policy evaluator 是 Processor，身份/权限读取由 runtime Effect/Actor 提供。XNL 不嵌入函数、
用户对象或 ACL 实现。

默认策略可以允许一个具备 document edit grant 的宿主在 view/edit 间切换；严格产品可以绑定
class、泛型 runtime 或远端权限服务。权限变化时重新投影；若当前 edit 不再允许，effective
mode 立即降为 view，并中止未提交的 mode-local configuration draft，但不伪造 Domain edit。

## 3. Authority 与状态分层

| 状态 | 是否事实 | 默认持久化 | owner |
|---|---:|---:|---|
| accepted Domain XNL | 是 | VFS/VCS | document authoring capsule |
| initial mode declaration | 配置事实 | AppBundle/Document manifest | Halfcode definition owner |
| live base mode | session 事实 | 否 | DocumentDisplayModeSession |
| occurrence overlay | session 事实 | 否 | DocumentDisplayModeSession |
| effective/allowed mode | 派生投影 | 否 | policy + mode projector |
| component edit form draft | 局部临时态 | 否 | embedded presenter |
| business state | 取决于组件领域 | 由组件决定 | Component/Capsule actor |

模式命令走独立控制链：

```text
UI interaction
-> restricted mode command
-> policy evaluation
-> mode session transition
-> mode projection notification
-> editor/NodeView reproject
```

它不进入 RichDocument mutation 链。只有组件在 effective edit 下提交真实内容变化时，才继续：

```text
embedded edit intent
-> trusted host translation
-> candidate/diff/dry-run/validate
-> accept/reject/conflict
-> persist/reproject
```

## 4. Mode Session Actor

底层提供一个 renderer-neutral session protocol，而不是 Vue composable 真源：

```ts
interface DocumentDisplayModeSession {
  read(): DocumentDisplayModeSnapshot
  dispatch(command: DocumentDisplayModeCommand): Promise<ModeTransitionResult>
  subscribe(listener: (snapshot: DocumentDisplayModeSnapshot) => void): () => void
  registerOccurrence(ref: DocumentInstanceRef): ModeOccurrenceLease
  destroy(): void
}
```

标准 command：

- `document-mode.set-base`；
- `document-mode.set-overlay`；
- `document-mode.clear-overlay`；
- 可选 `document-mode.clear-all-overlays`，用于显式恢复全局继承。

每个 command 携带 correlation、target identity 和期望 transition。session 串行化并发命令，
拒绝 stale/unregistered target；UI 不能直接改 map。Snapshot 是冻结且可序列化的数据，不携带
policy closure、runtime、DOM 或 authoring port。

## 5. Editor 与 NodeView 投影

### 5.1 文档级 Base Mode

`XnlDocumentEditorInput` 接收 mode snapshot/observation，session 根据 effective document mode：

- 调用唯一 Editor lineage 的 `setEditable`；
- 重新编译 `editor.editable` condition 与 ToolbarPlan；
- view 时隐藏/禁用 authoring tools、selection affordance 和配置入口；
- 保持只读渲染、链接、复制、允许的 host tools 与业务交互可用；
- mode 切换不销毁 Editor、NodeViews、selection history 或 accepted observation。

### 5.2 内嵌 Component/Capsule Overlay

Halfcode NodeView host 在现有 exact readonly presenter facade 上增加受限 mode facet：

```ts
interface EmbeddedModeView {
  mode: 'view' | 'edit'
  source: 'base' | 'overlay' | 'policy'
  allowedModes: readonly ('view' | 'edit')[]
  canSwitch: boolean
}
```

嵌入代码只获得 mode view 和 `requestModeTransition` grant，不获得 mode actor、policy runtime、
occurrence registry owner token 或 Document authoring writer。

NodeView shell 统一提供：

- 类型/标题与当前模式提示；
- edit/view toggle 或受策略控制的菜单；
- overlay clear/inherit；
- edit-only config/delete affordance；
- policy denial tooltip/diagnostic；
- keyboard、focus、窄视口和无 hover 场景可达性。

shell 的呈现由 stable presenter id + registry 可覆盖；切换语义和 authority 不可由 presenter
override 替换。业务组件可根据 mode view 渲染阅读态与编辑态，组件特有 `split` 等子模式只在
effective edit 内存在。

## 6. Workbench 产品验证

Programmable Document 至少验证：

- 文档级 edit/view 动态切换，工具栏和正文同步变化；
- Counter Component 与 Counter Capsule 分别 overlay，不互相影响；
- clear overlay 后立即继承当前 base；
- 文档 base 切换时显式 overlay 保持，inherit occurrence 跟随；
- view 态仍可执行明确允许的 counter 业务 interaction，但 commit/config/delete 被拒绝；
- 一个 policy-denied occurrence 显示查看态且不能通过 DOM 或 command 绕过；
- reproject、节点 move、copy/replacement、unmount/remount、Undo/Redo 和刷新行为符合 identity
  与非持久化规则；
- mode-only 操作不改变 XNL source、live revision、VFS working tree 或 VCS history。

## 7. 受控重规划

执行中若 Workbench 暴露通用 mode、identity、policy 或 shell 缺口，先记录 evidence，再在
`dg-cell-mvi` 创建 corrective track；不得在 Workbench 私建第二套 mode enum、overlay store、
permission reducer 或 NodeView writer。若发现 `DocumentContract.mode` 当前语义与“initial base”
冲突，先通过 contract track 修订规范和 migration，再推进 renderer。

## 8. 风险与门禁

- **mode 被误当内容**：扫描 RichDocument/Tiptap attrs/XNL mutation，禁止 `isEditing` 等瞬时字段。
- **view 被误当 disabled**：分别测试 authoring action 与 business action，避免微应用失去交互。
- **permission 与显示混合**：policy 决定 allowed transition，base/overlay 不携授权含义。
- **多个 owner**：Vue ref、Tiptap editable、NodeView local state 都只能消费 mode session snapshot。
- **identity 泄漏**：overlay 绑定 occurrence identity；copy/replacement/move/unmount 有独立测试。
- **切换破坏 draft**：文档 mode 切换不重建 Editor；权限收回时对局部配置 draft 使用明确取消策略。
- **通用 shell 绑死产品样式**：底层拥有交互协议和默认可访问 shell，产品通过 presenter registry
  覆盖视觉，不复制 transition reducer。
- **递归 mode 循环**：只允许 parent effective mode 向 child inherited base 单向投影，child overlay
  不反写 parent。

