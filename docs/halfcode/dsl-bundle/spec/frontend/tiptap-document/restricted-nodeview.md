# 受限 Component/Capsule 与 Mermaid NodeView

## Embedded Input

成功的 embedded Presenter input 精确只有四项：

```ts
type EmbeddedInput<TView, TSnapshot> = Readonly<{
  view: Readonly<TView>;
  snapshot: Readonly<TSnapshot>;
  instanceRef: Readonly<DocumentInstanceRef>;
  emitEditIntent: (runtime, { intent }, config) => Promise<EditResult>;
}>;
```

- `view` 来自 support-owned `XnlProjectionPresenterRuntimeFacet<TView>` 证明的
  exact readonly facade；
- `snapshot` 是 immutable serializable occurrence snapshot；
- `instanceRef` 是已建立 identity 的 `DocumentInstanceRef` copy；
- `emitEditIntent` 只接受 `XnlProjectionPresenterEditIntent`，不是 authoring submit。

Embedded code 不获得 raw Scope/host runtime、Domain AST、ValueHost、translator、
authoring session/proposal port、live revision、VFS/VCS、writer、identity allocator、
registry owner token 或 unregister/cleanup authority。

## Capability 与 Scope

Scope 仍是 runtime assembly boundary，但 NodeView 不能直接继承 Scope 的所有能力。
Host 先通过 code-owned positive grants 构造 Presenter facet，再从 facet 投影 exact
facade。Application class/inheritance/mixin runtime 可以作为 host；descriptor-only
resolver 不执行 getter/constructor，并拒绝 platform prototype、accessor、revoked、
cyclic 或 over-depth capability chain。

这条边界只证明 Presenter 没有直接拿到 raw source identity 和未授权 object graph。
被显式授予的方法仍是 trusted capability，grant owner 必须审查其 effect policy。

## Mount、Update、Unmount

`createXnlRichDocumentHalfcodeNodeViewHost` 复用 existing
`CanonicalHalfcodeRenderer` 与 `CanonicalComponentRegistry`：

1. host 验证 target、presenter identity、occurrence 与 facet；
2. 用已组装 `DocumentInstanceRef` 在 registry 注册并取得 private owner token；
3. 通过 Vue NodeView mount Component 或 Capsule；
4. same-kind update 更新 immutable snapshot 和 canonical plan；
5. destroy/host dispose 只用自己的 token unregister，并保证 idempotent cleanup。

Duplicate address 在注册时 fail closed，第二个实现不会 mount，也不会释放第一个
owner。Registry token 和 `unregister` 永不进入 embedded input。Unknown Component/
Capsule、missing registry、raw custom-element fallback、错误 Presenter identity、
invalid facet、Vue mount/update/cleanup failure 都产生显式 diagnostic。

Capsule 只承载子域边界。Strict host input 递归传给第一个非空内容域的第一个根；
Capsule wrapper 和其他 sibling 不接收四项 capability 作为 DOM props。Wrapper
内部控件事件由 embedded Presenter 消费，外层 wrapper 仍由 ProseMirror 处理
NodeSelection、删除和拖拽。

## Mermaid Effect Facet

Mermaid render 与 diagnostic 都遵守 Halfcode/DEPA 的三参数 Effect 协议：

```ts
type RenderEffect<TRuntime extends object> = <TRequestId extends string>(
  runtime: TRuntime,
  input: Readonly<{ source: string; requestId: TRequestId }>,
  config: Readonly<{ theme: 'default' | 'dark' | 'neutral' }>,
) => Promise<XnlRichDocumentMermaidRenderResult<TRequestId>>;

type DiagnosticEffect<TRuntime extends object> = (
  runtime: TRuntime,
  input: Readonly<{ diagnostic: XnlRichDocumentMermaidDiagnostic }>,
  config: Readonly<Record<PropertyKey, never>>,
) => void | Promise<void>;
```

长期 binding 只在 outer runtime facet：

```ts
interface MermaidNodeViewRuntime<TRender extends object, TDiagnostic extends object> {
  readonly renderer: Readonly<{ runtime: TRender; effect: RenderEffect<TRender> }>;
  readonly diagnostics: Readonly<{
    runtime: TDiagnostic;
    effect: DiagnosticEffect<TDiagnostic>;
  }>;
}
```

`source/requestId` 是一次调用的 Data，只进入 render `input`；`theme` 是静态选项，
只进入 render `config`；diagnostic config 是 exact empty record。Factory 不接受 loose
callback、renderer factory 或 implementation config。它只读取 outer carrier 的
`renderer/diagnostics` 两个 exact own data properties，以及每个 binding 的
`runtime/effect` 两项；额外 own key、symbol 或 accessor 一律拒绝且不调用 getter。

Outer carrier 可以是 plain object，也可以是 class/inheritance/mixin 构成的 runtime
carrier：prototype method/getter 不会被展开或执行，但实例自己的 outer fields 必须
exact。两个 implementation runtime 是 trusted code-owned opaque object/function，
可以使用 class、private state 和泛型；host 只确认它们可作为 runtime carrier，不
递归检查、不 freeze，也不声称 TypeScript 结构类型能证明 inner exactness。Render
runtime 与 diagnostic runtime 相互隔离，均不获得 raw Scope、Domain AST、ValueHost、
translator、authoring session、VFS/VCS、allocator 或 writer。

## Untrusted Result 与 Safe Sink

Render Effect 的返回值跨越不可信边界，只允许 exact union：

```ts
type RenderResult<TRequestId extends string> =
  | Readonly<{
      status: 'rendered';
      requestId: TRequestId;
      svg: SVGSVGElement;
    }>
  | Readonly<{
      status: 'rejected';
      requestId: TRequestId;
      diagnostics: readonly [
        XnlRichDocumentMermaidDiagnostic<TRequestId>,
        ...XnlRichDocumentMermaidDiagnostic<TRequestId>[],
      ];
    }>;
```

Host 对 result 的 own keys/data descriptors 只采集一次 host-owned snapshot，再从同一
snapshot 选择 branch；diagnostics collection 与每个 item 也各自只做一次 own-data
snapshot。未知 status、额外 string/symbol key、accessor、array hole/iterator、
inspection trap、错误字段类型或空/畸形 diagnostics 都 fail closed，且 renderer-owned
diagnostic 不会被部分透传。Result、每条 diagnostic 与当前 live request 的
`requestId` 必须一致；mismatch 只产生带 live requestId 的 host diagnostic。

`rendered` 分支采用 clone-first safe sink，顺序不可交换：

```text
renderer-owned SVGSVGElement
  -> ownerDocument.importNode(svg, true)        // host-owned deep clone
  -> validate the same clone                    // never inspect original for trust
  -> re-check latest live request
  -> private renderContainer.replaceChildren(the same clone)
```

Validator 拒绝 `script`、`foreignObject`、任意 namespace 的 `on*` attribute，以及
`href/xlink:href` 经 WHATWG URL 解析后 protocol 为 `javascript:` 的值；这包括
CR/LF/TAB 和前导 C0 control normalization。Import、validation 或 commit 异常均转成
structured diagnostic。Host 在 untrusted snapshot 后、diagnostic 转发前、clone/
validation 后和 commit 紧前复检 request 是否仍是最新且 live；stale result、NodeView
destroy 或 host `dispose()` 后都不再写 DOM，也不再发送过期 diagnostic。

DOM commit Effect 只由 NodeView host 私有持有，renderer 永远拿不到 target/container。
Renderer 后续修改原 SVG 不影响已提交 clone；render rejection/throw 和 diagnostic
失败都不改变 Mermaid source、RichDocument 或 Domain XNL。
