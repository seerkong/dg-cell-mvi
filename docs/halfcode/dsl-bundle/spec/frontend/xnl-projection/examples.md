# XNL Projection Examples

以下示例只使用 package-root API。XNL 与 Presentation 均为纯数据；function
只出现在明确标注的代码侧 Dialect/Presenter/runtime wiring 中。

## Domain XNL

```xnl
<SystemDesign #checkout-system [
  <Service #checkout-api {
    owner = "payments"
  }>
  <Service #billing-api {
    owner = "finance"
  }>
]>
```

这里的 `#checkout-system`、`#checkout-api`、`#billing-api` 是 Domain identity。
XNL 不引用 Presenter implementation、component、callback 或 persistence
capability。

## Pure-Data Presentation

```ts
import type {
  XnlProjectionPresentation,
} from 'dg-cell-mvi-halfcode-contract';

export const presentation = {
  kind: 'xnl-projection-presentation',
  id: 'demo.system-design.presentation',
  rules: [
    {
      id: 'all-nodes',
      match: {},
      presenter: {
        id: 'demo.presenter.node',
        options: { density: 'compact' },
      },
    },
    {
      id: 'checkout-service',
      match: { nodeId: 'checkout-api' },
      data: { emphasis: 'primary' },
    },
  ],
} satisfies XnlProjectionPresentation;
```

Presentation 只保存 stable ids/options/data。`demo.presenter.node` 的实现由代码
registry 决定。

## Compile XNL To Plan

```ts
import { parseXnl } from 'xnl-core';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultXnlProjectionDialect,
  createXnlProjectionRootInput,
} from 'dg-cell-mvi-halfcode-support';

const parsed = parseXnl(`
  <SystemDesign #checkout-system [
    <Service #checkout-api { owner = "payments" }>
    <Service #billing-api { owner = "finance" }>
  ]>
`);
const domainRoot = parsed.nodes[0];
if (domainRoot === undefined) {
  throw new Error('Expected one Domain XNL root.');
}

const compilerRuntime = createXnlProjectionCompilerRuntime({
  dialects: [createDefaultXnlProjectionDialect()],
  presentation,
});

const plan = compileXnlProjection(
  compilerRuntime,
  createXnlProjectionRootInput(domainRoot, {
    role: 'document',
    sourceRef: 'vfs://./system-design.xnl',
  }),
  { planId: 'demo.system-design.plan' },
);
```

`createXnlProjectionRootInput` 明确把 Element `#id`/tag 映射到 DomainRef；
compiler 本身不猜 record `id`/`tag`。`plan` 是可重建 IR，不是 Domain
authority。

## Present One Plan As Two Neutral Surfaces

```ts
import {
  createXnlProjectionInspectionPresenterAdapter,
  createXnlProjectionOutlinePresenterAdapter,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRegistry,
  createXnlProjectionPresenterRuntimeFacet,
  presentXnlProjection,
  XNL_PROJECTION_INSPECTION_SURFACE_ID,
  XNL_PROJECTION_OUTLINE_SURFACE_ID,
} from 'dg-cell-mvi-halfcode-support';

const outlineAdapter = createXnlProjectionOutlinePresenterAdapter(
  {},
  { id: 'demo.presenter.node' },
  {},
);
const inspectionAdapter = createXnlProjectionInspectionPresenterAdapter(
  {},
  { id: 'demo.presenter.node' },
  {},
);

const outlineRegistryResult = createXnlProjectionPresenterRegistry(
  {},
  { adapters: [outlineAdapter] },
  { duplicate: 'reject' },
);
const inspectionRegistryResult = createXnlProjectionPresenterRegistry(
  {},
  { adapters: [inspectionAdapter] },
  { duplicate: 'reject' },
);
if (!outlineRegistryResult.ok || !inspectionRegistryResult.ok) {
  throw new Error('Neutral Presenter registry construction failed.');
}

const neutralPresenterSource = Object.freeze({});
const neutralPresenterProtocol = createXnlProjectionPresenterCapabilityProtocol<
  Record<string, never>,
  Record<string, never>
>(
  {},
  { id: 'demo.presenter.protocol.neutral', grants: [] },
  {},
);
const presenterFacet = createXnlProjectionPresenterRuntimeFacet(
  { source: neutralPresenterSource, protocol: neutralPresenterProtocol },
  {},
  {},
);

const outline = await presentXnlProjection(
  {
    presenterRegistry: outlineRegistryResult.registry,
    presenterRuntime: presenterFacet,
  },
  { plan },
  { surfaceId: XNL_PROJECTION_OUTLINE_SURFACE_ID },
);

const inspection = await presentXnlProjection(
  {
    presenterRegistry: inspectionRegistryResult.registry,
    presenterRuntime: presenterFacet,
  },
  { plan },
  { surfaceId: XNL_PROJECTION_INSPECTION_SURFACE_ID },
);
```

两个 registry 对相同 stable Presenter id 绑定不同 adapter，因此同一 Plan
得到 outline 与 inspection 两种纯数据结果。它们不会修改 Plan 或 Domain XNL。

## Registration Defaults And Plan Options

代码侧 adapter 可以声明 registration defaults：

```ts
import {
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRegistry,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
  type XnlProjectionRegisteredPresenterAdapter,
} from 'dg-cell-mvi-halfcode-support';

const adapter = {
  id: 'demo.presenter.node',
  surfaceId: 'demo.surface.node',
  config: {
    density: 'comfortable',
    tone: 'neutral',
  },
  present(runtime, input, config) {
    return {
      surfaceId: config.surfaceId,
      value: {
        label: input.node.domain.tag ?? input.node.classification.id,
        options: config.options,
        locale: runtime.locale,
        children: input.childOutputs.map((child) => child.value),
      },
    };
  },
} satisfies XnlProjectionRegisteredPresenterAdapter<{
  readonly locale: string;
}>;

const adapterRegistryResult = createXnlProjectionPresenterRegistry(
  {},
  { adapters: [adapter] },
  { duplicate: 'reject' },
);
if (!adapterRegistryResult.ok) {
  throw new Error('Custom Presenter registry construction failed.');
}
const adapterRuntime = Object.freeze({
  locale: 'zh-CN',
  hostOnlyCapability: () => undefined,
});
type AdapterPresenterView = { readonly locale: string };
const localeGrant = createXnlProjectionPresenterSnapshotGrant<
  typeof adapterRuntime,
  AdapterPresenterView,
  'locale',
  'locale'
>(
  {},
  {
    id: 'demo.presenter.grant.locale',
    sourceKey: 'locale',
    facadeKey: 'locale',
  },
  {},
);
const adapterProtocol = createXnlProjectionPresenterCapabilityProtocol<
  typeof adapterRuntime,
  AdapterPresenterView
>(
  {},
  { id: 'demo.presenter.protocol.locale', grants: [localeGrant] },
  {},
);
const adapterRuntimeFacet = createXnlProjectionPresenterRuntimeFacet(
  { source: adapterRuntime, protocol: adapterProtocol },
  {},
  {},
);
```

调用 runner 时，`adapterRegistryResult.registry` 与 `adapterRuntimeFacet` 组成
同一个显式 runtime type；host 的其他 capability 不会自动进入 facet。这里
`hostOnlyCapability` 是合法 source 的 ungranted capability：它不导致 projection 失败，
也不会成为 facade own key。

若 Plan ref 是：

```ts
{
  id: 'demo.presenter.node',
  options: {
    density: 'compact',
  },
}
```

调用期 config 精确为：

```ts
{
  surfaceId: 'demo.surface.node',
  options: {
    density: 'compact',
    tone: 'neutral',
  },
}
```

这是顶层浅合并；Plan options later-wins。`present` function 只存在于代码侧
adapter，不进入 XNL、Presentation 或 Plan。

## Project A Typed Scope Runtime

现有 `bindScope`/`deriveScope` 输出可以直接作为 source；Presenter 仍只看到独立的 exact
typed facade。下面用 package-root API 投影 `bindScope` 的实际返回类型：

```ts
import {
  createDefaultHalfcodeRuntime,
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRuntimeFacet,
  createXnlProjectionPresenterSnapshotGrant,
} from 'dg-cell-mvi-halfcode-support';

const EMPTY = Object.freeze({});
const hostScope = createDefaultHalfcodeRuntime('host');
const scopeRuntime = hostScope.bindScope({
  scopeId: 'document',
  runtime: hostScope,
  bindings: {},
});

type ScopePresenterView = { readonly scopeId: string };

const scopeIdGrant = createXnlProjectionPresenterSnapshotGrant<
  typeof scopeRuntime,
  ScopePresenterView,
  'scopeId',
  'scopeId'
>(
  EMPTY,
  {
    id: 'demo.presenter.grant.scope-id',
    sourceKey: 'scopeId',
    facadeKey: 'scopeId',
  },
  EMPTY,
);
const scopeProtocol = createXnlProjectionPresenterCapabilityProtocol<
  typeof scopeRuntime,
  ScopePresenterView
>(
  EMPTY,
  {
    id: 'demo.presenter.protocol.document-scope',
    grants: [scopeIdGrant],
  },
  EMPTY,
);
const scopeFacet = createXnlProjectionPresenterRuntimeFacet(
  { source: scopeRuntime, protocol: scopeProtocol },
  EMPTY,
  EMPTY,
);

scopeFacet.view.scopeId;
```

`keyof typeof scopeFacet.view` 精确为 `scopeId`。`parent`、
`localBindings`、`deriveScope`、runtime graph 与其他 host capabilities 仍可存在于
`scopeRuntime`，但静态类型与 runtime facade 都不 possession 它们。若要 grant method，
custom runtime 必须声明可 containment 的具体返回类型；不能把默认泛型 `callEffect` 的
`unknown` result 窄化成业务 facade result。合法 method wrapper 仍保留原 Scope owner 的
`this`/private/prototype/mixin 语义，protocol owner 也必须把它当作真实 effect authority 审查。

## Code-Owned Interaction Translator

默认 XNL Dialect 不定义领域编辑语义。产品可以在代码侧增加 translator：

```ts
import type { XnlNode } from 'xnl-core';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  translateXnlProjectionInteraction,
  type XnlProjectionCompilerDialect,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultXnlProjectionDialect,
  createXnlProjectionRootInput,
} from 'dg-cell-mvi-halfcode-support';

const defaultDialect = createDefaultXnlProjectionDialect();
const commandDialect = {
  ...defaultDialect,
  id: 'demo.system-design.commands',
  translateInteraction(_runtime, input, _config) {
    if (input.interaction.type !== 'system-design.rename') {
      return {
        status: 'unsupported',
        diagnostics: [{
          severity: 'error',
          code: 'UNSUPPORTED_SYSTEM_DESIGN_INTERACTION',
          message: 'The current Dialect does not translate this interaction.',
          planNodeId: input.planNode.id,
        }],
      };
    }
    return {
      status: 'translated',
      command: {
        type: 'system-design.rename',
        target: input.planNode.domain,
        ...(input.interaction.payload !== undefined
          ? { payload: input.interaction.payload }
          : {}),
      },
    };
  },
} satisfies XnlProjectionCompilerDialect<XnlNode>;

const commandRuntime = createXnlProjectionCompilerRuntime({
  dialects: [commandDialect],
  presentation,
});

const commandPlan = compileXnlProjection(
  commandRuntime,
  createXnlProjectionRootInput(domainRoot, {
    role: 'document',
    sourceRef: 'vfs://./system-design.xnl',
  }),
);

const outcome = translateXnlProjectionInteraction(
  commandRuntime,
  {
    planNode: commandPlan.root,
    interaction: {
      type: 'system-design.rename',
      target: { planNodeId: commandPlan.root.id },
      payload: { title: 'Checkout Platform' },
    },
  },
  {},
);
```

`outcome.status === 'translated'` 仍只表示得到了 Domain Command proposal。
这个示例没有 apply、diff、ValueHost acceptance 或 persistence；these
capabilities belong to the separate
[XNL Document authoring session](../authoring/README.md), not the Projection
foundation.

正常 Presenter render 仍返回 surface data。将 Interaction/Command proposal 从 edit-intent
channel 交给 Document/authoring owner 的 NodeView consumer 与 submit bridge 是
**TIPTAP FUTURE / NOT IMPLEMENTED BY THIS TRACK**；本示例没有创建该 wiring。
