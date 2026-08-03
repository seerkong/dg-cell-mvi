# XNL Presenter Runtime Facet 最小权限设计

## 1. 控制目标

当前链路：

```text
arbitrary object -> WeakSet brand -> facet.view -> Presenter
```

目标链路：

```text
Scope runtime obtained through existing bindScope/deriveScope
  -> trusted code-owned Presenter protocol
  -> support-owned positive grants
  -> descriptor-safe capture
  -> exact frozen facade
  -> owned facet record
  -> runner authoritative lookup
  -> renderer-neutral Presenter adapter
```

该链路保证 Presenter 不会因 raw host passthrough 而直接 possession source identity、host
prototype 或任何 ungranted capability。它不证明被 protocol 显式授予的方法没有内部 effect。

## 2. 安全保证与信任边界

### 2.1 Runtime 必须保证

1. Facet provenance 与 capability attenuation 分离。来源品牌不能替代 positive grants。
2. Factory 不接受 raw arbitrary view，也不允许 facade/source identity 相同。
3. Runner 不信任公开结构字段；它只从 support 私有 owner record 解析 projected facade，
   record 缺失、伪造、错配或失效时在调用 Presenter 前失败。
4. Facade 是由 grants 精确构造并冻结的新对象，不继承 host prototype，只包含 grant 对应的
   own data keys，不包含 raw source 或 unowned nested object graph。合法 source 上任意额外
   ungranted capabilities 被正向 projection 忽略，不影响构造成功，也不会触发 accessor。
5. Snapshot grant 只产生 serializable readonly snapshot。
6. Method grant 只捕获显式 own/prototype data-function，稳定绑定原 owner。每次调用的返回值
   必须被 wrapper 验证并转换为 serializable snapshot，或确认为同协议 owned facade；raw
   host、authority object 和其他 object graph 一律 fail closed，不返回给 Presenter。
7. Raw host 直接充当 view、forged protocol/facet、unknown/forged grant、identity projection、
   grant 指向 accessor、facet extra own key、owner mismatch、相关 Proxy/reflection failure 与
   malformed method result 均 fail closed，不执行 getter，不调用 Presenter，也不选 fallback。

### 2.2 Runtime 不保证

显式 granted method 本身属于 trusted code-owned protocol 的权限与 effect 审查边界。因为
JavaScript function 可以闭包捕获或通过绑定 owner 执行 effect，runtime 不声称通过字段名、
reflection 或返回值检查证明 arbitrary closure purity，也不声称阻止该方法内部已经发生的
effect。错误地授予 effectful method 是 protocol policy defect，必须由 code review、测试、
AttractorCheck 与 verifier 发现。

因此，renamed authority 测试证明的是：未授予能力不会仅因 host raw identity 进入 facade。
若 trusted protocol 明确授予某个改名的 effectful method，该方法就是已授权能力，runtime
不会也不能按 semantic authority 自动撤销它。

## 3. Contract 形状

Contract 层定义 renderer-neutral protocol/facet/result，不依赖 support implementation、
DOM、Tiptap、xnl-core、xnl-vfs 或 authoring writer。概念形状如下，最终命名可遵循现有
capsule 风格，但语义不得降级：

```ts
interface XnlProjectionPresenterCapabilityProtocol<THost, TView extends object> {
  readonly id: string
  readonly grants: readonly XnlProjectionPresenterCapabilityGrant<THost, TView>[]
}

interface XnlProjectionPresenterRuntimeFacet<TView extends object> {
  readonly protocolId: string
  readonly view: Readonly<TView>
  readonly opaquePresenterFacetBrand: unique symbol
}

type CreatePresenterFacetRuntime<THost, TView extends object> = Readonly<{
  source: THost
  protocol: XnlProjectionPresenterCapabilityProtocol<THost, TView>
}>
```

Facet construction 遵循 `output = fn(runtime, input, config)`。Source 与 code-owned protocol
是 runtime；input/config 不携带 source、projector、writer、registry、grant implementation
或 function object。

Protocol 只提供正向 grant：

- `snapshot`：从显式 data descriptor 取得值，验证为 serializable data，深快照并冻结；
- `method`：从显式 own/prototype data descriptor 取得 function，绑定 source，以检查参数与
  返回值的 wrapper 暴露；成功时直接返回 serializable snapshot 或同协议 owned facade，
  非法结果抛出 closed diagnostic，不返回 result envelope。

不提供 `raw-object`、`identity`、`spread-source`、任意 nested object passthrough 或
`proposal.submit` grant。复合 capability 只能引用已由同一 protocol owner 登记的 facade。

## 4. Support-Owned Projection

### 4.1 Protocol ownership

Protocol 与 grants 只能由 support factory 创建并登记。结构相同对象、spread/copy、类型
断言或自制 symbol 均不能通过 ownership 检查。Protocol id 与 owner record 必须一致；重复、
unknown 或 forged grant 显式失败。这里的非法 grant/facet own key 与 source 上未授予字段不同：
后者不参与 projection，必须被排除且构造成功。

### 4.2 Descriptor-safe capture

Capture 沿 source prototype chain 查找明确指定的 descriptor：

- 只读取 grant 明确指向的 data descriptor；grant target 是 getter/setter 时拒绝且不执行
  accessor，未授予的 source accessor 不读取也不影响构造；
- 捕获 reflection/Proxy trap 异常并返回 closed diagnostic；
- method 必须是 function，并绑定原 source，以保留 private field、prototype 与 mixin
  的 `this` 语义；
- snapshot 必须通过 serializable validator；
- facade 仅有 grants 对应的 own data properties，冻结且不继承 host prototype；
- facade own string/symbol keys 与 protocol grants 完全一致。

这允许 source 是 object、class、prototype-derived 或 mixin-composed instance，而 adapter
的静态类型只看到 `TView`，不看到 `THost`。

### 4.3 Method return guard

Method wrapper 在把结果交还 Presenter 前执行 closed validation：

1. Primitive 与 serializable data 被复制成 immutable snapshot。
2. 已登记、同协议拥有的 facade 可以按 owned identity 返回。
3. Source identity、host object、function、symbol、accessor-bearing value、循环/不可序列化
   graph、foreign facade 或 ownership 不确定的 object 一律抛出 closed diagnostic。
4. Async method 若在 contract 中允许，须对 resolved value 执行同一检查；不得因 Promise
   绕过返回值边界。

Return guard 只阻止 raw authority object graph 被 Presenter possession，不回滚也不证明
method 在生成返回值前没有执行 effect。

公开 grant/protocol 类型同时关联 `THost`、`TView`、`sourceKey`、`facadeKey` 与 method
signature。Method compatibility 要求参数一致，并要求 host 的 `Awaited` return 经 containment
后可安全赋给 facade 的 `Awaited` return；不能把 `unknown` host result 声明成更具体的 facade
result。反射实现所需的 cast 只存在于 support capsule 内部。

### 4.4 Facet owner record

Support 私有 owner record 关联 facet、protocol 与 projected facade。Runner 必须通过内部
resolver 获取 record 中的 facade，并验证 facet 冻结、protocol id 一致、公开 view identity
未错配；不能只做 `WeakSet.has(facet)` 后读取调用方字段。

## 5. Presentation Runner

Runner 的递归、post-order、stable Presenter id、surface matching 与 output validation
保持不变。runtime 入口调整为：

```text
validate registry
  -> resolve owned Presenter facet
  -> obtain internally recorded exact facade
  -> validate Plan/surface facts
  -> invoke adapter(facade, input, config)
```

Raw host/旧式 raw view 直接进入 Presenter、`{ view }` 伪造、未拥有 protocol、unknown/forged
grant、identity projection、accessor target、facet extra own key、mutable/malformed facet 或
owner record mismatch 都必须在 adapter 前失败，且不因兼容 diagnostic 选择 fallback
Presenter。合法 source 上任意额外 ungranted capability 只会被 projection 排除，不属于失败分支。

Runner input 使用 descriptor-safe positive parser，只接受 own data-property `plan` 与可选
`surfaceState`。任何额外 own key、accessor 或 reflection failure 都在读取 Plan 和调用
Presenter 前 fail closed；公共类型和 runtime 都不维护 authority-name denylist。

## 6. Adversarial Matrix

负向测试使用真实可调用 probe，并区分“未授予 capability”与“显式授予 method”的语义：

1. 旧 raw arbitrary view API 不再成功。
2. 合法 source 可同时含常见名称、任意改名或其他额外 ungranted capabilities；projection
   成功，facade 只含 grants，且不读取无关 accessor。
3. Raw host 直接当 view、伪造 protocol/facet、unknown/forged grant、identity projection、
   accessor target、facet extra own key 与 owner mismatch 在 Presenter 前失败。测试不实现
   字段名 denylist，也不把 source 的额外未授予字段归类为非法 facet。
4. Trusted protocol 明确授予的 method 可被调用；测试把它视为 policy grant，不要求 runtime
   自动判断其 semantic authority，也不以“内部 effect counter 必为 0”作虚假验收。
5. Granted method 返回 source、host authority、foreign facade 或任意未拥有 object graph 时，
   wrapper fail closed，Presenter 无法取得返回对象；serializable snapshot 与同协议 owned
   facade result 成功。
6. Accessor getter 不执行；所有在 adapter 前失败的分支断言 Presenter call count 为 0。
7. Facet 创建后修改 source own fields、prototype 或 protocol-like object，不扩大已捕获
   surface；method owner binding 保持稳定。

## 7. Scope Runtime Polymorphism

本 Track diff 不改变 Document occurrence/public contract。测试从一个已通过现有
`bindScope`/`deriveScope` 得到的 Scope runtime 开始，使用 code-owned protocol 形成独立
Presenter facet：

- class instance prototype method 可使用 private state；
- derived Scope runtime 保留既有 parent/child capability 继承与覆盖结果；
- mixin method 与 own override 按现有 runtime assembly 语义被显式捕获；
- accessor-bearing 同名 capability 被拒绝且 getter 不执行；
- Presenter 收到新 facade，不收到 Scope runtime identity；
- 泛型推导得到 exact readonly projected interface，host-only capability 访问产生编译错误；
- 合法消费不依赖 `any`、开放 string index signature 或 raw host cast。

这里验证的是 source polymorphism 与 facet 独立性。本 Track diff 不修改
`DocumentOccurrenceAssembly`/public Document contract，不预生成 root/Capsule/Component
Presenter facet，也不新增 NodeView consumer wiring。真实 consumer wiring 归后续 TIPTAP track；
仓库中可能存在的既有 occurrence 或 proposal API 不是本 Track 的 residue 失败条件。

## 8. Presenter Surface Output 与编辑意图 Proposal Data

通用 renderer-neutral Presenter adapter 的正常 render 输出仍是经过既有 validation 的
surface data。只有 Presenter 表达编辑意图时，该交互通道的输出才约束为 serializable
`XnlProjectionInteraction` 或 Domain Command proposal data；该 data/facet 不 possession
translator、authoring session、submit callback 或其他 submit authority。

```text
Presenter adapter render -> validated surface data
Presenter edit-intent channel -> serializable Interaction/Command proposal data
external owner -> translator and/or authoring session -> apply/accept/persist
```

Owner 的调用发生在 Presenter 外部。Tiptap NodeView 的事件接线、proposal 消费与真实
authoring integration 不属于本 Track。

## 9. Package 与迁移边界

```text
dg-cell-mvi-halfcode-contract
  <- dg-cell-mvi-halfcode-logic
  <- dg-cell-mvi-halfcode-support
```

- contract 只定义 protocol/facet/result/types；不依赖 support、xnl-core、xnl-vfs 或 renderer。
- logic 保持既有 projection/translation 行为；render 保持 surface data，Interaction translation
  仍只产生 proposal data。
- support 拥有 protocol/grants、facet owner record 与 Presenter runner。
- 不新增 Vue、Tiptap、ProseMirror、DOM、HTML、Element Plus 或 xnl-vcs 依赖。

旧 `createXnlProjectionPresenterRuntimeFacet(presenterRuntime)` 成功用法迁移到显式 protocol。
Neutral Presenter 使用 empty protocol，class fixture 使用明确 method protocol。不得保留接受
任意 raw object 的成功 overload 或 hidden compatibility escape hatch。

## 10. 验证矩阵

- 红测与 runtime：合法 source 的任意额外 ungranted capabilities 被排除且构造成功；raw host
  直接当 view、forged protocol/facet、unknown/forged grant、identity、accessor target、facet
  extra own key、owner mismatch 则 runner zero-call 并 fail closed。
- Method boundary：serializable snapshot/同协议 facade 成功；raw host、authority/foreign object
  graph 与 malformed async result fail closed；明确记录内部 effect 不可反射证明。
- 正测：empty/snapshot/method protocol、recursive Presenter、stable options/output。
- Scope：object/class/prototype/mixin/private field、`bindScope`/`deriveScope` inherit/override。
- 类型：exact projected interface、host capability negative access、public exports、无 any。
- Output：正常 render 输出 surface data；编辑意图通道只输出 serializable
  Interaction/Command proposal data，且不新增 submit bridge wiring；translator/session 由外部
  owner 调用。
- 回归：contract、logic、support 全量测试与 package/dedicated typecheck。
- 架构：dependency/import scan、renderer residue、denylist-independent renamed probe、全仓 raw
  facet 调用扫描、package-root smoke 与 `git diff --check`。
- Codument：`codument validate harden-xnl-presenter-runtime-facet --strict`。
- 独立验证：fresh verifier 对 behavior/proposal/design 与实现逐项复现；终态运行 GapLoop。

## 11. 风险与缓解

- **Trusted method 可执行内部 effect**：将 protocol/grant 作为显式权限与 effect review
  surface；文档与测试不得把 return guard 写成 purity proof。
- **Method 返回 authority graph**：wrapper 对 sync/async result 统一 fail closed，只允许
  serializable snapshot 或同协议 owned facade。
- **强类型被宽类型抹平**：以 protocol 泛型推导 `TView`，用 dedicated typecheck 禁止
  `any`/index-signature 逃逸。
- **Private field 因 `this` 丢失**：descriptor-safe capture 后绑定 owner，并覆盖 class/
  prototype/mixin tests。
- **兼容 overload 重开漏洞**：旧 raw-object path 只有明确 failure，不保留成功分支。
