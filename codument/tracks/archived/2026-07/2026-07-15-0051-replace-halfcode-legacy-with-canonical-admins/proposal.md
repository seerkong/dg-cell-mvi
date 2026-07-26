# 变更：以 canonical admin 替换 Workbench legacy Halfcode

## 背景和动机

上一条 track 已建立 canonical HalfcodeAppRuntime，但 Workbench 生产入口仍只运行 counter；现有 admin/CRUD demo 继续使用旧 TypeScript 对象 Schema 和 legacy renderer。这造成“runtime 已存在”和“产品仍走旧主链”并存，也让 `/legacy` 成为事实上的长期入口。

## 目标

- Workbench Halfcode demo 直接运行 `basic-admin`、`embedded-admin`、`import-admin`、`data-graph-admin` 四套 canonical XNL bundle。
- 补齐 renderer/runtime 的配置 binding、Page/Component composition、route 选择和 graph 响应式刷新，使四套 app 能真实渲染与交互。
- 为四套 app 建立真实 E2E，分别证明 Effect Command、嵌套组合、import/prefab 和 DataGraph projection。
- 删除 legacy schema/store renderer、所有 `/legacy` exports/imports，以及依赖它的旧 fixture、demo、test 和对象 CRUD DSL adapter。
- 建立零残留扫描与跨仓测试/类型/构建门禁。

## 非目标

- 不在 XNL 中实现业务逻辑或 CRUD 流程。
- 不设计 backend/ORM/resource/workflow DSL。
- 不重新设计 flow editor 产生的 artifact；只移除其旧 renderer 消费面。
- 不复制四套 fixture 到 Workbench。
- 不创建 Git commit。

## 影响范围

- `dg-cell-mvi`: halfcode contract/logic/support/vue/web/element-plus、admin fixtures/tests。
- `eidolon-workbench`: canonical Halfcode host、Vite aliases/entry、旧 demos/plugins/tests、生产 build。

## 风险

- legacy 删除会触发广泛编译失败；必须在 canonical admin E2E 成功后再删除。
- nested Page/Component 若直接共享错误 Scope，会破坏 RuntimeObject visibility；composition 必须切换到目标 unit 的 plan/runtime。
- config ref 解析若留在 Vue 将重复 loader 逻辑；应由 app runtime 预解析并提供只读查询。
