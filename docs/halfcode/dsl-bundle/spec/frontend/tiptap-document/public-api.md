# 公共 API

以下是当前 workspace package 的导入边界。消费者应从 package root 或已声明
subpath 导入，不使用 `src/*` deep import。

## Entrypoints

| entrypoint | 主要职责 |
|---|---|
| `dg-cell-mvi-halfcode-contract` | canonical RichDocument semantic edit/command/materialization contracts、identity/diagnostic/allocator、Projection Interaction、authoring contracts |
| `dg-cell-mvi-halfcode-logic` | neutral lower/parse/normalize、canonical semantic dialect/translator/materializer、identity classification、canonical `x-id` derivation |
| `dg-cell-mvi-halfcode-support` | logic-owned semantic values 的 package-root convenience re-export、translator binding、concrete XNL adaptation/materialization、trusted authoring host、authoring session/mutation/persistence assembly |
| `dg-cell-mvi-halfcode-support/xnl-projection-presenter` | narrow Presenter capability/facet public surface |
| `dg-cell-mvi-halfcode-tiptap-vue` | schema/extensions、JSON projection/parse、transaction normalizer、local draft、Presentation-driven `XnlDocumentEditor`、enhanced code、occurrence assembly 与受限 NodeView hosts |
| `dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document` | test-only canonical fixture；production root 不重导出 |

`dg-cell-mvi-halfcode-tiptap-vue` 当前只声明 package root `"."` export。主要函数：

- `createXnlRichDocumentTiptapExtensions`、`createXnlRichDocumentTiptapSchema`；
- `projectTiptapDocument`、`parseTiptapDocument`；
- `normalizeTiptapTransaction`；
- `createXnlRichDocumentTiptapDraft`、`bindXnlRichDocumentTiptapDraftToEditorState`、`apply...Transaction`、
  `settle...Composition`、`undo...Draft`、`redo...Draft`、`reproject...Accepted`；
- `assembleXnlRichDocumentHalfcodeNodeViewOccurrence`；
- `createXnlRichDocumentEmbeddedPresenterCapability`；
- `createXnlRichDocumentHalfcodeNodeViewHost`；
- `createXnlRichDocumentMermaidNodeViewHost`，以及对应 Mermaid render/diagnostic
  Effect、exact runtime/input/config/result public types；
- `createXnlRichDocumentTiptapBrowserHost`，以及对应 composition
  runtime/input/config/result public types。
- `createXnlDocumentEditor`、`XnlDocumentEditor`、restricted command/session/runtime/input/config
  public types；
- `adoptXnlRichDocumentTiptapEditorState`，用于接纳真实 Tiptap 已计算出的同一 next state，
  不 replay transaction。

## Reusable Editor 示例

```ts
import { h } from 'vue';
import {
  createDefaultDocumentEditorPresentationCompilerRuntime,
  DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
  DEFAULT_DOCUMENT_EDITOR_PRESENTERS,
  DEFAULT_DOCUMENT_EDITOR_TOOLS,
} from 'dg-cell-mvi-halfcode-logic';
import { XnlDocumentEditor } from 'dg-cell-mvi-halfcode-tiptap-vue';

const runtime = {
  authoring: { emitInteraction },
  presentation: createDefaultDocumentEditorPresentationCompilerRuntime(),
  clipboard: { runtime: clipboardRuntime, effect: writeClipboard },
  highlighter: { runtime: highlightRuntime, effect: highlightCode },
};
const capabilities = {
  tools: DEFAULT_DOCUMENT_EDITOR_TOOLS.map((tool) => tool.id),
  presenters: DEFAULT_DOCUMENT_EDITOR_PRESENTERS.map((presenter) => presenter.id),
  conditions: ['editor.editable', 'editor.table-active', 'editor.code-active'],
  grants: ['editor.table.write'],
};

const vnode = h(XnlDocumentEditor, {
  runtime,
  input: {
    document: acceptedRichDocument,
    acceptedObservation: 'accepted:opaque-token',
    presentation: DEFAULT_DOCUMENT_EDITOR_PRESENTATION,
    capabilities,
  },
  config: {
    planNodeId: 'xnlp:document.main',
    staleDraftPolicy: 'conflict',
    unknownToolPolicy: 'reject',
  },
});
```

`acceptedObservation` 是 opaque correlation，不是 revision。Host 在 `emitInteraction` 内读取
live revision、完成 XNL mutation/dry-run/validate/accept/persist，再以新的 immutable input
回投。Presenter 不能得到 raw Editor；host command 也必须作为 runtime binding 注册并被
Presentation/capabilities/grant 编译进 toolbar plan。

`createXnlRichDocumentTiptapExtensions()` 组合官方 Tiptap table extensions，因此
table commands 和默认 `TableView` 通过真实 `Editor` 的 command/NodeView surface
提供；adapter 不重导出 `TableKit/Table/TableRow/TableCell/TableHeader`。该函数是无参数
canonical factory，只生成不含 Mermaid/Component/Capsule custom NodeView 的标准 registry，
不能接收 raw `NodeViewRenderer`。Custom NodeView 只能由下述受限 Halfcode、Mermaid 或
composition browser host 创建。Host factories 都是 package-root value export，不需要且
不允许 `src/*` deep import。

## Canonical Semantic 与 Trusted Host

Public owner 与 package-root values 如下：

- contract root 定义 `XnlRichDocumentSemanticNode`、十类
  `XnlRichDocumentSemanticEdit`、`XnlRichDocumentEditInteractionPayload`、
  `XnlRichDocumentEditCommand`、`XnlRichDocumentCandidateMaterializationResult` 与
  `XnlRichDocumentCandidateMaterializer`；
- logic root 拥有 `createXnlRichDocumentSemanticDialect`、
  `translateXnlRichDocumentEditInteraction` 与
  `materializeXnlRichDocumentSemanticCandidate` 的唯一 production implementation；
- support root 原样重导出这三个 production values，并提供
  `bindXnlRichDocumentEditTranslator` 与
  `createXnlRichDocumentTrustedAuthoringHost`；
- Tiptap root 的 semantic public types 是 canonical contract 的 aliases/strict
  specialization，normalizer 输出 `xnl.rich-document.edit` Interaction，不另建词汇。

Dialect 用于接入 generic Projection compiler；direct translator 使用
`output = fn(runtime, input, config)` 的最小 `{ planNode, interaction }` 输入。Materializer
同样遵循三参数 processor，只接收 `{ accepted, command }`。二者 runtime/config 均为空，
result 只含 command/diagnostics 或 candidate/`copyOrigins`，不暴露 revision、writer、
VFS/VCS、session、submit、persistence、allocator 或 adapter object。

最小 package-root trusted-host 组合如下。`planNode`、`proposal` 与 `identityAllocator` 由
trusted composition root 提供；它们不进入 Interaction 或 materializer：

```ts
import {
  bindXnlRichDocumentEditTranslator,
  createXnlRichDocumentSemanticDialect,
  createXnlRichDocumentTrustedAuthoringHost,
  materializeXnlRichDocumentSemanticCandidate,
  translateXnlRichDocumentEditInteraction,
} from 'dg-cell-mvi-halfcode-support';
import {
  normalizeTiptapTransaction,
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const semanticDialect = createXnlRichDocumentSemanticDialect();
const translateInteraction = bindXnlRichDocumentEditTranslator(
  { translateInteraction: translateXnlRichDocumentEditInteraction },
  { planNode },
  {},
);
const trustedBridge = createXnlRichDocumentTrustedAuthoringHost(
  {
    proposal,
    translateInteraction,
    materializeInteraction: materializeXnlRichDocumentSemanticCandidate,
    identityAllocator,
  },
  { source: { occurrenceId, xId } },
  { proposalIdPrefix: 'proposal:document' },
);

const normalized = normalizeTiptapTransaction(
  {},
  { transaction },
  {
    schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
    extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
    planNodeId: planNode.id,
  },
);
if (normalized.status === 'normalized') {
  await trustedBridge.emitEditIntent(normalized.intent);
}

void semanticDialect; // Register it when composing the generic Projection compiler.
```

`bindXnlRichDocumentEditTranslator(runtime, input, config)` 固定可信 `planNode`，并把 host
收到的 revision-free Interaction 以空 runtime/config 交给 canonical translator；它不会
把 trusted host runtime 透传给 translator。Host 读取 accepted baseline，调用 materializer
一次，再把 temporary identities 与 `copyOrigins` 交给 host-owned allocator；只有随后构造
proposal 时才读取 submission-time live revision。

## Composition Browser Host 示例

同一个 Editor 需要 table、Mermaid、Component 与 Capsule 时，由 browser host 唯一拥有
canonical extension registry；不要拼接两个专用 host 的 `extensions`：

```ts
import {
  createXnlRichDocumentTiptapBrowserHost,
  type XnlRichDocumentTiptapBrowserHostRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const runtime: XnlRichDocumentTiptapBrowserHostRuntime<
  ProductView,
  ProductHalfcodeRuntime,
  ProductRenderRuntime,
  ProductDiagnosticRuntime
> = {
  halfcode: productHalfcodeRuntime,
  mermaid: {
    renderer: { runtime: productRenderRuntime, effect: renderMermaid },
    diagnostics: { runtime: productDiagnosticRuntime, effect: reportMermaid },
  },
};

const browserHost = createXnlRichDocumentTiptapBrowserHost(
  runtime,
  { targets, occurrences },
  { theme: 'dark' },
);

if (browserHost.status === 'ready') {
  const editor = new Editor({ extensions: browserHost.extensions, content });
  const diagnostics = browserHost.readDiagnostics();
  registerScopeCleanup(() => {
    editor.destroy();
    browserHost.dispose();
  });
}
```

Outer runtime 只有 `halfcode` 与 `mermaid` 两个 own data fields；它可由 class、prototype
或 mixin carrier 承载，prototype getter 不属于可读输入。`halfcode` 沿用既有 Halfcode
host runtime protocol，`mermaid` 沿用 exact Mermaid runtime protocol；renderer 与
diagnostic implementation runtime 保持 opaque。Public ready result 只暴露一套
canonical extensions、Halfcode diagnostics snapshot 与幂等 `dispose()`，不暴露 raw
NodeViewRenderer 或 registry internals。包内 NodeView-aware assembly 不是 public export；
消费者不能通过 canonical extensions factory 注入 renderer 或自行重组 registry。

## Mermaid Host Factory 示例

```ts
import {
  createXnlRichDocumentMermaidNodeViewHost,
  type XnlRichDocumentMermaidNodeViewRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const runtime: XnlRichDocumentMermaidNodeViewRuntime<
  ProductRenderRuntime,
  ProductDiagnosticRuntime
> = {
  renderer: { runtime: productRenderRuntime, effect: renderMermaid },
  diagnostics: { runtime: productDiagnosticRuntime, effect: reportMermaid },
};

const mermaidHost = createXnlRichDocumentMermaidNodeViewHost(
  runtime,
  {},
  { theme: 'dark' },
);

if (mermaidHost.status === 'ready') {
  const editor = new Editor({ extensions: mermaidHost.extensions, content });
  // Product Scope owns both cleanup operations.
  registerScopeCleanup(() => {
    editor.destroy();
    mermaidHost.dispose();
  });
}
```

`ProductRenderRuntime`、`renderMermaid` 与 `ProductDiagnosticRuntime` 都是产品代码
runtime，不是 config 或 DSL payload。Factory 的 exact outer input 只有 runtime
facet、empty input 和 `{ theme }` config；它不接收 raw Scope 或 renderer implementation
字段。`registerScopeCleanup` 代表产品已有的 Scope lifecycle hook，不是本 package API。

## Revision-free Transaction 示例

```ts
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  normalizeTiptapTransaction,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const result = normalizeTiptapTransaction(
  {},
  { transaction },
  {
    schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
    extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
    planNodeId: 'xnlp:node:document',
  },
);

if (result.status === 'normalized') {
  // result.intent.kind is always "interaction"; no revision or submit authority.
  await trustedBridge.emitEditIntent(result.intent);
}
```

`planNodeId` 是已存在 Projection Plan identity，不是本文档新发明的 DSL syntax。
`trustedBridge` 由 support 的 `createXnlRichDocumentTrustedAuthoringHost` 创建；其
runtime 显式提供 proposal port、Interaction translator、semantic candidate
materializer 和 identity allocator。

## Local Draft：Detached 与 EditorState-bound

两个入口返回同一个 `XnlRichDocumentTiptapDraftResult`，后续共享 apply、composition、
history 和 accepted reproject lifecycle，但起始 state lineage 不同：

```text
detached = createXnlRichDocumentTiptapDraft(runtime, input, config)
bound    = bindXnlRichDocumentTiptapDraftToEditorState(runtime, input, config)
result   = fn(runtime, input, config)
```

- **detached create** 的 exact input 是 `{ document, acceptedObservation? }`。它从 canonical
  Tiptap JSON 自建 schema、document、`EditorState` 和 history，适合 headless projection、
  独立 preview、测试，以及后续 transaction 也由这份 draft state 产生的宿主。
- **real EditorState-bound** 的 exact input 是 `{ editorState, acceptedObservation? }`。真实
  Tiptap `Editor` 已经存在、transaction 来自该 Editor 的 schema lineage 时必须用这个入口；
  adapter 直接保留传入 state、`state.doc`、schema 与 plugins，不重建或 replay transaction。
- 两者的 exact runtime 都只有可选 `emitInteraction` Effect grant；共同 config 是
  `{ schemaId, extensionIds, planNodeId }`。`acceptedObservation` 只是 host 提供的 opaque
  correlation token，不是 live/persisted revision，也不给 adapter authoring authority。

下面的真实 Editor 示例只从 package root 取得 adapter value/type。Host 把真实 transaction
交给 local lifecycle 一次；它不把 transaction dispatch 回 Editor，也不从
Editor snapshot API、HTML 或 DOM 反向构造 authoring 输入：

```ts
import { Editor, type JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  applyXnlRichDocumentTiptapDraftTransaction,
  bindXnlRichDocumentTiptapDraftToEditorState,
  createXnlRichDocumentTiptapExtensions,
  reprojectXnlRichDocumentTiptapAccepted,
  type XnlRichDocumentTiptapDraftResult,
  type XnlRichDocumentTiptapDraftRuntime,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const draftRuntime: XnlRichDocumentTiptapDraftRuntime = {
  emitInteraction: (_runtime, input) => {
    publishInteraction(input.intent);
    return { status: 'emitted' };
  },
};
const draftConfig = {
  schemaId: XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  extensionIds: XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  planNodeId: 'xnlp:node:document',
} as const;

const editor = new Editor({
  extensions: createXnlRichDocumentTiptapExtensions(),
  content: initialTiptapProjection as JSONContent,
});
let draft: XnlRichDocumentTiptapDraftResult =
  bindXnlRichDocumentTiptapDraftToEditorState(
    draftRuntime,
    { editorState: editor.state, acceptedObservation: 'accepted:1' },
    draftConfig,
  );

export function observeEditorTransaction(transaction: Transaction): void {
  if (draft.state === undefined) return;
  draft = applyXnlRichDocumentTiptapDraftTransaction(
    draftRuntime,
    { state: draft.state, transaction },
    draftConfig,
  );
}

export function observeAcceptedProjection(
  acceptedTiptapProjection: JSONContent,
  acceptedObservation: string,
): void {
  if (draft.state === undefined) return;
  draft = reprojectXnlRichDocumentTiptapAccepted(
    {},
    { state: draft.state, document: acceptedTiptapProjection, acceptedObservation },
    { ...draftConfig, staleDraftPolicy: 'conflict' },
  );
}
```

Selection-only transaction 静默更新 local state。IME intermediate transaction 由
`apply...Transaction(..., { composition: 'intermediate' })` 缓冲，
`settleXnlRichDocumentTiptapComposition` 在 composition 结束时至多发布一次。Undo/redo
只操作 local history，并把真实 document change 发布为新的 revision-free Interaction；
它们不回滚 accepted Domain XNL，也不直接修改原 `Editor`。

Accepted reproject 有三种结果。Projection 与 local draft matching 时保留同一
`EditorState`、selection、plugin/history state 并清 pending；存在不同 accepted projection
且 policy 为 `conflict` 时保留 local draft；policy 为 `replace` 时复用 bound schema 与
plugin configuration 创建 replacement state，同时重新初始化 plugin state、清除 stale history，
selection 无法映射时回退起点。

Binding input 不接受并列 `document`，runtime/input/config 也不接受 `Editor`、DOM、raw
`NodeView`、authoring session、revision、VFS/VCS、persistence 或 writer。Binding 只拥有
adapter-local projection state；Domain XNL、accepted revision、identity allocation、proposal
accept 与 persistence 继续由 trusted authoring owner 持有。

## Occurrence 示例

```ts
import {
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

const occurrence = assembleXnlRichDocumentHalfcodeNodeViewOccurrence({}, {
  nodeId: establishedDomainNodeId,
  unitInstanceId: 'document-1',
  role: 'main',
  roleCardinality: 'single',
  descriptor: { scopeId: 'document-root' },
}, {});
```

输入不允许携带 candidate `xId` 或 allocator；函数从已建立的 `nodeId + role +
cardinality` 调用 logic-owned canonical derivation。成功后才把 occurrence 交给
NodeView host。
