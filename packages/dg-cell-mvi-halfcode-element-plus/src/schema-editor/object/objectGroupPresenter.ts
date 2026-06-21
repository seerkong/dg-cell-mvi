import {
  ElForm,
} from 'element-plus';
import { defineComponent, h } from 'vue';

import {
  readAllowedPresenterOptions,
  readSchemaEditorPresentationState,
  renderSchemaEditorFieldShell,
  schemaEditorPresenterProps,
} from '../shared/presentationShell';

const OBJECT_GROUP_FORM_OPTIONS = Object.freeze([
  'labelPosition',
  'labelWidth',
  'size',
  'inline',
  'hideRequiredAsterisk',
  'requireAsteriskPosition',
  'showMessage',
  'inlineMessage',
  'statusIcon',
] as const);

export const ObjectGroupPresenter = defineComponent({
  name: 'HalfcodeElementPlusSchemaEditorObjectGroup',
  inheritAttrs: false,
  props: schemaEditorPresenterProps,
  setup(props, { slots }) {
    return () => {
      const state = readSchemaEditorPresentationState(props);
      if (!state.visible) return null;

      const formOptions = readAllowedPresenterOptions(
        props.presenterOptions,
        OBJECT_GROUP_FORM_OPTIONS,
      );
      const children = slots.default?.();

      return h(
        'section',
        {
          class: [
            'dg-schema-editor-object-group',
            state.readOnly && 'is-readonly',
            state.pending && 'is-pending',
          ],
          'data-schema-editor-presenter': 'object.group',
          'aria-busy': String(state.pending),
          'aria-readonly': String(state.readOnly),
        },
        [
          h(
            ElForm,
            {
              ...formOptions,
              disabled: state.disabled,
              class: 'dg-schema-editor-object-group__form',
            },
            {
              default: () => renderSchemaEditorFieldShell(state, {
                content: children ?? [],
                className: 'dg-schema-editor-object-group__item',
              }),
            },
          ),
        ],
      );
    };
  },
});
