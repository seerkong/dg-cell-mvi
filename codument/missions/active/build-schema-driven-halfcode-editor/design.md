# Mission Design

## 期望架构

```text
StructureSchema<T> --------+
EditorPresentation? -------+----> compileEditorPlan ----> EditorPlan
SchemaEditorDialect -------+             |
                                           v
EditorPlan ---------------------> lowerEditorPlan ----> canonical shell App Bundle
                                                             |
                                                             v
                                             Halfcode runtime + schema-editor renderer
                                                             |
ValueHost<T> <---- SchemaEditorSession <---- normalized event / Command template
     |
     v
host mutation adapter + accepted/rejected snapshot
```

Schema 是领域语义事实；Presentation 是可选展示数据；Dialect 是代码实现策略；EditorPlan 是 renderer-neutral IR；Halfcode bundle 是 lowering 输出；宿主 mutation adapter 是真实写入边界。

## 标准函数协议

顶层编译分为两步：

```ts
const plan = compileEditorPlan(
  runtime,
  { schema, presentation },
  { planId },
)

const bundle = lowerEditorPlan(
  runtime,
  { plan },
  { target: 'halfcode' },
)

const session = createSchemaEditorSession(
  runtime,
  { plan, valueHost },
  { concurrency: 'revision-gated' },
)
```

每个 `classify`、transformer、lowering processor 都保持：

```text
output = fn(runtime, input, config)
```

建议 transformer 协议：

```ts
type SchemaEditorTransformer = (
  runtime: SchemaEditorCompileRuntime,
  input: {
    schema: SchemaNode
    presentation?: EditorPresentationNode
    path: EditorPath
    parent?: SchemaNode
  },
  config: TransformerConfig,
) => EditorPlanNode
```

递归由 runtime 暴露的 `compile(childInput)` 消息承担。transformer 不接收第四个 `next`/`compileChild` 参数，也不把 Processor 塞入 Data：

```text
compile(R, I, C)
  = selectTransformer(R.dialect, I)(R.at(I.path), I, resolvedConfig)
```

object transformer 递归编译 fields；array/map transformer 递归编译 item/value template，并生成 collection insert/remove/move、map rename-key 等标准 Command binding。

## SchemaEditorDialect

`SchemaEditorDialect` 是代码侧扩展边界：

```ts
interface SchemaEditorDialect {
  classify: SchemaClassifier
  transformers: TransformerRegistry
}
```

- `classify` 根据 schema、path、parent、annotations 和业务上下文产出 semantic descriptor。
- `transformers` 根据 semantic type、format、structural kind 或 stable presenter id 提供候选实现；选择算法属于 base compiler，不是 dialect 的第二个 resolver 入口。
- dialect 可组合为 `default -> shared project -> bounded context -> editor instance`。
- dialect 是包含函数的长生命周期代码依赖，必须绑定到 compile runtime；不得塞进单次 `config`。Halfcode DSL 只引用 stable dialect/presenter id，由 Scope runtime 绑定 TypeScript 实现。

解析优先级固定为：

```text
EditorPresentation.presenter
> current Scope business semantic binding
> schema format binding
> structural kind binding
> unsupported diagnostic
```

同一 `semanticType = user.phone` 在业务 A/B 可以由各自 Scope 绑定不同 transformer，语义 schema 无需复制或沾染组件配置。

## EditorPresentation

Presentation 只描述展示选择和布局：

- field path、顺序、分组、折叠、只读、隐藏；
- presenter stable id 与序列化 presenter options；
- object/array/map/union 的 item/value layout；
- 条件显示和显式 raw/code/ref picker 模式；
- flow-level 与 node-level presentation overlay。

它不包含函数、组件实例、Vue props closure、业务校验实现或写入逻辑。未覆盖字段继续由 schema + dialect 自动生成。

## EditorPlan IR

`EditorPlan` 至少表达：

- group、field、collection、map、union、custom presenter 等结构节点；
- stable path/key、value binding、validation binding、Command binding；
- collection item template，而不是按当前数组值手工复制静态节点；
- presenter id/options，不持有 Vue component；
- diagnostics 和 source/schema/presentation provenance。

引入 IR 的目的，是隔离 schema 递归、业务 transformer 与 Halfcode target lowering。未来可增加非 Vue renderer 或静态预览，而无需重写 schema compiler。

## 写入模型

通用 editor 只产生结构化 edit Command：

```text
value.set
collection.insert
collection.remove
collection.move
map.set
map.remove
map.rename-key
union.select
```

`lowerEditorPlan` 是纯 target adapter，只把 plan lowering 为可序列化 canonical shell sources；它不接收或捕获 `ValueHost`。`ValueHost<T>` 提供当前 snapshot、校验和 apply protocol，`SchemaEditorSession` 只缓存 host 返回的 accepted snapshot projection。Flow adapter 将结构化 Command 编译为 `XnlMutation[]`，同批 dry-run、canonical validation、VFS commit feedback；其他宿主可以转换成领域 Command、数据库 mutation 或 signal update。

## Canonical Shell 与动态模板

现有 canonical `RenderNodePlan` 是静态 children + 单 command binding，不能直接表达 EditorPlan 的多个语义事件和未来 collection/map wildcard template。Schema Editor lowering 因此生成包含单个 `schemaEditor.Editor` 原子的 canonical shell bundle，并让真实 sources 经过 loader、compiler 与 app runtime。Vue schema-editor renderer 在该原子内部消费 `EditorPlan + SchemaEditorSession`，按 accepted snapshot 动态实例化 `itemTemplate` / `valueTemplate`，不会在 lowering 时按当前数组值复制静态节点。

`SchemaEditorPresenterRegistry`（presenter id -> presenter adapter）与现有 canonical component registry（component identity -> Vue component）是两个不同协议。Vue 包拥有前者协议和递归 renderer；Element Plus 包提供默认 presenter adapters 并组合到 canonical component registry。

## 三档使用

1. **Schema only**：default dialect 自动生成完整编辑器。
2. **Schema + EditorPresentation**：局部覆盖 presenter、布局和 collection item 体验。
3. **Custom dialect/full Halfcode editor**：业务 `classify`、`transformers` 或完整 editor unit 可替换，但继续遵守 ValueHost、Command 和 mutation owner 协议。

## 历史模型映射

- Attribute Grammar：path/context/presentation 是 inherited attributes；EditorPlan/bindings/diagnostics 是 synthesized attributes。
- Compiler lowering + IR：schema AST -> EditorPlan -> Halfcode target。
- XSLT/template matching 与 multimethod：按 presentation、semantic type、format、kind 选择 transformer。
- JSON Forms/RJSF：schema + UI schema + widget registry，但本方案用 scoped TypeScript dialect、Halfcode bundle 和 owner mutation protocol收紧边界。
- Lens/Traversal：field focus 与 collection path 操作的读写模型；最终写入仍由宿主 adapter 拥有。
- Typeclass/DI Scope：同一 stable semantic/presenter id 在不同 Scope 绑定不同实现。

不采用封闭 Visitor 作为扩展核心，因为新增业务 semantic type 不应要求修改通用 compiler 的固定 visitor interface。

## 包归属

- `dg-cell-mvi-halfcode-contract`：schema、presentation、dialect protocol、EditorPlan、edit Command 数据契约。
- `dg-cell-mvi-halfcode-logic`：schema validation、classification/resolution、递归 compile、plan validation。
- `dg-cell-mvi-halfcode-support`：pure canonical-shell lowering、command-template resolution、ValueHost/session actor、Scope runtime bridge 与 bundle lifecycle。
- `dg-cell-mvi-halfcode-vue`：SchemaEditorPresenterRegistry 协议、递归 EditorPlan renderer、dynamic wildcard materialization 与 event bridge。
- `dg-cell-mvi-halfcode-element-plus`：默认 presenter adapters/components，并与 canonical component registry 组合。
- Workbench：Flow schema/presentation、business dialect、Flow StructureEdit -> XnlMutation adapter；不拥有通用 compiler。

## 控制论模型

- desired state：`mission.xml` 中 contracts -> compiler -> runtime/lowering -> Workbench migration + business reuse -> verify 的 DAG。
- actual state：dg-cell-mvi contract/logic/support/vue 包、Halfcode docs/fixtures/tests、Workbench Flow Editor 与四 Flow canonical XNL。
- actuation：创建、执行、验证和归档真实 tracks；必要时依据 evidence 修订 mission DAG。
- feedback：track tests、browser E2E、DEPA gate、用户手动验证、reports 与 actual code boundaries。

## Mission Actors

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| MissionPlanner | 期望态产出者 | Processor + Actor | 维护基座到消费方的 desired DAG 与 track 边界 |
| MissionObserver | 传感器 | Data + Actor | 读取 contracts、runtime、renderer、Flow adapters、测试和用户反馈 |
| MissionReconciler | 控制器 | Processor + Actor | 比较 desired/actual，识别缺口、漂移、门禁和重规划条件 |
| MissionApplier | 执行器 | Effect + Actor | 每轮执行一个 bounded action：创建/续跑/验证 track 或修订 mission |

## 计划与 track 的关系

mission 不直接修改产品代码。所有 contract、compiler、runtime、renderer、Workbench 迁移和 E2E 都通过真实 track 完成；mission 只保存依赖、状态、观察和重规划事实。

## 受控重规划

以下 evidence 可触发重规划：

- canonical Halfcode 现有 element/runtime 无法表达动态 collection item template；
- EditorPlan 需要拆出独立 package 或应保持在现有 contract/logic 包；
- Workbench Flow mutation adapter 暴露尚未进入通用 edit protocol 的结构语义；
- 业务 A/B demo 证明 semantic classification 或 scoped binding 的优先级不足；
- 用户手动验证发现 schema-only/editor-presentation 三档无法覆盖真实体验。

每次重规划必须写 report、递增 Revision、记录 evidence 与决策，不允许为了赶进度回退 JSON textarea 或 renderer-owned state。

## 风险

- **schema 与 presentation 再次混合**：contract tests 禁止组件实现和函数进入 schema/presentation 数据。
- **compiler 变成 service locator**：compile runtime 只暴露递归 compile 消息和当前 scoped dialect 数据；固定选择算法保持在纯 compiler 内并产出可观察 diagnostics。
- **业务 transformer 绕过 owner writer**：presenter 只能发标准 Command，不能持有 XNL/VFS/数据库写入能力。
- **动态 collection 只做当前快照展开**：EditorPlan 必须表达 item template 与 stable key/path，不接受仅靠重建静态 textarea 的伪实现。
- **Flow 特例污染基座**：Flow branch、port、XNL 语义只留在 Workbench adapter；通用包测试使用中立结构。
