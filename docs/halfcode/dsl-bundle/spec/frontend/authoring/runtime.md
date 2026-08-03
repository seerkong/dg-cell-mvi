# Authoring Runtime Usage

## Authority Facets

Authoring has three runtime-facing surfaces:

| Surface | Visible to | Authority |
|---|---|---|
| `XnlAuthoringSessionFactoryPort` | host / assembly only | opens owner-local sessions from a runtime and source fact |
| `XnlAuthoringProposalPort` | edit Document Scope | reads immutable state, subscribes and submits proposal data |
| `XnlAuthoringControlPort` | host / assembly only | retries persistence, explicitly reloads/discards and disposes |

The edit Scope receives an exact frozen authoring facet:

```ts
{ mode: 'edit', proposal }
```

The view Scope receives only:

```ts
{ mode: 'view' }
```

View mode does not invoke the host authoring factory. Any assembly result that
leaks factory, control, session, persistence, writer or proposal authority into
view Scope fails closed and rolls back.

`XnlAuthoringProposalPort.submit(...)` is an authority-bearing method owned by the
already-opened authoring session. It is not the Projection Presenter edit-intent
channel. A Presenter edit-intent contains only serializable Interaction/Domain
Command proposal data and cannot carry this port, a session, translator, callback or
`submit` authority. A future external consumer may choose to pass translated proposal
data into this port, but that NodeView/Document submit bridge is **TIPTAP FUTURE / NOT
IMPLEMENTED BY THIS TRACK**.

## Tier 1: Preset Session Runtime

Use the default support pieces when the Domain XNL is canonical xnl-core data and
persistence is xnl-vfs revisioned storage:

```ts
const runtime = {
  domain,
  mutations: createXnlCoreAuthoringMutationPort(),
  persistence: createXnlVfsAuthoringPersistencePort(vfsAuthority),
  revision,
  invalidation,
};

const factory = createXnlAuthoringSessionFactory();
const opened = await factory.open(runtime, { id: unitInstanceId, source }, {});
```

This tier wires tested runtime adapters but still keeps all capabilities in
code. Nothing is written as XNL config or an Authoring node.

## Tier 2: Code-Bound Adapter

Use this tier when the host owns a product-specific materializer, validation
policy or persistence adapter. Scope binds the resulting runtime object; the
runtime object calls code:

```ts
const runtime: XnlAuthoringRuntime<Doc, Command, Mutation> = {
  domain: {
    materializeCandidate: materializeProductCommand,
    validateCandidate: validateProductCandidate,
  },
  mutations: productMutationPort,
  persistence: productPersistencePort,
  revision: productRevisionPort,
  invalidation: productInvalidationPort,
};
```

The XNL side may name a `RuntimeInstance` or `Scope` binding, but the functions
and authority objects stay in TypeScript.

## Tier 3: Strongly Typed Runtime Object Or Class

Use this tier when a product needs private state, prototypes, mixins or a richer
host actor. The object/class implements the authoring ports and is captured by
the established Scope runtime object protocol:

```ts
class DocumentAuthoringRuntime
  implements XnlAuthoringRuntime<Doc, Command, Mutation> {
  readonly domain = this.domainPort;
  readonly mutations = this.mutationPort;
  readonly persistence = this.persistencePort;
  readonly revision = this.revisionPort;
  readonly invalidation = this.invalidationPort;
}
```

The public Scope facade remains exact and minimal even if the trusted
implementation object has internal/private fields.

## Proposal Flow

```text
proposal port submit
  -> base live revision gate
  -> runtime.domain.materializeCandidate
  -> runtime.mutations.diff
  -> runtime.mutations.dryRun(metadataIdMode = "identity")
  -> runtime.domain.validateCandidate
  -> owner session accepts live snapshot
  -> runtime.invalidation.publish
  -> runtime.persistence.persist
```

`submitAuthoringEdit(runtime, input, config)` is pure coordinator work. The
support session owns live acceptance, invalidation, persistence feedback and
control recovery. This statement is scoped to the coordinator's return/effect
ownership; it is not a claim that arbitrary granted Presenter method closures are
pure. See [Projection Presenter and Interaction](../xnl-projection/presenter-interaction.md).
