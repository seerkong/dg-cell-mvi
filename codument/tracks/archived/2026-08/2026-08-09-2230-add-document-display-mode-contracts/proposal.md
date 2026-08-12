# 变更：建立 Document Display Mode 契约

## 目标

- 复用既有 `DocumentMode`，定义文档 base mode、occurrence overlay 与有效模式投影。
- 用完整 `DocumentInstanceRef` 和独立 lease 建模内嵌区块生命周期。
- 定义 runtime-bound policy port、原子 transition result 和稳定 diagnostics。
- 保持 mode 为 session 事实，不进入 RichDocument、Tiptap attrs、VFS 或 VCS。

## 非目标

- 不实现有状态 session actor、Vue/Tiptap shell 或 Workbench UI。
- `edit` 投影不授予 authoring capability。
- 不在 DSL 中声明用户、角色、ACL 或 policy implementation。

## 成功标准

- contract/logic 从 package root 可用，且无 Vue、Tiptap、DOM 或 XNL persistence 依赖。
- inherit 规范化为 overlay 缺席，effective mode 始终为派生值。
- malformed ref/mode、unknown target、stale lease、denied transition 和 policy inconsistency 均 fail closed。
