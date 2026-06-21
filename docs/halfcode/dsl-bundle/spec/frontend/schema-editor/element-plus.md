# Element Plus Presenters

`dg-cell-mvi-halfcode-element-plus` provides the product-ready default presenter
capsule for the Schema Editor. Consumers use only the package root:

```ts
import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusCanonicalRegistry,
  createElementPlusSchemaEditorCanonicalRegistry,
  createElementPlusSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';
```

All three Schema Editor factories keep the public
`factory(runtime, input, config)` shape:

| Factory | Runtime | Input | Config |
|---|---|---|---|
| `createElementPlusSchemaEditorPresenterRegistry` | `{}` | `{}` | `{}` |
| `composeElementPlusSchemaEditorPresenterRegistries` | `{ registries }` | `{}` | `{ conflict: 'reject' \| 'last-wins' }` |
| `createElementPlusSchemaEditorCanonicalRegistry` | `{ parentRegistry?, presenterRegistries? }` | `{}` | `{ presenterConflict: 'reject' \| 'last-wins', componentIdentity: 'Editor' }` |

The factories accept own-data records, return structured diagnostics on invalid
input, and create isolated frozen registries. There is no `./schema-editor`
package subpath and no mutable default singleton.

## Default Presenter Matrix

The default factory returns the following ordered 26-entry snapshot. Unknown
ids fail closed.

| Stable presenter id | Element Plus presentation | Normalized write event |
|---|---|---|
| `object.group` | Form/group container | None |
| `scalar.text` | Text input | `value.change { value }` |
| `scalar.number` | Number input | `value.change { value }` |
| `scalar.boolean` | Switch | `value.change { value }` |
| `scalar.null` | Read-only null state | None |
| `scalar.enum` | Select | `value.change { value }` |
| `scalar.const` | Read-only constant state | None |
| `collection.list` | Recursive list with insert/remove/move actions | `item.insert`, `item.remove`, `item.move` |
| `map.entries` | Recursive entry editor with add/remove/rename actions | `entry.set`, `entry.remove`, `entry.rename` |
| `structured-value.modal` | Explicit dual-mode Visual/JSON modal for free JSON values | `value.change { value }` on Apply |
| `union.select` | Alternative selector plus selected recursive content | `alternative.select` |
| `schema.ref` | Default reference string input | `value.change { value }` |
| `unsupported` | Visible non-editable diagnostic | None |
| `scalar.email` | Email text input | `value.change { value }` |
| `scalar.password` | Password input | `value.change { value }` |
| `scalar.textarea` | Multiline text input | `value.change { value }` |
| `scalar.multiline` | Multiline text input alias | `value.change { value }` |
| `scalar.url` | URL text input | `value.change { value }` |
| `scalar.uri` | URI text input alias | `value.change { value }` |
| `scalar.tel` | Telephone text input | `value.change { value }` |
| `scalar.phone` | Telephone text input alias | `value.change { value }` |
| `scalar.date` | Date picker emitting a string | `value.change { value }` |
| `scalar.time` | Time picker emitting a string | `value.change { value }` |
| `scalar.datetime` | Date-time picker emitting a string | `value.change { value }` |
| `scalar.date-time` | Date-time picker alias emitting a string | `value.change { value }` |
| `scalar.color` | Color input | `value.change { value }` |
| `scalar.currency` | Number input | `value.change { value }` |

Temporal presenters emit contract-serializable strings, never `Date`, dayjs,
DOM event, component instance, or toolkit runtime objects. `visible`,
`readOnly`, `required`, constraints, pending state, accepted value, diagnostics,
event wiring, and the recursive slot outrank allowlisted presenter options.

## Normalized Events And Commands

Presenters emit only the existing normalized event vocabulary. The Vue event
bridge resolves the matching plan-owned command template against the current
accepted snapshot and dispatches the resulting concrete command to the
Session:

| Presenter event and payload | Concrete `SchemaEditorCommand` |
|---|---|
| `value.change { value }` | `value.set { target, value }` |
| `item.insert { index, value }` | `collection.insert { target, index, value }` |
| `item.remove { index }` | `collection.remove { target, index }` |
| `item.move { fromIndex, toIndex }` | `collection.move { target, from, to }` |
| `entry.set { key, value }` | `map.set { target, key, value }` |
| `entry.remove { key }` | `map.remove { target, key }` |
| `entry.rename { fromKey, toKey }` | `map.rename-key { target, from, to }` |
| `alternative.select { alternativeId, initialValue }` | `union.select { target, alternativeId, initialValue }` |

`target` and wildcard substitutions come from the plan and renderer context,
not from an Element Plus control. Collection insert uses the accepted list
length and `metadata.itemDefault`; map add uses a local key draft and
`metadata.valueDefault`; union selection uses the chosen
`metadata.alternativeDescriptors` entry. Payloads are descriptor-safe,
serializable data.

The presenter never applies the concrete command and never changes
`props.value`. Pending, rejected, conflict, stale, malformed, or thrown host
outcomes leave the displayed accepted value unchanged. The DOM advances only
after the current Session publishes a valid `accepted` snapshot.

## Business Later-Wins Composition

Business presenters are ordinary Vue presenter registries. Put the Element
Plus default first, then ordered business layers, and choose `last-wins`
explicitly:

```ts
import { defineComponent, h } from 'vue';
import {
  createSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';

const BusinessText = defineComponent({
  setup: () => () => h('input', { 'data-business-text': '' }),
});

const defaults = createElementPlusSchemaEditorPresenterRegistry({}, {}, {});
const business = createSchemaEditorPresenterRegistry(
  {},
  {
    entries: [{
      id: 'scalar.text',
      adapter: { component: BusinessText },
    }],
  },
  { duplicate: 'reject' },
);

if (!defaults.ok || !business.ok) {
  throw new Error('Schema Editor presenter registry creation failed.');
}

const presenters = composeElementPlusSchemaEditorPresenterRegistries(
  { registries: [defaults.registry, business.registry] },
  {},
  { conflict: 'last-wins' },
);
```

`reject` reports duplicate ids. `last-wins` affects only the new composed
registry; it does not mutate the default, business, or later factory instances.
Use this same pattern for shared, bounded-context, and editor-instance layers,
ordered from general to specific.

## Canonical Bootstrap

The canonical helper creates a fresh default presenter registry, appends the
ordered business registries, composes the existing Element Plus canonical
parent, and binds the sole Vue Schema Editor shell as `Editor`:

```ts
const canonical = createElementPlusSchemaEditorCanonicalRegistry(
  {
    parentRegistry: createElementPlusCanonicalRegistry(),
    presenterRegistries: business.ok ? [business.registry] : [],
  },
  {},
  {
    presenterConflict: 'last-wins',
    componentIdentity: 'Editor',
  },
);

if (!canonical.ok) {
  throw new Error('Element Plus Schema Editor bootstrap failed.');
}

// Pass canonical.registry to the existing CanonicalHalfcodeRenderer.
```

The lowered tag remains `schemaEditor.Editor`; the canonical renderer resolves
the component identity `Editor` and provides the current runtime/unit/node
context. The existing Vue shell resolves the current Scope bridge and passes
only its Session to `SchemaEditorSessionRenderer`. The Element Plus helper does
not create a Session, capture a ValueHost, load a bundle, lower a plan, or add a
renderer/runtime path.

## Recursive Slot Ownership

Recursion belongs to the toolkit-neutral Vue renderer:

- `object.group` renders ordered children from its default slot.
- `collection.list` pairs accepted array indexes with default-slot VNodes; it
  does not read `itemTemplate`.
- `map.entries` pairs accepted own-entry order with default-slot VNodes; it
  does not read `valueTemplate`.
- `union.select` displays the renderer-selected default-slot VNode; it does not
  compile or select an alternative child.

Unreadable accepted data, hostile defaults, or a slot/value count mismatch
fails closed with visible diagnostics. No presenter recursively compiles plan
nodes, and no failure path creates a JSON textarea, raw editor, or code editor.
Raw JSON/code remains legal only when a presentation explicitly selects such a
business presenter; it is never an implicit fallback.

## Shared Kitchen-Sink Lifecycle

The demo and integration test share
`packages/dg-cell-mvi-halfcode-element-plus/demo/schemaEditorKitchenSinkFixture.ts`
as their single schema, presentation, accepted-value, host-outcome, and
bootstrap source. Its lifecycle is:

```text
StructureSchema + EditorPresentation
-> compileEditorPlan
-> lowerEditorPlan
-> memory resolver
-> loadHalfcodeAppRuntime
-> CanonicalHalfcodeRenderer
-> createElementPlusSchemaEditorCanonicalRegistry
-> schemaEditor.Editor
-> current Scope Session
-> Element Plus presenters
```

`createSchemaEditorKitchenSinkCompilerRuntime` supplies the shared compiler
dialects, `createSchemaEditorKitchenSinkPlan` compiles the shared fixture, and
`createSchemaEditorKitchenSinkHostHarness` controls accepted, pending, rejected,
conflict, and stale outcomes. `createSchemaEditorKitchenSinkRuntime` builds the
one real canonical runtime, and `mountSchemaEditorKitchenSinkDemo` mounts it
idempotently. The integration test uses real controls to cover all 26 ids and
every normalized event family. Its controlled host proves
pending/rejected/conflict/stale outcomes retain the old DOM and accepted
revision, while accepted outcomes advance both.

## Ownership

| Owner | Responsibility |
|---|---|
| Contract/compiler | Schema, presentation, plan metadata, command templates and default presenter ids |
| Support Session/ValueHost boundary | Command resolution, revision gating and accepted projection |
| Toolkit-neutral Vue renderer | Recursive materialization, wildcard binding, event bridge and Session subscription |
| Element Plus capsule | Presenter components, safe UI options, normalized serializable events and explicit registry composition |
| Host/Workbench adapter | Command acceptance, domain mutation, persistence, authoritative revision and downstream diagnostics |

Element Plus does not own or receive the Session, ValueHost, app runtime,
compiler, lowering, canonical renderer, host writer, Flow/XNL mutation, VFS,
database, or browser persistence. Workbench G4 has now migrated on top of this
capsule, but that downstream consumer does not change the ownership here:
Flow-specific schema/presentation/dialect, Workbench integration, and
Flow/XNL mutation still belong to the Workbench adapter rather than the
kitchen-sink host or Element Plus package itself.
