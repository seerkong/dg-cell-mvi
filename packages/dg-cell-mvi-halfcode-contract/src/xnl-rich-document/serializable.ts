export type XnlRichDocumentSerializablePrimitive = string | number | boolean | null;

export const XNL_RICH_DOCUMENT_OWNERSHIP_FIELD_NAMES = [
  'apply',
  'callback',
  'dispatch',
  'factory',
  'hostEffect',
  'hostWriter',
  'mutationWriter',
  'persistenceClient',
  'registry',
  'renderer',
  'runtime',
  'session',
  'submit',
  'identityAllocator',
  'valueHost',
  'vcsClient',
  'vfsClient',
  'writer',
] as const;

export type XnlRichDocumentOwnershipFieldName =
  (typeof XNL_RICH_DOCUMENT_OWNERSHIP_FIELD_NAMES)[number];

export const XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES = [
  ...XNL_RICH_DOCUMENT_OWNERSHIP_FIELD_NAMES,
  'component',
  'capsule',
] as const;

export type XnlRichDocumentGenericInputOwnershipFieldName =
  (typeof XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES)[number];

type XnlRichDocumentOwnershipFieldGuards = {
  readonly [TKey in XnlRichDocumentOwnershipFieldName]?: never;
};

export type XnlRichDocumentSerializableValue =
  | XnlRichDocumentSerializablePrimitive
  | readonly XnlRichDocumentSerializableValue[]
  | XnlRichDocumentSerializableRecord;

export type XnlRichDocumentSerializableRecord = {
  readonly [key: string]: XnlRichDocumentSerializableValue | undefined;
} & XnlRichDocumentOwnershipFieldGuards;

type XnlRichDocumentGenericInputOwnershipFieldGuards = {
  readonly [TKey in XnlRichDocumentGenericInputOwnershipFieldName]?: never;
};

export type XnlRichDocumentGenericInputValue =
  | XnlRichDocumentSerializablePrimitive
  | readonly XnlRichDocumentGenericInputValue[]
  | XnlRichDocumentGenericInputRecord;

export type XnlRichDocumentGenericInputRecord = {
  readonly [key: string]: XnlRichDocumentGenericInputValue | undefined;
} & XnlRichDocumentGenericInputOwnershipFieldGuards;
