# Change: Add Flow Structure Authoring

## Context And Why

Workbench can edit flow-level and node-level configuration through the
schema-driven Halfcode Editor, but its canvas structure operations remain an
older command surface. The shared toolbar can add a node at root, after a
selected node, or as a generic child, and edges can be connected separately.
It does not expose the domain position represented by a CtrlFlow branch port,
a CtrlFlow next outlet, a DAG data output, or a DAG completion dependency.

As a result, a user cannot reliably answer basic authoring questions from the
canvas: add a node after this control node, add a node inside this branch, bind
a newly created DAG node to this output, or remove a node while preserving the
flow's valid structure.

This track completes mission group G6 by treating those positions as
adapter-projected authoring facts. The visual shell renders them but does not
interpret Flow grammar. A product adapter compiles one opaque action reference
and one requested node draft into one semantic command and one exact
`XnlMutation[]` batch.

## Goals

- Project stable, renderer-neutral structure action references from CtrlFlow
  and DAGFlow adapters.
- Add nodes from root, CtrlFlow next, CtrlFlow branch body, DAG data output,
  and DAG completion positions.
- Collect node kind, id, and schema-driven initial configuration before the
  semantic command is committed.
- Remove nodes with product-owned validation and explicit sequence, subtree,
  dependency, and reference-cleanup semantics.
- Keep one-way ownership:
  canonical XNL -> adapter projection -> visual event -> MVI command ->
  adapter candidate -> exact mutation dry-run -> canonical validation ->
  VFS commit -> canonical reprojection.
- Verify InstantFlow, WorkFlow, BizProcess, and EagerDataFlow through visible
  browser controls and seeded chaos.

## Non-Goals

- Executing any Flow runtime.
- Making VisualGraph understand CtrlFlow branches, DAG ports, XNL, or VFS.
- Persisting a provisional graph before node configuration is accepted.
- Implementing insertion as independently committed `node.add` and
  `edge.connect` operations.
- Adding compatibility paths for the old placement command.
- Unifying CtrlFlow sequence semantics with DAG dependency semantics.

## Impact

- New capability: `workbench-flow-structure-authoring`.
- Mission: `build-schema-driven-halfcode-editor`, group G6.
- Consumer packages:
  - `frontend/packages/visual-graph/`
  - `frontend/packages/bastard/src/flow-editor-domains/`
  - `frontend/packages/bastard/src/flow-editor-layout/`
  - `frontend/packages/bastard/src/flow-editor-mvi/`
- Tests:
  - `frontend/packages/bastard/tests/`
  - `frontend/packages/bastard/tests/e2e/`

