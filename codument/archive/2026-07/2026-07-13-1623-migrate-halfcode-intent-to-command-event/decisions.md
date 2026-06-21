# Decisions

## D1: Do not rename Intent to Action

- User decision: accepted on 2026-07-13.
- Decision: use `Command` for requests, `Event` for facts, and `Message` only
  as their abstract transport term.
- Reason: `Action` already collides with MVI/Redux actions, graph actions,
  UI actions, and BO operations.

## D2: Canonical XNL is breaking; legacy is isolated

- Decision: FrontendApp v1 accepts only command/event vocabulary and reports
  retired canonical forms. Historical bundle roots/codecs are not migrated.
- Reason: accepting two names in the canonical model would perpetuate the
  abstraction mix; compatibility belongs at an explicit legacy boundary.

## D3: Wiring transports, never transforms

- Decision: `Wire` has one `message` URI and preserves its identity.
- Reason: event-to-command conversion is dynamic behavior and belongs to
  runtime code, in keeping with halfcode's code-first boundary.
