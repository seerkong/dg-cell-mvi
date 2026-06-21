import {
  createElementPlusSchemaEditorCanonicalRegistry,
} from 'dg-cell-mvi-halfcode-element-plus';

type HasExactlyThreeParameters<T extends (...args: never[]) => unknown> =
  Parameters<T>['length'] extends 3 ? true : false;

const hasThreeParameters:
  HasExactlyThreeParameters<typeof createElementPlusSchemaEditorCanonicalRegistry> =
    true;

createElementPlusSchemaEditorCanonicalRegistry(
  {},
  {},
  {
    presenterConflict: 'last-wins',
    componentIdentity: 'Editor',
  },
);

void hasThreeParameters;
