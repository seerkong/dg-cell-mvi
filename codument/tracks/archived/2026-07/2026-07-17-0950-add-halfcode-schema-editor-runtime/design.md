# Design

## Architecture

```text
EditorPlan + event + dispatch snapshot + wildcard bindings
                         |
                         v
              resolveSchemaEditorCommand
                         |
                         v
                  concrete Command
                         |
                         v
SchemaEditorSession Actor --apply--> scoped ValueHost Effect port
          |                              |
          +---- accepted projection <----+

EditorPlan --pure lowerEditorPlan--> canonical source bundle
                                      |
                                      v
                         loader -> compiler -> app runtime
```

## Processor Protocol

Public processors retain `output = fn(runtime, input, config)`:

```ts
resolveSchemaEditorCommand(runtime, {
  template,
  event,
  snapshot,
  wildcardBindings,
}, config)

lowerEditorPlan(runtime, { plan }, {
  target: 'halfcode',
  unitFqn,
  scopeId,
  valueHostId,
  sessionId,
  uiLibrary: 'schemaEditor',
})
```

Runtime carries long-lived capability implementations. Input carries one invocation's data. Config carries serializable target policy and stable binding ids.

## Command Resolution

- Capture exactly one accepted snapshot at dispatch start; all `value` bindings read that snapshot.
- `event` and `value` paths traverse only arrays and own properties of plain objects.
- The zero-execution guarantee covers accessors and coercion hooks on ordinary plain records/arrays. Proxy is an out-of-contract hostile object: reflection traps may run once, but trap failures must be caught and rejected.
- Each resolver input is converted once to a descriptor-safe plain-data snapshot; all later reads use that snapshot rather than reflecting over the original object again.
- `literal` values are cloned serializable data.
- Wildcard `*` is replaced only from explicit concrete bindings. An unresolved wildcard rejects resolution.
- Required command arguments must resolve and satisfy the concrete command contract.
- Optional arguments are omitted when their source is absent; no `undefined` is serialized.
- Failure returns structured diagnostics; no partial command reaches `ValueHost`.
- Resolver validates the final `SchemaEditorCommand` and owns no mutation effect.

## Snapshot And ValueHost Protocol

The exact public names may follow local style, but the semantic envelope is fixed:

```ts
type SchemaEditorRevision = string | number
type Snapshot<T> = { value: T; revision: SchemaEditorRevision }
type ApplyRequest = { command: SchemaEditorCommand; expectedRevision: SchemaEditorRevision }
type ApplyResult<T> =
  | { status: 'accepted'; baseRevision: SchemaEditorRevision; snapshot: Snapshot<T> }
  | { status: 'rejected'; baseRevision: SchemaEditorRevision; issues: Diagnostic[] }
  | { status: 'conflict'; baseRevision: SchemaEditorRevision; actualSnapshot?: Snapshot<T>; issues?: Diagnostic[] }
```

`ValueHost` is a typed Effect port whose operations preserve `(runtime, input, config)` arity. Host adapters own validation, mutation, persistence and authoritative revision creation.

`SchemaEditorRevision` is an opaque serializable token. Equality means the same authoritative version; the session never sorts, increments, coerces or normalizes it. Numeric revisions must be finite. A session-local `requestId` correlates pending work only and never enters `ApplyRequest` or `ApplyResult`.

## Session Actor

- Session starts from one cloned accepted snapshot obtained through the scoped host capability or explicit initial bootstrap protocol.
- Dispatch captures current snapshot/revision, resolves one command, records pending request and calls host apply.
- It never applies the command locally and never publishes an optimistic value.
- Only `accepted` with `baseRevision === pending.expectedRevision === current revision` and a valid snapshot whose revision differs from current advances projection.
- Rejected, conflict, duplicate, stale and malformed responses leave projection unchanged and produce observable diagnostics.
- Subscribers receive immutable/cloned projections and pending/diagnostic state; they cannot mutate session internals.
- Dispose clears subscribers, rejects future dispatch and ignores late host responses.

## Scoped Runtime Bridge

- Stable `valueHostId`/`sessionId` are runtime or lowering config, not `EditorPlan.provenance`.
- Scope runtime exposes typed schema-editor capabilities assembled by existing parent/child runtime binding.
- Bridge performs structural capability projection only; it does not rescan XNL/Scope trees or use a global registry.
- The same prebuilt host may be visible in descendant scopes; child scopes may override according to existing runtime assembly semantics.

## Pure Canonical Shell Lowering

The public lowering contract is:

```ts
lowerEditorPlan(runtime, { plan }, {
  target: 'halfcode',
  unitFqn,
  scopeId,
  valueHostId,
  sessionId,
  uiLibrary: 'schemaEditor',
}) -> {
  manifestUri,
  sourceMap,
  uiLibrary: 'schemaEditor',
  logicalUnitFqn,
  runtimeUnitFqn,
}
```

`unitFqn` is the logical Halfcode identity and is validated by the canonical `asUnitFqn` contract. The source root is deterministically derived from that logical identity by percent-encoding each FQN segment, so independent lowered bundles can coexist in one VFS without overwriting each other's paths.

The current XNL `#Word` parser accepts a narrower identity alphabet than canonical Unit FQN. The generated Page and AppBundle therefore use a runtime identity projected segment-by-segment from the logical identity:

```text
_ -> __
$ -> _d
all other canonical characters -> unchanged
```

This projection is injective: for example, logical `$ProfileEditor` becomes runtime `_dProfileEditor`, while logical `_dProfileEditor` becomes runtime `__dProfileEditor`. `logicalUnitFqn` remains the canonical caller identity; `runtimeUnitFqn` is only the XNL-compatible loader identity. Lowering guarantees complete `EditorPlan` and stable runtime binding round-trip. It does not claim that the two Unit FQNs are equal.

Lowering returns serializable deterministic manifest URI, source map, the fixed UI-library identity, and both Unit identities. It contains:

- one canonical component/unit shell;
- one `schemaEditor.Editor` atom;
- config binding for the complete `EditorPlan`;
- serializable `scopeId`, `valueHostId` and `sessionId` bindings.

It contains no accepted value snapshot, `ValueHost`, callback, component implementation or synthetic `LoadedHalfcodeUnitBundle`.

Acceptance uses generated in-memory sources and the existing source resolver, loader, unit compiler and app runtime. Runtime config resolution must recover an equivalent plan and scoped session bridge.

## Ownership

- contract/logic packages are inputs and receive feedback only for unavoidable public-data corrections;
- support owns resolver, session, ValueHost protocol, Scope bridge and lowering;
- Vue owns recursive renderer and presenter registry later;
- Element Plus owns presenter adapters later;
- Workbench owns Flow/XNL mutation later.
