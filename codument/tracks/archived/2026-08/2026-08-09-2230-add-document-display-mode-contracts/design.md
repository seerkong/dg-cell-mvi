# Document Display Mode Contract

## Authority

`DocumentUnitPlan.mode` 是初始 base mode 的唯一真源。运行中 base mode 与 occurrence overlay
由后续 session actor 持有；领域文档与持久化层不记录这些临时显示事实。

```text
requested = overlay ?? base
decision = policy(runtime, { target, requested, inherited, current }, config)
effective = decision.allowed ? requested : view
```

overlay 的 canonical 存储只保留 `view|edit`；`inherit` 命令等价于删除 overlay。

## Identity And Lifecycle

occurrence target 使用 `unit-instance://<unit>/<projection-role>/<x-id>` 的完整地址。每次注册
获得独立 mode lease；move 保留 identity，copy/replacement 获得新 identity 与 lease。陈旧
set/clear/unregister 命令原子拒绝。

## Policy Boundary

Policy 遵循 `output = fn(runtime, input, config)`：runtime 承载权限/effect 依赖，input 只含
稳定 target 与 transition intent，config 只含静态选项。缺失、抛错或不一致 policy 一律
降为 `view`，且不泄漏 authoring port、ACL、DOM 或 renderer 对象。
