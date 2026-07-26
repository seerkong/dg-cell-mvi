# Design: runtime dynamic execution

## API

```ts
executeHalfcodeRuntimeCode({
  src,
  runtime,
  input,
  config,
  instanceRefs,
  resolveSymbol,
});
```

`src` is a `vfs://...#symbol` ref. `resolveSymbol` is injected by the host, matching the runtime assembly boundary.

When `instanceRefs` is absent, the executor calls:

```ts
output = fn(runtime, input, config)
```

When `instanceRefs` is present, it calls:

```ts
output = fn(runtime, instanceRefs, input, config)
```

## Diagnostics

- Non-callable symbols emit `HALFCODE_RUNTIME_PROTOCOL_MISMATCH`.
- Resolver/call failures emit `HALFCODE_RUNTIME_SCOPE_BINDING_FAILED`.

The helper is deliberately generic. Later tracks decide how `Intent.handler`, `FuncEffect.impl`, graph node implementations, or workflow processors choose their `src`.
