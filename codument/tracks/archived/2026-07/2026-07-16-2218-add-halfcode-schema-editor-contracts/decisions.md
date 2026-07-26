# Track Decisions

## D1 - Pure data declarations

`StructureSchema`, `EditorPresentation`, and `EditorPlan` contain only serializable data. They do not hold functions, component constructors, closures, runtime instances, or persistence adapters.

## D2 - Code-side dialect protocol

`SchemaEditorDialect` describes a TypeScript protocol with the exact code vocabulary `classify` plus `transformers`. Fixed resolution precedence belongs to the base compiler policy; the public dialect surface does not include `resolver`, `registry`, `classifier`, or caller `resolutionPrecedence` compatibility fields. Canonical Halfcode data may reference a stable dialect or presenter id, but never embeds its implementation.

## D3 - Renderer-neutral plan

`EditorPlan` models groups, fields, collections, maps, unions, custom presenters, diagnostics, provenance, and command bindings without importing a frontend framework.

## D4 - Host-owned writes

The contract defines structured edit Commands. Applying them, validating host constraints, producing XNL mutations, and persisting snapshots remain outside the contract package.

## D5 - Explicit raw editing only

Unknown structures produce diagnostics. A raw JSON/code presenter is legal only when explicitly selected by schema format or presentation.
