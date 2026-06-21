/**
 * dg-cell-mvi-element-plus · DgAdminSettings.types — the UI-facing types for the settings drawer.
 *
 * Declared in a plain .ts module (not inside the SFC) so they are importable across packages — the
 * `*.vue` ambient shim only exposes a default export, so a type declared in `<script setup>` is invisible
 * to consumers (same pattern as DgAdminTabs.types / DgAdminSidebar.types). Dependency-free (no
 * admin-contract import) to preserve this package's "render layer owns no admin contract" rule
 * (decisions §8) — the host's `SUPPORTED_LOCALES` entries assign straight in because the shapes match.
 */

/** one offered locale option in the settings drawer's language select (mirrors the app's locale catalog). */
export interface AdminSettingsLocale {
  value: string;
  label: string;
}
