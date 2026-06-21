# 前端文件组织

domain/file/root tag describes artifact organization; entry schemes use singular kebab-case. The authoritative mapping is L1 M-N2 and `HALFCODE_SCHEME_TABLE`.

```text
pages/users/
  manifest.xnl            # <Page #dg.admin.UsersPage>
  elements.xnl
  contracts.xnl
  scopes.xnl
  commands.xnl
  events.xnl
  config.xnl
  data.graph.xnl          # optional
  data.graph.seed.xnl     # startup overrides only
  runtime.xnl             # optional
  effects/                 # code
  graph-code/              # code
```

`manifest.xnl` is the only entry. Multi-file units discover domains from each domain root tag; single-file units put unique domain roots in the root `()` and their UI tree in root `[]`.

```xnl
<AppBundle #dg.admin.App apiVersion="halfcode.dg-cell-mvi/v1" (
  <Units [
    <Unit kind="page" fqn="dg.admin.UsersPage" src="vfs://./pages/users/manifest.xnl">
  ]>
)>
```

`AppBundle` is the only canonical bundle root. Do not create `effect.types.xnl`, `data.graph.logic.types.xnl`, `effects.xnl`, `graph.impls.xnl`, `*.graph.json`, or `*.halfcode.json`.
