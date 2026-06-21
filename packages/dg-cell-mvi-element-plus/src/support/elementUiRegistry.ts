/**
 * dg-cell-mvi-element-plus · support/elementUiRegistry — the Element Plus impl of the UiRegistry.
 *
 * The CONCRETE Element-Plus implementation of `dg-cell-mvi-vue`'s UI-neutral `UiRegistry` contract.
 * This is the module that actually imports element-plus; `dg-cell-mvi-vue` itself stays UI-neutral and
 * only declares the interface + injection keys. Per the "UI split by PACKAGE" architecture, a
 * hypothetical `dg-cell-mvi-antd` package would ship its OWN `antdUiRegistry` instead — see
 * `codument/tracks/add-crud-view-extensions/design/ui-registry-rfc.md`.
 *
 * It unifies the two seams the crud view goes through instead of touching Element Plus directly:
 *   1. COMPONENT RESOLUTION — `resolveComponent(logicalName)` maps an authoring/logical input name
 *      ('text' | 'select' | a raw 'el-*' name | ...) to the concrete Element component to render. This
 *      is the single source of truth DgComponentRender consults (it used to inline the same tables).
 *   2. IMPERATIVE UI — `confirm` / `notify` / `message` (the prior `UiAdapter`, F10), via
 *      `ElMessageBox` / `ElNotification` / `ElMessage`.
 *
 * `elementUiRegistry` is BEHAVIOR-EQUIVALENT to the prior code it replaces:
 *   - component resolution reproduces DgComponentRender's old NAME_MAP + COMPONENT_ALIASES + el-*
 *     passthrough EXACTLY (same concrete names, same baked props), and
 *   - confirm / notify / message are the prior `elementUiAdapter` behavior verbatim.
 *
 * BACK-COMPAT: the F10 concrete surface — `elementUiAdapter`, `COMPONENT_ALIASES`,
 * `resolveElementComponentSpec` — is still exported unchanged (it just lives in this package now,
 * which is the package that depends on element-plus).
 */
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import type { ResolvedComponentSpec, UiAdapter, UiRegistry } from 'dg-cell-mvi-vue';

/**
 * Authoring name -> resolved Element component name + baked-in props (e.g. textarea => el-input type).
 * MOVED here from DgComponentRender (was its inline NAME_MAP) so the registry is the SINGLE SOURCE of
 * component resolution. Byte-identical to the prior table — do not reorder/edit entries.
 */
const ELEMENT_NAME_MAP: Record<string, ResolvedComponentSpec> = {
  text: { name: 'el-input' },
  textarea: { name: 'el-input', props: { type: 'textarea' } },
  number: { name: 'el-input-number' },
  select: { name: 'el-select' },
  switch: { name: 'el-switch' },
  date: { name: 'el-date-picker', props: { type: 'date' } },
  datetime: { name: 'el-date-picker', props: { type: 'datetime' } },
  radio: { name: 'el-radio-group' },
  checkbox: { name: 'el-checkbox-group' },
  cascader: { name: 'el-cascader' },
  'tree-select': { name: 'el-tree-select' },
  'el-input': { name: 'el-input' },
  'el-input-number': { name: 'el-input-number' },
  'el-select': { name: 'el-select' },
  'el-switch': { name: 'el-switch' },
  'el-date-picker': { name: 'el-date-picker' },
  'el-radio-group': { name: 'el-radio-group' },
  'el-checkbox-group': { name: 'el-checkbox-group' },
  'el-cascader': { name: 'el-cascader' },
  'el-tree-select': { name: 'el-tree-select' },
};

/**
 * UI-neutral logical component aliases (F10 / T6.1). ADDITIVE fallback layer: callers may describe an
 * input with a framework-neutral name (`{ name: 'input' }`) and it resolves to the Element component.
 * Consulted ONLY when `ELEMENT_NAME_MAP` has no entry, so every existing `el-*` / `text` / `select`
 * authoring name keeps resolving EXACTLY as before. Exported (back-compat — re-exported from index +
 * still importable) so a different view layer could in principle override the neutral-name mapping.
 */
export const COMPONENT_ALIASES: Record<string, ResolvedComponentSpec> = {
  input: { name: 'el-input' },
  textarea: { name: 'el-input', props: { type: 'textarea' } },
  select: { name: 'el-select' },
  number: { name: 'el-input-number' },
  switch: { name: 'el-switch' },
  'date-picker': { name: 'el-date-picker' },
  'time-picker': { name: 'el-time-picker' },
  'radio-group': { name: 'el-radio-group' },
  'checkbox-group': { name: 'el-checkbox-group' },
  cascader: { name: 'el-cascader' },
};

/**
 * The PURE resolution function (no Vue / Element call needed — it is a string -> spec lookup). The
 * single source DgComponentRender + `elementUiRegistry.resolveComponent[Spec]` share, so resolution is
 * provably identical. Resolution order reproduces the prior DgComponentRender inline logic EXACTLY:
 *   ELEMENT_NAME_MAP[name]  ->  COMPONENT_ALIASES[name]  ->  undefined (unknown).
 * Note the prior code's terminal fallback `{ name: props.name || 'el-input' }` (for an unknown name)
 * stays in DgComponentRender — it depends on the live `props.name`, so the registry returns `undefined`
 * for unknown names and the caller applies that same fallback.
 */
export function resolveElementComponentSpec(name: string): ResolvedComponentSpec | undefined {
  return ELEMENT_NAME_MAP[name] ?? COMPONENT_ALIASES[name];
}

/**
 * The default Element-Plus registry. Component resolution reproduces DgComponentRender's prior NAME_MAP
 * + COMPONENT_ALIASES tables byte-for-byte; confirm/notify/message mirror the prior `elementUiAdapter`:
 *   - confirm → `ElMessageBox.confirm(message, title, { type })` then `.then(()=>true).catch(()=>false)`.
 *   - notify  → `ElNotification[kind] ?? ElNotification.info` with `{ title?, message, duration: 2500 }`.
 *   - message → `ElMessage[kind] ?? ElMessage.info` with `{ message }`.
 */
export const elementUiRegistry: UiRegistry = {
  resolveComponent(name) {
    return resolveElementComponentSpec(name)?.name;
  },
  resolveComponentSpec(name) {
    return resolveElementComponentSpec(name);
  },
  confirm(opts) {
    return ElMessageBox.confirm(opts.message, opts.title || '提示', {
      type: (opts.type as any) || 'warning',
    })
      .then(() => true)
      .catch(() => false);
  },
  notify(opts) {
    const kind = opts.kind || 'info';
    const fn = (ElNotification as any)[kind] || ElNotification.info;
    fn({ title: opts.title, message: opts.message, duration: 2500 });
  },
  message(opts) {
    const kind = opts.kind || 'info';
    const fn = (ElMessage as any)[kind] || ElMessage.info;
    fn({ message: opts.message });
  },
};

/**
 * BACK-COMPAT default adapter. `elementUiAdapter` is the imperative-UI view of `elementUiRegistry`
 * (same confirm/notify/message). It IS the registry (a registry is a valid `UiAdapter`), so prior
 * `import { elementUiAdapter }` keeps working and resolves the identical behavior.
 */
export const elementUiAdapter: UiAdapter = elementUiRegistry;
