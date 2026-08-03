# 设计：Tiptap 浏览器 Authoring 原语

## 1. 事实与职责

| 层 | 职责 | 明确不拥有 |
|---|---|---|
| Domain XNL / authoring session | canonical document、revision、mutation acceptance、VFS/VCS persistence | DOM、Tiptap EditorView |
| Tiptap local draft | selection、composition、history、未接受的编辑投影 | Domain XNL、revision allocator、writer |
| Table browser primitives | 把用户动作转换为官方 Tiptap table commands | authoring、persistence、业务规则 |
| Mermaid NodeView | 观察节点 `source`，调用注入 render Effect，展示结果并发布 transaction | Mermaid 实现、Domain XNL、VFS、authoring submit |
| 产品 composition root | 选择并绑定安全 Mermaid renderer implementation | adapter 内部状态、Domain writer |

浏览器编辑链保持单向，并按 DEPA 分列：

**Data 血缘（只列数据）**

```text
browser invocation + local editor snapshot
  -> Tiptap transaction
  -> revision-free Interaction
  -> current-revision proposal
  -> candidate + mutation batch + validation facts
  -> accepted snapshot
  -> RichDocument projection
```

**Processor（只列逻辑）**

| Processor | Input data | Output data |
|---|---|---|
| Tiptap command | browser invocation + editor snapshot | transaction |
| transaction normalizer | transaction + before/after document | revision-free Interaction |
| trusted interaction translator | Interaction + current projection | Domain Command |
| authoring coordinator | proposal + accepted base | candidate/mutation/validation result |
| projection compiler | accepted Domain XNL | RichDocument/Tiptap projection |

## 2. Table 组合

优先复用 `@tiptap/extension-table` 的官方 schema behavior 与 commands，不手写表格拓扑操作。adapter 只负责：

- 组合 table/tableRow/tableCell/tableHeader extensions；
- 保留 RichDocument lowering/parse 所需的 `nodeId`、`colspan`、`rowspan`；
- 暴露稳定、可探测的 command surface；
- 保证所有结构变化仍是普通 Tiptap transaction，由既有 normalizer 发布 Interaction。

公共能力至少覆盖 insert/delete table、row/column insert/delete、merge/split cell、toggle header 与 cell selection/navigation。UI 工具栏不进入基础包。

## 3. Mermaid Effect 与 NodeView

动态代码遵守三参数协议：

```ts
type MermaidRenderEffect<TRenderRuntime extends object> = (
  runtime: TRenderRuntime,
  input: Readonly<{ source: string; requestId: string }>,
  config: Readonly<{ theme: 'default' | 'dark' | 'neutral' }>,
) => Promise<MermaidRenderResult>;

type MermaidDiagnosticEffect<TDiagnosticRuntime extends object> = (
  runtime: TDiagnosticRuntime,
  input: Readonly<{ diagnostic: MermaidDiagnostic }>,
  config: Readonly<Record<PropertyKey, never>>,
) => void;

interface MermaidNodeViewRuntime<
  TRenderRuntime extends object,
  TDiagnosticRuntime extends object,
> {
  readonly renderer: Readonly<{
    runtime: TRenderRuntime;
    effect: MermaidRenderEffect<TRenderRuntime>;
  }>;
  readonly diagnostics: Readonly<{
    runtime: TDiagnosticRuntime;
    effect: MermaidDiagnosticEffect<TDiagnosticRuntime>;
  }>;
}
```

正向装配只有一条：产品 composition root 创建 outer exact `MermaidNodeViewRuntime` facet，其中 renderer 与 diagnostics 是两个隔离的 Effect binding，各自持有自己的 opaque implementation runtime 与三参数实现。外层 facet/binding/input/config 由 factory 做 exact own-key 与 accessor-safe 运行时校验；内部 implementation runtime 可使用 object、class 和泛型，属于 trusted code-owned 依赖，不展开检查，也不伪称 TypeScript 结构类型能证明其没有私有能力。render implementation 只收到 renderer runtime，diagnostic implementation 只收到 diagnostic runtime；`source/requestId` 只进入单次 `input`，`theme` 只进入静态 `config`。NodeView factory 不接受零散 callback、renderer factory 或 config 函数。

领域分类如下：

- source/request/theme 到 render input 的转换是 adapter 内部纯 Processor。
- 调用外部 Mermaid renderer 被 adapter 视为 render Effect；即便某产品实现是纯函数，也绑定在同一个 Effect slot，不改变协议。
- DOM commit Effect 由 NodeView host 自己拥有，只能替换其私有 render container 的 children；它不进入产品 runtime，也不把 DOM target 交给产品实现。
- diagnostic sink 是产品 runtime 中独立 Effect，不能与 render result 或 DOM commit 混为一个隐式 callback。

NodeView host 只持有这个 exact renderer runtime 与自己的私有 DOM owner，不持有 raw Scope runtime、authoring session、VFS/VCS 或 mutation writer。

安全边界：

- 基础包声明协议与调用生命周期，不捆绑 Mermaid 库或 renderer implementation。
- render Effect 必须返回 `rendered | rejected` 结构化 union；`rendered` 携带与 input 匹配的 `requestId` 和 `SVGSVGElement`，`rejected` 携带 diagnostics，禁止 raw HTML/string。host runtime guard 至少拒绝 `script`、`foreignObject`、任意 `on*` attribute 与 `javascript:` href；通过 guard 的 SVG 也只能替换 NodeView host 私有 render container 的 children。不允许 `securityLevel: loose`。
- 每次 source 更新产生新 request identity；旧异步结果不得覆盖新 source。
- render rejection/throw 形成结构化 diagnostic，保留 source，不推进 Domain truth。
- destroy 后不得再写 DOM；清理只由 NodeView host 持有。

## 4. Source 编辑

Mermaid `source` 仍是 Tiptap node attribute。NodeView 内若提供 source 编辑入口，只能通过 `updateAttributes`/transaction 修改；不得直接修改 RichDocument/XNL。当前 normalizer 会拒绝 Mermaid attr change，因此本 track 必须新增明确的 Mermaid source semantic edit，并继续由 trusted authoring bridge 决定其是否被接受。

## 5. Public Capsule

包根是唯一公共入口，候选 API 按职责分组：

- canonical extension assembly：table + Mermaid + embeds；
- table command capability/inspection；
- Mermaid NodeView host factory 与 Effect/public facts types；
- existing projection、normalizer、draft、Halfcode NodeView exports。

Workbench 只从 package root 消费，不得 deep import。公共输入输出保持 readonly、可校验；Effect 实现只存在于产品 composition root。

单独的 Halfcode embed host 与 Mermaid host 都会返回一套完整 canonical extensions，
因此它们只适合单能力使用，**不得把两组 extensions 直接拼接**。共存场景由
`createXnlRichDocumentTiptapBrowserHost(runtime, input, config)` 作为唯一 registry owner：

```ts
runtime = {
  halfcode: halfcodeHostRuntime,
  mermaid: mermaidNodeViewRuntime,
}
input = { targets, occurrences }
config = { theme }
```

该 assembly host 复用两个专用 host 的内部 NodeView capability builder，但只调用一次
包内私有的 NodeView-aware canonical extension assembly，产生一套
table/Mermaid/Component/Capsule extensions。Package root 的
`createXnlRichDocumentTiptapExtensions()` 只保留无参数 canonical 用法，不能接收 raw
`NodeViewRenderer`；带 NodeView 参数的 builder 不从 package root 导出。
它不向产品暴露 raw NodeViewRenderer、extension 去重规则或 registry internals；outer
runtime wrapper 只允许 `halfcode/mermaid` 两个 own data fields，仍支持 class/prototype/
mixin carrier，两个内部 runtime 继续由各自 protocol 验证或保持 opaque。`dispose()`
共同收口两个 host lifecycle，Halfcode diagnostics 仍通过只读 snapshot 暴露，Mermaid
diagnostics 仍只经独立 Effect 发送。

## 6. 验证

- 真实 `Editor` 表格命令测试，不只检查 schema 名称。
- table lowering/parse/GetPut 与 transaction Interaction 测试。
- T3.1 host foundation 存在后，T3.2 先建立不被 factory absence 遮蔽的 Mermaid NodeView mount/update/destroy、stale async、structured rejection、request mismatch 与逐危险项 safe sink 红测，再实现转绿。
- package boundary、public typecheck、ESM/CJS import smoke。
- 仓内 package-root consumer probe 同时看到 table command/view、Mermaid NodeView/Effect 和既有 Component/Capsule lifecycle；Workbench alias 的跨仓验证留给 Mission `TIPTAP_BROWSER-T2`。

## 7. 风险

- 官方 table extensions 与当前自定义 node schema attrs 不一致：先做 characterization，再最小扩展官方节点，禁止并存两套同名 schema。
- SVG 是主动内容载体：安全 sink 必须是显式 host capability，不把字符串结果直接等同可信 DOM。
- async renderer 可能乱序：request identity 与 destroyed flag 必须共同 gate DOM commit。
- 多个专用 host 各自持有完整 extension registry：产品不得拼接；只能由公共 assembly
  host 让单一 registry owner 一次组合所有 NodeView capability。
