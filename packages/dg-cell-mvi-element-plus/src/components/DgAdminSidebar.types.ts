/**
 * dg-cell-mvi-element-plus · DgAdminSidebar.types — the UI-facing menu node shape for DgAdminSidebar
 * (and DgAdminBreadcrumb).
 *
 * A structural mirror of admin-contract's `MenuItem` / `BreadcrumbItem` projection outputs, declared
 * HERE (a plain .ts module, not inside the SFC) so the type is importable across packages — the `*.vue`
 * ambient shim only exposes a default export, so a type declared in `<script setup>` is invisible to
 * consumers. Kept dependency-free (NO admin-contract import) to preserve this package's "render layer
 * owns no admin contract" rule (decisions §8); a real `MenuItem[]` / `BreadcrumbItem[]` (the
 * `projectMenu` / `projectBreadcrumb` outputs) still assigns straight in because the shapes match
 * structurally.
 *
 * The sidebar consumes the menu *projection* (decisions §9: `menu = projection(routes × permission)`),
 * NOT a menu store — it is fed a ready-made tree through props and renders it; it derives nothing and
 * writes nothing back.
 */

/** A rendered menu node — one entry in the (multi-level) sidebar tree. */
export interface AdminMenuItem {
  /** the route name (if any) — informational; identity for nav is `path`. */
  name?: string;
  /** navigable path (also the el-menu item/active key). */
  path: string;
  /** visible label. */
  title: string;
  /** iconify icon name (e.g. `ant-design:user-outlined`); absent = no icon. */
  icon?: string;
  /** child menu nodes (empty array for a leaf — leaves carry `[]`, never `undefined`). */
  children: AdminMenuItem[];
}

/** A breadcrumb segment — one hop in the root→current chain. */
export interface AdminBreadcrumbItem {
  path: string;
  title: string;
  icon?: string;
}
