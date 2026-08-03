# Design

## 事实与边界

`CollectionListPresenter` 只拥有展示态和 normalized interaction 的发出权。它不得
直接重排 accepted array。Sortable 的 `onEnd` 提供 `oldIndex/newIndex`，原生
`dragend` 则表示浏览器拖拽已真正结束。

## 方案

1. `onEnd` 在 native drag 活跃时保存 canonical indices，并安排零延迟 fallback。
2. 若 `dragend` 正常到达，既有路径立即调用 `commitActiveDrag`，恢复 DOM 顺序、
   清除 drag state 并取消 timer。
3. 若 `dragend` 缺失，timer 调用相同 `commitActiveDrag`。
4. `commitActiveDrag` 仍只发出一个 `item.move { fromIndex, toIndex }`；accepted data
   仍由 Schema Editor host 的 command/mutation 链推进。

## 风险控制

- timer 与 native event 竞争：统一由 `clearActiveDrag` 取消，保证 exactly once。
- 组件卸载：沿现有 teardown 清理 active drag 与 Sortable 实例。
- 浏览器波动：组件级漏事件测试、目标 E2E repeat 10 次与全套 Flow 25 项共同验收。
