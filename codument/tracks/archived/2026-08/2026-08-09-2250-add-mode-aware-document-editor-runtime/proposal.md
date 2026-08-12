# 变更：实现 Mode-aware Document Editor Runtime

## 目标

- 在 support 中以单一 actor 持有 live base、overlay、lease、revision 与订阅生命周期。
- 支持 async runtime-bound policy、显式重新求值和串行原子 transition。
- 让 XnlDocumentEditor 只消费 frozen projection，并在同一 Editor/draft lineage 上切换 editable。
- 在 view 下隐藏 authoring toolbar，并在命令入口再次实施最终 guard。

## 非目标

- 编辑器不获得 mode dispatch/register authority。
- mode transition 不产生 XNL mutation、VFS write 或 VCS revision。
- 本 track 不实现内嵌 Component/Capsule 的 occurrence shell。
