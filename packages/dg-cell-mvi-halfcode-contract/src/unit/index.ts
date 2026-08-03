/**
 * v3 hierarchical unit DSL contracts (mission redesign-halfcode-hierarchical-unit-dsl).
 *
 * Pure declarations + pure parse/validate helpers. No IO, no resolution —
 * loader (G3) and compiler (G4) tracks consume these types.
 * This partition never imports v2 element/material/canonical types; only the
 * serializable base types from ../common are shared.
 */

export * from './common';
export * from './refs';
export * from './unit';
export * from './element';
export * from './routes';
export * from './contracts';
export * from './document';
export * from './messages';
export * from './plans';
export * from './runtime';
export * from './dataGraph';
export * from './flow';
export * from './diagnostics';
export * from './validation';
