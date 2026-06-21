# 方案设计：dg-cell-mvi-halfcode 工业化 DSL

## 上下文

当前 halfcode 包族已经具备 contract/logic/support/vue/element-plus/web 的基本分层，但 contract 仍以 legacy render schema 为核心。新的设计目标是把 halfcode 提升为产品线物料与编译层，使它能够为 admin、CRUD、flow editor、未来 workbench apps 提供可序列化、可版本化、可编译、可预览的产品制品。

## 方案概览

### 1. 四层 DSL 模型

1. 产品物料层
   - `HalfcodeDocument` 是 canonical 权威事实。
   - 表达 `ProductSpec`、`ModuleSpec`、`HalfcodeMaterial`、`StateModelSpec`、`ResourceSpec`、`EffectSpec`、`ExtensionSpec`。
   - `HalfcodeMaterial` 至少包括 `AdminShellMaterial`、`CrudMaterial`、`ViewMaterial`、`WorkflowMaterial`。

2. 领域运行时层
   - 复用 `dg-cell-mvi-core` 的 event/effect/reducer/eventLog/DataGraph。
   - runtime state 只由 MVI events 写。
   - schema seed 只作为 load/reset checkpoint snapshot。

3. 渲染投影层
   - `RenderPlan`、`CrudPlan`、`AdminShellPlan`、`EffectPlan` 是 compiler 派生物。
   - Vue/Element/native web renderer 只消费 plan，不反写 canonical document。

4. 编辑制品层
   - 编辑器命令产出 document mutation 或 artifact mutation。
   - `ArtifactPort` 统一 memory/browser storage/xnl-vfs/server storage。
   - XNL/VFS 可作为 artifact history、import、diff、mutation 的候选底座。

### 2. 包结构调整

```text
dg-cell-mvi-halfcode-contract
  document/*
  material/*
  compiler/*
  runtime/*
  legacy/*

dg-cell-mvi-halfcode-logic
  compiler/*
  projectors/*
  reducers/*
  migrations/*

dg-cell-mvi-halfcode-support
  ports/*
  runners/*
  adapters/*

dg-cell-mvi-halfcode-vue
  binding/*
  preview/*
  authoring/*
  compat/*

dg-cell-mvi-halfcode-element-plus
  materials/*
  preview-shell/*
  crud/*

dg-cell-mvi-halfcode-web
  materials/*
```

### 3. 编译流水线

```text
legacy/raw input
  -> parse/validate
  -> canonical HalfcodeDocument
  -> diagnostics
  -> material-specific plans
       - AdminShellPlan
       - CrudPlan
       - RenderPlan
       - EffectPlan
  -> runtime assembly / preview
```

只有 compiler/compat adapter 可以解释 legacy `HalfcodeSchema`、Halfcode 和 legacy `{{...}}` expression。

### 4. CRUD/admin 复用

- `CrudMaterial` 编译到 `dg-cell-mvi-crud` 的 options plan、resource descriptors、effect descriptors。
- `AdminShellMaterial` 编译到 route/menu/permission/settings/theme/i18n shell plans。
- Element Plus 包只提供 registry、preview shell、Element-specific adapter，不拥有 request/hook effect closure。

### 5. Expression / Binding

表达式拆成三类：

| 类别 | DSL 形态 | 编译目标 |
|---|---|---|
| 读取表达式 | `BindingExpr` | typed path / selector plan |
| 纯计算表达式 | `ComputeExpr` | processor registry entry |
| 副作用命令 | `CommandExpr` | `AppEvent` / `EffectRequest` descriptor |

legacy `{{...}}` 继续支持，但只能通过 legacy expression adapter 降级，不能进入 canonical document。

## 影响范围与修改点（Impact）

- contract：新增 canonical document/material/compiler/runtime/legacy 分区。
- logic：新增 parser/validator/compiler/projectors/migrations。
- support：新增 artifact/resource/effect/expression/component ports 与 runners。
- vue：canonical preview 走 `RenderPlan`；legacy renderer 保留在 compat。
- element-plus：抽出 material registry 和 preview shell，移出 request/hook construction。
- tests/demos：新增 canonical demo，保留 legacy compatibility demo。

## 决策摘要

- canonical document 是产品物料事实源；render plan 是派生投影。
- schema seed 是 checkpoint snapshot；live runtime state 是 runtime control fact。
- effect 必须是 descriptor + port。
- CRUD 是 halfcode sub-app，编译到 `dg-cell-mvi-crud`。
- XNL/VFS 是 artifact 候选，不是 runtime state owner。
- Actor 化只用于状态化资源实例，不作为 halfcode 默认运行时。

## 风险 / 权衡

- 风险：一次性重构范围过大。
  - 缓解：按六个 phase 切片推进，每个 phase 都有可验证产物。
- 风险：legacy demo 被破坏。
  - 缓解：保留 `legacy/` 与 `compat/` 路径，旧输入必须继续跑或给明确 diagnostics。
- 风险：canonical v1 过度设计。
  - 缓解：只做能映射到 admin/crud/view/resource/effect 的最小产品线物料；插件 actor 化放入后续 backlog。
- 风险：XNL/VFS 接入过早拖慢主线。
  - 缓解：第一阶段先定义 `ArtifactPort`，XNL adapter 可作为后续实现或最小 proof。

## 兼容性设计

- `LegacyHalfcodeSchema` 与 `HalfcodeDocument` 分离。
- `legacy -> canonical` migration 可产生 diagnostics。
- compatibility renderer 只处理 legacy 输入。
- canonical surface 不暴露 Halfcode-specific 字段、函数 hook、UI adapter closure。

## 迁移计划

1. 建立 canonical contract 与 legacy quarantine。
2. 实现 compiler pipeline 和 diagnostics。
3. 调整 runtime ownership 与 state binding plan。
4. 编译 CRUD/admin material 到现有 runtime 能力。
5. 增加 authoring artifact port 与最小 preview loop。
6. 收口 compatibility adapter 与 demo/test。

## 待解决问题

- canonical v1 的 material 覆盖范围是否包含全部 admin shell 设置。
- Halfcode 兼容的边缘行为是否全部迁移，还是先 diagnostics。
- XNL adapter 是否在本 track 内完成，还是只定义 port 与 memory/browser 实现。


## P7 修订：XNL core 与核心/扩展域分离必须真实落地

此前方案中将 XNL/VFS 表述为 artifact 候选底座，实际实现只做了 `ArtifactPort` 与 memory/browser adapter。这不足以满足本 track 的工业化 DSL 目标。修订后的要求是：

1. `HalfcodeDocument` 的 canonical core 需要能以 `xnl-core` 的 XNL 数据格式表达，并可 parse/stringify/roundtrip。
2. authoring mutation 不能只在 JS object 上修改；至少要通过 `xnl-core` 的 path/mutation 能力生成和应用 XNL mutation 证据。
3. 物料定义与复用要验证 `xnl-core` loader/import 能力：Prefab/export、Import resolver、vfs:// addressing 需要进入测试。
4. 低代码 artifact 应沿用 bastard flow editor 的三域思想：
   - `core`：canonical semantic XNL，唯一语义事实源。
   - `halfcodeExt`：编辑器/表单/折叠/面板等低代码编辑扩展。
   - `graphExt`：布局、坐标、viewport 等视觉扩展。
   - compiler/preview 消费 core + ext 的投影结果，但 ext 不反写 canonical core。

该修订不改变 P1-P6 的 contract/compile/runtime 方向，而是在 support/artifact 层补齐 XNL 生态实现。

## P8 修订：XNL-only asset bundle / folder loader

P7 已证明单个 HalfcodeDocument artifact 可以使用 xnl-core 表达、变更和导入，但还不能把一个文件夹作为应用制品包加载并驱动 admin + CRUD。P8 追加 bundle/folder loader，要求所有配置统一使用 XNL 数据格式：

```text
app/
  bundle.xnl
  app.halfcode.xnl
  app.halfcodeExt.xnl
  app.graphExt.xnl
  shared/
    crud-fields.xnl
```

约束：

1. 不引入 `app.halfcodeExt.json`、`app.graphExt.json`、XML manifest 或其他 JSON/XML 配置入口。
2. `bundle.xnl` 是 bundle manifest，声明 core、halfcodeExt、graphExt 的 vfs src。
3. `app.halfcode.xnl` 是 canonical semantic core，可使用 `<Imports>` 引用 shared XNL。
4. `app.halfcodeExt.xnl` 与 `app.graphExt.xnl` 是扩展域 XNL；它们只参与编辑器/布局/投影上下文，不反写 canonical core。
5. folder loader 通过注入 resolver 读取文件，不拥有文件系统；路径解析统一走 `xnl-core` 的 `vfs://@/`、`vfs://./`、`vfs://../` 语义。
6. loader 必须运行 `xnl-core.import.resolve` 与 `xnl-core.loader`，使 bundle 能复用 import、prefab、export。
7. E2E 验证不要求真实浏览器 mount，但必须走 `folder load -> HalfcodeDocument -> compileHalfcode`，并产出 `adminShellPlans`、`crudPlans`、`renderPlans`，证明 bundle 可以驱动 admin 壳 + CRUD 应用的运行输入。
