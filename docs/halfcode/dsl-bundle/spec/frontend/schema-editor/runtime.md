# Schema Editor Runtime

Schema Editor runtime 把 renderer-neutral `EditorPlan` 接到 Halfcode canonical source、Scope capability、Vue renderer 和宿主拥有的值修改协议。Support runtime 不渲染组件；Vue capsule 不直接修改业务值。

所有公开 Processor 都从 `dg-cell-mvi-halfcode-support` 包根导入，并保持：

```ts
output = fn(runtime, input, config)
```

## Command Resolution

`resolveSchemaEditorCommand` 在一次 dispatch 开始时，对 template、event、当前 accepted value snapshot 和 wildcard bindings 做 descriptor-safe 快照，再解析一个 concrete `SchemaEditorCommand`：

```ts
import { resolveSchemaEditorCommand } from 'dg-cell-mvi-halfcode-support';

const result = resolveSchemaEditorCommand(runtime, {
  template,
  event: { next: 'Ada' },
  snapshot: { name: 'Grace' },
}, {});
```

解析器只读取 own data properties，不执行普通 object/array accessor 或 coercion hook。缺少 required argument、非法 path 或未物化 wildcard 时只返回 diagnostics，不返回 partial command，也不执行 mutation。

## ValueHost And Session

`SchemaEditorValueHost` 是宿主提供的 Effect port：

```ts
type SchemaEditorValueHost<T> = (
  runtime: unknown,
  input: {
    command: SchemaEditorCommand;
    expectedRevision: string | number;
  },
  config: Readonly<Record<string, unknown>>,
) => SchemaEditorApplyResult<T> | Promise<SchemaEditorApplyResult<T>>;
```

`SchemaEditorSession` 是 accepted-state projection Actor。它只在宿主返回当前 revision 对应的合法 `accepted` snapshot 时推进投影：

```ts
import {
  createSchemaEditorSession,
  type SchemaEditorValueHost,
} from 'dg-cell-mvi-halfcode-support';

type Profile = { name: string };

const valueHost: SchemaEditorValueHost<Profile> = (
  _runtime,
  request,
  _config,
) => ({
  status: 'accepted',
  baseRevision: request.expectedRevision,
  snapshot: {
    value: { name: 'Ada' },
    revision: 'rev-2',
  },
});

const session = createSchemaEditorSession(
  runtime,
  {
    initialSnapshot: {
      value: { name: 'Grace' },
      revision: 'rev-1',
    },
    valueHost,
  },
  {
    sessionId: 'profile-editor-session',
    valueHostId: 'profile-value-host',
  },
);
```

`SchemaEditorRevision` 是 opaque `string | number` token；数字必须 finite。Session 不排序、不自增、不归一化 revision，不做 optimistic mutation。`rejected`、`conflict`、malformed、throw、stale、duplicate、out-of-order 和 dispose 后的 late response 都不能推进 accepted projection。

`requestId` 只存在于 session-local pending state，不进入 ValueHost request/result envelope。`getState()` 和 subscriber 收到 cloned immutable projection；`dispose()` 清理 pending/subscribers，并拒绝后续 dispatch。

## Scope Capability Bridge

ValueHost 与 session 实例通过现有 Scope runtime binding 继承或覆盖，不写入 `EditorPlan.provenance`，也不使用 global registry：

```ts
import {
  createDefaultHalfcodeRuntime,
  resolveSchemaEditorScopeBridge,
} from 'dg-cell-mvi-halfcode-support';

const scopeRuntime = createDefaultHalfcodeRuntime(
  'profile-editor-scope',
  parentRuntime,
  {
    schemaEditor: {
      valueHosts: { 'profile-value-host': valueHost },
      sessions: { 'profile-editor-session': session },
    },
  },
);

const bridge = resolveSchemaEditorScopeBridge(scopeRuntime, {}, {
  valueHostId: 'profile-value-host',
  sessionId: 'profile-editor-session',
});
```

Capability registry shell 是 frozen 的，但 ValueHost function 与 session instance 保留原 identity。子 Scope 继承父绑定，可按相同 stable id 覆盖；兄弟 Scope 的局部绑定互不泄漏。

## Canonical Lowering

`lowerEditorPlan` 是纯 Processor。它只消费完整 `EditorPlan` 和 serializable config，返回 deterministic memory source bundle：

```ts
import { lowerEditorPlan } from 'dg-cell-mvi-halfcode-support';

const sourceBundle = lowerEditorPlan(runtime, { plan }, {
  target: 'halfcode',
  unitFqn: 'dg.profile.$ProfileEditor',
  scopeId: 'profile-editor-scope',
  valueHostId: 'profile-value-host',
  sessionId: 'profile-editor-session',
  uiLibrary: 'schemaEditor',
});
```

输出包含 `manifestUri`、`sourceMap`、固定 `uiLibrary: 'schemaEditor'`、`logicalUnitFqn` 和 `runtimeUnitFqn`。Source 只生成一个 `schemaEditor.Editor` shell atom，并完整保存 plan 与 stable Scope bridge ids。

Canonical Unit FQN 允许 `$`，而当前 XNL marker alphabet 更窄。Lowering 因此保留 logical identity，并用无碰撞投影生成 loader identity：

```text
_ -> __
$ -> _d
```

Source root 按 logical FQN 的 segment percent-encode；不同 bundle 可共存于同一 VFS。生成 source 已通过真实 source resolver、`loadHalfcodeUnitBundle`、`compileHalfcodeUnitBundle` 和 `loadHalfcodeAppRuntime` lifecycle。输出不捕获 accepted snapshot、ValueHost/session implementation、callback、renderer、presenter、component 或 host writer。

## Vue Presenter And Session Lifecycle

`dg-cell-mvi-halfcode-vue` 从包根提供 toolkit-neutral renderer。Presenter implementation 通过 stable id 显式注册：

```ts
import {
  createSchemaEditorPresenterRegistry,
  SchemaEditorSessionRenderer,
} from 'dg-cell-mvi-halfcode-vue';

const presenterResult = createSchemaEditorPresenterRegistry(
  {},
  {
    entries: [
      { id: 'scalar.text', adapter: { component: TextPresenter } },
      { id: 'form.group', adapter: { component: GroupPresenter } },
    ],
  },
  { duplicate: 'reject' },
);
```

`SchemaEditorSessionRenderer` 订阅一个 `SchemaEditorSession`，从 `state.snapshot.value` 递归渲染 `group`、`field`、`collection`、`map`、`union`、`custom` 六类 plan node。Collection 的 `itemTemplate` 和 map 的 `valueTemplate` 不会被复制为静态 plan children；每次 accepted snapshot render 都按外到内顺序生成 `wildcardBindings`，用于 value path 和事件 dispatch。

Presenter 只发送 descriptor-safe normalized presenter event：

```ts
props.onSchemaEditorEvent({
  event: 'item.move',
  payload: { fromIndex: 2, toIndex: 0 },
});
```

唯一事件链是：

```text
normalized presenter event
-> plan-owned EditorCommandBinding
-> SchemaEditorSession.dispatch
-> ValueHost
-> accepted snapshot
-> session subscription rerender
```

Pending/diagnostics 可以改变呈现状态，但不会改变 renderer 的 accepted value。Session、node、presenter registry 或 key prefix 替换时，renderer 重建对应订阅或 renderer-local identity projection；unmount 只 unsubscribe，从不 dispose Scope 可能共享的 session。

## Canonical Registry And Scope Context

```ts
import {
  createSchemaEditorCanonicalRegistry,
} from 'dg-cell-mvi-halfcode-vue';

const canonicalResult = createSchemaEditorCanonicalRegistry(
  { presenterRegistry: presenterResult.registry },
  { parentRegistry },
  { componentIdentity: 'Editor' },
);
```

`CanonicalComponentRegistry.resolve(name, context?)` 的 context 由现有 canonical renderer 提供，包含当前 app runtime、unit render plan 和 node。Schema Editor adapter 用 `node.scopeId` 定位 Scope，再通过 lowered source 中的 stable `valueHostId/sessionId` 解析 bridge。Adapter 只把 `bridge.session` 交给内部 shell，不把 `bridge.valueHost` 交给 renderer 或 presenter。旧 one-argument canonical registry 仍可作为 parent 使用。

Lowered atom 的 tag 是 `schemaEditor.Editor`，但 canonical renderer 会把 `schemaEditor` 作为 library namespace，传给 registry 的 identity 是 `Editor`，所以 factory config 使用 `componentIdentity: 'Editor'`。

Registry cache 只存在于每个 factory 结果内部，并按 runtime/plan/node 隔离；没有 module-global registry，也没有第二套 loader、compiler、runtime、lowering 或 canonical renderer。

## Three Integration Tiers

### Tier 1: Direct Processor

宿主已有自己的表单生命周期时，直接使用 `resolveSchemaEditorCommand`，再把 concrete command 交给宿主唯一 mutation owner。适合不需要 Halfcode Scope/session projection 的内部工具。

### Tier 2: Prebuilt Runtime

使用 `createSchemaEditorSession`、`createDefaultHalfcodeRuntime` 和 `lowerEditorPlan`。ValueHost/session 通过 stable ids 绑定到 Scope，canonical shell 通过同一 ids 解析能力。适合大多数 App Bundle。

### Tier 3: Custom Scoped Runtime

复杂产品可用自定义 object/class 实现 Halfcode runtime protocol，在多个 Scope 中复用实例，并按父子 Scope 装配 visibility/override。Schema Editor 仍只依赖 typed `schemaEditor.valueHosts/sessions` capability shape；业务强类型、泛型、持久化和 mutation implementation 留在宿主代码。

## Canonical Business Demo Entry

当前 owner 侧的 business dialect demo 是 Tier 3 的最小可运行证明：

```ts
import {
  createSchemaEditorBusinessDialectDemoRuntime,
  mountSchemaEditorBusinessDialectDemo,
} from '../../../packages/dg-cell-mvi-halfcode-element-plus/demo/schema-editor-business-dialect';
```

`createSchemaEditorBusinessDialectDemoRuntime({}, {}, {})` 会创建三个隔离 editor：

- `businessA`
- `businessB`
- `businessAOverride`

它们共享同一 `BUSINESS_DIALECT_SHARED_SCHEMA` 与 shared property capsule，
但各自拥有独立的 compiler runtime、presenter registry、Session、ValueHost、
Scope runtime、lowered source bundle、app runtime 和 canonical registry。

`mountSchemaEditorBusinessDialectDemo(target)` 会把这三个 editor 挂到真实 DOM，
并暴露 host harness，便于重放：

- `accepted`
- `pending`
- `rejected`
- `conflict`
- `stale`
- `malformed`
- `resolvePending()`

这些 outcome 的规则与通用 session 完全一致：只有当前 revision 匹配的
`accepted` snapshot 能推进 DOM。其他 outcome 最多改变 pending/diagnostic，
不会产生 optimistic mutation，也不会把 accepted state 泄漏到 sibling Scope。

## Current Boundary

当前已实现 command resolver、revision-gated session、Scope bridge、canonical source lowering、presenter registry、递归 Vue renderer、normalized event bridge、session lifecycle、canonical registry integration，以及从包根组装的 Element Plus 26 项默认 presenter/alias matrix、显式 business later-wins 与 canonical bootstrap。Element Plus 仍只展示 accepted projection，并通过既有事件链请求修改；详见 [Element Plus presenters](element-plus.md)。

Workbench 已经用这一层 runtime 完成 G4 consumer 组合：flow/node target 经过
`projectFlowSchemaEditorTarget -> assembleFlowSchemaEditorRuntime -> SchemaEditorSession`
进入 canonical shell，而 `FlowSchemaEditorValueHost` 只把 concrete command
转交给 Workbench semantic edit port。Flow/XNL mutation、dry-run、canonical
reload、VFS commit 和 revision token creation 仍在 Workbench 既有 owner 中。
