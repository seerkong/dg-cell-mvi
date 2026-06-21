import { describe, it, expect } from 'vitest';

// Wiring smoke proof (T1.1): every cross-package edge the admin chassis actually depends on must
// resolve —
//   admin-logic  ->  dg-cell-mvi-core         (source, workspace)
//   admin-logic  ->  dg-cell-mvi-admin-contract (source, workspace)
//   (transitive)     dg-cell-mvi-core -> depa-data-graph-core
// If any edge fails to resolve, the corresponding import below throws at module-load time.
//
// REC-9 dependency hygiene: depa-actor / depa-processor were declared but never imported by `src/`
// (admin-logic has no executing-actor / mailbox scenario — createActorStore stays a pure machine).
// Their declarations and the smoke probes that only referenced them were removed so this test
// depends only on declared packages.

import { createStreamSignalStore } from 'dg-cell-mvi-core';
import { ADMIN_LOGIC_READY } from '../src/index';

// admin-contract is a pure-declaration package; reference a port type to prove its source resolves.
import type { HttpPort } from 'dg-cell-mvi-admin-contract';

describe('admin chassis wiring (T1.1 smoke)', () => {
  it('resolves dg-cell-mvi-core primitive', () => {
    expect(createStreamSignalStore).toBeDefined();
  });

  it('resolves dg-cell-mvi-admin-contract port type', () => {
    // Type-only edge: this assignment compiles iff admin-contract's source resolved. HttpPort now
    // carries a required `request` member (T1.3), so the stub implements it.
    const port: HttpPort = { request: async () => undefined as never };
    expect(port).toBeDefined();
  });

  it('loads admin-logic and exposes ADMIN_LOGIC_READY', () => {
    expect(ADMIN_LOGIC_READY).toBeDefined();
    expect(ADMIN_LOGIC_READY).toBe(true);
  });
});
