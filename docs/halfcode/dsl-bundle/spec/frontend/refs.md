# 前端引用规则

Unified URI syntax and container visibility are defined in L1 M-N4/M-N7. Canonical frontend schemes:

| family | schemes |
|---|---|
| unit/route | `page://` `component://` `document://` `route://` |
| local domains | `contract://` `contract-def://` `scope://` `command://` `command-def://` `event://` `event-def://` `config://` `config-def://` `data-graph://` `data-graph-seed://` `runtime://` `wiring://` |
| scope-derived | `scope-runtime://` `scope-effect://` `scope-data-graph://` |
| runtime target | `runtime-instance://` `unit-instance://` |
| source | `vfs://` |

Logical domain URIs resolve only in the current container. Cross-unit use goes through a Page/Component registry or explicit shared `vfs://` import. The element tree has no URI domain.

```xnl
<Scope #users-page {
  runtime = "runtime://#users-page"
  config = "config://#users-page"
} (
  <EffectBindings [
    <FuncEffect #users.query {
      type = "vfs://./effects/users.effects.ts#UsersQueryEffect"
      impl = "vfs://./effects/mock.ts#queryUsers"
    }>
  ]>
  <DataGraphBindings [
    <GraphMount #users-list { module = "data-graph://#users.list" }>
  ]>
)>
```

`Requires.effects` uses `scope-effect://#id`, which means the required effect binding must be visible from the host scope chain:

```xnl
<Requires {
  config = ["config://#users-filter"]
  commands = ["command://#users.search"]
  effects = ["scope-effect://#users.query"]
}>
```

`MessagePolicy` is a propagation policy only and is declared only at a needed boundary. Its actions are `consume`, `bubble`, and `reject`; it does not point to a handler or effect.

For Document Units, `document://<FQN>` resolves a static definition in the Unit
registry. `runtime-instance://#<id>` names a RuntimeInstance bound by Scope.
`unit-instance://<unit-instance-id>/<projection-role>/<x-id>` resolves a mounted
target through the Document occurrence runtime registry only; it is not a static
domain ref and not a DOM/query selector. `x-id` is that runtime occurrence
address component; XNL mutation identity remains `#id` or canonical XNL path.
See [Document Unit](document.md) and
[XNL Document authoring session](authoring/README.md).
