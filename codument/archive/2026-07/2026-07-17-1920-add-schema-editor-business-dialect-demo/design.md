# Design: Scoped Business Property Reuse

## Target Shape

```text
shared StructureSchema
        |
        +---------------------------+
        |                           |
business A Scope               business B Scope
default dialect                default dialect
shared property dialect        shared property dialect
A bounded-context dialect      B bounded-context dialect
A presenter registry           B presenter registry
        |                           |
canonical editor A             canonical editor B
        |                           |
Session A -> ValueHost A        Session B -> ValueHost B
```

An optional editor-instance layer is appended to one branch and wins only in
that branch.

## Code And Data Split

Data:

- one reusable `StructureSchema` containing `user.phone`, address, reference,
  and enum semantics;
- optional `EditorPresentation` containing stable presenter ids and
  serializable options;
- compiler output, canonical source, commands, diagnostics, and snapshots.

Code:

- shared business classifier and transformer registry;
- business A and B bounded-context classifier/transformer layers;
- shared and bounded-context Vue presenter components;
- ValueHost implementations used by the demo runtime.

No code-side value enters schema, presentation, EditorPlan metadata, or
canonical XNL.

## Composition

Compiler layers use the existing fixed order:

```text
default -> shared property -> bounded context -> editor instance
```

Presenter registries use the same general-to-specific order and explicit
`last-wins`. Every factory creates a new frozen registry; there is no mutable
module singleton. Sibling A/B runtime instances share only immutable
definitions and reusable implementation factories, never Session state.

## Shared Property Capsule

The demo capsule exports stable ids and factory functions from one public
entry. Suggested capabilities:

- `business.user.phone` semantic transformer;
- `business.address` grouped property transformer/presenter;
- `business.entity-ref` reference presenter;
- `business.enum` enum presenter.

The shared capsule does not know business A or B. Each bounded context may
classify `user.phone` more specifically and select a context-owned presenter.

## Runtime Proof

Each demo must execute:

```text
compileEditorPlan
-> lowerEditorPlan
-> source resolver / canonical loader
-> Halfcode app runtime
-> CanonicalHalfcodeRenderer
-> schemaEditor.Editor
-> Scope Session
-> normalized presenter event
-> concrete SchemaEditorCommand
-> ValueHost result
-> accepted Session projection
```

Tests mount real presenter controls. They must show:

- accepted events update only their own editor;
- rejected, conflict, stale, delayed-after-dispose, and malformed feedback do
  not update visible accepted state;
- an editor-instance override affects one mounted editor only;
- shared address/ref/enum implementations are resolved by multiple editors.

## Iteration Boundary

If the demo exposes a generic limitation, the owning neutral package may be
iterated in this track only when:

1. the API remains generic and uses `fn(runtime, input, config)`;
2. a neutral owner test reproduces the limitation;
3. business knowledge stays in the demo capsule;
4. the package-root and writer-capability boundaries remain intact.

## Verification

- contract/compiler/public-surface RED and owner tests;
- canonical mounted A/B interaction tests;
- sibling Scope and registry identity/isolation tests;
- package typecheck and build;
- source scans for business leakage and host-writer capability;
- strict Codument validation;
- fresh read-only verifier.

