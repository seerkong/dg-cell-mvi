# Proposal: Remove Legacy Intent Codecs and Vocabulary

## Why

The previous migration established Command/Event as the canonical halfcode
protocol, but its implementation still contains compatibility branches,
legacy fixtures, and public full-code APIs named `Intent`. That leaves two
protocol vocabularies in the product and makes it possible for the retired DSL
to re-enter through an old loader or artifact codec.

The product does not need to load historical halfcode bundles. The retired
protocol should therefore be deleted rather than retained as a compatibility
surface.

## Goal

- Remove Intent-specific types, domains, URI schemes, parser branches,
  compiler projections, diagnostics, and fixtures from active code.
- Make Command/Event the only active message vocabulary in both repositories.
- Rename active full-code command-dispatch APIs such as `CrudIntents` and
  `core.intents` to `CrudCommands` and `core.commands`.
- Keep `AppEvent` as the generic transport value where it is still needed.

## Non-goals

- Do not redesign the Command/Event semantics or data graph.
- Do not remove generic event transport, effect, runtime, or graph behavior.
- Do not rewrite Codument archive/history records; they are audit records, not
  executable compatibility code.

## Breaking Changes

Old `HalfcodeDocument` Intent fields, old `halfcode-intents` domains, old
`intents://` references, old legacy fixture directories, and full-code
`intents` command-dispatch properties are removed. Consumers must use
Command/Event DSL and `commands` APIs.

## Acceptance

Active source, halfcode docs, and canonical fixtures contain no retired Intent
vocabulary. The three halfcode packages, the affected CRUD packages, and the
workbench flow-editor tests pass after the cleanup.
