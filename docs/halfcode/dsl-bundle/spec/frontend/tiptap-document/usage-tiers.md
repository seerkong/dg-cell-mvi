# 功能采用模式与 Runtime 三档

下面三个层级是 RichDocument 的**功能采用模式**，描述 consumer 采用 projection、完整
composition 或 custom implementation 的深度。它们不是“运行时三档”，也不是三套事实源或
三种 DSL。所有模式都保持 Domain XNL authority、runtime-first
`output = fn(runtime, input, config)`、Scope 装配和 revision-free adapter intent。Config 只放
可序列化选项；translator、materializer、allocator、registry、session 与 writer 都属于
代码/runtime capability。

对需要完整编辑 UI 的 consumer，三档对应为：

1. **预建直用**：直接挂载 `XnlDocumentEditor`，使用默认 Presentation 与 registries，只绑定
   authoring/clipboard/highlighter Effect；
2. **配置组合**：替换 `DocumentEditorPresentation`、capabilities 与 grants，复用同一 compiler、
   canonical commands 和 Vue surface；
3. **代码扩展**：在 runtime 注册 distinct host tool/command/presenter/condition binding，
   Presentation 仍只引用 stable id，不嵌函数或组件实现。

三档共用一个 RichDocument authority 和一个 Tiptap `EditorState` lineage。第二档不能替换
canonical command，第三档也不能复用 `rich-text.command.*` namespace 冒充 canonical tool。

## 功能采用模式 1：Projection / Local State

直接使用 adapter package 的 canonical schema、RichDocument/Tiptap JSON 转换和
local-draft processors。适合已有宿主只需要标准文档族、并自行持有外层 lifecycle
的场景。Headless/preview/test 可以用 detached
`createXnlRichDocumentTiptapDraft(runtime, { document }, config)`；真实 Tiptap Editor
必须从 package root 调用
`bindXnlRichDocumentTiptapDraftToEditorState(runtime, { editorState }, config)`，让 draft、
document 与 transaction 共享同一 schema lineage。

```ts
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  createXnlRichDocumentTiptapSchema,
  parseTiptapDocument,
  projectTiptapDocument,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const config = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
};

const schemaResult = createXnlRichDocumentTiptapSchema();
const projected = projectTiptapDocument({}, { document: richDocument }, config);
const parsed = projected.status === 'projected'
  ? parseTiptapDocument({}, { document: projected.document }, config)
  : projected;
```

这一级仍只处理 projection/local state。`parsed` 不是 accepted Domain XNL；需要写入
时必须进入 trusted host 和 authoring session。需要 extensions 时可调用无参数
`createXnlRichDocumentTiptapExtensions()`；它是 schema/headless/table 的 canonical
factory，不接受 raw `NodeViewRenderer`，也不安装 Mermaid/Component/Capsule custom
NodeView。Bound lifecycle 只接收 `EditorState`，不接收 Editor、DOM、NodeView、session、
revision、VFS 或 writer，也不通过 transaction replay、HTML/DOM 或 Editor snapshot
反向创建领域输入。

## 功能采用模式 2：完整 Composition

组合预建 adapter、production canonical semantic values、现有 Halfcode Vue renderer、
Presenter facet、Document occurrence registry 与 authoring proposal port。简单
RichDocument consumer 可直接从 support package root 使用 canonical dialect、translator、
materializer、translator binding 与 trusted host，不需要重写 `xnl.rich-document.edit`
语义。宿主以 Scope/runtime 组装这些代码 capability，并用 data config 选择 schema、
extensions、plan node、projection role 与 stale-draft policy。

典型组合是：

```text
canonical Tiptap schema + draft lifecycle
  + production canonical translator/materializer
  + translator binding
  + trusted Interaction bridge
  + existing authoring session proposal port
  + existing Halfcode renderer/registry
  + host-owned Document occurrence registry
```

这里的“配置化”不表示把实现写入 XNL。XNL/Presentation 可引用 stable id 和
serializable options；production translator/materializer 是 package-root code values，
identity allocator、proposal port、NodeView registry 与 session 则仍由当前 Scope 可见的
runtime object 提供。复杂领域也可以在同一 contract 上替换或 bind 自己的
translator/materializer，但这不是简单 consumer 的前置要求。

Mermaid renderer 同样只在产品 composition root / Scope 的代码中绑定。下面的
`ProductDocumentScope` 是产品代码拥有的 runtime facet，不是 XNL DSL node；示例只
使用 `dg-cell-mvi-halfcode-tiptap-vue` package root 的公开 contract 和 factory：

```ts
import {
  createXnlRichDocumentTiptapBrowserHost,
  type XnlRichDocumentMermaidDiagnosticEffect,
  type XnlRichDocumentMermaidNodeViewRuntime,
  type XnlRichDocumentMermaidRenderEffect,
  type XnlRichDocumentMermaidTheme,
  type XnlRichDocumentTiptapBrowserHostRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

interface ProductDocumentScope {
  readonly mermaidDriver: {
    render(
      source: string,
      theme: XnlRichDocumentMermaidTheme,
    ): Promise<SVGSVGElement>;
  };
  readonly reportDiagnostic: (code: string, message: string) => void;
}

class ProductMermaidRuntime<TDriver extends ProductDocumentScope['mermaidDriver']> {
  constructor(readonly driver: TDriver) {}
}

class ProductDiagnosticRuntime {
  constructor(readonly report: (code: string, message: string) => void) {}
}

type RenderRuntime = ProductMermaidRuntime<ProductDocumentScope['mermaidDriver']>;

const renderMermaid: XnlRichDocumentMermaidRenderEffect<RenderRuntime> = async (
  runtime,
  input,
  config,
) => ({
  status: 'rendered',
  requestId: input.requestId,
  svg: await runtime.driver.render(input.source, config.theme),
});

const reportMermaid: XnlRichDocumentMermaidDiagnosticEffect<
  ProductDiagnosticRuntime
> = (runtime, input) => {
  runtime.report(input.diagnostic.code, input.diagnostic.message);
};

class MermaidOuterFacet implements XnlRichDocumentMermaidNodeViewRuntime<
  RenderRuntime,
  ProductDiagnosticRuntime
> {
  constructor(
    readonly renderer: Readonly<{
      runtime: RenderRuntime;
      effect: typeof renderMermaid;
    }>,
    readonly diagnostics: Readonly<{
      runtime: ProductDiagnosticRuntime;
      effect: typeof reportMermaid;
    }>,
  ) {}
}

export function assembleDocumentEditor(
  scope: ProductDocumentScope,
  halfcodeRuntime: ProductHalfcodeRuntime,
  targets: ProductHalfcodeTargets,
  occurrences: ProductDocumentOccurrences,
) {
  const mermaid = new MermaidOuterFacet(
    {
      runtime: new ProductMermaidRuntime(scope.mermaidDriver),
      effect: renderMermaid,
    },
    {
      runtime: new ProductDiagnosticRuntime(scope.reportDiagnostic),
      effect: reportMermaid,
    },
  );
  const runtime: XnlRichDocumentTiptapBrowserHostRuntime<
    ProductView,
    ProductHalfcodeRuntime,
    RenderRuntime,
    ProductDiagnosticRuntime
  > = { halfcode: halfcodeRuntime, mermaid };
  const host = createXnlRichDocumentTiptapBrowserHost(
    runtime,
    { targets, occurrences },
    { theme: 'neutral' },
  );
  if (host.status !== 'ready') throw new Error(host.diagnostics[0].message);
  return host; // host.extensions -> new Editor({ extensions }); dispose with product Scope.
}
```

这里 `mermaidDriver` 是 renderer implementation，只出现在代码/runtime binding；
`source/requestId` 由 NodeView 逐次构造，`targets/occurrences` 是既有 Halfcode host
input，`theme` 才是 config。不得把 driver、Effect、
class name、factory、Scope object 或 renderer implementation 写进 XNL DSL/Presentation
data，也不得塞进 config。Browser host 是唯一 canonical registry owner，其 extensions
一次性包含 table、runtime-bound Mermaid、Component 与 Capsule；它不暴露 raw
NodeViewRenderer 或按 name 去重规则，并由一个幂等 `dispose()` 收口两类 NodeView
lifecycle。所有 custom NodeView 都必须经这些受限 hosts 建立，不能作为参数传入
`createXnlRichDocumentTiptapExtensions()`。

## 功能采用模式 3：Custom Adapter / Capability

面向 code-heavy Halfcode 或不同领域协议，业务可以在既有 contract/processor protocol
上替换、bind 或实现自己的：

- Projection Dialect / Interaction translator；
- semantic candidate materializer；
- host-owned persistent identity allocator；
- Presenter positive grants、canonical component registry 与 NodeView target；
- persistence/session assembly 或产品级 orchestration。

自定义代码必须保持这些边界：

1. processor 继续使用 `(runtime, input, config)`，动态能力只来自 runtime；
2. adapter 只产生 `kind: "interaction"`，不读取 revision、不调用 submit；
3. trusted host 对一个 intent 恰好翻译一次，并在提交当刻读取 live revision；
4. canonical RichDocument materializer 或自定义 materializer 都只产生 pre-authority
   candidate，不把 RichDocument 变成通用领域 DSL；
5. allocator 只在 final candidate materialization 分配 new/copy/replacement identity；
6. embedded Presenter 与 Mermaid NodeView 只拿各自受限 facade，不拿 raw
   Scope/session/VFS/writer/allocator；
7. renderer implementation 只由 composition root 绑定为 code/runtime capability，
   永不进入 XNL DSL 或 config。

模式 3 是可编程装配能力，不代表当前已经交付 generic arbitrary-domain DSL editor。
Foundation 已为 canonical RichDocument 语义提供 production values；只有引入不同领域
command vocabulary 或不同 materialization laws 的复杂 consumer，才需要替换或 bind
自己的 translator/materializer。

## Halfcode Runtime 三档

Runtime 三档遵循 runtime axioms 的同一命名与递进关系：

1. **Quick Runtime**：Scope 直接引用代码导出的 runtime object，适合 demo、实验和低类型要求场景。
2. **Compact Runtime**：在 `runtime.xnl` 声明少量 `RuntimeInstance`，由 Scope 复用稳定实例，
   适合普通业务默认装配。
3. **Split / Public Runtime**：在 TypeScript 中定义 interface/class/generic runtime protocol，
   XNL 只保留 `src/create/prototype/derive` 实例图，适合多 app 复用与强类型对象系统。

这三档运行的是同一条 RichDocument capability chain，行为 contract、accepted authority、
translator/materializer/allocator handoff 与 processor 公式不变。递进的只有 Scope/runtime
instance 的复用范围，以及类型表达、代码拆包和装配复杂度。任一功能采用模式都可以选择合适的
Runtime 档位；二者是正交维度。
