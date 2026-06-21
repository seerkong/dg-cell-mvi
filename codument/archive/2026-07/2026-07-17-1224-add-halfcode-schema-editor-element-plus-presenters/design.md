# Design

## 上下文

完成的 Vue renderer 已经拥有递归、wildcard materialization、normalized event bridge、Session subscription 和 canonical shell lifecycle。Element Plus 层必须是可替换的产品展示 capsule，而不是第二套 editor runtime。

```text
EditorPlan + accepted Session projection
                  |
                  v
completed Vue recursive renderer
                  |
       presenter id + default slot
                  |
                  v
Element Plus presenter adapter
                  |
       normalized serializable event
                  |
                  v
existing Vue event bridge -> Session -> ValueHost owner
                  |
           accepted snapshot only
                  +-----------------------> rerender
```

## Capsule 与依赖方向

建议包内形态：

```text
src/
  schema-editor/
    index.ts
    registry.ts
    canonicalComposition.ts
    shared/
    object/
    scalar/
    collection/
    map/
    union/
    reference/
    unsupported/
  canonicalRegistry.ts
  index.ts
```

- 外部只从 `dg-cell-mvi-halfcode-element-plus` 包根使用 API。
- Element Plus 包只依赖 contract/support/Vue 的 package root，不 deep-import。
- `registry.ts` 只组装 Vue capsule 已有的 registry factory/composition，不复制 resolver。
- 每个 presenter component 只接收 `SchemaEditorPresenterProps` 和 default slot。
- 不创建 module-global mutable presenter registry、service locator 或 shared accepted value。

## 默认 Presenter Matrix

| Stable id | Element Plus 体验 | 写事件 |
|-----------|-------------------|--------|
| `object.group` | `ElForm`/分组容器、label/description、default slot | 无 |
| `scalar.text` | `ElInput` | `value.change { value }` |
| `scalar.number` | `ElInputNumber`，尊重 integer/constraints | `value.change { value }` |
| `scalar.boolean` | `ElSwitch` | `value.change { value }` |
| `scalar.null` | 明确的 null 只读状态 | 无隐式类型转换 |
| `scalar.enum` | `ElSelect` + `ElOption` | `value.change { value }` |
| `scalar.const` | 明确的只读控件/标签 | 无 |
| `collection.list` | 列表、递归 slot item、添加/删除/上移/下移 | `item.insert/remove/move` |
| `map.entries` | key + 递归 slot value、添加/删除/重命名 | `entry.set/remove/rename` |
| `union.select` | alternative selector + selected recursive slot | `alternative.select` |
| `schema.ref` | 默认 ref string editor；业务可覆盖为 picker | `value.change { value }` |
| `unsupported` | `ElAlert` 展示 diagnostics | 无编辑、无 raw fallback |

Field-like presenters 使用统一 form-item shell 展示 `metadata.display.label`、description、required marker 和 diagnostics。`visible=false` 时不产生可见 UI；`readOnly=true`、`pending=true` 或 const/null/unsupported 时关闭所有写操作。Error/warning diagnostics 必须在字段附近可见，不能只写 console。

## Common Format Aliases

Compiler 遇到 format 会产生 `scalar.<format>`，默认 registry 至少覆盖：

- text-backed：`scalar.email`、`scalar.password`、`scalar.textarea`、`scalar.multiline`；
- URL/联系：`scalar.url`、`scalar.uri`、`scalar.tel`、`scalar.phone`；
- temporal：`scalar.date`、`scalar.time`、`scalar.datetime`、`scalar.date-time`；
- specialized：`scalar.color`、`scalar.currency`。

Alias 可以复用内部 component factory，但每个 stable id 必须显式出现在 registry snapshot。日期/时间控件发出 contract-serializable string，不把 `Date`、dayjs 或 Element Plus runtime object 发送给 Session。未知 format 不静默退回 JSON textarea；业务通过 later-wins registry 显式补充。

## Presenter Options 与 Safety Precedence

`presenterOptions` 只控制可序列化 UI 细节，例如 placeholder、rows、clearable、step、precision、prefix/suffix、layout、empty text。实现不得把 options 无差别 spread 到组件。

固定优先级：

```text
plan visible/readOnly/required/constraints
> session pending safety
> presenter-owned normalized value/event contract
> allowlisted presenterOptions
```

Options 不得覆盖 model value、disabled/readOnly、event callback、recursive slot、Vue key 或 diagnostics。所有输入只读 own data；runtime-valued、accessor 或 hostile options fail closed 或被忽略并产生可观察诊断。

## Normalized Event Contract

Presenter 发出的 event 必须匹配 compiler 现有 binding：

```ts
{ event: 'value.change', payload: { value } }

{ event: 'item.insert', payload: { index, value } }
{ event: 'item.remove', payload: { index } }
{ event: 'item.move', payload: { fromIndex, toIndex } }

{ event: 'entry.set', payload: { key, value } }
{ event: 'entry.remove', payload: { key } }
{ event: 'entry.rename', payload: { fromKey, toKey } }

{
  event: 'alternative.select',
  payload: { alternativeId, initialValue },
}
```

- `item.insert` 默认使用 accepted list length 和 `metadata.itemDefault`。
- `entry.set` 使用用户输入 key 和 `metadata.valueDefault`；draft key 是组件局部 UI 状态，不是 accepted domain value。
- `alternative.select` 从 `metadata.alternativeDescriptors` 取得 serializable initialValue。
- 任何 payload 都不得包含 DOM Event、component instance、Date、function 或 writer capability。
- Presenter 不修改 `props.value`，也不维护乐观领域副本；事件发出后继续展示旧 accepted value，直到 Session 发布新 snapshot。

## Recursive Slot Ownership

- `object.group` 原样渲染 default slot 的 ordered children。
- `collection.list` 只按 accepted collection 长度包装 default slot VNodes，并用 index 生成 toolbar payload；不读取 itemTemplate，不自行递归。
- `map.entries` 只按 accepted own-entry order 将 key 与对应 slot VNode 配对；不读取 valueTemplate，不自行递归。
- `union.select` 只显示 selector 和 Vue renderer 已选 alternative 的 default slot；不读取 alternatives 重新编译。
- Slot 缺失、数量不匹配或 value shape 非法时 fail closed 并显示 diagnostics，不创建 JSON textarea。

## Registry Composition

公开 API 保持显式三参数 factory/Processor 形态，精确类型可按现有 contract 收紧：

```ts
const base = createElementPlusSchemaEditorPresenterRegistry(
  {},
  {},
  {},
)

const composed = composeElementPlusSchemaEditorPresenterRegistries(
  {
    registries: [
      base.registry,
      sharedBusiness.registry,
      boundedContext.registry,
      editorInstance.registry,
    ],
  },
  {},
  { conflict: 'last-wins' },
)
```

- 组合顺序从通用到具体，后者覆盖前者。
- `registries` 是长生命周期代码依赖，归入 helper runtime；单次 input 为空，静态冲突策略归入 config。Helper 内部按现有 Vue public API 做一次边界适配，不修改 Vue registry contract。
- Factory 每次返回冻结、独立 registry；不得复用 module-global mutable map。
- `last-wins` 必须由调用方显式选择；默认 factory 内部 id 重复仍 reject。
- 业务 presenter 只替换 stable id 的 adapter，不修改 schema/presentation/plan。

## Canonical Registry Composition Helper

Element Plus 包提供一个 bootstrap helper，组合：

1. 现有 Element Plus canonical parent registry；
2. 默认 Element Plus Schema Editor presenter registry；
3. 可选、显式排序的业务 presenter registries；
4. Vue `createSchemaEditorCanonicalRegistry(..., { componentIdentity: 'Editor' })`。

```ts
const result = createElementPlusSchemaEditorCanonicalRegistry(
  {
    parentRegistry: createElementPlusCanonicalRegistry(hostOptions),
    presenterRegistries: [businessRegistry],
  },
  {},
  {
    presenterConflict: 'last-wins',
    componentIdentity: 'Editor',
  },
)
```

`parentRegistry` 和 `presenterRegistries` 均为长生命周期依赖，属于 helper runtime；input 为空；`presenterConflict` 和 `componentIdentity` 是静态 config。Helper 只做组合根布线，返回 canonical registry + presenter registry + diagnostics。它不捕获 ValueHost，不创建 Session，不加载 bundle，不实现 renderer。所有 registry/cache 状态限定在 factory 结果实例中；同一个业务 registry 不污染其他 app/scope。

## Kitchen-Sink Canonical Demo

同一 fixture 同时作为可运行 demo 数据源和 automated canonical integration test，避免 demo/test 漂移。Fixture 至少包含：

- nested object group；
- text/number/boolean/null/enum/const；
- email/password/textarea/url/date/time/datetime/color/currency aliases；
- collection insert/remove/move 与 nested item fields；
- map add/remove/rename 与 nested value fields；
- union alternative select；
- schema ref；
- unsupported diagnostic；
- visible/readOnly/required/description/options；
- pending、reject、conflict/stale 和 accept。

真实运行链：

```text
StructureSchema + EditorPresentation
-> compileEditorPlan
-> lowerEditorPlan memory source bundle
-> resolver
-> loader/compiler/app runtime
-> CanonicalHalfcodeRenderer
-> composed canonical registry
-> schemaEditor.Editor
-> Element Plus presenters
```

测试点击真实控件和 icon buttons，记录 normalized event/host request，并断言：

- pending/reject/conflict/stale 期间 DOM 仍显示旧 accepted value；
- accept 后才显示新值；
- collection/map/union payload 与 binding 完全匹配；
- recursive children 由 Vue slot 提供；
- loader/compiler/runtime diagnostics 为零；
- 无第二条 renderer/runtime/lowering。

## 测试策略

- RED contract tests：冻结 root exports、presenter matrix、format aliases、event payload、registry composition 与 forbidden capabilities。
- Component interaction tests：用真实 Element Plus + jsdom 操作输入、选择、switch、日期、列表、map 和 union。
- Registry tests：实例隔离、duplicate reject、显式 later-wins、业务覆盖、hostile input fail closed。
- Canonical integration：真实 lowering/loader/compiler/runtime/canonical renderer 和 Scope Session。
- Ownership/dependency scan：拒绝 deep import、Flow/XNL/VFS/database、ValueHost/runtime/writer、direct mutation、global mutable registry、JSON textarea fallback。
- Full regressions：Element Plus、Vue、support、logic、contract package tests 和 TypeScript。

## 风险 / 权衡

- **Element Plus 事件带 runtime object**：每个 adapter 显式投影为 contract scalar/record，日期统一为 string。
- **Options 变成任意 props 注入**：只允许白名单映射，安全 metadata 和 event wiring 优先。
- **Presenter 偷做递归**：测试用 slot probes 与 source scan 固化递归 ownership。
- **局部 draft 被误当事实源**：只允许 map key 等短暂 UI draft；accepted value 始终来自 props。
- **业务覆盖污染全局**：所有 registry 都由 factory 创建并显式组合，不导出 mutable default singleton。
- **Kitchen-sink 另起 runtime**：测试必须从 real lowered source lifecycle 起步，禁止专用 shortcut renderer。

## 兼容性设计

- 保留现有 `createElementPlusCanonicalRegistry` 和 `elementPlusCanonicalRegistry` 行为。
- 新 Schema Editor presenter API 只新增包根导出。
- Existing one-argument canonical registry 继续作为 parent 使用。
- 未注册的 custom presenter/format 继续由 Vue registry fail closed；不加入隐式 fallback。

## 待解决问题

- 无规划阻塞项。实现阶段只能在不改变 stable ids、normalized events 和 ownership 的范围内选择具体 Element Plus props。
