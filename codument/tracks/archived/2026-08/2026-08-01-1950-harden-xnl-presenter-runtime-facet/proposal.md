# 变更：加固 XNL Presenter Runtime Facet

## 背景和动机 (Context And Why)

AUTHORING-T2 的独立验证证据发现，
当前 `createXnlProjectionPresenterRuntimeFacet(view)` 可以给任意对象加来源品牌，
`presentXnlProjection` 随后把 `facet.view` 原样交给 Presenter。只要调用方把
authority-bearing runtime 当作 view，Presenter 就会直接 possession ValueHost、VFS、
mutation writer 或 Domain authority。

根因不是字段命名，而是 raw host identity 被当成 capability facade。修正应把成功路径
收窄为 support-owned positive grants：可信代码定义 Presenter protocol，support 从一个
按既有 `bindScope`/`deriveScope` 得到的 Scope runtime 构造新的 exact frozen facade，
runner 只解析并传递该 owned facade。

## “要做”和“不做” (Goals / Non-Goals)

**目标：**

- 定义 support-owned、code-owned protocol 驱动的 snapshot/method positive grants，构造
  不携带 source identity、source prototype、未授予 capability 或非 grant facade own key 的
  exact frozen Presenter facade。合法 source 可以保有任意额外未授予 capability；projection
  忽略它们并成功构造 facade。
- 让 factory 与 runner 拒绝 raw host 直接充当 view、伪造 facet/protocol、unknown/forged
  grant、identity projection、grant 指向 accessor、facet extra own key 与 owner record 错配；
  source 上与 grant 无关的额外字段不是失败条件。
- 让 renamed authority 与常见名称 authority 都无法因为 host raw identity 或未授予字段
  进入 facade；安全判断只依赖 owned protocol/grants，不依赖字段名 denylist。
- 将显式 method grant 定义为 trusted code-owned protocol 的权限与 effect 审查边界。
  Runtime 不声称反射证明 arbitrary closure purity，也不声称阻止被授予方法内部的 effect。
- 对 method wrapper 的返回值 fail closed：只允许 serializable snapshot 或同协议 owned
  facade result，拒绝 raw host、authority object 或其他未拥有 object graph。
- 保持 object/class/prototype/mixin、private field、强类型泛型与现有
  `bindScope`/`deriveScope` Scope runtime 多态；method wrapper 稳定绑定原 owner。
- 保持 renderer-neutral Presenter adapter 通用 contract 与正常 render 的 surface data 输出。
  仅编辑意图通道约束为 serializable Interaction/Domain Command proposal data；该通道不含
  translator、authoring session 或 submit authority，后续 owner 调用发生在 Presenter 外部。
- 以红测、type-level contract、adversarial probe、全量验证、fresh verifier 与 GapLoop
  形成 corrective evidence。

**非目标：**

- 不实现或验收 Tiptap/ProseMirror/Vue NodeView；真实 NodeView 与 consumer 集成归后续
  TIPTAP track。
- 本 Track diff 不修改 `DocumentOccurrenceAssembly`、public Document contract 或 occurrence
  形状，不预生成 root/Capsule/Component Presenter facet，也不新增 NodeView consumer wiring。
- 本 Track diff 不新增 interaction-proposal submit bridge wiring；Presenter facet 与编辑意图
  proposal data 不携带 translator、authoring session、submit/apply/accept/persist authority。
- 不证明显式授予方法的内部 effect purity；错误授权属于 trusted protocol policy/review
  问题，不伪装成 runtime 可自动识别的 semantic authority。
- 不修改 Mission 控制面，也不在本 Track 内宣告 AUTHORING-T2 或 TIPTAP 完成。
- 不新增 Presenter/Authoring XNL 配置节点，不把 source、projector、grant implementation
  或 function object 放入 Presentation、ProjectionPlan、input 或 config。

## 变更内容（What Changes）

- **BREAKING**：移除“任意 object/class view 直接创建 facet”的成功语义。调用方必须使用
  support-owned protocol/grants；动态 raw-view 入口 fail closed。
- 在 projection contract/public surface 定义 protocol、grant、facet、direct-contained method
  return、closed diagnostic 与强类型推导边界。
- 在 support 实现 descriptor-safe capture、exact frozen facade、method return guard、facet
  provenance 与 runner-side authoritative lookup。
- 将现有 Presenter 调用迁移到显式 protocol；从一个按既有 Scope 规则得到的 runtime
  验证 object/class/prototype/mixin 与继承/覆盖多态，但不修改 occurrence consumer。
- 更新 projection/authoring 文档，准确区分 runtime possession guarantee、trusted method
  effect policy、正常 surface output、编辑意图 proposal data 与未来 TIPTAP consumer integration。
- 完整 upsert behavior
  `xnl-projection-editor-foundation/interaction-and-presenter-separation`，保留原 cases，并增加
  positive projection、fail-closed、method return containment 与 Scope polymorphism cases。

## 影响范围（Impact）

- 受影响的能力：`xnl-projection-editor-foundation`
- 受影响的 contract：
  `packages/dg-cell-mvi-halfcode-contract/src/xnl-projection/`
- 受影响的 support：
  `packages/dg-cell-mvi-halfcode-support/src/xnl-projection/`、相关 package root exports
- 受影响的测试/typecheck：Presenter registry/runner、runtime assembly Scope fixtures、
  contract/support public-surface typecheck、dependency/residue tests
- 受影响的文档：
  `docs/halfcode/dsl-bundle/spec/frontend/xnl-projection/` 与相关 authoring boundary 文档
