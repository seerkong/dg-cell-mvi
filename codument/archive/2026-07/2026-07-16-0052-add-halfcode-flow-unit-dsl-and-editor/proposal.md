# 变更：新增 Halfcode Flow Unit DSL 与 canonical 编辑器

## 背景和动机 (Context And Why)

Halfcode 当前只把 Page/Component 作为 bundle unit；Workbench Flow Editor 则直接发现 `*.CtrlFlow.xnl` / `*.DataFlow.xnl`，用自己的 parser/converter 和 `*.graph.json` / `*.halfcode.json` sidecar 维护编辑状态。简单 Welcome seed 由 `flowPersistence.ts` 硬编码，原有复杂 `CtrlFlowDemo1`、`DataFlowDemo1`、`DataFlowDemo2` 又留在独立测试数据中，无法验证最新 Halfcode bundle、typed refs 和 loader/compiler。

本 track 是 mission `introduce-halfcode-flow-units` 的第一步：先让真实简单/复杂 Flow 成为 canonical bundle units，并让 Workbench 只消费 Halfcode 输出的 authoring plan。它有意停在“可声明、加载、诊断、投影、编辑和持久化”，不进入 flow execution runtime。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- **BREAKING**：把 canonical bundle 根从 `<FrontendApp>` 泛化为 `<AppBundle>`，现有 fixtures/docs/tests 一次性迁移，不保留双根方言。
- **BREAKING**：AppBundle 全部 URI scheme 改用单数 kebab-case 实体名；既有 page/component/route/contract/scope/command/event/effect/data-graph/runtime/scope refs 与新增 ctrl-flow/data-flow/flow logic/flow authoring refs 一次性迁移，不保留复数或 dotted scheme alias。
- 扩展 `UnitKind` 为 `page | component | ctrl-flow | data-flow`，以目标文件根 tag 校验 kind，并注册 `ctrl-flow://` / `data-flow://` typed refs。
- 定义 CtrlFlow/DataFlow 的结构 DSL、文件形态、节点 identity、端口/分支/`waitFor` 依赖边、code refs 和 authoring plan；compiler 只产出可序列化 plan。
- DataFlow 以 Entry/Transform/Sink/SubFlow/Return 五类直接节点、FlowContract、用于完成事实的 `flow-node://#node`、用于端口数据的 `flow-port://#node/port`、data/waitFor/subflow 三类边表达；旧 `ComputeNode` / `ConsumeNode` 分别迁移为 `TransformNode` / `SinkNode`，旧 `waitNodeKeys` 一对一迁移为节点 `waitFor` 和 plan `waitForEdges`，不保留 GraphConfig/Config/connectedInputs/waitNodeKeys 历史包装。
- 删除 EffectType、GraphLogicType、FlowLogicType 中间 catalog 与对应 scheme：类别由实际 node tag 表达，TS 签名作为节点 `type = "vfs://...#Type"` 配置，Quick 直接用 `src`/`impl`，闭集选项继续使用裸值。
- 新建 canonical `flow-showcase` fixture：Welcome CtrlFlow、Welcome DataFlow、复杂 CtrlFlow、复杂 DataFlow main、复杂 DataFlow subflow。
- 迁移旧 inline expression/statement 与 `clazz + methodName` 为 `vfs://...#export` 或 typed logic ref；TS 只作为类型/实现入口，不在本 track 执行。
- Workbench 通过 `dg-cell-mvi-halfcode-support` 加载/编译 fixture，展示和编辑 canonical plan，并由领域 owner 写回 XNL。
- 用独立、单写入者的 `flow.authoring` 域保存 position/viewport/pin 等持久化布局事实；selection、hover、form draft 等保持 runtime state；editor view model 由 semantic + layout data 只读派生。布局字段属于 `{}` 业务属性，不属于 XNL metadata slot。

**非目标:**

- 不 import/resolve/call flow code modules，不实现 `runFlow`、scheduler、interpreter、executor 或 subflow invocation。
- 不冻结取消、超时、错误传播、并发度、scope runtime visibility 等执行 ABI；这些属于后续 `add-halfcode-flow-runtime-contracts`。
- 不把 DataFlow 编译成或挂载为 `depa-data-graph`。
- 不在 Workbench 新建平行 Flow schema、loader、fixture corpus 或语义 sidecar。
- 不改动 Flow Editor 以外的 Workbench 产品交互。

## 变更内容（What Changes）

- Contract：新增 Flow unit、typed refs、serializable CtrlFlow/DataFlow authoring plans 和 diagnostics 类型；把 `HALFCODE_SCHEME_TABLE` 与所有 ref validation 改为单数 kebab-case scheme 真源。
- Support：支持 `<AppBundle>`、flow 单/多文件加载、kind/root/FQN/ref/port/topology 校验与 plan compilation；resolver 只接受 canonical 单数 kebab-case scheme。
- Docs：新增 `std/flow/`、`spec/flow/`，修订 foundation 的 domain/container 与 entry scheme 命名规则，并更新全部 frontend/effect/runtime/data-graph 引用示例。
- Fixtures：新增 `flow-showcase`；迁移所有 canonical app manifests 为 `<AppBundle>`，并迁移所有既有 bundle URI 为单数 scheme。
- Workbench：以 canonical fixture catalog/loader/compiler 替换硬编码 seed 和 private semantic converter ownership；保存命令按 semantic/flow.authoring/runtime 三类事实路由，组合 projection 只读。
- Tests：contract/support round-trip、复杂样例结构、既有 admin 回归、Workbench component/integration/browser E2E，以及 no flow execution export/code-resolution 扫描。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-flow-units`
- 受影响的代码：
  - `docs/halfcode/dsl-bundle/`
  - `packages/dg-cell-mvi-halfcode-contract/`
  - `packages/dg-cell-mvi-halfcode-support/`
  - `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-bundles/`
  - `../../ai/eidolon/eidolon-workbench/frontend/packages/bastard/`
- 兼容性：`<FrontendApp>`、复数 URI scheme 与 dotted URI scheme 均不再是 canonical 输入；仓内 docs、fixtures、consumers 和 tests 在同一 track 内完整迁移，不新增 compatibility branch 或 alias。
