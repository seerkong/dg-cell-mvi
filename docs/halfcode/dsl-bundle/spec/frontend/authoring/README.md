# XNL Document Authoring Session

> 目录职责 · holds: runtime-only XNL Document authoring session 的 contract、runtime usage、identity、state machine 与 Document occurrence 绑定边界 · excludes: 新 Authoring DSL、Tiptap/Workbench/Agent 产品集成、Tiptap GetPut 与 XNL config 中的函数或权限 · tier: stable · ⬆from: `add-xnl-document-authoring-session` Track 的源码与测试证据 · ⬇to: Presenter、Workbench 与 Agent 后续 mission stages

This folder documents the implemented generic authoring owner between XNL
Projection and future Presenters. It is not a new XNL family. Authoring
capabilities are code/runtime-only; Scope binds the runtime object into the
Document occurrence runtime, while input, config, source, plan and proposal facts
remain data-only.

```text
Interaction or Agent intent
  -> immutable proposal data
  -> runtime-owned authoring session
  -> candidate + identity-aware mutations
  -> accepted live snapshot
  -> persistence feedback
```

## Reading Order

1. [contracts](contracts.md): data facts, public package surface and the
   `output = fn(runtime, input, config)` boundary.
2. [runtime](runtime.md): three usage tiers, runtime object binding and
   proposal/control/edit/view authority split.
3. [state machine](state-machine.md): accepted, candidate, live revision,
   persisted revision, receipt, conflict, failure, retry and reload behavior.
4. [identity](identity.md): `#id` tree alignment, `x-id` runtime addressing and
   why identity replacement is delete plus add.
5. [Document occurrence](document-occurrence.md): edit/view Scope binding,
   parent/child occurrence leases and persistence adapter ownership.
6. [boundaries](boundaries.md): implemented vs future mission stages and residue
   rules.

## Current Delivery

| Status | Capability |
|---|---|
| **CURRENT** | Generic authoring contracts, validators and public root exports in `dg-cell-mvi-halfcode-contract` |
| **CURRENT** | Pure `submitAuthoringEdit(runtime, input, config)` coordinator in `dg-cell-mvi-halfcode-logic` |
| **CURRENT** | support-layer xnl-core mutation adapter with `metadataIdMode: "identity"` |
| **CURRENT** | support-layer xnl-vfs revisioned persistence adapter |
| **CURRENT** | owner-local session factory with separated proposal and control ports |
| **CURRENT** | Document edit/view Scope authoring facets assembled through runtime-only capabilities |
| **CURRENT** | Projection normal render returns surface data; its separate edit-intent contract contains serializable proposal data without submit authority |
| **CURRENT IN TIPTAP PRESENTER TRACK** | Tiptap/ProseMirror direct model adapter、restricted NodeView 与 trusted edit-intent -> proposal-port bridge；见 [Tiptap Document Presenter](../tiptap-document/README.md) |
| **CURRENT IN TIPTAP PRESENTER TRACK** | Canonical Tiptap GetPut 与 accepted PutGet 已通过 package-level integration 验证 |
| **FUTURE / NOT IMPLEMENTED BY THIS TRACK** | Workbench product authoring UI or demo |
| **FUTURE / NOT IMPLEMENTED BY THIS TRACK** | Agent collaboration UI, CRDT/OT, realtime cursors or offline merge |
| **FUTURE / NOT IMPLEMENTED** | 通用 HTML import/export adapter 或 HTML round-trip 保真证明 |

## Invariants

- No `<Authoring>` XNL node, authoring domain file, config entry, registry entry
  or function field is introduced.
- Stable capabilities, writers, validators, persistence authorities and revision
  allocators live on the runtime object.
- Public processors keep the DEPA shape `output = fn(runtime, input, config)`.
- Edit Scopes see only a proposal facet; host code keeps factory/control.
- View Scopes have no writer, submit, session factory or control surface.
- A Presenter edit-intent is proposal data only. It does not contain the authoring
  proposal port or its `submit` method; an external owner must perform any future wiring.
- Accepted live state and persistence evidence are separate authorities.

Projection capability/return boundaries are documented in
[Presenter and Interaction](../xnl-projection/presenter-interaction.md). Existing
Document authoring assembly remains current; its Tiptap consumer wiring is now
documented separately in [Tiptap Document Presenter](../tiptap-document/README.md).
Workbench product/browser E2E and Agent collaboration remain future.
