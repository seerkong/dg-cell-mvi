# Mode Session And Editor Adapter

`DocumentDisplayModeSession` 是唯一 live owner。policy processor 可异步返回，session 把操作放入
串行队列，先构造 candidate state 与全部 projections，再一次性发布 snapshot。已使用 lease 在
session 生命周期内不复用，destroy 后所有命令 fail closed。

Editor adapter 的输入只增加 `displayMode?: DocumentDisplayModeProjection`。projection 改变时
调用现有 Editor 的 `setEditable` 并重编译 ToolbarPlan；不得重建 Editor、extensions、draft
或 accepted observation。`execute` 同时检查 visible/enabled 与 canonical command guard。
