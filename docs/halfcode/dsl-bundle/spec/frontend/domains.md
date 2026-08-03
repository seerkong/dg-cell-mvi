# 前端域参考表

| domain | layer | root | entry scheme | entry |
|---|---|---|---|---|
| `elements` | page/component | `<Elements>` | — | UI tree |
| `contracts` / `contracts.def` | page/component | `<Contracts>` / `<ContractsDef>` | `contract://` / `contract-def://` | contract entries |
| `scopes` | page/component | `<Scopes>` | `scope://` | `Scope` |
| `commands` / `commands.def` | app/page/component | `<Commands>` / `<CommandsDef>` | `command://` / `command-def://` | Command |
| `events` / `events.def` | app/page/component | `<Events>` / `<EventsDef>` | `event://` / `event-def://` | Event |
| `config` / `config.def` | app/page/component | `<Config>` / `<ConfigDef>` | `config://` / `config-def://` | ConfigEntry |
| `data.graph` / `data.graph.seed` | app/page/component | `<DataGraph>` / `<DataGraphSeed>` | `data-graph://` / `data-graph-seed://` | GraphModule / GraphSeed |
| `runtime` | app/page/component | `<Runtime>` | `runtime://` | RuntimeInstance |
| `routes` | app | `<Routes>` | `route://` | Route |
| `wiring` | app | `<Wiring>` | `wiring://` | Wire |

Effect and DataGraph bindings are Scope `()` subdomains, not type catalog domains. `workspace` and `fixtures` are app projection domains and do not participate in compilation.

Document has no `elements` domain. A Document root `[]` is ordered Domain XNL
source, and a unique `DocumentSource.ref` points at external UI-free Domain XNL;
the two forms are mutually exclusive. See [Document Unit](document.md).

AppBundle `Units` derives page/component/document registries and registers the four canonical Flow products. Page/Component/Document refs stay in this family; Flow loading and runtime handle assembly are specified under [`spec/flow/`](../flow/domains.md).
