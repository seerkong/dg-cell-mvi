# Track Decisions

## D1 - Runtime-owned dialect

`compileEditorPlan(runtime, input, config)` reads the composed dialect from runtime. Config is serializable and does not carry processors.

## D2 - One extension route

Dialect code exposes only `classify` and `transformers`. Transformer selection is internal base compiler logic with fixed precedence.

## D3 - Recursive runtime message

Object, array, map, and union transformers compile children through `runtime.compile`. No fourth callback is accepted.

## D4 - Ordered composition

Dialect layers compose in default, shared, bounded-context, editor-instance order; later matching transformer keys override earlier keys without mutating source dialects.

## D5 - Contract feedback is allowed

If red tests prove concrete Commands cannot represent event-time collection bindings, this track refines the neutral contract to command templates before implementing compiler output. It does not introduce renderer or host writer behavior.
