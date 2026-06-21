# Design：halfcode runtime DSL MVP

## 上下文

runtime DSL 当前先服务一个目标：守住边界，避免 frontend/effect 文档继续引用尚未确认的 live state、reducer、projection vocabulary。它不替代 frontend DSL，也不把后续投影/状态方案提前冻结。

## MVP 闭环

当前不定义可生成闭环示例。后续重做时再从 `dg-cell-mvi-core` 的 `AppEvent`、`Reduce`、`EffectRequest`、`EffectHandler(runtime, request)` 事实出发设计。

## 域集合

| 域 | 文件 | scheme | 作用 |
|---|---|---|---|
当前 runtime 域集合尚未定稿，不声明可用域表。

## 节点

当前不提供 `<Runtime>`、`<Event>`、`<Reducer>` 示例。

## 红线

- frontend Scope 不声明 live state def/seed 绑定。
- 不暴露 live state scheme。
- 不引入 reducer 表达式语言或内建 reducer vocabulary。
- effects/ports/resources/workflow 后续单独设计。

## 验收

- 文档包含 runtime L2/L3 文件。
- 文档明确 runtime 仍处于暂缓状态。
- frontend 文档不再声明 live state/projection 读写通道。
- fixture 不提供旧 runtime MVP demo。
