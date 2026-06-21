# Design: Canonical message protocol

## Semantic model

```text
adapter interaction
  -> Command (request; imperative naming)
  -> runtime-first command handler
  -> effects / graph / BO code
  -> Event (completed fact; past-tense naming)
  -> MessagePolicy / Wiring transport
  -> accepting scope, page, backend flow, or subscriber
```

An element adapter maps a native click/input/etc. to a `Command`; native DOM
events are not halfcode business events. A command handler follows
`output = fn(runtime, input, config)`. An event has no handler field: it is a
protocol fact, not a request for work.

`Message` is an ontology supertype, not an XNL `kind` field. Where the DSL
must refer to either concrete protocol kind, it uses a `message` attribute
whose URI can be `commands://...` or `events://...`.

## Canonical XNL

```xnl
<Commands #counter-commands [
  <Command #counter.increment {
    handler = "vfs://./counter.commands.ts#incrementCounter"
    config = "config://#counter-actions"
  }>
]>

<Events #counter-events [
  <Event #counter.incremented>
]>

<Elements #counter-elements [
  <elementPlus.ElButton #increment {
    command = "commands://#counter.increment"
  }>
]>

<Contracts #counter-contracts (
  <PageContract #dg.demo.Counter (
    <Accepts [ <Event ref="events://#counter.incremented"> ]>
    <Sends [ <Command ref="commands://#counter.increment"> ]>
  )>
)>

<Scope #counter {
  commands = "commands://#counter-commands"
  events = "events://#counter-events"
} (
  <MessagePolicy #boundary { default = "bubble" } [
    <MessageRule message="commands://#counter.increment" action="consume">
  ]>
)>
```

For app-level delivery, a wire keeps the message identity unchanged:

```xnl
<Wire from="routes://#reports-route"
      message="events://#report.saved"
      to="routes://#home-route">
```

The source contract declares `Sends(Event report.saved)` and the target
declares `Accepts(Event report.saved)`. If the target needs a refresh command,
its runtime code reacts to that accepted event; XNL does not define a hidden
event-to-command transform.

## Contract and runtime types

- Replace the canonical `IntentRefSpec` with `MessageRefSpec`. A message ref
  is structurally a `HalfcodeRef`, but validation admits only `commands` and
  `events` schemes.
- Replace `emits` with `sends` on Page, Component, and Element contracts.
- Replace `Requires.intents` with `Requires.commands`; effects/config remain
  unchanged. Events are received protocol facts, not scope dependencies for a
  command initiator.
- Add `CommandSpec` (`id`, optional payload definition, optional handler,
  optional config) and `EventSpec` (`id`, optional payload definition).
  Neither repeats its `id` in a `type` field.
- Runtime scope binding and assembly carry `commands`, `events`, and optional
  `messagePolicy`. Runtime object internals remain code-owned.
- `WireSpec` and `WirePlanBinding` expose a single `message` ref. Compiler
  validation verifies that it is sent by the source and accepted by the target.

## Migration and compatibility

The canonical loader accepts only the new domains, nodes, fields, and URI
schemes. It reports `HALFCODE_MESSAGE_DSL_LEGACY_VOCABULARY` for retired
canonical spellings when they occur in a FrontendApp v1 bundle. The legacy
bundle/codecs continue to use their own isolated model and are not aliases in
the canonical scheme table.

The migration updates all non-legacy fixture bundles. At least one executable
counter command and one cross-route event wire demonstrate both halves of the
new protocol.
