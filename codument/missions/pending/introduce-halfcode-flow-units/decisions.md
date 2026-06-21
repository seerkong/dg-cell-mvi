# Mission Decisions

## 已收敛决策

### D1：Flow 是 bundle 一等单元

- 状态：decided
- 结论：新增 `ctrl-flow`、`data-flow` Unit kind；`<CtrlFlow>`、`<DataFlow>` 根 tag 是目标 kind 的事实源。
- 理由：Flow 需要与 page/component 一样被注册、寻址、复用和跨应用传递，而不是 Workbench 私有文件。

### D2：Bundle 根泛化为 AppBundle

- 状态：decided
- 结论：canonical 根使用 `<AppBundle>`；第一阶段迁移现有 `<FrontendApp>` fixtures/docs/tests，不维护双 canonical 方言。
- 理由：bundle 将包含非前端渲染单元，`FrontendApp` 已不能准确表达其所有权边界。

### D3：复杂场景必须与 Welcome 一起保留

- 状态：decided
- 结论：showcase 至少包含 Welcome CtrlFlow、Welcome DataFlow、原复杂 CtrlFlow、复杂 DataFlow main、复杂 DataFlow subflow 五个 unit。
- 理由：Welcome 验证最小 DX，复杂样例验证真实拓扑、分支、端口、等待关系与跨 flow ref。

### D4：动态逻辑只引用代码

- 状态：decided
- 结论：XNL 不保存 inline `ExprCode`/`StatementCode`，不使用 `clazz + methodName`；节点只保存 `vfs://...#export` 或 typed logic ref。未来代码签名遵循 `output = fn(runtime, input, config)`。
- 理由：符合 Halfcode 的类型/实现分离与强类型代码占比方向。

### D5：Flow Editor 是 projection client，flow.authoring 是独立事实域

- 状态：decided
- 结论：core flow XNL 是语义真源；持久化位置/viewport 等进入可选但独立、单写入者的 `flow.authoring` XNL 领域；selection/form draft 是 runtime state。editor view model 才是 semantic + layout data 的只读 projection。`flow.authoring` 不占用 XNL metadata slot。禁止 JSON sidecar 和重复 `formModel` 语义真源。
- 理由：布局不是可由 topology 无损重建的衍生事实，应独立定 owner；组合视图仍满足单一写入者与衍生不反写。

### D6：首个 track 不实现执行 runtime

- 状态：decided
- 结论：首个 track 的终点是 load/validate/compile authoring plan/edit/persist；module import、node execution、scheduler 和 subflow invocation 均由后续 tracks 负责。
- 理由：先通过真实样例和编辑器验证 DSL，再冻结复杂 runtime ABI。

### D7：DataFlow 与 DataGraph 正交

- 状态：decided
- 结论：DataFlow 使用独立 contract、plan、registry 和未来 executor；不得复用 `data.graph://` 作为 flow identity。
- 理由：前者是一次执行的数据血缘 Processor，后者是响应式数据/事实图。
