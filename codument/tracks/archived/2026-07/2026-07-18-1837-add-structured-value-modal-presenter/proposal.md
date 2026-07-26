# Change: Add Dual-Mode Structured Value Modal Presenter

## Context And Why

The Schema Editor can model recursive serializable data, but an entry-by-entry structural map is not sufficient for arbitrary JSON. Users need visual node editing and direct JSON paste without creating a second accepted-state writer.

## Goals / Non-Goals

**Goals:**

- Add explicit stable presenter `structured-value.modal`.
- Provide vanilla-jsoneditor Visual and Monaco JSON tabs over one local draft.
- Emit one normalized value change only on Apply.
- Validate JSON, serializability, options, and object-root constraints.
- Dynamically load and dispose both editor engines.

**Non-Goals:**

- Implicitly replacing known structural maps.
- Owning host persistence or accepted data.
- Depending on Workbench, Flow, VFS, XNL, or a Workbench Monaco wrapper.
- Falling back to a textarea when an engine fails.

## What Changes

- `dg-cell-mvi-halfcode-element-plus` directly depends on `vanilla-jsoneditor` and `monaco-editor`.
- Its Schema Editor capsule adds the presenter implementation and default registry entry.
- Tests cover modal draft lifecycle, tab synchronization, validation, fail-closed diagnostics, and disposal.
- Existing Element Plus presenter ownership behavior and scans are revised narrowly to permit the two declared UI engines only inside structured-value internals.
- `bun.lock` and `pnpm-lock.yaml` remain aligned with package dependencies.

## Impact

- Behaviors: `halfcode-schema-editor-structured-value`, `halfcode-schema-editor-element-plus-presenters`.
- Code: Element Plus Schema Editor presenter capsule and tests.
- Public consumption remains through package-root registry factories.
