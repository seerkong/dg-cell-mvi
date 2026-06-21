# Proposal: add halfcode runtime dynamic execution

## Goal

Add a small executable code-entry helper for halfcode dynamic code:

- `output = fn(runtime, input, config)`
- `output = fn(runtime, instanceRefs, input, config)`

## Scope

- Resolve a code entry through an injected resolver.
- Validate that the resolved symbol is callable.
- Call with the correct DEPA argument shape.
- Return output plus runtime diagnostics.
- Export the helper from the support package.

## Out of Scope

- Intent routing DSL.
- Effect binding registry.
- Data graph node scheduling.
- Real TypeScript transpilation or dynamic import policy.

## Success

- Tests cover normal handler execution.
- Tests cover instanceRefs execution.
- Tests cover protocol mismatch and thrown errors.
