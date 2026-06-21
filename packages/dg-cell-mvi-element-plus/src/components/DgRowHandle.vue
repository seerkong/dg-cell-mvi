<template>
  <div :class="$style.rowHandle">
    <!-- grouped runs: a same-`group` run wraps in el-button-group; an ungrouped run renders its
         single button standalone. When no button declares a group, every run is one standalone
         button (renders identically to the pre-dropdown/group behavior). -->
    <template v-for="(run, ri) in inlineRuns" :key="'run' + ri">
      <el-button-group v-if="run.group != null">
        <DgButton v-for="btn in run.buttons" :key="btn.key" :button="btn" @click="onClick(btn)" />
      </el-button-group>
      <DgButton v-else :button="run.buttons[0]" @click="onClick(run.buttons[0])" />
    </template>

    <!-- overflow dropdown (rowHandle.dropdown): the buttons past `atLeast` collapse into a "更多 ▾"
         menu; each item triggers the SAME action / onClick as it would inline. -->
    <el-dropdown
      v-if="vm.rowHandle && vm.rowHandle.dropdown && dropdownButtons.length"
      trigger="hover"
      @command="onCommand"
    >
      <el-button :class="$style.more" link>
        {{ vm.rowHandle.dropdownText }}<i class="el-icon-arrow-down" style="margin-left: 2px">▾</i>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="btn in dropdownButtons"
            :key="btn.key"
            :command="btn.key"
            :disabled="btn.disabled === true"
          >
            <i v-if="btn.icon" :class="btn.icon" />
            {{ btn.text }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgRowHandle — the per-row operation buttons (table rowHandle column).
 *
 * Renders the projected rowHandle buttons (filtered to `show`) and maps each button's `action` (a
 * plain string from the projector) + this row's `{ row, index }` onto a crud command on click:
 * view → openView, edit → openEdit, remove → confirm-then-doRemove. A button with a custom `onClick`
 * (author-defined buttons) calls that handler with `{ row, index, key }` instead. Unknown actions are
 * ignored. The projector has already resolved show/disabled to plain booleans, so there is no per-row
 * compute here.
 *
 * Two faithful ports of the reference crud rowHandle layout (additive — both off → renders exactly as before):
 *  - GROUP: the projector clusters adjacent same-`group` buttons into runs (`vm.rowHandle.groups`);
 *    a `group`-set run wraps in an el-button-group, an ungrouped run is a standalone button.
 *  - DROPDOWN (`vm.rowHandle.dropdown`): the first `atLeast` buttons stay inline (still grouped), the
 *    rest collapse into a "更多 ▾" el-dropdown whose items dispatch the same action/onClick as inline.
 *
 * The remove confirm is popped HERE (the view) using the projector's `vm.rowHandle.remove` passthrough
 * (showConfirm/confirmTitle/confirmMessage from rowHandle.remove). On accept we dispatch
 * `doRemove({ noConfirm: true })` so the crud reducer hands straight off to the remove hook chain
 * (beforeRemove → doRemove|delRequest → afterRemove → onRemoved). The remove HOOKS live at the crud
 * effect boundary; only the confirm UI is here.
 */
import { computed, inject } from 'vue';
import type { ButtonGroupRun, CrudBinding, ResolvedButton } from 'dg-cell-mvi-crud';
import { UI_ADAPTER_KEY, type CrudCommands } from 'dg-cell-mvi-vue';
import { elementUiRegistry } from '../support/elementUiRegistry';
import DgButton from './DgButton';

const props = defineProps<{
  vm: CrudBinding;
  commands: CrudCommands;
  row: any;
  index: number;
}>();

// the UI registry (provided by useCrud) — used here for its confirm; default keeps standalone usage working.
const ui = inject(UI_ADAPTER_KEY, elementUiRegistry);

/** the visible (show!==false) full button list. */
const buttons = computed<ResolvedButton[]>(() =>
  ((props.vm.rowHandle?.buttons ?? []) as ResolvedButton[]).filter((b) => b.show !== false),
);

/** cluster a button list into group-runs (adjacent same-`group` → one run; ungrouped → standalone). */
function clusterRuns(list: ResolvedButton[]): ButtonGroupRun[] {
  const runs: ButtonGroupRun[] = [];
  for (const btn of list) {
    const last = runs[runs.length - 1];
    if (btn.group != null && last && last.group === btn.group) last.buttons.push(btn);
    else runs.push({ group: btn.group, buttons: [btn] });
  }
  return runs;
}

/** the inline buttons to render as group-runs: the dropdown's inline slice when on, else all. */
const inlineRuns = computed<ButtonGroupRun[]>(() => {
  const rh = props.vm.rowHandle;
  if (rh?.dropdown) {
    return clusterRuns((rh.inlineButtons as ResolvedButton[]).filter((b) => b.show !== false));
  }
  // off: use the projector's pre-clustered runs of the full list (identical to flat when no groups).
  return (rh?.groups as ButtonGroupRun[]) ?? clusterRuns(buttons.value);
});

/** the overflow buttons (only meaningful when dropdown is on). */
const dropdownButtons = computed<ResolvedButton[]>(() =>
  ((props.vm.rowHandle?.dropdownButtons ?? []) as ResolvedButton[]).filter((b) => b.show !== false),
);

function doRemove() {
  const payload = { row: props.row, index: props.index, noConfirm: true };
  const rm = props.vm.rowHandle?.remove;
  if (rm && rm.showConfirm === false) {
    props.commands.doRemove(payload);
    return;
  }
  ui.confirm({
    message: rm?.confirmMessage || '确定要删除此记录吗?',
    title: rm?.confirmTitle || '提示',
    type: 'warning',
  }).then((ok) => {
    if (ok) props.commands.doRemove(payload);
    /* cancelled: no-op */
  });
}

/** run a button's effect: a custom onClick wins; else the built-in action → command. */
function runButton(btn: ResolvedButton) {
  if (typeof btn.onClick === 'function') {
    btn.onClick({ row: props.row, index: props.index, key: btn.key });
    return;
  }
  const payload = { row: props.row, index: props.index };
  switch (btn.action) {
    case 'view':
      props.commands.openView(payload);
      break;
    case 'edit':
      props.commands.openEdit(payload);
      break;
    case 'remove':
      doRemove();
      break;
    default:
      break;
  }
}

function onClick(btn: ResolvedButton) {
  runButton(btn);
}

/** el-dropdown menu item selected → resolve the button by key and run the same effect as inline. */
function onCommand(key: string) {
  const btn = dropdownButtons.value.find((b) => b.key === key);
  if (btn) runButton(btn);
}
</script>

<style module>
.rowHandle {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.more {
  padding: 0 4px;
}
</style>
