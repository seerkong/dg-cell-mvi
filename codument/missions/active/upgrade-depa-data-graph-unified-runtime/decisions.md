# Mission Decisions

## D1 — 固定 upstream 目标

锁定 `/Users/kongweixian/infra-dev/depa-data-graph` 的提交 `966f26bac5a8cfebb4b3f30e7ff24f7407aee12c` 及其 core/Vue `1.0.1` 发布面，不浮动到未来版本。

## D2 — 历史与当前状态的 owner

`AppendOnlyEventLog` 是历史与 replay owner；统一 DataGraph 的 state node output 只表达当前状态，不能替代 history-bearing source。

## D3 — StreamSignalStore 公共兼容面

默认保持 `dispatch/state/viewModel/dispose/eventLog/graph` 的外部形状，内部迁移到统一图。若类型或行为证据证明无法正确维持该 facade，必须先请求用户批准破坏性变更。

## D4 — Halfcode mission 协调

只迁移 upstream API 兼容性。创建 Halfcode track 前必须核对 `evolve-halfcode-non-frontend-dsl` 的实际状态；不得以本 mission 重写其已经确认的 DSL 语义。
