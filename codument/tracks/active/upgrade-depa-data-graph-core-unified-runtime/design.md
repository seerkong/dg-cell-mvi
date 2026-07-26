# Design

## Desired topology

```text
dispatch / effect feedback
  -> AppendOnlyEventLog<AppEvent>
  -> DataGraph source of TimelineEntry<AppEvent>
  -> StreamDrivenStateSignalNode output
  -> computed viewModel signal

same event source -> graph sink -> taps + runEffects -> feedback dispatch
```

`AppendOnlyEventLog` is the history owner. The stream-driven state node owns only current state and is read through its signal output. The effect sink is registered after the state node and receives the same timeline entry; the state reducer records its validated reduction result by entry so effects do not execute the reducer a second time.

Feedback depth and chain are dispatch-instance metadata, not properties of an
`AppEvent` object. The internal dispatch path keeps that metadata only for the
synchronous `eventLog.append` delivery that creates one timeline entry. A
public dispatch always starts a new root context even when the caller reuses an
object that previously arrived as effect feedback.

## DEPA boundaries

- Event log, timeline entry, state and view model are Data.
- The public reducer and projection remain pure Processors.
- `runEffects` remains the only external-effect boundary; its returned events re-enter the event log.
- The store/graph is the lifecycle-owning Actor. UI consumers keep reading the stable facade and cannot mutate state-node output.

## Dependency policy

Use the fixed 1.0.1 package release corresponding to the mission target. Keep both existing lockfiles and regenerate them to the same direct dependency version; do not remove a user-owned lockfile as part of this migration. Bun commands are the executable workspace baseline because root scripts use Bun; Pnpm lockfile regeneration is a consistency requirement, not a replacement workspace runner.

## Compatibility and privileged graph ownership

`createStreamSignalStore(options)` remains the ordinary consumer construction API and returns a store with the stable `dispatch/state/viewModel/dispose` operations plus two read-only views:

- `eventLog: EventHistory<AppEvent>` exposes `entries()` only; the internal append-only log stays private.
- `graph: GraphObservation` exposes reactive `get()` and diagnostic `snapshot()` only; it has no mutation, node-registration, or lifecycle methods.

`createStreamSignalStoreRuntime(options)` is an explicit composition-root API. It returns `{ store, graphOwner }`, where `graphOwner.graph` is the same actual `DataGraph` used by the store. This is a privileged capability: it is not reachable from the ordinary store and must not be passed to Vue/CRUD/business consumers. The owner must not mutate the store-reserved `events`, `state`, `viewModel`, or `effects` nodes; store dispatch remains their only write path. The subsequent consumer track replaces Vue's direct `useGraphSignal(store.graph, ...)` dependency with a watch over `store.viewModel()`.
