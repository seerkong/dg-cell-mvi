# L2 前端 halfcode 领域公理

> 基于 L1 元公理（`foundation/`），定义前端 halfcode DSL 专属的封装模型与领域概念。后端 app、流程定义等其它 DSL 不适用本层——它们在 L1 之上定义自己的 L2。
> 编号 `F-*`（Frontend）。每条标注它继承/特化了哪条 L1 公理。

## F-1 · Capsule 是唯一封装原语（特化 M-D1）

前端把 M-D1 的"封装单元"具体化为 **Capsule**：一段带作用域边界的 UI 逻辑，拥有 config、runtime instance、effect bindings、commands/events 等能力。Capsule 只**内联出现在元素树**中，不单独成文件。

其余一切封装形态都是 Capsule 的派生：

| 概念 | 是什么 | 输入边界（特化 M-D1 的 input） | 输出边界 |
|---|---|---|---|
| **Capsule** | 唯一封装原语，内联于元素树 | 宿主 scope 链 | Command/Event 消息传播 |
| **Component** | Capsule 的**有名可复用**发行形态（FQN 身份） | props / slots | sends / exposes |
| **Page** | Capsule 的**可路由/可嵌入**发行形态（FQN 身份） | **URL 形状**：path / query / hash 变量 | sends |
| **AppBundle** | 组合根：路由树 + 单元注册 + 跨页接线，自身无 UI | — | — |

约束：
- **Page 不开 props**，Component 不感知 URL——两者输入边界互斥，保证各自的可复用语义。
- **嵌入 Page = 宿主提供合成 URL 输入**：宿主嵌入一个 Page 与 router 挂载它走同一条输入通道（都提供 path/query/hash）。因此 Page 天然既可独立路由、也可嵌入他处，无需 mount 声明。

## F-2 · 单元与 FQN（特化 M-N5 / M-N6）

**单元 = Page 或 Component**，是前端可独立成文件/文件夹、可跨 app 复用的制品，以 FQN 为身份（M-N5）。单元支持单/多文件双形态（M-N6）。Capsule 不是单元（无 FQN、只内联）。

AppBundle 用 `Units` 注册表登记单元；由此派生两个注册表 scheme（M-N4 注册表类）：`page://<FQN>`、`component://<FQN>`——这是**跨单元引用的唯一通道**（配合对方公共契约）。

## F-3 · scope 层级随元素树自然形成（特化 M-D1 的 runtime）

Elements 根与 Capsule 的作用域边界（M-D1 的 runtime 侧：该边界绑定哪个 runtime instance，并拥有哪些 config、effect bindings、data graph bindings、commands/events）用 **Scope** 表达。关键领域约定：**scope 的父子层级不显式声明，而是随 Elements/Capsule 的嵌套自然形成**——外层 Capsule 的 scope 即内层的父 scope。Component/Page 实例的 scope 定义在目标单元自己的 Elements 根，使用处不挂 scope。

因此 scope 之间没有 `parentRef`；一个 Capsule 需要的域绑定，沿元素树向外层逐级可达。这利用了 UI 树本身就是天然的作用域嵌套结构。

## F-4 · Command / Event / Message 三种通信拓扑

**Command** 是面向未来的请求，可声明 runtime-first `handler`；**Event** 是已经发生的事实，不能声明 handler；**Message** 是二者在传播、策略与 wiring 中的抽象总称，不是第三个可声明 kind。

进入 `dg-cell-mvi` 的 `AppEvent` transport 时，bridge 保留完整 identity：Command 使用 `command://#<id>`，Event 使用 `event://#<id>`，可选 message descriptor 同时携带 `payloadDef` 与 policy identity。URI 与 descriptor 必须一致；不得把二者都压成裸 type 字符串后再按命名约定猜 kind。effect feedback 必须显式构造为 Event，并沿 feedback loop 保留同一 descriptor。

1. **树内传播**：Capsule 的 Command/Event 沿元素树按 `MessagePolicy` 传播；只有边界需要 consume/bubble/reject 时才声明策略。
2. **嵌入边界**：被嵌入 Page 的 Message 从嵌入节点进入宿主树，继续按策略传播。
3. **跨路由（wiring）**：不在同一棵树上的两个 route 级 Page 之间，AppBundle 用 `<Wire message="…">` 投递同一个 Message URI；wire 不做 Event→Command 转换。

未接线的 `Sends` Message 产出 `HALFCODE_MESSAGE_UNWIRED` 警告，不静默丢弃。

## F-5 · 领域域集合

前端 halfcode 的事实分为以下域（每个域遵守 M-N2 三投影、M-N3 facet）。这是本领域的封闭集合，不随意扩充：

| 层 | 域 |
|---|---|
| 单元内（Page/Component） | `elements`（UI 树）、`contracts`（公共边界 + 元素契约）、`scopes`、`commands(.def)`、`events(.def)`、`config`；Scope 内联 effect/data graph binding；可选 `runtime` |
| App 级 | `routes`、`wiring`、`config`、`commands(.def)`、`events(.def)`；Scope 内联 effect/data graph binding；可选 `runtime` + 投影域 `workspace`/`fixtures` |

- `elements` 是结构本体，无逻辑寻址 scheme（用树内 `#id` 定位）。
- 投影域（`workspace`/`fixtures`）只供工具消费、不参与编译。
- **live state 暂不进入 frontend scope 绑定**：frontend scope 不声明 live state 的 def/seed；后续由 runtime family 另行设计。
- **effect 实现绑定不单独成域文件**：Quick/Compact/Split 都在 Scope 的 `<EffectBindings>` 中装配；type 是实际 binding 的可选代码引用。
- **data graph 是独立 family 的扩展域**：GraphModule / logic type / seed 可以被 frontend 容器启用，但 graph 对象和实现装配必须内联在 Scope 的 `<DataGraphBindings>` 中。
- **runtime 是独立 family 的扩展域**：frontend 容器可以启用 `runtime` 域声明 `RuntimeInstance`；Scope 通过 `runtime = "runtime://#..."` 绑定实例，并把本 scope 的 config/effect/data graph/command/event/message policy 装配输入交给 runtime object。runtime 内部结构、类型、继承、消息路由留在代码里。

## F-6 · 前端契约禁 input/output 字面字段

M-D1 的四边界词汇（input/output/config/runtime）属于 Adapter/processor 语境。**前端 UI 契约**（PageContract/ComponentContract/ElementContract）描述的是组件边界能力（props/slots/urlInputs/accepts/sends/exposes/requires），**不得**出现字面的 `input`/`output` 字段——那会把 UI 契约与处理器数据血缘概念混淆。四边界只在 Effect 等真正的处理器封装点上出现（见 spec/frontend/nodes.md §7）。
