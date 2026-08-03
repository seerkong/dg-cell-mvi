# Design: Sequential Accepted RichDocument Edits

## Authority Model

```text
accepted RichDocument(n)
  -> project / normalize Interaction(n+1)
  -> canonical translate exactly once
  -> semantic candidate materialize exactly once
  -> host identity allocation
  -> concrete XNL materialize
  -> accepted-first authoring submit using live revision(n)
  -> accepted RichDocument(n+1)
```

The next invocation restarts from `accepted RichDocument(n+1)`. No processor may
retain the previous accepted tree as hidden authority. Tiptap state remains a local
projection and catches up only from accepted feedback.

## Diagnostic Split

The red baseline records the exact output at each processor boundary:

1. projection and transaction normalization;
2. canonical Interaction translation;
3. semantic candidate materialization;
4. identity classification/allocation;
5. concrete XNL materialization and proposal submission.

The production host may keep a stable public rejection code, but tests must retain
enough structured evidence to identify the owner stage. A generic final diagnostic
alone is not accepted as root-cause proof.

## Correction Rule

Fix the first owner boundary whose output is inconsistent with the latest accepted
baseline. Do not compensate downstream, relax stale checks, or copy semantic logic
into Workbench. Existing `#id` remains structural identity and is never compared as
ordinary payload.

## Verification Matrix

- direct package-root trusted-host sequence: text then text;
- direct sequence with mark or structural edit after an accepted text edit;
- real package-root EditorState-bound local draft: two transactions, two Effects;
- accepted reproject between transactions, preserving schema/plugin lineage;
- stale/malformed second command still fails atomically with Effect/submit counts
  unchanged;
- Workbench browser sequence on desktop and narrow viewport.

## Canonical Mark Ordering Correction

Workbench cross-repository validation exposed a second exact-before mismatch after
the table-span correction. ProseMirror stores marks in schema-rank order, while
RichDocument defines its canonical order through `XNL_RICH_DOCUMENT_MARK_KINDS`.
Transaction semantic snapshots must convert marks into the RichDocument order before
emitting `beforeInlineRuns` and `afterInlineRuns`; the product fixture must not be
rewritten to match an adapter-internal ordering.
