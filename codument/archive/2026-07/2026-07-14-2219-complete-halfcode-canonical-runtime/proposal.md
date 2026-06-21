# 变更：闭合 Halfcode canonical runtime

## 背景和动机 (Context And Why)

RuntimeInstance loader、Scope assembly、runtime-first executor、unit compiler、dg-cell-mvi 与 depa-data-graph 的基础原语已经存在，但 DEPA 扫描确认它们没有形成同一条可由 App 驱动的 runtime 主链。

八项问题共享三个根因：

1. DSL rename 只完成了文档和部分 fixtures，loader/source AST/compiled plan/tests 仍使用旧 Ref 后缀和 parentRef 模型。
2. loader、compiler、runtime assembly、renderer 之间缺少一个拥有全链路的 Actor，导致 command、Scope hierarchy、Effect/DataGraph binding 在阶段之间丢失。
3. canonical unit runtime 与 legacy schema/store runtime 共用公共入口，实际 Workbench 仍消费后者。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 完成 page/permission/props/urlInputs/command/config 的裸名迁移，并删除 scopeRef/contractRef/parentRef 等已失去语义的字段。
- 让 source AST 与 XNL 同名，让 compiled plan 使用解析后的 FQN/id/binding plan。
- 从元素树编译 Scope hierarchy，parent-first 装配 RuntimeObject 与所有 family bindings。
- 建立 canonical HalfcodeAppRuntime，使 UI Command 从 compiled plan 调用 runtime-first 代码。
- 将 CallableEffect 与 MviEffectRequest 分离命名并建立显式 adapter。
- 用真实 depa-data-graph GraphModule/NodeRef/mountGraph 实现 DataGraph materializer。
- 保留 Command/Event kind 并接入 dg-cell-mvi transport。
- 将 canonical Vue/Workbench 入口迁到新 runtime，隔离 legacy renderer。
- 修复 depa-data-graph-core 解析门禁，建立跨包与 fixture 全量验证。

**非目标:**

- 不设计 backend flow、ORM、resource flow、CRUD DSL 或业务 workflow。
- 不把 RuntimeObject 内部字段、class、generic、visibility algorithm 写入 XNL。
- 不把 HTTP/CRUD 语义写入 Effect 类型。
- 不复制 depa-data-graph 或 dg-cell-mvi 的核心执行引擎。
- 不自动提交 Git commit。

## 变更内容（What Changes）

- Canonical naming：Route、Element、Scope、manifest、compiled plans 与 fixtures 统一；loader 不再接受历史 XxxRef 拼写。
- Scope hierarchy：Elements/Capsule 保存 ScopeUseSpec，compiler 派生 scopeId/parentScopeId/ownerElementId。
- Execution spine：新增完整 AppPlan、MessageDispatchPlan 和 HalfcodeAppRuntime orchestration；renderer 不回读 raw domains。
- Family materializers：实现 CallableEffectBindingPlan、DataGraphMountPlan 与 RuntimeScopeBindings 的 typed assembly。
- Graph conformance：counter/admin graph code 使用真实 GraphModule/NodeRef；handler 不猜测 runtime 私有布局。
- MVI bridge：以 registry/envelope/branded creators 保留 Command/Event kind。
- Consumer boundary：canonical package root 只暴露新 runtime；legacy API 迁入显式 legacy 边界，Workbench 代表性 demo 迁移。
- Verification：六个 fixtures 零 error；contract/logic/support/vue/core/admin 与 Workbench 相关测试通过。

## 影响范围（Impact）

- dg-cell-mvi：docs/halfcode、halfcode-contract、halfcode-logic、halfcode-support、halfcode-vue、dg-cell-mvi-core、admin-element-plus、fixtures/tests。
- depa-data-graph：只读取和适配现有 public API；除非依赖解析证据要求，不修改其核心实现。
- eidolon-workbench：Halfcode runtime behavior 与真实消费入口。
- Codument mission：evolve-halfcode-non-frontend-dsl 的 G2R/G3/G4 由本 track 收敛部分待办。

## 风险

- 这是破坏性 AST/API 迁移；通过一次性改 source AST、compiler、fixtures 和 tests 避免双方言兼容期。
- Scope tree 会触及 loader/compiler/runtime 三层；必须按 TDD 先固定 plan，再实现 assembly。
- legacy renderer consumer 数量较多；本 track 先确保 canonical root 和代表性真实 demo，剩余历史 demo 只允许显式 legacy import。
- DataGraph materializer 必须遵守 depa-data-graph callback/runtime 形状，不能为迁就 fixture 修改底层语义。
