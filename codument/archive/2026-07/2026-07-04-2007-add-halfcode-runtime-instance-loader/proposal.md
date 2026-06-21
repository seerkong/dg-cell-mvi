# Proposal: add halfcode runtime instance loader

## Goal

Teach the v3 unit bundle loader to project runtime-domain declarations and scope runtime bindings into structured data.

## Why

The runtime object system is code-first, but the runner still needs a parse-only graph:

- which `RuntimeInstance #id` exists in a unit;
- whether it uses `src`, `create`, or `prototype`/`derive`;
- which `Scope #id` binds to which runtime instance;
- which refs should be checked by the existing unified ref resolver.

This track does not execute runtime code. It creates the loader contract needed by later assembly/execution tracks.

## Scope

- Add loader output fields for parsed `RuntimeSpec` and `RuntimeScopeBindingSpec`.
- Parse `<Runtime>` / `<RuntimeInstance>` domain documents.
- Parse `<Scopes>` entries for `runtime`, `config`, and `intents` bindings.
- Extend ref collection to dotted schemes.
- Add support tests using an in-memory runtime fixture.

## Out of Scope

- Dynamic import of `vfs://...#symbol`.
- Runtime object creation/derivation.
- Effect/data graph binding materialization.
- New `FrontendApp` manifest loader.

## Success

- A unit with a runtime domain exposes `unit.runtime.instances`.
- A unit with scope runtime fields exposes `unit.scopeRuntimeBindings`.
- `runtime://#...` refs are checked by loader diagnostics.
- Existing support and contract tests still pass.
