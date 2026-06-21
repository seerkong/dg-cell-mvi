/**
 * dg-cell-mvi-element-plus · DgAdminTabs.types — the UI-facing tab shape for DgAdminTabs.
 *
 * A structural mirror of admin-contract's `TabItem` UI surface, declared HERE (a plain .ts module, not
 * inside the SFC) so the type is importable across packages — the `*.vue` ambient shim only exposes a
 * default export, so a type declared in `<script setup>` is invisible to consumers. Kept dependency-free
 * (no admin-contract import) to preserve this package's "render layer owns no admin contract" rule
 * (decisions §8); a real `TabItem[]` still assigns straight in because the shapes match structurally.
 */
export interface AdminTabItem {
  /** keep-alive key / route name (informational for the UI; identity is `fullPath`). */
  name: string;
  /** the tab identity — Element pane name + the payload of every emit. */
  fullPath: string;
  /** the label (falls back to `fullPath` when absent). */
  title?: string;
  /** keep-alive marker (not used by the bar UI; the actor derives the include list from it). */
  keepAlive?: boolean;
  /** opaque route extras the UI may read — `meta.affix === true` pins the tab (no close cross). */
  meta?: Record<string, unknown>;
}
