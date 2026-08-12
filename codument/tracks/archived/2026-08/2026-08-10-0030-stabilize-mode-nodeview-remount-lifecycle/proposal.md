# Proposal：稳定 mode-aware NodeView remount lifecycle

Workbench 的真实 `Editor -> EditorContent` 挂载会为同一稳定 occurrence 重建 NodeView。
当前每个临时 NodeView 都直接向 mode session 注册，旧异步注册未释放时新实例会重复注册。

本 track 在 browser host 内按完整 `DocumentInstanceRef` 协调共享 lease。临时 NodeView 只持
consumer handle；最后一个 consumer 释放后再 unregister。不同 browser host、replacement
或 copy identity 不共享。领域 XNL、mode session contract 和 presenter facade 均不改变。
