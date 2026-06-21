/**
 * v3 unit DSL diagnostic codes (spec §7).
 *
 * The contract layer only fixes the codes; the checks themselves are performed
 * by the loader (G3) and compiler (G4) tracks.
 */

/** FQN registry conflict (two units declare the same FQN). */
export const HALFCODE_UNIT_FQN_CONFLICT = 'HALFCODE_UNIT_FQN_CONFLICT';
/** A tag or resolved page/component FQN has no registry entry. */
export const HALFCODE_UNIT_NOT_FOUND = 'HALFCODE_UNIT_NOT_FOUND';
/** Unit used in an illegal position (e.g. Route.page resolving to a component). */
export const HALFCODE_UNIT_KIND_MISMATCH = 'HALFCODE_UNIT_KIND_MISMATCH';
/** Category scheme ref resolved across unit boundaries (unit privacy, D7). */
export const HALFCODE_REF_PRIVACY_VIOLATION = 'HALFCODE_REF_PRIVACY_VIOLATION';
/** Scheme ref failed to parse or resolve. */
export const HALFCODE_REF_UNRESOLVED = 'HALFCODE_REF_UNRESOLVED';
/** Route path / synthetic urlInputs do not match PageContract.urlInputs. */
export const HALFCODE_ROUTE_URLINPUTS_MISMATCH = 'HALFCODE_ROUTE_URLINPUTS_MISMATCH';
/** Component instance props do not match ComponentContract props. */
export const HALFCODE_PROPS_CONTRACT_MISMATCH = 'HALFCODE_PROPS_CONTRACT_MISMATCH';
/** Capsule Requires not satisfied along the host scope chain (D14). */
export const HALFCODE_CAPSULE_REQUIRES_UNMET = 'HALFCODE_CAPSULE_REQUIRES_UNMET';
/** A Page sends a message that has no app wiring (warning). */
export const HALFCODE_MESSAGE_UNWIRED = 'HALFCODE_MESSAGE_UNWIRED';
/** A Command/Event/Message node or field violates the canonical protocol shape. */
export const HALFCODE_MESSAGE_DSL_INVALID = 'HALFCODE_MESSAGE_DSL_INVALID';
/** RuntimeInstance ref failed to resolve. */
export const HALFCODE_RUNTIME_REF_UNRESOLVED = 'HALFCODE_RUNTIME_REF_UNRESOLVED';
/** RuntimeInstance declares multiple mutually exclusive sources, or no source. */
export const HALFCODE_RUNTIME_SOURCE_AMBIGUOUS = 'HALFCODE_RUNTIME_SOURCE_AMBIGUOUS';
/** RuntimeInstance prototype ref failed to resolve. */
export const HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED = 'HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED';
/** Runtime object/factory does not satisfy the minimal runtime protocol expected by the runner. */
export const HALFCODE_RUNTIME_PROTOCOL_MISMATCH = 'HALFCODE_RUNTIME_PROTOCOL_MISMATCH';
/** Scope bindings could not be assembled into the selected runtime object (bindScope/deriveScope threw). */
export const HALFCODE_RUNTIME_SCOPE_BINDING_FAILED = 'HALFCODE_RUNTIME_SCOPE_BINDING_FAILED';
/** Runtime code (create/derive factory or dynamic code entry) threw during execution. */
export const HALFCODE_RUNTIME_EXECUTION_FAILED = 'HALFCODE_RUNTIME_EXECUTION_FAILED';
/** An injected host config resolver threw while assembling a runtime instance or Scope. */
export const HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED = 'HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED';
/** Runtime XNL declares object behavior instead of RuntimeInstance assembly data. */
export const HALFCODE_RUNTIME_DSL_UNSUPPORTED = 'HALFCODE_RUNTIME_DSL_UNSUPPORTED';

/** v3 unit diagnostic codes, in spec §7 order plus runtime-family extension codes. */
export const HALFCODE_UNIT_DIAGNOSTIC_CODES = [
  HALFCODE_UNIT_FQN_CONFLICT,
  HALFCODE_UNIT_NOT_FOUND,
  HALFCODE_UNIT_KIND_MISMATCH,
  HALFCODE_REF_PRIVACY_VIOLATION,
  HALFCODE_REF_UNRESOLVED,
  HALFCODE_ROUTE_URLINPUTS_MISMATCH,
  HALFCODE_PROPS_CONTRACT_MISMATCH,
  HALFCODE_CAPSULE_REQUIRES_UNMET,
  HALFCODE_MESSAGE_UNWIRED,
  HALFCODE_MESSAGE_DSL_INVALID,
  HALFCODE_RUNTIME_REF_UNRESOLVED,
  HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
  HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED,
  HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
  HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
  HALFCODE_RUNTIME_EXECUTION_FAILED,
  HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED,
  HALFCODE_RUNTIME_DSL_UNSUPPORTED,
] as const;

export type HalfcodeUnitDiagnosticCode = (typeof HALFCODE_UNIT_DIAGNOSTIC_CODES)[number];

export type HalfcodeUnitDiagnosticSeverity = 'error' | 'warning';

/** Default severity per code: only unwired emits are warnings (D5). */
export const HALFCODE_UNIT_DIAGNOSTIC_SEVERITY: Readonly<
  Record<HalfcodeUnitDiagnosticCode, HalfcodeUnitDiagnosticSeverity>
> = {
  [HALFCODE_UNIT_FQN_CONFLICT]: 'error',
  [HALFCODE_UNIT_NOT_FOUND]: 'error',
  [HALFCODE_UNIT_KIND_MISMATCH]: 'error',
  [HALFCODE_REF_PRIVACY_VIOLATION]: 'error',
  [HALFCODE_REF_UNRESOLVED]: 'error',
  [HALFCODE_ROUTE_URLINPUTS_MISMATCH]: 'error',
  [HALFCODE_PROPS_CONTRACT_MISMATCH]: 'error',
  [HALFCODE_CAPSULE_REQUIRES_UNMET]: 'error',
  [HALFCODE_MESSAGE_UNWIRED]: 'warning',
  [HALFCODE_MESSAGE_DSL_INVALID]: 'error',
  [HALFCODE_RUNTIME_REF_UNRESOLVED]: 'error',
  [HALFCODE_RUNTIME_SOURCE_AMBIGUOUS]: 'error',
  [HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED]: 'error',
  [HALFCODE_RUNTIME_PROTOCOL_MISMATCH]: 'error',
  [HALFCODE_RUNTIME_SCOPE_BINDING_FAILED]: 'error',
  [HALFCODE_RUNTIME_EXECUTION_FAILED]: 'error',
  [HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED]: 'error',
  [HALFCODE_RUNTIME_DSL_UNSUPPORTED]: 'error',
};
