# Schema Editor Boundaries

## Public Package Boundary

Compiler consumers use the logic package root. It also re-exports the neutral contract types used by the compiler examples:

```ts
import {
  compileEditorPlan,
  createSchemaEditorCompilerRuntime,
  type EditorCompilerInput,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-logic';
```

The stable compiler surface is:

- `compileEditorPlan`;
- `createSchemaEditorCompilerRuntime`;
- `createDefaultSchemaEditorDialect`;
- `composeSchemaEditorDialects`;
- `EditorCompilerInput`, `EditorCompilerConfig`, `EditorCompilerRuntime`, `EditorCompilerDialect`, and `CreateEditorCompilerRuntimeOptions`.
- `EditorCompilerFieldContext`, the typed inherited field Data used by recursive transformers.

The package exports only `"."`. Consumers do not import `src/schema-editor/*`, a `./schema-editor` subpath, selector/transformer internals, renderer modules, support runtime modules, VFS, XNL mutation, persistence clients, or Flow-specific helpers.

## Data / Code Split

Pure data:

- `StructureSchema<T>`;
- `EditorPresentation`;
- `EditorPlan`;
- `SchemaEditorCommandTemplate`;
- `SchemaEditorCommand`;
- validation results and diagnostics.

Code-side:

- `SchemaEditorDialect`;
- `classify`;
- `transformers`.

Only the code-side dialect contains functions. All declaration data remains serializable.

`StructureSchema`, presentation, plan metadata, command data, `fieldContext`, and `identityScope` use closed serializable records. Exact callback/component/runtime/writer ownership fields are rejected recursively at type and validation boundaries; ordinary domain data such as a property named `host` remains legal.

## Compiler Runtime And Config

The runtime owns the function-bearing composed dialect:

```ts
const runtime = createSchemaEditorCompilerRuntime();
const plan = compileEditorPlan(
  runtime,
  { schema },
  { planId: 'profile.editor' },
);
```

`compileEditorPlan(runtime, input, config)` is the public processor. Compile `config` is a plain serializable options record; the documented option is `planId`. It never carries `dialect`, a function, `resolver`, `registry`, `classifier`, or caller-owned `precedence`.

Every `classify` and transformer processor has exactly three parameters: `fn(runtime, input, config)`. Child recursion is a message to `runtime.compile(childInput, config)`; there is no fourth compile callback. Custom recursive transformers receive and propagate `fieldContext` plus `identityScope` as inherited Data, so they can preserve required/display facts and anonymous identity without changing value paths.

## Support Runtime Boundary

Runtime consumers use the support package root:

```ts
import {
  createSchemaEditorSession,
  lowerEditorPlan,
  resolveSchemaEditorCommand,
  resolveSchemaEditorScopeBridge,
} from 'dg-cell-mvi-halfcode-support';
```

The four APIs are three-parameter Processors/Actor factories. Support owns descriptor-safe command materialization, accepted-state session projection, typed Scope capability projection and pure canonical source lowering.

Support lowering may use neutral `xnl-core` AST/parser/stringifier APIs to generate source. It does not own an XNL mutation writer, VFS/database persistence, browser IO, Flow runtime or host-specific state mutation. The support package exports only `"."`; consumers do not import `src/schema-editor/*`.

## Vue Renderer Public Boundary

Vue consumers use the package root:

```ts
import {
  createSchemaEditorCanonicalRegistry,
  createSchemaEditorPresenterRegistry,
  renderSchemaEditorNode,
  SchemaEditorSessionRenderer,
} from 'dg-cell-mvi-halfcode-vue';
```

The package exports only `"."`; consumers do not import `src/schema-editor/*` or a `./schema-editor` subpath. Presenter registry, recursive renderer, event bridge, identity projection and canonical adapter are one capsule. Public Processor/factory functions retain `fn(runtime, input, config)`.

`SchemaEditorPresenterRegistry` maps stable presenter ids to opaque Vue adapter identities. It is separate from `CanonicalComponentRegistry`, which resolves the outer `schemaEditor.Editor` component. Registry composition is explicit (`reject` or `last-wins`); no module-global service locator exists. Unknown presenter ids fail closed without an implicit raw editor.

The renderer capsule depends only on Vue and the public contract/support package roots. It does not depend on Element Plus, Flow, XNL mutation, VFS, database, browser persistence or host writers. Presenter props expose plan/value/path/options/pending/diagnostics, ordered wildcard event context and `onSchemaEditorEvent`; they do not expose runtime, session, ValueHost or a concrete command writer.

The generated bundle still contains no component implementation. At integration time `createSchemaEditorCanonicalRegistry` composes the schema-editor shell with an optional parent canonical registry. The existing `CanonicalHalfcodeRenderer` supplies the current runtime/unit/node context; the shell resolves the current Scope bridge and passes only its session to `SchemaEditorSessionRenderer`.

## Element Plus Presenter Boundary

Element Plus consumers also use only the package root:

```ts
import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusSchemaEditorCanonicalRegistry,
  createElementPlusSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';
```

These three factories retain `fn(runtime, input, config)` and create
instance-local frozen registries. The default registry resolves the 12 compiler
presenter families plus 14 format aliases. Ordered business registries may
override defaults only through explicit `last-wins` composition. The canonical
helper combines the existing Element Plus parent, the composed presenter
registry, and the existing Vue `schemaEditor.Editor` shell.

Element Plus presenters receive only toolkit-neutral presenter props and the
renderer-owned default slot. They emit normalized serializable events and do
not own Session/ValueHost/runtime, recursion, command application, host
mutation, persistence, Flow/XNL mutation, VFS, database access, or an implicit
JSON/raw/code fallback. Full usage is documented in
[Element Plus presenters](element-plus.md).

Workbench Flow schema/presentation/dialect, right-panel assembly, and XNL
mutation are now a downstream consumer responsibility already realized in the
Workbench G4 migration. The reusable Element Plus capsule still does not gain
Flow awareness from that downstream implementation.

## Host-Owned Mutation

`SchemaEditorCommandTemplate` records how an editor event supplies a future command's target and arguments. It is renderer-neutral: `event` means a serializable event payload, not a DOM or framework event object. Only `event`、`value`、`literal` sources are legal.

After runtime resolution, `SchemaEditorCommand` records the concrete requested edit. Neither template nor command includes:

- `apply` callback;
- XNL mutation writer;
- VFS/database/client persistence;
- signal setter;
- accepted snapshot feedback;
- host validation side effects.

The host chooses how to translate accepted commands into its own state and persistence model through `SchemaEditorValueHost`. `SchemaEditorSession` only projects a valid current-revision accepted snapshot; it never applies the command locally or publishes optimistic state.

`SchemaEditorCommandTemplate` exists before an interaction and records event/value/literal argument sources. After event-time resolution, concrete `SchemaEditorCommand` is still only an edit request. The support runtime owns neutral resolution and revision gating; the host remains the sole owner of command acceptance, mutation, persistence, validation side effects and authoritative revision creation.

## Unsupported Structures And Raw Editing

Unsupported structures are represented by diagnostics, normally with an unsupported presenter and an error diagnostic. There is no implicit JSON fallback.

Raw JSON/code is legal only when explicitly selected, for example:

```ts
{
  presenter: {
    id: 'raw.json.textarea',
    explicit: true,
    reason: 'presentation'
  }
}
```

This keeps "raw editing" an intentional authoring choice instead of a hidden default path.

The same rule applies to the business dialect demo. Its A/B / override runtime
never inserts a raw presenter as a rescue path. If a stable presenter id cannot
be resolved, the runtime fails closed with diagnostics instead of silently
falling back to JSON, code, or textarea editing.

## Domain Neutrality

The base contracts/compiler contain no XNL, Flow, BizProcess, or WorkFlow special case. Support lowering contains only canonical Halfcode shell source generation. Domain names and XNL mutation may appear only in a consumer-owned adapter such as the Workbench G4 capsule, never in the reusable Schema Editor base.
