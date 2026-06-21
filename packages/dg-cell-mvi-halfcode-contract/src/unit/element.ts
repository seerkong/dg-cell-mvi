/**
 * v3 element tree nodes (D3/D4/D6/D11/D12/D13).
 *
 * Tag form decides the resolution realm (D4):
 *   - lowercase bare tag (`h1`, `div`)        → native HTML atom, no registry lookup
 *   - reserved word (`Capsule`, `Slot`, ...)  → DSL structural node (kind field here)
 *   - dotted FQN (`dg.materials.CrudTable`,
 *     `elementPlus.ElInput`,
 *     `dg.admin.basic.ReportDetailPage`)      → registry lookup (unit or UI library)
 *
 * The v2 instance tags PageElement/ComponentElement/AtomicElement are retired;
 * there is no route/mount/title on any element node (routing lives on RouteSpec).
 * Default children are the `[...]` array segment; named slots live in the
 * `(...)` section as `<Slot #name [...]>` (D11).
 */

import type { SerializableRecord, SerializableValue } from './common';
import type { HalfcodeRef } from './refs';
import type { RuntimeScopeBindingSpec } from './runtime';

/**
 * Inline literal props (D12): static serializable values only. The value type
 * is SerializableValue, which excludes functions by construction — bindings
 * and computations go through refs or binding expressions, never inline code.
 */
export type InlineProps = Record<string, SerializableValue>;

interface UnitElementBase {
  /** Tree-local instance id (`#id`). */
  id: string;
  /** Default children (`[...]` array segment). */
  children?: UnitElementNode[];
  /** Named slots (`(...)` section, `<Slot #name [...]>`). */
  slots?: SlotSpec[];
  annotations?: SerializableRecord;
}

/**
 * Instance node: the tag is the definition name (D4) — a dotted FQN for
 * component/page/UI-library instances, or a lowercase bare tag for native
 * HTML atoms. Embedded page instances provide `urlInputs` (synthetic URL
 * inputs, same channel as the router, D2).
 */
export interface UnitInstanceElement extends UnitElementBase {
  kind: 'instance';
  /** Definition tag: dotted FQN or lowercase HTML tag. */
  tag: string;
  /** Inline literal props (static, serializable, no functions). */
  inlineProps?: InlineProps;
  /** Externally-defined props binding (config:// ...). */
  props?: HalfcodeRef;
  /** Command requested by this UI instance (command:// ...). */
  command?: HalfcodeRef;
  /** Only for embedded page instances: synthetic URL inputs (D2). */
  urlInputs?: HalfcodeRef;
}

/**
 * A lexical Scope attached to an Elements root or inline Capsule. A use either
 * references a predefined scope or owns one inline declaration; instance
 * nodes never carry Scope uses because their unit defines its own root Scope.
 */
export type ScopeUseSpec =
  | { kind: 'ref'; ref: HalfcodeRef }
  | { kind: 'inline'; scope: RuntimeScopeBindingSpec };

/**
 * Inline Capsule (D1): the only encapsulation primitive, tree-inline only —
 * it never exists as a standalone unit or manifest.
 */
export interface CapsuleElementV3 extends UnitElementBase {
  kind: 'capsule';
  scope?: ScopeUseSpec;
}

export type UnitElementNode = UnitInstanceElement | CapsuleElementV3;
export type UnitElementNodeKind = UnitElementNode['kind'];

/** Named slot content: the `#id` is the slot name (D11). */
export interface SlotSpec {
  /** Slot name (`#id`). */
  id: string;
  children?: UnitElementNode[];
}

/** v3 element tree container (halfcode-elements domain root / `[...]` body). */
export interface ElementsSpec {
  /** Tree id (domain file root `#id`). */
  id: string;
  /** Unit root lexical Scope. */
  scope?: ScopeUseSpec;
  children: UnitElementNode[];
}
