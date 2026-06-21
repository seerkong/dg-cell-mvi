export interface StructuredValueEngineInput {
  readonly target: HTMLElement;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

export interface StructuredValueEngineInstance {
  update(value: unknown): void;
  dispose(): void;
}

export interface StructuredValueEngineFactory {
  create(input: StructuredValueEngineInput): StructuredValueEngineInstance;
}

export interface StructuredValuePresenterEngines {
  loadVisual(): Promise<StructuredValueEngineFactory>;
  loadJson(): Promise<StructuredValueEngineFactory>;
}

export const DEFAULT_STRUCTURED_VALUE_ENGINES: StructuredValuePresenterEngines =
  Object.freeze({
    async loadVisual(): Promise<StructuredValueEngineFactory> {
      const { createJSONEditor, Mode } = await import('vanilla-jsoneditor');

      return Object.freeze({
        create(input: StructuredValueEngineInput): StructuredValueEngineInstance {
          let disposed = false;
          let updating = false;
          const editor = createJSONEditor({
            target: input.target as HTMLDivElement,
            props: {
              content: { json: input.value },
              mode: Mode.tree,
              mainMenuBar: false,
              navigationBar: true,
              statusBar: true,
              onChange(content: Content) {
                if (disposed || updating || !('json' in content)) return;
                input.onChange(content.json);
              },
            },
          });

          return Object.freeze({
            update(value: unknown): void {
              if (disposed) return;
              updating = true;
              try {
                editor.updateProps({ content: { json: value } });
              } finally {
                updating = false;
              }
            },
            dispose(): void {
              if (disposed) return;
              disposed = true;
              void editor.destroy();
            },
          });
        },
      });
    },
    async loadJson(): Promise<StructuredValueEngineFactory> {
      const monaco = await import('monaco-editor');

      return Object.freeze({
        create(input: StructuredValueEngineInput): StructuredValueEngineInstance {
          let disposed = false;
          let updating = false;
          const model = monaco.editor.createModel(String(input.value ?? ''), 'json');
          const editor = monaco.editor.create(input.target, {
            automaticLayout: true,
            minimap: { enabled: false },
            model,
            occurrencesHighlight: 'off',
            scrollBeyondLastLine: false,
            tabSize: 2,
          });
          const subscription = model.onDidChangeContent(() => {
            if (!disposed && !updating) input.onChange(model.getValue());
          });

          return Object.freeze({
            update(value: unknown): void {
              if (disposed) return;
              const nextValue = String(value ?? '');
              if (model.getValue() === nextValue) return;
              updating = true;
              try {
                model.setValue(nextValue);
              } finally {
                updating = false;
              }
            },
            dispose(): void {
              if (disposed) return;
              disposed = true;
              subscription.dispose();
              editor.dispose();
              model.dispose();
            },
          });
        },
      });
    },
  });
import type { Content } from 'vanilla-jsoneditor';
