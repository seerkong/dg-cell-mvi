# Change: Add Recursive Schema Editor Compiler

## Context And Why

The completed contracts track defines schema, presentation, dialect, plan, and edit-request boundaries but intentionally does not compile them. This track implements the pure recursive compiler in `dg-cell-mvi-halfcode-logic` and feeds any real contract insufficiency back into the contract package.

The mission's first feedback correction is already applied: a dialect contains functions, so it is a runtime dependency rather than compile config. The compiler must preserve that ownership while supporting scoped business overrides.

## Goals / Non-Goals

**Goals:**

- Implement runtime-first `compileEditorPlan` and recursive node compilation.
- Implement default structural compilation for scalar, object, array, map, union, and ref schemas.
- Preserve recursive presentation overlays, value paths, templates, diagnostics, and provenance.
- Implement fixed selection order: explicit presenter, scoped semantic, format, structural kind, unsupported.
- Compose default/shared/context/instance dialect layers deterministically.
- Prove the same semantic type can select different transformers in independent runtimes.
- Refine EditorPlan command binding into a neutral event-time command template if collection compilation requires it.

**Non-goals:**

- No EditorPlan-to-Halfcode lowering.
- No Vue/Element Plus presenter implementation.
- No Scope DSL parsing or Halfcode runtime object assembly outside the compiler-specific runtime factory.
- No ValueHost, host mutation application, XNL/VFS/database write, or Flow-specific schema.
- No implicit raw JSON fallback or resolver/registry compatibility surface.

## What Changes

- Add `src/schema-editor/` compiler capsule and package-root export in `dg-cell-mvi-halfcode-logic`.
- Add focused recursive/compiler/dialect composition tests and dependency boundaries.
- Refine the contract plan command-binding shape only if compiler red tests demonstrate the need.
- Update Schema Editor docs with compiler status and code API after implementation.

## Impact

- Capability: `halfcode-schema-editor-compiler`.
- Direct packages: `dg-cell-mvi-halfcode-logic`; narrow feedback edits may touch `dg-cell-mvi-halfcode-contract`.
- Downstream: schema editor lowering/runtime and Workbench Flow Editor migration.
