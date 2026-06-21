# 前端引用规则

Unified URI syntax and container visibility are defined in L1 M-N4/M-N7. Canonical frontend schemes:

| family | schemes |
|---|---|
| unit/route | `page://` `component://` `route://` |
| local domains | `contract://` `contract-def://` `scope://` `command://` `command-def://` `event://` `event-def://` `config://` `config-def://` `data-graph://` `data-graph-seed://` `runtime://` `wiring://` |
| scope-derived | `scope-runtime://` `scope-effect://` `scope-data-graph://` |
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
