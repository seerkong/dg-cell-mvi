# 变更：新增 Halfcode Schema Editor Element Plus Presenters

## 背景和动机 (Context And Why)

Schema Editor 已完成 renderer-neutral contracts、递归 compiler、canonical lowering、Scope-owned Session/ValueHost 以及 toolkit-neutral Vue renderer。当前缺口是产品可用的默认 UI：`dg-cell-mvi-halfcode-element-plus` 还不能把 compiler 产生的 presenter ids 渲染成完整、可发现、可交互的配置编辑器。

本 track 在 Element Plus capsule 中提供默认 presenter adapters、显式 registry composition 和 canonical composition helper。Presenter 只负责显示 accepted projection，并把 Element Plus 原生交互规范化为既有 Schema Editor event；真实修改继续由 Vue event bridge、Session 和宿主 ValueHost 单一写入链处理。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 覆盖 `object.group`、全部默认 scalar ids、常见 format aliases、`collection.list`、`map.entries`、`union.select`、`schema.ref` 和 `unsupported`。
- 使用熟悉的 Element Plus form/input/select/switch/number/date/list/alert 控件以及图标按钮，提供可发现的新增、删除、移动、重命名和选择操作。
- 将控件事件规范化为 compiler 已有的 `value.change`、`item.*`、`entry.*` 和 `alternative.select` payload。
- 正确落实 `visible`、`readOnly`、`required`、`label`、`description`、presenter options、`pending` 和 diagnostics。
- 显式创建并组合无全局状态的默认 registry，支持业务 registry later-wins。
- 提供 canonical registry composition helper，复用唯一 Vue schema editor shell 和现有 Element Plus canonical registry。
- 提供同一事实源的 kitchen-sink canonical bundle/demo/test，证明 rejected/pending 不推进 UI，只有 accepted snapshot 推进。

**非目标:**

- 不修改或复制 Schema Editor compiler、Session、recursive renderer、event bridge、canonical renderer 或 lowering。
- 不让 presenter 持有 runtime、Session、ValueHost、writer、XNL mutation、VFS、database 或 host persistence。
- 不直接修改传入 value，不在 presenter 中应用 concrete Command，不做 optimistic accepted state。
- 不把 Vue/Element Plus component、callback、registry 或其他代码实现写入 StructureSchema、EditorPresentation、EditorPlan 或 XNL source。
- 不引入 Flow 专用 schema/presentation、Flow mutation 或 Workbench 迁移。
- 不提供 JSON textarea、raw JSON 或 code editor fallback。
- 不修改 mission、不提交 commit。

## 变更内容（What Changes）

- 在 `dg-cell-mvi-halfcode-element-plus` 新增独立 schema-editor capsule，并仅从包根导出稳定 factory/types。
- 实现默认 presenter component/adapters 和 common format alias registry entries。
- 为 collection/map/union 提供完整、可发现的 normalized event 操作；递归 child 只消费 Vue renderer 的 default slot。
- 提供默认 registry factory、业务 later-wins composition helper，以及 canonical registry composition helper。
- 增加 component interaction、registry isolation、ownership/dependency 和真实 canonical lifecycle 测试。
- 增加 kitchen-sink canonical demo fixture，覆盖 nested object/collection/map/union/ref、所有 scalar families、pending/reject/accept。
- 更新 Schema Editor 文档，说明 Element Plus 默认层、业务覆盖和 canonical bootstrap。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`halfcode-schema-editor-element-plus-presenters`
- 主要代码：`packages/dg-cell-mvi-halfcode-element-plus/src/`
- 主要测试：`packages/dg-cell-mvi-halfcode-element-plus/test/`
- Demo/fixture：`packages/dg-cell-mvi-halfcode-element-plus/demo/` 或同包可运行 fixture
- 文档：`docs/halfcode/dsl-bundle/spec/frontend/schema-editor/`
- 依赖输入：公开的 contract、support 和 Vue package root APIs；Element Plus/Vue peer APIs
- 明确不受影响：Workbench Flow editor、Flow/XNL/VFS/database mutation、compiler/session/renderer/lowering ownership

