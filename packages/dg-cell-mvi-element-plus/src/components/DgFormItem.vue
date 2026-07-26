<template>
  <el-form-item
    :label="col.title"
    :prop="col.key"
    :error="vm.form.errors[col.key]"
    :required="isRequired(col)"
  >
    <!-- topRender: a block above the field -->
    <div v-if="col.topRender" :class="$style.block">
      <DgRender :render="col.topRender" :scope="scope" />
    </div>

    <!-- conditionalRender matched → render its `render` instead of the default component -->
    <template v-if="col.conditionalRender && col.conditionalRender.match(scope)">
      <DgRender :render="col.conditionalRender.render" :scope="scope" />
    </template>

    <!-- `render` (without conditional) always replaces the component -->
    <template v-else-if="col.render">
      <DgRender :render="col.render" :scope="scope" />
    </template>

    <!-- default: optional inline prefix + the resolved control (slot-overridable) + inline suffix -->
    <template v-else>
      <div v-if="col.prefixRender || col.suffixRender" :class="$style.inline">
        <span v-if="col.prefixRender" :class="$style.affix">
          <DgRender :render="col.prefixRender" :scope="scope" />
        </span>
        <div :class="$style.control">
          <slot :form="vm.form.form" :col="col" :value="vm.form.form[col.key]" :commands="commands">
            <DgComponentRender
              :name="col.component.name"
              :options="col.component.options"
              :selected-options="col.dict?.selectedOptions"
              :props="componentProps(col)"
              :model-value="vm.form.form[col.key]"
              @update:model-value="(v: any) => commands.setFormField(col.key, v)"
            />
          </slot>
        </div>
        <span v-if="col.suffixRender" :class="$style.affix">
          <DgRender :render="col.suffixRender" :scope="scope" />
        </span>
      </div>
      <!-- no prefix/suffix: the bare control (slot-overridable) -->
      <slot v-else :form="vm.form.form" :col="col" :value="vm.form.form[col.key]" :commands="commands">
        <DgComponentRender
          :name="col.component.name"
          :options="col.component.options"
          :selected-options="col.dict?.selectedOptions"
          :props="componentProps(col)"
          :model-value="vm.form.form[col.key]"
          @update:model-value="(v: any) => commands.setFormField(col.key, v)"
        />
      </slot>
    </template>

    <!-- bottomRender: a block below the field -->
    <div v-if="col.bottomRender" :class="$style.block">
      <DgRender :render="col.bottomRender" :scope="scope" />
    </div>

    <div v-if="col.helper" :class="$style.helper">{{ col.helper }}</div>
    <div v-if="col.dict?.error" :class="$style.dictError" role="alert">
      {{ col.dict.error }}
    </div>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import { DgRender, type CrudCommands } from 'dg-cell-mvi-vue';
import DgComponentRender from './DgComponentRender';
import {
  createElementPlusDictControlBridge,
  dispatchDictControlCommand,
} from '../support/dictControlBridge';

type FormItem = CrudBinding['form']['columns'][number];

const props = defineProps<{ col: FormItem; vm: CrudBinding; commands: CrudCommands }>();
const dictBridge = createElementPlusDictControlBridge({
  dispatch: (event) => dispatchDictControlCommand(props.commands, event),
});

/**
 * The live form-item scope handed to every render hook (and conditionalRender.match), built the same
 * way the default control reads its model: `form` is the live form data, `mode` the dialog mode,
 * `key`/`value` the field. conditionalRender.match is evaluated HERE (live), never in the projector.
 */
const scope = computed(() => ({
  form: props.vm.form.form,
  mode: props.vm.form.mode,
  key: props.col.key,
  value: props.vm.form.form[props.col.key],
}));

function isRequired(col: FormItem): boolean {
  return (col.rules || []).some((r: any) => r && r.required);
}

// Strip the v-model props (name/options handled explicitly) and force-disable in view mode.
function componentProps(col: FormItem): Record<string, any> {
  const { name, options, ...rest } = col.component || {};
  const dictProps = col.dict ? dictBridge.elementProps(col.dict) : {};
  if (props.vm.form.mode === 'view') {
    return { ...rest, ...dictProps, disabled: true };
  }
  return { ...rest, ...dictProps };
}

// Watchers observe CRUD-owned state only and dispatch protocol commands through the bridge. They
// never read a provider, construct a URL, mutate cache, or execute I/O.
watch(
  () =>
    props.col.dict?.dependencies.length &&
    (props.col.dict.triggers.length === 0 ||
      props.col.dict.triggers.includes('context-change'))
      ? JSON.stringify(props.col.dict.context)
      : undefined,
  (next, previous) => {
    if (previous !== undefined && next !== previous && props.col.dict) {
      dictBridge.dependenciesChanged(props.col.dict);
    }
  },
);

watch(
  () => props.vm.form.form[props.col.key],
  (value) => {
    if (props.col.dict?.triggers.includes('value-missing')) {
      dictBridge.valueChanged(props.col.dict, value);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => dictBridge.dispose());
</script>

<style module>
.helper {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 2px;
}
.dictError {
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 2px;
}
.block {
  display: block;
  width: 100%;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.affix {
  flex: 0 0 auto;
  color: var(--el-text-color-regular, #606266);
  white-space: nowrap;
}
.control {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
