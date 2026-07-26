# Change: Add Schema Editor Business Dialect Reuse Demo

## Context And Why

The Schema Editor base already separates semantic schema, presentation data,
code-side dialects, renderer registries, Scope runtime, and host-owned
mutation. The mission still needs a concrete proof that these boundaries let a
project reuse property editing capabilities while allowing different business
contexts to interpret the same field differently.

Without an executable A/B proof, scoped composition can regress into copied
schemas, presentation-embedded components, global registries, or plan-only
tests that never exercise the canonical runtime and accepted-state loop.

## Goals

- Reuse one unchanged `user.phone` schema in two bounded contexts.
- Give business A and B different classifiers, transformers, presenters, and
  interaction behavior through isolated Scope layers.
- Reuse shared address, reference, and enum property capabilities in multiple
  editors.
- Demonstrate editor-instance later-wins override without sibling pollution.
- Execute visible interactions through canonical lowering, runtime, Session,
  ValueHost, and accepted feedback.
- Document a repeatable business property capsule extension pattern.

## Non-Goals

- Add business A/B behavior to generic packages.
- Add a generic database, XNL, or VFS writer to Schema Editor.
- Make EditorPresentation executable or component-bearing.
- Replace existing default Element Plus presenters.
- Design a form-builder product or a new DSL grammar.

## What Changes

- Add RED contracts for business-neutral ownership and scoped runtime behavior.
- Add a demo-only shared business property capsule with stable ids and
  reusable transformer/presenter entries.
- Add two sibling bounded-context demos using the same schema and different
  phone behavior.
- Add a single editor-instance override case and shared address/ref/enum reuse.
- Add canonical runtime and interaction tests for accepted, rejected,
  conflict, delayed, and isolated outcomes.
- Update Schema Editor extension documentation and add independent
  verification.

## Impact

The primary output is a reusable demo capsule, fixtures, tests, and
documentation in `dg-cell-mvi`. Generic package APIs may receive only
business-neutral fixes discovered by the demo; any such iteration must retain
existing public package roots and DEPA ownership boundaries.

