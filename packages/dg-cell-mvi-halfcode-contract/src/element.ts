import type { HalfcodeId, HalfcodeIdentity, SerializableRecord, SerializableValue } from './common';

export type HalfcodeElement =
  | AtomicElementSpec
  | CapsuleElementSpec
  | ComponentElementSpec
  | PageElementSpec;

export type HalfcodeElementKind = HalfcodeElement['kind'];

export interface ElementTreeSpec {
  root: HalfcodeId;
  elements: HalfcodeElement[];
}

export interface BaseElementSpec extends HalfcodeIdentity {
  kind: 'atomic' | 'capsule' | 'component' | 'page';
  scopeRef?: string;
  contractRef?: string;
  propsRef?: string;
  children?: HalfcodeElement[];
  slots?: Record<string, HalfcodeElement[]>;
  annotations?: SerializableRecord;
}

export interface AtomicElementSpec extends BaseElementSpec {
  kind: 'atomic';
  tag?: string;
  ui?: string;
  text?: string;
  props?: Record<string, SerializableValue>;
}

export interface CapsuleElementSpec extends BaseElementSpec {
  kind: 'capsule';
}

export interface ComponentElementSpec extends BaseElementSpec {
  kind: 'component';
  componentRef: string;
}

export interface PageElementSpec extends BaseElementSpec {
  kind: 'page';
  route?: string;
  title?: string;
  mount?: 'standalone' | 'admin-embedded' | 'both';
}

export interface ScopeSpec extends HalfcodeIdentity {
  parentRef?: string;
  runtimeProfileRef?: string;
  configRef?: string;
  configDefRef?: string;
  stateSeedRef?: string;
  stateDefRef?: string;
  effectsRef?: string;
  effectsDefRef?: string;
}

export interface ElementContractSpec extends HalfcodeIdentity {
  propsDefRef?: string;
  slotsDefRef?: string;
  acceptsRef?: string;
  emitsRef?: string;
  exposesRef?: string;
}
