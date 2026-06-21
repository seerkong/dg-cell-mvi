# Design

## Boundary

```text
canonical schemaEditor.Editor atom
             |
             v
SchemaEditor canonical registry adapter
             |
             +---- resolve current Scope session by stable ids
             |
             v
SchemaEditor Vue shell
             |
             +---- subscribe ----> immutable accepted session projection
             |
             v
recursive EditorPlan renderer
             |
             +---- presenter id ----> SchemaEditorPresenterRegistry
             |
             +---- wildcard template materialization
             |
             v
normalized presenter event
             |
             v
matched EditorCommandBinding + wildcard bindings
             |
             v
SchemaEditorSession.dispatch
             |
             v
ValueHost owner -> accepted snapshot -> rerender
```

`EditorPlan` remains Data, recursive rendering/event matching are Processors, `ValueHost` remains the injected Effect, and `SchemaEditorSession` remains the accepted-projection Actor. Vue owns rendering and subscription cleanup only.

## Public Capsule

All public APIs are exported from `dg-cell-mvi-halfcode-vue` package root. Suggested capsule layout:

```text
src/
  schema-editor/
    index.ts
    presenterRegistry.ts
    renderer.ts
    eventBridge.ts
    canonicalShell.ts
  canonicalRenderer.ts
  index.ts
```

Consumers do not deep-import `src/schema-editor/*`. The exact identifiers may follow local naming, but the public semantics are fixed:

```ts
interface SchemaEditorPresenterAdapter<TComponent = unknown> {
  readonly component: TComponent
}

interface SchemaEditorPresenterRegistry<TAdapter = SchemaEditorPresenterAdapter> {
  resolve(id: string): TAdapter | undefined
}

interface SchemaEditorPresenterEvent {
  readonly event: string
  readonly payload: SchemaEditorContractValue
}
```

The registry protocol is UI toolkit-neutral: it knows stable presenter ids and opaque adapter/component implementations, but no Element Plus symbol. The Vue renderer specializes the component type locally. Registry construction/composition is explicit and scoped; duplicate ids are deterministic, host override policy is explicit, and unknown ids produce diagnostics rather than fallback.

Presenter components receive only renderer projection props and a normalized-event listener:

```ts
type PresenterProps = {
  node: EditorPlanNode
  value: SchemaEditorContractValue | undefined
  path: ValuePath
  presenterOptions?: SchemaEditorContractRecord
  pending: boolean
  diagnostics: readonly EditorPlanDiagnostic[]
  onSchemaEditorEvent(event: SchemaEditorPresenterEvent): void
}
```

They do not receive `ValueHost`, `SchemaEditorSession`, app runtime, Scope runtime, XNL/VFS/database clients, or a direct mutation callback. The event name selects an existing `EditorCommandBinding`; a presenter cannot replace the plan-owned template with an arbitrary command.

## Processor Protocol

Public processors/factories preserve three-parameter placement:

```ts
renderSchemaEditorNode(
  runtime, // presenter registry and renderer-local identity projection
  { node, snapshot, wildcardBindings },
  { keyPrefix },
)

dispatchSchemaEditorPresenterEvent(
  runtime, // SchemaEditorSession dispatch port
  { node, event, wildcardBindings },
  {},
)

createSchemaEditorCanonicalRegistry(
  runtime, // canonical app runtime + presenter registry
  { parentRegistry? },
  { componentIdentity: 'Editor' },
)
```

Long-lived registries, app runtime/session references and renderer-local identity projections belong to runtime. One event/render payload belongs to input. Stable enum/identity policy belongs to config. Vue component closures never enter serializable plan/config data.

## Recursive Rendering

The recursive renderer consumes only `EditorPlan` and the current immutable `SchemaEditorSessionState.snapshot.value`.

- `group`: renders ordered `children`.
- `field`: resolves the materialized value path and delegates to its presenter.
- `collection`: reads the current accepted array, materializes `itemTemplate` once per item, and provides item VNodes to the collection presenter.
- `map`: reads own accepted map entries, materializes `valueTemplate` once per key, and provides entry VNodes to the map presenter.
- `union`: renders the selected alternative from accepted value/discriminator data and exposes all ordered alternative descriptors to its presenter.
- `custom`: delegates to its stable presenter id with serializable metadata/config.

Visibility/read-only/display/constraints/presenter options come from typed plan metadata. The renderer does not reopen `StructureSchema` or rerun `SchemaEditorDialect`.

Missing presenter ids and malformed accepted values fail closed with observable renderer diagnostics. No implicit raw/JSON component is selected.

## Wildcard Materialization

`itemTemplate` and `valueTemplate` stay immutable wildcard templates. For each recursive render:

1. Carry two ordered vectors in render context:
   - `wildcardBindings`: accepted array indexes/map keys for value paths and events.
   - renderer-local `identityBindings`: projected collection keys/map keys for nested identity scopes.
2. When entering a collection item, append its accepted array index.
3. When entering a map entry, append its accepted map key.
4. Replace `*` only in an ephemeral materialized path used for value lookup and presenter props.
5. Pass the original template and the ordered vector to session dispatch; the existing command resolver performs final materialization.

Nested collection/map combinations therefore bind wildcards outer-to-inner. A collection's identity scope is materialized with `identityBindings`, so moving an outer collection item does not reset its nested collection keys. `identityBindings` never enter presenter props, events, session dispatch, domain values, or host requests. Current snapshot items are never copied back into `EditorPlan.children` or `entries`.

Map Vue keys use the accepted map key. Collection Vue keys follow `metadata.identity`:

- `strategy: 'property'`: read the configured relative item path; valid unique scalar identities win.
- missing/duplicate/invalid property identity: use the declared `fallback: 'ephemeral'`.
- `strategy: 'ephemeral'`: a renderer-local allocator reconciles keys per identity-scoped collection path only when accepted snapshots change.

Reconciliation uses a descriptor-safe canonical structural fingerprint and deterministic occurrence order rather than JavaScript object reference identity, because `SchemaEditorSession` publishes deep-cloned snapshots. Unique fingerprints retain keys across insert/remove/move/reorder. Structurally indistinguishable duplicate occurrences retain the prior ordered key set, but no semantic identity between equal occurrences is claimed; a business-stable property identity is required when that distinction matters. Fingerprinting reads own descriptors only and never invokes accessors, `toJSON`, or coercion hooks; hostile reflection failures fail closed.

Ephemeral keys are a UI projection, not domain state. They may preserve component identity across accepted insert/remove/move/reorder, but they are never sent to `ValueHost` or written into the value. No value is optimistically changed while a request is pending.

## Normalized Event Bridge

Presenter adapters normalize UI-library events before crossing the renderer boundary. The base bridge accepts only descriptor-safe serializable data:

```ts
{
  event: 'item.move',
  payload: { fromIndex: 1, toIndex: 0 }
}
```

Dispatch algorithm:

1. Validate the normalized event as own serializable data.
2. Find exactly one `node.commandBindings` entry whose `event` matches.
3. Call `session.dispatch({ template, event: payload, wildcardBindings })`.
4. Do not call `ValueHost` directly and do not update the rendered value.
5. Rerender only when the session subscription publishes a new state.

Unknown event names, duplicate bindings, malformed payloads and dispatch-after-dispose fail closed and are observable. Pending state may be displayed, but it is not an accepted value projection.

## Canonical Shell Integration

The generated canonical plan contains one atom:

```text
tag = schemaEditor.Editor
props = {
  plan,
  scopeBridge: { valueHostId, sessionId },
  uiLibrary: 'schemaEditor'
}
```

The existing canonical component registry remains responsible for component identity resolution. `SchemaEditorPresenterRegistry` remains responsible only for presenter ids. They are composed, not merged.

The current canonical resolver receives only a component name, while the shell needs current app runtime, unit and scope to resolve the scoped session. This track may make the minimal backward-compatible extension:

```ts
interface CanonicalComponentResolutionContext {
  runtime: HalfcodeAppRuntime
  plan: UnitRenderPlan
  node: RenderNodePlan
}

interface CanonicalComponentRegistry {
  resolve(name: unknown, context?: CanonicalComponentResolutionContext): unknown
}
```

Existing one-argument registries remain structurally valid. The schema-editor canonical adapter uses this context plus `node.scopeId` and the serializable `scopeBridge` ids to call the existing Scope bridge. It projects only `bridge.session` into the Vue shell; `bridge.valueHost` is never passed to renderer or presenters.

The integration reuses `CanonicalHalfcodeRenderer` and its component resolution path. It does not add a second canonical renderer, loader, compiler, runtime or lowering path.

## Subscription And Ownership

- On mount, the shell reads `session.getState()` and establishes one `session.subscribe`.
- On session/plan/registry replacement, it unsubscribes the old subscription before binding the new one.
- On unmount, it unsubscribes and clears renderer-local identity projections/listeners.
- It never calls `session.dispose()`: the Scope/runtime/bootstrap that created a potentially shared session owns disposal.
- Late ValueHost results remain governed by session semantics. An unmounted renderer has no subscriber and performs no render/dispatch side effect.
- Remount creates one fresh subscription without retaining the previous component tree or event callbacks.

## Testing Strategy

Tests use probe presenter components and a real `SchemaEditorSession`; they do not introduce Element Plus.

- Public/RED tests freeze expected package-root exports, registry semantics, processor arity and forbidden capabilities.
- Recursive tests cover all six node kinds, nested collection/map combinations, wildcard order, property/ephemeral keys and no plan mutation.
- Event tests cover every command event family, malformed/unknown/duplicate event failure, pending state and accepted-only rerender.
- Lifecycle tests cover replacement, repeated mount/unmount, late host completion and shared session ownership.
- Canonical integration tests start from a real lowered source bundle and real loader/compiler/app runtime, then mount the existing `CanonicalHalfcodeRenderer` and prove the sole shell resolves through the component registry.
- Boundary tests reject Element Plus, Flow, XNL mutation, VFS/database, direct `ValueHost`, optimistic mutation, global registry and deep public imports.

## Documentation State

After implementation, docs may state that the toolkit-neutral Vue renderer and canonical shell integration exist. They must continue to state that Element Plus presenters and Workbench Flow mutation integration are future tracks.
