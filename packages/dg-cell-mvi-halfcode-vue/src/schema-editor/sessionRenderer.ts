import {
  defineComponent,
  h,
  onBeforeUnmount,
  shallowRef,
  watch,
  type PropType,
} from 'vue';
import type {
  EditorPlanNode,
  SchemaEditorContractValue,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  SchemaEditorSession,
  SchemaEditorSessionState,
} from 'dg-cell-mvi-halfcode-support';

import type { SchemaEditorPresenterRegistry } from './contracts';
import { createSchemaEditorRendererIdentityProjection } from './rendererIdentityProjection';
import { renderSchemaEditorNode } from './recursiveRenderer';

export const SchemaEditorSessionRenderer = defineComponent({
  name: 'SchemaEditorSessionRenderer',
  props: {
    session: {
      type: Object as PropType<SchemaEditorSession>,
      required: true,
    },
    node: {
      type: Object as PropType<EditorPlanNode>,
      required: true,
    },
    presenterRegistry: {
      type: Object as PropType<SchemaEditorPresenterRegistry>,
      required: true,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const state = shallowRef<SchemaEditorSessionState>(
      safeGetState(props.session) ?? invalidState(),
    );
    const identityProjection = shallowRef(createIdentityProjection());
    let unsubscribe: (() => void) | undefined;

    const stopSessionWatch = watch(
      () => props.session,
      (session) => {
        unsubscribe?.();
        unsubscribe = undefined;
        const current = safeGetState(session);
        if (!current) {
          state.value = invalidState();
          return;
        }
        state.value = current;
        try {
          unsubscribe = session.subscribe((next) => {
            state.value = next;
          });
        } catch {
          state.value = invalidState();
        }
      },
      { immediate: true },
    );

    const stopProjectionWatch = watch(
      () => [props.node, props.presenterRegistry, props.keyPrefix] as const,
      () => {
        identityProjection.value = createIdentityProjection();
      },
    );

    onBeforeUnmount(() => {
      unsubscribe?.();
      unsubscribe = undefined;
      stopSessionWatch();
      stopProjectionWatch();
    });

    return () => {
      const result = renderSchemaEditorNode(
        {
          presenterRegistry: props.presenterRegistry,
          identityProjection: identityProjection.value,
          session: props.session,
          sessionState: state.value,
        },
        {
          node: props.node,
          snapshot: state.value.snapshot,
        },
        { keyPrefix: props.keyPrefix },
      );
      return result.ok
        ? result.vnode
        : h('div', {
          'data-schema-editor-error': result.diagnostics[0]?.code
            ?? 'SCHEMA_EDITOR_RENDER_FAILED',
        });
    };
  },
});

function createIdentityProjection() {
  return createSchemaEditorRendererIdentityProjection(
    Object.freeze({}),
    Object.freeze({}),
    Object.freeze({}),
  );
}

function safeGetState(
  session: SchemaEditorSession,
): SchemaEditorSessionState | undefined {
  try {
    return session.getState();
  } catch {
    return undefined;
  }
}

function invalidState(): SchemaEditorSessionState {
  return Object.freeze({
    sessionId: '',
    snapshot: Object.freeze({
      value: null as SchemaEditorContractValue,
      revision: 0,
    }),
    pending: Object.freeze([]),
    diagnostics: Object.freeze([Object.freeze({
      path: '$.session',
      code: 'INVALID_SCHEMA_EDITOR_SESSION',
      message: 'Schema Editor session state is unavailable.',
    })]),
    disposed: true,
  });
}
