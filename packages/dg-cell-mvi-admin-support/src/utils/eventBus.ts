/**
 * dg-cell-mvi-admin-support · utils/eventBus — the framework-neutral mitt event bus.
 *
 * Mirrors the reference project's `util.mitt` (a single `mitt()` instance) but typed + factory-first:
 *   - `createEventBus<Events>()` — a fresh, typed emitter (use in tests / when isolation is wanted).
 *   - `eventBus` — a shared default singleton for app-wide cross-cutting signals.
 *
 * This is a *generic* bus for loose UI signals (e.g. "open settings drawer", "global error toast").
 * It is NOT the actor message channel: cross-actor domain facts (login/logout/permissionLoaded) flow
 * through the DEPA effect feedback loop (admin-contract DOMAIN_MESSAGE), not through mitt.
 */
import mitt, { type Emitter } from 'mitt';

/**
 * The chassis event map seam. Open-ended (`[k: string]: unknown`) so apps add their own events
 * without forking the type; concrete event keys can be narrowed by passing a custom map to
 * `createEventBus<MyEvents>()`.
 */
export type AdminEvents = {
  /** request the settings drawer be opened (UI signal; P6). */
  'settings:open': void;
  /** a global error surfaced for a toast/banner (P4 global error handling). */
  'app:error': { message: string };
  // apps may emit/listen to additional string-keyed events:
  [k: string]: unknown;
};

/** A typed mitt emitter over a caller-chosen event map (defaults to `AdminEvents`). */
export type EventBus<Events extends Record<string, unknown> = AdminEvents> = Emitter<Events>;

/** Create a fresh, typed event bus. Prefer this in tests / for scoped buses. */
export function createEventBus<
  Events extends Record<string, unknown> = AdminEvents,
>(): EventBus<Events> {
  return mitt<Events>();
}

/** The shared default bus — one instance for app-wide signals. */
export const eventBus: EventBus = createEventBus();
