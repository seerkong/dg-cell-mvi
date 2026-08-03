export type XnlAuthoringSerializablePrimitive = string | number | boolean | null;

export const XNL_AUTHORING_OWNERSHIP_FIELD_NAMES = [
  'apply',
  'callback',
  'dispatch',
  'factory',
  'function',
  'hostEffect',
  'hostWriter',
  'persistenceClient',
  'registry',
  'renderer',
  'runtime',
  'valueHost',
  'vcsClient',
  'vfsClient',
  'writer',
] as const;

/** Revision and persistence authority that must never be supplied by an interaction. */
export const XNL_AUTHORING_REVISION_AUTHORITY_FIELD_NAMES = [
  'revision',
  'currentRevision',
  'baseLiveRevision',
  'liveRevision',
  'persistedRevision',
  'previousRevision',
  'expectedLiveRevision',
  'actualLiveRevision',
  'expectedPersistedRevision',
  'actualPersistedRevision',
  'discardedLiveRevision',
  'persistenceReceipt',
  'commitId',
] as const;

export type XnlAuthoringRevisionAuthorityFieldName =
  (typeof XNL_AUTHORING_REVISION_AUTHORITY_FIELD_NAMES)[number];

export type XnlAuthoringOwnershipFieldName =
  (typeof XNL_AUTHORING_OWNERSHIP_FIELD_NAMES)[number];

export type XnlAuthoringOwnershipFieldGuards = {
  readonly [TKey in XnlAuthoringOwnershipFieldName]?: never;
};

export type XnlAuthoringMetadataValue =
  | XnlAuthoringSerializablePrimitive
  | readonly XnlAuthoringSerializablePrimitive[];

export type XnlAuthoringMetadata = {
  readonly [key: string]: XnlAuthoringMetadataValue;
} & XnlAuthoringOwnershipFieldGuards;

export type XnlAuthoringSerializableValue =
  | XnlAuthoringSerializablePrimitive
  | readonly XnlAuthoringSerializableValue[]
  | XnlAuthoringSerializableRecord;

export type XnlAuthoringSerializableRecord = {
  readonly [key: string]: XnlAuthoringSerializableValue;
} & XnlAuthoringOwnershipFieldGuards;

type XnlAuthoringIsAny<TValue> = 0 extends (1 & TValue) ? true : false;

export type XnlAuthoringReadonlySerializable<TValue> =
  XnlAuthoringIsAny<TValue> extends true
    ? never
    : unknown extends TValue
      ? never
      : TValue extends XnlAuthoringSerializablePrimitive
        ? TValue
        : TValue extends undefined | bigint | symbol | ((...args: never[]) => unknown)
          ? never
          : TValue extends readonly (infer TItem)[]
            ? readonly XnlAuthoringReadonlySerializable<TItem>[]
            : TValue extends object
              ? Object extends TValue
                ? Readonly<TValue>
                : {
                    readonly [TKey in keyof TValue]:
                      TKey extends symbol | XnlAuthoringOwnershipFieldName
                        ? never
                        : XnlAuthoringReadonlySerializable<Exclude<TValue[TKey], undefined>>
                  }
              : never;

export type XnlAuthoringEmptyInput = Readonly<Record<string, never>>;
export type XnlAuthoringEmptyConfig = Readonly<Record<string, never>>;
