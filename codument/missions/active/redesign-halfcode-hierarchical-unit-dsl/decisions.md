# Decisions · redesign-halfcode-hierarchical-unit-dsl

来源：2026-07-02 人机设计讨论（基于已完成 track `redesign-dg-cell-mvi-halfcode-industrial-dsl` 的 P10-P12 形态继续演进）。以下决策均为用户拍板，mission 执行期不得静默推翻；如需变更走受控重规划并记录 report。

## D1 · 单元层级模型

- **Capsule 是唯一封装原语**，拥有 scope/config/state/effects/intents 全套能力，但**只能内联出现在 element tree 中**，不单独成文件夹、不可跨树复用。
- **Component = Capsule 的有名可复用版本**（app 内/跨 app），**Page = Capsule 的可路由/可嵌入有名版本**。两者拥有 Capsule 的全部能力与配置。
- 不设 `capsules/` 文件夹。

## D2 · Page vs Component 分界（输入契约）

- **Page 的输入 = URL 解析结果**：path variables、query variables、hash。除此之外 effects 等全部自包含，因此可独立运行，也可嵌入他处（如 admin 详情）。
- **嵌入 Page = 提供合成 URL 输入**：宿主嵌入 page 时提供 urlInputs，与 router 提供真实 URL 走同一通道。
- **Component 的输入 = props/slots**（Contract）。Page 不开 props 后门。

## D3 · 路由树上移 app 层

- `app.halfcode.xnl` 更名拆分：路由树放 `app.routes.xnl`；不属于 routes 的（Product 等）独立成文件（如 `app.product.xnl`）。
- PageElement 定义不再携带 `route`/`mount`/`title`（title 移 manifest 做默认值）；`mount="both"` 机制退役。
- App 是组合根：定义 page 路由树 + 单元注册。

## D4 · 实例 tag 语法：定义名做 tag

- 树内实例用定义 FQN 做 tag：`<dg.materials.CrudTable #users-table>`、`<dg.reports.ReportDetail #report-embed>`。
- 不用 `pages:`/`components:` 类别前缀——element tree 中的合法节点类型（atom/component/capsule/embedded page）与使用位置即可消歧，如 Java 限定名 `a.b.c.MyComponent`。
- FQN 用 `.` 分隔命名空间；`#id` 是实例局部身份。UI 库原子节点同规则（如 `<elementPlus.ElInput>`），原 `ui=` 属性冗余表达取消。
- 小写裸 tag = HTML 原生；保留字（`Capsule`、`Slot` 等）= DSL 结构节点。
- `<PageElement>`/`<ComponentElement>`/`<AtomicElement>` 实例标签退役；`CapsuleElement` 简化为 `<Capsule>`。

## D5 · Page 的 intent 出口与 page 间通信

- Page 契约含 **accepts + emits**。
- **Page 间通信类比 iframe postMessage**：由 app（route host）投递，page 互不持有引用；app 级 wiring domain（如 `app.intents.xnl` 的 `<Wire from to emit accept>`）显式接线。
- 寻址指向 **route 实例**而非 page 定义（同一 page 可挂多路由）。
- 未接线 emit → 编译 warning diagnostics；运行期投递失败 → runtime diagnostics。不静默丢弃。
- 三种通信拓扑归一：树内冒泡（capsule→宿主）、嵌入边界（embedded page emit 进入宿主树继续冒泡）、跨路由（app wiring）。

## D6 · Route 元数据

- page manifest 自带默认 `title`；Route 可覆盖，并追加 `menu`（icon/order）、`permissionRef` 等 app 视角元数据——这些是 AdminShellPlan 的编译输入。

## D7 · 统一 URI 引用系统

- 全部引用统一为 `<scheme>://...` 形态：
  - `vfs://` = **物理寻址**（无类别，按文件），沿用 xnl-core `@/` `./` `../` 语义。
  - `<类别scheme>://<path>` 或 `<类别scheme>://#<id>` = **逻辑寻址**（按类别）。
- 旧 `<类别>:<名称>` 点分引用（`scopes:users-page`、`config:a.b`）全部退役。
- 子路径分隔：`.` 留给 FQN 命名空间，`/` 表达结构层级（`config://#users-filter/keywordInput`）。
- scheme 注册表 = domain 注册表：manifest `Ports/MaterialBundle` 注册了什么 domain 就有什么 scheme；`pages://`、`components://`、`routes://` 为 app 结构派生的内建 scheme。
- 类别 scheme 默认只在**当前单元**解析（单元私有性）；跨单元只有 `pages://`/`components://` + 对方公共契约；共享定义走 `vfs://@/shared/` 显式 import。
- **scheme 短名 + domain 映射表固化在 contract 层**（如 `runtime-config` → `config://`）。

## D8 · def 域引用形态

- def 域是独立 scheme（`config-def://`、`state-def://`、`intent-def://` 等）。
- 更常用的物理形也合法：`configDefRef = "vfs://./a.config-def.xnl"`（整文件即 def 单元）。两形态等价并存。

## D9 · 公共边界放 contracts 文件

- 单元公共边界（Page: urlInputs+accepts/emits；Component: props/slots/accepts/emits/exposes）放 `*.contracts.xnl`，根类型按单元类别不同：`PageContract` / `ComponentContract`（+ 单元内部 `ElementContracts`）。
- **manifest 是薄清单**：只有身份（`#FQN`）、version、默认 title、`Ports` domain 注册，不放重信息。

## D10 · 单文件 / 多文件双形态

- Page、Component、**App 三级都支持**单文件与多文件形态，复杂度阶梯完整。
- 单文件形态：根节点 `#` 直接携带 FQN（`<Page #dg.reports.ReportDetail>`、`<Component #dg.materials.StatusBadge>`）；`(...)` 区段 = 内联 domain 根节点（`<Contract>`、`<Intents>`、`<Config>`、`<StateSeed>`…），与多文件拆出的文件根节点**完全同型**；`[...]` 段 = element tree。
- 多文件形态：manifest（`page.xnl`/`component.xnl`）根节点 `#FQN` + `Ports` 显式注册 domain 文件，**允许缺省**（缺省 = 该域为空）。
- 单→多文件化是纯机械重构，引用不变（逻辑寻址不感知物理布局）。
- domain / scheme / 单文件区段标签三列对照表固化在 contract 层。

## D11 · children 用 XNL 数组段

- 默认 children 直接用节点的 `[...]` 数组段表达；`<Children>` 包装节点退役。
- `(...)` 区段留给具名结构：具名 slots（`<Slot #footer [...]>`，`#id` 即 slot 名）、单文件 domain 区段。
- **附注（2026-07-02 replan-002，evidence 驱动精化）**：xnl-core `(...)` 区段按 tag 键控去重，同名 `<Slot>` 多个会互相覆盖。多具名 slot 统一用容器 `<Slots [ <Slot #a [...]> <Slot #b [...]> ]>`（数组段无去重）；单 slot 直写 `<Slot>` 仍兼容。

## D12 · 内联字面量 props

- 允许实例节点内联静态可序列化字面量 props（`<dg.materials.CrudTable #t { pageSize = 20 }>`）。
- 绑定/计算仍走 ref 或 BindingExpr；**禁止内联函数**（canonical 无函数红线不变）。

## D13 · Wire / Route 寻址

- scheme + 虚拟路径：`routes://a/b/c`（path 形）或 `routes://#report-detail-route`（id 形）。
- `<Route>` 节点加 `#id`，wiring 优先引用 id，避免 path 变更牵连。

## D14 · Capsule 宿主期望契约（Requires）

- ElementContract 为 capsule 增加 `<Requires>` 区段：声明对宿主 scope 链的期望——state（**写 state-def 字段路径**，裸路径字符串，不新增 `state://` scheme）、intents、config。
- 编译校验：capsule 实例挂入宿主树时沿 scope 链逐项核验；不满足 → `HALFCODE_CAPSULE_REQUIRES_UNMET` diagnostics。

## D15 · 单元注册与发现

- bundle.xnl 增加 `Units` 段：`<UnitBundle kind="page|component" path="vfs://...">`，path 指向**文件（单文件形态）或文件夹（多文件形态）**，loader 按后缀区分。
- loader 读各单元 manifest/根节点建 FQN 注册表并校验唯一性。
- **附注（2026-07-03 用户拍板）**：文件夹单元的 manifest **统一命名 `manifest.xnl`**（原 kind-named page.xnl/component.xnl 退役）；**manifest 根节点（`<HalfcodePage>`/`<HalfcodeComponent>`）是 kind 的真源**，文件夹名与 kind 无关——与单文件版"路径与 FQN 可以不一致"的规则对齐（内容为真源，路径只是物理布局）。Units 的 `kind=` 保留为声明意图，与根节点不符仍报 HALFCODE_UNIT_KIND_MISMATCH。

## D17 · Adapter 四边界范式（2026-07-03 用户拍板；同日按 DEPA 理论修订形态）

- **原则**：adapter 是每个级别的概念——element、capsule、scope、component、page 都可能用到，不限制死在 app 根目录。adapter 只是按职责划分出来的一种**纯函数式代码 logic**。
- **理论根基（depa-expert 标准组件协议）**：只要是封装模式，core logic 之外必有 **input / output / config / runtime** 四个概念；缺少任一个，职责就会混杂、软件逐步失控。**adapter 就是它们之间的转换过程**：`outer{runtime·input·config} → derived → inner{runtime·input·config} → core_logic → inner output → outer output`。
- **DSL 形态**（2026-07-03 第三轮收敛：去 Port 化）：
  - Adapter 的 `type` 词汇**固定为边界名**：`derived | runtime | input | config | core | output`（六处理器链；不允许自由命名 stage）。
- **挂载语法唯一**：Adapter 直接挂封装节点的 `(...)` 区段，**type 必填**——`<Effect #users-search { ... } ( <Adapter type="input" lang="typescript" src="vfs://./adapters/search-input.ts"> )>`。**不使用 `<Port>` 包装**（Port 是进程边界抽象；halfcode 的封装点——Capsule/Effect/Component 实例/Scope——本身已是边界，再套 Port 属冗余）。
  - **挂载点通用**：Effect、element 实例（含 Capsule）、component/page 单元边界等任何封装点均可挂；**RuntimeProfile 不再是挂载点**（该域已移除，见 D18）。
  - **Adapter 无独立身份注册域**：它的身份 = 挂载点 + 边界 type；不引入 `adapter://` scheme。复用单位是**脚本文件**（`src="vfs://..."`），共享走 `vfs://@/shared/adapters/` 或 prefab export。
  - 不声明 = 显式 identity（沿 P9：不压扁阶段概念）；本体规范沿 P9 不变：纯函数 `run(runtime, input, config) -> output`、只允许外部脚本 src、禁内联、loader 只解析校验不执行。
  - 每个封装点自己声明自己需要的转换（adapter 唯一存在理由 = 该点 outer/inner 结构不一致），**不做跨层检索/回落**。
- **勘误**：2026-07-03 早先版本曾提出 `<Adapters>` 注册域 + `adapter://` scheme + `<Stage stage=... adapterRef=...>` 形态，经用户指正违背四边界范式，撤回；同日第二版的"Port 内挂"形态经用户指正在前端场景冗余，亦撤回。

## D18 · runtime-profile 域暂缓（2026-07-03 用户拍板）

- `app.runtime-profile.xnl` 的本意是 DEPA 的 runtime 侧——声明这个 app runtime 如何构造。但**当前低代码运行 app 需要哪些 runtime 尚未梳理清楚**，先删掉该文件与 domain（`runtime-profile` / `profile://` / `<RuntimeProfile>` 从对照表移除），待梳理清楚后再补充。
- 随之退役：`runtimeProfileRef`（Scope 上）、`adapterRef = "profile://#..."`（Effect 上）。Effect 的 adapter 绑定改用 D17 的直挂形态。
- fixtures 的 `adapters/*.ts` 纯函数脚本保留（它们是 D17 形态下的复用单位，后续 Effect 直挂时重新引用）。
  - ~~adapters 独立 domain + `adapter://` scheme~~（首轮草案撤回）：adapter 是 vfs 引用的脚本文件，共享走 `vfs://@/shared/adapters/`。
  - 本体红线沿 P9：`run(runtime, input, config) -> output` 纯函数；只允许外部 `src="vfs://..."`，禁内联；loader 只解析校验不执行。

## D16 · xnl-core 能力验证策略

- 规划期**不做**语法支持验证。作为 mission 任务执行：验证 tag 名含 `.`、同节点 `(...)` 与 `[...]` 并存、属性值含 `://` 等。
- 若 `xnl.ts` 不支持，**修改其源代码**以支持。
