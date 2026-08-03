# Authoring State Machine

## Facts

| Fact | Meaning |
|---|---|
| accepted snapshot | current owner-local live Domain XNL fact |
| candidate | disposable result for one proposal before live acceptance |
| live revision | `{ sessionId, value }`, comparable only inside one owner session |
| persisted revision | `{ authorityId, value }`, comparable only inside one persistence authority |
| receipt | evidence of an applied persistence effect |
| conflict | stale live input or stale persisted CAS feedback |
| failure | rejected/malformed capability output, thrown capability or failed persistence |

`candidate` and mutation batch facts are not accepted facts. A proposal remains
request data until the owner session accepts the candidate into the ValueHost
live authority.

## Submit States

```text
ready
  -> evaluating
       -> ready                         unchanged / rejected / stale conflict / pre-accept failure
       -> accepted-persisting
            -> ready                    persistence applied or unchanged
            -> dirty-failed             invalidation or persistence failed
            -> persistence-conflicted   CAS conflict from persistence authority
```

`disposed` is terminal for the session facade.

Important consequences:

- stale base live revision conflicts before candidate materialization;
- no-op diff returns `unchanged` and does not allocate a new live revision;
- dry-run or validation rejection does not advance accepted or persisted state;
- accepted live state is visible before persistence evidence is final;
- failed or conflicted persistence does not roll back accepted live state;
- `dirty-failed` and `persistence-conflicted` block new edits until explicit
  recovery.

## Persistence Feedback

`applied` updates the persisted revision and stores the receipt. The receipt
contains previous/current persisted revisions, persisted time and durability;
the result `persistedRevision` must exactly equal receipt current revision.

`unchanged` confirms the persisted revision but has no receipt. Adapters must not
fabricate an applied receipt for an unchanged full-snapshot CAS.

`failed` keeps the accepted live snapshot dirty and preserves diagnostics.

`conflict` keeps the accepted live snapshot but exposes the actual persisted
revision and pauses authoring.

## Retry

`retryPersistence({ expectedLiveRevision })` is host-control only. It is valid
only from `dirty-failed` and only when the expected live revision matches the
current accepted live revision.

Retry persists the current accepted snapshot. It does not rerun command
materialization, diff, dry-run, validation, live revision allocation or proposal
invalidation, except that a previously failed invalidation must be published
before persistence can report success.

`persistence-conflicted` cannot be recovered by retry; it requires reload or a
future product-specific rebase.

## Reload / Refresh

`reloadDiscardingAccepted({ expectedLiveRevision })` is explicit destructive
recovery for `dirty-failed` or `persistence-conflicted`.

On expected-live match it:

1. reads the persisted snapshot through the injected persistence port;
2. rejects a foreign persistence authority;
3. allocates a new live revision in the same session;
4. replaces the accepted live snapshot with the persisted snapshot;
5. publishes invalidation;
6. returns `reloaded` with the discarded live revision and persisted revision.

On expected-live mismatch it returns conflict without reading persistence or
discarding anything. There is no silent refresh, no automatic rebase and no
implicit loss of accepted live divergence.

A newly opened session performs a persistence read, then allocates a fresh
owner-local live revision. The persisted revision and any later applied receipt
remain separate from that live revision.
