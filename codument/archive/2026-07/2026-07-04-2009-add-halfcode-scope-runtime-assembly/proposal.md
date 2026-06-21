# Proposal: add halfcode scope runtime assembly

## Goal

Create the first executable halfcode runtime layer: resolve RuntimeInstance code symbols, create or derive runtime objects, and bind scopes to runtime objects.

## Scope

- Add a support-layer runtime assembly module.
- Resolve `src`, `create`, and `derive` through an injected symbol resolver.
- Build runtime instances in declaration order.
- Bind `Scope.runtime` refs to runtime objects.
- Pass assembly input and config as `output = fn(runtime, input, config)`.
- Report runtime diagnostics without throwing for recoverable assembly failures.

## Out of Scope

- Real file-system dynamic import implementation.
- Intent handler invocation.
- Effect/data-graph materialization.
- New manifest loader.

## Success

- Tests prove `create` receives `(hostRuntime, assembly, config)`.
- Tests prove `derive` receives `(prototypeRuntime, assembly, config)`.
- Tests prove `Scope.runtime` can call `bindScope` or fall back to the referenced object.
- Missing prototype/code/protocol failures emit runtime diagnostics.
