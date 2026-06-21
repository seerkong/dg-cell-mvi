# Decisions

### 1. 【P0】Editor engines

- User answer: one modal with vanilla-jsoneditor Visual and Monaco JSON tabs.
- Final decision: both engines share one local draft and are dynamically loaded.
- Status: resolved

### 2. 【P0】Mutation ownership

- Final decision: Apply emits one normalized value change; host/domain writer is the only authority; Session only stores accepted feedback projection.
- Status: resolved

### 3. 【P0】Dependency ownership

- Final decision: `dg-cell-mvi-halfcode-element-plus` directly declares both editor engines and updates workspace lockfiles; it does not depend on a Workbench wrapper.
- Status: resolved

### 4. 【P0】Engine Effect placement

- Final decision: frozen loader Effect implementations enter presenter-registry composition runtime; accepted value is input, serializable presenter options are config, and editor/model/subscription/draft facts are component-local runtime.
- Module-global mutable loader caches or engine instances are forbidden.
- Status: resolved

### 5. 【P0】Existing boundary harness

- Final decision: revise the historical blanket ban so JSON serialization and code-editor APIs are allowed only inside `structured-value.modal` internals; all implicit fallback paths remain forbidden.
- Status: resolved
