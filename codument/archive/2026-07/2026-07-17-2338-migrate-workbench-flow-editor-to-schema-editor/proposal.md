# Change: Migrate Workbench Flow Editor To Schema Editor

## Context And Why

The generic schema-driven Halfcode Editor foundation is complete: recursive
`StructureSchema`, optional `EditorPresentation`, scoped business dialects,
renderer-neutral `EditorPlan`, canonical lowering, revision-gated
`SchemaEditorSession`, Vue recursion, and Element Plus presenters all exist and
have passed independent lifecycle verification.

Workbench still uses a predecessor path. Its `halfcode-node-editor` manually
projects legacy `NodeSchema` into a loaded canonical bundle, owns separate field
commands and runtime state, and defaults arrays, free-form objects, and many
structured values to JSON textareas. That path cannot provide discoverable
typed editing for Flow structures and would become a second renderer/runtime if
the new foundation were merely added beside it.

Mission task `build-schema-driven-halfcode-editor/G4-T1` therefore requires a
breaking consumer migration: Workbench must own Flow-specific
schema/presentation/dialect and ValueHost translation while using the one
generic compiler, lowering, Session, renderer, and Element Plus presenter
lifecycle.

## Goals / Non-Goals

**Goals:**

- Replace Workbench's hand-written `NodeSchema` bundle/runtime with
  `StructureSchema -> EditorPresentation -> compileEditorPlan ->
  lowerEditorPlan -> SchemaEditorSession -> CanonicalHalfcodeRenderer`.
- Support both flow-level and node-level configuration through one Workbench
  schema-editor capsule and optional product-owned presentation overlays.
- Keep Flow classifiers, transformers, business presenters, target resolution,
  and ValueHost translation inside Workbench capsule boundaries.
- Provide typed, discoverable controls for nested structures, refs, maps,
  collections, and product alternatives without implicit JSON textareas.
- Make `If.branches` and `Fallback.strategies` fully addable, removable,
  editable, and reorderable, with committed order reflected in CtrlFlow ports.
- Make EagerDataFlow inputs, outputs, waitFor, implementation refs, flow refs,
  and config discoverable and structurally typed.
- Preserve the existing product capsule to `XnlMutation[]` to exact-batch
  dry-run to canonical validation to VFS persistence ownership chain.
- Advance Session state only after accepted VFS feedback and canonical
  reprojection; preserve the prior accepted snapshot on rejection or conflict.
- Prove all four products persist and reload through the canonical loader
  without changing CtrlFlow or DAGFlow canvas layout behavior.

**Non-Goals:**

- Changing generic schema-editor contracts or adding Flow special cases to
  `dg-cell-mvi` packages unless a verified G4 blocker requires a separate owner
  track.
- Replacing the existing Flow capsule, XNL mutation, VFS, or VCS owners.
- Restoring the removed legacy renderers or
  direct Vue form state.
- Adding a compatibility renderer or retaining the old bundle/runtime as a
  fallback.
- Treating raw JSON as the default representation for an unknown or structured
  field.
- Changing Flow execution semantics or unifying CtrlFlow and DAGFlow canvas
  models.

## What Changes

- **BREAKING:** retire legacy Workbench `NodeSchema` as the renderer-facing
  authoring contract and remove the bespoke field bundle, command handlers,
  runtime/session, JSON textarea control, and reorder component.
- Add a Workbench Flow schema-editor capsule whose public API projects
  flow-level or node-level editor targets containing `StructureSchema`,
  optional `EditorPresentation`, stable target identity, and accepted value.
- Migrate product adapter authoring facts to `StructureSchema` and product
  presentation overlays; remove or quarantine `NodeSchema` once no active
  consumer remains.
- Add Workbench business dialect and presenter-registry composition for typed
  Flow refs and any explicit advanced raw/code presenters.
- Add a Workbench Flow ValueHost that applies concrete
  `SchemaEditorCommand`s through existing product adapter commands and semantic
  persistence feedback.
- Replace right-panel session assembly with compiler, lowering, canonical
  loader/runtime, Scope capability, Session, and Element Plus canonical
  registry assembly.
- Extend product contracts and UI state so the same panel can edit canonical
  flow-level facts as well as selected node config.
- Expand unit, browser, and chaos coverage to assert real typed controls,
  structural operations, exact mutation ownership, reload, and layout
  isolation.
- Update owner schema-editor documentation and Workbench implementation
  documentation to describe the completed G4 integration and extension points.

## Impact

- Affected capability: `workbench-flow-schema-editor`.
- Owner planning and documentation:
  - `codument/tracks/migrate-workbench-flow-editor-to-schema-editor/`
  - `docs/halfcode/dsl-bundle/spec/frontend/schema-editor/`
- Consumer code:
  - `frontend/packages/bastard/src/flow-editor-domains/capsules/`
  - `frontend/packages/bastard/src/flow-editor-layout/`
  - `frontend/packages/bastard/src/flow-editor-mvi/`
  - `frontend/packages/bastard/src/flow-editor-domains/`
- Consumer tests:
  - `frontend/packages/bastard/tests/`
  - `frontend/packages/bastard/tests/e2e/`
- Existing canonical Flow XNL formats and canvas adapters remain compatible;
  the renderer-facing legacy `NodeSchema` and bespoke editor runtime do not.
