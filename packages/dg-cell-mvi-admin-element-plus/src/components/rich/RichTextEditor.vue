<template>
  <div :class="[$style.wrap, isReadonly && $style.readonly]">
    <div v-if="!isReadonly" :class="$style.bar">
      <button
        type="button"
        :class="[$style.btn, isActive('bold') && $style.on]"
        title="加粗"
        @click="run((c) => c.toggleBold())"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        :class="[$style.btn, isActive('italic') && $style.on]"
        title="斜体"
        @click="run((c) => c.toggleItalic())"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        :class="[$style.btn, isActive('bulletList') && $style.on]"
        title="无序列表"
        @click="run((c) => c.toggleBulletList())"
      >
        • 列表
      </button>
    </div>
    <editor-content :editor="editor" :class="$style.body" />
  </div>
</template>

<script setup lang="ts">
/**
 * RichTextEditor — a v-model form control whose value is an HTML string, backed by tiptap
 * (@tiptap/vue-3 + @tiptap/starter-kit).
 *
 * v-model contract: the editor is seeded from `modelValue` on mount; on every transaction it emits
 * `update:modelValue` with `editor.getHTML()`. External modelValue changes are pushed back into the
 * editor only when they differ from the current HTML (guards the echo loop). A minimal toolbar exposes
 * bold / italic / bullet-list. `readonly` OR `disabled` (the latter set by DgFormItem in view mode)
 * makes the editor non-editable (`setEditable(false)`) — so openView shows the content read-only.
 * Output is StarterKit-only HTML (no script/style nodes), so view/cell rendering of it is safe.
 */
import { computed, onBeforeUnmount, watch } from 'vue';
import { useEditor, EditorContent, type Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';

const props = defineProps<{
  modelValue?: string;
  readonly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const isReadonly = computed(() => !!props.readonly || !!props.disabled);

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: !isReadonly.value,
  extensions: [StarterKit],
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML());
  },
});

// external value -> editor (only when it actually differs, to avoid clobbering the cursor mid-typing).
watch(
  () => props.modelValue,
  (v) => {
    const ed = editor.value;
    if (!ed) return;
    const next = v ?? '';
    if (next !== ed.getHTML()) {
      ed.commands.setContent(next, { emitUpdate: false });
    }
  },
);

// readonly/disabled toggle -> editor editable.
watch(isReadonly, (ro) => {
  editor.value?.setEditable(!ro);
});

function run(fn: (chain: any) => any) {
  const ed = editor.value;
  if (!ed) return;
  fn(ed.chain().focus()).run();
}
function isActive(name: string): boolean {
  return !!editor.value?.isActive(name);
}

onBeforeUnmount(() => {
  editor.value?.destroy();
});

// silence "Editor unused" in some tooling configs (it IS used in template via :editor).
void (editor as unknown as Editor | undefined);
</script>

<style module>
.wrap {
  width: 100%;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  overflow: hidden;
}
.wrap.readonly {
  background: var(--el-fill-color-light, #f5f7fa);
}
.bar {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: var(--el-fill-color-blank, #fff);
}
.btn {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 3px;
  background: var(--el-fill-color-blank, #fff);
  color: var(--el-text-color-regular, #606266);
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.btn:hover {
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
}
.btn.on {
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.body {
  padding: 8px 12px;
  min-height: 120px;
  font-size: 14px;
  line-height: 1.6;
}
.body :global(.ProseMirror) {
  outline: none;
  min-height: 100px;
}
.body :global(.ProseMirror > * + *) {
  margin-top: 0.6em;
}
.body :global(.ProseMirror ul) {
  padding-left: 1.2em;
  list-style: disc;
}
.body :global(.ProseMirror ol) {
  padding-left: 1.2em;
  list-style: decimal;
}
.readonly .body :global(.ProseMirror) {
  cursor: default;
}
</style>
