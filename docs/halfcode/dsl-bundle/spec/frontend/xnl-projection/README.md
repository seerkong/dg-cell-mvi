# XNL Projection Foundation 规范

> 目录职责 · holds: renderer-neutral XNL Projection 的公共 contract、编译、身份、Presenter/Interaction 和失败边界 · excludes: Document Unit、authoring session、accepted mutation/diff、Tiptap 与产品 UI · tier: stable · ⬆from: `add-xnl-projection-editor-foundation` Track 的源码与测试证据 · ⬇to: Document、renderer adapter 与产品集成

XNL Projection Foundation 把权威 Domain XNL 编译成可重建的纯数据
`ProjectionPlan`，再由代码侧 Presenter 生成 surface。它不接受领域修改，也不把
renderer state 提升为事实源。

```text
Domain XNL authority
  + serializable Presentation
  + code-owned Dialect
        |
        v
renderer-neutral ProjectionPlan
        |
        v
code-owned Presenter surface
```

事实等级固定为：

```text
Domain XNL                              authority
Presentation                           serializable projection policy
ProjectionPlan                         rebuildable projection
Presenter output and surface state     replaceable surface data
Interaction and Domain Command         immutable proposal
```

## 阅读顺序

1. [contracts](contracts.md)：纯数据 contract、代码侧 processor 与 package-root
   公共类型。
2. [layers](layers.md)：`contract <- logic <- support`、递归 compiler、Dialect
   composition 与 Presenter resolution。
3. [identity](identity.md)：XNL `#id`、path/role fallback、Plan id 与 Document
   `x-id` 的严格分工。
4. [presenter and interaction](presenter-interaction.md)：Presenter registry、
   runtime facet、显式调用参数与封闭 Domain Command proposal。
5. [boundaries](boundaries.md)：默认 XNL adapter、完整内建 diagnostic、失败关闭
   和 SchemaEditor/authoring 边界。
6. [examples](examples.md)：纯数据 XNL/Presentation、公共根导入、双中立
   Presenter 与代码侧 Interaction wiring。

## 不变量

- Domain XNL 是领域权威；Plan、surface、Interaction 都不是 accepted fact。
- Presentation 只保存 stable Presenter id、options 和其他可序列化数据；实现
  留在 Dialect/Presenter registry/runtime 代码。
- 动态 compiler、Dialect、Presenter 与 Interaction translator 都遵守
  `output = fn(runtime, input, config)`。
- 递归由 compiler runtime 的 `runtime.compile(...)` 拥有，业务 transformer
  不接收临时递归 callback。
- Presenter 精确解析顺序是
  `presentation > semantic > classification > source-kind > unsupported`。
- Presenter runtime view 只由 support-owned protocol 的 positive grants 构造；
  source 上任意额外 ungranted capability 被忽略，合法 projection 仍成功。
- Facet provenance/brand 只证明 support ownership，不能单独完成 attenuation；
  attenuation 来自重新构造的 grant-exact frozen facade。
- unknown、lossy、非法 transformer、未知 Presenter 和未知 Interaction 都产生
  diagnostic 或封闭失败结果；不存在隐式 JSON/text/component fallback。
- compiler、translator 和 Presenter runner 不拥有 Domain mutation、VFS 或
  ValueHost writer。
- 公共消费者只从三个 package root 导入，不使用 `src/xnl-projection/*` deep
  import；三个 package 都只发布 `"."` export。

## 当前交付

| 状态 | 能力 |
|---|---|
| **CURRENT** | 可序列化 Presentation/Plan/Interaction/diagnostic contracts 与 runtime validators |
| **CURRENT** | runtime-owned 同步递归 compiler、ordered Dialect composition、精确 Presenter resolution、Interaction 到封闭 Domain Command outcome |
| **CURRENT** | `xnl-core` 默认 adapter、确定性 node-family/order、stable Presenter registry、positive-grant exact Presenter facade、递归 presentation runner |
| **CURRENT** | 正常 render 返回 validated surface data；独立 edit-intent contract 只返回 serializable Interaction/Domain Command proposal data，不含 submit authority |
| **CURRENT** | outline 与 inspection 两个 renderer-neutral、纯数据 Presenter 示例 |
| **CURRENT** | Halfcode Document Unit contract, XNL loader, and compiler plan consume Projection foundation identity/source boundaries |
| **CURRENT IN AUTHORING TRACK** | Generic revisioned authoring session、Candidate/accepted mutation、Domain diff、ValueHost accept 与 xnl-vfs persistence live in [XNL Document authoring session](../authoring/README.md), not in Projection foundation |
| **CURRENT IN TIPTAP PRESENTER TRACK** | Tiptap/ProseMirror direct model adapter、restricted NodeView 与 trusted proposal bridge 已由 [Tiptap Document Presenter](../tiptap-document/README.md) 实现；它们仍不属于 Projection foundation owner |
| **CURRENT IN DOCUMENT TRACKS** | Document occurrence runtime owns `x-id` registry and `unit-instance://...` refs; Projection foundation still treats Plan ids separately |
| **CURRENT WITH LIMIT** | 同一 persistent `#id` 可在不同 host/surface 派生 distinct multi-role occurrence；同一 Tiptap editor 内 simultaneous multi-role 尚未实现，见 [identity boundary](../tiptap-document/identity.md) |

SchemaEditor 是一个已经存在的专用结构编辑器，也是架构上的下游
adapter/consumer，不是 generic ProjectionPlan 的内部模型。当前 Track 没有实现
`ProjectionPlan -> EditorPlan` bridge；详见 [boundaries](boundaries.md)。
