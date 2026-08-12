# Track：补齐跨宿主模式生命周期与 Inherit 边界

## 背景

Workbench 真实集成表明，Tiptap browser host 因 occurrence 结构变化而替换时，稳定
`DocumentInstanceRef` 会短暂跨越两个 host 代际。若 registration coordinator 只归单个
host 所有，旧 host 注销会清除 overlay，新 host 重新注册只能恢复为 inherit。

另一个缺口是 shell 只知道有效 mode 与 allowedModes，不知道 inherited mode，因此在
policy 已禁止继承结果时仍会显示可点击的 Inherit。

## 目标

- 提供可选的 presentation-owned mode registration coordinator；默认 host-private 行为不变。
- 同一 coordinator 下的同步 host replacement 复用稳定 occurrence lease 和 overlay。
- 不同 coordinator、不同 identity 与最终 unmount 继续隔离和清理。
- mode view 显式投影 inherited mode，并禁用不可达的 Inherit。

## 非目标

- 不把 overlay 持久化到 XNL、VFS 或 VCS。
- 不让 coordinator 成为 mode state owner；它只协调 session lease。
- 不改变不同产品是否选择共享 coordinator 的装配决定。
