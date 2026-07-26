# Design: Recursive Schema Editor Compiler

## Public Processor

```ts
const plan = compileEditorPlan(
  runtime,
  { schema, presentation },
  { planId: 'profile.editor' },
)
```

`runtime` owns the composed dialect. `config` is serializable compile policy only.

## Compile Runtime

The compiler-specific runtime implements the existing compile protocol and carries the current dialect:

```ts
interface EditorCompilerRuntime extends SchemaEditorCompileRuntime {
  dialect: SchemaEditorDialect
  compile(input, config?): EditorPlanNode
}
```

A factory assembles that object from ordered dialect layers. Core transformer functions remain external processors; recursion is sent as a runtime message.

## Transformer Selection

The compiler derives candidates in fixed order:

```text
presenter:<presentation.presenter.id>
semantic:<classification.semanticType>
format:<classification.format or schema.annotations.format>
structural:<schema.kind>
unsupported
```

The dialect has no resolver field. Selection is a pure compiler function over runtime dialect data and compile input. An explicit presenter without a presenter-specific transformer is still preserved by the structural transformer; raw presenter validation remains contract-owned.

## Default Transformers

- scalar -> field plan with stable default presenter by scalar/format;
- object -> group plan, recursively ordered fields;
- array -> collection plan with wildcard item template and insert/remove/move bindings;
- map -> map plan with wildcard value template and set/remove/rename-key bindings;
- union -> union plan with recursively compiled alternatives and select binding;
- ref -> stable ref field/custom plan without IO schema resolution;
- unsupported -> custom/field plan carrying an unsupported error diagnostic.

Presentation overlays can replace presenter/options and recursively target children, item, value, and alternatives. Hidden boolean fields remain represented deterministically for later lowering; the compiler does not evaluate runtime visibility expressions.

## Command Binding Feedback

Concrete Commands describe accepted edits, but plan bindings are templates whose index/value/key arguments often come from a future UI event. If the current contract cannot represent this without fake values, introduce a serializable `SchemaEditorCommandTemplate` or equivalent event argument binding. It must remain renderer-neutral and host-write-free.

## Scoped Dialect Composition

Composition does not mutate source dialects. Later layers override transformer keys. `classify` processors compose into one three-parameter processor whose later defined semantic fields override earlier values. Independent runtimes retain independent composed dialects.

## Diagnostics And Provenance

Every plan/node records schema id/path and applicable presentation/dialect selection provenance. Missing transformer, invalid classification, duplicate plan id, or transformer output validation failures become stable diagnostics; no exception silently selects JSON.

## Boundaries

- contract <- logic dependency remains one-way;
- compiler has no renderer, DOM, dynamic import, VFS, XNL mutation, persistence, or Flow dependency;
- runtime/lowering track owns canonical App Bundle generation and presenter binding;
- Workbench owns Flow schema/presentation and XNL mutation adapter.
