# 变更：封闭 Schema Editor 原生拖拽完成事件缺口

## 背景和动机 (Context And Why)

Mission 全量 Flow Editor E2E 观察到一次 `Parallel` lane 拖拽未提交：Sortable 已触发
`onEnd`，但 Chromium 未稳定交付后续原生 `dragend`，导致既有 exactly-once 提交门没有
发出 `item.move`。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 正常 `dragend` 仍作为首选提交路径。
- 缺失 `dragend` 时使用 Sortable 已报告的 canonical indices 延迟兜底。
- 保持单个 serializable `item.move`，不直接修改 accepted collection。

**非目标:**
- 不更换 SortableJS，不改 collection command 或 ValueHost 协议。
- 不改变 CtrlFlow/DAGFlow DSL、节点模型或 XNL mutation owner。

## 变更内容（What Changes）

- 为 native `onEnd` 增加可取消的单次延迟提交。
- 正常 `dragend` 提交后取消兜底，避免重复命令。
- 增加漏发 `dragend` 的组件测试，并复跑 Flow 浏览器排序和混沌用例。

## 影响范围（Impact）

- behavior：`halfcode-schema-editor-element-plus-presenters`
- code：Element Plus `collection.list` Presenter 与其测试
- downstream：Workbench Flow Editor 浏览器拖拽
