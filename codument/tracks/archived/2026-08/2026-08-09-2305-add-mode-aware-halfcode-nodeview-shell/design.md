# Mode-aware NodeView Shell

NodeView host 是可信组合边界。同步 DocumentInstanceRegistry token 与异步 mode lease 相互独立；
异步注册完成前 fail closed 为 view，销毁或失败时分别按捕获 token/lease 回滚。

内嵌 host props 在原四项 facade 外增加 `mode` 与 `requestModeTransition`。`emitEditIntent`
在 effective view 下由 host boundary 拒绝；Halfcode renderer 子树始终挂载，因此业务 command/effect
不因查看态而整体 disabled。

默认 shell 提供 View/Edit/Use document mode、状态与拒绝原因。target 可声明独立
`modeShellPresenterId`，runtime registry 只替换 Vue shell presentation。
