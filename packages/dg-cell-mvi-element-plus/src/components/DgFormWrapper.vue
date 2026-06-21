<template>
  <component
    v-if="vm.form.open"
    :is="isDrawer ? 'el-drawer' : 'el-dialog'"
    :model-value="vm.form.open"
    :title="vm.form.title"
    :class="$style.wrapper"
    :append-to-body="!inner"
    destroy-on-close
    :width="isDrawer ? undefined : width"
    :size="isDrawer ? size : undefined"
    :direction="isDrawer ? direction : undefined"
    :fullscreen="isDrawer ? undefined : fullscreen"
    :draggable="isDrawer ? undefined : draggable"
    :top="isDrawer ? undefined : top"
    :before-close="onBeforeClose"
  >
    <DgForm :vm="vm" :commands="commands">
      <!-- forward form_<key> slots through to the form items -->
      <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
        <slot :name="name" v-bind="scope" />
      </template>
    </DgForm>
    <template #footer>
      <span :class="$style.footer">
        <el-button
          v-for="btn in vm.form.buttons"
          v-show="btn.show"
          :key="btn.key"
          :type="btn.type"
          :icon="btn.icon"
          :title="btn.title"
          :disabled="btn.disabled"
          :loading="btn.action === 'submit' ? vm.form.loading : btn.loading"
          @click="onClick(btn)"
        >
          {{ btn.text }}
        </el-button>
        <!-- custom footer buttons (form.buttons) — rendered IN ADDITION to the defaults above -->
        <el-button
          v-for="btn in vm.form.customButtons"
          :key="btn.key"
          :type="btn.type"
          :icon="btn.icon"
          @click="onCustomClick(btn)"
        >
          {{ btn.text }}
        </el-button>
      </span>
    </template>
  </component>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgFormWrapper — the form dialog/drawer shell (P5: advanced wrapper behaviors).
 *
 * Reads `vm.form.wrapper` (the projector passthrough of form.wrapper) to drive el-dialog/el-drawer:
 *   - sizing/passthrough: width/size/direction + fullscreen / draggable / top / inner (→ append-to-body).
 *   - lifecycle: @open/@opened/@closed call the user's onOpen/onOpened/onClosed config fns.
 *   - beforeClose interception: if saveRemind && the form is dirty (vm.form.dirty), confirm before
 *     closing; else if a config beforeClose(done) is provided, defer to it; else close directly.
 *     "Closing" = dispatch closeForm (vm.form.open → false → the v-if unmounts the dialog; the view
 *     never mutates state). Custom footer buttons (vm.form.customButtons) render after the defaults and
 *     call their opaque onClick with a small action ctx ({ submit, close, form, mode }).
 */
import { computed, watch, nextTick, inject } from 'vue';
import type { CrudBinding, FormButton } from 'dg-cell-mvi-crud';
import { UI_ADAPTER_KEY, type CrudCommands } from 'dg-cell-mvi-vue';
import { elementUiRegistry } from '../support/elementUiRegistry';
import DgForm from './DgForm.vue';

type FooterButton = CrudBinding['form']['buttons'][number];

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

// the UI registry (provided by useCrud) — used here for its confirm; default keeps standalone usage working.
const ui = inject(UI_ADAPTER_KEY, elementUiRegistry);

// form.wrapper drives dialog-vs-drawer + size + advanced behaviors.
const wrapper = computed(() => (props.vm.form as any).wrapper || {});
const isDrawer = computed(() => {
  const is = wrapper.value.is;
  return is === 'drawer' || is === 'el-drawer';
});
const width = computed(() => wrapper.value.width || '50%');
const size = computed(() => wrapper.value.size || wrapper.value.width || '40%');
const direction = computed(() => wrapper.value.direction || 'rtl');
const fullscreen = computed(() => wrapper.value.fullscreen === true);
const draggable = computed(() => wrapper.value.draggable === true);
const top = computed(() => wrapper.value.top as string | undefined);
const inner = computed(() => wrapper.value.inner === true);

function onClick(btn: FooterButton): void {
  switch (btn.action) {
    case 'submit':
      props.commands.doSubmit();
      break;
    case 'cancel':
      // route the X/cancel through the same beforeClose guard.
      onCancel();
      break;
    default:
      break;
  }
}

/** the action ctx handed to custom buttons' onClick — submit/close dispatch the matching commands. */
function buttonCtx(): Parameters<FormButton['onClick']>[0] {
  return {
    submit: () => props.commands.doSubmit(),
    close: () => props.commands.closeForm(),
    form: props.vm.form.form,
    mode: props.vm.form.mode,
  };
}

function onCustomClick(btn: FormButton): void {
  try {
    btn.onClick?.(buttonCtx());
  } catch {
    /* a throwing custom-button handler must not break the dialog */
  }
}

/** the cancel path (footer 取消 button) — same interception as the dialog X / overlay close. */
function onCancel(): void {
  runCloseGuard(() => props.commands.closeForm());
}

/** el-dialog :before-close — el supplies its own `done`; we drive close via the closeForm command. */
function onBeforeClose(elDone?: () => void): void {
  // closing = dispatch closeForm (open → false → v-if unmount). We do NOT call el's done (the v-if
  // tear-down is what removes the dialog) — but tolerate its presence for signature compatibility.
  void elDone;
  runCloseGuard(() => props.commands.closeForm());
}

/**
 * The shared close guard: saveRemind + dirty → confirm first; else a config beforeClose(done) → defer;
 * else close immediately. `proceed` performs the actual close (dispatch closeForm).
 */
function runCloseGuard(proceed: () => void): void {
  const w = wrapper.value;
  if (w.saveRemind && props.vm.form.dirty) {
    // confirm chrome localized via the projected form binding (vm.form.closeConfirm*), resolved through
    // the injected i18n port at projection time — so it follows the app language (default = the Chinese).
    ui.confirm({
      message: props.vm.form.closeConfirmMessage,
      title: props.vm.form.closeConfirmTitle,
      type: 'warning',
    }).then((ok) => {
      if (ok) proceed();
      /* else keep the dialog open */
    });
    return;
  }
  if (typeof w.beforeClose === 'function') {
    // the user's beforeClose receives a `done` it calls to proceed with closing.
    w.beforeClose(() => proceed());
    return;
  }
  proceed();
}

// Lifecycle hooks are driven from the vm.form.open transition rather than el-dialog's own
// @open/@opened/@closed events. Under the F2 v-if-unmount (the dialog is born open and destroyed to
// close, so EP never sees a modelValue false→true transition for @open, and the leave transition is
// interrupted before @closed) those events DO NOT FIRE at all (verified). DgFormWrapper itself stays
// mounted across open/close, so a watcher on vm.form.open fires onOpen/onOpened/onClosed reliably.
watch(
  () => props.vm.form.open,
  (open, prev) => {
    if (open && !prev) {
      wrapper.value.onOpen?.();
      nextTick(() => wrapper.value.onOpened?.());
    } else if (!open && prev) {
      wrapper.value.onClosed?.();
    }
  },
);
</script>

<style module>
.footer {
  display: inline-flex;
  gap: 8px;
}
</style>
