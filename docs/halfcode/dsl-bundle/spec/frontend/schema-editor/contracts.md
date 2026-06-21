# Schema Editor Contracts

## StructureSchema

`StructureSchema<TValue>` 是纯结构数据。`TValue` 只在 TypeScript 类型层表达宿主值形状，不写入 JSON，不提供 runtime token。

支持的结构：

| kind | contract |
|---|---|
| `scalar` | `string`、`number`、`integer`、`boolean`、`null`，可带 `enum`、`const` 与类型一致的 `default`。 |
| `object` | `fields` 递归定义字段，`required` 明确必填项，`additionalProperties` 明确开放或递归 schema。 |
| `array` | `item` 是递归 schema；`itemDefault` 是未来插入项的纯数据默认值；`identity` 是 property path + `ephemeral` fallback 或显式 `ephemeral`。 |
| `map` | `key` 是 string scalar schema，`value` 是递归 schema，`valueDefault` 是未来 entry value 的纯数据默认值。 |
| `union` | `alternatives` 是有序稳定 id 闭集，可声明 discriminator；每个 alternative 可带 label/description/`initialValue`。 |
| `ref` | `ref` 是稳定、opaque 的 schema identity；contract/compiler 不解析或递归展开它。 |

所有 schema kind 都可声明 serializable `default`。Validator 对 scalar 的类型、enum/const 一致性，对 array/object/map 的外形，以及 `itemDefault`/`valueDefault`/alternative `initialValue` 在可机械判断处做校验。默认值是 Data，不是 factory；compiler 不执行它。当前 plan 传播 scalar `default`、array `itemDefault`、map `valueDefault` 与 union alternative `initialValue`，不把当前 value snapshot 展开进 plan。

业务含义放在 `annotations.semanticType`、`annotations.format`、`annotations.tags` 或 serializable metadata 中。semantic 不选择组件实现；它只给后续 dialect classification 和 presenter selection 提供可解释输入。

## EditorPresentation

`EditorPresentation` 是可选的纯数据 overlay。它只能包含稳定 presenter id、serializable options、排序、分组、显示/只读策略，以及递归的 `children`、`item`、`value`、`alternatives` 或 path-targeted `overlays` contract 数据。

Compiler 同时消费递归 `children`/`item`/`value`/`alternatives` 与 root `overlays` path 列表，并在 classification、transformer selection 和递归前把它们规范化成同一种递归 overlay。Array/map template path 使用 `*`；path entry 中的 `*` 也可匹配具体 string/number segment。

同一路径的 precedence 固定为：recursive base -> 匹配的 path entries（按声明顺序），后声明项 later-wins。未声明字段保留；`children`/`item`/`value`/`alternatives` 和独立 `options` record 递归深合并；`presenter` 是一个完整 reference，后声明 presenter 整体替换先前 presenter，包括其 presenter-local options。Normalization 克隆输入，不修改 caller presentation，也不向 config 暴露 resolver 或 precedence 开关。

禁止写入：

- function、closure、class、component constructor；
- runtime instance、dispatch/apply callback；
- renderer import、DOM object、persistence client。

`SchemaEditorContractRecord` 还在类型和 runtime validation 两层关闭 ownership 字段。`apply`、`callback`、`component`、`factory`、`runtime`、`writer`、`hostEffect`、`hostWriter`、`valueHost`、persistence/VFS/XNL writer 等精确字段名会被拒绝；普通业务字段 `host` 合法。Contract data 必须是 plain、finite、JSON-serializable data。

Presenter id 是符号名，例如 `collection.table` 或 `business.condition-builder`。具体 presenter 注册和组件实现只存在于代码侧；当前 toolkit-neutral Vue registry 与 Element Plus 默认 capsule 均从各自 package root 组装，不进入 contract/compiler/lowering data。

## SchemaEditorDialect

`SchemaEditorDialect` 是代码侧 contract，不是 JSON 数据。它只有 `id`、`classify`、`transformers`、`config`、`metadata` 这一路词汇。

所有 processor 都遵守：

```ts
output = fn(runtime, input, config)
```

递归由 `runtime.compile(childInput, childConfig?)` 请求。transformer 不接收第四个 `compileChild`、`apply`、`writer` 或 host callback。

固定 resolution precedence 由 base compiler 拥有：

```text
presentation presenter
> scoped business semantic binding
> schema format binding
> structural kind binding
> unsupported diagnostic
```

Dialect 不重复声明 resolver、registry、classifier alias 或 caller-supplied precedence。Function-bearing dialect 由 compiler runtime 持有，不进入 compile config。

## Compiler Public API

`dg-cell-mvi-halfcode-logic` package root 导出：

```ts
import {
  compileEditorPlan,
  composeSchemaEditorDialects,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type CreateEditorCompilerRuntimeOptions,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerFieldContext,
  type EditorCompilerInput,
  type EditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
```

顶层编译调用固定为：

```ts
const plan = compileEditorPlan(
  runtime,
  { schema, presentation },
  { planId: 'profile.editor' },
);
```

`EditorCompilerConfig` 只能是 plain serializable options。当前 compiler 读取 `planId`；不得放入 dialect、function、resolver、registry、classifier 或 precedence。Dialect 通过 `createSchemaEditorCompilerRuntime({ dialects })` 组装并由 runtime 持有。

`runtime.compile(input, config?)` 返回 child `EditorPlanNode`，是 object/array/map/union transformer 的递归消息。`classify` 与所有 transformer 都严格保持 `(runtime, input, config)` 三参数。

`EditorCompilerInput.fieldContext` 与 `identityScope` 是 compiler-owned、可序列化的 inherited Data，不是 callback。自定义递归 transformer 必须像 default transformer 一样把字段的 `key`/`required`/label/description/annotations 放入 `fieldContext`，并传播或有意扩展 `identityScope`。前者让 child metadata 和 classification 保留字段事实；后者只参与匿名 plan node id，不改变 `ValuePath`，尤其用于同一路径下 union alternatives 的唯一身份。

## Fixed Selection And Default Dialect

Compiler 固定按以下 selector 选择 transformer：

```text
presenter:<id>
> semantic:<semanticType>
> format:<format>
> structural:<kind>
> unsupported
```

Presenter candidate 来自 presentation 的显式 presenter 或 classification 的 `presenterId`。若显式 presenter 没有专用 `presenter:<id>` transformer，并最终选择 default structural transformer，该 structural transformer 会把显式 presenter/options 保留在输出节点中。

Default dialect 覆盖六种结构：

| schema kind | default plan |
|---|---|
| `scalar` | `field`；const -> `scalar.const`、enum -> `scalar.enum`，否则按 format/scalar 选择 presenter；含 `value.set` template。 |
| `object` | `group`，按字段顺序递归调用 `runtime.compile`。 |
| `array` | `collection`，含 `itemTemplate` wildcard 与 insert/remove/move templates。 |
| `map` | `map`，含 `valueTemplate` wildcard 与 set/remove/rename-key templates。 |
| `union` | `union`，递归 alternatives 与 select template。 |
| `ref` | `field`，在 typed metadata 中保留 opaque ref identity，不做 IO resolution。 |

Compiler 会先把 recursive/path overlays 规范化，再递归传播 `children`、`item`、`value`、`alternatives` 和 `*` wildcard。每个 plan node 记录 schema/path/dialect/selector 等 provenance；classification 与 transformer diagnostics 汇总到 node 和 plan。

Unknown schema、显式 `unsupported: true`、非法 classification 或非法 transformer output 都进入稳定 diagnostics。Compiler 不会退回 raw JSON/code presenter。

## Scoped Composition

`composeSchemaEditorDialects` 与 runtime factory 按调用方给出的层顺序组合 dialect。标准层序是 default、shared、bounded-context、editor-instance：

- 同一 transformer key later wins；
- classification 只用 later layer 中已定义的字段覆盖，`undefined` 不擦除前值；
- classification diagnostics 保持层顺序；
- 输入 dialect 不被修改；
- 每个 runtime 持有自己的 composed dialect，不共享全局 registry，彼此隔离。

## EditorPlan

`EditorPlan` 是 renderer-neutral IR。节点种类闭集为 `group`、`field`、`collection`、`map`、`union`、`custom`。

每个节点都必须带 kind-specific `metadata`。Validator 对每种 node kind 使用 closed key set；metadata 不是任意 record escape hatch：

| facts | contract/compiler output |
|---|---|
| `display` | 所有节点必有 `label`、`visible`、`readOnly`，可带 description/group。 |
| `field` | 由 parent object 的 inherited `fieldContext` 产生；包括嵌套 object 编译出的 `group` 在内，字段节点可带 `key`、`required`。 |
| `scalar` / `ref` | `field` 必须且只能有其中一个；scalar 含 kind/enum/const/default，ref 是 stable opaque identity。 |
| collection | `itemDefault` + 必需 `identity`；未声明 identity 时 compiler 输出 `{ strategy: 'ephemeral' }`。 |
| map | 必需 string `key` facts（可含 key constraints）+ 可选 `valueDefault`。 |
| union | 可选 discriminator + 与 alternatives 精确对应的有序 `alternativeDescriptors`。 |
| custom | 可选 closed serializable `config`，仍需 display facts。 |

节点还可带：

- stable `id` 和 `ValuePath`；
- stable presenter id/options；
- value、validation、event-time command template bindings；
- diagnostics；
- schema/presentation/semantic provenance。

Collection 和 map 使用 `itemTemplate` / `valueTemplate` 表达未来插入项，不从当前 value snapshot 展开成一次性 UI。

## Command Templates And Accepted Commands

`EditorPlan.commandBindings` 描述 renderer 事件如何形成编辑请求。它只包含事件名和 `SchemaEditorCommandTemplate`，不会在事件发生前伪造 index、key、value 等具体参数：

```ts
{
  event: 'item.move',
  commandTemplate: {
    kind: 'collection.move',
    target: { source: 'literal', value: ['branches'] },
    arguments: {
      from: { source: 'event', path: ['fromIndex'] },
      to: { source: 'event', path: ['toIndex'] }
    }
  }
}
```

`target` 和各命令参数只允许三种中立来源：

- `event`：从 renderer 发出的 serializable event payload 读取；
- `value`：从当前 editor value snapshot 读取；
- `literal`：使用 plan 内的 serializable 常量。

模板按 command kind 使用强类型参数闭集，不允许任意 arguments、callback、renderer event object、host writer 或 persistence effect。

`SchemaEditorCommand` 是 host-owned mutation request，不是执行器。闭集命令：

```text
value.set
collection.insert
collection.remove
collection.move
map.set
map.remove
map.rename-key
union.select
```

事件发生后，后续 runtime/host adapter 从 template 与 event/value/literal 数据形成 concrete `SchemaEditorCommand`，再交给 host 接受或拒绝。Concrete command 只包含 target path 与 serializable payload。XNL mutation、VFS/database persistence、signal update、accepted snapshot 与 validation feedback 都由 host 拥有。
