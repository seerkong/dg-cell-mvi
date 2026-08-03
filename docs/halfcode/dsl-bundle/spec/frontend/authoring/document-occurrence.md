# Document Occurrence Authoring

## Runtime Binding

Document authoring is assembled through the existing Document occurrence runtime
capability:

```text
runtime.documentAuthoring = {
  factory,
  runtime,
}
```

This binding is a trusted runtime object, not XNL config. For an edit Document,
`openDocument(runtime, input, config)` calls the injected factory with:

```ts
{
  id: unitInstanceId,
  source: { kind: 'inline', unitSourceRef, region }
    // or { kind: 'external', ref }
}
```

The opened session must be exact and frozen, and the proposal state live
revision must use the occurrence `unitInstanceId` as its session id. The Scope
runtime receives only the edit authoring facet produced from the proposal port.
The host lifecycle keeps control and disposes it during close or rollback.

For a view Document, `openDocumentAuthoring` returns only the view facet and does
not inspect or invoke the host authoring factory.

## Parent / Child Lease Lifecycle

Every opened Document occurrence reserves a `unitInstanceId` and receives a
lease. Commit, close and release must carry the matching lease. A stale lease
cannot remove or commit a remounted occurrence.

Child Document occurrences opened inside a host occurrence carry the parent's
`{ unitInstanceId, lease }` as their parent lease. The registry:

- rejects child reserve/commit when the parent lease is stale, inactive or
  closing;
- atomically claims committed descendants and pending child reservations when a
  parent begins close;
- releases descendants before the parent release completes;
- prevents a later remount with the same `unitInstanceId` from adopting old
  children.

The lease is lifecycle identity for runtime occurrence ownership. It is not XNL
tree identity and not persistence revision.

## Persistence Adapter Boundary

The built-in support adapter bridges an injected
`xnl-vfs/revisioned-persistence` authority to `XnlAuthoringPersistencePort`.
It delegates:

- `read` to the authority read;
- `persist` to full-snapshot compare-and-swap with the expected persisted
  revision.

The adapter maps authority revisions to authoring persisted revisions and maps
applied receipts without copying xnl-vfs CAS logic. It does not fabricate
receipts, own a global VFS registry, create VCS checkpoints or place persistence
authority into XNL source/config.

Workbench repository checkpoints and product save UX are future host effects.
