# Effect 文件组织

Effect 配置在 `scopes.xnl`；代码按业务布局，不要求每种 effect 一个 XNL 文件。

```text
pages/users/
  scopes.xnl
  effects/
    users.effects.ts          # type + implementation 可共存
    mock-admin.effects.ts
    mock-admin.effect-impls.ts
```

不使用 `effect.types.xnl`、`effects.xnl`、`effects.def.xnl` 或 `effect.impls.xnl`。这些文件会把代码类型、实现选择和 Scope 装配拆成多重身份。
