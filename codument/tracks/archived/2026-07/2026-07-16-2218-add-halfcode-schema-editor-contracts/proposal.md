# Change: Add Schema-driven Halfcode Editor Contracts

## Context And Why

The current canonical Halfcode renderer can display generated configuration forms, but the schema projection lacks a reusable contract for recursive collections, maps, unions, business semantic classification, presentation overrides, and host-owned edits. Real Flow definitions therefore fall back to JSON-oriented inputs and cannot provide complete, discoverable authoring for structures such as conditional branches.

This track establishes the data and protocol foundation in `dg-cell-mvi-halfcode-contract`. Later tracks will implement the compiler, runtime/lowering, presenters, and Workbench migration against these contracts.

## Goals / Non-Goals

**Goals:**

- Define generic serializable `StructureSchema` nodes for scalar, object, array, map, union, and ref structures with semantic annotations.
- Define pure-data `EditorPresentation` overlays using stable presenter ids and serializable options.
- Define the code-side `SchemaEditorDialect` route exactly as `classify` plus `transformers`, with recursive compile runtime protocols using `output = fn(runtime, input, config)`.
- Define renderer-neutral `EditorPlan`, stable value paths, templates, bindings, diagnostics, and provenance.
- Define structured edit Commands for value, collection, map, and union operations.
- Add pure validators and dependency-boundary tests.
- Document schema-only, schema plus presentation, and custom dialect/full editor usage tiers.

**Non-goals:**

- Do not implement recursive compilation or transformer dispatch.
- Do not lower an EditorPlan to a Halfcode App Bundle.
- Do not implement Vue or Element Plus presenters.
- Do not implement ValueHost, XNL mutation, VFS persistence, or Flow-specific behavior.
- Do not add an implicit JSON textarea fallback.

## What Changes

- Add a `schema-editor` capsule to `packages/dg-cell-mvi-halfcode-contract/src/`.
- Export its public types and pure validation entry points from the package root.
- Add contract, serializability, and dependency-boundary tests.
- Add Schema Editor contract documentation under `docs/halfcode/dsl-bundle/spec/frontend/schema-editor/`.

## Impact

- Capability: `halfcode-schema-editor-contracts`.
- Direct package: `dg-cell-mvi-halfcode-contract`.
- Downstream consumers: schema editor compiler, canonical Halfcode lowering/runtime, default presenter adapters, and Workbench Flow Editor.
