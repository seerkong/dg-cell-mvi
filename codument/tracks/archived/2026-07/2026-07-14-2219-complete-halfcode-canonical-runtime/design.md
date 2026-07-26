# 设计：Halfcode canonical execution spine

## 1. 分层模型

### XNL source language

- 节点采用：ref。
- 领域绑定：page、permission、props、urlInputs、command、runtime、config、commands、events。
- 代码入口：src、create、derive、handler、impl、impls。
- 不存在：pageRef、propsRef、scopeRef、contractRef、parentRef 等历史字段。

### Source AST

Source AST 与 XNL 使用同一语义名，HalfcodeRef 类型已经表达“这是引用”：

    RouteSpec.page: HalfcodeRef
    RouteSpec.permission?: HalfcodeRef
    UnitInstanceElement.inlineProps?: InlineProps
    UnitInstanceElement.props?: HalfcodeRef
    UnitInstanceElement.urlInputs?: HalfcodeRef
    UnitInstanceElement.command?: HalfcodeRef
    ElementsSpec.scope?: ScopeUseSpec
    CapsuleElement.scope?: ScopeUseSpec

ScopeUseSpec 表示一个真实 Scope node：要么 ref 采用预定义 Scope，要么 inline 声明 binding。Component/Page instance 不在使用处声明 Scope。Contract 不进入 element AST。

### Compiled plans

Compiled plan 不复述 source 名字中的 Ref，而表达解析结果：

    AdminShellRoutePlan.pageFqn
    ScopeRuntimePlan.scopeId
    ScopeRuntimePlan.parentScopeId
    ScopeRuntimePlan.ownerElementId
    RenderNodePlan.scopeId
    RenderNodePlan.inlineProps
    RenderNodePlan.propsBinding
    RenderNodePlan.urlInputsBinding
    RenderNodePlan.commandBinding

MessageDispatchPlan 解析 Command identity、kind、handler、config 与 owning Scope。Runtime/renderer 不再读取 LoadedHalfcodeUnit.domains。

## 2. Scope RuntimeObject

Compiler 从 Elements root 开始深度遍历：

1. Elements.scope 建立 unit root Scope。
2. Capsule.scope 建立 lexical child Scope。
3. 普通元素继承最近 Scope。
4. Component/Page instance 的内部 Scope 属于目标 unit，在进入该 unit plan 时形成新边界。
5. ElementContract 通过 element id 解析 Requires；Component/Page contract 通过 FQN 解析。

Assembler 按 parent-first 顺序执行：

    parentRuntime
      -> resolve RuntimeInstance
      -> materialize config/commands/events/policy/effects/dataGraphs
      -> runtime.bindScope or runtime.deriveScope
      -> currentRuntime

Scope 未声明 runtime 时继承 parentRuntime；声明 RuntimeInstance 时由其 code-owned protocol 决定共享、create 或 derive。

## 3. Canonical App Runtime Actor

HalfcodeAppRuntime 拥有：

- load：由 resolver 读取 FrontendApp bundle。
- compile：生成 immutable AppPlan。
- assemble：构建 RuntimeInstance map、scope runtime map、Effect/DataGraph resources。
- dispatch：接收 element/Command URI，从 MessageDispatchPlan 找 handler/config/Scope runtime，调用 runtime-first executor。
- resolve：解析 scope.runtime、scope.effects、scope.data.graph view binding。
- dispose：释放 graph/effect/subscription/runtime resources。

细粒度 loader/compiler/executor 继续作为 Processor，但应用不再自行拼装它们。

## 4. Effect 双模型

CallableEffect：

- 表示动态代码依赖的函数或 interface。
- 类型由 effect.types src 指向代码类型。
- 实现由 Scope EffectBindings 指向代码 bundle。
- RuntimeObject 暴露强类型调用或 call message。

MviEffectRequest：

- 由 reducer 产生。
- 由 dg-cell-mvi effect runner 处理。
- 结果重新 dispatch 为 Event。

二者通过 adapter 显式连接，不共享含混的 EffectDef 或 handler registry。

## 5. DataGraph materializer

- GraphModule 类型与 NodeRef 在代码中定义。
- XNL DataGraph 声明 module identity/topology，Scope GraphMount 声明 module/seed/impls 或既有 graph src。
- materializer 使用 defineGraphModule/mountGraph/Graph API。
- computed/processor/async/consumer 的 impl adapter 接收 depa GraphRuntime，并在需要调用 Halfcode 动态入口时构造明确 input/config。
- RuntimeObject 暴露唯一稳定的 graph(name) API；handler 禁止猜测 dataGraphs、scope.graph 等内部布局。
- GraphExtension 在已有 mounted graph 上追加节点/子图，沿用同一 NodeRef identity。

## 6. Command/Event bridge

Halfcode registry 至少保存：

    message id
    kind: command | event
    payloadDef
    handler/config only for command
    owning Scope/policy

进入 dg-cell-mvi 时可使用 envelope、branded creator 或 side registry；不强制 AppEvent 增加字段，但任意接收点必须能无歧义恢复 kind。Effect feedback 必须是 Event。

## 7. Consumer 与 legacy 边界

- halfcode-vue canonical root 暴露 HalfcodeAppRuntime adapter 和 compiled renderer。
- 旧 HalfcodeSchema/HalfcodeStore/Render 不再从 canonical root 暴露；若仍有历史消费者，只能从显式 legacy subpath 使用。
- Workbench 至少迁移 counter/admin 代表性入口到 canonical bundle；剩余历史 demo 必须显式标注 legacy import，不能让新代码误用。

## 8. 验证策略

- Contract tests：字段不存在性、plan shape、message kind。
- Loader tests：裸字段正例、XxxRef 负例、Scope AST、Effect/DataGraph binding parse。
- Compiler tests：scope tree、command binding、contract implicit association、六 fixture 零 error。
- Runtime tests：真实 button dispatch、parent runtime inheritance/override、effect mock bundle、real GraphModule counter。
- Consumer tests：Vue rendered counter click。
- Workspace tests：core/halfcode/admin/Workbench；依赖解析失败必须先区分安装问题与逻辑回归。

## 9. 迁移顺序

1. Source AST + loader + fixtures。
2. Compiled plans + scope tree + command dispatch。
3. Runtime Scope bindings + Effect/DataGraph materializers。
4. MVI bridge + Vue/Workbench consumer。
5. Dependency health、全量验证、旧名称扫描。
