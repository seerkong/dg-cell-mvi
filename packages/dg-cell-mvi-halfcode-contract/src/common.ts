export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue =
  | SerializablePrimitive
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export type SerializableRecord = { [key: string]: SerializableValue };

export type HalfcodeId = string;
export type HalfcodeVersion = string;

export interface HalfcodeIdentity {
  id: HalfcodeId;
  version: HalfcodeVersion;
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: SerializableRecord;
}

export interface VersionedRef {
  id: HalfcodeId;
  version?: HalfcodeVersion;
}
