# 变更：新增 halfcode product material DSL 标准

## 背景和动机 (Context And Why)

当前 frontend DSL 描述 Page/Component/Capsule/UI tree，但产品级事实如 product、module、material、extension、artifact ownership 还没有进入权威标准。代码侧 `HalfcodeDocument` 已有 `product`、`modules`、`materials`、`extensions` 草图，但文档层尚未说明这些事实如何以 XNL bundle 组织。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 定义 product material DSL 的 L2 公理：产品物料是 frontend/runtime/CRUD/workflow 的上层事实源。
- 定义 `Product`、`Module`、`Material`、`Extension`、`Artifact` 等节点。
- 明确 product material 与 frontend unit registry、runtime/resource/后续投影 family 的引用关系。
- 为 admin shell、view material、CRUD material、workflow material 提供统一 material registry。

**非目标:**
- 不在本 proposal 阶段决定所有 material 子类型字段。
- 不替代 frontend DSL；frontend 是 view material 的一种投影/实现面。
- 不承载 live runtime state。

## 变更内容（What Changes）

- 候选新增：
  - `docs/halfcode/dsl-bundle/std/product/axioms.md`
  - `docs/halfcode/dsl-bundle/spec/product/{domains,nodes,files,refs}.md`
- 候选域：`product`、`modules`、`materials`、`extensions`、`artifacts`。
- 候选 registry：`materials://<FQN>`、`modules://<FQN>`。

## 影响范围（Impact）

- 依赖：runtime vocabulary 先收敛；投影 vocabulary 后续另行设计。
- 后续影响 CRUD/resource/workflow track 的 material 归属。
- 当前状态：proposal-only 候选 track，执行前需补齐 behavior delta、design、track.xml。
