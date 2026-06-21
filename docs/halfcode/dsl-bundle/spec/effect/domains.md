# Effect 域参考表

Effect 没有独立 type/implementation domain。它是 Scope 的子域：

| 子域 | 所在位置 | 条目 | 寻址 |
|---|---|---|---|
| `EffectBindings` | `<Scope (...)>` | `FuncEffect`、`InterfaceEffect` 或实现 bundle | `scope-effect://#<effect-id>` |

`scope-effect://` 是当前 scope 链派生出的可见 binding 注册表，而不是文件域。effect 的类别由 tag 表达；TS type 和实现直接指向 `vfs://...#export`。
