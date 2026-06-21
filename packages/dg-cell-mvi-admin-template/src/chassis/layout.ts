/**
 * dg-cell-mvi-admin-template · chassis/layout — the shared sidebar-collapsed UI state.
 *
 * `collapsed` is a PURE UI局部态 (the sidebar's fold state) shared by two components — the sidebar (renders
 * folded/unfolded) and the header (whose fold button toggles it). Because it crosses components, it lives
 * at the chassis assembly root as a single module-singleton `ref`, so both consumers read/write the SAME
 * value. It is NOT a fact (no persistence) — just one boolean of view chrome.
 */
import { ref, type Ref } from 'vue';

/** the shared sidebar fold state — `true` collapses the aside to a 64px icon rail. */
export const collapsed: Ref<boolean> = ref(false);

/** flip the fold state (the header's fold button calls this). */
export function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
}
