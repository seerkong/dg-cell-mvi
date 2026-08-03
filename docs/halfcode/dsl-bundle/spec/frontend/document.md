# Document Unit DSL

Document is a named frontend Unit beside Page and Component. Capsule remains
inline-only: it can appear inside a Page, Component, or Document tree, but it is
not registered as an AppBundle Unit and has no manifest.

Current implementation boundary: Document contract, XNL loader, compiler plan,
owner-local occurrence and instance registries, runtime-first
`openDocument`/`closeDocument`, and root/Capsule/Component Scope occurrence
assembly are implemented. Generic runtime-only XNL Document authoring session
binding is also implemented for edit/view Scope facets; see
[XNL Document authoring session](authoring/README.md). Definition lookup,
registry creation, assembly and authoring factory/runtime are explicit
capabilities of the runtime first argument; call-local `DocumentRuntimeConfig`,
open input, source and plan facts are data-only. Presenter, Tiptap or
ProseMirror adapter, Workbench product UI, Agent collaboration and Tiptap GetPut
are future mission stages, not implemented by this track.

## Unit Position

```xnl
<AppBundle #dg.docs.demo apiVersion="halfcode.dg-cell-mvi/v1" version="1.0.0" (
  <Units [
    <Unit {
      kind = "document"
      fqn = "dg.docs.demo.SystemDesign"
      src = "vfs://./documents/system-design.xnl"
    }>
    <Unit {
      kind = "component"
      fqn = "dg.docs.ReviewPanel"
      src = "vfs://./components/review-panel.xnl"
    }>
  ]>
)>
```

- `Page`, `Component`, and `Document` are named Units with FQN identity.
- `Document` owns a source/revision type/mode/parameters boundary, not Page
  `urlInputs` and not Component `props`/`slots`/`exposes`.
- `Capsule` is the inline composition primitive inside trees. A Capsule can own
  a local Scope, but it does not become `kind = "capsule"`.

## Source Forms

An inline programmable Document uses root `[]` as ordered Domain XNL source:

```xnl
<Document #dg.docs.demo.SystemDesign version="1.0.0" (
  <DocumentContract {
    mode = "edit"
    source = "xnl-source-ref"
    revision = "string?"
    parameters = {
      locale = "string?"
    }
  }>
  <Scope #document-root {
    runtime = "runtime-instance://#document-runtime"
  }>
  <DocumentPresentation {
    id = "system-design"
  }>
) [
  <Heading #title {
    level = 1
  } [
    "System design"
  ]>
  <dg.docs.ReviewPanel #review-panel {
    "x-id" = "review-panel"
    tone = "review"
  }>
  <Capsule #architecture {
    "x-id" = "architecture"
  } (
    <Scope #architecture-scope {
      runtime = "runtime-instance://#architecture-runtime"
    }>
  ) [
    <ArchitectureCanvas #architecture-canvas>
  ]>
]>
```

A pure-domain Document uses a single external `DocumentSource.ref` and no root
body. The external source stays UI-free and does not contribute Unit Scope or
address plan:

```xnl
<Document #dg.docs.demo.SystemDesignView version="1.0.0" (
  <DocumentContract {
    mode = "view"
    source = "xnl-source-ref"
    revision = "string?"
  }>
  <DocumentSource {
    ref = "vfs://./domain/system-design.xnl"
  }>
  <Scope #document-view-root {
    runtime = "runtime-instance://#document-runtime"
  }>
  <DocumentPresentation {
    id = "system-design-view"
  }>
)>
```

The two source forms are mutually exclusive. Both are real XNL source forms:
loader/compiler do not turn them into HTML, DOM, Tiptap JSON, or an accepted
snapshot.

## Identity

Document uses two identities with different owners:

| Identity | Owner | Purpose |
|---|---|---|
| `#id` | Domain XNL tree | node identity for tree alignment, move detection, mutation target, and domain references |
| `x-id` | Document/projection runtime occurrence | local runtime address inside one Document Unit instance |

Hard rules:

- `#id` participates in XNL tree identity matching and move detection.
- `#id` is not a normal payload update field. A retained `#id` lets diff align a
  moved node; replacing the identity is represented as delete plus add, not as a
  normal `id` field update.
- `x-id` does not participate in XNL tree alignment and cannot replace `#id`.
- Loader parses `x-id` as a structural address field, not as an inline Component
  prop.
- For an addressable node with only the `main` projection role, an omitted
  `x-id` defaults to the node `#id`.
- Multi-role or repeated occurrences must declare distinct `x-id` values.
  Duplicate active `x-id` values in one Document Unit instance are errors, not
  last-wins updates.

## URI Schemes

| URI | Owner | Meaning |
|---|---|---|
| `document://<FQN>` | static Unit registry | a Document definition reference |
| `runtime-instance://#<id>` | runtime domain in the current container | a named RuntimeInstance used by Scope assembly |
| `unit-instance://<unit-instance-id>/<projection-role>/<x-id>` | Document occurrence runtime registry | a mounted target inside one Document Unit instance |

`document://` is not a runtime occurrence address. `unit-instance://` is not a
static file or domain resolver input, and it is not a DOM selector. The compiler
stores only local address descriptors such as role, `x-id`, document node id,
and scope id; `unitInstanceId` is bound only when a Document occurrence is
opened.

## Scope Visibility

- A Document definition owns a root Scope.
- A Capsule inside the Document may define a child Scope; absent overrides, it
  sees the parent Document occurrence runtime capabilities.
- In edit mode, the Document occurrence runtime may bind a runtime-only
  authoring session into root/Capsule/Component Scope visibility as an
  `authoring` facet with only `mode = "edit"` and the proposal port. Host code
  retains factory/control authority. In view mode the facet is only
  `mode = "view"` and exposes no writer or submit capability.
- Embedded Component and Document Units compile as explicit embeds. They do not
  make the surrounding Document a Page or Component.
- Routes still target Page definitions. A `Route.page` value pointing at
  `document://...` is a kind mismatch.
- Runtime occurrence registry visibility is a runtime capability. It is not a
  module singleton, global mutable map, DOM lookup, or array-position index.

## Occurrence Runtime

- `openDocument(runtime, input, config)` resolves the static definition through
  `runtime.documentRuntime`, binds canonical `unit-instance://` refs, creates an
  owner-local instance registry, opens the runtime-only authoring facet when
  mode is edit, and assembles the occurrence Scope runtimes.
- `runtime.documentOccurrences` owns reservation, commit, host resolution,
  atomic close claim, release, and active occurrence listing. Two runtime
  owners may reuse the same `unitInstanceId`, and one definition FQN may have
  multiple isolated occurrences.
- Parent/child Document occurrences carry `{ unitInstanceId, lease }` parent
  leases. Child reserve/commit fails when the parent lease is stale or closing,
  and parent close claims committed descendants plus pending child reservations.
- Failed open rolls back partial child/root assembly, the instance registry
  namespace, and the occurrence reservation. `closeDocument` validates the
  lease, serializes concurrent close, and preserves a later remount from a stale
  close.
- The static `DocumentUnitPlan.rootScopeId` remains root Scope authority;
  assembly output must match it before commit.
- Registry creation, definition lookup, and occurrence assembly are callable
  runtime capabilities. They are not stored in input or config, and no global,
  DOM, or WeakMap authority participates.

## Fixtures

Positive XNL-only fixtures:

- `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-unit-bundles/document-units/manifest.xnl`
  registers Document and Component Units.
- `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-unit-bundles/document-units/documents/system-design.xnl`
  covers inline programmable source, Component embed, Capsule Scope, Document
  embed, explicit `x-id`, and default `x-id = #id`.
- `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-unit-bundles/document-units/documents/system-design-view.xnl`
  covers external UI-free source via `DocumentSource.ref`.
- `packages/dg-cell-mvi-halfcode-support/test/fixtures/xnl-unit-bundles/document-units/documents/domain/system-design.xnl`
  is the external Domain XNL source; it contains no UI implementation or
  Presenter declaration.

Negative fixtures:

- `document-unit-negatives/documents/duplicate-contract.xnl`,
  `duplicate-source.xnl`, `duplicate-scope.xnl`, and
  `duplicate-presentation.xnl` cover unique subdomain errors.
- `document-unit-negatives/documents/mixed-source.xnl` covers inline plus
  external source rejection.
- `document-unit-negatives/documents/duplicate-x-id.xnl` covers duplicate
  runtime address rejection.
- `document-unit-negatives/routes.xnl` covers the `document://` route-target
  negative case.

Related checks:

- `packages/dg-cell-mvi-halfcode-support/test/documentUnitBundle.red.test.ts`
  covers loader behavior and fixture diagnostics.
- `packages/dg-cell-mvi-halfcode-logic/test/documentUnitCompiler.red.test.ts`
  covers Document plan, root/Capsule Scope, embeds, `x-id`, and Page-only routes.
- `packages/dg-cell-mvi-halfcode-support/test/xnlTreeIdentity.characterization.test.ts`
  characterizes real XNL tree identity: `#id` aligns moves and identity
  replacement is delete plus add.
- `packages/dg-cell-mvi-halfcode-support/test/documentAuthoringAssembly.red.test.ts`
  and `documentRuntimeAssembly.red.test.ts` cover edit/view authoring Scope
  facets and parent/child occurrence lease lifecycle.
