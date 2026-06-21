# Proposal: Command / Event / Message protocol migration

## Why

The current canonical FrontendApp DSL calls every cross-boundary behavior an
`Intent`. In practice, an intent declaration serves two different roles:

- a request that runtime code may handle, reject, or bubble; and
- a fact that a component/page communicates after it has happened.

That vocabulary is tied to MVI and cannot be shared cleanly with BO and
ontology models across frontend and backend. `Action` would make this worse:
it is already ambiguous between UI actions, graph actions, reducer actions,
and business operations.

## Goal

Make the canonical halfcode communication protocol explicit:

- `Command` requests future work and may name a runtime-first handler.
- `Event` reports a completed fact and never declares a handler.
- `Message` is the abstract term used only where a transport-neutral boundary
  must accept either one.

The migration changes current FrontendApp v1 contracts, scopes, wiring,
runtime assembly, fixtures, tests, and DSL documentation together.

## Non-goals

- Do not add a declarative event-to-command transform language to XNL.
- Do not make `Message` a third catch-all business node with a `kind` string.
- Do not change the runtime object's code-owned message routing protocol.
- Do not migrate intentionally quarantined legacy inputs: `HalfcodeDocument`,
  `xnl-bundles-legacy`, and their compatibility codecs retain their historic
  vocabulary until a dedicated legacy-removal track.
- Do not redesign data graph or effects.

## Canonical vocabulary

| Old canonical term | New canonical term |
|---|---|
| `Intents` / `Intent` | `Commands` / `Command`, or `Events` / `Event` |
| `intents://` | `commands://` or `events://` |
| element `intent` | element `command` |
| `IntentPolicy` / `IntentRule` | `MessagePolicy` / `MessageRule` |
| rule `intent` field | rule `message` field |
| contract `Emits` / `emits` | `Sends` / `sends` |
| `Wire emit` + `accept` | `Wire message` |

`Accepts` remains the transport-neutral input-boundary term. A source sends a
command or event; a target accepts the exact same message. A wire transports
the same message and cannot silently map an event to a command. Such a
reaction belongs in runtime code.

## Impact

This is an intentionally breaking change for canonical FrontendApp v1 XNL and
the current unit/runtime public types. The loader must diagnose retired
canonical vocabulary rather than accepting it as a second spelling. Existing
legacy roots remain explicitly segregated and covered by their own tests.
