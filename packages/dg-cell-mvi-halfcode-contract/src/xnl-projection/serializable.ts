export type XnlProjectionSerializablePrimitive = string | number | boolean | null;

export const XNL_PROJECTION_OWNERSHIP_FIELD_NAMES = [
  'apply',
  'callback',
  'component',
  'componentConstructor',
  'databaseWriter',
  'dispatch',
  'factory',
  'function',
  'hostEffect',
  'hostWriter',
  'mutation',
  'mutationWriter',
  'persistenceClient',
  'renderer',
  'rendererEvent',
  'runtime',
  'signalSetter',
  'valueHost',
  'vcsClient',
  'vfsClient',
  'writer',
  'xnlMutationWriter',
] as const;

export type XnlProjectionOwnershipFieldName =
  | 'apply'
  | 'callback'
  | 'component'
  | 'componentConstructor'
  | 'databaseWriter'
  | 'dispatch'
  | 'factory'
  | 'function'
  | 'hostEffect'
  | 'hostWriter'
  | 'mutation'
  | 'mutationWriter'
  | 'persistenceClient'
  | 'renderer'
  | 'rendererEvent'
  | 'runtime'
  | 'signalSetter'
  | 'valueHost'
  | 'vcsClient'
  | 'vfsClient'
  | 'writer'
  | 'xnlMutationWriter';

type XnlProjectionOwnershipFieldGuards = {
  readonly [TKey in XnlProjectionOwnershipFieldName]?: never;
};

export type XnlProjectionSerializableValue =
  | XnlProjectionSerializablePrimitive
  | readonly XnlProjectionSerializableValue[]
  | XnlProjectionSerializableRecord;

export type XnlProjectionSerializableRecord = {
  readonly [key: string]: XnlProjectionSerializableValue | undefined;
} & XnlProjectionOwnershipFieldGuards;
