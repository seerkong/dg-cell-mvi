# Design：Presentation-owned Mode Registration Coordinator

## Authority

`DocumentDisplayModeSession` 仍独占 base/overlay/policy projection。Coordinator 只持有
registration lease 与 consumer 引用计数，不解释或复制 mode。

## 装配层级

```text
product presentation lifecycle
  -> optional shared coordinator
      -> browser host generation A
      -> browser host generation B

standalone browser host
  -> private coordinator
```

同一 presentation 的 host replacement 在旧 consumer 释放与新 consumer 获取之间复用
entry。Presentation 最终 dispose 后 coordinator 注销剩余 lease。未显式注入时，每个 host
保持隔离。

## Inherit

Embedded mode view 增加 `inheritedMode`。默认 shell 仅在 policy 的
`allowedModes` 包含 inheritedMode 时允许 clear-to-inherit；当前已经 inherit 时保持禁用。
最终 transition 仍由 session/policy 决定，UI 推断不能授予权限。
