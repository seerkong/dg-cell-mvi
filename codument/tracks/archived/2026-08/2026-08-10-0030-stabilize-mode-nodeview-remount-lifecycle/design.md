# Design：NodeView mode registration coordinator

协调器属于 browser host 私有 runtime，键为 `formatDocumentInstanceRef(ref)`。首次 acquire
启动一次异步 `session.register`；同 key remount 复用 pending/active entry 并增加 consumer。
release 降低 consumer，延迟到微任务检查，只有仍为零才在注册完成后执行一次 unregister
并删除 entry。host dispose 强制释放全部 entry。transition grant 只读取 entry 的当前 lease，
pending/failed/destroyed 时 fail closed。NodeView 各自订阅 projection，但不拥有 lease。
