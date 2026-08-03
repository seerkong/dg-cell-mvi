# 设计：Canonical list item DOM serialization

## Owner 与依赖边界

`dg-cell-mvi-halfcode-tiptap-vue` 是唯一 Tiptap/ProseMirror Presenter owner。
`listItem` 的 DOM serializer 属于 projection/view lowering，不是 Domain XNL、HTML 或 DOM
反向 authoring authority。Contract、logic、support 和 Workbench 均不实现替代版本。

## 方案

保留当前自定义节点的：

- `name: "listItem"`
- `defining: true`
- `content: "block+"`
- global `nodeId` identity attribute

在同一 canonical extension 中增加受控的 `<li>` output spec，使 ProseMirror schema 产生
`toDOM`。serializer 只消费节点 attributes 并创建 view output；它不读取 HTML/DOM、不解析
页面状态、不生成 XNL mutation，也不拥有 writer。

不通过 Workbench 私有 NodeView、fixture 过滤或复制 StarterKit schema 绕过。

## 测试策略

1. Package-root schema 断言 `listItem.spec.toDOM` 存在且 `content` 仍为 `block+`。
2. 使用 package-root/browser-host extensions 创建真实 `Editor`，渲染 bullet 与 ordered list。
3. 覆盖首子节点为 blockquote 的合法 `block+` list item，防止退回官方较窄 grammar。
4. 投影/解析与 identity 回归证明列表语义、顺序和 `nodeId` 不漂移。
5. 更新 boundary scan，仅允许 adapter registry 的 serializer，继续禁止
   `generateHTML/getHTML/DOMParser/querySelector/innerHTML` 等 reverse-authoring 路径。
6. 重跑 adapter 全量测试、typecheck、public-root smoke 和 Workbench T2.2 红测。

## 风险

- 过度收窄 boundary regex 可能掩盖 reverse-authoring：以定点 serializer allowance 代替删除
  整项检查。
- 直接改用官方 ListItem 可能改变 `block+` grammar：本 track 不采用该方案。

