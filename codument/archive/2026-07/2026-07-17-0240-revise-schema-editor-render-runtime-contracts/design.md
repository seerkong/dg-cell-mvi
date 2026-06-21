# Design

## Boundary

```text
StructureSchema + normalized EditorPresentation + scoped Dialect
                         |
                         v
                 compileEditorPlan
                         |
                         v
          serializable renderer-neutral EditorPlan
```

The plan is complete input for a renderer. It contains no component, callback, runtime instance, value snapshot, writer or persistence adapter.

## Typed Plan Metadata

Use explicit typed records rather than an unbounded `metadata: SerializableRecord` escape hatch. The exact TypeScript names may follow local conventions, but the public contract must distinguish:

- common field/display facts: label, description, required, visible, readOnly, group and normalized constraints/annotations;
- scalar facts: scalar kind, enum values, const and serializable default;
- collection facts: item default and stable identity hint with an explicit fallback strategy;
- map facts: key schema facts and value default where available;
- union facts: discriminator and ordered alternative descriptors carrying stable id, label, description and optional initial value;
- ref facts: stable ref identity.

Kind-specific facts belong on the corresponding plan node. A renderer must not need to cast an arbitrary record to discover whether `enum`, `discriminator` or `ref` exists.

## Defaults And Identity

Defaults are data, not factories. A schema may provide a serializable default for a node or collection item. The plan copies that data without executing it.

Collection identity is a hint for rendering and reconciliation. It may identify a property path when the domain provides one; otherwise the plan records an explicit fallback strategy. Runtime/session code may later allocate ephemeral render identities, but this compiler does not own them.

Ref metadata is also declarative. The compiler preserves the stable ref string and does not resolve, fetch or recursively expand it. Unresolved and cyclic refs therefore remain finite plan facts; a later scoped resolver/presenter may handle them without changing this compiler's ownership.

## Presentation Normalization

The compiler normalizes root path-targeted overlays into recursive overlays before classification and recursive compilation.

Precedence is deterministic:

1. inherited/root presentation data;
2. recursive child/item/value/alternative overlay;
3. matching path-targeted overlays in declaration order, with later entries winning per defined field.

Merging is structural: unspecified fields survive, nested overlay records merge recursively, and a presenter selected by a later overlay replaces the earlier presenter as one coherent reference. Wildcard templates remain available for array/map paths. Normalization produces serializable data and no callable resolver.

## Compiler Propagation

Recursive compilation supplies typed, serializable inherited context through `EditorCompilerInput`: field context carries key/required/label/description, while identity scope keeps anonymous node ids unique without changing `ValuePath`. Both are public Data so default and custom transformers can construct equivalent child inputs; neither is a callback or resolver. Public caller config remains serializable business options and does not gain dialect/resolver ownership.

Every child still compiles through `runtime.compile`. A custom transformer receives normalized presentation and enough inherited field context to produce the same contract, while fixed selection remains compiler-owned.

Default scalar presenter selection recognizes enum/const before format/scalar fallbacks. Unsupported kinds still produce diagnostics rather than implicit raw presenters.

## Validation

Validators SHALL:

- reject metadata whose shape conflicts with the plan node kind;
- reject non-serializable defaults, presenter/component/functions and malformed identity paths;
- validate unique ordered union alternative ids and valid defaults where mechanically checkable;
- keep unresolved or cyclic refs finite and observable instead of recursively resolving them;
- preserve the current no-implicit-raw policy;
- accept wildcard template paths without treating template nodes as current snapshot children.

## Package Ownership

- contract: public data types and validators;
- logic: normalization and compiler propagation;
- docs/tests: contract truth and observable behavior;
- later tracks: runtime/session, Vue rendering, Element Plus adapters and host mutation.
