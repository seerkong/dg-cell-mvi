# Mission：构建文档与内嵌组件显示模式基座

## 背景和动机

当前 XNL Programmable Document 已具备 canonical RichDocument、Tiptap Presenter、
Halfcode Component/Capsule NodeView、Presentation 工具栏以及单向 authoring/mutation
链路，但缺少早期 `rad-workbench` Tiptap 封装中的一项关键产品能力：文档和自定义
Vue 区块可以在查看态与编辑态之间切换，并以统一的区块头部和操作风格呈现。

早期实现提供了有价值的交互样本：

- `TiptapEditorCapsule.vue` 可以动态调用 `editor.setEditable(...)` 切换整篇文档；
- Mermaid 与 Markdown 区块拥有自己的 edit/preview（及 split）交互；
- 自定义区块共享 header、mode action、delete 等可发现的交互结构。

但旧实现也存在不能直接搬回来的 authority 问题：例如 Mermaid 把 `isEditing` 写进
Tiptap node attributes，组件直接调用 `updateAttributes`，文档级与区块级模式各自拥有
本地状态。当前体系必须保留其产品理念，同时让显示模式成为受控 session projection，
不污染 Domain XNL，也不绕过 Halfcode runtime、Scope、Presentation 和 authoring owner。

这个能力是文档微应用的基础：文档提供默认显示模式，内嵌 Component/Capsule 以
overlay 覆盖默认值；未来文档级功能权限可以决定谁能切换到何种模式，而查看态中的
业务交互仍然可以正常运行。

## 目标

- 定义 `view | edit` 的文档 base mode，以及每个内嵌 occurrence 的
  `inherit | view | edit` overlay，形成确定、可递归组合的 effective mode 规则。
- 明确区分显示模式、authoring 能力和业务交互能力：`view` 禁止文档/区块配置写入，
  但不默认禁用微应用自身的查询、导航、命令或业务 Effect。
- 建立 runtime-bound mode policy port。base/overlay 只表达显示请求，不能自行授予
  edit 或 switch 权限；宿主可在未来接入文档 ACL、角色、租户或字段级功能权限。
- 建立唯一 `DocumentDisplayModeSession`/actor，拥有动态 base、occurrence overlays、
  transition correlation、订阅和生命周期清理；UI、NodeView 和 Vue 组件只发 mode command。
- 让 `XnlDocumentEditor` 的 editable、工具栏和 context projection 由有效文档模式驱动，
  不保留平行的 `internalEditable` 真源。
- 为 Halfcode Component/Capsule NodeView 提供统一、可 Presentation 覆盖的
  mode-aware shell；向嵌入内容只暴露 exact readonly mode view 与受限切换端口。
- 在 Workbench Programmable Document 中交付文档级切换、各内嵌区块独立切换、
  overlay 清除/继承、允许与拒绝策略以及统一的查看/编辑交互。
- 用 contract、typecheck、session/property、browser E2E、窄视口和 fixed-seed chaos
  验证模式切换不会写入 Domain XNL、破坏本地 draft、越权或影响现有动态区块业务交互。

## 非目标

- 本 Mission 不实现完整 RBAC/ABAC、用户目录、租户权限管理或权限配置 DSL；只提供
  可接入这些系统的 typed policy port、默认策略和拒绝行为。
- 不把瞬时 base/overlay mode 默认持久化到 RichDocument、Tiptap attrs、HTML、VFS
  或 VCS。未来若产品需要跨会话偏好，应通过独立 preference owner 扩展。
- 不把 `split`、`source`、`design` 等组件特有编辑子模式扩张为全局枚举；它们属于
  effective `edit` 内部的 presenter-specific state。
- 不允许 view/edit 切换直接获得 Domain XNL、authoring session、VFS/VCS 或 registry
  owner token。
- 不要求所有 Halfcode 组件实现两套完全不同的 Vue component；组件可以用同一实现
  根据只读 mode view 投影不同界面。

## 成功判据

- 文档 base mode、occurrence overlay、effective mode、allowed transitions 和 clear-to-inherit
  有稳定 contract、纯投影规则、runtime policy protocol 与非法输入 diagnostics。
- 文档 mode 动态切换会同步 Tiptap editable、工具栏、selection/context 与 NodeViews；
  每个内嵌 occurrence 可独立覆盖并在清除 overlay 后重新继承文档 base。
- mode actor 以稳定 occurrence identity 管理 overlay；节点移动保留状态，卸载清理状态，
  replacement/copy 不错误继承旧 occurrence overlay。
- Component/Capsule/内置复杂区块共享一致的 mode shell 和切换 affordance，且业务方可用
  stable presenter id 覆盖外观而不替换 transition authority。
- policy 拒绝、权限动态收回、stale occurrence、未知 target 和并发 mode command 均
  fail closed；无权限用户看不到或不能触发无效切换。
- view 模式禁止文档编辑、区块配置、删除等 authoring action，但嵌入微应用经明确授权的
  业务 command/effect 仍可执行。
- mode-only 操作不产生 RichDocument edit intent、XNL mutation、revision、VFS write 或
  VCS commit；真实内容编辑仍完整经过既有单向 authoring/mutation 链路。
- Workbench 宽屏、390px 窄屏、刷新/reproject、Undo/Redo、Component/Capsule 交互和
  deterministic chaos E2E 全绿，无旧 `isEditing` node attr 或平行模式 writer residue。

## 为什么需要 Mission 而不是单个 Track

该目标横跨 Document contract/open context、mode policy 与 session actor、Tiptap editor
状态、Halfcode NodeView restricted facade、Presentation shell、Workbench 产品交互和浏览器
验证。底层 mode semantics 与真实微应用体验会形成反馈迭代，必须由 Mission 编排多个真实
track 并在发现 authority、identity 或 permission 缺口时受控重规划。Mission 只拥有控制面；
规范、代码、behavior delta、测试和迁移均由 `mission.xml` 绑定的真实 track 落地。

