# 文档显示模式

Document Unit 的 `mode` 只提供 occurrence 打开时的 base mode。运行中的文档显示模式由
session actor 持有，不写回 RichDocument XNL、Tiptap attrs、VFS 或 VCS。

内嵌 Component/Capsule occurrence 可设置 `inherit | view | edit` overlay：`inherit` 在
canonical state 中表现为没有 overlay 项；有效模式由 `overlay ?? base` 派生，再交给
runtime-bound policy 约束。缺失或异常 policy 时 fail closed 到 `view`。

overlay 使用完整 `DocumentInstanceRef` 与独立 lease。移动保留 identity；复制或替换生成新
identity 和 lease；删除 occurrence 会同时清理 overlay。显示为 `edit` 不等于获得 XNL
authoring capability，Presenter 仍只能通过 runtime 明确授予的 authoring facet 提交修改。

默认情况下，每个 browser host 使用私有 registration coordinator。产品在 occurrence 结构
变化时若会替换 browser host，应由更长寿命的 presentation 显式创建并向连续 host 代际注入
同一个 coordinator。它只复用稳定 identity 的 lease 和 consumer 计数，不保存或解释 mode；
presentation 最终销毁时必须 dispose coordinator。不同 coordinator、复制/替换产生的新
identity 仍保持隔离。

mode view 必须包含 `inheritedMode`。当 policy 的 `allowedModes` 不包含 inherited mode
时，shell 应禁用 clear-to-inherit；UI 的可用性只是投影，最终 transition 仍由 session/policy
裁决。文档处于 `view` 时，编辑器隐藏内容写入工具，但可继续显示 History、Agent review
等非写入 host 工具；Checkout、Accept 等会改变文档事实的动作必须同时在 UI 与最终 command
边界拒绝。
