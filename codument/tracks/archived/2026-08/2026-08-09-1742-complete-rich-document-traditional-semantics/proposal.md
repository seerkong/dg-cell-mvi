# 变更：补齐 RichDocument 传统文档语义

## 背景和动机

当前 renderer-neutral RichDocument 只覆盖首批 canonical block/mark family。传统在线
文档需要的 underline、alignment、color/highlight、task list、horizontal rule 和
hard break 仍只存在于旧 HTML-first Tiptap 实现素材中，无法通过 Domain XNL、
semantic command 和 mutation authoring 无损保存。

## 目标

- 在 contract 中定义新增 canonical node、mark、attribute 和校验边界。
- 扩展 neutral lower/parse、candidate materializer、semantic translator 和 identity
  处理，使新增语义可组合、可复制、可移动、可校验。
- 扩展 support-owned XNL adapter，使领域 XNL 能稳定 round-trip 并产生可读 mutation。
- 保持 code block 的 durable fact 为 `language? + text`；fold/copy/highlight UI 留给
  后续 Presenter track。
- 用 positive/negative fixtures、GetPut/PutGet 前置规律、property 和 package boundary
  测试锁定行为。

## 非目标

- 本 track 不新增 Tiptap/Vue extensions、工具栏或产品 UI。
- 不迁移旧 capsule 的 DOM/HTML authoring 实现。
- 不增加 Component/Capsule 插入、VCS checkout 或 Agent 产品能力。

## 影响范围

- `dg-cell-mvi-halfcode-contract`：RichDocument public model/semantic contract。
- `dg-cell-mvi-halfcode-logic`：pure normalization/lower/parse/materialization/translation。
- `dg-cell-mvi-halfcode-support`：concrete XNL adapter 与 authoring bridge fixtures。
- `docs/halfcode/dsl-bundle/spec/frontend/tiptap-document/`：canonical 领域语义文档。

## 成功标准

- 所有新增语义均可序列化、深冻结、校验并从 package root 使用。
- 无编辑 round-trip 不丢失 mark、alignment、checked、颜色、rule/break 或 identity。
- semantic edit/candidate 能原子表达新增语义且无 partial apply。
- neutral packages 仍不依赖 Tiptap、Vue、DOM 或 HTML。

