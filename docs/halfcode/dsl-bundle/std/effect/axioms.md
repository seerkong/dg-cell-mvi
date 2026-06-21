# L2 Effect halfcode 领域公理

> 基于 L1 元公理与 DEPA `output = fn(runtime, input, config)`。Effect 是 scope 装配的广义副作用依赖，编号 `E-*`。

## E-1 · Effect 不等于资源操作

Effect 可以是 HTTP、mock、存储、worker、native bridge、日志或权限能力。XNL 不描述 URL、HTTP method、CRUD、ORM、请求结构或函数体；这些属于代码实现。

## E-2 · 类别与类型归实际 binding 节点

`FuncEffect` 和 `InterfaceEffect` tag 表示能力类别。TS 签名是代码 export 的事实；需要显式声明时，写在同一 binding 的 `type = "vfs://...#Type"`。不建立 `EffectType` catalog，也不建立 effect type URI。

## E-3 · Scope 是唯一装配点

effect 名称到实现的绑定只出现在 Scope 的 `<EffectBindings>` 子域。Scope 将本地 binding 与父 scope 可见 binding 一起装配进 runtime；动态代码通过 `runtime.callEffect(name, input, config)` 调用，而不探测 runtime 内部对象布局。

## E-4 · 实现遵守 DEPA 协议

函数级实现和 interface factory 都是 `output = fn(runtime, input, config)`。Interface factory 的 output 是实现对象；该对象上的能力方法也采用相同的动态代码协议。

## E-5 · mock/real 只是不同的代码绑定

mock 与真实实现不改变 effect 定义。它们是不同 Scope、不同 runtime prototype 或不同环境选择的 `impl`/`impls` 代码入口。

## E-6 · 三档写法共用节点身份

| 层级 | 写法 | 适用 |
|---|---|---|
| Quick | binding 只写 `impl` 或 `src` | demo、一次性 mock |
| Compact | 同一 binding 写 `type` + `impl`，或 Scope 写 `EffectBindings.impls` bundle | 普通业务 |
| Split/Public | binding 保留 `type`，Scope 按稳定 `#id` 选择/覆盖实现 | 公开 contract、跨包复用 |

三档仅改变代码引用和装配位置，不制造第二个 type identity。
