# 设计：Contextual Mode Chrome

## 核心结构

默认 shell 从 `header + controls + content` 改为：

```text
relative shell
├── content (normal flow)
└── contextual chrome (absolute presentation layer)
    ├── halo
    ├── trigger / divergence badge
    └── popover menu
```

## 可见性状态

| 状态 | 表现 |
|------|------|
| inherit + resting | 无常驻 chrome，边界透明 |
| hover/focus-within/selected | halo 与单一 trigger 可见 |
| explicit view/edit | 低对比度 badge 常驻，交互时增强 |
| menu open | trigger 与 popover 保持可见 |
| policy denied | 菜单项 disabled，原因在菜单内显示 |

可见性只属于 Vue shell 的瞬时 presentation state。关闭菜单或失焦不得自动改变 occurrence overlay。

## 命令语义

Popover 使用互斥选项：

- Follow document -> `requestModeTransition(..., { mode: 'inherit' }, ...)`
- View only -> `requestModeTransition(..., { mode: 'view' }, ...)`
- Edit component -> `requestModeTransition(..., { mode: 'edit' }, ...)`

按钮 disabled 状态继续由 `allowedModes`、`inheritedMode` 和当前 overlay 派生；最终 transition 仍由 session/policy 拒绝或接受。

## 可访问性与响应式

- Trigger 是具名 button，菜单使用 `role=menu`/radio semantics 或等价原生可访问结构。
- `focus-within` 与显式打开状态保证键盘用户可见。
- `Escape` 关闭菜单并把焦点返回 trigger。
- 桌面优先使用左侧 gutter；容器较窄时把 trigger 放到右上角 overlay。
- 控件出现和模式切换不得改变内容的 top/left/height。

## 风险与控制

- **可发现性不足**：显式 overlay badge、focus/touch 路径和测试覆盖降低风险。
- **覆盖组件业务按钮**：桌面 gutter 优先，窄屏使用有背景的固定角落 trigger，并控制最小占用。
- **点击外部/NodeView remount 泄漏监听**：事件监听绑定到 shell 生命周期，unmount 精确清理。
- **UI 误获 authority**：仅调用已有 restricted transition grant；不新增 writer 或 domain state。
