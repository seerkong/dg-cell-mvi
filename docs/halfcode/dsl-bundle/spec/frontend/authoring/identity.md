# Authoring Identity

## Identity Table

| Identity | Owner | Purpose |
|---|---|---|
| XNL `#id` | Domain XNL tree | tree alignment, move detection, mutation target and domain references |
| canonical XNL path | mutation adapter | fallback target when no explicit `#id` exists |
| `x-id` | Document occurrence runtime | local runtime instance address inside one Document Unit instance |
| live revision | authoring session | owner-local accepted fact version |
| persisted revision | persistence authority | CAS version for saved state |

## `#id` Is Not Payload Diff

`#id` is XNL tree alignment and move identity. When two snapshots retain the same
`#id`, the mutation adapter may align the node across paths and express a move.
It must not emit a normal payload update for the identity.

Replacing identity is delete plus add:

```text
<Section #before> -> <Section #after>
  => TREE_DELETE #before
   + TREE_ADD #after
```

It is not:

```text
SET_FIELD id = "after"
```

Ordinary payload fields named `id` remain ordinary payload when they are not XNL
metadata identity. The support mutation adapter calls xnl-core with
`metadataIdMode: "identity"` to preserve this distinction.

## `x-id` Is Runtime Addressing

`x-id` belongs to the Document/projection runtime occurrence address space. It
selects a mounted runtime target such as:

```text
unit-instance://<unit-instance-id>/<projection-role>/<x-id>
```

It does not participate in XNL tree alignment, move detection or identity
replacement. Changing `x-id` changes runtime address data; it does not replace
`#id` as authoring diff identity.

For addressable Document nodes with only the `main` projection role, omitted
`x-id` may default to the node `#id`. That default is an occurrence-address
convenience, not a statement that `x-id` and `#id` share authority.

## Missing Identity

Legal Domain XNL nodes may lack `#id`. They can still participate in clone-based
dry-run and ordinary payload mutation through canonical paths. They do not get
move-stable identity unless the domain source supplies explicit `#id`.
