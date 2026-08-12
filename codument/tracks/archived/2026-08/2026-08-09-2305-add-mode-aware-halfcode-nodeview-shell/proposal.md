# 变更：统一 Mode-aware Halfcode NodeView Shell

## 目标

- Component/Capsule NodeView 同时注册 document owner token 与独立 mode lease。
- 向内嵌实现只提供 frozen mode view、受限 transition grant 和 mode-aware edit intent。
- 交付统一可访问 shell，并允许 stable shell presenter id 覆盖视觉。
- 查看态拒绝 authoring intent，但不禁用 Halfcode 子树自身的业务交互。

## 非目标

- presenter override 不得替换 transition、guard、lease 或 lifecycle 语义。
- 不向组件暴露 mode session、policy runtime、registry、DOM、lease 或 authoring writer。
