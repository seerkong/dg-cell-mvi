# Design: Dual-Mode Structured Value Modal

## Stable Data Contract

EditorPresentation selects:

```ts
{
  presenter: {
    id: 'structured-value.modal',
    options: {
      defaultMode: 'visual',
      allowedModes: 'visual,json',
      rootKind: 'object'
    }
  }
}
```

Options are serializable scalar facts. Illegal modes/rootKind produce an explicit presenter diagnostic and disable Apply.

## Data Flow

```text
host/domain accepted state
  -> ValueHost accepted feedback
  -> SchemaEditorSession accepted projection
  -> presenter modal-local draft
  -> Visual or JSON projection
  -> Apply
  -> one value.change
  -> standard Schema Editor command
  -> ValueHost bridge
  -> host/domain writer
```

The host/domain writer is the only authoritative writer. ValueHost is an Effect bridge. Session keeps an accepted feedback projection and does not write the host.

## Modal Lifecycle

- Open snapshots the accepted value into a local serializable draft.
- Visual changes update only the local parsed draft.
- JSON changes update local text and parse diagnostics.
- Visual to JSON formats the parsed draft.
- JSON to Visual requires valid JSON; invalid text remains intact and the tab does not change.
- Apply requires valid JSON, serializable data, and the configured root kind.
- Apply emits exactly one event; Cancel/close emit none.
- Reopening starts from the latest accepted presenter value, not a cancelled draft.

## Runtime, Input, And Config

The default registry factory receives an explicit structured-value engine Effect implementation in its runtime, with a package-owned default:

```ts
interface StructuredValuePresenterRuntime {
  engines: {
    loadVisual(): Promise<VisualJsonEditorFactory>
    loadJson(): Promise<MonacoJsonEditorFactory>
  }
}
```

The package-owned default is a frozen Effect implementation whose functions perform dynamic imports. Tests may inject deterministic loaders. Loader promises, editor instances, models, subscriptions, and DOM targets are never stored in a module-global mutable cache.

For each render:

- `input`: accepted `props.value`, current diagnostics, and pending/read-only facts;
- `config`: serializable `presenterOptions`;
- component-local runtime: engine instances, model/subscriptions, active tab, parsed draft, raw invalid text, and loading diagnostics.

The component-local runtime is created per mounted presenter and disposed with it. It is not written into EditorPlan or Session.

## Engine Ownership

- `dg-cell-mvi-halfcode-element-plus` directly declares `vanilla-jsoneditor` and `monaco-editor`.
- Implementations are dynamically imported by presenter internals.
- The registry assembly supplies frozen engine Effect implementations to the presenter factory; the default implementation uses the package's direct dependencies.
- No transitive Workbench dependency or wrapper is used.
- Engine load failure is rendered as an actionable diagnostic. It does not fall back to textarea or another hidden path.
- Monaco editor/model and vanilla editor instance are disposed on unmount and modal close.

## Selection Rules

- Known object/map/collection schemas retain structural presenters.
- A business dialect or EditorPresentation explicitly selects `structured-value.modal`.
- `rootKind=object` enforces a free-map root.
- `rootKind=any` permits any serializable JSON root.
- Unknown presenter/options and engine failures fail closed.

## Capsule Boundary

Implementation remains under Element Plus Schema Editor internals. Consumers receive it only through `createElementPlusSchemaEditorPresenterRegistry` or canonical registry composition. Contract, logic, support, and Vue packages do not import editor engines.

Existing ownership scans are revised narrowly: JSON serialization and code-editor references are permitted only under the explicit structured-value presenter path. They remain forbidden in every structural/scalar fallback path.
