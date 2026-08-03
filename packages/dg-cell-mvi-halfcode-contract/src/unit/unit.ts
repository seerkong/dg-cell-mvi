/**
 * v3 unit types: App composition root + named Unit manifests (D1/D9/D15).
 *
 * Manifests are thin (D9): identity (FQN), version, default title, domain
 * registration only. Public boundaries live in contracts (./contracts), the
 * element tree in ./element, routing in ./routes. There is deliberately no
 * Capsule manifest type: Capsule exists only inline in the element tree (D1).
 */

import type {
  HalfcodeVersion,
  SerializableRecord,
  UnitFqn,
  UnitKind,
} from './common';
import type { HalfcodeRef } from './refs';

/**
 * Content-discovered domain projection of a multi-file unit.
 */
export interface UnitDomainRegistration {
  domain: string;
  /** vfs:// ref to the domain file (multi-file form). */
  path: HalfcodeRef;
  name?: string;
  role?: 'input' | 'output';
}

/** Canonical AppBundle registry entry. The FQN and source are explicit. */
export interface AppBundleUnitRef {
  kind: UnitKind;
  fqn: UnitFqn;
  src: HalfcodeRef;
}

interface HalfcodeUnitManifestBase {
  /** Unit identity: dot-separated FQN, globally unique across the app (D1/D15). */
  fqn: UnitFqn;
  version: HalfcodeVersion;
  description?: string;
  /** Explicit domain registrations; omitted domains are empty (D10). */
  domains?: UnitDomainRegistration[];
  metadata?: SerializableRecord;
}

/**
 * Page manifest. Pages are routable/embeddable named Capsules (D1/D2):
 * input is URL shape only, so there is no route/mount/props here — routing
 * lives on RouteSpec (D3), the public boundary in PageContractSpec.
 */
export interface PageUnitManifest extends HalfcodeUnitManifestBase {
  kind: 'page';
  /** Default title; a Route may override it (D6). */
  title?: string;
}

/** Component manifest. Components are reusable named Capsules (D1); boundary in ComponentContractSpec. */
export interface ComponentUnitManifest extends HalfcodeUnitManifestBase {
  kind: 'component';
}

/** Document manifest. Its source/revision boundary lives in DocumentContractSpec. */
export interface DocumentUnitManifest extends HalfcodeUnitManifestBase {
  kind: 'document';
}

/** Flow manifests retain Halfcode identity while depa-flows owns their semantic bodies. */
export interface HalfcodeInstantCtrlFlowManifest extends HalfcodeUnitManifestBase {
  kind: 'instant-ctrl-flow';
}

export interface HalfcodeWorkCtrlFlowManifest extends HalfcodeUnitManifestBase {
  kind: 'work-ctrl-flow';
}

export interface HalfcodeBPCtrlFlowManifest extends HalfcodeUnitManifestBase {
  kind: 'bp-ctrl-flow';
}

export interface HalfcodeEagerDataFlowManifest extends HalfcodeUnitManifestBase {
  kind: 'eager-data-flow';
}

export type HalfcodeUnitManifest =
  | PageUnitManifest
  | ComponentUnitManifest
  | DocumentUnitManifest
  | HalfcodeInstantCtrlFlowManifest
  | HalfcodeWorkCtrlFlowManifest
  | HalfcodeBPCtrlFlowManifest
  | HalfcodeEagerDataFlowManifest;

/** Product identity (app.product domain root). */
export interface HalfcodeProductSpec {
  id: string;
  version: HalfcodeVersion;
  name?: string;
  productLine?: string;
  settings?: SerializableRecord;
}

/**
 * App composition root: route tree + unit registry + cross-page wiring.
 */
export interface HalfcodeAppSpec {
  kind: 'app';
  /** Bundle id (bundle root `#id`). */
  id: string;
  apiVersion: 'halfcode.dg-cell-mvi/v1';
  version: HalfcodeVersion;
  /** vfs:// ref to the halfcode-product domain file. */
  productRef?: HalfcodeRef;
  /** vfs:// ref to the halfcode-routes domain file. */
  routesRef?: HalfcodeRef;
  /** vfs:// ref to the halfcode-wiring domain file. */
  wiringRef?: HalfcodeRef;
  /** App-level domain registrations (config/profile/projection domains, ...). */
  domains?: UnitDomainRegistration[];
  /** Unit registry (`Units` section, D15). */
  units: AppBundleUnitRef[];
  metadata?: SerializableRecord;
}
