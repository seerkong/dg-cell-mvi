# Proposal: Fix RichDocument Sequential Semantic Materialization

## Problem

The package-root RichDocument authoring chain accepts one canonical semantic edit,
but rejects a second edit built from the latest accepted RichDocument with
`XNL_RICH_DOCUMENT_MATERIALIZATION_REJECTED`. The failure reproduces without the
Workbench Editor subscriber, pending-operation UI, HTML, DOM, or `document.replace`.

This breaks the accepted-first PutGet contract: a successful proposal changes the
next accepted baseline, and the next valid semantic command must be evaluated against
that new baseline rather than against stale materializer, identity, or concrete-XNL
facts.

## Goal

Make consecutive package-root RichDocument semantic edits work against each latest
accepted baseline through both the direct trusted-host chain and a real
EditorState-bound Tiptap local draft, while preserving exact-once translation,
materialization, allocation, submission-time revision, and authority boundaries.

## In Scope

- A foundation-owned two-edit red reproduction using canonical fixtures.
- Stage-specific diagnostics that identify whether rejection occurs in translation,
  semantic planning, identity allocation, concrete XNL materialization, or authoring.
- The minimal owner-side correction in contract, logic, support, or the Tiptap adapter.
- Regression coverage for sequential text edits and representative structural/mark
  edits against the latest accepted document.
- Workbench focused and real Chromium downstream gates.

## Out Of Scope

- Workbench-private semantic edit application or writer protocols.
- Transaction replay, `getJSON`, HTML/DOM reverse authoring, or `document.replace`
  fallback.
- Component/Capsule NodeView product integration.
- New persistence, VFS/VCS, revision, or Editor controller authority in foundation.

## Success Criteria

- Two valid semantic edits, each projected and normalized from the latest accepted
  RichDocument, are accepted in order and advance live truth twice.
- A real bound Editor performs two sequential transactions and publishes one
  revision-free Interaction per transaction without schema or stale-baseline failure.
- Stable existing identities remain stable; new/copy/replacement identities are
  allocated only by the existing host owner.
- Adapter/foundation full tests, typechecks, package-root smoke, Workbench focused
  tests/build, and real Chromium programmable-document E2E pass.
