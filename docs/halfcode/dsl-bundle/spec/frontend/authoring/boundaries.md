# Authoring Boundaries

## Implemented

- generic authoring contract and validation surface;
- pure candidate coordinator;
- xnl-core diff/dry-run adapter in support;
- xnl-vfs revisioned persistence adapter in support;
- owner-local session factory with proposal/control separation;
- Document edit/view Scope authoring facets;
- Document parent/child occurrence lease lifecycle.

## Not Implemented By This Track

- Tiptap Presenter or ProseMirror integration;
- Presenter edit-intent -> Tiptap NodeView/Document consumer ->
  `XnlAuthoringProposalPort.submit` bridge wiring;
- Tiptap GetPut, HTML round-trip or DOM selection mapping;
- Workbench product authoring UI, product repository adapter or demo;
- Agent collaboration UI, CRDT/OT, realtime cursors, offline merge or shared
  multi-writer session;
- automatic rebase after persistence conflict;
- xnl-vcs checkpoint authority in browser-safe support core.

These are future mission stages that may consume the generic authoring session.
Current docs must not claim they are already implemented.

The generic Document authoring session and occurrence facets listed above are
CURRENT from their owning tracks. What remains **TIPTAP FUTURE** is the consumer
wiring that takes serializable Presenter edit-intent proposal data and invokes an
authoring proposal port. Presenter data itself contains no submit authority; see
[Projection Presenter and Interaction](../xnl-projection/presenter-interaction.md).

## Residue Rules

Contract and logic authoring source must remain free of:

- xnl-core and xnl-vfs imports;
- xnl-vcs imports;
- Tiptap, ProseMirror, Vue, DOM or renderer implementation imports;
- writer or persistence authority objects in public facts.

Support may import xnl-core for the mutation adapter and
`xnl-vfs/revisioned-persistence` for the persistence adapter. Support must still
avoid Tiptap, Vue, DOM, xnl-vcs and global authoring registries.

## XNL Red Lines

- Do not add `<Authoring>`, `<AuthoringSession>`, authoring domain files or
  authoring config nodes.
- Do not place functions, factories, validators, persistence clients, VFS
  writers, session objects or control ports in XNL config/input/plan facts.
- Do not treat Presenter draft, DOM state, Vue state or Agent working memory as
  accepted Domain XNL.
- Do not compare ordinary payload to decide XNL identity. Use `#id` or canonical
  path according to the mutation adapter contract.
