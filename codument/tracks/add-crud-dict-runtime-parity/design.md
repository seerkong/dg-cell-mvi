# CRUD 字典运行时设计

## 1. 目标架构

字典能力采用 DEPA 边界：声明和状态属于 Data；加载意图属于 Effect 描述；provider 运行时负责 Processor 执行；UI adapter 是 Actor，只负责将用户交互和字段变化翻译为 command。任何 I/O、鉴权、URL 拼装或响应转换不得进入 reducer 与 Vue schema。

```text
DictDefinition + form/list scope (Data)
          │
          ▼
dict.load / dict.hydrate / dict.search (Command)
          │ pure reduce
          ▼
DictLoadIntent (Effect) ──► DictProviderRuntime (Processor)
          ▲                         │
          │                         ▼
dict.loaded / dict.failed (Result Event)
          │ pure reduce
          ▼
visibleNodes + knownByValue + status (Data) ──► CRUD ViewModel ──► Element Plus adapter (Actor)
```

## 2. Contract 与事实源

### 2.1 可序列化定义

每个 `DictDefinition` 必须有稳定 `id`，并声明来源类型、节点字段映射、缓存策略及绑定策略。来源可为内联节点或 provider 标识；provider 标识是可序列化数据，实际实现由组合根注册。

`DictBinding` 声明加载作用域、依赖字段、参数投影和触发时机。参数投影从当前表单、查询或租户等已有 state 读取，产出普通 JSON 值；它不是在 schema 中执行副作用的函数。动态 URL、响应转换和鉴权是 provider 内部实现细节。

缓存策略至少表达：`none`、按作用域缓存和跨作用域共享缓存，并可声明 TTL。缓存键由 `dictId`、provider、加载模式、检索词及归一化后的上下文参数共同决定。

### 2.2 Provider 边界

运行时注册两个可选操作：

- `load(intent)`：返回当前可见选项数组；适用于初始加载、刷新、上下文变化和检索。
- `loadByValues(intent)`：返回包含指定值的节点数组；适用于已选值 label 补全。

二者都接收完整 `DictLoadIntent`，其中包含 `dictId`、作用域、加载模式、值集合或检索词、上下文参数、刷新标志和请求代次。provider 返回标准 `DictNode[]`；适配外部响应形状的工作只能发生在此边界。

provider 是 composition root 注入的依赖。CRUD reducer、view model 与 UI adapter 只识别 provider 标识和 command/result 协议，不能 import 某个具体 HTTP 客户端。

### 2.3 字典状态

每个字典按 scope 保存下列事实：

- `visibleNodes`：当前控件可展示或检索到的节点；
- `knownByValue`：由可见节点和补全节点共同累积的值到节点索引；
- `status`、`error`、`activeRequest` 与 `generation`：当前请求生命周期；
- 当前查询与已归一化的上下文指纹。

`data` 投影为 `visibleNodes`，`dataMap` 投影为 `knownByValue`，因此既有只读消费者无需立即迁移。补全节点可以提供 label，却不应无条件扩张下拉可见列表。

## 3. 事件、effect 与并发语义

### 3.1 Command 和 Result

字典命令至少包含：加载、刷新、失效、按值补全和按检索词搜索。reducer 接收 command 后，先以纯逻辑计算 scope、参数与缓存键，随后产生完整的 `DictLoadIntent` effect；不得只传递字典 ID 或丢弃刷新/上下文信息。

effect 执行成功后派发带有原始关联字段（包括 `generation`、scope、缓存键和模式）的 `dict.loaded` 结果；失败后派发同样关联字段的 `dict.failed`。只允许 reducer 改写字典事实源。

### 3.2 缓存、刷新与乱序响应

- `refresh` 必须忽略可用缓存，并为目标 scope 生成新代次。
- `invalidate` 删除匹配缓存并使相关在途请求失效；其后结果即使返回也不得提交。
- 相同缓存键的并发普通加载可复用同一在途请求；不同 scope/参数/检索词不得错误合并。
- reducer 仅接受与当前 `activeRequest` 和 `generation` 匹配的结果；旧结果、取消结果和失效结果必须成为无状态变化的安全 no-op。
- provider runtime 可以使用取消信号优化资源，但正确性不能依赖网络层真的取消成功。

## 4. UI bridge 与触发策略

Element Plus adapter 只实现下面的翻译规则：

- 字典首次需要展示时，按 binding 的 eager/on-open 策略派发加载 command；
- 依赖字段变化时，派发带新上下文的加载或刷新 command；
- 控件值含有 `knownByValue` 中不存在的值时，派发按值补全 command；
- 支持远程搜索的控件把输入词转换为 search command，并根据配置进行去抖；
- 加载和失败状态从 view model 读取，映射为控件的 loading、disabled、empty/error 呈现。

adapter 不读取 provider、不构造 URL、不写缓存，也不在 watcher 中直接调用网络。字段变更本身仍由 CRUD form command 进入 reducer；字典触发 command 可由 reducer 依据 binding 生成，或由 adapter 作为纯交互翻译生成，但两者都必须走同一 effect/result 协议。

## 5. 兼容与迁移

现有固定 `data` 直接映射为内联来源；现有简单 URL 通过兼容 provider 适配为已注册来源。保留当前 `data` / `dataMap` view-model 字段，并在一个发布周期内保留旧配置的弃用提示。新能力（上下文、远程检索、按值补全、缓存策略）只通过新 `DictDefinition` 与 `DictBinding` 获得。

迁移文档必须给出：内联选项、固定远端、带上下文的 provider、按值补全及远程搜索五个配置样例，并明确 provider 的生命周期和缓存失效责任。

## 6. 测试与可观测性

测试分为四层：contract 类型与节点归一化、纯 reducer 的 effect/代次语义、provider runtime 的缓存与并发行为、Element Plus adapter 的交互桥接。每个异步用例使用可控 deferred provider，断言旧响应无法覆盖新上下文。

运行时应暴露可选诊断事件或调试快照，至少可区分缓存命中、发起请求、忽略过期结果和 provider 失败；诊断不得成为业务状态的第二事实源。
