# Design: scope runtime assembly

## API

```ts
assembleHalfcodeRuntimeUnit(unit, {
  hostRuntime,
  resolveSymbol,
  resolveConfig,
});
```

`resolveSymbol(ref)` returns the exported object/function behind a `vfs://...#symbol` ref. The default implementation is intentionally absent; integration hosts decide how to load TypeScript/JavaScript.

`resolveConfig(ref, context)` resolves `config://` refs into plain values. When omitted, config is `undefined`.

## RuntimeInstance flow

- `src`: `runtime = resolveSymbol(src)`.
- `create`: `factory = resolveSymbol(create)` then `runtime = factory(hostRuntime, input, config)`.
- `prototype + derive`: first resolve prototype runtime instance, then `runtime = derive(prototypeRuntime, input, config)`.
- `prototype` without `derive`: call `prototypeRuntime.deriveScope(input)` when available.

All code entry calls preserve DEPA's `output = fn(runtime, input, config)` shape.

## Scope flow

Each `RuntimeScopeBindingSpec` resolves `runtime://#id` into a runtime instance. The assembly input includes:

- `scopeId`
- `runtime`
- `config`
- `bindings.config`
- `bindings.intents`

If the runtime object has `bindScope`, use it. Else if it has `deriveScope`, use it. Else the scope sees the referenced object directly.

## Diagnostics

Recoverable failures are appended to diagnostics:

- `HALFCODE_RUNTIME_REF_UNRESOLVED`
- `HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED`
- `HALFCODE_RUNTIME_PROTOCOL_MISMATCH`
- `HALFCODE_RUNTIME_SCOPE_BINDING_FAILED`

The function returns partial assembly so tests and tooling can inspect what succeeded.
