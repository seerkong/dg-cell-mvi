# Mission Decisions

## D1 — Presentation 与实现分离

`EditorPresentation` 只引用 stable presenter id 和序列化 options，不直接嵌入组件或 transformer 实现。

## D2 — Dialect 是代码扩展边界

`SchemaEditorDialect` 的公开代码词汇只有 `classify` 与 `transformers`。相同 semantic type 可在不同业务 Scope 中绑定不同实现；固定选择算法由 base compiler 拥有。

## D3 — 保持标准 Processor 公式

`classify`、transformer、lowering 均使用 `output = fn(runtime, input, config)`；递归能力由 runtime 消息提供。

## D4 — 两阶段编译

Schema Editor 先生成 renderer-neutral `EditorPlan`，再 lowering 为 canonical Halfcode App Bundle，不让 renderer 直接消费 raw schema。

## D5 — 结构化 Command 与宿主写入

编辑器只发 set/insert/remove/move/map/union 等结构化 Command。Flow 使用 XNL mutation adapter，其他宿主提供自己的 owner writer。

## D6 — 无隐式 JSON fallback

JSON/raw code presenter 只能由 schema format 或 presentation 显式选择；未知结构必须产生 diagnostic，不能静默退化成 JSON textarea。

## D7 — 解析优先级

`presentation presenter > scoped business semantic transformer > format transformer > structural kind transformer > diagnostic`。

## D8 — 通用基座归 dg-cell-mvi

contracts、compiler、runtime/lowering 和默认 presenters 归 dg-cell-mvi；Workbench 只拥有 Flow schema/presentation/dialect 与 XNL mutation adapter。

## D9 — Dialect 归 runtime，不归 config

`SchemaEditorDialect` 包含长期存活的代码处理器，属于 runtime 依赖。`compileEditorPlan(runtime, input, config)` 从 runtime 取得当前 scoped dialect；`config` 只承载 plan id、诊断模式等纯静态编译选项。

## D10 — Lowering 不捕获 ValueHost

`lowerEditorPlan(runtime, { plan }, config)` 是 pure target adapter，只生成可序列化 canonical bundle sources。`ValueHost` 与 accepted snapshot 属于独立 `SchemaEditorSession` runtime/actor，不进入 lowering input 或 bundle data。

## D11 — Canonical Shell

现有 canonical render plan 不扩张成第二套动态 editor IR。Lowering 生成单个 `schemaEditor.Editor` 原子的 canonical shell；Vue schema-editor renderer 在原子内部递归消费 `EditorPlan + session` 并动态物化 wildcard templates。

## D12 — 两类 Registry 分离

`SchemaEditorPresenterRegistry` 将 presenter id 绑定到 presenter adapter；canonical component registry 将 component identity 绑定到 Vue component。Vue 包定义前者协议与 renderer，Element Plus 包提供默认 adapters 并组合到后者，二者不混成一个全局 registry。

## D13 — G3 四 Track 顺序

G3 依次执行 renderer-neutral contract feedback、logic/support runtime/lowering、Vue renderer、Element Plus presenters。Flow/XNL mutation 继续留在 Workbench G4，不提前进入通用包。
