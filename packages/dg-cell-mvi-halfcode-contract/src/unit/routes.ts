/**
 * v3 routing and cross-page wiring (D3/D5/D6/D13).
 *
 * The route tree belongs to the app; pages carry no route/mount fields.
 * Cross-page communication is postMessage-like: the app delivers, pages never
 * hold references to each other. Wires address route *instances*
 * (`route://#id` preferred, `route://<path>` allowed), never page FQNs —
 * the same page can be mounted on several routes.
 */

import type { SerializableRecord } from './common';
import type { HalfcodeRef } from './refs';

/** App-view menu metadata on a route (AdminShellPlan compile input, D6). */
export interface RouteMenuSpec {
  icon?: string;
  order?: number;
  group?: string;
}

/**
 * One node of the app route tree (`<Route #id {...}>`).
 * `path` patterns must satisfy the target page's urlInputs.path variables
 * (`/reports/:id` ↔ `path = { id: "string" }`); mismatch is
 * HALFCODE_ROUTE_URLINPUTS_MISMATCH (compiler-track check).
 */
export interface RouteSpec {
  /** Route instance id (`#id`) — the stable wiring anchor (D13). */
  id: string;
  /** URL path pattern, e.g. '/users', '/reports/:id'. */
  path: string;
  /** Target page: page://<FQN> (a component here is HALFCODE_UNIT_KIND_MISMATCH). */
  page: HalfcodeRef;
  /** Overrides the page manifest's default title (D6). */
  title?: string;
  menu?: RouteMenuSpec;
  permission?: HalfcodeRef;
  children?: RouteSpec[];
  metadata?: SerializableRecord;
}

/**
 * Explicit cross-page message wiring (`<Wire from message to>`, D5/D13).
 * `from`/`to` must be route:// refs (route instances) — enforced by
 * validateWireSpec. A sent message with no wire is HALFCODE_MESSAGE_UNWIRED (warning).
 */
export interface WireSpec {
  from: HalfcodeRef;
  to: HalfcodeRef;
  /** The unchanged Command/Event ref delivered from source route to target route. */
  message: HalfcodeRef;
}
