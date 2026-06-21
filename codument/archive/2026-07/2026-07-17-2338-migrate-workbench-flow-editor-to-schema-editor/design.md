# Design

## Context

The reusable Schema Editor stack is already implemented and independently
verified. The remaining work is consumer composition and domain adaptation.
Workbench currently has the right persistence owner but the wrong editor
projection: product adapters expose legacy `NodeSchema`, and the right panel
uses a bespoke loaded bundle and field runtime that defaults structured values
to JSON text.

This design replaces that entire projection/runtime while preserving Workbench
as the owner of Flow grammar and persistence effects.

## Target Data Lineage

```text
canonical Flow XNL
  -> canonical Flow loader
  -> product capsule projection
  -> FlowEditorTarget {
       targetIdentity,
       schema: StructureSchema,
       presentation?: EditorPresentation,
       acceptedSnapshot
     }
  -> compileEditorPlan
  -> EditorPlan
  -> lowerEditorPlan
  -> canonical schemaEditor.Editor source bundle
  -> canonical loader/compiler/app runtime
  -> CanonicalHalfcodeRenderer
  -> normalized event
  -> SchemaEditorCommand
  -> SchemaEditorSession
  -> Workbench Flow ValueHost
  -> product capsule Flow command
  -> XnlMutation[] exact batch
  -> dry-run + canonical validation
  -> VFS commit feedback
  -> accepted canonical reprojection + revision
```

The renderer sees only `EditorPlan`, accepted value projection, presenter
registry, pending state, diagnostics, and normalized event callback. It never
receives the ValueHost, Flow adapter, XNL writer, VFS client, or product
runtime.

## Processing Shape

Data and processors remain separate.

| Processor | Input Data | Output Data |
|---|---|---|
| `projectFlowEditorTarget` | canonical product projection plus selected flow/node identity | schema, presentation, value, revision, target identity |
| `compileFlowEditorPlan` | compiler runtime plus target schema/presentation | validated `EditorPlan` |
| `lowerFlowEditorPlan` | plan plus stable unit/scope/host/session ids | deterministic canonical source bundle |
| `assembleFlowSchemaEditorRuntime` | source bundle plus Scope capabilities and component registry | canonical app runtime and disposable editor session |
| `applyFlowSchemaEditorCommand` | captured target, expected revision, concrete command | accepted, rejected, or conflict host result |
| `projectAcceptedFlowSnapshot` | committed canonical reload and target identity | next immutable value and opaque revision |

Each processor follows `output = fn(runtime, input, config)`. Stable dialects,
presenter registries, Flow adapters, and persistence ports belong in runtime;
the current command and target are input; static ids and policies are config.

## Workbench Capsule Ownership

Add one Workbench capsule with a single public entry and hidden internals. Its
public contract should expose:

- flow and node editor target projection;
- compiler runtime composition using the default dialect plus ordered
  Workbench business dialects;
- optional product `EditorPresentation`;
- business presenter registry composition;
- ValueHost factory bound to a captured product/flow/target identity;
- session/runtime lifecycle assembly and disposal.

The capsule may import only package-root schema-editor APIs. Generic
`dg-cell-mvi` packages must not import this capsule or learn Flow concepts.
Other Workbench modules must not deep-import capsule internals.

## Schema And Presentation Migration

`FlowProductAuthoringContract` changes from a renderer-facing `NodeSchema`
method to product-owned schema/presentation projection:

- `schema(target)` returns recursive `StructureSchema`.
- `presentation(target)` is optional and returns only serializable overlay
  data.
- flow-level and node-level targets share a discriminated target identity.
- defaults, projection, validation, and derived/read-only facts remain owned by
  the concrete product adapter.

Legacy field mappings converge as follows:

| Legacy field | Target schema/presentation |
|---|---|
| string | scalar string, optional semantic format or ref annotation |
| number | scalar number/integer with constraints |
| boolean | scalar boolean |
| structured object | object fields, recursively compiled |
| free-form object | map with string key and declared value schema |
| array | array item schema, item default, identity, recursive list presenter |
| code/ref | scalar or ref schema with business semantic type; raw/code presenter only when explicitly selected |

`NodeSchema`, `FieldSchema`, field descriptors, manual bundle construction,
manual field command constants, `FlowNodeEditorInput`, `VueDraggable` reorder
UI, and JSON coercion are removed when their target replacements are green.
No converter from new schema back to `NodeSchema` is retained.

## Business Dialect And Presenters

Workbench composes:

```text
schema-editor.default
-> workbench.flow.shared
-> product family
-> concrete product
-> editor instance
```

Later layers may classify semantic types such as code ref, flow ref, node ref,
port ref, task-space ref, predicate ref, or arbitrary Flow config. Selection
precedence remains owned by the base compiler.

Element Plus defaults are composed first. Workbench business registries are
appended with explicit `last-wins`. A business presenter:

- receives only toolkit-neutral presenter props;
- emits normalized serializable events;
- cannot receive Session, ValueHost, runtime, adapter, XNL, or VFS capability.

Unknown structures fail closed with diagnostics. A raw JSON or code presenter
must be selected by an explicit `EditorPresentation.presenter` with an
intentional reason; no structural or unsupported branch may select it
implicitly.

## ValueHost And Accepted State

The Workbench ValueHost captures a stable target identity when the editor
session is created. It never reads later UI selection to decide where to
write.

For each concrete command:

1. Verify `expectedRevision` still matches the target's accepted canonical
   projection.
2. Apply set/insert/remove/move/map/union semantics to a disposable value
   candidate, never to the Session projection.
3. Validate the candidate with the concrete product authoring contract.
4. Translate the candidate to the existing flow-level or node-level product
   command.
5. Let the product capsule produce one `XnlMutation[]` batch.
6. Dry-run that exact batch and reload the candidate through the canonical
   loader.
7. Send the same batch through the existing semantic persistence owner.
8. On VFS success, reproject canonical value and return `accepted` with a new
   opaque revision.
9. On validation, loader, persistence, identity, or revision failure, return
   `rejected` or `conflict`; the Session retains its previous snapshot.

The ValueHost does not import a VFS or XNL writer. It invokes a Workbench
capsule/runtime port whose existing adapter and effect chain owns mutation and
persistence. The schema-editor package graph remains unaware of these effects.

## Flow-Level And Node-Level Targets

The right panel supports two explicit target kinds:

- `flow`: canonical root metadata/config that the selected product declares
  authorable;
- `node`: selected public node config projected by the concrete product
  adapter.

Both targets provide stable identity, title, schema, optional presentation,
accepted value, revision, and product family. Target switching disposes the
old app runtime and Session exactly once. A delayed host response for a
disposed or different target cannot advance the new panel.

Derived fields are excluded or read-only in schema/presentation. They are not
copied into writable config merely because the loader can project them.

## Four-Product Structural Behavior

### InstantFlow, WorkFlow, BizProcess

- `If.branches` is an array of structured items with stable `id`, typed
  predicate `when`, and recursively editable `config`.
- Branches support insert, remove, field edit, and drag reorder through
  standard collection commands.
- `Fallback.strategies` supports the same structural operations and preserves
  strategy bodies by stable id.
- Committed branch order is reloaded and projected by the CtrlFlow capsule as
  right-side port order. VisualGraph consumes that order without reading form
  config.
- Product-only nodes and ref fields retain concrete product validation.

### EagerDataFlow

- inputs use a map or business key/value presenter for port name to typed
  `flow-port` reference;
- outputs use a typed collection of unique port names;
- waitFor uses a typed collection of `flow-node` references;
- type, src, impl, flow, task, and related references use discoverable
  semantic controls;
- config uses a product-declared structured/map schema or an explicitly
  selected advanced presenter;
- derived outputs remain non-authorable.

## Layout Isolation

Schema Editor lifecycle and accepted config reprojection do not own canvas
positions, viewport, edge paths, selection, or renderer family. CtrlFlow
structural mutation may change canonical ports only after commit. DAGFlow
never receives branch controls or CtrlFlow port semantics.

Regression tests compare canvas facts before and after non-topology config
edits, target switching, rejection, reload, and Session disposal. Existing
family-specific adapters remain the only layout processors.

## Verification Strategy

1. Characterization tests freeze current product mutation ownership,
   persistence feedback, target identity, and canvas projection.
2. RED tests require the new capsule, `StructureSchema`, flow target,
   Session/ValueHost lifecycle, typed controls, and legacy-runtime absence.
3. Unit and component tests exercise every command family and accepted,
   rejected, conflict, stale, and disposal outcome.
4. Four-product round-trip tests inspect exact mutations, canonical loader
   diagnostics, VFS feedback, and reload projection.
5. Real Playwright tests use visible controls for flow/node config,
   branch/strategy insert-remove-edit-drag, DAG maps/collections/refs, and
   browser reload.
6. Seeded chaos mixes target switching, config edits, structural edits,
   layout, viewport, selection, rejection, and reload while checking family
   invariants and browser errors.
7. A fresh independent verifier reruns focused and full suites, scans package
   boundaries and legacy residue, and checks the behavior delta without
   repairing code.

## Risks And Mitigations

- **Flow-level grammar is under-characterized:** P1 freezes exact product root
  fields before implementation.
- **A ValueHost becomes a second writer:** architecture tests forbid writer
  imports and prove it delegates to the existing capsule/runtime port.
- **Whole-config adapters hide command semantics:** command application is
  isolated as a pure value candidate processor, while the existing adapter
  remains the sole XNL mutation compiler.
- **Raw editing returns as a shortcut:** scans and negative tests reject any
  implicit raw/code presenter or default JSON textarea.
- **Async writes retarget selection:** target identity and expected revision
  are captured at Session creation/dispatch and verified before acceptance.
- **Structural edits disturb layout:** family-specific canvas invariants run
  after every deterministic and chaos operation.

## Migration And Rollback

The migration is a hard replacement within one track:

1. Add RED contracts and target schema capsule.
2. Migrate product schemas/presentations and compose business dialects.
3. Integrate Session/ValueHost/canonical panel.
4. Delete the old field bundle/runtime and all active `NodeSchema` consumers.
5. Complete four-product operations and persistence gates.
6. Remove obsolete tests and replace them with target behavior tests.

Rollback is a source-level revert of the track implementation. There is no
runtime feature flag or dual-renderer fallback because parallel truth paths
would violate the ownership goal.

