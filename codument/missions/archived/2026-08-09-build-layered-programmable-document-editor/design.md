# Mission Design：分层可编程文档编辑器

## 1. 控制目标

Mission 将文档能力分成四层，并保持 owner 单向依赖：

```text
L1 RichDocument semantic foundation
   contract + validation + mutation + authoring
                     |
                     v
L2 Tiptap presenter and reusable document editor
   canonical extensions + draft adapter + toolbar plan + tool registry
                     |
                     v
L3 Halfcode document composition
   Document Unit + Scope + Runtime + Component/Capsule occurrence
                     |
                     v
L4 Workbench programmable-document product
   insertion palette + VCS checkout + Agent collaboration + inspector
```

Mission 负责期望态 DAG、跨项目反馈和受控重规划。每一层的规范、代码与测试都由
`mission.xml` 绑定的真实 track 落地。

## 2. 事实源和 authority

| 层 | 权威事实 | 非权威投影 |
|---|---|---|
| 文档领域 | accepted RichDocument XNL + live revision | HTML、DOM、Tiptap JSON |
| 本地编辑 | Tiptap transaction/local history | toolbar active state、selection |
| 持久化 | revision-aware VFS working tree | VCS history list、inspector text |
| 历史 | append-only VCS commits | checkout preview |
| 动态区块 | Document occurrence + root Scope runtime | NodeView DOM/Vue local state |
| Agent | revisioned proposal + review decision | prompt UI、streaming text |

任何变化只有经过 authoring owner 接受后才能成为 live fact；Presenter、工具按钮、
NodeView 和 Agent 都只能提交 interaction/command/proposal。

## 3. L1：传统文档领域语义

新增能力按领域语义而非 Tiptap extension 名称建模：

| 能力 | canonical 语义 |
|---|---|
| underline | text mark `underline` |
| text alignment | paragraph/heading 的 `align = start|center|end|justify` |
| text color | text mark `text-color { color }`，颜色规范化并校验 |
| highlight | text mark `highlight { color? }` |
| task list | `task-list` / `task-item { checked }` block family |
| horizontal rule | leaf block `horizontal-rule` |
| hard break | inline leaf `hard-break` |
| enhanced code block | 保留 `language + text` 为领域事实；copy、highlight、fold 等为 Presenter capability，只有需要持久化的配置才进入领域模型 |

这些节点和 marks 必须进入 materializer、validator、XNL adapter、projection、transaction
normalizer、identity allocator 和 semantic translator。未知或不安全属性 fail closed，
不能降级成 HTML。

## 4. L2：通用文档编辑组件

通用组件不是 Workbench 页面，而是受宿主 authority 控制的 Presenter capsule：

```text
editor = createXnlDocumentEditor(
  runtime,
  {
    document,
    acceptedObservation,
    presentation
  },
  { schemaId, staleDraftPolicy }
)
```

动态代码继续遵守：

```text
output = fn(runtime, input, config)
```

其中 `runtime` 承载 host authoring port、tool/presenter registry、clipboard 与 syntax
highlighting effect 等长生命周期能力；`input` 只承载本次 accepted observation 与
Presentation。`acceptedObservation` 只用于 reproject/correlation，不把 revision authority
交给 adapter；host 在接受 interaction 时读取自己的 live revision。

组件内部只能由一条真实 Tiptap `Editor`/`EditorState` lineage 拥有 selection、composition、
undo stack、浮动菜单等本地状态，并复用既有 bind/apply/settle/undo/redo/reproject lifecycle，
不能建立平行 draft store，也不能成为 Domain XNL、VFS 或 VCS writer。

### 4.1 Presentation 与工具注册表

`DocumentEditorPresentation` 是可序列化数据，只引用 stable id：

```ts
interface DocumentEditorPresentation {
  id: string
  toolbar: {
    groups: Array<{
      id: string
      tools: Array<{
        id: string
        presenter?: { id: string; options?: SerializableRecord }
        visibleWhen?: SerializablePredicate
      }>
    }>
  }
}
```

具体实现保留在代码 registry：

```text
ToolbarPlan = compileDocumentEditorPresentation(
  runtime,
  { presentation, capabilities, editorContext },
  { unknownToolPolicy: "diagnostic" }
)

ToolResult = invokeDocumentEditorTool(
  runtime,
  { toolId, editorHandle, input },
  { correlationId }
)
```

Presentation 不嵌入 Vue component、Tiptap command closure 或 effect implementation。
业务 Scope 可以组合默认 dialect/registry，并按相同 stable id 覆盖具体 presenter。
同 id 的 Presenter override 只能改变呈现，不能替换 canonical tool command 语义；新增
host tool 必须使用独立 id 与 capability grant。`ToolbarPlan` 必须是 immutable、递归可序列化
的 data-to-data 编译结果，不含 Vue/Tiptap/DOM/effect 对象；未知、重复或 accessor-backed
配置产生确定性 diagnostics。

### 4.2 通用工具分组

- history：undo、redo；
- block：paragraph、heading、blockquote、lists、task list、horizontal rule；
- inline：bold、italic、underline、strike、code、link、color、highlight；
- alignment：start、center、end、justify；
- insert：image、table、hard break、code block、Mermaid；
- contextual：table row/column、link edit、code language/fold/copy；
- host extension slots：由上层 registry 提供，但必须经过 capability gate。

工具栏应支持分组、overflow、窄视口菜单、contextual visibility 和 tooltip；不能继续
依赖单行横向滚动隐藏能力。

## 5. L3/L4：可编程文档产品

### 5.1 Component/Capsule 插入

Workbench 提供 code-owned allowlist catalog。插入面板展示可见 descriptor，但实际
插入只产生标准 interaction，并由 host 分配 `#id`、派生 `x-id`、验证 ref 与 Scope
可见性。面板不接收 registry owner token 或直接 mutation writer。

### 5.2 VCS checkout

历史面板允许选择 commit、预览摘要和显式 checkout。Checkout 是产品 command：

```text
history.checkout
  -> read immutable snapshot
  -> candidate + validation
  -> persist VFS working tree
  -> reopen/reproject accepted session
```

VCS 不直接替换 live state，也不与 VFS 并列成为启动恢复源。

### 5.3 AI Agent 协作

复用现有 Agent proposal/review 基座，在 Programmable Document 中提供入口和状态面板。
Agent 输出 revisioned semantic command/XNL mutation proposal，携带 actor、base revision、
correlation 和 target identity；用户可以 preview、accept、reject，stale proposal 不覆盖
新事实。

### 5.4 Undo/Redo

Undo/Redo 属于 L2 通用编辑组件的历史能力，Workbench 只通过 Presentation 暴露。
撤销产生正常 Tiptap transaction，再走同一 semantic authoring 链，不能绕过 accepted
revision 或直接回退 VFS。

## 6. 受控重规划

执行时若 Workbench 集成暴露通用语义缺口，先记录 evidence，再把修复归入
`dg-cell-mvi` 的 corrective track；不得在 Workbench 私建第二套 RichDocument model、
toolbar compiler、transaction normalizer 或 direct writer。每次重规划必须写 report、
递增 Mission Revision，并验证修订后的 DAG。

## 7. 风险和门禁

- 新 marks/attrs 可能造成 transaction normalizer lossy：用 GetPut/PutGet、paste、IME、
  undo/redo 和 property fixtures 门禁。
- task list 与普通 list 的结构不同：用独立 canonical node family，不在 UI adapter 中
  猜测转换。
- enhanced code block 容易把 UI state 写入领域：只持久化 language/text 和明确批准的
  文档配置。
- 工具 Presentation 可能变成另一套组件 DSL：保持 stable id + serializable options，
  实现只存在 registry/runtime。
- registry override 可能越权替换 command：Presenter 只接收受限 editor-command facade，
  不接收 authoring port、allocator、session、VFS/VCS 或 raw DOM。
- responsive toolbar 可能只在 CSS 中“看起来可用”：G3 必须以真实浏览器宽/窄容器验证
  overflow reachability、contextual visibility、focus/keyboard、tooltip 与无横向滚动隐藏。
- Agent/VCS/embedded tools authority 过宽：所有上层入口必须通过受限 actor port 和
  revision gate。
- 当前 mission 跨两个仓库：外部 ProjectRef 只保存逻辑 id，workspace path 仅由执行
  session 临时绑定，不写入 mission 制品。
