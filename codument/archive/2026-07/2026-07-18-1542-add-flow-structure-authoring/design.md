# Design

## Boundary

The canvas owns interaction, not Flow grammar. Product adapters own the
meaning of an insertion position and the translation to canonical Flow AST.
The workspace capsule owns mutation dry-run, validation, VFS persistence, and
reload feedback.

```text
canonical XNL/VFS
  -> product adapter
  -> visual topology + authoring action refs
  -> shared canvas interaction
  -> FlowStructureCommand
  -> MVI event/reducer/effect
  -> product adapter candidate
  -> diffNodes -> exact XnlMutation[]
  -> dry-run -> canonical loader validation
  -> VFS commit -> canonical reprojection
```

No reverse parsing of renderer pin ids is allowed. Pin ids remain visual
identity; an explicit action reference carries the adapter-owned semantic
address.

## Contracts

The shared visual package exposes a serializable and renderer-neutral action
reference:

```ts
interface VisualStructureActionRef {
  id: string
  adapterId: string
  operation: string
  address: Readonly<Record<string, string>>
  role: "insert" | "remove" | "endpoint"
}
```

The visual shell stores and returns this value unchanged. It does not switch on
`adapterId`, `operation`, or `address`. Product and canonical source revision
are bound into the opaque address by the Workbench capsule boundary; only the
product adapter validates and interprets them.

The Workbench domain command is atomic:

```ts
type FlowStructureCommand =
  | {
      kind: "node.insert"
      action: VisualStructureActionRef
      node: {
        id: string
        kind: string
        initialConfig: unknown
      }
    }
  | {
      kind: "node.remove"
      nodeId: string
      action: VisualStructureActionRef
    }
```

The adapter validates that an action reference belongs to the current
canonical revision and product before applying it. Invalid, stale, or foreign
references are rejected before persistence.

## Authoring Projection

Adapters project actions together with nodes and ports:

- root action: append a new root statement/node; for CtrlFlow this means the
  end of the continuing root sequence, before a trailing
  `Return`/`Break`/`Continue` suffix;
- CtrlFlow node bottom action: insert after the statement in its containing
  sequence;
- CtrlFlow branch port action: insert at the start of that branch, otherwise,
  strategy, or child body;
- DAG data output action: create a node and initialize its selected input with
  the referenced `flow-port`;
- DAG completion action: create a node and initialize `waitFor` with the
  referenced `flow-node`.

The adapter also projects node-removal capability and optional impact facts.
Entry, terminal, or product-protected nodes can disable removal without the
visual package learning why.

## Initial Node Draft

Clicking an insertion action creates only local editor state in the Workbench
panel actor. The visual package emits the opaque action and does not own the
draft. The user selects a node kind and stable id, then the existing Flow
schema-editor capsule projects a draft `StructureSchema`, optional
`EditorPresentation`, and defaults for that product and insertion context.

The canonical mutation is dispatched only when the draft is valid. Before the
draft opens, the panel resolves the clicked opaque action against the latest
canonical projection, preserving its semantic address while refreshing its
product/revision context. The adapter still rejects stale or foreign actions;
the panel does not weaken that boundary.

The node and its initial configuration therefore enter the adapter in one
command. The draft remains pending until canonical VFS feedback arrives.
Accepted feedback closes it and reprojects the graph; rejected feedback keeps
the draft open with a diagnostic. No placeholder node is persisted and no JSON
fallback is introduced.

## CtrlFlow Semantics

CtrlFlow topology is derived from statement order and containment.

- Insert after: insert the new statement immediately after the anchor in the
  same ordered body.
- Insert at root end: insert before a trailing terminal suffix, so a new node
  never relies on an invalid `next` edge leaving `Return`, `Break`, or
  `Continue`.
- Insert into branch/strategy: insert at the beginning of the explicitly
  addressed body.
- Remove simple statement: splice it from its containing body; predecessor and
  successor become adjacent through normal reprojection.
- Remove structural statement: remove its owned subtree as one candidate.
- Protected terminal/root statements: reject according to product contract.

Edges are a projection of sequence/containment and are not separately persisted
for these operations.

## DAGFlow Semantics

DAG topology is derived from typed `inputs` and `waitFor`.

- Insert from data output: append a canonical node and bind the selected
  default input to `flow-port://#source/port`.
- Insert from completion: append a canonical node and add
  `flow-node://#source` to its `waitFor`.
- Remove: delete the node and let the product adapter either clean inbound
  references in the same candidate or reject when a required reference would
  become invalid.

Data and completion dependencies remain distinct. The UI cannot convert one
into the other.

## Mutation And Feedback

The adapter creates a complete desired canonical AST from the accepted
snapshot and command. `diffNodes` produces one mutation batch. The same batch
is used for dry-run and VFS commit. The accepted graph is never updated from
the provisional candidate; it advances only after VFS success and canonical
reload.

Selection, viewport, and layout remain UI projections. Topology changes trigger
family-specific layout, while failed or rejected commands preserve the prior
graph and selection.

## Verification

- Contract/unit tests for action projection and stale/foreign action rejection.
- CtrlFlow tests for root, next, branch insertion and simple/structural delete.
- DAG tests for data/completion insertion and reference cleanup/rejection.
- Component tests proving the canvas passes opaque refs and does not parse
  Flow grammar.
- Visible Playwright coverage for all four products, reload, diagnostics, and
  browser errors.
- Seeded chaos that mixes selection, insert, delete, config edit, rejection,
  reload, and family switching.
