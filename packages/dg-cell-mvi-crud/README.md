# dg-cell-mvi-crud

`dg-cell-mvi-crud` 提供与 UI 框架无关的 CRUD 状态、命令、effect 和 view-model。
字典数据的声明与状态保持可序列化；真正的数据加载由组合根注入的 provider 完成。

## 字典运行时接入

字典加载遵循同一条 MVI 闭环：

```text
DictDefinition / DictBinding
  -> load / refresh / hydrate / search command
  -> DictLoadIntent effect
  -> DictProvider
  -> loaded / failed result
  -> visibleNodes + knownByValue
```

provider 只返回标准节点：

```ts
import type {
  DictDefinition,
  DictProviderRegistrations,
} from 'dg-cell-mvi-crud';

const dictProviders = {
  'catalog.countries': {
    async load(intent) {
      const response = await fetch('/api/catalog/countries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          context: intent.context,
          query: intent.query,
        }),
      });
      const rows = await response.json();
      return rows.map((row: { id: string; name: string }) => ({
        value: row.id,
        label: row.name,
      }));
    },
    async loadByValues(intent) {
      const response = await fetch('/api/catalog/countries/by-values', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values: intent.values ?? [] }),
      });
      const rows = await response.json();
      return rows.map((row: { id: string; name: string }) => ({
        value: row.id,
        label: row.name,
      }));
    },
  },
} satisfies DictProviderRegistrations;
```

把 `dictProviders` 传给 `createCrudStore({ dictProviders, ... })` 或 Vue/Element Plus
组合根的 `useCrud({ dictProviders, ... })`。provider 内部可以选择 HTTP 客户端、鉴权和响应
转换方式；列配置、reducer、view-model 和控件 bridge 不应直接执行这些工作。

下列五种配置都可以直接放在列的 `dict` 字段中，也可以登记到
`crudOptions.dicts` 后由列通过 `{ dict: { id: '...' } }` 复用。

### 1. 内联固定选项

```ts
const statusDict = {
  id: 'status',
  source: {
    kind: 'inline',
    nodes: [
      { value: 'enabled', label: '启用' },
      { value: 'disabled', label: '停用' },
    ],
  },
  cache: { mode: 'none' },
  binding: {
    scope: 'form:status',
    triggers: ['eager'],
  },
} satisfies DictDefinition;
```

该来源不会调用 provider。节点会直接投影为 `visibleNodes` / `data`，同时写入
`knownByValue` / `dataMap`。

### 2. 固定远端 provider

```ts
const countryDict = {
  id: 'countries',
  source: {
    kind: 'provider',
    providerId: 'catalog.countries',
  },
  cache: { mode: 'shared', ttlMs: 60_000 },
  binding: {
    scope: 'form:country',
    triggers: ['open'],
  },
} satisfies DictDefinition;
```

`providerId` 必须与组合根中的注册键一致。固定 URL、鉴权和响应转换由 provider 私有实现。

### 3. 带上下文的级联 provider

```ts
const cityDict = {
  id: 'cities',
  source: {
    kind: 'provider',
    providerId: 'catalog.cities',
  },
  cache: { mode: 'scope', ttlMs: 30_000 },
  binding: {
    scope: 'form:city',
    dependencies: ['countryId'],
    triggers: ['open', 'context-change'],
  },
} satisfies DictDefinition;
```

`countryId` 从当前 CRUD form state 投影到 `intent.context`。依赖变化时 Element Plus
bridge 派发 `invalidate` 和 `refresh` command，新旧上下文会产生不同的请求关联和
缓存键，迟到的旧结果不会覆盖当前状态。

### 4. 按值补全

```ts
const assigneeDict = {
  id: 'assignees',
  source: {
    kind: 'provider',
    providerId: 'directory.users',
    capabilities: { hydrate: true },
  },
  cache: { mode: 'scope', ttlMs: 60_000 },
  binding: {
    scope: 'form:assignee',
    triggers: ['open', 'value-missing'],
  },
} satisfies DictDefinition;
```

为 `directory.users` 注册同时实现 `load` 和 `loadByValues` 的 provider。控件当前值不在
`knownByValue` 时会派发 hydrate command；返回节点只进入 `knownByValue`，不会无条件扩张
当前远程查询的 `visibleNodes`。表单投影另行生成只包含当前已选值的 `selectedOptions`；
Element Plus renderer 将它们注册为隐藏的 label-only `el-option`，因此 select 能显示补全
label，而下拉使用的 `options` 仍只来自 `visibleNodes`。

### 5. 远程搜索

```ts
const customerDict = {
  id: 'customers',
  source: {
    kind: 'provider',
    providerId: 'crm.customers',
    capabilities: { search: true },
  },
  cache: { mode: 'scope', ttlMs: 15_000 },
  binding: {
    scope: 'form:customer',
    triggers: ['open', 'search'],
    searchDebounceMs: 250,
  },
} satisfies DictDefinition;
```

Element Plus 的选择控件会把最后一个去抖后的输入词派发为 search command。
provider 的 `load(intent)` 通过 `intent.mode === 'search'` 和 `intent.query` 读取检索语义。

## 旧配置兼容与迁移

旧静态配置仍可直接使用：

```ts
dict: {
  data: [
    { code: 1, title: '启用' },
    { code: 0, title: '停用' },
  ],
  value: 'code',
  label: 'title',
}
```

旧固定 URL 配置仍通过全局 `dictRequest` 加载：

```ts
const crudOptions = {
  dictRequest: async ({ url }: { url: string }) => {
    const response = await fetch(url);
    return response.json();
  },
  columns: {
    countryId: {
      title: '国家',
      type: 'select',
      dict: {
        url: '/api/dicts/countries',
        value: 'id',
        label: 'name',
      },
    },
  },
};
```

既有 `getData(context)` 与 `getNodesByValues(values, context)` loader 也继续由 effect
边界的 legacy registry 调用。它们是兼容入口，不会被复制进 reducer state。需要上下文
级联、远程搜索、TTL、作用域隔离或可靠乱序保护时，应将 loader 迁入具名 provider，并把
列配置改为 `source.providerId + binding`。

`mapLegacyDictConfig(id, config)` 可把旧静态 `data` 或固定字符串 `url` 显式转换为
`DictDefinition`。它有意不接受动态 URL 函数或 loader callback；这两类配置应保留在
legacy 入口，或迁入 provider。

兼容期内 `data` 始终等于当前 `visibleNodes`，`dataMap` 始终等于
`knownByValue`。旧只读消费者可以逐步迁移，不需要一次性改完。

## 生命周期与缓存责任

- `createCrudStore` / `useCrud` 每创建一个 store，就以传入的 registrations 建立一个
  provider runtime。注册表在该 runtime 生命周期内固定，provider 实例不会进入 state。
- provider 自己持有的 HTTP client、认证信息或外部缓存由应用组合根管理；运行时不会替
  provider 创建或销毁这些资源，也不会清理 provider 自有缓存。
- `{ mode: 'none' }` 不保存成功结果；`scope` 按 scope 隔离；`shared` 只在同一个
  provider runtime 内跨 scope 共享完整同键请求。`ttlMs` 到期后下一次加载重新请求。
- 普通同键请求会复用在途执行；`refresh` 绕过可用缓存；`invalidateDict` 同时使匹配的
  runtime 缓存和在途结果失效。网络取消不是正确性前提，reducer 仍会拒绝旧代次结果。
- Element Plus 的 `context-change` bridge 负责在声明式依赖变化时派发失效与刷新。
  非 UI 的业务变化、服务端写入后失效，以及跨 store/provider 自有缓存失效，仍由应用在
  正确的业务边界派发 `commands.invalidateDict(...)` 或处理 provider 自有缓存。

## 可复现测试矩阵

| 场景 | 主要证据 |
|---|---|
| 内联固定选项 | `dict-contract.test.ts` 的 fixed declaration；`dict-provider-runtime.test.ts` 的 legacy inline adapter |
| 固定远端 | `dict-provider-runtime.test.ts` 的 fixed URL adapter 与显式 provider 优先级 |
| 自定义 provider | `dict-provider-runtime.test.ts` 的 composition-root injection 与完整 intent 透传 |
| 上下文动态/级联 | Element Plus `dict-control-bridge.test.ts`：依赖变化后经 bridge → store/effect/provider/result，断言新 context、UI options 与 loading props |
| 按值补全 | Element Plus `dict-control-bridge.test.ts`：未知已选值经 bridge → `loadByValues` → result，断言 `selectedOptions`/真实 select label-only option 可见且 `visibleNodes`/`options` 不扩张 |
| 输入词搜索 | Element Plus `dict-control-bridge.test.ts`：fake timers 去抖后经 remoteMethod → store/effect/provider/result，断言 query、loading props 与完成 options |
| 旧配置回归 | `dict-contract.test.ts` 的 legacy mapper；`dict-provider-runtime.test.ts` 的 static / fixed URL / loader adapter |

从工作区根目录运行：

```bash
pnpm --dir packages/dg-cell-mvi-crud test
pnpm --dir packages/dg-cell-mvi-element-plus test
packages/dg-cell-mvi-crud/node_modules/.bin/tsc --noEmit \
  -p packages/dg-cell-mvi-crud/tsconfig.json
pnpm --dir packages/dg-cell-mvi-admin-element-plus build
```
