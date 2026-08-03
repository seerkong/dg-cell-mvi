# Authoring Contracts

## Data / Code Split

| Data facts | Code/runtime capabilities |
|---|---|
| `XnlAuthoringAcceptedSnapshot` | `XnlAuthoringRuntime.domain.materializeCandidate` |
| `XnlAuthoringProposal` | `XnlAuthoringRuntime.domain.validateCandidate` |
| `XnlAuthoringCandidate` | `XnlAuthoringRuntime.mutations.diff` |
| mutation batch facts | `XnlAuthoringRuntime.mutations.dryRun` |
| live revision / persisted revision | `XnlAuthoringRuntime.revision.nextLiveRevision` |
| persistence result / receipt | `XnlAuthoringRuntime.persistence.read/persist` |
| diagnostics and serializable metadata | `XnlAuthoringRuntime.invalidation.publish` |

Authoring facts are plain, finite, readonly serializable data. They must not
contain functions, classes, accessors, runtime objects, registries, writers,
VFS/VCS authorities, DOM handles or renderer instances.

There is no Authoring DSL. XNL source may contain ordinary Domain XNL and
Document `x-id` address facts, but it does not contain authoring functions,
authoring ports, validators, persistence clients, revision allocators or control
authority.

## Processor Shape

All public processors preserve the same boundary:

```ts
output = fn(runtime, input, config)
```

`runtime` owns long-lived capabilities. `input` carries the call-local fact such
as accepted snapshot, proposal, source or expected revision. `config` carries
serializable policy values only.

Examples of values that belong in `input` or `config`:

- proposal id, base live revision, command data and source occurrence identity;
- `expectedLiveRevision` for retry/reload control calls;
- serializable submit policy such as conflict/diagnostic mode.

Examples of values that must stay out of `input` and `config`:

- materializer, validator, diff/dry-run or Presenter functions;
- persistence authority, VFS writer, VCS repository or save client;
- session factory, proposal/control ports or mutable AST handles.

## Public Surface

Consumers import from package roots. The contract package owns the data types,
runtime port types, facets and validators:

```ts
import type {
  XnlAuthoringRuntime,
  XnlAuthoringProposal,
  XnlAuthoringSessionFactoryPort,
  XnlAuthoringProposalPort,
  XnlAuthoringControlPort,
  XnlAuthoringSessionState,
} from 'dg-cell-mvi-halfcode-contract';
```

The logic package owns the pure coordinator:

```ts
import { submitAuthoringEdit } from 'dg-cell-mvi-halfcode-logic';
```

The support package owns runtime adapters and session/facet factories:

```ts
import {
  createXnlAuthoringSessionFactory,
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringViewScopeFacet,
  createXnlCoreAuthoringMutationPort,
  createXnlVfsAuthoringPersistencePort,
} from 'dg-cell-mvi-halfcode-support';
```

`contract <- logic <- support` remains the dependency direction. Contract and
logic do not import xnl-core, xnl-vfs, Tiptap, ProseMirror, Vue, DOM or product
runtime code.
