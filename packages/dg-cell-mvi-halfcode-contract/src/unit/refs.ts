/**
 * v3 unified URI reference system (D7/D8) + domain↔scheme↔section table (D10).
 *
 * Grammar:
 *   <scheme>://<path>              hierarchical path addressing   route://reports/:id
 *   <scheme>://#<id>               node id addressing             scope://#users-filter
 *   <scheme>://#<id>/<sub-path>    anchor id, then walk structure config://#users-filter/keywordInput
 *   vfs://...                      physical addressing, passthrough (body kept verbatim)
 *
 * `.` is reserved for FQN namespaces (ids may contain dots, e.g. #users.search);
 * `/` is the only structural hierarchy separator (old `config:a.b` dotted sub-paths retired).
 * Logical schemes are singular lowercase kebab-case. Dotted domain/file facets
 * are organizational names only and never leak into the URI protocol.
 */

import { HalfcodeUnitContractError, type UnitKind, type UnitLayer } from './common';
import { HALFCODE_REF_UNRESOLVED } from './diagnostics';

declare const HalfcodeRefBrand: unique symbol;

/** Branded ref string in `<scheme>://...` form. Always a quoted string in the DSL. */
export type HalfcodeRef = string & { readonly [HalfcodeRefBrand]: 'HalfcodeRef' };

/** Physical addressing scheme (file-level, xnl-core `@/` `./` `../` semantics). */
export const VFS_SCHEME = 'vfs';

export interface ParsedHalfcodeRef {
  /** Scheme short name without `://`, e.g. 'config', 'routes', 'vfs'. */
  scheme: string;
  /**
   * Hierarchical path form (`<scheme>://<path>`). For vfs refs this is the raw
   * body after `vfs://`, kept verbatim (no structural interpretation).
   */
  path?: string;
  /** Node id form (`<scheme>://#<id>`), without the leading '#'. May contain dots. */
  id?: string;
  /** Structural sub-path after `#<id>/`, '/'-separated. */
  subPath?: string;
}

const SCHEME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function refError(input: string, reason: string): HalfcodeUnitContractError {
  return new HalfcodeUnitContractError(
    HALFCODE_REF_UNRESOLVED,
    `Invalid halfcode ref "${input}": ${reason}`,
  );
}

/**
 * Parse a v3 unified URI ref. Pure, no IO, no resolution — resolution belongs
 * to the loader. Throws HalfcodeUnitContractError (code HALFCODE_REF_UNRESOLVED)
 * on malformed input; malformed refs never pass silently.
 */
export function parseHalfcodeRef(input: string): ParsedHalfcodeRef {
  if (typeof input !== 'string' || input.length === 0) {
    throw refError(String(input), 'ref must be a non-empty string.');
  }
  if (/\s/.test(input)) {
    throw refError(input, 'ref must not contain whitespace.');
  }
  const separatorIndex = input.indexOf('://');
  if (separatorIndex === -1) {
    throw refError(input, 'ref must use the "<scheme>://" form (old "<scheme>:<name>" refs are retired).');
  }
  const scheme = input.slice(0, separatorIndex);
  const body = input.slice(separatorIndex + '://'.length);
  if (!SCHEME_PATTERN.test(scheme)) {
    throw refError(input, `scheme "${scheme}" must match ${String(SCHEME_PATTERN)}.`);
  }
  if (body.length === 0) {
    throw refError(input, 'ref body must not be empty.');
  }

  if (scheme === VFS_SCHEME) {
    // Physical addressing: keep the body verbatim, no id/sub-path semantics.
    return { scheme, path: body };
  }

  if (body.startsWith('#')) {
    const anchor = body.slice(1);
    const slashIndex = anchor.indexOf('/');
    const id = slashIndex === -1 ? anchor : anchor.slice(0, slashIndex);
    if (id.length === 0) {
      throw refError(input, 'id after "#" must not be empty.');
    }
    if (id.includes('#')) {
      throw refError(input, 'ref may contain at most one "#" anchor.');
    }
    if (slashIndex === -1) {
      return { scheme, id };
    }
    const subPath = anchor.slice(slashIndex + 1);
    if (!isValidStructuralPath(subPath) || subPath.includes('#')) {
      throw refError(input, 'sub-path after "#<id>/" must be non-empty "/"-separated segments.');
    }
    return { scheme, id, subPath };
  }

  if (body.includes('#')) {
    throw refError(input, 'the "#" anchor must directly follow "://".');
  }
  if (!isValidStructuralPath(body)) {
    throw refError(input, 'path must be non-empty "/"-separated segments.');
  }
  return { scheme, path: body };
}

function isValidStructuralPath(path: string): boolean {
  if (path.length === 0) return false;
  return path.split('/').every((segment) => segment.length > 0);
}

/** Non-throwing ref check. */
export function isHalfcodeRef(input: string): input is HalfcodeRef {
  try {
    parseHalfcodeRef(input);
    return true;
  } catch {
    return false;
  }
}

/** Validate and brand a ref string. Throws on malformed input. */
export function asHalfcodeRef(input: string): HalfcodeRef {
  parseHalfcodeRef(input);
  return input as HalfcodeRef;
}

/**
 * One row of the domain ↔ scheme ↔ single-file section table (spec §4).
 * This constant table is the single source of the mapping — loader, compiler
 * and codec all read from here instead of maintaining their own copies.
 */
export interface HalfcodeSchemeTableEntry {
  /** Domain name as registered in a unit manifest, e.g. 'config'. */
  readonly domain: string;
  /** Scheme short name without `://`; null = no logical scheme (element tree body / projection domains). */
  readonly scheme: string | null;
  /**
   * Single-file section tag hosting this domain inline, e.g. 'Config'.
   * null = no named section: halfcode-elements uses the `[...]` array segment,
   * projection domains have no inline section.
   */
  readonly sectionTag: string | null;
  /** Layers this domain can be registered on. */
  readonly layers: readonly UnitLayer[];
  /** For a main domain: scheme short name of its `-def` companion scheme. */
  readonly defScheme?: string;
  /** For a def domain: scheme short name of the main domain it accompanies. */
  readonly defOf?: string;
  /** Built-in scheme derived from app structure (pages/components/routes) rather than plain domain registration. */
  readonly builtin?: boolean;
  /** Projection domain: registered for tooling, never part of compile. */
  readonly projection?: boolean;
  /** Scope-derived registry, not a file-backed domain. */
  readonly derived?: boolean;
  /** For built-in unit registry schemes: which unit kind the scheme addresses. */
  readonly registryKind?: UnitKind;
}

/** Pseudo-domain for the built-in unit registry (`<Units>` bundle manifest section). */
export const HALFCODE_UNIT_REGISTRY_DOMAIN = 'halfcode-units';

/**
 * domain ↔ scheme ↔ single-file section, three-column table (spec §4, D7/D10).
 * Canonical rows follow docs/halfcode/dsl-bundle/spec/frontend/domains.md.
 */
export const HALFCODE_SCHEME_TABLE: readonly HalfcodeSchemeTableEntry[] = [
  { domain: 'elements', scheme: null, sectionTag: null, layers: ['page', 'component'] },
  { domain: 'contracts', scheme: 'contract', sectionTag: 'Contracts', layers: ['page', 'component'], defScheme: 'contract-def' },
  { domain: 'contracts.def', scheme: 'contract-def', sectionTag: 'ContractsDef', layers: ['page', 'component'], defOf: 'contract' },
  { domain: 'scopes', scheme: 'scope', sectionTag: 'Scopes', layers: ['page', 'component'] },
  { domain: 'commands', scheme: 'command', sectionTag: 'Commands', layers: ['page', 'component', 'app'], defScheme: 'command-def' },
  { domain: 'commands.def', scheme: 'command-def', sectionTag: 'CommandsDef', layers: ['page', 'component', 'app'], defOf: 'command' },
  { domain: 'events', scheme: 'event', sectionTag: 'Events', layers: ['page', 'component', 'app'], defScheme: 'event-def' },
  { domain: 'events.def', scheme: 'event-def', sectionTag: 'EventsDef', layers: ['page', 'component', 'app'], defOf: 'event' },
  { domain: 'config', scheme: 'config', sectionTag: 'Config', layers: ['page', 'component', 'app'], defScheme: 'config-def' },
  { domain: 'config.def', scheme: 'config-def', sectionTag: 'ConfigDef', layers: ['page', 'component', 'app'], defOf: 'config' },
  { domain: 'data.graph', scheme: 'data-graph', sectionTag: 'DataGraph', layers: ['page', 'component', 'app'] },
  { domain: 'data.graph.seed', scheme: 'data-graph-seed', sectionTag: 'DataGraphSeed', layers: ['page', 'component', 'app'] },
  { domain: 'runtime', scheme: 'runtime', sectionTag: 'Runtime', layers: ['page', 'component', 'app'] },
  { domain: 'routes', scheme: 'route', sectionTag: 'Routes', layers: ['app'], builtin: true },
  { domain: 'product', scheme: 'product', sectionTag: 'Product', layers: ['app'] },
  { domain: 'wiring', scheme: 'wiring', sectionTag: 'Wiring', layers: ['app'] },
  { domain: 'workspace', scheme: null, sectionTag: null, layers: ['app'], projection: true },
  { domain: 'fixtures', scheme: null, sectionTag: null, layers: ['app'], projection: true },
  { domain: HALFCODE_UNIT_REGISTRY_DOMAIN, scheme: 'page', sectionTag: 'Units', layers: ['app'], builtin: true, registryKind: 'page' },
  { domain: HALFCODE_UNIT_REGISTRY_DOMAIN, scheme: 'component', sectionTag: 'Units', layers: ['app'], builtin: true, registryKind: 'component' },
  { domain: HALFCODE_UNIT_REGISTRY_DOMAIN, scheme: 'eager-data-flow', sectionTag: 'Units', layers: ['app'], builtin: true, registryKind: 'eager-data-flow' },
  { domain: 'scope.runtime', scheme: 'scope-runtime', sectionTag: null, layers: ['page', 'component'], builtin: true, derived: true },
  { domain: 'scope.effects', scheme: 'scope-effect', sectionTag: null, layers: ['page', 'component'], builtin: true, derived: true },
  { domain: 'scope.data.graph', scheme: 'scope-data-graph', sectionTag: null, layers: ['page', 'component'], builtin: true, derived: true },

];

/** Built-in schemes derived from app structure (D7): unit registry + route tree. */
export const HALFCODE_BUILTIN_SCHEMES = ['page', 'component', 'eager-data-flow', 'route'] as const;
export type HalfcodeBuiltinScheme = (typeof HALFCODE_BUILTIN_SCHEMES)[number];

/** All scheme short names present in the table (logical addressing set, excludes vfs). */
export const HALFCODE_SCHEMES: readonly string[] = HALFCODE_SCHEME_TABLE
  .map((entry) => entry.scheme)
  .filter((scheme): scheme is string => scheme !== null);

/**
 * Scheme short name for a domain, or null when the domain has no logical
 * scheme (halfcode-elements, projection domains) or has more than one scheme
 * (the built-in unit registry — use schemesForDomain for those).
 */
export function domainToScheme(domain: string): string | null {
  const schemes = schemesForDomain(domain);
  return schemes.length === 1 ? schemes[0] : null;
}

/** All scheme short names registered for a domain (0, 1, or 2 for the unit registry). */
export function schemesForDomain(domain: string): string[] {
  return HALFCODE_SCHEME_TABLE
    .filter((entry) => entry.domain === domain && entry.scheme !== null)
    .map((entry) => entry.scheme as string);
}

/** Domain owning a scheme short name, or null for unknown schemes. */
export function schemeToDomain(scheme: string): string | null {
  const entry = HALFCODE_SCHEME_TABLE.find((row) => row.scheme === scheme);
  return entry ? entry.domain : null;
}

/** Single-file section tag for a domain, or null when the domain has none. */
export function sectionTagForDomain(domain: string): string | null {
  const entry = HALFCODE_SCHEME_TABLE.find((row) => row.domain === domain);
  return entry ? entry.sectionTag : null;
}

/** Full table row for a domain name. */
export function domainTableEntry(domain: string): HalfcodeSchemeTableEntry | null {
  return HALFCODE_SCHEME_TABLE.find((row) => row.domain === domain) ?? null;
}

/** Return the registered domain name. */
export function canonicalDomainForDomain(domain: string): string {
  return domain;
}

/** Full table row for a scheme short name. */
export function schemeTableEntry(scheme: string): HalfcodeSchemeTableEntry | null {
  return HALFCODE_SCHEME_TABLE.find((row) => row.scheme === scheme) ?? null;
}
