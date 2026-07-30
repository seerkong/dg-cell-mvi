# 变更：完善 CRUD 字典运行时

## 背景和动机（Context And Why）

CRUD 已具备字典配置、注册表、异步 effect 与 UI 投影的基础能力，但加载请求没有完整携带上下文和强制刷新语义；已选值补全、按输入词检索、并发结果隔离和可配置缓存也没有形成一致协议。结果是静态选项可以工作，而动态表单、级联字段和大数据集选择无法在同一套 MVI 闭环中稳定实现。

本变更将字典定义、加载意图、provider 执行、结果归约及 UI 控件桥接明确为可测试的契约，使所有字典数据都在 effect 边界之外可解释、可重放、可替换。

## 要做和不做（Goals / Non-Goals）

**目标：**

- 提供统一的字典定义和 provider 协议，覆盖内联固定选项、固定远端数据、由上下文决定的远端数据，以及自定义数据加载。
- 让加载、刷新、失效、已选值补全和输入词检索都经由显式 command/effect/result 反馈闭环；加载上下文不得在 reducer 到 effect 的过程中丢失。
- 支持按作用域缓存、强制刷新、过期策略和乱序结果抑制，并保持 reducer 纯函数。
- 将可见选项与“仅为已选值补全而获得的节点”分开存储，再投影为现有 CRUD view model 可消费的字典数据。
- 提供 Element Plus 选择类控件的标准桥接：远程搜索、已选值补全、级联重载和加载/错误状态都只派发 CRUD command。
- 保持现有 `data` / `dataMap` 投影可用，并为既有静态字典与简单 URL 字典提供迁移兼容层。

**非目标：**

- 不规定后端字典接口、鉴权方式或租户参数的具体格式。
- 不在 Vue 组件、列定义或表单 schema 中执行直接网络请求。
- 不把 provider 注册表升级为全局 Actor 系统；本次只提供字典运行时所需的局部执行边界。
- 不在本变更中重做非 CRUD 包的选项控件。

## 变更内容（What Changes）

- 在 CRUD contract 中定义可序列化的 `DictDefinition`、`DictLoadIntent`、`DictNode`、缓存策略和加载状态；定义 provider 的请求与返回协议。
- 以 provider 标识和运行时注册替代将不透明副作用闭包混入 reducer 输入的做法。URL 解析、响应转换、鉴权及动态参数由 provider 在 effect 边界执行。
- 补齐字典 command/result vocabulary：普通加载、强制刷新、失效、按值补全、按检索词查询，以及对应的成功/失败反馈。
- 在字典 runtime 中实现按字典与作用域协调的请求代次、取消/失效、缓存命中及结果归约；过期或非当前代次的结果不得覆盖当前状态。
- 扩展 CRUD projection 与 Element Plus adapter，使字段依赖变化、控件打开、远程检索词变化和已选值变化都能生成明确的字典加载意图。
- 添加契约、reducer、runtime 和 UI bridge 的测试矩阵，并提供从现有配置迁移到 provider 协议的说明。

## 影响范围（Impact）

- `packages/dg-cell-mvi-crud`：字典 contract、reducer/effect、runtime、view-model projection 与测试。
- `packages/dg-cell-mvi-element-plus`（或当前 CRUD Element Plus adapter 所在包）：选择控件的 command bridge 与加载状态呈现。
- `packages/dg-cell-mvi-core`：仅在现有 command/event/effect 流程无法表达关联信息时补充最小通用类型；不得引入 CRUD 专属语义。
- 应用接入方：可继续使用简单静态/URL 配置；需要动态上下文、搜索或补全时注册 provider 并声明字典绑定策略。

## 风险和迁移策略（Risks / Migration）

- **兼容性风险：**既有加载器可能依赖隐式缓存或把刷新当作普通加载。通过兼容层保留旧配置入口，并把刷新语义纳入契约测试。
- **并发风险：**级联字段快速变化会产生乱序响应。以作用域和请求代次关联结果，保证仅当前请求可提交状态。
- **复杂度风险：**provider 容易演变成无边界服务定位器。注册接口只暴露字典加载与按值补全两个能力，且所有输入输出均采用显式契约。

## 验收摘要（Acceptance Summary）

- 固定、远端、自定义、上下文动态、按值补全和输入词检索六类场景均有可重放测试。
- 强制刷新会绕过适用缓存；过期响应、失效响应和被替代请求的响应不会覆盖最新字典状态。
- 表单级联与远程选择器不包含直接 I/O，且能显示加载/失败状态。
- 旧的静态和简单 URL 字典用例保持可用；所有受影响包测试通过。
