# 变更：用 Contextual Chrome 替换内嵌组件常驻模式栏

## 背景和动机 (Context And Why)

当前每个 Halfcode Component/Capsule 都在内容上方常驻标题、类型和 View/Edit/Inherit 三按钮。该结构显著增加文档垂直密度，在窄屏还会变成额外一整行，使动态组件看起来像嵌套配置卡片而不是文档内容。

一流块编辑产品通常把低频 authoring chrome 从内容流中移出：区块靠近、聚焦或选中时才显示轻量边界和菜单。该模式既保留能力可发现性，也避免阅读时的持续视觉噪声。

## 目标

- 删除默认 shell 的常驻 header，不再为模式控件占用文档流高度。
- 用 hover、focus、selection/touch 可唤醒的单一紧凑 trigger 暴露模式菜单。
- 在菜单中清晰表达跟随文档、仅查看、编辑此组件和 policy 拒绝原因。
- 对显式 overlay 保留轻量但可辨识的 divergence badge。
- 保持键盘、触摸、桌面与窄屏可达，不依赖 hover 单一路径。
- 保持 session、policy、transition grant、authoring guard 和 zero-persistence 边界不变。

## 非目标

- 不重做 document base mode 的全局工具栏。
- 不改变 mode contract、session reducer、policy protocol 或 registry lifecycle。
- 不把 hover、popover、selection 状态写入 XNL 或 mode session。
- 不在本 track 完成 Workbench 整体配色、排版和工具栏视觉翻新。

## 影响

- `dg-cell-mvi-halfcode-tiptap-vue` 默认 shell 的 DOM、样式和可访问交互会改变。
- 自定义 stable shell presenter 不受视觉实现约束，authority contract 不变。
- 需要更新 package tests，并由后续 Workbench track 在真实文档中验证。
