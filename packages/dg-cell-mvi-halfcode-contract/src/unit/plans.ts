/**
 * v3 unit compile plans + compile input (track add-halfcode-v3-compiler-projection, P1).
 *
 * Additive partition: plan types are pure serializable data derived by the G4
 * compiler (dg-cell-mvi-halfcode-logic) from a loaded unit bundle. The compile
 * INPUT types mirror the loader's LoadedHalfcodeUnitBundle shape at contract
 * level — logic must not import support (layering), so the shared shape lives
 * here and the loader result is passed in directly (structural supertype).
 *
 * Decision (T1.1): AdminShellPlanV3 is a NEW type, not an adaptation of the v2
 * AdminShellPlan — v2 routes are flat admin-route lists keyed by material
 * versioned refs, while v3 routes are a nested tree keyed by route instance ids
 * with resolved page FQNs, menu metadata and title override/fallback (D3/D6/D13).
 * The v2 type is untouched.
 */

import type { SerializableValue, UnitFqn, UnitKind } from './common';
import type { HalfcodeRef } from './refs';
import type { InlineProps, ElementsSpec } from './element';
import type { DocumentContractSpec, DocumentPresentationSpec, UnitContractSpec } from './contracts';
import type { DocumentSourceDescriptor, DocumentUnitPlan } from './document';
import type { MessagePolicySpec } from './messages';
import type { DataGraphScopePlan } from './dataGraph';
import type { CallableEffectBindingsSpec, RuntimeScopeBindingSpec } from './runtime';
import type { RouteMenuSpec, RouteSpec, WireSpec } from './routes';
import type {
  HalfcodeProductSpec,
  AppBundleUnitRef,
  HalfcodeUnitManifest,
  UnitDomainRegistration,
} from './unit';
import type {
  HalfcodeUnitDiagnosticCode,
  HalfcodeUnitDiagnosticSeverity,
} from './diagnostics';

// ---------------------------------------------------------------------------
// Compile input (mirrors the loader's LoadedHalfcodeUnitBundle, D10/D15)
// ---------------------------------------------------------------------------

/**
 * One structured node of a domain document: tag + optional `#id` + plain
 * serializable attribute data + body children. This is the compiler's view of
 * scopes/config/commands/events documents — the compiler never re-walks
 * raw XNL (the loader projects every domain document into this shape).
 */
export interface UnitDomainNodeSpec {
  tag: string;
  /** Node `#id` (word form flattened to a dotted string, e.g. 'users.search'). */
  id?: string;
  /** Plain attribute data (metadata + attributes merged, serializable values). */
  data: Record<string, unknown>;
  /** Body (`[...]`) child nodes. */
  children?: UnitDomainNodeSpec[];
}

/**
 * Contract-level view of a parsed domain doc — structurally compatible
 * with the loader's HalfcodeUnitDomainDocument (which additionally carries the
 * raw xnlDocument — invisible here; the compiler only reads `nodes`).
 */
export interface UnitCompileDomainDocument {
  domain: string;
  /** Registered name (multi-file) or section tag (single-file). */
  name?: string;
  role?: 'input' | 'output';
  /** Physical file path; for single-file sections, the unit file path. */
  path: string;
  /** Root node tag. */
  tag: string;
  /** Root node `#id`. */
  id?: string;
  /** Root node attribute data. */
  data: Record<string, unknown>;
  /** Structured projection of the document's top-level nodes (root included). */
  nodes: UnitDomainNodeSpec[];
}

export interface UnitCompileDocumentSkeletonNode {
  readonly kind: 'domain-node' | 'component-embed' | 'capsule' | 'document-embed';
  readonly tag: string;
  readonly id?: string;
  readonly xId?: string;
  readonly projectionRole?: string;
  readonly scopeId?: string;
  readonly scope?: RuntimeScopeBindingSpec;
  readonly inlineProps?: Readonly<Record<string, unknown>>;
  readonly children: readonly UnitCompileDocumentSkeletonNode[];
}

export interface UnitCompileDocumentProjection {
  readonly sourceDescriptor?: DocumentSourceDescriptor;
  readonly contract?: DocumentContractSpec;
  readonly rootNodeId: string;
  readonly rootScope?: RuntimeScopeBindingSpec;
  readonly presentation?: DocumentPresentationSpec;
  readonly skeleton: readonly UnitCompileDocumentSkeletonNode[];
}

/** Contract-level view of one loaded unit (both folder and single-file forms). */
export interface UnitCompileUnit {
  fqn: UnitFqn;
  kind: UnitKind;
  /** Physical form; informational only for the compiler. */
  form?: 'folder' | 'single-file';
  /** Resolved physical path (folder or .xnl file). */
  path: string;
  manifest: HalfcodeUnitManifest;
  domains: Record<string, UnitCompileDomainDocument>;
  elements?: ElementsSpec;
  contract?: UnitContractSpec;
  /** Present only for Document units; compiler reads only the structured plan view. */
  document?: UnitCompileDocumentProjection;
  /** Parsed predefined Scope bindings supplied by LoadedHalfcodeUnit. */
  scopeRuntimeBindings?: RuntimeScopeBindingSpec[];
}

/** Contract-level view of the loaded app composition (routes/wiring/product). */
export interface UnitCompileApp {
  product?: HalfcodeProductSpec;
  routes: RouteSpec[];
  wiring: WireSpec[];
  domains: Record<string, UnitCompileDomainDocument>;
}

/** Contract-level view of the bundle manifest. */
export interface UnitCompileBundleManifest {
  id: string;
  version?: string;
  apiVersion: string;
  domains: UnitDomainRegistration[];
  units: AppBundleUnitRef[];
}

/** FQN registry entry (D15). */
export interface UnitCompileRegistryEntry {
  fqn: UnitFqn;
  kind: UnitKind;
  path: string;
}

/**
 * Input of compileHalfcodeUnitBundle. The loader's LoadedHalfcodeUnitBundle is
 * structurally assignable (its extra fields — manifestPath, loader diagnostics,
 * per-document xnlDocument — are simply not read by the compiler).
 */
export interface UnitCompileInput {
  manifest: UnitCompileBundleManifest;
  app: UnitCompileApp;
  units: Record<string, UnitCompileUnit>;
  registry: Record<string, UnitCompileRegistryEntry>;
}

// ---------------------------------------------------------------------------
// Admin shell plan (D3/D6)
// ---------------------------------------------------------------------------

/**
 * One projected route of the admin shell plan. `title` is already resolved:
 * Route override when present, else the target page manifest's default title.
 * Nesting is preserved from the route tree.
 */
export interface AdminShellRoutePlanV3 {
  /** Route instance id (`#id`, the stable wiring anchor, D13). */
  id: string;
  /** URL path pattern, e.g. '/users', '/reports/:id'. */
  path: string;
  /** Resolved title: Route.title ?? page manifest default title. */
  title?: string;
  menu?: RouteMenuSpec;
  /** Resolved permission binding retained for the shell adapter. */
  permissionBinding?: HalfcodeRef;
  /** Resolved target page FQN (from page://<FQN>). */
  pageFqn: UnitFqn;
  children?: AdminShellRoutePlanV3[];
}

/** Admin shell plan compiled from the app route tree (v3; v2 AdminShellPlan untouched). */
export interface AdminShellPlanV3 {
  id: string;
  /** Bundle id (bundle root `#id`). */
  bundleId: string;
  /** Product identity when the halfcode-product domain is registered. */
  product?: HalfcodeProductSpec;
  routes: AdminShellRoutePlanV3[];
}

// ---------------------------------------------------------------------------
// Unit render plan (element tree projection; renderer never sees raw XNL)
// ---------------------------------------------------------------------------

/** Named slot content in a render plan (single <Slot> and <Slots> container both land here). */
export interface RenderSlotPlan {
  /** Slot name (`#id`). */
  id: string;
  children: RenderNodePlan[];
}

interface RenderNodePlanBase {
  /** Tree-local instance id (`#id`). */
  id: string;
  /** Lexically owning Scope, derived from the Elements/Capsule tree. */
  scopeId?: string;
  children?: RenderNodePlan[];
  slots?: RenderSlotPlan[];
}

/**
 * Atomic node: native HTML tag (lowercase bare tag) or UI-library element
 * (dotted tag outside the unit registry, e.g. elementPlus.ElInput — resolved
 * by the render adapter's UI registry, spec §3).
 */
export interface AtomNodePlan extends RenderNodePlanBase {
  kind: 'atom';
  tag: string;
  /** UI-library namespace root for dotted non-registry tags (e.g. 'elementPlus'). */
  library?: string;
  inlineProps?: InlineProps;
  propsBinding?: HalfcodeRef;
  commandBinding?: HalfcodeRef;
}

/** Inline Capsule projection (D1). */
export interface CapsuleNodePlan extends RenderNodePlanBase {
  kind: 'capsule';
}

/** Registered component instance projection (tag = component FQN, D4). */
export interface ComponentNodePlan extends RenderNodePlanBase {
  kind: 'component';
  tag: string;
  fqn: UnitFqn;
  inlineProps?: InlineProps;
  propsBinding?: HalfcodeRef;
  commandBinding?: HalfcodeRef;
}

/** Embedded page instance projection (synthetic URL inputs channel, D2). */
export interface PageEmbedNodePlan extends RenderNodePlanBase {
  kind: 'page-embed';
  tag: string;
  pageFqn: UnitFqn;
  urlInputsBinding?: HalfcodeRef;
  commandBinding?: HalfcodeRef;
}

export type RenderNodePlan =
  | AtomNodePlan
  | CapsuleNodePlan
  | ComponentNodePlan
  | PageEmbedNodePlan;

export type RenderNodePlanKind = RenderNodePlan['kind'];

/** Structured element-tree projection of one unit. */
export interface UnitRenderPlan {
  id: string;
  unitFqn: UnitFqn;
  unitKind: UnitKind;
  /** Unit root Scope derived from Elements.scope. */
  scopeId?: string;
  /** Page default title (pages only). */
  title?: string;
  /** Projection of the unit's element tree top level. */
  root: RenderNodePlan[];
}

// ---------------------------------------------------------------------------
// Scope runtime + message dispatch plans
// ---------------------------------------------------------------------------

/** One lexical Scope boundary derived from an Elements root or Capsule. */
export interface ScopeRuntimePlan {
  scopeId: string;
  /** Nearest lexical ancestor Scope; absent only for a unit's root boundary. */
  parentScopeId?: string;
  /** Elements root id or Capsule element id that owns this Scope boundary. */
  ownerElementId: string;
  unitFqn: UnitFqn;
  runtime?: HalfcodeRef;
  config?: HalfcodeRef;
  commands?: HalfcodeRef;
  events?: HalfcodeRef;
  messagePolicy?: MessagePolicySpec;
  effects?: CallableEffectBindingsSpec;
  dataGraphs?: DataGraphScopePlan;
}

/** Fully compiled dispatch data for one command-bearing render element. */
export interface MessageDispatchPlanEntry {
  unitFqn: UnitFqn;
  elementId: string;
  scopeId: string;
  kind: 'command';
  /** Original command identity retained for renderer/runtime dispatch. */
  command: HalfcodeRef;
  /** Resolved Command node id. */
  commandType: string;
  payloadDef?: HalfcodeRef;
  /** Runtime-first code entry resolved from the Command declaration. */
  handler?: HalfcodeRef;
  /** Config value resolved at compile time; runtime does not scan raw domains. */
  config?: SerializableValue;
}

/** Bundle-wide lookup table for command-bearing render elements. */
export interface MessageDispatchPlan {
  id: string;
  entries: MessageDispatchPlanEntry[];
}

// ---------------------------------------------------------------------------
// Wiring plan (D5/D13)
// ---------------------------------------------------------------------------

/** One fully resolved cross-page Command/Event delivery. */
export interface WirePlanBinding {
  /** Source route instance id (resolved from route://#id or route://<path>). */
  fromRouteId: string;
  /** Target route instance id. */
  toRouteId: string;
  /** Page FQN mounted on the source route. */
  fromPageFqn: UnitFqn;
  /** Page FQN mounted on the target route. */
  toPageFqn: UnitFqn;
  /** Unchanged Command/Event ref sent by source and accepted by target. */
  message: HalfcodeRef;
}

/** Compiled app wiring: only fully resolved bindings; failures become diagnostics. */
export interface WiringPlan {
  id: string;
  wires: WirePlanBinding[];
}

// ---------------------------------------------------------------------------
// Compile result
// ---------------------------------------------------------------------------

/** Compiler diagnostic: the nine v3 codes with their contract-level severities. */
export interface UnitCompileDiagnostic {
  severity: HalfcodeUnitDiagnosticSeverity;
  code: HalfcodeUnitDiagnosticCode;
  message: string;
  path?: string;
}

/** Canonical v3 compile plans. */
export interface UnitCompilePlans {
  adminShellPlan: AdminShellPlanV3;
  renderPlans: UnitRenderPlan[];
  documentPlans: DocumentUnitPlan[];
  wiringPlan: WiringPlan;
  scopeRuntimePlans: ScopeRuntimePlan[];
  messageDispatchPlan: MessageDispatchPlan;
}

/** Result of compileHalfcodeUnitBundle. */
export interface UnitCompileResult extends UnitCompilePlans {
  diagnostics: UnitCompileDiagnostic[];
}
