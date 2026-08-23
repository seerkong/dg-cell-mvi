# Proposal: Add AI Workflow Definition Units to Halfcode

## Why

Halfcode currently recognizes only the substrate flow products. Loading an `AICtrlWorkflow` or `AIDataWorkflow` through the generic loaders would either reject the root or erase its product profile, preventing Workbench from selecting profile-specific authoring policy.

## What

- Add `ai-ctrl-workflow` and `ai-data-workflow` Unit kinds and manifests.
- Add a profile-aware typed binding projection beside the existing substrate `HalfcodeFlowSpec`.
- Route these Units through depa-flows profile loaders and preserve both identities.
- Add canonical AppBundle fixtures and contract/loader tests.

## Goals

- Provide a stable definition-only Unit boundary for Workbench.
- Keep depa-flows as the semantic and validation authority.
- Preserve all existing flow Unit behavior.

## Non-goals

- AI workflow execution, controller construction or RunGraph state.
- New Halfcode runtime handles.
- Workbench UI implementation.

## Impact

This is an additive public contract change in Halfcode contract/support packages and their workspace dependencies.
