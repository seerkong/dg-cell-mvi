/**
 * v3 unit public boundaries (D2/D5/D9/D14).
 *
 * PageContractSpec:      urlInputs + accepts/sends. No props/slots/exposes —
 *                        a page's only public input is URL shape (D2); the
 *                        `props` field does not exist at the type level and is
 *                        additionally rejected by validatePageContract.
 * ComponentContractSpec: props/slots/accepts/sends/exposes.
 * UnitElementContractSpec: per-element (esp. inline Capsule) boundary with
 *                        Requires — expectations on the host scope chain (D14).
 */

import type { SerializableRecord, UnitFqn } from './common';
import type { HalfcodeRef } from './refs';

/** Reference to a concrete Command or Event declaration. */
export interface MessageRefSpec {
  ref: HalfcodeRef;
}

/**
 * URL shape of a page (D2): variable name → type descriptor string
 * (e.g. `{ id: "string" }`, `{ keyword: "string?" }`).
 */
export interface UrlInputsSpec {
  path?: Record<string, string>;
  query?: Record<string, string>;
  hash?: Record<string, string>;
}

/** Named slot declaration in a component contract (`<SlotDef #toolbar>`). */
export interface SlotDefSpec {
  /** Slot name (the `#id`). */
  id: string;
  description?: string;
}

/**
 * Expectations an inline Capsule places on its host scope chain (D14).
 * Command/effect/config entries must be resolvable from the host Scope chain.
 */
export interface RequiresSpec {
  /** Command declarations expected from the host (command:// refs). */
  commands: HalfcodeRef[];
  /** Effect bindings expected from the host (scope-effect:// refs). */
  effects: HalfcodeRef[];
  /** Config entries expected from the host (config:// refs). */
  config: HalfcodeRef[];
}

/**
 * Contract of an element inside a unit, especially an inline Capsule.
 * Frontend contracts must not declare `input`/`output` (v2 red line, kept):
 * those fields do not exist here and are rejected by validateUnitElementContract.
 */
export interface UnitElementContractSpec {
  /** Element instance id this contract describes (tree-local `#id`). */
  id: string;
  accepts?: MessageRefSpec[];
  sends?: MessageRefSpec[];
  requires?: RequiresSpec;
  metadata?: SerializableRecord;
}

/**
 * Public boundary of a page (D2/D9): URL inputs + message traffic.
 * No props, slots or exposes channels exist for pages.
 */
export interface PageContractSpec {
  kind: 'page-contract';
  fqn: UnitFqn;
  urlInputs?: UrlInputsSpec;
  accepts?: MessageRefSpec[];
  sends?: MessageRefSpec[];
  /** Contracts of elements inside this page (inline Capsules). */
  elementContracts?: UnitElementContractSpec[];
  metadata?: SerializableRecord;
}

/** Public boundary of a component (D2/D9). */
export interface ComponentContractSpec {
  kind: 'component-contract';
  fqn: UnitFqn;
  /** Prop name → type descriptor string (e.g. `{ pageSize: "number?" }`). */
  props?: Record<string, string>;
  slots?: SlotDefSpec[];
  accepts?: MessageRefSpec[];
  sends?: MessageRefSpec[];
  /** Exposed readable surface: name → type descriptor string. */
  exposes?: Record<string, string>;
  /** Contracts of elements inside this component (inline Capsules). */
  elementContracts?: UnitElementContractSpec[];
  metadata?: SerializableRecord;
}

export type UnitContractSpec = PageContractSpec | ComponentContractSpec;
