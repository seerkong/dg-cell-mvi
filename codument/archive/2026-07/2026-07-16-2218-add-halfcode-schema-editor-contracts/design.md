# Design: Schema-driven Halfcode Editor Contracts

## Capsule Boundary

```text
schema-editor/
  schema.ts        StructureSchema and semantic annotations
  presentation.ts  pure-data EditorPresentation overlays
  plan.ts          renderer-neutral EditorPlan IR
  commands.ts      structured edit Commands
  dialect.ts       code-side processor protocols
  validation.ts    pure contract validators
  index.ts         sole public capsule entry
```

The capsule imports only canonical serializable primitives from the contract package. It exposes no framework, DOM, VFS, XNL mutation, or runtime implementation dependency.

## StructureSchema

Every node has a stable `kind`, optional identity/label/description, constraints, annotations, and semantic descriptors. Structural kinds are:

- scalar: string, number, integer, boolean, null, and enum-compatible literals;
- object: named fields, required fields, and explicit additional-property policy;
- array: one recursive item schema plus collection constraints;
- map: key constraints plus one recursive value schema;
- union: alternatives with an optional discriminator;
- ref: stable schema reference plus optional local semantic overlay.

Business meaning is expressed by serializable annotations such as `semanticType`, `format`, and tags. It does not select a component implementation.

## EditorPresentation

Presentation is an optional recursive overlay. It can select a stable presenter id, serializable options, ordering, grouping, visibility/read-only policy, and child/item/value/alternative overlays. A path-targeted overlay form supports sparse customization without duplicating the schema.

Presentation must reject functions, component constructors, runtime objects, and implementation imports. Raw JSON/code editing is an explicit presenter choice only.

## Dialect Processor Protocol

`SchemaEditorDialect` exposes one approved code vocabulary: `classify` plus `transformers`. These processor contracts follow:

```ts
output = fn(runtime, input, config)
```

The compile runtime exposes a `compile` message for recursive child compilation. A transformer never receives an ad-hoc fourth callback. `SchemaEditorDialect` does not expose public `resolver`, `registry`, `classifier`, or caller `resolutionPrecedence` compatibility fields; scoped runtime assembly and transformer selection are deferred to later tracks.

Resolution precedence is fixed base compiler policy:

```text
presentation presenter
> scoped business semantic binding
> schema format binding
> structural kind binding
> unsupported diagnostic
```

## EditorPlan

The IR contains group, field, collection, map, union, and custom-presenter nodes. Each node carries a stable id/path, presenter id/options, value and validation bindings, command bindings, diagnostics, and schema/presentation provenance.

Collections and maps carry recursive item/value templates. The plan is not expanded only from the current snapshot, so insertion can instantiate the same template for new values.

## Edit Commands

The closed command family begins with:

```text
value.set
collection.insert
collection.remove
collection.move
map.set
map.remove
map.rename-key
union.select
```

Commands identify target paths and serializable payloads. They do not include an apply function or persistence effect. Hosts may translate them to XNL mutations, domain commands, database mutations, or signal updates.

## Validation

Pure validators enforce:

- known structural kinds and required child schemas;
- stable ids/paths and unique object fields/union alternatives;
- serializable schema, presentation, plan, options, and command payloads;
- no executable values or component implementations in data contracts;
- collection/map templates and command binding consistency;
- explicit raw presenter selection and diagnostics for unsupported structures.

## Three Usage Tiers

1. Schema only: a later default dialect derives the editor.
2. Schema plus presentation: sparse overlays refine layout and presenter selection.
3. Custom dialect/full editor: business classification and transformer bindings are supplied as TypeScript code while preserving plan and host command boundaries.

## Risks

- Overly broad schema vocabulary could duplicate external schema standards. Mitigation: keep the MVP structural and adapter-friendly rather than model every validation keyword.
- Plan types could leak renderer details. Mitigation: dependency tests and stable symbolic presenter ids.
- Commands could become a second persistence owner. Mitigation: contracts contain requested edits only; host feedback and accepted snapshots remain outside this track.
