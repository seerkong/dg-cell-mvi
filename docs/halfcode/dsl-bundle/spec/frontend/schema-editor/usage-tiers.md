# 三档用法

三档都使用 `dg-cell-mvi-halfcode-logic` package root。Compiler config 只放 serializable compile options；以下示例只使用 `planId`。Dialect、function、resolver、registry、classifier 与 precedence 都不属于 config。

## Tier 1: 零配置 Default Runtime

不传 runtime options 时，factory 创建 `schema-editor.default` dialect。它直接支持 scalar、object、array、map、union、ref 六种结构，生成 typed metadata、wildcard templates、provenance、diagnostics 与 event-time command templates。Recursive presentation 和 root path overlays 会先规范化，再通过 `children`/`item`/`value`/`alternatives` 递归传播。

```ts
import {
  compileEditorPlan,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerInput,
} from 'dg-cell-mvi-halfcode-logic';

const runtime = createSchemaEditorCompilerRuntime();

const input = {
  schema: {
    kind: 'object',
    id: 'profile',
    fields: [
      { key: 'name', schema: { kind: 'scalar', scalar: 'string' } },
      { key: 'tags', schema: { kind: 'array', item: { kind: 'scalar', scalar: 'string' } } },
    ],
  },
} satisfies EditorCompilerInput;

const plan = compileEditorPlan(runtime, input, { planId: 'profile.editor' });
```

适用场景：结构本身足以决定默认 plan，不需要业务 semantic transformer。未知/非法结构产生 diagnostics，不会隐式退化为 raw JSON textarea。

## Tier 2: Default + Shared/Business Dialect

把 default dialect 放在前面，business dialect 放在后面。Business layer 可分类 semantic type 并覆盖对应 transformer；未匹配的结构继续使用 default structural transformer。

```ts
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerDialect,
} from 'dg-cell-mvi-halfcode-logic';

const businessDialect: EditorCompilerDialect = {
  id: 'billing.shared',
  classify: (_runtime, input, _config) => ({
    semanticType: input.schema.annotations?.semanticType,
  }),
  transformers: {
    'semantic:Money': (_runtime, input, _config) => ({
      kind: 'field',
      id: input.schema.id ?? 'money',
      path: input.path ?? [],
      metadata: {
        display: {
          label: input.fieldContext?.label ?? input.schema.label ?? input.schema.id ?? 'Money',
          ...(input.fieldContext?.description !== undefined
            ? { description: input.fieldContext.description }
            : {}),
          visible: typeof input.presentation?.visible === 'boolean' ? input.presentation.visible : true,
          readOnly: typeof input.presentation?.readOnly === 'boolean' ? input.presentation.readOnly : false,
        },
        ...(input.fieldContext !== undefined
          ? { field: { key: input.fieldContext.key, required: input.fieldContext.required } }
          : {}),
        scalar: { kind: 'number' },
      },
      presenter: { id: 'billing.money' },
    }),
  },
};

const runtime = createSchemaEditorCompilerRuntime({
  dialects: [createDefaultSchemaEditorDialect(), businessDialect],
});

const plan = compileEditorPlan(runtime, {
  schema: {
    kind: 'scalar',
    id: 'amount',
    scalar: 'number',
    annotations: { semanticType: 'Money' },
  },
}, { planId: 'invoice.amount.editor' });
```

`classify` 和 transformer 都严格接收 `(runtime, input, config)` 三个参数。自定义 transformer 返回的 node 必须满足 typed metadata contract；它们不解析 Vue component，只返回 renderer-neutral classification 或 `EditorPlanNode`。

## Tier 3: 多层 Scoped Runtime

标准层序是 default、shared、bounded-context、editor-instance。组合按数组顺序执行；同一 transformer key 由 later layer 覆盖，classification 只合并 later layer 中已定义的字段。

```ts
import {
  compileEditorPlan,
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerConfig,
  type EditorCompilerDialect,
  type EditorCompilerRuntime,
  type EditorCompilerInput,
  type EditorPlanNode,
} from 'dg-cell-mvi-halfcode-logic';

const fieldTransformer = (presenterId: string) => (
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): EditorPlanNode => ({
  kind: 'field',
  id: input.schema.id ?? presenterId,
  path: input.path ?? [],
  metadata: {
    display: {
      label: input.fieldContext?.label ?? input.schema.label ?? input.schema.id ?? presenterId,
      visible: typeof input.presentation?.visible === 'boolean' ? input.presentation.visible : true,
      readOnly: typeof input.presentation?.readOnly === 'boolean' ? input.presentation.readOnly : false,
    },
    ...(input.fieldContext !== undefined
      ? { field: { key: input.fieldContext.key, required: input.fieldContext.required } }
      : {}),
    scalar: { kind: 'number' },
  },
  presenter: { id: presenterId },
});

const shared: EditorCompilerDialect = {
  id: 'shared',
  classify: (_runtime, input, _config) => ({
    semanticType: input.schema.annotations?.semanticType,
  }),
  transformers: { 'semantic:Money': fieldTransformer('money.shared') },
};

const boundedContext: EditorCompilerDialect = {
  id: 'billing',
  classify: (_runtime, _input, _config) => ({ format: 'currency' }),
  transformers: { 'semantic:Money': fieldTransformer('money.billing') },
};

const editorInstance: EditorCompilerDialect = {
  id: 'invoice-editor',
  classify: (_runtime, _input, _config) => ({ format: undefined }),
  transformers: { 'semantic:Money': fieldTransformer('money.compact') },
};

const runtime = createSchemaEditorCompilerRuntime({
  dialects: [
    createDefaultSchemaEditorDialect(),
    shared,
    boundedContext,
    editorInstance,
  ],
});

const plan = compileEditorPlan(runtime, {
  schema: {
    kind: 'scalar',
    id: 'amount',
    scalar: 'number',
    annotations: { semanticType: 'Money' },
  },
}, { planId: 'invoice.amount.compact' });
```

上例最终使用 `money.compact`，而 `format: undefined` 不会擦除 bounded-context 的 `currency`。Composition 不修改输入 dialect。不同 factory 调用得到相互隔离的 runtime；同一 semantic type 可以在两个 runtime 中绑定不同 transformer，不存在全局 registry 泄漏。

### Business A/B + Instance Override 示例

当前 owner demo 把 Tier 3 落成了完整的三层 halfcode 代码装配：

```ts
import {
  createDefaultSchemaEditorDialect,
  createSchemaEditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';

import {
  createBusinessADialect,
  createBusinessAOverrideDialect,
  createBusinessBDialect,
} from '../../../packages/dg-cell-mvi-halfcode-element-plus/demo/schema-editor-business-dialect/boundedContext';
import {
  createSharedBusinessPropertyDialect,
} from '../../../packages/dg-cell-mvi-halfcode-element-plus/demo/schema-editor-business-dialect/sharedCapsule';

const businessARuntime = createSchemaEditorCompilerRuntime({
  dialects: [
    createDefaultSchemaEditorDialect(),
    createSharedBusinessPropertyDialect({}, {}, {}),
    createBusinessADialect({}, {}, {}),
  ],
});

const businessAOverrideRuntime = createSchemaEditorCompilerRuntime({
  dialects: [
    createDefaultSchemaEditorDialect(),
    createSharedBusinessPropertyDialect({}, {}, {}),
    createBusinessADialect({}, {}, {}),
    createBusinessAOverrideDialect({}, {}, {}),
  ],
});

const businessBRuntime = createSchemaEditorCompilerRuntime({
  dialects: [
    createDefaultSchemaEditorDialect(),
    createSharedBusinessPropertyDialect({}, {}, {}),
    createBusinessBDialect({}, {}, {}),
  ],
});
```

这里的三个 layer 各司其职：

1. shared property capsule：沉淀 phone/address/entity-ref/enum 等可跨业务复用能力。
2. bounded-context layer：决定同一 `user.phone` schema 在业务 A、业务 B
   中该落到哪个 stable presenter id。
3. editor-instance override：只在一个 editor 上 later-wins，不改变 sibling
   runtime、registry、Session 或 accepted snapshot。

对应的 `EditorPresentation` 仍然是纯数据。它只引用 stable presenter id 和
serializable options，不把组件实现或 Scope 绑定写回 presentation。

同一 `BUSINESS_DIALECT_SHARED_SCHEMA` 因此能得到三种真实结果：

- `businessA`: `business.a.user.phone`
- `businessB`: `business.b.user.phone`
- `businessAOverride`: `business.a.user.phone.instance`

三者共享同一个 schema 与 shared capability，但 runtime / registry / Session /
host harness 都是隔离实例。

## Renderer 装配也分三档

Compiler 三档决定怎样从 schema 得到 `EditorPlan`；renderer 装配独立选择：

1. Direct processor：调用 `renderSchemaEditorNode(runtime, input, config)`，由已有宿主提供 snapshot、presenter registry 和 renderer-local identity projection。适合已有表单/session lifecycle 的内部工具。
2. Session shell：使用 `SchemaEditorSessionRenderer` 订阅现有 `SchemaEditorSession`。它负责递归渲染、wildcard dynamic templates、normalized event dispatch 和 unsubscribe，不负责 session disposal。
3. Canonical Scope shell：用 `lowerEditorPlan` 生成唯一 `schemaEditor.Editor`，再用 `createSchemaEditorCanonicalRegistry` 组合 presenter registry 和现有 canonical component registry。Shell 根据 canonical context 定位 Scope session，适合 Halfcode App Bundle。

三个层级使用同一 `EditorPlan`、`SchemaEditorPresenterRegistry` 和 accepted-state 规则，不是三套 renderer。Direct/session 层也不允许 presenter 获得 ValueHost 或 host writer。

business dialect demo 对应的是 Tier 3 renderer 装配：它从 compile 之后继续走
`lowerEditorPlan -> resolver -> loadHalfcodeAppRuntime -> CanonicalHalfcodeRenderer`
，最后在 `schemaEditor.Editor` 中解析当前 Scope 的 session / value host bridge。
这说明 scoped business layer 并不是 plan-only 证明，而是真实 canonical runtime proof。

## 当前边界

以上 compiler 与 renderer 三档均已实现，并通过真实 canonical lifecycle 验证。Element Plus 默认 presenter capsule 也已实现：它提供 26 个稳定 id/alias、显式业务 registry composition 和 canonical bootstrap，但不改变三档 renderer 的 ownership；详见 [Element Plus presenters](element-plus.md)。

Workbench Flow Editor 现在正是 Tier 3 的真实 consumer：它在业务 capsule 中拥有
flow/node target projection、dialect/presenter composition、raw-only override
和 ValueHost 翻译，但继续复用同一套 compiler、Session、lowering、canonical
renderer 与 accepted-only 规则。
