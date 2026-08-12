# Design：Mode-aware Structured NodeViews

## 分类

| Insert 类型 | 模式层级 | 原因 |
|---|---|---|
| Component / Capsule | occurrence overlay | 独立 Halfcode 微应用 presenter |
| Mermaid | occurrence overlay | 有 rendered 与 source editor 两种投影 |
| Enhanced Code Block | occurrence overlay | 有阅读工具与源码 authoring 两种投影 |
| Image / Table / Hard Break | document base | 文档结构节点，没有独立局部 presenter |

## 统一链路

```text
DocumentDisplayModeSession
-> StructuredNodeView occurrence registration
-> effective mode projection
-> contextual shell + presenter projection
-> restricted requestModeTransition
```

`DocumentInstanceRef` 使用文档 unit instance、稳定 Domain node id 派生的 x-id 和 presenter role。registration lease 仍由现有 coordinator 管理，NodeView remount 必须复用 generation-safe acquire/release。

## Presenter 行为

### Mermaid

- view：render container 可见，source editor 不存在或隐藏且不可聚焦。
- edit：render container 与 source editor 可见，input 继续走现有 ProseMirror transaction -> normalized edit -> XNL mutation。

### Enhanced Code Block

- view：Fold/Copy 可用，`contentDOM` 不可编辑。
- edit：`contentDOM` 跟随文档 editor authoring 能力；语言等上下文工具保持原 command authority。

### Contextual Chrome

复用同一个无文档流高度的 shell。kind label 扩展到 Mermaid / Code，不新增持久化状态。所有 mode-aware block 在 resting 状态保留低对比度入口，hover/focus/selection 时增强，使新插入的 block 无需先猜测 hover 区域也能发现模式交互。

Mermaid/Code 的 authoring 最终仍属于文档 mutation，因此 document base 为 view 时 policy 只允许 structured NodeView view；它们不能像独立 Halfcode 微应用那样用 occurrence edit 绕过 document authoring gate。

## Authority

- mode session：唯一 base/overlay/policy owner。
- presenter：只消费 mode projection，并持有 restricted transition facade。
- Tiptap transaction normalizer：唯一把 accepted editor authoring 转换为 Domain edit 的边界。
- XNL：不保存 transient display mode。

## 验证

- Mermaid/Code view、edit、inherit、policy denial 与 remount lifecycle unit/integration tests。
- mode-only transition 保持 XNL、revision、VFS invariant。
- Workbench desktop/390px E2E 覆盖 Insert 后可发现、Mermaid 源码显隐、Code authoring gate 与 Component/Capsule contextual menu。
