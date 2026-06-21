/**
 * v3 unit partition — shared primitives.
 *
 * The v3 hierarchical unit DSL contracts live under src/unit/ and stay isolated
 * from the v2 canonical types. Only serializable base types from ../common are
 * reused here (mission decision: v3 does not import v2 element/material/canonical types).
 */

export type {
  SerializablePrimitive,
  SerializableValue,
  SerializableRecord,
  HalfcodeVersion,
} from '../common';

/** Flow products owned by depa-flows and registered by Halfcode. */
export type FlowUnitKind =
  | 'instant-flow'
  | 'work-flow'
  | 'biz-process'
  | 'eager-data-flow';

/** Registrable unit kinds. Capsule is intentionally absent: it is the inline-only encapsulation primitive (D1). */
export type UnitKind = 'page' | 'component' | FlowUnitKind;

/** Layers a domain can belong to in the scheme table (§4). */
export type UnitLayer = UnitKind | 'app';

declare const UnitFqnBrand: unique symbol;

/**
 * Dot-separated fully qualified unit name, e.g. `dg.materials.CrudTable`.
 * `.` is reserved for FQN namespace separation; `/` is reserved for structural
 * hierarchy inside refs (D4/D7).
 */
export type UnitFqn = string & { readonly [UnitFqnBrand]: 'UnitFqn' };

export interface ParsedUnitFqn {
  fqn: UnitFqn;
  /** Namespace segments, e.g. ['dg', 'materials']. Always non-empty. */
  namespace: string[];
  /** Final segment, e.g. 'CrudTable'. */
  name: string;
}

/**
 * Error thrown by the pure v3 parse/assert helpers. Carries a stable `code`
 * so callers can map failures onto diagnostics without string matching.
 */
export class HalfcodeUnitContractError extends TypeError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HalfcodeUnitContractError';
    this.code = code;
  }
}

/**
 * Parse-level error code for malformed FQNs. This is not one of the nine v3
 * compile diagnostics (see ./diagnostics): a malformed FQN can never reach the
 * loader registry, so it fails fast at parse time with its own code.
 */
export const HALFCODE_UNIT_FQN_PARSE_ERROR = 'HALFCODE_UNIT_FQN_PARSE_ERROR';

const FQN_SEGMENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Parse a dot-separated unit FQN (`dg.materials.CrudTable`).
 *
 * Rules (D4): at least one namespace segment plus a name (>= 2 segments);
 * each segment is an identifier. Throws HalfcodeUnitContractError with
 * code HALFCODE_UNIT_FQN_PARSE_ERROR on malformed input. Pure, no IO.
 */
export function parseUnitFqn(input: string): ParsedUnitFqn {
  if (typeof input !== 'string' || input.length === 0) {
    throw new HalfcodeUnitContractError(
      HALFCODE_UNIT_FQN_PARSE_ERROR,
      'Unit FQN must be a non-empty string.',
    );
  }
  const segments = input.split('.');
  if (segments.length < 2) {
    throw new HalfcodeUnitContractError(
      HALFCODE_UNIT_FQN_PARSE_ERROR,
      `Unit FQN "${input}" must contain a dot-separated namespace (e.g. "dg.materials.CrudTable").`,
    );
  }
  for (const segment of segments) {
    if (!FQN_SEGMENT_PATTERN.test(segment)) {
      throw new HalfcodeUnitContractError(
        HALFCODE_UNIT_FQN_PARSE_ERROR,
        `Unit FQN "${input}" has an invalid segment "${segment}".`,
      );
    }
  }
  return {
    fqn: input as UnitFqn,
    namespace: segments.slice(0, -1),
    name: segments[segments.length - 1],
  };
}

/** Non-throwing FQN check. */
export function isUnitFqn(input: string): input is UnitFqn {
  try {
    parseUnitFqn(input);
    return true;
  } catch {
    return false;
  }
}

/** Validate and brand an FQN string. Throws on malformed input. */
export function asUnitFqn(input: string): UnitFqn {
  return parseUnitFqn(input).fqn;
}
