# Design: Profile-aware Halfcode Flow Units

## Contract Shape

Two Unit kinds are added:

- `ai-ctrl-workflow` -> `AICtrlWorkflowDefinitionBinding`
- `ai-data-workflow` -> `AIDataWorkflowDefinitionBinding`

`HalfcodeFlowSpec` remains the substrate definition projection for compatibility. AI Units additionally expose a `flowProfile` typed binding. A binding intentionally exposes `kind`, `substrate`, and the same `definition`; consumers can select profile policy without reconstructing identity from the substrate form, while family-generic consumers continue reading `flow`.

## Loader Dispatch

The AppBundle registration kind selects the upstream loader:

| Unit kind | Loader | Loaded FQN/version source |
|---|---|---|
| `ai-ctrl-workflow` | `loadAICtrlWorkflowSources` | `binding.definition` |
| `ai-data-workflow` | `loadAIDataWorkflowSources` | `binding.definition` |

The existing kind/FQN conflict diagnostics remain the Halfcode registry boundary. Upstream diagnostics are adapted without duplicating validation.

## Definition-only Safety

Only browser-safe source loaders and contract types are imported. Execution constructors and runtime packages are never called. The resulting Unit has no flow runtime handle merely because its definition is profile-aware.

## Compatibility

Existing four flow kinds, cross-unit schemes and loaded substrate representations remain unchanged. AI profile kinds are additive; no legacy aliases are introduced.
