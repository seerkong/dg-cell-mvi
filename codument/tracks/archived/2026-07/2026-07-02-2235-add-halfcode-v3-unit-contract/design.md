# 方案设计：halfcode v3 分层单元契约

权威规范：mission `redesign-halfcode-hierarchical-unit-dsl` 的 `analysis/v3-unit-dsl-spec-draft.md` + `decisions.md`（D1-D16）。本文只写 contract 层落地形态。

## 类型分区（src/unit/）

```text
src/unit/
  common.ts       # UnitFqn（品牌 string）、UnitKind（'page'|'component'）、HALFCODE_V3_API_VERSION
  refs.ts         # HalfcodeRef 品牌类型、ParsedHalfcodeRef{scheme,path?,id?,subPath?}、
                  # HALFCODE_SCHEME_TABLE（domain↔scheme↔单文件区段三列对照）、内建 scheme 常量
  unit.ts         # HalfcodeAppSpec、HalfcodePageManifest、HalfcodeComponentManifest、
                  # UnitBundleRef{kind,path}（file/folder 双形态）、UnitDomainRegistration
  element.ts      # v3 元素实例节点：UnitInstanceElement（FQN tag）、CapsuleElement(v3)、SlotSpec、
                  # v3 tree 容器（children 数组段语义、slots 区段语义）、内联字面量 props 约束类型
  routes.ts       # RouteSpec（#id/path/pageRef/title覆盖/menu/permissionRef/children）、WireSpec
  contracts.ts    # PageContractSpec{urlInputs,accepts,emits}、ComponentContractSpec{props,slots,accepts,emits,exposes}、
                  # ElementContractSpec(v3){accepts,emits,requires}、RequiresSpec{state,intents,config}
  diagnostics.ts  # v3 diagnostic codes 常量
  validation.ts   # validateHalfcodeUnitContract 等纯校验（红线：无函数/构造器；Page 无 props；contract 无 input/output）
  index.ts        # 分区聚合导出
```

关键设计点：

- **v3 与 v2 隔离**：v3 全部在 `src/unit/` 分区，不 import v2 的 element.ts/material.ts；共享的只有 common 的可序列化基础类型（SerializableValue 等，从既有 common.ts 复用）。
- **UnitFqn**：品牌 string（`dg.materials.CrudTable`），提供 `parseUnitFqn`（namespace segments + name）纯函数；FQN 唯一性由 loader 建表时校验，contract 只给 diagnostics code。
- **HalfcodeRef**：品牌 string + `parseHalfcodeRef` 纯函数（`<scheme>://<path>`、`<scheme>://#<id>`、`<scheme>://#<id>/<sub>`、`vfs://...` 直通）；不做 IO。
- **HALFCODE_SCHEME_TABLE**：单一常量表固化 domain↔scheme↔单文件区段标签（D7/D10 的三列对照表），loader/compiler/codec 都从这张表读，不各自维护。
- **Requires.state**：字段路径裸字符串数组（决策 A5/D20：不新增 state:// scheme）。
- **红线校验**（纯函数，无 IO）：canonical 禁函数/构造器/direct fetch（沿 v2 validation 模式）；PageContract 出现 props → error；ElementContract 出现 input/output → error（沿 v2）。

## 测试

- `test/unit-contract-boundary.test.ts`：红线用例（Page props、contract input/output、函数值拒绝）。
- `test/unit-refs.test.ts`：parseHalfcodeRef/parseUnitFqn 语法用例（含非法形态）；HALFCODE_SCHEME_TABLE 完整性（app/page/component 归属、def 伴生 scheme 成对）。
- 既有 v2 测试零修改。

## 决策摘要

- v3 不复用 v2 `ElementTreeSpec`（其 PageElement 带 route/mount，与 D3 冲突）；v3 元素类型独立，v2 由 G4 隔离进 legacy。
- contract 不定义 loader 返回结构（G3 归属）；只定义 manifest/unit/ref/contract/diagnostics 的数据形态。

## 风险 / 兼容

- 风险：v3 类型过早细化 loader 细节。缓解：凡属加载/解析行为的只给类型和 diagnostics code，不给实现约束。
- 兼容：纯新增分区；v2 导出面不变。
