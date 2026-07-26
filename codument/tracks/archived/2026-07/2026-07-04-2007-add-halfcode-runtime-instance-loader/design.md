# Design: runtime instance loader projection

## Contract

The contract package already owns:

- `RuntimeInstanceSpec`
- `RuntimeSpec`
- `RuntimeScopeAssembly`
- `HalfcodeRuntimeObject`

This track adds one parse-only binding shape if needed:

```ts
export interface RuntimeScopeBindingSpec {
  scopeId: string;
  runtime?: HalfcodeRef;
  config?: HalfcodeRef;
  intents?: HalfcodeRef;
  metadata?: SerializableRecord;
}
```

## Loader projection

`LoadedHalfcodeUnit` gains:

- `runtime?: RuntimeSpec`
- `scopeRuntimeBindings: RuntimeScopeBindingSpec[]`

`runtime` is parsed from a file-backed domain named `runtime` (or an inline `<Runtime>` section). Legacy bundles simply leave it undefined.

`scopeRuntimeBindings` is parsed from `scopes` / `halfcode-scopes` domain documents. The loader does not interpret scope hierarchy; it only exposes the direct binding declared on each `<Scope>`.

## Validation

Local `RuntimeInstance` source exclusivity uses the contract helper and pushes `HALFCODE_RUNTIME_SOURCE_AMBIGUOUS` diagnostics. Ref existence continues through the existing unified ref checker:

- `runtime://#counter` resolves against the unit runtime domain;
- `config://...` and `intents://...` keep existing category-domain behavior;
- dotted schemes are collected by the ref scanner.

## Follow-up

`add-halfcode-scope-runtime-assembly` will consume these projections, resolve code symbols, and construct/derive runtime objects.
