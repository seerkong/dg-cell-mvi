# 变更：新增 Halfcode Schema Editor Vue Renderer

## 背景和动机 (Context And Why)

Schema Editor 已经具备 renderer-neutral `EditorPlan`、pure canonical shell lowering、scoped `ValueHost`/`SchemaEditorSession` 和 revision-gated accepted snapshot。当前 canonical bundle 也能通过真实 loader/compiler/app-runtime lifecycle 生成唯一的 `schemaEditor.Editor` atom，但 Vue 包尚不能把这个 shell 渲染为可交互编辑器。

本 track 在现有 `dg-cell-mvi-halfcode-vue` capsule 内补齐 UI toolkit-neutral 的 presenter registry、递归 `EditorPlan` renderer、collection/map wildcard template 动态物化、normalized presenter event 到 session dispatch 的桥接，以及 canonical shell registry integration。Vue renderer 只投影 session 已接受的 snapshot；所有真实修改继续由 scope 中的 `ValueHost` owner 执行。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 定义 `SchemaEditorPresenterRegistry`，将 stable presenter id 受控映射到 adapter/component implementation，且不与 canonical component registry 混成全局 service locator。
- 递归渲染 `group`、`field`、`collection`、`map`、`union`、`custom` 六类 `EditorPlanNode`，不回读 raw schema。
- 在每次 accepted snapshot render 时动态物化 `itemTemplate` / `valueTemplate`，按外到内顺序生成 wildcard bindings，并为 collection/map 实例生成稳定 Vue key。
- 将 presenter 发出的 serializable normalized event 匹配到节点的 `EditorCommandBinding`，再调用现有 `SchemaEditorSession.dispatch`。
- 将唯一的 canonical `schemaEditor.Editor` atom 接入现有 component registry 和 canonical renderer，不新增平行 Halfcode renderer/runtime/lowering。
- 正确管理 session subscription、remount、registry replacement 和 unmount cleanup；renderer 只 unsubscribe，不 dispose 可能被 Scope 共享的 session。

**非目标:**

- 不实现任何 Element Plus presenter、组件样式或 kitchen-sink 产品体验。
- 不写 XNL、Flow、VFS、database、signal 或其他宿主 mutation adapter。
- 不直接调用 `ValueHost`，不在 renderer 中应用 concrete Command，不做本地 optimistic value update。
- 不把 session、ValueHost、Vue component、callback 或 registry implementation 写入 `EditorPlan` 或 canonical source。
- 不提供隐式 JSON textarea/raw-code fallback；缺失 presenter 必须可诊断地 fail closed。
- 不修改 mission 状态或实现 Workbench Flow Editor。

## 变更内容（What Changes）

- 在 Vue 包新增 schema-editor capsule 和包根公开类型/API。
- 增加 toolkit-neutral presenter adapter contract、受控 registry factory/composition 和 duplicate/unknown id diagnostics。
- 增加递归 node renderer、accepted snapshot value lookup、nested wildcard materialization 和 renderer-local ephemeral identity reconciliation。
- 增加 normalized event bridge，唯一事件链为：

  `presenter event -> matched Command template + wildcard bindings -> session.dispatch -> ValueHost -> accepted snapshot -> subscription rerender`

- 扩展现有 canonical component resolution 的最小上下文，使 schema-editor shell adapter 能取得当前 app runtime、unit 和 scope；旧 registry 的单参数实现保持可用。
- 增加 subscription/dispose、late result、重复 mount、registry replacement 和 no-leak 测试。
- 更新 Vue package public/dependency boundary tests 与 Schema Editor 文档当前状态。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-schema-editor-vue-renderer`
- 主要代码：`packages/dg-cell-mvi-halfcode-vue/src/`
- 主要测试：`packages/dg-cell-mvi-halfcode-vue/test/`
- 文档：`docs/halfcode/dsl-bundle/spec/frontend/schema-editor/`
- 依赖输入：renderer-complete `EditorPlan`、`SchemaEditorSession`、Scope bridge、canonical `schemaEditor.Editor` shell
- 明确不受影响：Element Plus presenters、Workbench Flow/XNL mutation、VFS/database persistence
