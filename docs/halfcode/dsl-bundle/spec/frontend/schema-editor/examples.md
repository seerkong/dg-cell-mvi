# Schema Editor Examples

本文件聚焦已实现的 contract、compiler 和 toolkit-neutral Vue renderer。Runtime command/session/Scope/lowering 的完整说明见 [runtime](runtime.md)；Element Plus 26 项默认 matrix、normalized payload、业务覆盖、canonical bootstrap 和 kitchen-sink 见 [Element Plus presenters](element-plus.md)。Workbench Flow consumer 现已在 G4 migration 中落地，但它的 Flow schema/presentation/dialect 与 XNL mutation adapter 仍属于下游 consumer owner，而不是本目录里的 reusable base。

## Recursive Array / Map / Union Schema

```ts
import {
  validateStructureSchema,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-logic';

type RuleValue =
  | { kind: 'literal'; value: boolean }
  | { kind: 'group'; branches: BranchValue[] };

type BranchValue = {
  label: string;
  when: RuleValue;
  metadata: Record<string, string>;
};

export const branchSchema = {
  kind: 'object',
  id: 'demo.branch',
  required: ['label', 'when'],
  annotations: {
    semanticType: 'business.branch',
    tags: ['collection-authoring'],
  },
  fields: [
    {
      key: 'label',
      label: 'Branch label',
      description: 'Shown in the branch header',
      schema: {
        kind: 'scalar',
        scalar: 'string',
        default: '',
        constraints: { minLength: 1 },
      },
    },
    {
      key: 'when',
      schema: {
        kind: 'union',
        discriminator: 'kind',
        alternatives: [
          {
            id: 'literal',
            label: 'Literal',
            initialValue: { kind: 'literal', value: true },
            schema: {
              kind: 'object',
              fields: [
                { key: 'kind', schema: { kind: 'scalar', scalar: 'string', const: 'literal' } },
                { key: 'value', schema: { kind: 'scalar', scalar: 'boolean' } },
              ],
            },
          },
          {
            id: 'group',
            label: 'Group',
            initialValue: { kind: 'group', branches: [] },
            schema: {
              kind: 'object',
              fields: [
                { key: 'kind', schema: { kind: 'scalar', scalar: 'string', const: 'group' } },
                {
                  key: 'branches',
                  schema: {
                    kind: 'array',
                    itemDefault: {
                      label: '',
                      when: { kind: 'literal', value: true },
                      metadata: {},
                    },
                    identity: { strategy: 'property', path: ['label'], fallback: 'ephemeral' },
                    item: { kind: 'ref', ref: 'schema://demo.branch' },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      key: 'metadata',
      schema: {
        kind: 'map',
        key: {
          kind: 'scalar',
          scalar: 'string',
          constraints: { pattern: '^[a-z][a-z0-9-]*$' },
        },
        value: { kind: 'scalar', scalar: 'string' },
        valueDefault: '',
      },
    },
  ],
} satisfies StructureSchema<BranchValue>;

const schemaValidation = validateStructureSchema(branchSchema);
if (!schemaValidation.ok) throw new Error(JSON.stringify(schemaValidation.issues));
```

Default runtime 不需要 dialect options，compiler 会递归生成六类 plan node、wildcard templates、provenance 与 diagnostics：

```ts
import {
  compileEditorPlan,
  createSchemaEditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';

const defaultRuntime = createSchemaEditorCompilerRuntime();
const branchPlan = compileEditorPlan(
  defaultRuntime,
  { schema: branchSchema },
  { planId: 'demo.branch.editor' },
);

// The compiler validates the plan before returning it. The renderer-neutral
// output contains display/field/scalar/collection/map/union/ref facts.
if (branchPlan.root.kind !== 'group') throw new Error('Expected a group plan.');
const labelPlan = branchPlan.root.children[0];
if (labelPlan?.kind !== 'field' || labelPlan.presenter?.id !== 'scalar.text') {
  throw new Error('Expected the default scalar field presenter.');
}
```

## Business Semantic Classification

```ts
import type {
  EditorCompilerDialect,
  EditorCompilerConfig,
  EditorCompilerInput,
  EditorCompilerRuntime,
  EditorPlanNode,
} from 'dg-cell-mvi-halfcode-logic';

export const semanticDialect: EditorCompilerDialect = {
  id: 'demo.semantic-editor',
  classify: (_runtime, input, _config) => ({
    semanticType: input.schema.annotations?.semanticType,
    format: input.schema.annotations?.format,
    structuralKind: input.schema.kind,
  }),
  transformers: {
    'semantic:business.branch': (
      runtime: EditorCompilerRuntime,
      input: EditorCompilerInput,
      config: EditorCompilerConfig,
    ): EditorPlanNode => {
      if (input.schema.kind !== 'object') {
        return {
          kind: 'custom',
          id: input.schema.id ?? 'unsupported-business-branch',
          path: input.path ?? [],
          metadata: {
            display: {
              label: input.schema.label ?? input.schema.id ?? 'Unsupported business branch',
              visible: true,
              readOnly: false,
            },
            config: { expectedKind: 'object' },
          },
          presenter: { id: 'unsupported' },
          diagnostics: [{
            severity: 'error',
            code: 'UNSUPPORTED_BUSINESS_BRANCH_SCHEMA',
            message: 'business.branch requires an object schema.',
            path: input.path ?? [],
          }],
        };
      }
      const path = input.path ?? [];
      return {
        kind: 'group',
        id: input.schema.id ?? 'business-branch',
        path,
        metadata: {
          display: {
            label: input.schema.label ?? input.schema.id ?? 'Business branch',
            ...(input.schema.description !== undefined
              ? { description: input.schema.description }
              : {}),
            visible: typeof input.presentation?.visible === 'boolean'
              ? input.presentation.visible
              : true,
            readOnly: typeof input.presentation?.readOnly === 'boolean'
              ? input.presentation.readOnly
              : false,
          },
          ...(input.schema.constraints !== undefined
            ? { constraints: input.schema.constraints }
            : {}),
        },
        presenter: { id: 'business.branch-builder' },
        children: input.schema.fields.map((field) => runtime.compile({
          schema: field.schema,
          presentation:
            input.presentation?.children?.[field.key]
            ?? input.presentation?.children?.['*'],
          path: [...path, field.key],
          fieldContext: {
            key: field.key,
            required: input.schema.required?.includes(field.key) ?? false,
            ...(field.label !== undefined ? { label: field.label } : {}),
            ...(field.description !== undefined ? { description: field.description } : {}),
            ...(field.annotations !== undefined ? { annotations: field.annotations } : {}),
          },
          ...(input.identityScope !== undefined
            ? { identityScope: input.identityScope }
            : {}),
        }, config)),
      };
    },
  },
};
```

`classify` 不解析 component。当前 compiler 固定应用：

```text
presenter > semantic > format > structural > unsupported
```

自定义递归仍只通过 `runtime.compile`。`fieldContext` 传递字段 key/required/display/classification facts，`identityScope` 传递匿名 node id scope；二者都是 inherited serializable Data。`identityScope` 不进入 `ValuePath`，也不是 resolver。

## Presentation Overlay

```ts
import {
  validateEditorPresentation,
  type EditorPresentation,
} from 'dg-cell-mvi-halfcode-logic';

export const branchPresentation = {
  kind: 'presentation',
  id: 'demo.branch.presentation',
  schemaId: 'demo.branch',
  presenter: { id: 'form.section', options: { density: 'compact' } },
  children: {
    label: {
      presenter: { id: 'text.input', options: { placeholder: 'Label' } },
      options: { density: 'compact', validation: { when: 'blur' } },
      visible: true,
    },
    when: {
      presenter: { id: 'union.segmented' },
      alternatives: {
        literal: { presenter: { id: 'boolean.switch' } },
        group: { presenter: { id: 'business.branch-builder' } },
      },
    },
    metadata: {
      presenter: { id: 'key-value.map' },
      value: { presenter: { id: 'text.input' } },
    },
  },
  overlays: [
    {
      path: ['label'],
      overlay: {
        readOnly: true,
        options: { validation: { required: true } },
        presenter: { id: 'text.input.first', options: { placeholder: 'Branch name' } },
      },
    },
    {
      path: ['label'],
      overlay: {
        visible: false,
        options: { tone: 'quiet', validation: { when: 'change' } },
        presenter: { id: 'text.input.compact' },
      },
    },
  ],
} satisfies EditorPresentation;

const presentationValidation = validateEditorPresentation(branchPresentation);
if (!presentationValidation.ok) {
  throw new Error(JSON.stringify(presentationValidation.issues));
}
```

Compiler 会消费上例的递归树、`*` wildcard 和 path overlays。对 `label` 的 normalized overlay 先取 recursive base，再按数组声明顺序应用两个匹配项：最终 `readOnly=true`、`visible=false`；独立 `options` 深合并为 `{ density: 'compact', tone: 'quiet', validation: { when: 'change', required: true } }`；最后一个 presenter 整体替换之前的 presenter，因此不会残留 `placeholder`。Custom/default transformers 看到的都是这个 normalized overlay，caller input 不会被修改。

Raw JSON/code presenter 仍然只能显式选择。下面的 direct overlay 带有 `explicit: true`；缺少该标志会被 contract validation 拒绝。

当 dialect 没有 `presenter:raw.json.textarea` 专用 transformer 时，default structural transformer 仍保留这个显式 presenter；它不会把选择替换回默认 presenter：

```ts
import {
  compileEditorPlan,
  createSchemaEditorCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';

const presentationPlan = compileEditorPlan(
  createSchemaEditorCompilerRuntime(),
  {
    schema: { kind: 'scalar', id: 'payload', scalar: 'string' },
    presentation: {
      presenter: {
        id: 'raw.json.textarea',
        explicit: true,
        reason: 'presentation',
      },
    },
  },
  { planId: 'demo.explicit-raw.editor' },
);
```

## Shared Property Capsule + Bounded Context + Mounted Demo

当前 owner demo 把 "同一 schema，两个业务体验，一个 instance override" 走成了完整的
canonical runtime：

```ts
import {
  createSchemaEditorBusinessDialectDemoRuntime,
  mountSchemaEditorBusinessDialectDemo,
} from '../../../packages/dg-cell-mvi-halfcode-element-plus/demo/schema-editor-business-dialect';

const runtime = await createSchemaEditorBusinessDialectDemoRuntime({}, {}, {});

runtime.editors.businessA.phonePresenterId;
// "business.a.user.phone"

runtime.editors.businessB.phonePresenterId;
// "business.b.user.phone"

runtime.editors.businessAOverride.phonePresenterId;
// "business.a.user.phone.instance"

runtime.editors.businessA.capabilities.address
  === runtime.editors.businessB.capabilities.address;
// true: shared capability identity reuse
```

Mounted demo 会继续创建真实 DOM、canonical renderer 和 host harness：

```ts
const mounted = await mountSchemaEditorBusinessDialectDemo(document.body);

mounted.editors.businessA.host.setNextOutcome('pending');
mounted.editors.businessA.host.resolvePending();
```

`setNextOutcome()` / `resolvePending()` 只影响当前 editor 对应的 host harness。
Sibling editor 的 accepted snapshot、pending state、presenter registry、Session
和 canonical runtime 都保持隔离。

这组 demo 同时固定了两个边界：

1. `fixture.ts` 中的 schema 与 presentation 始终是纯数据；
2. runtime proof 只接受 accepted snapshot 推进 DOM，rejected / conflict /
   stale / malformed / dispose-late 都保留旧 accepted 画面。

因此 raw JSON/code 仍然只能显式选择，business demo 本身不存在任何隐式 fallback。

## Event-Time Command Templates

```ts
import type { EditorCommandBinding } from 'dg-cell-mvi-halfcode-logic';

export const branchBindings = [
  {
    event: 'branch.insert',
    commandTemplate: {
      kind: 'collection.insert',
      target: { source: 'literal', value: ['branches'] },
      arguments: {
        index: { source: 'event', path: ['index'] },
        value: { source: 'value', path: ['draftBranch'] },
      },
    },
  },
  {
    event: 'branch.move',
    commandTemplate: {
      kind: 'collection.move',
      target: { source: 'literal', value: ['branches'] },
      arguments: {
        from: { source: 'event', path: ['fromIndex'] },
        to: { source: 'event', path: ['toIndex'] },
      },
    },
  },
] satisfies EditorCommandBinding[];
```

The plan remains valid before a drag event supplies `fromIndex` and `toIndex`. Templates are serializable data and cannot contain callbacks, component instances, writers, or effects.

## Accepted Commands

```ts
import type { SchemaEditorCommand } from 'dg-cell-mvi-halfcode-logic';

export const addBranch = {
  kind: 'collection.insert',
  target: ['branches'],
  index: 0,
  value: { label: 'New branch', when: { kind: 'literal', value: true }, metadata: {} },
} satisfies SchemaEditorCommand;

export const moveBranch = {
  kind: 'collection.move',
  target: ['branches'],
  from: 2,
  to: 0,
} satisfies SchemaEditorCommand;

export const selectGroupedCondition = {
  kind: 'union.select',
  target: ['branches', 0, 'when'],
  alternativeId: 'group',
  initialValue: { kind: 'group', branches: [] },
} satisfies SchemaEditorCommand;
```

These concrete commands are formed after event-time arguments have been resolved. They do not apply themselves. A host may accept them and translate them to XNL mutations, domain commands, database writes, or signal updates outside the contract package.

## Presenter Registry And Normalized Event

Presenter id 与 Vue component implementation 只在代码侧 registry 绑定，不写进 `EditorPlan`：

```ts
import { defineComponent, h } from 'vue';
import {
  createSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';

const TextPresenter = defineComponent({
  props: ['value', 'pending', 'onSchemaEditorEvent'],
  setup(props) {
    return () => h('input', {
      value: String(props.value ?? ''),
      disabled: props.pending,
      onInput: (event: Event) => (
        props.onSchemaEditorEvent as (event: {
          event: string;
          payload: { value: string };
        }) => void
      )({
        event: 'value.change',
        payload: { value: (event.target as HTMLInputElement).value },
      }),
    });
  },
});

const presenters = createSchemaEditorPresenterRegistry(
  {},
  {
    entries: [
      { id: 'scalar.text', adapter: { component: TextPresenter } },
    ],
  },
  { duplicate: 'reject' },
);
```

Presenter 不创建 concrete command。`dispatchSchemaEditorPresenterEvent` 在 node 的 `commandBindings` 中匹配唯一 event，并把 template、payload 和当前 `wildcardBindings` 交给 `SchemaEditorSession.dispatch`。未知或重复 event fail closed。

## Recursive Dynamic Templates

Collection/map plan 保持一个 immutable wildcard template：

```text
collection itemTemplate path = ["branches", "*"]
map valueTemplate path       = ["branches", "*", "metadata", "*"]
```

渲染第 2 个 branch 的 `metadata.owner` 时，递归 renderer 产生：

```ts
{
  path: ['branches', 1, 'metadata', 'owner'],
  eventContext: {
    wildcardBindings: [1, 'owner'],
  },
}
```

这些 bindings 只用于本次 value lookup 和事件 dispatch。Renderer-local collection identity 使用独立的 identity bindings，不进入 presenter props、domain value、session 或 ValueHost request。

## Canonical Registry

```ts
import {
  createSchemaEditorCanonicalRegistry,
} from 'dg-cell-mvi-halfcode-vue';

if (!presenters.ok) throw new Error(JSON.stringify(presenters.diagnostics));

const canonical = createSchemaEditorCanonicalRegistry(
  { presenterRegistry: presenters.registry },
  { parentRegistry: applicationComponents },
  { componentIdentity: 'Editor' },
);
```

把 `canonical.registry` 交给现有 `CanonicalHalfcodeRenderer` 后，outer registry 根据当前 runtime/unit/node context 创建 shell；shell 从当前 `scopeId` 解析 `SchemaEditorSession`。Presenter 只看到 projection props 和 normalized event callback。

这里 lowering 生成的 tag 是 `schemaEditor.Editor`；canonical renderer 去掉 library namespace 后，以 `Editor` 作为 registry identity。
