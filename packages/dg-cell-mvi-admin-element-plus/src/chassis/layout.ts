/**
 * dg-cell-mvi-admin-element-plus · chassis/layout — the shared sidebar-collapsed UI state (P4·T4.2).
 *
 * `collapsed` is a PURE UI局部态 (the sidebar's fold state) that is shared by two components — the sidebar
 * (which renders folded/unfolded) and the header (whose fold button toggles it). Because it crosses
 * components, it lives at the chassis assembly root as a single module-singleton `ref` (the same shape as
 * the chassis store singletons in stores.ts), so both consumers read/write the SAME value.
 *
 * Why a shared ref and NOT the settings actor (decisions §9 / T4.2 note): the settings actor owns
 * theme/locale (1-级 persisted facts); a transient fold toggle is not (yet) a persisted fact and adding a
 * `collapsed` field would touch the admin-contract + admin-logic reducer — out of T4.2 scope. P6 (settings
 * persistence) is where this would graduate into a persisted settings field if desired; until then a
 * shared ref is the minimal correct home for a cross-component UI toggle. It is NOT a menu/breadcrumb
 * store (those stay projections) — just one boolean of view chrome.
 */
import { ref, type Ref } from 'vue';

/** the shared sidebar fold state — `true` collapses the aside to a 64px icon rail. */
export const collapsed: Ref<boolean> = ref(false);

/** flip the fold state (the header's fold button calls this). */
export function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
}
