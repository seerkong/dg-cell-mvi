# 变更：集成按产品形态的 Flow Runtime

## 背景和动机

`depa-flows.ts` 已要求 InstantFlow、WorkFlow、BizProcess 各自声明唯一 typed `FlowContract`，并实现 profile-aware orchestration primitives 与 durable child lifecycle。Halfcode 当前仍有缺少 FlowContract 的 fixture，且 materializer 只注入代码和 store，不能解析 bundle 内 `CallFlow` 或装配 durable child。

## 目标

- 迁移 Halfcode CtrlFlow fixtures 到 typed `FlowContract`。
- 保持 Halfcode 只负责 AppBundle/VFS/Scope/runtime integration。
- 为 bundle-local `CallFlow` 提供按 FQN、产品形态校验的 definition linking。
- 为 WorkFlow/BizProcess durable child 提供显式依赖端口。
- 让 Scope-bound handles 执行新的 InstantFlow、WorkFlow、BizProcess profile fixtures。
- 保持 EagerDataFlow 独立且不回归。

## 非目标

- 不复制上游 Flow grammar、compiler、profile matrix 或 scheduler。
- 不修改 Schema Editor 通用基座。
- 不在 Halfcode runtime 中保存第二份 Flow snapshot。
- 不在本 track 修改 Workbench UI。

## 影响

主要修改 Halfcode Flow docs、contracts/support materializer、flow-showcase fixtures 与 Flow runtime E2E。公共 handle 只增加上游 lifecycle 已存在且 Halfcode 消费方需要的能力。
